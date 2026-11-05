// 테크권 로고 인트로 · 전체 화면 시험 — node test/intro.mjs [저장 폴더]
//   세 시작 화면(혼자 하기 · 학생 들어가기 · 진행판)에 인트로가 뜨고 「로고를 터치하세요」가 나온 뒤, 한 번 누르면 걷히며
//   requestFullscreen 이 꼭 한 번 간다(Element.prototype.requestFullscreen 을 감싸 셈 — 실제 전환은 시험 브라우저가 막는다) ·
//   소리 잠금 풀림(혼자 하기 · 진행판) · 포커스 되돌림 · fullscreenchange 를 흉내 내면 단추가 「창 모드로 돌아가기」로 바뀜 ·
//   ⚙ 「전체 화면으로 시작」 끄면 누름 없이 넘어감 · 움직임 끄기 = 짧은 페이드 · ?nointro=1 · PV 창 · z-index · 4개 화면 크기 배치
import path from 'node:path';
import fs from 'node:fs';
import { launch, startServers, sleep, here } from './lib.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log('  ✗ ' + m); } };
const OUT = process.argv[2] || path.join(here, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const browser = await launch(true, { intro: true });
const srv = await startServers({ mockPort: 8815, webPort: 8116 });

const FS_SPY = () => {
  window.__fsCalls = 0;
  const spy = function () { window.__fsCalls++; return Promise.resolve(); };   // 실제로 전체 화면으로 가지 않게 세기만
  Element.prototype.requestFullscreen = spy;
  if (Element.prototype.webkitRequestFullscreen) Element.prototype.webkitRequestFullscreen = spy;
};
async function open(url, { view = [1280, 800], ls = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: view[0], height: view[1] } });
  await ctx.addInitScript(FS_SPY);
  if (ls) await ctx.addInitScript(o => { for (const [k, v] of Object.entries(o)) localStorage.setItem(k, JSON.stringify(v)); }, ls);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${srv.base}/${url}`);
  return { ctx, page, errs };
}
const promptOn = page => page.waitForSelector('.tk-intro-prompt.tk-on', { timeout: 6000 }).then(() => true).catch(() => false);
const gone = (page, timeout = 4000) => page.waitForFunction(() => !document.querySelector('.tk-intro'), null, { timeout }).then(() => true).catch(() => false);

// ── 1. 혼자 하기: 나옴 · 글 · 한 번 누름 = 전체 화면 요청 한 번 · 소리 · 포커스 · 단추 바뀜 · PV · 설정 ──
{
  const { ctx, page, errs } = await open('alone.html');
  ok(!!(await page.$('.tk-intro')), '혼자 하기: 인트로가 뜬다');
  ok(await page.$eval('.tk-intro-logo', i => /brand\/techkwon-logo\.jpg$/.test(i.src)), '혼자 하기: 로고는 사이트 안 brand/techkwon-logo.jpg');
  ok(await promptOn(page), '혼자 하기: 「로고를 터치하세요」가 깜빡인다');
  ok(await page.$eval('.tk-intro', r => r.querySelector('.tk-intro-word').textContent === '테크권' && r.querySelector('.tk-intro-sub').textContent === 'presents' && r.querySelector('.tk-intro-prompt').textContent === '로고를 터치하세요'), '혼자 하기: 「테크권」 · 「presents」 · 「로고를 터치하세요」 글 그대로');
  ok(await page.evaluate(() => !!document.querySelector('#bStartAlone')), '혼자 하기: 타이틀은 인트로 아래에 이미 그려져 있다');
  ok(await page.evaluate(() => window.__fsCalls === 0), '혼자 하기: 누르기 전엔 전체 화면 요청 없음');
  await page.mouse.click(640, 400);
  ok(await gone(page), '혼자 하기: 한 번 누르면 인트로가 걷힌다');
  const n1 = await page.evaluate(() => window.__fsCalls);
  ok(n1 === 1, `혼자 하기: 전체 화면 요청 딱 한 번 (${n1})`);
  await sleep(300);
  ok(await page.evaluate(() => window.__vnSound.state().ctx) === 'running', '혼자 하기: 인트로 누름으로 소리 장치가 열림(소리 켬 기본값)');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'bStartAlone', '혼자 하기: 걷힌 뒤 포커스는 「이야기 시작」');
  await page.mouse.click(300, 700); await sleep(100);
  ok(await page.evaluate(() => window.__fsCalls) === 1, '혼자 하기: 다음 누름에서는 다시 요청하지 않음');
  const lab = () => page.$eval('.ts-foot [data-fs]', b => b.getAttribute('aria-label'));
  ok(await lab() === '전체 화면', '혼자 하기: 아래 띠에 「전체 화면」 단추');
  await page.evaluate(() => { Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.documentElement }); document.dispatchEvent(new Event('fullscreenchange')); });
  ok(await lab() === '창 모드로 돌아가기', '혼자 하기: 전체 화면이 되면 「창 모드로 돌아가기」');
  await page.evaluate(() => { delete document.fullscreenElement; document.dispatchEvent(new Event('fullscreenchange')); });
  ok(await lab() === '전체 화면', '혼자 하기: 창 모드로 나오면 다시 「전체 화면」');
  await page.click('.ts-foot [data-fs]'); await sleep(100);
  ok(await page.evaluate(() => window.__fsCalls) === 2, '혼자 하기: 「전체 화면」 단추를 누르면 요청');
  await page.click('#bPV'); await page.waitForSelector('.pvx');
  ok(await page.evaluate(() => !!document.querySelector('.pvx')), '혼자 하기: 인트로 뒤 PV 창 열림');
  await page.keyboard.press('Escape'); await sleep(200);
  ok(!(await page.$('.pvx')), '혼자 하기: PV 창 Esc 로 닫힘');
  const zmax = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('*')].map(e => Number(getComputedStyle(e).zIndex) || 0)));
  ok(zmax < 2147483000, `z-index 가 인트로(2147483000)보다 낮다 (가장 큰 값 ${zmax})`);
  // ⚙ 「전체 화면으로 시작」 끄기 → 저장
  await page.click('.ts-foot [data-set="1"]'); await page.waitForSelector('#setp [data-snd="fs"]');
  ok(await page.$eval('#setp [data-snd="fs"]', b => b.textContent.trim() === '켬'), '⚙ 설정: 「전체 화면으로 시작」 처음엔 켬');
  await page.click('#setp [data-snd="fs"]');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('vn.snd.alone')).fs === false), '⚙ 설정: 끄면 저장(fs:false)');
  ok(await page.$eval('#setp [data-snd="fs"]', b => b.textContent.trim() === '끔'), '⚙ 설정: 단추가 「끔」');
  await page.screenshot({ path: path.join(OUT, 'intro_settings_1280x800.png') });
  ok(!errs.length, `혼자 하기: 오류 없음 ${errs.slice(0, 2).join(' / ')}`);
  await ctx.close();
}

// ── 2. 설정 끔: 누름 없이 저절로 넘어감 · 요청 없음 / 저장된 다른 설정은 그대로 ──
{
  const { ctx, page } = await open('alone.html', { ls: { 'vn.snd.alone': { fs: false, bgm: false, motion: 'mid' } } });
  ok(await page.$eval('.tk-intro', r => r.getAttribute('role') === 'img'), '설정 끔: 인트로는 누르기를 기다리지 않는다(role img)');
  ok(await gone(page, 7000), '설정 끔: 저절로 걷힘');
  ok(await page.evaluate(() => window.__fsCalls === 0), '설정 끔: 전체 화면 요청 없음');
  ok(await page.evaluate(() => { const s = window.__vnSound.state(); return s.fs === false && s.bgm === false && s.motion === 'mid'; }), '설정 끔: 저장해 둔 다른 설정(음악 끔 · 움직임 중)은 그대로');
  await page.mouse.click(300, 700); await sleep(100);
  ok(await page.evaluate(() => window.__fsCalls === 0), '설정 끔: 화면을 눌러도 전체 화면 요청 없음');
  await ctx.close();
}

// ── 3. 움직임 끄기 = 짧은 페이드(tk-reduced) ──
{
  const { ctx, page } = await open('alone.html', { ls: { 'vn.snd.alone': { motion: 'off' } } });
  ok(await page.$eval('.tk-intro', r => r.classList.contains('tk-reduced')), '움직임 끄기: 짧은 페이드만(tk-reduced)');
  ok(await promptOn(page), '움직임 끄기: 「로고를 터치하세요」는 나옴');
  await page.keyboard.press('Enter');
  ok(await gone(page), '움직임 끄기: Enter 로도 넘어감');
  ok(await page.evaluate(() => window.__fsCalls) === 1, '움직임 끄기: Enter 한 번 = 전체 화면 요청 한 번');
  ok(await page.evaluate(() => window.__vnPlay.meta.phase === 'title'), '움직임 끄기: Enter 가 「이야기 시작」까지 누르지는 않음');
  await ctx.close();
}

// ── 4. ?nointro=1 ──
{
  const { ctx, page } = await open('alone.html?nointro=1');
  await page.waitForSelector('#bStartAlone'); await sleep(300);
  ok(!(await page.$('.tk-intro')), '?nointro=1: 인트로 없음');
  await ctx.close();
}

// ── 5. 학생 들어가기 · 진행판 ──
{
  const { ctx, page, errs } = await open(`?intro=1&mock=${encodeURIComponent(srv.mockURL)}`);
  ok(!!(await page.$('.tk-intro')), '학생: 인트로가 뜬다');
  ok(await promptOn(page), '학생: 「로고를 터치하세요」');
  await page.mouse.click(640, 400);
  ok(await gone(page), '학생: 한 번 누르면 걷힘');
  ok(await page.evaluate(() => window.__fsCalls) === 1, '학생: 전체 화면 요청 한 번');
  ok(await page.evaluate(() => window.__vnSound.state().locked === true && window.__vnSound.state().ctx === 'none'), '학생: 소리는 잠금 그대로(처음엔 끔)');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'iCode', '학생: 걷힌 뒤 포커스는 방 코드 칸');
  ok(!errs.length, `학생: 오류 없음 ${errs.slice(0, 2).join(' / ')}`);
  await ctx.close();
}
{
  const { ctx, page, errs } = await open(`host.html?intro=1&mock=${encodeURIComponent(srv.mockURL)}`);
  ok(!!(await page.$('.tk-intro')), '진행판: 인트로가 뜬다');
  ok(await promptOn(page), '진행판: 「로고를 터치하세요」');
  // 인트로 동안 뒤 화면은 inert — 연결이 끝나 메뉴를 다시 그려도 포커스는 인트로에 남고, Enter 는 인트로만 닫는다(Codex 2차 지적)
  await page.waitForFunction(() => !!document.querySelector('#bNew:not([disabled])'), null, { timeout: 10000 }).catch(() => {});
  ok(await page.evaluate(() => [...document.body.children].filter(x => !x.classList.contains('tk-intro') && !/SCRIPT|STYLE/.test(x.tagName)).every(x => x.inert)), '진행판: 인트로 동안 뒤 화면은 inert');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('tk-intro')), '진행판: 메뉴를 다시 그려도 포커스는 인트로');
  await page.keyboard.press('Tab');
  ok(await page.evaluate(() => !document.activeElement || !document.activeElement.closest('.ts-menu, .ts-foot')), '진행판: 인트로 동안 Tab 이 뒤 메뉴로 가지 않음');
  await page.focus('.tk-intro').catch(() => {});
  await page.keyboard.press('Enter');
  ok(await gone(page), '진행판: Enter 한 번이면 걷힘');
  await sleep(200);
  ok(!(await page.$('#bCreate')), '진행판: 그 Enter 가 뒤의 「새 수업 시작」까지 누르지 않음');
  ok(await page.evaluate(() => [...document.body.children].every(x => !x.inert)), '진행판: 걷힌 뒤 inert 풀림');
  ok(await page.evaluate(() => document.activeElement && /^(bNew|tsSplash)$/.test(document.activeElement.id)), `진행판: 걷힌 뒤 포커스는 첫 메뉴 (${await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName))})`);
  ok(await page.evaluate(() => window.__fsCalls) === 1, '진행판: 전체 화면 요청 한 번');
  await sleep(300);
  ok(await page.evaluate(() => window.__vnSound.state().ctx) === 'running', '진행판: 소리 장치 열림(진행판 소리 켬)');
  await page.waitForFunction(() => !document.querySelector('#tsSplash'), null, { timeout: 6000 }).catch(() => {});
  await page.waitForSelector('#bNew:not([disabled])');
  ok(!!(await page.$('.ts-foot [data-fs]')), '진행판: 타이틀 아래 띠에 전체 화면 단추');
  await page.screenshot({ path: path.join(OUT, 'intro_after_host_1280x800.png') });
  await page.click('#bNew'); await page.waitForSelector('#bCreate:not([disabled])'); await page.click('#bCreate');
  await page.waitForFunction(() => window.__vnHost && window.__vnHost.code, null, { timeout: 15000 });
  await sleep(300);
  ok(!!(await page.$('#bar [data-fs]')) && !(await page.$('#bFull')), '진행판: 방을 만든 뒤 머리띠에 전체 화면 단추(옛 ⛶ 단추는 없앰)');
  await page.screenshot({ path: path.join(OUT, 'intro_host_bar_1280x800.png') });
  ok(!errs.length, `진행판: 오류 없음 ${errs.slice(0, 2).join(' / ')}`);
  await ctx.close();
}

// ── 6. 화면 크기마다 인트로 배치(로고 · 글 · 「로고를 터치하세요」가 화면 안 · 겹치지 않음) ──
for (const [w, h] of [[1280, 800], [375, 740], [320, 640], [740, 360]]) {
  const { ctx, page } = await open('alone.html', { view: [w, h] });
  await promptOn(page); await sleep(400);
  const r = await page.evaluate(() => {
    const b = s => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    return { card: b('.tk-intro-card'), word: b('.tk-intro-word'), sub: b('.tk-intro-sub'), pr: b('.tk-intro-prompt'), W: innerWidth, H: innerHeight };
  });
  const inV = x => x.l >= 0 && x.t >= 0 && x.r <= r.W && x.b <= r.H;
  ok(inV(r.card) && inV(r.word) && inV(r.sub) && inV(r.pr), `${w}x${h}: 로고 · 글 · 안내가 화면 안`);
  ok(r.pr.t >= r.sub.b - 1, `${w}x${h}: 「로고를 터치하세요」가 presents 아래(겹침 없음 · 간격 ${Math.round(r.pr.t - r.sub.b)}px)`);
  await page.screenshot({ path: path.join(OUT, `intro_${w}x${h}.png`) });
  await page.mouse.click(Math.round(w / 2), Math.round(h / 2));
  ok(await gone(page), `${w}x${h}: 누르면 걷힘`);
  await sleep(200);
  await page.screenshot({ path: path.join(OUT, `intro_after_${w}x${h}.png`) });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= w + 1, `${w}x${h}: 걷힌 뒤 타이틀 가로 넘침 없음`);
  await ctx.close();
}

const man = JSON.parse(fs.readFileSync(path.join(here, '../site/manifest.webmanifest'), 'utf8'));
ok(man.display === 'fullscreen', 'manifest: display fullscreen');
await browser.close(); srv.close();
console.log(`\n테크권 인트로: ${pass} 통과 · ${fail} 실패`);
if (fail) { console.log(fails.slice(0, 30).join('\n')); process.exit(1); }
