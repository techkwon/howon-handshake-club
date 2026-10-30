// 실제 Firebase + 배포된 사이트로 짧게 확인 (규칙 게시 · API 키 도메인 추가 뒤에만)
//   node test/real_smoke.mjs
// - 방 코드는 9xxx(?test=1). 끝나면 만든 방을 모두 지우고 지웠는지 다시 읽어 본다
// - 익명 가입은 IP 당 한도가 있어 로그인 상태를 test/.auth/ 에 저장해 다시 쓴다(이 폴더는 배포하지 않는다 · site/ 밖)
import fs from 'node:fs';
import path from 'node:path';
import { launch, waitFor, sleep, here } from './lib.mjs';
import { ENDING_PATHS } from './paths.mjs';

const BASE = 'https://ict-handshake-club.netlify.app';
const BB = 'https://ict-bio-battle.netlify.app';
const BB_AUTH = path.join(here, '../../../13-16차시_생명기술/_개발/test/.auth');
const AUTH = path.join(here, '.auth');
fs.mkdirSync(AUTH, { recursive: true });
const SPEED = 4;

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; fails.push(m); console.log('  ✗ ' + m); } };
const t0 = Date.now();
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const rooms = [];   // [{site, code, host}] 지워야 할 방

const browser = await launch(true);
async function ctxFor(name, dir = AUTH, view = { width: 1366, height: 768 }) {
  const f = path.join(dir, name + '.json');
  const opts = { viewport: view };
  if (fs.existsSync(f)) opts.storageState = f;
  const ctx = await browser.newContext(opts);
  ctx.__save = () => ctx.storageState({ path: f, indexedDB: true }).catch(() => {});
  return ctx;
}

async function openHost(mode, name) {
  const ctx = await ctxFor(name);
  await ctx.addInitScript(m => { try { localStorage.setItem('vn.host.pref', JSON.stringify({ cls: 9, mode: m, pace: 'fast' })); localStorage.removeItem('vn.host.snap'); } catch {} }, mode);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[진행판 오류]', e.message));
  page.on('dialog', d => d.accept());
  await page.goto(`${BASE}/host.html?test=1&speed=${SPEED}`);
  await page.waitForSelector('#bNew:not([disabled])', { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#bNew').click());
  await page.waitForSelector('#bCreate:not([disabled])', { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#bCreate').click());
  const code = await waitFor(() => page.evaluate(() => window.__vnHost.code), { timeout: 30000, what: '방 만들기' });
  rooms.push({ site: 'vn', code, page });
  await ctx.__save();
  return { ctx, page, code };
}
async function openStudent(code, num, name) {
  const ctx = await ctxFor(name);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${BASE}/?code=${code}`);
  await page.waitForSelector('#iNum', { timeout: 30000 });
  await page.evaluate(n => { document.querySelector('#iNum').value = String(n); document.querySelector('#joinF').requestSubmit(); }, num);
  await waitFor(() => page.evaluate(() => window.__vnPlay && window.__vnPlay.joined), { timeout: 30000, what: `${num}번 들어가기` });
  await ctx.__save();
  return { ctx, page, num, errs, uid: await page.evaluate(() => window.__vnPlay.net.uid) };
}
const hget = (page, p) => page.evaluate(p => window.__vnHost.net.get(p), p);

try {
  // ── 1. 전체 모드: 진행판 + 5명 ───────────────────────────────────
  log('전체 모드');
  const host = await openHost('class', 'vn-host');
  const H = host.page;
  ok(/^9\d{3}$/.test(host.code), `시험 방 코드 ${host.code}`);
  const studs = [];
  for (let i = 1; i <= 5; i++) studs.push(await openStudent(host.code, i, `vn-s${i}`));
  await waitFor(() => H.evaluate(() => Object.values(window.__vnHost.players).filter(p => p.on).length >= 5), { timeout: 30000, what: '5명 보임' });
  ok(true, '학생 5명 실제 DB 로 들어옴');

  // 남의 칸 쓰기는 실제 규칙이 거절
  const deny = await studs[0].page.evaluate(async other => {
    const P = window.__vnPlay, r = [];
    for (const [p, v] of [[`players/${other}`, { num: 9, joinedAt: P.net.TS }], [`state/c`, '{}'], [`meta/phase`, 'end'], [`refl/${other}`, { q1: 'x', t: P.net.TS }]]) {
      try { await P.net.withTimeout(P.net.set(`vn/rooms/${P.code}/${p}`, v), 8000, p); r.push('허용 ' + p); } catch (e) { r.push(/PERMISSION/i.test(e.code || e.message) ? 'ok' : '기타 ' + e.message); }
    }
    try { await P.net.withTimeout(P.net.get(`vn/rooms/${P.code}/players/${other}`), 8000, '읽기'); r.push('읽기 허용'); } catch (e) { r.push(/PERMISSION/i.test(e.code || e.message) ? 'ok' : '기타'); }
    return r;
  }, studs[1].uid);
  ok(deny.every(x => x === 'ok'), `남의 자리 · 진행판 칸 · 남의 성찰 쓰기, 남의 자리 읽기 모두 거절 (${deny.join(', ')})`);

  await H.evaluate(() => document.querySelector('#bStart').click());
  let skipping = true;
  (async () => { while (skipping) { try { const k = await H.evaluate(() => window.__vnHost.view.kind); if (['title', 'lines', 'think', 'fx', 'tally'].includes(k)) await H.evaluate(() => window.__vnHost.api.next()); } catch {} await sleep(80); } })();

  const voteRound = async (id, round, ch) => {
    const key = await waitFor(() => H.evaluate(([id, r]) => { const v = window.__vnHost.vote; return v && v.id === id && v.round === r && !v.closed ? v.key : null; }, [id, round]), { timeout: 60000, what: `${id} ${round}차 투표` });
    await Promise.all(studs.map(async s => {
      const c = ch(s.num); if (!c) return;
      await s.page.evaluate(async ([c, key]) => {
        for (let i = 0; i < 150; i++) { const P = window.__vnPlay, b = document.querySelector(`.vbtn[data-c="${c}"]`); if (P.inputKey === key && b && !b.disabled) { b.click(); return; } await new Promise(r => setTimeout(r, 40)); }
      }, [c, key]);
    }));
    return key;
  };
  const hist = id => waitFor(() => H.evaluate(id => { const h = window.__vnHost.hist[id]; return h && h.pick ? h : null; }, id), { timeout: 60000, what: `${id} 결정` });

  // V0: 2 대 2(5번 안 냄) → 다시 2 대 2 → 🎲
  const split = n => n === 5 ? 0 : n % 2 ? 1 : 2;
  await voteRound('V0', 1, split);
  await voteRound('V0', 2, split);
  const h0 = await hist('V0');
  ok(h0.how === 'dice' && h0.r1.total === 4 && h0.r2 && h0.r2.total === 4, `V0 동률 → 다시 투표 동률 → 🎲 (${JSON.stringify(h0.r1.counts)} → ${JSON.stringify(h0.r2 && h0.r2.counts)})`);
  // V1: 4 대 1 → 1
  await voteRound('V1', 1, n => n === 5 ? 2 : 1);
  const h1 = await hist('V1');
  ok(h1.how === 'vote' && h1.pick === 1 && h1.r1.counts[1] === 4 && h1.r1.counts[2] === 1, `V1 표 세기 ${JSON.stringify(h1.r1.counts)} → 1`);
  const tallyTxt = await waitFor(() => studs[0].page.evaluate(() => /우리 반은/.test(document.body.innerText) && document.body.innerText), { timeout: 30000, what: '학생 결과 화면' }).catch(() => '');
  ok(!!tallyTxt, '학생 화면 「우리 반은 …」');
  // V2: 교사가 정하기
  await waitFor(() => H.evaluate(() => { const v = window.__vnHost.vote; return v && v.id === 'V2' && !v.closed; }), { timeout: 60000, what: 'V2' });
  await H.evaluate(() => window.__vnHost.api.teacherDecide(2));
  const h2 = await hist('V2');
  ok(h2.how === 'teacher' && h2.pick === 2, 'V2 교사가 정하기');
  ok(!(await hget(H, `vn/rooms/${host.code}/state/inputKey`)), '교사가 정하면 투표 열쇠 닫힘');
  // 나머지는 교사가 빨리 → 엔딩
  for (let i = 0; i < 2000; i++) {
    const k = await H.evaluate(() => [window.__vnHost.view.kind, window.__vnHost.view.id]);
    if (k[0] === 'endcard') break;
    if (k[0] === 'vote') await H.evaluate(id => window.__vnHost.api.teacherDecide(({ V11: 3 })[id] || 2), k[1]);
    await sleep(60);
  }
  skipping = false;
  const endId = await H.evaluate(() => window.__vnHost.view.kind === 'endcard' && window.__vnHost.view.id);
  ok(!!endId, `엔딩 카드까지 (${endId})`);
  // 성찰
  await H.evaluate(() => window.__vnHost.api.openRefl());
  for (const s of studs.slice(0, 2)) {
    await waitFor(() => s.page.evaluate(() => !!document.querySelector('#reflF')), { timeout: 30000, what: '성찰 칸' });
    await s.page.evaluate(() => { const f = document.querySelector('#reflF'); f.q1.value = '시험: 냉장고는 전기가 없으면 못 쓴다'; f.requestSubmit(); });
  }
  await waitFor(() => H.evaluate(() => Object.keys(window.__vnHost.refl).length >= 2), { timeout: 30000, what: '성찰 2개' });
  const refl = await hget(H, `vn/rooms/${host.code}/refl`);
  ok(Object.keys(refl || {}).length === 2, '성찰 2개가 실제 DB 에 모임');
  const errs = studs.flatMap(s => s.errs);
  ok(errs.length === 0, `학생 화면 오류 0 (${errs.slice(0, 2).join(' / ')})`);
  // 지우기
  await H.evaluate(() => window.__vnHost.api.closeClass());
  await waitFor(async () => (await H.evaluate(c => window.__vnHost.net.get(`vn/rooms/${c}/meta`), host.code).catch(() => 'err')) === null, { timeout: 20000, what: '방 지움' });
  rooms.find(r => r.code === host.code).deleted = true;
  ok(true, `전체 모드 방 ${host.code} 지움`);
  await waitFor(() => studs[0].page.evaluate(() => /수업이 끝났어요/.test(document.body.innerText)), { timeout: 20000, what: '학생 끝 화면' });
  ok(true, '학생 화면 「수업이 끝났어요」');
  for (const s of studs) await s.ctx.close();
  await host.ctx.close();

  // ── 2. 개인 모드: 진행판 + 3명 ───────────────────────────────────
  log('개인 모드');
  const h2o = await openHost('solo', 'vn-host');
  const S2 = h2o.page;
  const ends = ['E1', 'E5', 'E9'];
  const solo = [];
  for (let i = 0; i < 3; i++) solo.push(await openStudent(h2o.code, 11 + i, `vn-s${i + 1}`));
  await waitFor(() => S2.evaluate(() => Object.values(window.__vnHost.players).filter(p => p.on).length >= 3), { timeout: 30000, what: '3명 보임' });
  await S2.evaluate(() => document.querySelector('#bStart').click());
  await Promise.all(solo.map((s, i) => s.page.evaluate(async path => {
    const q = x => document.querySelector(x), wait = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 4000; i++) {
      const P = window.__vnPlay, pos = P && P.solo && P.solo.pos;
      if (!pos || !P.meta || P.meta.phase !== 'play') { await wait(40); continue; }
      if (pos.k === 'done' || q('#reflF')) return;
      const b = pos.k === 'gender' ? q('[data-g="f"]') : pos.k === 'name' ? q('[data-n]') : pos.k === 'choice' ? q(`[data-c="${path[pos.id]}"]`) : pos.k === 'card' ? q('#bDone') : q('#bNext');
      if (b) b.click();
      await wait(20);
    }
  }, ENDING_PATHS[ends[i]])));
  await sleep(3000);
  const recs = await hget(S2, `vn/rooms/${h2o.code}/solo`);
  const got = Object.values(recs || {}).map(r => 'E' + r.e).sort();
  ok(JSON.stringify(got) === JSON.stringify([...ends].sort()), `첫 엔딩 기록 ${got.join(' · ')}`);
  ok(Object.values(recs || {}).every(r => Object.keys(r).every(k => /^(st|e|l|t|c([1-9]|1[01]))$/.test(k)) && Object.values(r).every(v => typeof v === 'number')), 'DB 기록은 숫자뿐(성별 · 이름 없음)');
  const board = await waitFor(() => S2.evaluate(() => [...document.querySelectorAll('.ecell em')].reduce((a, e) => a + Number(e.textContent || 0), 0) >= 3), { timeout: 20000, what: '진행판 엔딩 판' }).catch(() => false);
  ok(!!board, '진행판 엔딩 판에 3명');
  await S2.evaluate(() => window.__vnHost.api.closeClass());
  await waitFor(async () => (await S2.evaluate(c => window.__vnHost.net.get(`vn/rooms/${c}/meta`), h2o.code).catch(() => 'err')) === null, { timeout: 20000, what: '방 지움' });
  rooms.find(r => r.code === h2o.code).deleted = true;
  ok(true, `개인 모드 방 ${h2o.code} 지움`);
  for (const s of solo) await s.ctx.close();
  await h2o.ctx.close();

  // ── 3. 대결 판 /rooms 는 그대로 되는가 ─────────────────────────────
  log('대결 판');
  const bctx = await ctxFor('real-host', BB_AUTH);
  await bctx.addInitScript(() => { try { localStorage.removeItem('bb.host.snap'); } catch {} });
  const bp = await bctx.newPage();
  bp.on('dialog', d => d.accept());
  await bp.goto(`${BB}/host.html?test=1`);
  await bp.waitForSelector('#bNew:not([disabled])', { timeout: 30000 });
  await bp.evaluate(() => document.querySelector('#bNew').click());
  await bp.waitForSelector('#bCreate:not([disabled])', { timeout: 30000 });
  await bp.evaluate(() => document.querySelector('#bCreate').click());
  const bcode = await waitFor(() => bp.evaluate(() => window.__bbHost.code), { timeout: 30000, what: '대결 판 방' });
  rooms.push({ site: 'bb', code: bcode, page: bp });
  const sctx = await ctxFor('real-s1', BB_AUTH);
  const sp = await sctx.newPage();
  await sp.goto(`${BB}/`);
  await sp.waitForSelector('#iCode', { timeout: 30000 });
  await sp.evaluate(c => { document.querySelector('#iCode').value = c; document.querySelector('#iNum').value = '1'; document.querySelector('#joinF').requestSubmit(); }, bcode);
  await waitFor(() => sp.evaluate(() => window.__bbPlay && window.__bbPlay.joined), { timeout: 30000, what: '대결 판 학생 들어가기' });
  await waitFor(() => bp.evaluate(() => Object.values(window.__bbHost.players || {}).some(p => p.num === 1 && p.on)), { timeout: 30000, what: '대결 판 진행판에 보임' });
  ok(true, `대결 판 /rooms/${bcode} 들어가기 그대로 됨`);
  await bp.evaluate(c => window.__bbHost.net.remove(`rooms/${c}`), bcode);
  await waitFor(async () => (await bp.evaluate(c => window.__bbHost.net.get(`rooms/${c}/meta`), bcode).catch(() => 'err')) === null, { timeout: 20000, what: '대결 판 방 지움' });
  rooms.find(r => r.code === bcode).deleted = true;
  ok(true, `대결 판 방 ${bcode} 지움`);
  await bctx.close(); await sctx.close();
} catch (e) {
  fail++; fails.push('중단: ' + e.message); console.log('중단:', e.message);
} finally {
  // 남은 방 정리
  for (const r of rooms.filter(r => !r.deleted)) {
    try {
      if (r.site === 'vn') await r.page.evaluate(c => window.__vnHost.net.remove(`vn/rooms/${c}`), r.code);
      else await r.page.evaluate(c => window.__bbHost.net.remove(`rooms/${c}`), r.code);
      r.deleted = true; console.log(`  정리: ${r.site} ${r.code} 지움`);
    } catch (e) { console.log(`  ⚠ ${r.site} ${r.code} 못 지움: ${e.message}`); }
  }
  await browser.close();
}
const left = rooms.filter(r => !r.deleted).map(r => `${r.site}:${r.code}`);
console.log(`\n실제 DB 시험: 통과 ${pass} · 실패 ${fail} · 남은 방 ${left.length ? left.join(', ') : '없음'} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
if (fail) { console.log(' - ' + fails.join('\n - ')); process.exit(1); }
process.exit(0);
