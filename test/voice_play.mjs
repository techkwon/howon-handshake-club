// 🗣 목소리 브라우저 시험 — node test/voice_play.mjs
// 진행판(전체 모드): 이야기를 시작하면 녹음(voice/*.ogg)을 받아 틀고, 말하는 동안 BGM 덕킹 · ⚙ 설정에 🗣 목소리 묶음
// 학생 크롬북(전체 모드): 녹음을 하나도 받지 않는다(잠금) · ⚙ 에 목소리 묶음 없음
// 목소리 끄면: 녹음 요청이 멈춘다
import { startServers, openHost, openStudent, waitFor, sleep, tap, loadPlaywright } from './lib.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log('  ✗ ' + m); } };
const { chromium } = await loadPlaywright();
const args = ['--autoplay-policy=no-user-gesture-required'];
let browser;
try { browser = await chromium.launch({ channel: 'chrome', headless: true, args }); } catch { browser = await chromium.launch({ headless: true, args }); }
const srv = await startServers({ mockPort: 8796, webPort: 8097 });
const host = await openHost(browser, srv, { mode: 'class', seats: 4, speed: 1 });
const H = host.page;
const hostReq = [], studReq = [];
H.on('request', r => { if (r.url().includes('/voice/')) hostReq.push(r.url()); });
const st = await openStudent(browser, srv, host.code, 1);
st.page.on('request', r => { if (r.url().includes('/voice/')) studReq.push(r.url()); });

await tap(H, '#bStart');
let ducked = false;
const t0 = Date.now();
while (Date.now() - t0 < 14000) {
  ducked = ducked || await H.evaluate(() => !!(window.__vnSound && window.__vnSound.state().ducked));
  await sleep(200);
}
ok(hostReq.length >= 2, `진행판이 녹음을 받음 (${hostReq.length}개)`);
ok(hostReq.every(u => /\/voice\/P\.L\d\.[0-9a-f]{6}\.ogg$/.test(u)), `프롤로그 녹음 이름 · 해시 (${hostReq.slice(0, 2).map(u => u.split('/').pop()).join(', ')})`);
ok(ducked, '말하는 동안 BGM 덕킹 상태가 켜짐');
ok(studReq.length === 0, `학생 크롬북(전체 모드)은 녹음을 받지 않음 (${studReq.length})`);

// ⚙ 설정 판에 🗣 목소리 · 해설 읽기
await H.evaluate(() => document.querySelector('.snd [data-set="1"]') && document.querySelector('.snd [data-set="1"]').click());
await sleep(300);
const sp = await H.evaluate(() => { const el = document.getElementById('setp'); return el ? el.textContent : ''; });
ok(/목소리/.test(sp) && /해설 읽기/.test(sp), '진행판 설정 판에 목소리 · 해설 읽기');
// 목소리 끄기 → 더 받지 않음
await H.evaluate(() => window.__vnSound.set({ voice: false }));
const n0 = hostReq.length;
await sleep(9000);
ok(hostReq.length === n0, `목소리 끔 → 녹음 요청 없음 (+${hostReq.length - n0})`);
const sps = await st.page.evaluate(() => { const b = document.querySelector('.snd [data-set="1"]'); if (b) b.click(); const el = document.getElementById('setp'); return el ? el.textContent : ''; });
ok(!/해설 읽기/.test(sps), '학생 기기(잠금) 설정 판엔 목소리 묶음 없음');

console.log(`목소리 브라우저 시험: 통과 ${pass} · 실패 ${fail}`);
await browser.close(); srv.close && srv.close();
if (fail) { console.log('실패:\n - ' + fails.join('\n - ')); process.exit(1); }
process.exit(0);
