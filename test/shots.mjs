// 화면 모음 + 배치 검사: 1366×768(크롬북) · 375×812(휴대 전화) · 1920×1080(프로젝터)
//   + 얼굴 가림은 800×600 · 1024×768 · 1280×800 · 1280×1024 · 1440×900 · 1536×864 · 2560×1440 · 768×1024 에서도(multiView)
//   node test/shots.mjs     → test/shots/shot_*.png · 결과 요약
// 검사: 크롬북 1366×768 에서 학생 화면 세로 스크롤 없음 · 375px 에서 가로 넘침 없음 · 진행판 가로 넘침 없음
import fs from 'node:fs';
import path from 'node:path';
import { launch, startServers, openHost, openStudent, waitFor, sleep, here, tap, faceCheck, titleClear } from './lib.mjs';
import { ENDING_PATHS } from './paths.mjs';

const DIR = path.join(here, 'shots');
fs.mkdirSync(DIR, { recursive: true });
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log('  ✗ ' + m); } };
const browser = await launch(true);
const srv = await startServers({ mockPort: 8799, webPort: 8100 });
let n = 0;
async function shot(page, name, { noVScroll = false, noHScroll = true } = {}) {
  await sleep(450);   // 등장 움직임이 끝난 뒤
  await page.screenshot({ path: path.join(DIR, `shot_${name}.png`) });
  n++;
  const m = await page.evaluate(() => {
    const d = document.documentElement, main = document.querySelector('#main') || document.querySelector('#stage');
    return { w: window.innerWidth, h: window.innerHeight, sw: d.scrollWidth, sh: d.scrollHeight, msh: main.scrollHeight, mch: main.clientHeight };
  });
  if (noHScroll) ok(m.sw <= m.w + 1, `${name}: 가로 넘침 없음 (${m.sw} ≤ ${m.w})`);
  if (noVScroll) ok(m.sh <= m.h + 1 && m.msh <= m.mch + 1, `${name}: 세로 스크롤 없음 (문서 ${m.sh}/${m.h} · 본문 ${m.msh}/${m.mch})`);
  // 얼굴 가림 검사: 어떤 UI 도 인물 얼굴(머리)을 덮지 않는다(전체 문서 기준 — 휴대 전화는 스크롤해도 겹치지 않아야)
  const fc = await faceCheck(page);
  faceStat.faces += fc.faces; faceStat.shots++;
  ok(!fc.hits.length, `${name}: 얼굴 가림 없음${fc.hits.length ? ' — ' + fc.hits.slice(0, 4).join(' / ') : ''}`);
  // 다른 화면 비율에서도 같은 장면의 얼굴 가림 · 가로 넘침 검사(4:3 프로젝터 · 16:10 크롬북 · 5:4 · 세로 태블릿 · 2560)
  //  같은 장면을 1920 · 375 로 이미 찍은 이름(_1920 · _375)은 건너뛴다
  if (!/_(1920|375)$/.test(name)) await multiView(page, name, noHScroll);
}
const VIEWS = [[800, 600], [1024, 768], [1280, 800], [1280, 1024], [1440, 900], [1536, 864], [2560, 1440], [768, 1024]];
const multiStat = { views: 0 };
async function multiView(page, name, noHScroll) {
  const v0 = page.viewportSize();
  for (const [w, h] of VIEWS) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(200);   // 다시 배치 · trimBoxes
    const fc = await faceCheck(page);
    multiStat.views++; faceStat.faces += fc.faces;
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (noHScroll) ok(sw <= w + 1, `${name}@${w}x${h}: 가로 넘침 없음 (${sw} ≤ ${w})`);
    ok(!fc.hits.length, `${name}@${w}x${h}: 얼굴 가림 없음${fc.hits.length ? ' — ' + fc.hits.slice(0, 3).join(' / ') : ''}`);
    if (fc.hits.length) await page.screenshot({ path: path.join(DIR, `face_fail_${name}@${w}x${h}.png`) });
    // 타이틀의 중요한 단추는 화면 안에 있거나(넘치면) 스크롤로 닿을 수 있어야 한다
    const lost = await page.evaluate(() => ['#bNew', '#bCreate', '#bBackMenu', '#bBoard', '#bOffline', '#joinF [type=submit]'].filter(sel => {
      const b = document.querySelector(sel); if (!b || !b.offsetParent) return false;
      b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = b.getBoundingClientRect(), bad = r.top < 0 || r.bottom > innerHeight + 1 || r.left < 0 || r.right > innerWidth + 1;
      for (const c of document.querySelectorAll('.ts-setup')) c.scrollTop = 0;
      window.scrollTo(0, 0);
      return bad;
    }));
    ok(!lost.length, `${name}@${w}x${h}: 타이틀 단추 닿음${lost.length ? ' — ' + lost.join(', ') : ''}`);
  }
  await page.setViewportSize(v0);
  await sleep(150);
}
const faceStat = { shots: 0, faces: 0 };

// ── 진행판 시작 화면 ─────────────────────────────────────────────
const host = await openHost(browser, srv, { mode: 'class', speed: 1 });
const H = host.page;
// ── 학생 2명(크롬북 · 휴대 전화)
const big = await openStudent(browser, srv, host.code, 1);
const ph = await openStudent(browser, srv, host.code, 2, { view: { width: 375, height: 812 } });
await waitFor(() => H.evaluate(() => Object.values(window.__vnHost.players).filter(p => p.on).length >= 2), { what: '둘 다 보임' });
await shot(H, 'host_lobby_1366');
await shot(big.page, 'class_lobby_1366', { noVScroll: true });
await shot(ph.page, 'class_lobby_375');
await tap(H, '#bStart');

// 진행판을 손으로 넘기며 찍기
const kind = () => H.evaluate(() => { const v = window.__vnHost.view; return `${v.kind}:${v.k || ''}:${v.id || ''}`; });
const want = new Set(['title', 'lines:scene', 'think', 'vote', 'tally', 'fx', 'lines:after', 'dice', 'lines:ending']);
const got = new Set();
let lastVote = null;
for (let i = 0; i < 4000; i++) {
  const k = await kind();
  const [kd, sub, id] = k.split(':');
  const key = kd === 'lines' ? `lines:${sub}` : kd;
  if (kd === 'endcard') break;
  if (want.has(key) && !got.has(key) && (key !== 'title' || id === 'S2') && (key !== 'lines:scene' || id === 'S2') && (key !== 'think' || id === 'V2') && (key !== 'fx' || id === 'V2')) {
    got.add(key);
    await shot(H, `host_${key.replace(':', '_')}_1366`);
    if (key === 'lines:scene' || key === 'vote' || key === 'tally') {
      await H.setViewportSize({ width: 1920, height: 1080 }); await shot(H, `host_${key.replace(':', '_')}_1920`); await H.setViewportSize({ width: 1366, height: 768 });
    }
  }
  if (kd === 'vote' && lastVote !== id) {
    lastVote = id;
    if (id === 'V0' || id === 'V1' || id === 'V2') {   // 학생 투표 화면
      await waitFor(() => big.page.evaluate(() => !!document.querySelector('.vbtn:not([disabled])')), { what: '투표 단추' });
      for (const s of [big, ph]) await s.page.evaluate(c => { const b = document.querySelector(`.vbtn[data-c="${c}"]`); if (b && !b.disabled) b.click(); }, id === 'V1' ? 1 : 2);
      await shot(big.page, `class_vote_${id}_1366`, { noVScroll: true });
      await shot(ph.page, `class_vote_${id}_375`);
    } else if (id === 'V3') { /* 아무도 안 냄 → 🎲 */ }
    else { const c = ENDING_PATHS.E5[id] || 1; await H.evaluate(c => window.__vnHost.api.teacherDecide(c), c); }
  }
  if (kd === 'tally' && id === 'V1' && !got.has('stud-tally')) { got.add('stud-tally'); await shot(big.page, 'class_tally_1366', { noVScroll: true }); await shot(ph.page, 'class_tally_375'); }
  if (['title', 'lines', 'think', 'fx', 'tally'].includes(kd)) await H.evaluate(() => window.__vnHost.api.next());
  if (kd === 'lines' && sub === 'scene' && !got.has('stud-watch')) { got.add('stud-watch'); await shot(big.page, 'class_watch_1366', { noVScroll: true }); await shot(ph.page, 'class_watch_375'); }
  await sleep(40);
}
await waitFor(() => H.evaluate(() => window.__vnHost.view.kind === 'endcard'), { timeout: 60000, what: '엔딩 카드' });
await shot(H, 'host_endcard_1366');
await H.setViewportSize({ width: 1920, height: 1080 }); await shot(H, 'host_endcard_1920'); await H.setViewportSize({ width: 1366, height: 768 });
// 엔딩 카드 제목 · 한 줄 말이 칸에 눌려 숨지 않는다(2026-10-30 1366×768 에서 제목이 표 칸 밑으로 숨던 일)
for (const [w, h] of [[1366, 768], [1024, 768], [1280, 800], [1920, 1080], [800, 600]]) {
  await H.setViewportSize({ width: w, height: h }); await sleep(250);
  const t = [...await titleClear(H, '.endcard .ec-title'), ...await titleClear(H, '.endcard .ec-msg')];
  ok(!t.length, `엔딩 카드 제목 다 보임 @${w}x${h}${t.length ? ' — ' + t.join(' / ') : ''}`);
}
await H.setViewportSize({ width: 1366, height: 768 });
await shot(big.page, 'class_endcard_1366', { noVScroll: true });
await H.evaluate(() => window.__vnHost.api.openRefl());
await waitFor(() => big.page.evaluate(() => !!document.querySelector('#reflF')), { what: '성찰 칸' });
await shot(big.page, 'class_refl_1366', { noVScroll: true });
await shot(ph.page, 'class_refl_375');
for (const s of [big, ph]) await s.page.evaluate(() => { const f = document.querySelector('#reflF'); f.q1.value = '냉장고는 전기가 없으면 못 쓴다. 항아리 냉장고는 마을 흙으로 만든다.'; f.q2.value = '자전거 발전기 — 테누가 고칠 수 있다'; f.requestSubmit(); });
await waitFor(() => H.evaluate(() => Object.keys(window.__vnHost.refl).length >= 2), { what: '성찰 둘' });
await shot(H, 'host_refl_1366');
ok(got.size >= 9, `진행판 장면 종류 ${got.size}가지 찍음 (${[...got].join(', ')})`);
await H.evaluate(() => window.__vnHost.api.closeClass());
await shot(big.page, 'class_ended_1366', { noVScroll: true });

// ── 개인 모드: 한 사람씩 단계마다 ─────────────────────────────────
const host2 = await openHost(browser, srv, { mode: 'solo' });
const H2 = host2.page;
await H2.evaluate(() => { localStorage.setItem('vn.host.pref', JSON.stringify({ seats: 24, mode: 'solo', pace: 'normal' })); });
const sb = await openStudent(browser, srv, host2.code, 3);
const sp = await openStudent(browser, srv, host2.code, 4, { view: { width: 375, height: 812 } });
await shot(sb.page, 'solo_lobby_1366', { noVScroll: true });
await tap(H2, '#bStart');
for (const [s, tag] of [[sb, '1366'], [sp, '375']]) {
  const vs = tag === '1366';
  const path = ENDING_PATHS[tag === '1366' ? 'E1' : 'E5'];
  await waitFor(() => s.page.evaluate(() => !!document.querySelector('[data-g]')), { what: '성별' });
  await shot(s.page, `solo_gender_${tag}`, { noVScroll: vs });
  await s.page.evaluate(g => document.querySelector(`[data-g="${g}"]`).click(), tag === '1366' ? 'f' : 'm');
  await waitFor(() => s.page.evaluate(() => !!document.querySelector('[data-n]')), { what: '이름' });
  await shot(s.page, `solo_name_${tag}`, { noVScroll: vs });
  await s.page.evaluate(() => document.querySelectorAll('[data-n]')[1].click());
  const taken = new Set();
  for (let i = 0; i < 3000; i++) {
    const pos = await s.page.evaluate(() => window.__vnPlay.solo.pos);
    if (pos.k === 'done') break;
    const tagk = pos.k + (pos.k === 'after' && pos.fx ? '-fx' : '');
    const interesting = (pos.k === 'scene' && pos.id === 'S2' && pos.i === 4) || (pos.k === 'choice' && pos.id === 'V3') || (tagk === 'after-fx' && pos.id === 'V3')
      || (pos.k === 'scene' && pos.id === 'S7A' && pos.i === 3) || (pos.k === 'ending' && pos.i === 4) || pos.k === 'card';
    if (interesting && !taken.has(pos.k + pos.id + tagk)) { taken.add(pos.k + pos.id + tagk); await shot(s.page, `solo_${tagk}_${pos.id}_${tag}`, { noVScroll: vs }); }
    if (pos.k === 'card' && !taken.has('title' + tag)) { taken.add('title' + tag); const t = await titleClear(s.page, '.endcard .ec-title'); ok(!t.length, `개인 엔딩 카드 제목 다 보임 (${tag})${t.length ? ' — ' + t.join(' / ') : ''}`); }
    await s.page.evaluate(p => {
      const q = x => document.querySelector(x);
      const b = p.k === 'choice' ? q(`[data-c="${p.c}"]`) : p.k === 'card' ? q('#bDone') : q('#bNext');
      if (b) b.click();
    }, { k: pos.k, c: pos.k === 'choice' ? path[pos.id] : 0 });
    await sleep(25);
  }
  await waitFor(() => s.page.evaluate(() => !!document.querySelector('#reflF')), { what: '성찰' });
  await shot(s.page, `solo_refl_${tag}`, { noVScroll: vs });
  await s.page.evaluate(() => { const f = document.querySelector('#reflF'); f.q2.value = '빗물 탱크 — 할머니가 돌본다'; f.requestSubmit(); });
  await waitFor(() => s.page.evaluate(() => !!document.querySelector('.dex')), { what: '도감' });
  await shot(s.page, `solo_done_${tag}`, { noVScroll: vs });
}
await sleep(1600);
await shot(H2, 'host_solo_progress_1366');
await tap(H2, '#bGrad');
await shot(H2, 'host_solo_stats_1366');
await shot(sb.page, 'solo_stats_1366', { noVScroll: true });
await shot(sp.page, 'solo_stats_375');

// 진행판 시작 화면(방 없이)
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const p0 = await ctx.newPage();
await p0.goto(`${srv.base}/host.html?mock=${encodeURIComponent(srv.mockURL)}`);
await p0.waitForSelector('#bNew:not([disabled])');
await shot(p0, 'host_splash_1366');
await p0.evaluate(() => { const s = document.getElementById('tsSplash'); if (s) s.click(); });
await sleep(700);
await shot(p0, 'host_start_1366', { noVScroll: true });
await p0.evaluate(() => document.getElementById('bBoard').click());
await shot(p0, 'host_start_board_1366', { noVScroll: true });
await p0.evaluate(() => document.getElementById('bNew').click());
await shot(p0, 'host_setup_1366', { noVScroll: true });
for (const [w, h] of [[1920, 1080], [375, 812]]) {
  await p0.setViewportSize({ width: w, height: h });
  await p0.evaluate(() => { const b = document.getElementById('bBackMenu'); if (b) b.click(); });
  await shot(p0, `host_start_${w}`, { noVScroll: w > 700 });
  await p0.evaluate(() => document.getElementById('bNew').click());
  await shot(p0, `host_setup_${w}`, { noVScroll: w > 700 });
}
const s0 = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
await s0.goto(`${srv.base}/?mock=${encodeURIComponent(srv.mockURL)}`);
await s0.waitForSelector('#iCode');
await shot(s0, 'join_375');
const s1 = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
await s1.goto(`${srv.base}/?mock=${encodeURIComponent(srv.mockURL)}`);
await s1.waitForSelector('#iCode');
await shot(s1, 'join_1366', { noVScroll: true });
await s1.setViewportSize({ width: 1920, height: 1080 });
await shot(s1, 'join_1920', { noVScroll: true });

// 비상 모드(인터넷 없이): 교사가 갈림길마다 「이 길로」 → 엔딩까지
{
  const c = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await c.newPage();
  p.on('dialog', d => d.accept());
  await p.goto(`${srv.base}/host.html?mock=${encodeURIComponent(srv.mockURL)}&speed=20`);
  await p.waitForSelector('#bOffline');
  await p.evaluate(() => document.querySelector('#bOffline').click());
  let shotOff = false;
  for (let i = 0; i < 3000; i++) {
    const k = await p.evaluate(() => window.__vnHost.view.kind);
    if (k === 'endcard') break;
    if (k === 'offline-pick') {
      if (!shotOff) { shotOff = true; await shot(p, 'host_offline_pick_1366'); }
      await p.evaluate(() => { const b = document.querySelector('[data-pick="1"]'); if (b) b.click(); });
    } else await p.evaluate(() => window.__vnHost.api.next());
    await sleep(20);
  }
  const k = await p.evaluate(() => window.__vnHost.view.kind);
  ok(k === 'endcard' && shotOff, `비상 모드로 엔딩 카드까지 (${k})`);
  await c.close();
}

await browser.close(); srv.close();
console.log(`화면 ${n}장 · 배치 검사 통과 ${pass} · 실패 ${fail} · 얼굴 상자 검사 ${faceStat.shots}장 + 다른 비율 ${multiStat.views}번(얼굴 ${faceStat.faces}개)`);
if (fail) { console.log(' - ' + fails.join('\n - ')); process.exit(1); }
process.exit(0);
