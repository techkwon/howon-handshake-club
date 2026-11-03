// ▶ PV 영상 창 시험 — node test/video.mjs
//   세 타이틀(진행판 · 학생 들어가기 · 혼자 하기)에 「▶ PV 보기」 · 열기/닫기(✕ · Esc · 바깥) · 저절로 안 틂 · preload none · 첫 그림
//   · 재생 중 게임 소리 조용히(hushed) → 닫으면 되돌림 · 학생 기기는 처음 소리 끔 · 영상 못 불러올 때 알림(멈추지 않음)
//   · Tab 은 창 안에서만 · 뒤 화면 키 막음 · 열린 창이 여러 화면 크기에서 화면 안 · 타이틀 얼굴 가림 없음
//   진짜 영상 재생(H.264)은 크롬 채널이 있어야 한다(lib.launch 가 먼저 크롬을 쓴다)
import path from 'node:path';
import fs from 'node:fs';
import { launch, startServers, sleep, here, faceCheck, waitFor } from './lib.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log('  ✗ ' + m); } };
const DIR = path.join(here, 'shots');
const hasPV = fs.existsSync(path.join(here, '../site/video/pv.mp4'));
ok(hasPV, 'site/video/pv.mp4 가 있다');
ok(fs.existsSync(path.join(here, '../site/video/pv.jpg')), 'site/video/pv.jpg 가 있다');

const browser = await launch(true);
const srv = await startServers({ mockPort: 8811, webPort: 8112 });
const VIEWS = [[800, 600], [1024, 768], [1280, 800], [1280, 1024], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440], [768, 1024], [375, 812]];

const snd = page => page.evaluate(() => window.__vnSound.state());
const pv = page => page.evaluate(() => {
  const o = document.querySelector('.pvx'); if (!o) return null;
  const v = o.querySelector('video');
  return { paused: v.paused, t: v.currentTime, muted: v.muted, preload: v.getAttribute('preload'), poster: v.getAttribute('poster'), autoplay: v.autoplay,
    err: !o.querySelector('.pvx-err').hidden, big: !o.querySelector('.pvx-play').hidden, inside: o.contains(document.activeElement), ready: v.readyState };
});

/** 열린 창이 화면 안에 다 들어오는지(영상 틀 · ✕) + 가로 넘침 없음 */
async function fits(page, name) {
  const v0 = page.viewportSize();
  for (const [w, h] of VIEWS) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(120);
    const r = await page.evaluate(() => {
      const box = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      return { f: box('.pvx-frame'), x: box('.pvx-x'), W: innerWidth, H: innerHeight, sw: document.documentElement.scrollWidth };
    });
    const inV = b => b && b.l >= -1 && b.t >= -1 && b.r <= r.W + 1 && b.b <= r.H + 1;
    ok(inV(r.f) && inV(r.x), `${name}@${w}x${h}: 영상 틀 · ✕ 가 화면 안 (틀 ${r.f && Math.round(r.f.w)}×${r.f && Math.round(r.f.h)})`);
    ok(r.f && Math.abs(r.f.w / r.f.h - 16 / 9) < 0.02, `${name}@${w}x${h}: 16:9 틀`);
    ok(r.f && r.f.w >= Math.min(w, h * 16 / 9) * 0.6, `${name}@${w}x${h}: 영상이 충분히 큼 (${r.f && Math.round(r.f.w)}px)`);
    ok(r.sw <= w + 1, `${name}@${w}x${h}: 가로 넘침 없음`);
  }
  await page.setViewportSize(v0);
  await sleep(100);
}

/** 타이틀에 PV 단추가 있고, 여러 화면 크기에서 얼굴을 덮지 않는다 */
async function titleFaces(page, name) {
  const v0 = page.viewportSize();
  for (const [w, h] of VIEWS) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(200);
    const fc = await faceCheck(page);
    ok(!fc.hits.length, `${name}@${w}x${h}: 얼굴 가림 없음${fc.hits.length ? ' — ' + fc.hits.slice(0, 3).join(' / ') : ''}`);
    const reach = await page.evaluate(() => { const b = document.querySelector('#bPV'); if (!b) return false; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); const okk = r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1; window.scrollTo(0, 0); return okk; });
    ok(reach, `${name}@${w}x${h}: PV 단추가 화면 안(스크롤로 닿음)`);
    if (fc.hits.length) await page.screenshot({ path: path.join(DIR, `video_face_fail_${name}@${w}x${h}.png`) });
  }
  await page.setViewportSize(v0);
  await sleep(150);
}

/** 공통: 열기 → 저절로 안 틂 → ▶ → 재생 · 조용히 → 닫기(방법) → 되돌림 */
async function cycle(page, name, { muted, how = 'esc', play = true, soundCheck = true } = {}) {
  await page.click('#bPV');
  await page.waitForSelector('.pvx', { timeout: 5000 });
  await sleep(1200);
  let s = await pv(page);
  ok(s && s.paused && s.t === 0, `${name}: 열어도 저절로 틀지 않음`);
  ok(s && s.preload === 'none' && /video\/pv\.jpg$/.test(s.poster) && !s.autoplay, `${name}: preload none · 첫 그림 pv.jpg · autoplay 없음`);
  ok(s && s.big && s.inside, `${name}: 가운데 ▶ 단추 · 포커스가 창 안`);
  ok(s && s.muted === !!muted, `${name}: 처음 소리 ${muted ? '끔(학생 기기)' : '켬'}`);
  if (soundCheck) ok((await snd(page)).hushed === true, `${name}: 창이 열리면 게임 소리 조용히(hushed)`);
  if (play && hasPV) {
    await page.click('.pvx-play');
    const playing = await waitFor(async () => { const x = await pv(page); return x && !x.paused && x.t > 0.6 ? x : null; }, { timeout: 15000, what: 'PV 재생' }).catch(() => null);
    ok(!!playing, `${name}: ▶ 를 누르면 재생된다`);
    ok(playing && !playing.big && !playing.err, `${name}: 재생 중엔 가운데 ▶ 숨김 · 오류 없음`);
    if (soundCheck) { const st = await snd(page); ok(st.hushed === true, `${name}: 재생 중 게임 소리 조용히`); }
    await page.screenshot({ path: path.join(DIR, `video_${name}_playing.png`) });
  }
  // Tab 은 창 안에서만
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  ok((await pv(page)).inside, `${name}: Tab 을 눌러도 창 밖으로 안 나감`);
  await page.focus('.pvx-x'); await page.keyboard.press('Shift+Tab');
  ok(await page.evaluate(() => { const a = document.activeElement; return !!a && a.closest('.pvx') && !a.classList.contains('pvx-guard') && !a.classList.contains('pvx-x'); }), `${name}: ✕ 에서 Shift+Tab → 창 끝(영상)으로 돈다`);
  ok(await page.evaluate(() => [...document.body.children].filter(x => !x.classList.contains('pvx') && x.tagName !== 'SCRIPT').every(x => x.inert)), `${name}: 열린 동안 뒤 화면은 inert`);
  if (how === 'esc') await page.keyboard.press('Escape');
  else if (how === 'x') await page.click('.pvx-x');
  else if (how === 'outside') await page.mouse.click(4, 4);
  await sleep(250);
  ok(!(await page.$('.pvx')), `${name}: ${how === 'esc' ? 'Esc' : how === 'x' ? '✕' : '바깥 누르기'}로 닫힘`);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'bPV'), `${name}: 닫으면 「PV 보기」 단추로 포커스가 돌아옴`);
  if (soundCheck) ok((await snd(page)).hushed === false, `${name}: 닫으면 게임 소리 되돌림`);
  // 닫은 뒤 받던 영상도 멈춤(남은 video 요소 없음)
  ok(await page.evaluate(() => !document.querySelector('video')), `${name}: 닫은 뒤 영상 요소 없음`);
  ok(await page.evaluate(() => ![...document.body.children].some(x => x.inert)), `${name}: 닫으면 뒤 화면 inert 풀림`);
}

// ── 1. 진행판 타이틀 ───────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${srv.base}/host.html?mock=${encodeURIComponent(srv.mockURL)}&speed=4`);
  await page.waitForSelector('#bNew:not([disabled])', { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('#tsSplash'), null, { timeout: 8000 });
  ok(/PV 보기/.test(await page.textContent('#bPV')), '진행판: 타이틀 메뉴에 「▶ PV 보기」');
  ok(await page.evaluate(() => !document.querySelector('video')), '진행판: 처음엔 영상 요소 없음(아무것도 받지 않음)');
  await page.screenshot({ path: path.join(DIR, 'video_host_title.png') });
  await titleFaces(page, 'host_title');
  // 소리 장치 열고 음악이 나는 상태에서 시작
  await page.mouse.click(1000, 400);
  await waitFor(async () => (await snd(page)).ctx === 'running', { what: '소리 장치' }).catch(() => {});
  const s0 = await snd(page);
  ok(s0.bgm && s0.playing === 'open' && !s0.hushed, `진행판: 여는 곡이 나는 중 (${s0.playing})`);
  await cycle(page, 'host', { how: 'esc' });
  const s1 = await snd(page);
  ok(s1.playing === 'open' && s1.bgm, '진행판: 닫은 뒤에도 여는 곡 그대로');
  // 열린 창 크기 + 바깥 누르기 · ✕
  await page.click('#bPV'); await page.waitForSelector('.pvx');
  await fits(page, 'host_open');
  await page.screenshot({ path: path.join(DIR, 'video_host_open_1366.png') });
  // 뒤 화면 키는 막힘: 창 열린 채 → 를 눌러도 아무 일 없음 · 창 그대로
  await page.keyboard.press('ArrowDown');
  ok(!!(await page.$('.pvx')), '진행판: 창이 열린 동안 메뉴 화살표 키는 뒤 화면으로 안 감');
  await page.mouse.click(4, 4); await sleep(250);
  ok(!(await page.$('.pvx')), '진행판: 바깥(어두운 곳) 누르면 닫힘');
  ok(!(await snd(page)).hushed, '진행판: 바깥으로 닫아도 소리 되돌림');
  await cycle(page, 'host_x', { how: 'x', play: false });
  // 영상 안을 누르면 닫히지 않는다
  await page.click('#bPV'); await page.waitForSelector('.pvx');
  const fr = await page.$eval('.pvx-head b', e => { const r = e.getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 }; });
  await page.mouse.click(fr.x, fr.y); await sleep(200);
  ok(!!(await page.$('.pvx')), '진행판: 창 안(제목 줄)을 누르면 닫히지 않음');
  await page.keyboard.press('Escape'); await sleep(200);
  // 수업 설정 · 방 만들기는 그대로 된다
  await page.click('#bNew'); await page.waitForSelector('#bCreate:not([disabled])');
  ok(!(await page.$('#bPV')), '진행판: 수업 설정 판에는 PV 단추 없음(메뉴에만)');
  await page.click('#bCreate');
  ok(!!(await waitFor(() => page.evaluate(() => window.__vnHost.code), { what: '방 코드' }).catch(() => null)), '진행판: PV 뒤에도 방 만들기 그대로');
  ok(!errs.length, `진행판: 오류 없음 ${errs.slice(0, 2).join(' / ')}`);
  await ctx.close();
}

// ── 2. 실패: 영상을 못 불러오면 알림 · 멈추지 않음 ──────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.route('**/video/pv.mp4', r => r.fulfill({ status: 404, body: 'no' }));
  await page.goto(`${srv.base}/alone.html`);
  await page.waitForSelector('#bPV');
  await page.click('#bPV'); await page.waitForSelector('.pvx');
  await page.click('.pvx-play');
  const e = await waitFor(async () => { const x = await pv(page); return x && x.err ? x : null; }, { timeout: 8000, what: '실패 알림' }).catch(() => null);
  ok(!!e, '실패: 영상이 없으면 창 안에 「불러오지 못했어요」');
  ok(e && !e.big, '실패: 가운데 ▶ 는 숨김');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('pvx-x')), '실패: 포커스는 ✕ 로(숨긴 ▶ 에 남지 않음)');
  for (const [w, h] of [[800, 600], [1366, 768], [768, 1024], [375, 812]]) {
    await page.setViewportSize({ width: w, height: h }); await sleep(120);
    const r = await page.evaluate(() => { const b = q => document.querySelector(q).getBoundingClientRect(); const e = b('.pvx-err'), x = b('.pvx-x'); return [e.top, e.bottom, x.top, x.bottom, innerHeight]; });
    ok(r[0] >= 0 && r[1] <= r[4] && r[2] >= 0 && r[3] <= r[4], `실패@${w}x${h}: 알림 · ✕ 가 화면 안`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: path.join(DIR, 'video_fail.png') });
  await page.click('.pvx-x'); await sleep(200);
  ok(!(await page.$('.pvx')) && !(await snd(page)).hushed, '실패: ✕ 로 닫히고 소리 되돌림');
  await page.click('#bStartAlone');
  ok(!!(await page.waitForSelector('[data-g]', { timeout: 5000 }).catch(() => null)), '실패 뒤에도 이야기 시작 그대로');
  await ctx.close();
}

// ── 3. 혼자 하기 타이틀 ───────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', x => errs.push(x.message));
  const voice = []; page.on('request', r => { if (r.url().includes('/voice/')) voice.push(r.url()); });
  await page.goto(`${srv.base}/alone.html`);
  await page.waitForSelector('#bPV');
  ok(/PV 보기/.test(await page.textContent('#bPV')), '혼자 하기: 타이틀 메뉴에 「▶ PV 보기」');
  await page.screenshot({ path: path.join(DIR, 'video_alone_title.png') });
  await titleFaces(page, 'alone_title');
  await page.mouse.click(1000, 400);
  await waitFor(async () => (await snd(page)).playing === 'open', { what: '여는 곡' }).catch(() => {});
  await cycle(page, 'alone', { how: 'outside' });
  ok((await snd(page)).playing === 'open', '혼자 하기: 닫은 뒤 여는 곡 그대로');
  ok(voice.length === 0, '혼자 하기: PV 동안 목소리 녹음 안 받음');
  // 창이 열린 동안 스페이스 · Enter 는 뒤 화면(이야기 시작)으로 안 간다
  await page.click('#bPV'); await page.waitForSelector('.pvx');
  await page.focus('.pvx-x'); await page.keyboard.press('Space'); await sleep(200);
  ok(!(await page.$('.pvx')) && await page.evaluate(() => window.__vnPlay.meta.phase === 'title'), '혼자 하기: ✕ 에서 스페이스 = 닫기만(이야기 시작 안 함)');
  await page.click('#bStartAlone');
  ok(!!(await page.waitForSelector('[data-g]', { timeout: 5000 }).catch(() => null)), '혼자 하기: PV 뒤 이야기 시작 그대로');
  ok(!errs.length, `혼자 하기: 오류 없음 ${errs.slice(0, 2).join(' / ')}`);
  await ctx.close();
}

// ── 4. 학생 들어가기 ──────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', x => errs.push(x.message));
  await page.goto(`${srv.base}/?mock=${encodeURIComponent(srv.mockURL)}`);
  await page.waitForSelector('#bPV');
  ok(/PV 보기/.test(await page.textContent('#bPV')), '학생: 들어가기 화면에 「▶ PV 보기」');
  ok(await page.$eval('#bPV', b => b.type === 'button' && !b.closest('form')), '학생: PV 단추는 들어가기 양식 밖(누른다고 들어가지 않음)');
  await page.screenshot({ path: path.join(DIR, 'video_join.png') });
  await titleFaces(page, 'join');
  ok((await snd(page)).locked === true, '학생: 들어가기 전 게임 소리는 잠금 그대로');
  await cycle(page, 'join', { muted: true, how: 'esc', soundCheck: false });
  ok((await snd(page)).locked === true && !(await snd(page)).hushed, '학생: 닫은 뒤 잠금 그대로 · hushed 풀림');
  // PV 를 본 뒤에도 들어가기 칸 · 단추 그대로
  ok(await page.$eval('#iCode', e => !!e && !e.disabled), '학생: 닫은 뒤 방 코드 칸 그대로');
  ok(!errs.length, `학생: 오류 없음 ${errs.slice(0, 2).join(' / ')}`);
  await ctx.close();
}

// ── 5. 휴대 전화 크기 학생 화면 ───────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto(`${srv.base}/?mock=${encodeURIComponent(srv.mockURL)}`);
  await page.waitForSelector('#bPV');
  await page.$eval('#bPV', b => b.scrollIntoView());
  await page.click('#bPV'); await page.waitForSelector('.pvx');
  await page.screenshot({ path: path.join(DIR, 'video_join_open_375.png') });
  await fits(page, 'join_open');
  await page.keyboard.press('Escape');
  await ctx.close();
}

await browser.close(); srv.close();
console.log(`\nPV 영상 창: ${pass} 통과 · ${fail} 실패`);
if (fail) { console.log(fails.join('\n')); process.exit(1); }
