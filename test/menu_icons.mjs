// 타이틀 메뉴 아이콘 · 유튜브 고리 화면 확인 — node test/menu_icons.mjs [저장 폴더]
//   진행판 메뉴 · 수업 설정 · 혼자 하기 · 학생 들어가기 · PV 창을 5개 화면 크기로 찍고, 아이콘 그림이 실제로 불러와졌는지 ·
//   아이콘이 단추 밖으로 나가지 않는지 · 얼굴 가림 없는지 · 유튜브 고리가 PV_YOUTUBE_URL 과 맞게 보이는지(비면 숨김) 본다
import path from 'node:path';
import fs from 'node:fs';
import { launch, startServers, sleep, here, faceCheck } from './lib.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log('  ✗ ' + m); } };
const OUT = process.argv[2] || path.join(here, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const src = fs.readFileSync(path.join(here, '../src/pv.js'), 'utf8');
const YT = (/export const PV_YOUTUBE_URL = '([^']*)'/.exec(src) || [])[1] || '';
console.log(`PV_YOUTUBE_URL = '${YT}'`);
const VIEWS = [[1920, 1080], [1366, 768], [1280, 800], [1024, 768], [800, 600], [768, 1024], [375, 812], [320, 640]];

const browser = await launch(true);
const srv = await startServers({ mockPort: 8813, webPort: 8114 });

/** 보이는 아이콘마다: 그림을 불러왔나 · 단추(부모) 안에 있나 */
const iconCheck = page => page.evaluate(async () => {
  const out = [];
  for (const i of document.querySelectorAll('.mi-ic')) {
    const r = i.getBoundingClientRect(); if (!r.width) continue;
    const url = (getComputedStyle(i).backgroundImage.match(/url\("?(.*?)"?\)/) || [])[1];
    const loaded = url ? await new Promise(res => { const im = new Image(); im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res(false); im.src = url; }) : false;
    const p = i.parentElement.getBoundingClientRect();
    const inside = r.left >= p.left - 2 && r.right <= p.right + 2 && r.top >= p.top - 8 && r.bottom <= p.bottom + 8;
    out.push({ cls: i.className, id: i.parentElement.id || i.parentElement.className, loaded, inside, w: Math.round(r.width) });
  }
  return out;
});

async function check(page, name) {
  for (const [w, h] of VIEWS) {
    await page.setViewportSize({ width: w, height: h }); await sleep(260);
    const ic = await iconCheck(page);
    ok(ic.length > 0, `${name}@${w}x${h}: 아이콘이 보인다 (${ic.length}개)`);
    for (const x of ic) {
      ok(x.loaded, `${name}@${w}x${h}: ${x.cls} 그림 불러옴`);
      ok(x.inside, `${name}@${w}x${h}: ${x.cls} 가 단추(${x.id}) 안`);
      ok(x.w >= 20, `${name}@${w}x${h}: ${x.cls} 크기 ${x.w}px`);
    }
    const foot = await page.evaluate(() => {   // 아래 띠: 글(성적 미반영 · 엔딩 기록 · 글꼴) · 소리 · ⚙ · 전체 화면 줄이 서로 겹치지 않는다
      const els = [...document.querySelectorAll('.ts-foot > span:not(.snd-slot), .ts-foot .snd')].filter(e => e.getBoundingClientRect().width);
      const bad = [];
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push(`${els[i].className || els[i].textContent.slice(0, 8)} × ${els[j].className || els[j].textContent.slice(0, 8)}`);
      }
      const fs = document.querySelector('.ts-foot [data-fs]');
      return { bad, fsX: fs ? getComputedStyle(fs, '::after').content : 'none' };
    });
    ok(!foot.bad.length, `${name}@${w}x${h}: 아래 띠 글 · 소리 줄 겹침 없음 ${foot.bad.join(' / ')}`);
    ok(foot.fsX === 'none' || foot.fsX === 'normal', `${name}@${w}x${h}: 전체 화면 단추에 꺼짐 ✕ 없음`);
    const fc = await faceCheck(page);
    ok(!fc.hits.length, `${name}@${w}x${h}: 얼굴 가림 없음${fc.hits.length ? ' — ' + fc.hits.slice(0, 3).join(' / ') : ''}`);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(sw <= w + 1, `${name}@${w}x${h}: 가로 넘침 없음`);
    await page.screenshot({ path: path.join(OUT, `title_${name}_${w}x${h}${YT ? '_yt' : ''}.png`) });
  }
}

// 진행판 메뉴 → 수업 설정
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${srv.base}/host.html?mock=${encodeURIComponent(srv.mockURL)}&speed=4`);
  await page.waitForSelector('#bNew:not([disabled])', { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('#tsSplash'), null, { timeout: 8000 });
  ok(await page.$eval('#bNew', b => /새 수업 시작/.test(b.textContent) && !!b.querySelector('.ic-door')), '진행판: 새 수업 시작 + 문 아이콘');
  ok(await page.$eval('#bPV', b => !!b.querySelector('.ic-film') && !/▶/.test(b.textContent)), '진행판: PV 보기 + 필름 아이콘(▶ 글자 대신)');
  await check(page, 'host_menu');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.click('#bNew'); await page.waitForSelector('#bCreate:not([disabled])');
  ok(await page.$eval('#bCreate', b => !!b.querySelector('.ic-key')) && await page.$eval('#bBackMenu', b => !!b.querySelector('.ic-home')), '진행판 설정: 방 만들기 열쇠 · 처음 화면 집');
  await check(page, 'host_setup');
  ok(!errs.length, `진행판 오류 없음 ${errs.join(' / ')}`);
  await ctx.close();
}
// 혼자 하기 + PV 창
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${srv.base}/alone.html`);
  await page.waitForSelector('#bStartAlone');
  const yt = await page.$('.ts-yt');
  if (YT) {
    ok(!!yt, '혼자 하기: 유튜브 고리 보임');
    ok(yt && await yt.evaluate((a, u) => a.href === u && a.target === '_blank' && /noopener/.test(a.rel), YT), '혼자 하기: 유튜브 고리 주소 · 새 탭 · noopener');
  } else ok(!yt, '혼자 하기: 주소가 비어 있으면 유튜브 고리 없음');
  await check(page, 'alone');
  await page.setViewportSize({ width: 1366, height: 768 });
  for (const [w, h] of [[1366, 768], [800, 600], [375, 812]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.click('#bPV'); await page.waitForSelector('.pvx'); await sleep(200);
    const a = await page.$('.pvx-yt');
    if (YT) {
      ok(!!a && await a.evaluate((x, u) => x.href === u && x.target === '_blank' && /noopener/.test(x.rel), YT), `PV 창@${w}x${h}: 「YouTube에서 보기」 고리`);
      const r = await page.evaluate(() => { const b = s => document.querySelector(s).getBoundingClientRect(); const y = b('.pvx-yt'), f = b('.pvx-frame'), x = b('.pvx-x'); return y.top >= 0 && y.bottom <= innerHeight && y.right <= innerWidth && f.bottom <= innerHeight + 1 && x.top >= 0; });
      ok(r, `PV 창@${w}x${h}: 유튜브 고리 · 영상 틀 · ✕ 가 화면 안`);
      let reached = false;   // Tab 만 눌러도 유튜브 고리에 닿는다(창 안에서 돈다)
      for (let i = 0; i < 10 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('pvx-yt')); }
      ok(reached, `PV 창@${w}x${h}: Tab 으로 유튜브 고리에 닿음`);
    } else ok(!a, `PV 창@${w}x${h}: 주소가 비어 있으면 유튜브 고리 없음`);
    await page.screenshot({ path: path.join(OUT, `pv_${w}x${h}${YT ? '_yt' : ''}.png`) });
    await page.keyboard.press('Escape'); await sleep(150);
  }
  ok(!errs.length, `혼자 하기 오류 없음 ${errs.join(' / ')}`);
  await ctx.close();
}
// 학생 들어가기
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${srv.base}/?mock=${encodeURIComponent(srv.mockURL)}`);
  await page.waitForSelector('#bPV');
  ok(await page.$eval('#joinF [type=submit]', b => !!b.querySelector('.ic-door') && /들어가기/.test(b.textContent)), '학생: 들어가기 + 문 아이콘');
  await check(page, 'join');
  ok(!errs.length, `학생 오류 없음 ${errs.join(' / ')}`);
  await ctx.close();
}
await browser.close(); await srv.close();
console.log(`\n메뉴 아이콘: ${pass} 통과 · ${fail} 실패`);
if (fail) { console.log(fails.slice(0, 20).join('\n')); process.exit(1); }
