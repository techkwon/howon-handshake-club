// 전체 모드 부하 · 흐름 시험: 진행판 1 + 크롬북 N(기본 24 · 학생 수도 N 으로 설정) — 가짜 DB(규칙 적용)
//   node test/load_class.mjs [--n 24] [--speed 4] [--headed] [--no-shots]
// 시나리오: 25명으로 시작 → V0 동률 → 다시 투표 동률 → 🎲 / V3 동률 → 다시 투표로 결정 / 늦게 온 5명(1명은 같은 번호 → 앞 기기 내보냄)
//          V4 중 3명 연결 끊김 + 2명 새로 고침 / V6 아무도 안 냄 → 🎲 / V9 교사가 정하기 / 엔딩 → 성찰 → 가리기 → 수업 끝(방 지움)
import fs from 'node:fs';
import path from 'node:path';
import { launch, startServers, openHost, openStudent, waitFor, sleep, arg, here, dump, drop, stats, tap } from './lib.mjs';
import { endingOf, CHOICE_IDS } from '../src/story.js';

const N = Number(arg('n', 24));
const SPEED = Number(arg('speed', 4));
const SHOTS = !arg('no-shots', false);
const SHOT_DIR = path.join(here, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log('  ✗ ' + m); } };
const t0 = Date.now();
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

const browser = await launch(!arg('headed', false));
const srv = await startServers({ mockPort: 8797, webPort: 8098 });
const host = await openHost(browser, srv, { mode: 'class', speed: SPEED, seats: N });
const H = host.page;
log(`방 ${host.code}`);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') }); };

// ── 학생 들어가기 ────────────────────────────────────────────────
const LATE = Math.min(5, Math.max(0, N - 2));
const firstN = N - LATE;
const studs = [];
for (let i = 1; i <= firstN; i++) {
  studs.push(await openStudent(browser, srv, host.code, i, { view: i === 2 ? { width: 375, height: 812 } : { width: 1366, height: 768 } }));
}
log(`학생 ${firstN}명 들어옴`);
await waitFor(() => H.evaluate(n => Object.values(window.__vnHost.players).filter(p => p.on).length >= n, firstN), { what: '진행판에 모두 보임' });
await shot(H, 'class_host_lobby');
await shot(studs[0].page, 'class_student_lobby');
// 학생 수(N) — 대기실 번호 칸 N개 · N+1 번은 못 들어옴 · 전체 모드 크롬북은 소리 잠금
ok(await H.evaluate(() => document.querySelectorAll('.numgrid .ng').length) === N, `대기실 번호 칸 ${N}개`);
ok(await H.evaluate(n => document.querySelector('#bar').textContent.includes(n + '명'), N), `머리띠에 「${N}명」`);
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const pg = await ctx.newPage();
  await pg.goto(`${srv.base}/?mock=${encodeURIComponent(srv.mockURL)}&code=${host.code}`);
  await pg.waitForSelector('#iNum', { timeout: 20000 });
  await pg.evaluate(n => { document.querySelector('#iNum').value = String(n); document.querySelector('#joinF').requestSubmit(); }, N + 1);
  const msg = await waitFor(() => pg.evaluate(() => { const e = document.querySelector('.errbox'); return e && !e.hidden && e.textContent; }), { what: '번호 거절' });
  const joined = await pg.evaluate(() => window.__vnPlay.joined);
  const seat = await pg.evaluate(() => window.__vnPlay.net && window.__vnPlay.net.uid).then(u => u ? dump(srv, `vn/rooms/${host.code}/players/${u}`) : null);
  ok(msg.includes(`1~${N}번`) && !joined && !seat, `${N + 1}번은 못 들어옴 — 「${msg}」`);
  await ctx.close();
}
{
  const st = await studs[0].page.evaluate(() => window.__vnSound.state());
  ok(st.locked && st.ctx === 'none' && !(await studs[0].page.$('.snd [data-snd]')), `전체 모드 크롬북: 소리 잠금 · 소리 장치 없음 · 소리 단추 숨김(⚙ 움직임만) (${JSON.stringify(st)})`);
}

// 진행판 「다음 ▶」 자동으로 누르기(읽기 · 생각 시간 · 결과를 빨리 넘김 — 투표 시간은 그대로)
let skipping = true, hold = false;
const shotsTaken = new Set();
(async () => {
  while (skipping) {
    if (hold) { await sleep(60); continue; }
    try {
      const k = await H.evaluate(() => { const v = window.__vnHost.view; return v && v.kind + (v.k ? ':' + v.k : ''); });
      if (k && SHOTS && !shotsTaken.has(k) && ['title', 'lines:scene', 'think', 'tally', 'fx', 'dice', 'lines:after', 'lines:ending'].includes(k)) {
        shotsTaken.add(k); await shot(H, 'class_host_' + k.replace(':', '_'));
      }
      if (k && ['title', 'lines:scene', 'lines:after', 'lines:ending', 'think', 'fx', 'tally'].includes(k)) await H.evaluate(() => window.__vnHost.api.next());
    } catch {}
    await sleep(60);
  }
})();

await tap(H, '#bStart');

const online = () => studs.filter(s => !s.gone && !s.kicked);
async function voteAll(id, round, chooser, label) {
  const key = await waitFor(() => H.evaluate(([id, r]) => { const v = window.__vnHost.vote; return v && v.id === id && v.round === r && !v.closed ? v.key : null; }, [id, round]), { timeout: 60000, what: `${id} 투표 ${round}` })
    .catch(async e => { console.log('진행판 상태:', await H.evaluate(() => JSON.stringify({ view: window.__vnHost.view.kind, vote: window.__vnHost.vote, hist: window.__vnHost.hist, pos: window.__vnHost.pos }))); throw e; });
  const sent = {};
  await Promise.all(online().map(async s => {
    const c = chooser(s.num);
    if (!c) return;
    const r = await s.page.evaluate(async ([c, key]) => {
      for (let i = 0; i < 120; i++) {
        const P = window.__vnPlay, b = document.querySelector(`.vbtn[data-c="${c}"]`);
        if (P && P.inputKey === key && b && !b.disabled) { b.click(); return true; }
        await new Promise(r => setTimeout(r, 40));
      }
      return false;
    }, [c, key]);
    if (r) sent[s.num] = c;
  }));
  if (label && SHOTS) { await shot(H, 'class_host_vote'); await shot(studs[0].page, 'class_student_vote_1366'); await shot(studs[1].page, 'class_student_vote_375'); }
  return { key, sent };
}
const countOf = sent => { const c = {}; for (const v of Object.values(sent)) c[v] = (c[v] || 0) + 1; return c; };
const hist = id => H.evaluate(id => window.__vnHost.hist[id] || {}, id);
const waitPick = id => waitFor(async () => { const h = await hist(id); return h.pick ? h : null; }, { timeout: 60000, what: `${id} 결정` });
const evenSplit = (a, b) => { const nums = online().map(s => s.num).sort((x, y) => x - y); const even = nums.length % 2 ? nums.slice(0, -1) : nums; const set = new Set(even); return n => set.has(n) ? (even.indexOf(n) % 2 ? b : a) : 0; };

// V0 — 동률 → 다시 투표 동률 → 🎲
{
  const ch = evenSplit(1, 2);
  const r1 = await voteAll('V0', 1, ch, true);
  if (arg('debug', false)) { console.log('보낸 표', r1.sent); console.log((await stats(srv)).deniedList.slice(-5)); console.log(await studs[0].page.evaluate(() => ({ ik: window.__vnPlay.inputKey, core: window.__vnPlay.core, html: document.querySelector('#main').innerText.slice(0, 200) }))); }
  const r2 = await voteAll('V0', 2, ch);
  const h = await waitPick('V0');
  ok(h.how === 'dice', `V0 동률 두 번 → 주사위 (실제 ${h.how})`);
  ok(JSON.stringify(h.r1.counts) === JSON.stringify({ 1: countOf(r1.sent)[1] || 0, 2: countOf(r1.sent)[2] || 0, 3: 0 }), `V0 1차 표 세기 ${JSON.stringify(h.r1.counts)}`);
  ok(h.r2 && h.r2.total === Object.keys(r2.sent).length, 'V0 다시 투표 표 수');
  const g = await waitFor(() => H.evaluate(() => window.__vnHost.run.g), { what: 'V0 성별' }).catch(() => null);
  ok(g === 'm' || g === 'f', `V0 랜덤 성별 정해짐(${g})`);
  log(`V0 ${JSON.stringify(h.r1.counts)} → 다시 ${JSON.stringify(h.r2.counts)} → 🎲 ${h.pick} · 성별 ${g}`);
}
// 학생 화면: 우리 반은 …
await waitFor(() => studs[0].page.evaluate(() => /우리 반은|주사위|큰 화면/.test(document.body.innerText)), { what: '학생 결과 화면' });

const simple = async (id, ch, expect) => {
  const r = await voteAll(id, 1, ch);
  const h = await waitPick(id);
  const exp = countOf(r.sent);
  const got = h.r1 ? h.r1.counts : {};
  ok(Object.entries(exp).every(([k, v]) => got[k] === v) && h.r1.total === Object.keys(r.sent).length, `${id} 표 세기 기대 ${JSON.stringify(exp)} 실제 ${JSON.stringify(got)}`);
  if (expect) ok(h.pick === expect, `${id} 최다 득표 ${expect} (실제 ${h.pick} · ${h.how})`);
  log(`${id} ${JSON.stringify(got)} → ${h.pick} (${h.how})`);
  return h;
};

await simple('V1', n => n === 5 ? 2 : 1, 1);
await waitFor(() => studs[0].page.evaluate(() => /우리 반은/.test(document.body.innerText)), { what: '학생에게 우리 반 선택' });
if (SHOTS) await shot(studs[0].page, 'class_student_tally');
await simple('V2', () => 2, 2);

// 늦게 온 학생 5명(마지막 1명은 3번 — 같은 번호). 들어오는 동안 진행판을 ⏸ 멈춤(읽기 단계에서 멈춘다)
hold = true;
await H.evaluate(() => { if (window.__vnHost.auto) window.__vnHost.api.togglePause(); });
for (let i = 0; i < LATE; i++) {
  const dupNum = Math.min(3, firstN);
  const num = i === LATE - 1 ? dupNum : firstN + 1 + i;
  const s = await openStudent(browser, srv, host.code, num);
  if (i === LATE - 1) { const old = studs.find(x => x.num === dupNum && !x.kicked); old.kicked = true; s.dupOf = old; }
  studs.push(s);
}
log(`늦게 온 학생 ${LATE}명`);
await H.evaluate(() => { if (!window.__vnHost.auto) window.__vnHost.api.togglePause(); });
hold = false;
{
  const old = studs.find(s => s.kicked);
  if (old) {
    await waitFor(() => old.page.evaluate(() => /다른 기기에서/.test(document.body.innerText)), { what: '앞 기기 내보냄' });
    ok(true, '같은 번호로 새 기기가 오면 앞 기기는 「다른 기기에서 들어왔어요」');
    if (SHOTS) await shot(old.page, 'class_student_kicked');
  }
}

// V3 — 동률 → 다시 투표로 결정
{
  const r1 = await voteAll('V3', 1, evenSplit(1, 3));
  const r2 = await voteAll('V3', 2, () => 3);
  const h = await waitPick('V3');
  ok(h.how === 'vote' && h.pick === 3, `V3 동률 → 다시 투표로 3 (실제 ${h.pick} · ${h.how})`);
  ok(h.r1.total === Object.keys(r1.sent).length && h.r2.total === Object.keys(r2.sent).length, `V3 늦게 온 학생 표도 셈 (${h.r1.total} · ${h.r2.total})`);
  const voters = await H.evaluate(() => [...new Set(Object.values(window.__vnHost.players).filter(p => p.on).map(p => p.num))].length);
  ok(voters === N - 1, `접속한 번호 ${voters} = ${N - 1}(같은 번호 1개)`);
  log(`V3 ${JSON.stringify(h.r1.counts)} → 다시 ${JSON.stringify(h.r2.counts)} → ${h.pick}`);
}

// V4 — 투표 중 3명 끊김(자동 다시 연결) + 2명 새로 고침
{
  const key = await waitFor(() => H.evaluate(() => { const v = window.__vnHost.vote; return v && v.id === 'V4' && !v.closed ? v.key : null; }), { timeout: 60000, what: 'V4 열림' });
  const live = online();
  const dropped = live.slice(5, 8), reloaded = live.slice(8, 10);
  for (const s of dropped) await drop(srv, s.uid);
  await Promise.all(reloaded.map(s => s.page.reload()));
  await Promise.all(reloaded.map(s => waitFor(() => s.page.evaluate(() => window.__vnPlay && window.__vnPlay.joined), { what: '새로 고침 뒤 다시 들어감' })));
  const sent = {};
  await Promise.all(online().map(async s => {
    const r = await s.page.evaluate(async key => {
      for (let i = 0; i < 200; i++) {
        const P = window.__vnPlay, b = document.querySelector('.vbtn[data-c="1"]');
        if (P && P.connected && P.inputKey === key && b && !b.disabled) { b.click(); return true; }
        await new Promise(r => setTimeout(r, 40));
      }
      return false;
    }, key);
    if (r) sent[s.num] = 1;
  }));
  const h = await waitPick('V4');
  ok(h.pick === 1 && h.r1.total === Object.keys(sent).length, `V4 끊김 · 새로 고침 뒤에도 표가 다 셈 (${h.r1.total}/${Object.keys(sent).length})`);
  ok(Object.keys(sent).length === N - 1, `V4 모두 투표함 (${Object.keys(sent).length})`);
  log(`V4 ${JSON.stringify(h.r1.counts)} → ${h.pick}`);
}

await simple('V5', n => n % 3 === 0 ? 1 : 2, 2);
{ // V6 아무도 안 냄 → 🎲
  await voteAll('V6', 1, () => 0);
  const h = await waitPick('V6');
  ok(h.how === 'dice' && !h.r2, `V6 아무도 안 냄 → 바로 🎲 (실제 ${h.how})`);
  log(`V6 아무도 안 냄 → 🎲 ${h.pick}`);
}
{ // 진행판 새로 고침(투표 중) → 이어서 하기 → 같은 갈림길을 새 열쇠로 다시 투표
  await waitFor(() => H.evaluate(() => { const v = window.__vnHost.vote; return v && v.id === 'V7' && !v.closed; }), { timeout: 60000, what: 'V7 열림' });
  hold = true;
  await H.reload();
  await H.waitForSelector('#bResume', { timeout: 20000 });
  await H.evaluate(() => document.querySelector('#bResume').click());
  await waitFor(() => H.evaluate(() => window.__vnHost && window.__vnHost.pos && window.__vnHost.pos.id === 'V7' && window.__vnHost.view.kind !== 'start'), { what: '이어서 하기' });
  hold = false;
  ok(true, '진행판 새로 고침 → 이어서 하기');
}
const h7 = await simple('V7', () => 3, 3);
ok(await H.evaluate(() => window.__vnHost.vote.key) === 'v7x1', '이어서 연 투표는 새 열쇠(v7x1)');
await simple('V8', () => 2, 2);
{ // V9 교사가 정하기(투표 중에)
  const key = await waitFor(() => H.evaluate(() => { const v = window.__vnHost.vote; return v && v.id === 'V9' && !v.closed ? v.key : null; }), { timeout: 60000, what: 'V9 열림' });
  await Promise.all(online().slice(0, 4).map(s => s.page.evaluate(() => { const b = document.querySelector('.vbtn[data-c="1"]'); if (b && !b.disabled) b.click(); })));
  await sleep(200);
  await H.evaluate(() => window.__vnHost.api.teacherDecide(2));
  const h = await waitPick('V9');
  ok(h.how === 'teacher' && h.pick === 2, `V9 교사가 정하기 → 2 (실제 ${h.pick} · ${h.how})`);
  const ik = await dump(srv, `vn/rooms/${host.code}/state/inputKey`);
  ok(!ik || ik !== key, '교사가 정하면 투표가 닫힘');
}
await simple('V10', () => 1, 1);
await simple('V11', n => n % 4 === 0 ? 4 : 3, 3);

// 엔딩
await waitFor(() => H.evaluate(() => window.__vnHost.view.kind === 'endcard'), { timeout: 120000, what: '엔딩 카드' });
skipping = false;
const run = await H.evaluate(() => window.__vnHost.run);
const endId = await H.evaluate(() => window.__vnHost.view.id);
ok(endId === endingOf(run), `엔딩 판정 일치 ${endId}`);
ok(CHOICE_IDS.every(id => run.ch[id] >= 1), '11개 갈림길 모두 기록');
log(`엔딩 ${endId} · 길 ${JSON.stringify(run.ch)}`);
await shot(H, 'class_host_endcard');
await waitFor(() => studs[0].page.evaluate(() => /졸업식/.test(document.body.innerText)), { what: '학생 엔딩 화면' });
await shot(studs[0].page, 'class_student_endcard');
const endTxt = await H.evaluate(() => document.body.innerText);
ok(/다른 길 \d+%/.test(endTxt), '엔딩 카드에 「다른 길 ○%」');

// 성찰
await H.evaluate(() => window.__vnHost.api.openRefl());
const writers = online().slice(0, 10);
await Promise.all(writers.map(async (s, i) => {
  await waitFor(() => s.page.evaluate(() => !!document.querySelector('#reflF')), { what: '성찰 칸' });
  await s.page.evaluate(i => {
    const f = document.querySelector('#reflF');
    f.q1.value = `페트병 전구는 낮에만 밝았다 ${i}`; f.q2.value = i % 2 ? '자전거 발전기 — 마을에서 고칠 수 있다' : '';
    f.requestSubmit();
  }, i);
}));
if (SHOTS) await shot(writers[0].page, 'class_student_refl_sent');
await waitFor(() => H.evaluate(n => Object.keys(window.__vnHost.refl).length >= n, writers.length), { what: '성찰 모임' });
await sleep(300);
await shot(H, 'class_host_refl');
const cards = await H.evaluate(() => document.querySelectorAll('.wcard').length);
const expCards = writers.length + Math.floor(writers.length / 2);
ok(cards === expCards, `성찰 카드 ${expCards}장(${writers.length}명 · 홀수 번째는 2칸) — 실제 ${cards}`);
const wallTxt = await H.evaluate(() => document.querySelector('.wall').innerText);
ok(!/\d+번/.test(wallTxt), '성찰 모음에 번호가 안 보임');
await H.evaluate(() => { window.confirm = () => true; document.querySelector('[data-hide]').click(); });
await waitFor(async () => Object.keys(await dump(srv, `vn/rooms/${host.code}/refl`) || {}).length === writers.length - 1, { what: '가리기 → DB 에서 지움' });
ok(true, '가리기 → DB 에서도 지움');

// 수업 끝
await H.evaluate(() => window.__vnHost.api.closeClass());
await waitFor(async () => (await dump(srv, `vn/rooms/${host.code}`)) === null, { what: '방 지움' });
ok(true, '수업 끝 → 방 통째로 지움');
await waitFor(() => studs[0].page.evaluate(() => /수업이 끝났어요/.test(document.body.innerText)), { what: '학생 끝 화면' });
ok(true, '학생 화면 「수업이 끝났어요」');
await sleep(500);
ok((await dump(srv, 'vn')) === null, '끊김 처리가 와도 빈 방이 다시 생기지 않음');

// 오류 · 거절
const errs = studs.flatMap(s => s.errs);
ok(errs.length === 0, `학생 화면 스크립트 오류 0 (${errs.slice(0, 3).join(' / ')})`);
const st = await stats(srv);
const denied = st.deniedList.filter(d => !/players\/.*(odc|validate failed)/.test(d.path + ' ' + d.why));
const groups = {};
for (const d of st.deniedList) { const k = d.path.replace(/vn\/rooms\/\d+\//, '').replace(/\/[A-Za-z0-9]{8,}$/, '/{uid}') + ' · ' + d.why.replace(/\/[A-Za-z0-9]{8,}/g, '/{uid}').replace(/vn\/rooms\/\d+/, ''); groups[k] = (groups[k] || 0) + 1; }
log('거절된 쓰기: ' + JSON.stringify(groups));
ok(!denied.some(d => /inputs/.test(d.path)), '투표 쓰기가 거절된 적 없음');

skipping = false;
await browser.close();
srv.close();
console.log(`\n전체 모드 시험(학생 ${N}명 · 배속 ×${SPEED}): 통과 ${pass} · 실패 ${fail} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
if (fail) { console.log(' - ' + fails.join('\n - ')); process.exit(1); }
process.exit(0);
