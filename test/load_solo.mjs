// 개인 모드 시험: 진행판 1 + 크롬북 N(기본 30)이 각자 다른 길로 끝까지 — 가짜 DB(규칙 적용)
//   node test/load_solo.mjs [--n 30] [--no-shots]
// 확인: 엔딩 10개 모두 실제 화면으로 닿음(남 · 여 · 랜덤) · 진행판 진행 막대 · 엔딩 판 · 중간에 새로 고침해도 이어서 ·
//       2회차는 반 통계에 안 들어감 · DB 에는 숫자만(성별 · 이름 없음) · 「모두 졸업!」 뒤 못 끝낸 학생은 「선생님 화면」 ·
//       성찰 모음 · 수업 끝 = 방 지움
import fs from 'node:fs';
import path from 'node:path';
import { launch, startServers, openHost, openStudent, waitFor, sleep, arg, here, dump, stats, tap } from './lib.mjs';
import { ENDING_PATHS } from './paths.mjs';
import { endingOf, lightsOf, statsOf, NODES } from '../src/story.js';

const N = Number(arg('n', 30));
const SHOTS = !arg('no-shots', false);
const SHOT_DIR = path.join(here, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log('  ✗ ' + m); } };
const t0 = Date.now();
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') }); };

const browser = await launch(!arg('headed', false));
const srv = await startServers({ mockPort: 8798, webPort: 8099 });
const host = await openHost(browser, srv, { mode: 'solo' });
const H = host.page;
log(`방 ${host.code}`);

const ends = Object.keys(ENDING_PATHS);
const NAMES = { m: ['한결', '준호', '시우', '도윤'], f: ['다온', '지유', '서연', '하은'] };
const studs = [];
for (let i = 1; i <= N; i++) {
  const e = ends[(i - 1) % ends.length];
  const g = i % 7 === 0 ? 'r' : i % 2 ? 'm' : 'f';
  const name = g === 'r' ? null : NAMES[g][i % 4];
  const s = await openStudent(browser, srv, host.code, i, { view: i === 2 ? { width: 375, height: 812 } : { width: 1366, height: 768 } });
  Object.assign(s, { e, g, name, path: ENDING_PATHS[e] });
  studs.push(s);
}
log(`학생 ${N}명 들어옴`);
await shot(studs[0].page, 'solo_student_lobby');
await waitFor(() => H.evaluate(n => Object.values(window.__vnHost.players).filter(p => p.on).length >= n, N), { what: '진행판에 모두' });
await tap(H, '#bStart');

// 한 학생을 화면 단추로 끝까지(또는 stopId 갈림길 앞까지)
const autoplay = (s, { stopId = null, shots = false } = {}) => s.page.evaluate(async ({ g, name, path, stopId }) => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const q = sel => document.querySelector(sel);
  for (let i = 0; i < 4000; i++) {
    const P = window.__vnPlay, pos = P && P.solo && P.solo.pos;
    if (!pos || !P.meta || P.meta.phase !== 'play') { await wait(30); continue; }
    if (stopId && pos.k === 'choice' && pos.id === stopId) return 'stopped';
    let b = null;
    if (pos.k === 'gender') b = q(`[data-g="${g}"]`);
    else if (pos.k === 'name') b = q(`[data-n="${name}"]`);
    else if (pos.k === 'scene' || pos.k === 'after' || pos.k === 'ending') b = q('#bNext');
    else if (pos.k === 'choice') b = q(`[data-c="${path[pos.id]}"]`);
    else if (pos.k === 'card') b = q('#bDone');
    else if (pos.k === 'done') return 'done';
    if (b) b.click();
    await wait(12);
  }
  return 'timeout';
}, { g: s.g, name: s.name, path: s.path, stopId });

// 화면 모음(1366 · 375): 성별 고르기 · 이름 · 장면 · 선택 · 결과(지표) · 엔딩 카드
if (SHOTS) {
  const a = studs[0], b = studs[1];
  for (const [s, tag] of [[a, '1366'], [b, '375']]) {
    await waitFor(() => s.page.evaluate(() => !!document.querySelector('[data-g]')), { what: '성별 고르기' });
    await shot(s.page, `solo_student_gender_${tag}`);
  }
}

// 1단계: 모두 V5 앞까지 → 진행판 학년 막대 확인 · 몇 명은 새로 고침
await Promise.all(studs.map(s => autoplay(s, { stopId: 'V5' })));
log('모두 중2 시작 앞까지');
if (SHOTS) {
  await shot(studs[0].page, 'solo_student_choice_1366');
  await shot(studs[1].page, 'solo_student_choice_375');
}
const g1 = await H.evaluate(() => document.querySelector('.sh-grades') && document.querySelector('.sh-grades').innerText);
ok(/중2|중1/.test(g1 || ''), '진행판 학년 막대가 보임');
const grades = await waitFor(async () => { const t = await H.evaluate(() => [...document.querySelectorAll('.gcol b')].map(b => Number(b.textContent))); return t.length === 4 && t[1] === N ? t : null; }, { what: '중2 시작 전 모두 「중2」(V1~V4 고름)' }).catch(() => null);
ok(!!grades, `진행 막대: 모두 V4 까지 골라 중2 칸 (${JSON.stringify(grades)})`);
await shot(H, 'solo_host_progress');

// 갈림길 화면에서 배경을 눌러도 넘어가지 않음
{
  const s = studs[7];
  const r = await s.page.evaluate(async () => {
    const P = window.__vnPlay; const before = JSON.stringify(P.solo.pos);
    const sc = document.querySelector('.vn-scene'); if (sc) sc.click();
    await new Promise(r => setTimeout(r, 200));
    return before === JSON.stringify(P.solo.pos) && P.solo.pos.k === 'choice';
  });
  ok(r, '갈림길에서 배경을 눌러도 선택을 건너뛰지 않음');
}

// 새로 고침 3명 → 같은 자리에서 이어 감
const reloaders = studs.slice(3, 6);
const before = await Promise.all(reloaders.map(s => s.page.evaluate(() => JSON.stringify(window.__vnPlay.solo.pos))));
await Promise.all(reloaders.map(s => s.page.reload()));
await Promise.all(reloaders.map(s => waitFor(() => s.page.evaluate(() => window.__vnPlay && window.__vnPlay.joined && window.__vnPlay.solo), { what: '새로 고침 뒤 다시' })));
const after = await Promise.all(reloaders.map(s => s.page.evaluate(() => JSON.stringify(window.__vnPlay.solo.pos))));
ok(JSON.stringify(before) === JSON.stringify(after), '새로 고침해도 같은 자리(이 기기 안에 저장)');

// 2단계: 마지막 2명은 V10 앞에서 멈춤(모두 졸업 뒤 「선생님 화면」 확인용), 나머지는 끝까지
const laggards = studs.slice(-2);
const finishers = studs.slice(0, -2);
const shotFx = SHOTS ? (async () => {   // 지표가 뜨는 결과 장면 한 장
  const s = studs[0];
  for (let i = 0; i < 400; i++) {
    const has = await s.page.evaluate(() => !!document.querySelector('.vn-fx')).catch(() => false);
    if (has) { await shot(s.page, 'solo_student_fx_1366'); return; }
    await sleep(20);
  }
})() : null;
const res = await Promise.all([...finishers.map(s => autoplay(s)), ...laggards.map(s => autoplay(s, { stopId: 'V10' }))]);
await shotFx;
ok(res.slice(0, finishers.length).every(r => r === 'done'), `끝까지 간 학생 ${finishers.length}명`);
log('끝까지 감');

// 학생이 본 엔딩 = 판정
for (const s of finishers) {
  const first = await s.page.evaluate(() => window.__vnPlay.solo.first);
  const run = await s.page.evaluate(() => window.__vnPlay.solo.run);
  const exp = Number(endingOf(run).slice(1));
  ok(first && first.e === exp, `${s.num}번 엔딩 ${first && first.e} = 판정 E${exp}`);
  ok(s.g === 'r' || run.g === s.g, `${s.num}번 성별 ${run.g}`);
  if (s.g !== 'r') ok(run.name === s.name, `${s.num}번 이름 ${run.name}`);
  ok(first.l === lightsOf(statsOf(run)), `${s.num}번 불빛 ${first.l}`);
}
const seenEnds = new Set();
for (const s of finishers) seenEnds.add((await s.page.evaluate(() => window.__vnPlay.solo.first.e)));
ok(seenEnds.size === Math.min(10, finishers.length), `실제 화면으로 닿은 엔딩 ${seenEnds.size}가지`);

// 성찰: 끝난 학생은 성찰 칸이 먼저 나온다 → 12명 보냄
const writers = finishers.slice(0, 12);
await Promise.all(writers.map(async (s, i) => {
  await waitFor(() => s.page.evaluate(() => !!document.querySelector('#reflF')), { what: '성찰 칸' });
  if (i === 0) await shot(s.page, 'solo_student_refl_1366');
  if (s === studs[1]) await shot(s.page, 'solo_student_refl_375');
  await s.page.evaluate(i => { const f = document.querySelector('#reflF'); f.q1.value = `냉장고는 전기가 없어서 못 썼다 ${i}`; f.q3.value = i % 3 ? '' : '급식실 잔반 — 먼저 묻기 · 싼 값'; f.requestSubmit(); }, i);
}));
await waitFor(() => H.evaluate(n => Object.keys(window.__vnHost.refl).length >= n, writers.length), { what: '성찰 모임' });
ok(true, `성찰 ${writers.length}명 모임`);

// 2회차: 1번 학생이 다른 엔딩으로 → 반 통계는 그대로
const s1 = studs[0];
const firstE = await s1.page.evaluate(() => window.__vnPlay.solo.first.e);
await s1.page.evaluate(() => document.querySelector('#bAgain').click());
s1.path = ENDING_PATHS[firstE === 9 ? 'E6' : 'E9']; s1.g = 'f'; s1.name = '하은';
ok(await autoplay(s1) === 'done', '2회차 끝까지');
const rec1 = await dump(srv, `vn/rooms/${host.code}/solo/${s1.uid}`);
ok(rec1 && rec1.e === firstE, `2회차 뒤에도 DB 기록은 첫 엔딩(E${rec1 && rec1.e})`);
const dex = await s1.page.evaluate(() => Object.keys(window.__vnPlay.solo.dex).length);
ok(dex === 2, `엔딩 도감 2칸 (${dex})`);
if (SHOTS) await shot(s1.page, 'solo_student_done_1366');

// DB 에는 숫자만
const all = await dump(srv, `vn/rooms/${host.code}/solo`);
const keysOk = Object.values(all || {}).every(r => Object.keys(r).every(k => /^(st|e|l|t|c([1-9]|1[01]))$/.test(k)) && Object.values(r).every(v => typeof v === 'number'));
ok(keysOk, 'DB 진행 기록은 숫자뿐(성별 · 이름 없음)');
ok(!JSON.stringify(await dump(srv, `vn/rooms/${host.code}`)).match(/한결|다온|준호|지유|시우|서연|도윤|하은|"g":/), '방 어디에도 주인공 이름 · 성별 없음');

// 진행판 엔딩 판 = 학생들 첫 엔딩
const expEnds = {};
for (const s of finishers) { const e = await s.page.evaluate(() => window.__vnPlay.solo.first.e); expEnds['E' + e] = (expEnds['E' + e] || 0) + 1; }
await sleep(2000);
const hostEnds = await H.evaluate(() => { const o = {}; document.querySelectorAll('.ecell').forEach((c, i) => { const v = Number(c.querySelector('em').textContent || 0); if (v) o['E' + (i + 1)] = v; }); return o; });
ok(JSON.stringify(Object.entries(hostEnds).sort()) === JSON.stringify(Object.entries(expEnds).sort()), `진행판 엔딩 판 ${JSON.stringify(hostEnds)} = ${JSON.stringify(expEnds)}`);
await shot(H, 'solo_host_board');

// 졸업한 학생이 다른 기기로 같은 번호 → 앞 기기 자리는 지워져도 첫 엔딩은 그대로 셈
{
  const s = finishers[9];
  const before = await H.evaluate(() => [...document.querySelectorAll('.ecell em')].reduce((a, e) => a + Number(e.textContent || 0), 0));
  const nd = await openStudent(browser, srv, host.code, s.num);
  await waitFor(() => s.page.evaluate(() => /다른 기기에서/.test(document.body.innerText)), { what: '앞 기기 내보냄' });
  await sleep(2000);
  const after = await H.evaluate(() => [...document.querySelectorAll('.ecell em')].reduce((a, e) => a + Number(e.textContent || 0), 0));
  ok(after === before, `기기를 바꿔도 졸업 수 그대로 (${before} → ${after})`);
  await nd.ctx.close();
}

// 모두 졸업! → 반 통계
await tap(H, '#bGrad');
await waitFor(() => H.evaluate(() => !!document.querySelector('.solo-stats')), { what: '반 통계 화면' });
await shot(H, 'solo_host_stats');
const lag = laggards[0];
await waitFor(() => lag.page.evaluate(() => /선생님 화면을 보세요/.test(document.body.innerText)), { what: '못 끝낸 학생 「선생님 화면」' });
ok(true, '못 끝낸 학생은 「선생님 화면을 보세요」');
const fin = finishers[5];
await waitFor(() => fin.page.evaluate(() => /우리 반 첫 엔딩/.test(document.body.innerText)), { what: '끝낸 학생 반 통계' });
ok(true, '끝낸 학생 화면에 반 통계(이름 없음)');
await shot(fin.page, 'solo_student_stats_1366');
await shot(studs[1].page, 'solo_student_stats_375');
const lagWrite = await lag.page.evaluate(async () => { try { await window.__vnPlay.net.set(`vn/rooms/${window.__vnPlay.code}/solo/${window.__vnPlay.net.uid}`, { st: 11, e: 3, l: 1, t: window.__vnPlay.net.TS }); return 'ok'; } catch (e) { return 'denied'; } });
ok(lagWrite === 'denied', '「모두 졸업」 뒤에는 진행 기록을 못 씀(규칙)');

// 성찰 모음 → 수업 끝
await tap(H, '#bWall');
await waitFor(() => H.evaluate(() => document.querySelectorAll('.wcard').length > 0), { what: '성찰 모음' });
await shot(H, 'solo_host_refl');
await H.evaluate(() => window.__vnHost.api.closeClass());
await waitFor(async () => (await dump(srv, `vn/rooms/${host.code}`)) === null, { what: '방 지움' });
ok(true, '수업 끝 → 방 지움');
await waitFor(() => fin.page.evaluate(() => /수업이 끝났어요/.test(document.body.innerText)), { what: '학생 끝' });

const errs = studs.flatMap(s => s.errs);
ok(errs.length === 0, `학생 화면 스크립트 오류 0 (${errs.slice(0, 3).join(' / ')})`);
const st = await stats(srv);
const groups = {};
for (const d of st.deniedList) { const k = d.path.replace(/vn\/rooms\/\d+\//, '').replace(/\/[A-Za-z0-9]{8,}$/, '/{uid}'); groups[k] = (groups[k] || 0) + 1; }
log('거절된 쓰기: ' + JSON.stringify(groups));
ok(Object.keys(groups).every(k => /^solo\/\{uid\}$|players/.test(k)) && (groups['solo/{uid}'] || 0) <= 1, '예상한 거절(졸업 뒤 쓰기 시험 1건)만');

await browser.close();
srv.close();
console.log(`\n개인 모드 시험(학생 ${N}명): 통과 ${pass} · 실패 ${fail} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
if (fail) { console.log(' - ' + fails.join('\n - ')); process.exit(1); }
process.exit(0);
