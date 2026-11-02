// 혼자 하기 시험 — node test/alone.mjs
// 방 코드 · 서버 없이 끝까지 간다 · 저장되는 것은 엔딩 기록뿐 · 다시 열면 도감에 남고 진행은 처음부터 · 교실용 주소는 그대로
import path from 'node:path';
import { loadPlaywright, sleep, here, tap, faceCheck } from './lib.mjs';
import { startStatic } from './serve.mjs';
import { ENDING_PATHS } from './paths.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log('  ✗ ' + m); } };
const { chromium } = await loadPlaywright();
const args = ['--autoplay-policy=no-user-gesture-required'];
let browser;
try { browser = await chromium.launch({ channel: 'chrome', headless: true, args }); } catch { browser = await chromium.launch({ headless: true, args }); }
const web = await startStatic({ port: 8096, root: path.join(here, '../site') });
const base = 'http://127.0.0.1:8096';
const shot = (page, name) => page.screenshot({ path: path.join(here, 'shots', name) });

const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
const errs = [], outside = [], voice = [];
page.on('pageerror', e => errs.push(e.message));
page.on('dialog', d => d.accept());
page.on('request', r => {
  const u = r.url();
  if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u);
  if (u.includes('/voice/')) voice.push(u);
});
await page.goto(`${base}/alone.html`);
await page.waitForSelector('#bStartAlone', { timeout: 15000 });
ok(/0 \/ 10/.test(await page.textContent('#bDexAlone')), '처음엔 도감 0 / 10');
ok(await page.evaluate(() => !document.querySelector('#iCode')), '방 코드 칸이 없다');
await sleep(500);
await shot(page, 'alone_title_1366.png');

async function walk(pathMap, g, name) {
  await page.waitForSelector('[data-g]', { timeout: 8000 });
  for (let n = 0; n < 2500; n++) {
    const k = await page.evaluate(({ pathMap, g, name }) => {
      const pos = window.__vnPlay.solo.pos;
      const q = s => document.querySelector(s);
      if (pos.k === 'done') return 'done';
      let b = null;
      if (pos.k === 'gender') b = q(`[data-g="${g}"]`);
      else if (pos.k === 'name') b = q(`[data-n="${name}"]`);
      else if (pos.k === 'scene' || pos.k === 'after' || pos.k === 'ending') b = q('#bNext');
      else if (pos.k === 'choice') b = q(`[data-c="${pathMap[pos.id]}"]`);
      else if (pos.k === 'card') b = q('#bDone');
      if (b) b.click();
      return pos.k;
    }, { pathMap, g, name });
    if (k === 'done') return true;
    await sleep(8);
  }
  return false;
}

await tap(page, '#bStartAlone');
ok(await walk(ENDING_PATHS.E2, 'm', '한결'), '서버 없이 엔딩까지 감');
await page.waitForSelector('.dex', { timeout: 5000 });
ok(await page.evaluate(() => !document.querySelector('.refl')), '성찰 화면 없이 바로 도감');
ok(/1<\/b> \/ 10/.test(await page.innerHTML('.dex .lbl')), '도감 1 / 10');
await sleep(300);
await shot(page, 'alone_dex_1366.png');
ok(outside.length === 0, `밖으로 나간 요청 없음 (${outside.slice(0, 2).join(', ')})`);
ok(voice.length > 0, `목소리 기본 켬 — 녹음을 받음 (${voice.length}개)`);

const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => /^vn\./.test(k)).sort());
ok(!keys.some(k => k.startsWith('vn.solo.') || k.startsWith('vn.refl.') || k === 'vn.play'), `진행 · 성찰 · 방 저장 없음 (${keys.join(' ')})`);
const dex = await page.evaluate(() => localStorage.getItem('vn.alone.dex'));
ok(/"E2/.test(dex) && !/한결|"g"|run/.test(dex), `엔딩 기록에는 엔딩 칸만 (${dex})`);

// 2회차 → 다른 엔딩 → 기록이 쌓인다
await tap(page, '#bAgain');
ok(await walk(ENDING_PATHS.E9, 'f', '다온'), '다른 졸업식 찾기로 2회차');
await page.waitForSelector('.dex', { timeout: 5000 });
ok(/2<\/b> \/ 10/.test(await page.innerHTML('.dex .lbl')), '2회차 뒤 도감 2 / 10');

// 다시 열기: 기록은 남고 진행은 처음부터
await page.goto(`${base}/alone.html`);
await page.waitForSelector('#bStartAlone', { timeout: 15000 });
ok(/2 \/ 10/.test(await page.textContent('#bDexAlone')), '다시 열어도 도감 2 / 10');
await tap(page, '#bDexAlone');
await page.waitForSelector('.dex', { timeout: 5000 });
ok(await page.evaluate(() => document.querySelectorAll('.dex-c.got').length === 2), '본 엔딩 두 칸만 이름이 보임');
ok(await page.evaluate(() => !document.querySelector('#bAgain')), '메뉴로 본 도감에는 「다른 졸업식」이 없음');
await tap(page, '#bTitle');
await page.waitForSelector('#bStartAlone');
await tap(page, '#bStartAlone');
await page.waitForSelector('[data-g]');
ok(await page.evaluate(() => window.__vnPlay.solo.pos.k === 'gender'), '이야기는 처음부터');

// 진행 중 처음 화면으로 → 진행 버림 · 기록은 그대로
await page.evaluate(() => { document.querySelector('[data-g="r"]').click(); });
await page.waitForSelector('#bHome', { timeout: 5000 });
await tap(page, '#bHome');
await page.waitForSelector('#bStartAlone', { timeout: 5000 });
ok(/2 \/ 10/.test(await page.textContent('#bDexAlone')), '처음 화면으로 나와도 기록 그대로');

// 휴대 전화 크기
const c2 = await browser.newContext({ viewport: { width: 375, height: 812 } });
const p2 = await c2.newPage();
await p2.goto(`${base}/alone.html`);
await p2.waitForSelector('#bStartAlone');
await sleep(500);
await shot(p2, 'alone_title_375.png');
ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '375 가로 넘침 없음');

// 시작 화면: 여러 화면 비율에서 얼굴 가림 · 단추 잘림 없음(교사 확정 원칙)
const c4 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const p4 = await c4.newPage();
await p4.goto(`${base}/alone.html`);
await p4.waitForSelector('#bStartAlone');
for (const [w, h] of [[800, 600], [1024, 768], [1280, 800], [1280, 1024], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440], [768, 1024], [375, 812]]) {
  await p4.setViewportSize({ width: w, height: h });
  await sleep(200);
  const fc = await faceCheck(p4);
  ok(!fc.hits.length, `시작 화면 ${w}x${h}: 얼굴 가림 없음 ${fc.hits.slice(0, 2).join(' / ')}`);
  const lost = await p4.evaluate(() => ['#bStartAlone', '#bDexAlone'].filter(sel => {
    const b = document.querySelector(sel); b.scrollIntoView({ block: 'nearest' });
    const r = b.getBoundingClientRect(); return r.top < 0 || r.bottom > innerHeight + 1 || r.left < 0 || r.right > innerWidth + 1;
  }));
  ok(!lost.length, `시작 화면 ${w}x${h}: 단추 닿음 ${lost.join(' ')}`);
}

// 망가진 저장값: 빈 기록으로 시작하고 엔딩까지 간다
for (const bad of ['"broken"', '42', 'true', '[1]', 'null', '{깨짐']) {
  await page.evaluate(v => localStorage.setItem('vn.alone.dex', v), bad);
  await page.goto(`${base}/alone.html`);
  await page.waitForSelector('#bStartAlone', { timeout: 15000 });
  ok(/0 \/ 10/.test(await page.textContent('#bDexAlone')), `망가진 기록 ${bad} → 도감 0 / 10`);
}
await tap(page, '#bStartAlone');
ok(await walk(ENDING_PATHS.E2, 'm', '한결'), '망가진 기록에서도 엔딩까지 감');
await page.waitForSelector('.dex', { timeout: 5000 });
ok(/1<\/b> \/ 10/.test(await page.innerHTML('.dex .lbl')), '망가진 기록 뒤 새 기록 1 / 10');

// 교실용 주소는 그대로
const c3 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const p3 = await c3.newPage();
await p3.goto(`${base}/`);
await p3.waitForSelector('#iCode', { timeout: 15000 });
ok(await p3.evaluate(() => !window.__vnPlay.alone && !document.querySelector('#bStartAlone')), '교실용 주소는 그대로 방 코드 화면');

ok(errs.length === 0, `화면 오류 없음 (${errs.slice(0, 2).join(' / ')})`);
console.log(`혼자 하기 시험: 통과 ${pass} · 실패 ${fail}`);
await browser.close(); web.close && web.close();
if (fail) { console.log('실패:\n - ' + fails.join('\n - ')); process.exit(1); }
process.exit(0);
