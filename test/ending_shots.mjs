// 엔딩 그림 확인: E4~E10 엔딩 장면을 1366×768 로 찍고, E6 · E10 은 375 도 (가짜 DB)
//   node test/ending_shots.mjs  → test/shots/end_*.png
import path from 'node:path';
import fs from 'node:fs';
import { launch, startServers, openHost, openStudent, waitFor, sleep, here, tap } from './lib.mjs';
import { ENDING_PATHS } from './paths.mjs';
const DIR = path.join(here, 'shots'); fs.mkdirSync(DIR, { recursive: true });
const browser = await launch(true);
const srv = await startServers({ mockPort: 8801, webPort: 8102 });
const host = await openHost(browser, srv, { mode: 'solo' });
const list = [['E4', 1366], ['E5', 1366], ['E6', 1366], ['E7', 1366], ['E8', 1366], ['E9', 1366], ['E10', 1366], ['E6', 375], ['E10', 375], ['E1', 1366]];
const studs = [];
for (const [i, [e, w]] of list.entries()) studs.push({ e, w, s: await openStudent(browser, srv, host.code, i + 1, { view: w === 375 ? { width: 375, height: 812 } : { width: 1366, height: 768 } }) });
await tap(host.page, '#bStart');
let bad = 0;
for (const { e, w, s } of studs) {
  const r = await s.page.evaluate(async path => {
    const q = x => document.querySelector(x), wait = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 3000; i++) {
      const P = window.__vnPlay, pos = P && P.solo && P.solo.pos;
      if (!pos || !P.meta || P.meta.phase !== 'play') { await wait(30); continue; }
      if (pos.k === 'ending' && pos.i >= 4) return pos.id;
      const b = pos.k === 'gender' ? q('[data-g="m"]') : pos.k === 'name' ? q('[data-n]') : pos.k === 'choice' ? q(`[data-c="${path[pos.id]}"]`) : q('#bNext');
      if (b) b.click();
      await wait(12);
    }
    return null;
  }, ENDING_PATHS[e]);
  await sleep(600);
  const cg = await s.page.evaluate(() => { const st = document.querySelector('.vn-stage'); const bg = document.querySelector('.vn-bg'); return st && st.classList.contains('has-cg') && /img\/end\//.test(bg.style.backgroundImage); });
  if (r !== e || !cg) { bad++; console.log('✗', e, w, r, cg); }
  await s.page.screenshot({ path: path.join(DIR, `end_${e}_${w}.png`) });
}
await browser.close(); srv.close();
console.log(`엔딩 화면 ${studs.length}장 · 문제 ${bad}`);
process.exit(bad ? 1 : 0);
