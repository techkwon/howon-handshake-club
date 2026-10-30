// 소리 · 화면 눌러 넘기기 · 효과 시험(가짜 DB) — 2026-10-30
//   node test/fx_sound.mjs   → test/shots/fx_*.png · 결과 요약
// 확인: 진행판 BGM(여는 곡 → 고른 본 곡 → 엔딩 곡) · 곡 고르기 저장 · 화면을 눌러 넘김(단추 · 두 번 누름 · 갈림길 · 투표는 안 넘김)
//       · Enter 로 넘김 · 효과가 얼굴을 안 덮음 · 개인 모드 소리 처음엔 끔 · 켜기 저장 · 엔딩 곡 · 움직이기 줄이기(알갱이 · 흔들림 · 글자 찍기 없음)
// 브라우저는 소리가 안 나므로 소리 장치 상태(window.__vnSound.state())만 본다.
import path from 'node:path';
import fs from 'node:fs';
import { launch, startServers, openHost, openStudent, waitFor, sleep, here, tap, faceCheck, uiOverlap } from './lib.mjs';
import { ENDING_PATHS } from './paths.mjs';

const DIR = path.join(here, 'shots'); fs.mkdirSync(DIR, { recursive: true });
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log('  ✗ ' + m); } };
const t0 = Date.now();
const browser = await launch(true);
const srv = await startServers({ mockPort: 8803, webPort: 8104 });
const snd = page => page.evaluate(() => window.__vnSound.state());
const view = page => page.evaluate(() => { const v = window.__vnHost.view; return { kind: v.kind, id: v.id, k: v.k, shown: v.shown || 0 }; });
const shot = (page, name) => page.screenshot({ path: path.join(DIR, `fx_${name}.png`) });
const face = async (page, name) => { const fc = await faceCheck(page); ok(!fc.hits.length, `${name}: 얼굴 가림 없음${fc.hits.length ? ' — ' + fc.hits.slice(0, 3).join(' / ') : ''}`); };

// ── 1. 진행판(전체 모드 · 학생 3명) ─────────────────────────────────
const host = await openHost(browser, srv, { mode: 'class', seats: 3, speed: 2, pace: 'fast', view: { width: 1366, height: 768 } });
const H = host.page;
{
  const s = await snd(H);
  ok(s.want === 'open' && s.playing === 'open' && s.bgm && s.sfx && !s.locked, `진행판 대기실: 여는 곡 · BGM · 효과음 켬 (${JSON.stringify(s)})`);
  ok(s.ctx !== 'none', `진행판: 처음 누를 때 소리 장치를 만듦 (${s.ctx})`);
  ok(await H.$('#bar .snd [data-snd="bgm"]') && await H.$('#bar .snd [data-snd="sfx"]') && await H.$('#bar .snd [data-set="1"]'), '진행판 머리띠에 🎵 · 🔊 · ⚙');
  ok(s.motion === 'hi', `진행판 움직임 처음 값 = 상 (${s.motion})`);
}
// 곡 크기(소리 없이 미리 만들어 잼): 기본 크기에서 배경으로 작게, 가장 크게 해도 찢어지지 않음
for (const id of ['open', 'm1', 'm2', 'm3', 'end']) {
  const lo = await H.evaluate(id => window.__vnSound.measure(id, { sec: 20, vol: 0.35 }), id);
  const hi = await H.evaluate(id => window.__vnSound.measure(id, { sec: 20, vol: 1 }), id);
  ok(lo.rms <= -28 && lo.rms >= -46 && hi.peak <= -1, `곡 ${id}: 기본 크기 평균 ${lo.rms}dB · 최대 크기 봉우리 ${hi.peak}dB`);
}
// ⚙ 설정 판 열기 → 곡 고르기 → 저장
await tap(H, '#bar [data-set="1"]');
ok(await H.$('#setp [data-trk="m2"]') && await H.$('#setp [data-vol="bgmVol"]') && await H.$('#setp [data-vol="sfxVol"]') && await H.$('#setp [data-motion="mid"]'), '⚙ 설정 판: 곡 1 · 2 · 3 · 음악 크기 · 효과음 크기 · 움직임 상 · 중 · 하 · 끄기');
{
  const r = await H.evaluate(() => { const a = document.getElementById('setp').getBoundingClientRect(), b = document.getElementById('stage').getBoundingClientRect(); return { below: b.top >= a.bottom - 1 }; });
  ok(r.below, '설정 판은 무대를 덮지 않고 밀어 내린다');
}
await H.screenshot({ path: path.join(DIR, 'fx_settings_1366.png') });
await tap(H, '#setp [data-trk="m2"]');
{
  const s = await snd(H);
  const ls = await H.evaluate(() => JSON.parse(localStorage.getItem('vn.snd.host') || '{}'));
  ok(s.track === 'm2' && ls.track === 'm2', `곡 2 고르기 → 저장 (${s.track} · ${ls.track})`);
  ok(s.want === 'open', '대기실에서는 곡을 골라도 여는 곡 그대로');
}
// 배경음악 · 효과음은 따로 켜고 끈다
await tap(H, '#setp [data-snd="bgm"]');
{ const s = await snd(H); ok(!s.bgm && s.sfx && s.playing === null, `배경음악만 끔 → 효과음은 그대로 (${s.bgm} · ${s.sfx})`); }
await tap(H, '#setp [data-snd="sfx"]');
{ const s = await snd(H); ok(!s.bgm && !s.sfx, '효과음도 끔'); }
await tap(H, '#setp [data-snd="bgm"]');
{ const s = await snd(H); ok(s.bgm && !s.sfx && s.playing === 'open', `배경음악만 다시 켬 → 효과음은 꺼진 채 (${s.bgm} · ${s.sfx})`); }
await tap(H, '#setp [data-snd="sfx"]');
await tap(H, '#setp [data-set="0"]');
ok(!(await H.$('#setp')), '설정 판 닫기');
await H.screenshot({ path: path.join(DIR, 'fx_sound_bar.png'), clip: { x: 0, y: 0, width: 1366, height: 60 } });
const st1 = await openStudent(browser, srv, host.code, 1);
await waitFor(() => H.evaluate(() => Object.values(window.__vnHost.players).some(p => p.on)), { what: '학생 들어옴' });
await H.evaluate(() => { if (window.__vnHost.auto) window.__vnHost.api.togglePause(); });   // 멈춤: 「다음」을 눌러야만 넘어간다
await tap(H, '#bStart');
await waitFor(async () => (await view(H)).kind === 'title', { what: '첫 장면 제목' });
{
  const s = await snd(H);
  ok(s.want === 'm2' && s.playing === 'm2', `이야기 시작 → 고른 본 곡(2) (${s.want} · ${s.playing})`);
}
// 장면 제목에서 화면을 눌러 넘김
await H.mouse.click(400, 300);
await waitFor(async () => (await view(H)).kind === 'lines', { what: '대사' });
ok(true, '장면 제목에서 화면 누름 → 대사');
// 글자 찍기 중 누름 → 먼저 다 보여 주고, 다음 누름에 넘김
{
  await sleep(300);
  const a = await view(H);
  const typing = await H.evaluate(() => window.__vnHost.fx.twBusy());
  await H.mouse.click(400, 300);
  await sleep(320);
  const b = await view(H);
  if (typing) ok(b.shown === a.shown && !(await H.evaluate(() => window.__vnHost.fx.twBusy())), `글자 찍는 중 첫 누름 = 다 보이기(줄 ${a.shown} → ${b.shown})`);
  await H.mouse.click(400, 300);
  await sleep(320);
  const c = await view(H);
  ok(c.shown === b.shown + 1 || c.kind !== 'lines' || c.id !== b.id, `다 보인 뒤 누름 = 다음 줄 (${b.shown} → ${c.shown})`);
}
// 단추 위 누름은 넘기지 않음 · 두 번 누름은 한 줄만
{
  await H.evaluate(() => window.__vnHost.fx.twBusy() || 0);
  await sleep(1200);
  const a = await view(H);
  await H.evaluate(() => { const b = document.createElement('button'); b.id = 'tBtn'; b.textContent = '시험 단추'; b.style.cssText = 'position:absolute;left:20px;top:200px;z-index:9'; document.querySelector('.vn-scene').appendChild(b); });
  await H.click('#tBtn');
  await sleep(320);
  const b = await view(H);
  ok(a.shown === b.shown && a.id === b.id, `무대 안 단추를 눌러도 안 넘어감 (${a.shown} → ${b.shown})`);
  await H.evaluate(() => { const b = document.getElementById('tBtn'); if (b) b.remove(); });
  await H.mouse.click(400, 300, { clickCount: 2 });
  await sleep(500);
  const c = await view(H);
  ok(c.id !== b.id || c.shown - b.shown <= 1, `두 번 누름은 한 번만 (${b.shown} → ${c.shown})`);
  await sleep(1300);
  const d = await view(H);
  await H.keyboard.press('Enter');
  await sleep(250);
  const e = await view(H);
  ok(e.shown !== d.shown || e.id !== d.id || e.kind !== d.kind || (await H.evaluate(() => !window.__vnHost.fx.twBusy())), `Enter 로 넘김 (${d.shown} → ${e.shown})`);
}
// 갈림길까지 넘기기 → 생각 시간 · 투표에서 화면을 눌러도 넘어가지 않음
await waitFor(async () => { const v = await view(H); if (v.kind === 'think' || v.kind === 'vote') return true; await H.evaluate(() => window.__vnHost.api.next()); return false; }, { what: '갈림길', every: 150, timeout: 60000 });
{
  await H.evaluate(() => { if (!window.__vnHost.auto) window.__vnHost.api.togglePause(); });
  await waitFor(async () => (await view(H)).kind === 'vote', { what: '투표 열림', timeout: 40000 });
  const a = await H.evaluate(() => window.__vnHost.vote.key);
  for (let i = 0; i < 4; i++) { await H.mouse.click(500, 400); await sleep(280); }
  const v = await view(H);
  const closed = await H.evaluate(() => window.__vnHost.vote && window.__vnHost.vote.closed);
  ok(v.kind === 'vote' && !closed && await H.evaluate(() => window.__vnHost.vote.key) === a, `투표 중 화면을 4번 눌러도 투표 그대로 (${v.kind})`);
  await shot(H, 'host_vote');
}
// S1(인물 셋)까지 가서 효과를 띄워 본다
await H.evaluate(() => window.__vnHost.api.teacherDecide(1));
await H.evaluate(() => { if (window.__vnHost.auto) window.__vnHost.api.togglePause(); });
await waitFor(async () => { const v = await view(H); if (v.kind === 'lines' && v.id === 'S1' && v.shown >= 2) return true; if (['think', 'vote'].includes(v.kind)) await H.evaluate(() => window.__vnHost.api.teacherDecide(1)); else await H.evaluate(() => window.__vnHost.api.next()); return false; }, { what: 'S1 대사', every: 200, timeout: 60000 });
await sleep(1200);
// 효과 한가운데: 감정 표시 · 빛 터짐 · 지표 꼬리표를 띄워도 얼굴을 안 덮음
{
  const cast = await H.evaluate(() => [...document.querySelectorAll('.vn-actor')].map(a => a.dataset.role));
  for (const r of cast) await H.evaluate(([r, k]) => window.__vnHost.fx.emote(r, k), [r, ['spark', 'idea', 'sweat'][cast.indexOf(r) % 3]]);
  await H.evaluate(() => { window.__vnHost.fx.bloom(); window.__vnHost.fx.chips({ h: 2, o: 1, u: 1 }); });
  await sleep(450);
  await shot(H, 'host_mid_1366');
  await face(H, '효과 한가운데 1366');
  ok(await H.evaluate(() => document.querySelectorAll('.vn-emote').length) === cast.length && await H.$('.fx-chip'), `감정 표시 ${cast.length}개 · 지표 꼬리표가 뜸`);
  for (const [w, h] of [[1920, 1080], [1024, 768], [1280, 800], [800, 600]]) {
    await H.setViewportSize({ width: w, height: h }); await sleep(250);
    await face(H, `효과 한가운데 ${w}x${h}`);
  }
  // 낮은 창 + ⚙ 설정 판을 연 채(무대가 낮아짐): 지표 꼬리표 · 장 제목 · HUD 가 머리에 닿지 않는다
  await tap(H, '#bar [data-set="1"]');
  for (const [w, h] of [[1366, 600], [1024, 600], [800, 500], [1280, 620], [800, 420], [800, 520], [375, 560], [375, 760]]) {
    await H.setViewportSize({ width: w, height: h }); await sleep(300);
    await H.evaluate(() => window.__vnHost.fx.chips({ h: 1, u: 2 })); await sleep(250);
    await face(H, `낮은 창 + 설정 판 ${w}x${h}`);
  }
  await tap(H, '#bar [data-set="1"]');
  for (const w of [1920, 1700, 1600, 1366, 1280, 1024]) {
    await H.setViewportSize({ width: w, height: 768 }); await sleep(200);
    const r = await H.evaluate(() => { const e = document.getElementById('bEnd'); return e ? Math.round(e.getBoundingClientRect().right) : -1; });
    ok(r > 0 && r <= w, `머리띠 ${w}: 「수업 끝」이 화면 안 (${r} ≤ ${w})`);
  }
  await H.setViewportSize({ width: 1366, height: 768 });
  ok(await H.$('canvas.vn-wx'), '배경 날씨 캔버스가 있다');
}
// 끝까지: 교사가 정하기 · 다음으로 빨리 넘겨 엔딩까지
await waitFor(async () => {
  const v = await view(H);
  if (v.kind === 'lines' && v.k === 'ending') return true;
  if (['think', 'vote', 'offline-pick'].includes(v.kind)) await H.evaluate(() => window.__vnHost.api.teacherDecide(1));
  else await H.evaluate(() => window.__vnHost.api.next());
  return false;
}, { what: '엔딩 장면', every: 120, timeout: 240000 });
await H.evaluate(() => { if (window.__vnHost.auto) window.__vnHost.api.togglePause(); });
{
  await sleep(400);
  const s = await snd(H);
  ok(s.want === 'end' && s.playing === 'end', `엔딩 장면 → 엔딩 곡 (${s.want} · ${s.playing})`);
  ok(await H.$('.vn-stage.has-cg .cg-head'), '엔딩 글 칸 머리(엔딩 이름)');
  // 세 줄쯤 보여 주고 찍기(프로젝터 1920 · 크롬북 1366 · 4:3)
  for (let i = 0; i < 3; i++) { await H.evaluate(() => window.__vnHost.api.next()); await sleep(200); }
  await sleep(1400);
  for (const [w, h, nm] of [[1920, 1080, '1920'], [1366, 768, '1366'], [1024, 768, '1024']]) {
    await H.setViewportSize({ width: w, height: h }); await sleep(500);
    await shot(H, `host_ending_${nm}`);
    await face(H, `엔딩 ${nm}`);
    const r = await H.evaluate(() => {
      const box = document.querySelector('.vn-stage.has-cg .vn-box'), sc = document.querySelector('.vn-stage.has-cg .vn-scene'), cur = document.querySelector('.cg-box .vn-line.new');
      const a = box.getBoundingClientRect(), b = sc.getBoundingClientRect();
      const ov = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const cs = getComputedStyle(box), inner = a.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom);
      const olds = [...document.querySelectorAll('.cg-box .vn-line.old:not(.cut)')].map(l => parseFloat(getComputedStyle(l).fontSize));
      return { ov, fs: parseFloat(getComputedStyle(cur).fontSize), seen: cur.getBoundingClientRect().bottom <= inner + 1, oldFs: olds.length ? Math.min(...olds) : 99 };
    });
    ok(r.ov < 4, `엔딩 ${nm}: 글 칸이 그림을 덮지 않음 (${Math.round(r.ov)})`);
    ok(r.fs >= (w >= 1900 ? 32 : 20), `엔딩 ${nm}: 지금 줄 글씨 ${r.fs}px`);
    ok(r.seen, `엔딩 ${nm}: 지금 줄이 글 칸 안에 다 보임`);
    ok(r.oldFs >= 20, `엔딩 ${nm}: 지난 줄 글씨 ${r.oldFs}px(20 이상)`);
  }
  await H.setViewportSize({ width: 1366, height: 768 });
}
await waitFor(async () => { if ((await view(H)).kind === 'endcard') return true; await H.evaluate(() => window.__vnHost.api.next()); return false; }, { what: '엔딩 카드', every: 200, timeout: 60000 });
{
  await sleep(600);
  const s = await snd(H);
  ok(s.want === 'end', `엔딩 카드 → 엔딩 곡 유지 (${s.want})`);
  await face(H, '엔딩 카드');
}
// 곡을 바꿔도 엔딩에서는 엔딩 곡
await tap(H, '#bar [data-set="1"]'); await tap(H, '#setp [data-trk="m3"]'); await tap(H, '#setp [data-set="0"]');
ok((await snd(H)).want === 'end' && (await snd(H)).track === 'm3', '엔딩에서 곡 3을 골라도 엔딩 곡 · 고른 값은 저장');
// BGM 끄기 → 재생 없음
await tap(H, '#bar [data-snd="bgm"]');
ok((await snd(H)).playing === null && !(await snd(H)).bgm, 'BGM 끄면 음악이 멈춘다');
await tap(H, '#bar [data-snd="bgm"]');

// ── 2. 개인 모드 크롬북 ─────────────────────────────────────────────
const host2 = await openHost(browser, srv, { mode: 'solo', seats: 5 });
const S1 = await openStudent(browser, srv, host2.code, 2, { view: { width: 1366, height: 768 } });
const S2 = await openStudent(browser, srv, host2.code, 3, { view: { width: 375, height: 812 } });
await tap(host2.page, '#bStart');
{
  await sleep(500);
  const s = await snd(S1.page);
  ok(!s.locked && !s.bgm && !s.sfx && s.playing === null, `개인 모드: 소리 처음엔 끔 · 잠금 아님 (${JSON.stringify(s)})`);
  ok(s.motion === 'lo', `학생 기기 움직임 처음 값 = 하 (${s.motion})`);
  ok(await S1.page.$('#bar .snd [data-snd="bgm"]'), '개인 모드 머리띠에 소리 단추');
  await tap(S1.page, '#bar [data-snd="bgm"]');
  const s2 = await snd(S1.page);
  ok(s2.bgm && s2.want === 'open' && s2.playing === 'open', `개인 모드 🎵 켬 → 여는 곡 (${s2.want} · ${s2.playing})`);
  await S1.page.reload();
  await waitFor(() => S1.page.evaluate(() => window.__vnPlay && window.__vnPlay.joined && window.__vnPlay.meta), { what: '다시 들어옴' });
  ok((await snd(S1.page)).bgm, '새로 고쳐도 🎵 켬 그대로(이 기기 저장)');
}
// 장면까지 가서 화면 누르기 · 엔딩 곡
async function soloTo(page, pth, stop) {
  return page.evaluate(async ([pth, stop]) => {
    const q = x => document.querySelector(x), wait = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 4000; i++) {
      const P = window.__vnPlay, pos = P && P.solo && P.solo.pos;
      if (!pos || !P.meta || P.meta.phase !== 'play') { await wait(30); continue; }
      if (stop === 'scene' && pos.k === 'scene' && pos.id === 'S1') return pos;
      if (stop === 'ending' && pos.k === 'ending' && pos.i >= 3) return pos;
      const b = pos.k === 'gender' ? q('[data-g="f"]') : pos.k === 'name' ? q('[data-n]') : pos.k === 'choice' ? q(`[data-c="${pth[pos.id] || 1}"]`) : q('#bNext');
      if (b) b.click();
      await wait(12);
    }
    return null;
  }, [pth, stop]);
}
{
  const p = await soloTo(S1.page, ENDING_PATHS.E2, 'scene');
  ok(p && p.id === 'S1', '개인 모드 첫 장면');
  await sleep(1500);
  const a = await S1.page.evaluate(() => window.__vnPlay.solo.pos.i);
  ok((await snd(S1.page)).want === 'm1', '개인 모드 장면 → 본 곡(이 기기 고른 곡 1)');
  await S1.page.mouse.click(500, 250);   // 무대 그림 위
  await sleep(350);
  await S1.page.mouse.click(500, 250);
  await sleep(350);
  const b = await S1.page.evaluate(() => window.__vnPlay.solo.pos.i);
  ok(b > a, `개인 모드: 화면을 눌러 넘김 (줄 ${a} → ${b})`);
  await S1.page.keyboard.press('ArrowRight'); await sleep(250); await S1.page.keyboard.press('ArrowRight'); await sleep(250);
  const c = await S1.page.evaluate(() => window.__vnPlay.solo.pos);
  ok(c.i > b || c.k !== 'scene', `개인 모드: → 키로 넘김 (${b} → ${c.i})`);
  const e = await soloTo(S1.page, ENDING_PATHS.E2, 'ending');
  await sleep(1500);
  ok(e && (await snd(S1.page)).want === 'end', `개인 모드 엔딩 → 엔딩 곡 (${e && e.id})`);
  await S1.page.screenshot({ path: path.join(DIR, 'fx_solo_ending_1366.png') });
  await face(S1.page, '개인 모드 엔딩 1366');
}
{
  const e = await soloTo(S2.page, ENDING_PATHS.E6, 'ending');
  await sleep(1500);
  ok(e && e.id === 'E6', '휴대 전화 엔딩');
  await S2.page.screenshot({ path: path.join(DIR, 'fx_solo_ending_375.png') });
  await face(S2.page, '개인 모드 엔딩 375');
  const sw = await S2.page.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 376, `휴대 전화 엔딩 가로 넘침 없음 (${sw})`);
}

// ── 3. 움직이기 줄이기 ─────────────────────────────────────────────
const host3 = await openHost(browser, srv, { mode: 'class', seats: 2, speed: 2, reduce: true });
const R = host3.page;
await openStudent(browser, srv, host3.code, 1);
await R.evaluate(() => { if (window.__vnHost.auto) window.__vnHost.api.togglePause(); });
await tap(R, '#bStart');
await waitFor(async () => { const v = await view(R); if (v.kind === 'lines' && v.id === 'P') return true; if (v.kind === 'title') await R.evaluate(() => window.__vnHost.api.next()); return false; }, { what: '대사(움직이기 줄이기)' });
await waitFor(async () => { const v = await view(R); if (v.kind === 'lines' && v.id === 'S1') return true; if (['think', 'vote'].includes(v.kind)) await R.evaluate(() => window.__vnHost.api.teacherDecide(1)); else await R.evaluate(() => window.__vnHost.api.next()); return false; }, { what: 'S1 대사', every: 150, timeout: 60000 });
{
  await sleep(300);
  await R.evaluate(() => window.__vnHost.fx.shake());
  const r = await R.evaluate(() => ({ cv: document.querySelectorAll('canvas.vn-wx').length, shake: !!document.querySelector('.vn-scene.shake'), tw: !!document.querySelector('.tw-h'), busy: window.__vnHost.fx.twBusy() }));
  ok(r.cv === 0, `움직이기 줄이기: 날씨 알갱이 없음 (${r.cv})`);
  ok((await snd(R)).motion === 'off', '컴퓨터 「움직임 줄이기」 → 처음 값 끄기');
  const run = await R.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length);
  ok(run === 0, `끄기: 돌아가는 애니메이션 0 (${run})`);
  ok(!r.shake, '움직이기 줄이기: 흔들림 없음');
  ok(!r.tw && !r.busy, '움직이기 줄이기: 글자 찍기 없음(바로 다 보임)');
}

// ── 5. 움직임 단계 · 효과음 짝 · 빠르기 ─────────────────────────────
{
  const h = await openHost(browser, srv, { mode: 'class', seats: 2, speed: 2 });
  const P5 = h.page;
  const cs = await openStudent(browser, srv, h.code, 1);
  {
    const s = await snd(cs.page);
    ok(s.motion === 'lo' && s.locked && await cs.page.$('#bar .snd [data-set="1"]') && !(await cs.page.$('#bar .snd [data-snd]')), `전체 모드 크롬북: 움직임 하 · 소리 잠금 · ⚙ 만 (${s.motion})`);
  }
  await P5.evaluate(() => { if (window.__vnHost.auto) window.__vnHost.api.togglePause(); });
  await tap(P5, '#bStart');
  await waitFor(async () => { const v = await view(P5); if (v.kind === 'lines' && v.id === 'S1' && v.shown >= 2) return true; if (['think', 'vote'].includes(v.kind)) await P5.evaluate(() => window.__vnHost.api.teacherDecide(1)); else await P5.evaluate(() => window.__vnHost.api.next()); return false; }, { what: 'S1(인물 셋)', every: 150, timeout: 60000 });
  await sleep(1200);
  // 가장 무거운 날씨(비 + 물 반짝 + 햇살 + 빛망울)를 얹고 단계마다 개수 · 효과 확인
  const heavy = ['rain', 'glint', 'rays', 'bokeh'];
  const lvl = async m => { await P5.evaluate(m => window.__vnSound.set({ motion: m }), m); await P5.evaluate(k => window.__vnFx.weather(k), heavy); await sleep(700); return P5.evaluate(() => ({ ...window.__vnFx.wxStats(), lv: window.__vnFx.lv(), run: document.getAnimations().filter(a => a.playState === 'running').length })); };
  const hi = await lvl('hi');
  ok(hi.canvases === 1 && hi.parts > 50 && hi.parts <= 120, `상: 알갱이 ${hi.parts}개(≤120)`);
  // 빠르기(헤드리스 1366 · 무거운 장면): rAF 간격 2초
  const fps = await P5.evaluate(() => new Promise(res => { const t = []; let last = performance.now(); const f = n => { t.push(n - last); last = n; if (t.length < 120) requestAnimationFrame(f); else res(t); }; requestAnimationFrame(f); }));
  const avg = fps.slice(5).reduce((a, b) => a + b, 0) / (fps.length - 5);
  const st = await P5.evaluate(() => window.__vnFx.wxStats());
  console.log(`  빠르기(헤드리스 1366 · 상 · 비+반짝+햇살+빛망울 ${hi.parts}개): 화면 ${Math.round(1000 / avg)} fps · 알갱이 그리기 ${st.frameMs}ms/장`);
  ok(avg < 50, `상 무거운 장면 화면 ${Math.round(1000 / avg)} fps (20 이상)`);
  await face(P5, '상 무거운 장면');
  await P5.screenshot({ path: path.join(DIR, 'fx_heavy_hi_1366.png') });
  const mid = await lvl('mid');
  ok(mid.canvases === 1 && mid.parts > 10 && mid.parts <= 50, `중: 알갱이 ${mid.parts}개(≤50)`);
  await P5.evaluate(() => window.__vnHost.fx.shake());
  ok(!(await P5.$('.vn-scene.shake')), '중: 흔들림 없음');
  const lo = await lvl('lo');
  ok(lo.canvases === 0 && lo.parts === 0, `하: 알갱이 없음 (${lo.parts})`);
  const idle = await P5.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && /breathe|sway|kb|castdrift/.test(a.animationName || '')).length);
  ok(idle === 0, `하: 숨쉬기 · 배경 밀기 없음 (${idle})`);
  const off = await lvl('off');
  ok(off.canvases === 0 && off.run === 0, `끄기: 알갱이 0 · 돌아가는 애니메이션 0 (${off.run})`);
  ok((await P5.evaluate(() => JSON.parse(localStorage.getItem('vn.snd.host')).motion)) === 'off', '움직임 단계 저장');
  await P5.evaluate(() => window.__vnSound.set({ motion: 'hi' }));
  ok((await P5.evaluate(() => window.__vnFx.lv())) === 'hi' && (await P5.evaluate(() => document.documentElement.dataset.motion)) === 'hi', '움직임 단계는 새로 고침 없이 바로 바뀜');
  // 효과마다 짝 효과음: 켜면 그 이름이 울리고(ok), 끄면 하나도 안 울린다
  const pairs = [
    ['tech', () => window.__vnHost.fx.tech(true), ['tech', 'hum', 'water']],
    ['shake', () => window.__vnHost.fx.shake(), ['shake']],
    ['heart', () => window.__vnHost.fx.emote('A', 'heart'), ['harp']],
    ['card', () => window.__vnHost.fx.card('중2 · 12월', '눈 오는 하굣길', true), ['chapter']],
    ['tally', () => window.__vnHost.fx.tally(), ['drumroll']],
    ['count', () => window.__vnHost.fx.count(2), ['heartbeat']],
    ['ending', () => window.__vnHost.fx.ending(), ['ending', 'endSwell', 'leak']],
    ['emph', () => window.__vnHost.fx.emph({ ex: true, whisper: true }), ['pop', 'whisper']],
    ['chips', () => window.__vnHost.fx.chips({ u: 1 }), ['stat']],
  ];
  for (const on of [true, false]) {
    await P5.evaluate(v => window.__vnSound.set({ sfx: v }), on);
    for (const [nm, fn, ids] of pairs) {
      await P5.evaluate(() => { window.__vnSound.log.length = 0; });
      await P5.evaluate(fn);
      await sleep(1100);
      const log = await P5.evaluate(() => window.__vnSound.log.map(r => r.n + ':' + (r.ok ? 1 : 0)));
      if (on) ok(ids.every(id => log.includes(id + ':1')), `효과음 켬 · ${nm} → ${ids.join(' · ')} (${log.join(' ')})`);
      else ok(log.length > 0 && log.every(x => x.endsWith(':0')), `효과음 끔 · ${nm} → 울림 없음 (${log.join(' ')})`);
    }
  }
  await P5.evaluate(() => window.__vnSound.set({ sfx: true }));
  // 환경음은 효과음을 따른다
  await P5.evaluate(() => window.__vnSound.ambience('rain')); await sleep(200);
  ok((await snd(P5)).ambOn, '환경음(비) 켜짐');
  await P5.evaluate(() => window.__vnSound.set({ sfx: false })); await sleep(200);
  ok(!(await snd(P5)).ambOn, '효과음 끄면 환경음도 꺼짐');
  await P5.evaluate(() => window.__vnSound.set({ sfx: true }));
  // 움직임 한가운데(상): 감정 · ♡ · 장 제목 · 빛 · 꼬리표 · 반짝 길 — 얼굴 가림 없음
  await P5.evaluate(() => { const H = window.__vnHost; H.fx.emote('A', 'heart'); H.fx.emote('B', 'idea'); H.fx.emote('C', 'spark'); H.fx.tech(false); H.fx.chips({ h: 1, u: 2 }); H.fx.card('중1 · 3월', '손잡이 동아리 첫날', true); });
  await sleep(500);
  await P5.screenshot({ path: path.join(DIR, 'fx_mid_hi_1366.png') });
  for (const [w, hh] of [[1366, 768], [1920, 1080], [1024, 768], [800, 600]]) { await P5.setViewportSize({ width: w, height: hh }); await sleep(250); await face(P5, `움직임 한가운데 ${w}x${hh}`); }
  // 멈춤 표시 · 장 제목 띠 · 지표 꼬리표 · 지표 칸이 서로 겹치지 않는다(글자가 잘리지 않음) — 창 크기마다 다시 띄워 본다
  for (const [w, hh] of [[1366, 768], [1920, 1080], [1280, 800], [1024, 768], [800, 600], [1366, 600], [800, 500], [700, 900], [375, 760]]) {
    await P5.setViewportSize({ width: w, height: hh }); await sleep(250);
    await P5.evaluate(() => { const H = window.__vnHost; if (H.auto) H.api.togglePause(); H.fx.chips({ h: 1, o: 2, u: 2 }); H.fx.card('중1 · 3월', '손잡이 동아리 첫날', true); });
    await sleep(450);
    const o = await uiOverlap(P5);
    ok(o.n.tag === 1 && o.n.band === 1 && o.n.chip >= 1 && !o.hits.length, `겹침 없음 ${w}x${hh}: 멈춤 ${o.n.tag} · 장 제목 ${o.n.band} · 꼬리표 ${o.n.chip} · 지표 ${o.n.hud}${o.hits.length ? ' — ' + o.hits.join(' / ') : ''}`);
    if (w === 800 && hh === 500) await P5.screenshot({ path: path.join(DIR, `fx_overlap_${w}x${hh}.png`) });
    await face(P5, `겹침 시험 ${w}x${hh}`);
  }
  await P5.setViewportSize({ width: 1366, height: 768 });
  await h.ctx.close(); await cs.ctx.close();
}


// ── 4. 학생이 많은 반(45명 · 99명) ─────────────────────────────────
for (const N of [45, 99]) {
  const h = await openHost(browser, srv, { mode: 'class', seats: N });
  const in40 = await openStudent(browser, srv, h.code, N === 45 ? 40 : 99);
  await waitFor(() => h.page.evaluate(() => Object.values(window.__vnHost.players).some(p => p.on)), { what: `${N}명 반 학생 들어옴` });
  ok(true, `${N}명 반: ${N === 45 ? 40 : 99}번 들어옴`);
  if (N === 45) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pg = await ctx.newPage();
    await pg.goto(`${srv.base}/?mock=${encodeURIComponent(srv.mockURL)}&code=${h.code}`);
    await pg.waitForSelector('#iNum', { timeout: 20000 });
    await pg.evaluate(() => { document.querySelector('#iNum').value = '46'; document.querySelector('#joinF').requestSubmit(); });
    const msg = await waitFor(() => pg.evaluate(() => { const e = document.querySelector('.errbox'); return e && !e.hidden && e.textContent; }), { what: '46번 거절' });
    ok(msg.includes('1~45번') && !(await pg.evaluate(() => window.__vnPlay.joined)), `45명 반: 46번은 못 들어옴 — 「${msg}」`);
    await ctx.close();
  }
  for (const [w, hh] of [[1366, 768], [1920, 1080], [1024, 768], [375, 812]]) {
    await h.page.setViewportSize({ width: w, height: hh }); await sleep(300);
    const r = await h.page.evaluate(n => {
      const g = document.querySelectorAll('.numgrid .ng'), last = g[g.length - 1], box = document.querySelector('.lobby-r');
      last.scrollIntoView({ block: 'nearest' });
      const a = last.getBoundingClientRect(), b = box.getBoundingClientRect();
      return { n: g.length, sw: document.documentElement.scrollWidth, reach: a.bottom <= b.bottom + 1 && a.right <= b.right + 1 && a.top >= 0, start: !!document.querySelector('#bStart') && document.querySelector('#bStart').getBoundingClientRect().bottom <= innerHeight + 400 };
    }, N);
    ok(r.n === N && r.sw <= w + 1 && r.reach, `${N}명 대기실 ${w}x${hh}: 번호 칸 ${r.n}개 · 가로 넘침 없음(${r.sw}) · 마지막 칸 닿음`);
    await face(h.page, `${N}명 대기실 ${w}`);
    if (w === 1366 || w === 1024) await h.page.screenshot({ path: path.join(DIR, `fx_lobby_${N}_${w}.png`) });
  }
  await h.ctx.close(); await in40.ctx.close();
}

await browser.close(); srv.close();
console.log(`\n소리 · 넘기기 · 효과 시험: 통과 ${pass} · 실패 ${fail} · ${Math.round((Date.now() - t0) / 1000)}초`);
if (fail) { console.log('실패:\n - ' + fails.join('\n - ')); process.exit(1); }
