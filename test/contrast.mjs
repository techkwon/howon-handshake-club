// 글자 대비 검사(가짜 DB) — 2026-10-30
//   node test/contrast.mjs            → 모든 화면 · 상태에서 보이는 글자마다 WCAG 대비를 잰다
//   node test/contrast.mjs --quick    → 들어가기 · 대사 화면만
// 방법: 같은 순간을 세 번 찍는다 — ① 그대로 ② 글자만 투명(그림자 · 바탕 그대로) ③ 글자 · 글자 그림자 모두 투명.
//   ①과 ②가 다른 화소 = 글자 화소. 그 자리의 실제 바탕(그림 · 그러데이션 · 덧칠까지 합친 것)을 ③(또는 번지는 그림자가
//   있으면 ②)에서 읽고, 글자 색(계산된 색 × 투명도)과 화소마다 대비를 셈 → 하위 10% 값을 그 글자의 대비로 본다.
//   기준: 보통 글자 4.5 · 큰 글자(24px 이상, 굵게 18.66px 이상) 3. 들어가기 화면 · 대사 상자는 더 엄하게 — 4.5 아래는 실패, 7 아래는 경고.
// 움직임은 「끄기」로(꽃잎 · 빛 알갱이가 섞이지 않게) + 한 번은 「상」으로(장 제목 띠 · 빛 · 글자 찍기 중간 · 낱말 반짝).
// 다크 모드: 기기 다크 모드(colorScheme dark)와 크롬 「웹 콘텐츠 자동 어둡게」(WebContentsForceDark)에서도
//   밝은 모드와 같은 화면인지(화소 차이) 확인한다. forced-colors(윈도 고대비)는 대비만 잰다.
import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright, startServers, openHost, openStudent, waitFor, sleep, here, tap, arg } from './lib.mjs';
import { ENDING_PATHS } from './paths.mjs';

const DIR = path.join(here, 'shots'); fs.mkdirSync(DIR, { recursive: true });
const QUICK = !!arg('quick', false);
const PART = arg('part', null);   // join · class · host · solo · hi · dark 중 하나만
const want = k => !PART || PART === k;
// --save 폴더 --tag before|after : 몇 화면을 그대로 찍어 둔다(고치기 전후 비교용)
const SAVE_DIR = arg('save', null), TAG = arg('tag', 'shot');
const SAVE = SAVE_DIR ? Object.fromEntries([['join(빈 칸)@1366x768', 'join_1366'], ['join(빈 칸)@375x812', 'join_375'], ['solo scene S1 #1 (E1 1366)@1366x768', 'solo_dialogue_1366'],
  ['host lines/scene S2 #2@1366x768', 'host_dialogue_1366'], ['host 엔딩 카드@1366x768', 'host_endcard_1366'], ['solo 대기실@1366x768', 'solo_lobby_1366']].map(([k, v]) => [k, `${TAG}_${v}`])) : {};
if (SAVE_DIR) fs.mkdirSync(SAVE_DIR, { recursive: true });
const { chromium } = await loadPlaywright();
const launchWith = async (args = []) => { try { return await chromium.launch({ channel: 'chrome', headless: true, args }); } catch { return chromium.launch({ headless: true, args }); } };
const browser = await launchWith();
const srv = await startServers({ mockPort: 8805, webPort: 8106 });
const ana = await (await browser.newContext()).newPage();   // 화소 셈 전용 빈 쪽

// ── 한 화면 재기 ───────────────────────────────────────────────
const STRICT = '.join, .ts-join .ts-foot, .vn-box, .vn-chip, .vn-hud, .paused-tag, .vn-next, .adv-hint, .fx-card';
const HIDE = `*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;caret-color:transparent!important}
  ::placeholder{color:transparent!important}`;
const HIDE_SH = `*,*::before,*::after{text-shadow:none!important}`;
const FREEZE = `*,*::before,*::after{animation-play-state:paused!important;transition:none!important}`;
async function addStyle(page, css) { return page.evaluate(c => { const s = document.createElement('style'); s.className = '__ct'; s.textContent = c; document.head.appendChild(s); return true; }, css); }
async function dropStyles(page) { await page.evaluate(() => document.querySelectorAll('style.__ct').forEach(s => s.remove())); }
const raf2 = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

function collect(strictSel) {
  const vw = innerWidth, vh = innerHeight, out = [];
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] == null ? 1 : p[3] }; };
  const name = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; const c = [...el.classList].filter(x => !/^(new|old|on|in|out)$/.test(x) || true).slice(0, 3); if (c.length) s += '.' + c.join('.'); return s; };
  const path = el => { const a = []; for (let e = el, i = 0; e && e !== document.body && i < 3; e = e.parentElement, i++) a.unshift(name(e)); return a.join(' > '); };
  // 지금 나타나는(사라지는) 중인 글자 — 투명도 움직임이 걸린 동안은 재지 않는다(움직임이 끝난 모습만 잰다)
  const fading = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) for (const a of e.getAnimations()) { if (a.playState === 'finished') continue; const kf = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : []; if (kf.some(k => 'opacity' in k || 'filter' in k)) return true; } return false; };
  const opac = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); o *= Number(cs.opacity); const m = cs.filter.match(/opacity\(([\d.]+)\)/); if (m) o *= Number(m[1]); } return o; };
  const els = new Map();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { if (!n.textContent.trim()) continue; const el = n.parentElement; if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(el.tagName)) continue; if (!els.has(el)) els.set(el, []); els.get(el).push(n); }
  for (const el of document.querySelectorAll('input:not([type=range]):not([type=hidden]),textarea')) if ((el.value || el.placeholder || '').trim()) els.set(el, null);
  for (const [el, nodes] of els) {
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const cs = getComputedStyle(el);
    let rects = [];
    if (nodes) for (const n of nodes) { const r = document.createRange(); r.selectNodeContents(n); rects.push(...r.getClientRects()); }
    else rects.push(el.getBoundingClientRect());
    rects = rects.map(r => ({ x0: Math.max(0, Math.floor(r.left)), y0: Math.max(0, Math.floor(r.top)), x1: Math.min(vw, Math.ceil(r.right)), y1: Math.min(vh, Math.ceil(r.bottom)) }))
      .filter(r => r.x1 - r.x0 > 2 && r.y1 - r.y0 > 2);
    if (!rects.length || fading(el)) continue;
    // 다른 칸(스플래시 등)이 통째로 덮고 있으면 안 보이는 글자 — 뺀다(눌림을 받는 덮개만 셈, pointer-events:none 장식은 화소로 이미 반영)
    const hidden = rects.every(r => { const t = document.elementFromPoint((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2); return t && t !== el && !el.contains(t) && !t.contains(el); });
    if (hidden && !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) continue;
    const isInput = !nodes, ph = isInput && !el.value;
    const fc = parse(ph ? getComputedStyle(el, '::placeholder').color : cs.webkitTextFillColor || cs.color) || parse(cs.color);
    if (!fc) continue;
    if (fc.a === 0 && /text/.test(cs.backgroundClip || cs.webkitBackgroundClip || '')) continue;   // 그러데이션 글자(로고 · 방 코드)는 글자 색이 없어 따로 본다
    const fs = parseFloat(cs.fontSize), fw = Number(cs.fontWeight) || 400;
    const blur = (cs.textShadow || 'none') === 'none' ? 0 : Math.max(0, ...[...cs.textShadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/g)].map(m => Number(m[3])));
    out.push({
      sel: path(el), text: (isInput ? (el.value || el.placeholder) : nodes.map(n => n.textContent).join('')).trim().replace(/\s+/g, ' ').slice(0, 30) + (ph ? ' (placeholder)' : ''),
      fg: fc, op: opac(el), fs, fw, large: fs >= 24 || (fs >= 18.66 && fw >= 700), strict: !!el.closest(strictSel), halo: blur >= 2, rects,
    });
  }
  return out;
}

function analyze({ A, B, C, D, items }) {
  const load = async u => { const bm = await createImageBitmap(await (await fetch(u)).blob()); const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height); };
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return Promise.all([load(A), load(B), load(C), load(D)]).then(([a, b, c, d]) => {
    const W = a.width, res = [];
    let moved = 0;
    for (let i = 0; i < a.data.length; i += 16) if (Math.abs(a.data[i] - d.data[i]) + Math.abs(a.data[i + 1] - d.data[i + 1]) + Math.abs(a.data[i + 2] - d.data[i + 2]) > 30) moved++;
    res.moved = moved / (a.data.length / 16);
    for (const it of items) {
      const rs = [], seen = new Set();
      let worst = null;
      for (const r of it.rects) for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
        const i = (y * W + x) * 4; if (seen.has(i)) continue; seen.add(i);
        const dg = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
        const st = Math.abs(a.data[i] - d.data[i]) + Math.abs(a.data[i + 1] - d.data[i + 1]) + Math.abs(a.data[i + 2] - d.data[i + 2]);
        if (dg < 60 || st > 30) continue;
        const bg = it.halo ? b : c;
        const br = bg.data[i], bgG = bg.data[i + 1], bb = bg.data[i + 2];
        const al = it.fg.a * it.op;
        const fr = al * it.fg.r + (1 - al) * br, fg2 = al * it.fg.g + (1 - al) * bgG, fb = al * it.fg.b + (1 - al) * bb;
        const l1 = L(fr, fg2, fb), l2 = L(br, bgG, bb);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        rs.push([ratio, br, bgG, bb]);
      }
      if (rs.length < 8) continue;
      rs.sort((p, q) => p[0] - q[0]);
      const p10 = rs[Math.floor(rs.length * 0.1)];
      const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
      res.push({ sel: it.sel, text: it.text, ratio: Math.round(p10[0] * 100) / 100, fg: hex(it.fg.r, it.fg.g, it.fg.b) + (it.fg.a * it.op < 0.999 ? `@${(it.fg.a * it.op).toFixed(2)}` : ''), bg: hex(p10[1], p10[2], p10[3]), large: it.large, strict: it.strict, fs: it.fs, fw: it.fw, n: rs.length });
    }
    return { res, moved: res.moved };
  });
}

const results = [];   // {screen, view, sel, text, ratio, fg, bg, need, level}
const seen = new Map();
let screens = 0;
async function audit(page, screen, tries = 0) {
  const vp = page.viewportSize(); const view = `${vp.width}x${vp.height}`;
  await page.evaluate(() => { const s = document.querySelector('.adv-hint'); }).catch(() => {});
  await addStyle(page, FREEZE); await raf2(page);
  const items = await page.evaluate(collect, STRICT);
  const shotUrl = async () => 'data:image/png;base64,' + (await page.screenshot()).toString('base64');
  const A = await shotUrl();
  await addStyle(page, HIDE); await raf2(page); const B = await shotUrl();
  await addStyle(page, HIDE_SH); await raf2(page); const C = await shotUrl();
  await dropStyles(page); await addStyle(page, FREEZE); await raf2(page); const D = await shotUrl();
  await dropStyles(page);
  const { res: r, moved } = await ana.evaluate(analyze, { A, B, C, D, items });
  // 재는 동안 화면이 바뀌었으면(장면 넘어감 · 늦게 그려짐) 조금 기다렸다 다시 — 다른 화면끼리 비교한 값은 버린다
  if (moved > 0.02 && tries < 4) { await sleep(500); return audit(page, screen, tries + 1); }
  if (moved > 0.02) console.log(`  ! ${screen}: 화면이 계속 움직여 일부만 잼 (${Math.round(moved * 100)}%)`);
  if (SAVE[screen + '@' + view] || /비상 모드 고르기/.test(screen) && SAVE_DIR) fs.writeFileSync(path.join(SAVE_DIR, (SAVE[screen + '@' + view] || `${TAG}_${screens}_${view}`) + '.png'), Buffer.from(A.split(',')[1], 'base64'));
  screens++;
  for (const x of r) {
    const need = x.large && !x.strict ? 3 : 4.5;
    const level = x.ratio < need ? 'fail' : (x.strict && x.ratio < 7 && !x.large) ? 'warn' : 'ok';
    const key = `${x.sel}|${x.text}|${view}`;
    const prev = seen.get(key);
    if (prev && prev.ratio <= x.ratio) continue;
    const row = { screen, view, ...x, need, level };
    if (prev) Object.assign(prev, row); else { seen.set(key, row); results.push(row); }
  }
  return r;
}

// ── 다크 모드 · 자동 어둡게: 밝은 모드와 같은 화면인지 ───────────────
async function sameAsLight(label, makePage) {
  const out = {};
  for (const mode of ['light', 'dark', 'forcedark']) {
    const b = mode === 'forcedark' ? await launchWith(['--enable-features=WebContentsForceDark']) : browser;
    const p = await makePage(b, mode === 'light' ? 'light' : 'dark');
    await addStyle(p, FREEZE); await raf2(p);
    out[mode] = 'data:image/png;base64,' + (await p.screenshot({ path: path.join(DIR, `contrast_${label}_${mode}.png`) })).toString('base64');
    await p.context().close(); if (b !== browser) await b.close();
  }
  return ana.evaluate(async ({ a, b, c }) => {
    const load = async u => { const bm = await createImageBitmap(await (await fetch(u)).blob()); const cv = new OffscreenCanvas(bm.width, bm.height); const x = cv.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height).data; };
    const [l, d, f] = await Promise.all([load(a), load(b), load(c)]);
    const diff = (p, q) => { let s = 0; for (let i = 0; i < p.length; i += 4) s += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]); return s / (p.length / 4) / 3; };
    return { dark: Math.round(diff(l, d) * 100) / 100, forcedark: Math.round(diff(l, f) * 100) / 100 };
  }, { a: out.light, b: out.dark, c: out.forcedark });
}

const motionInit = m => ctx => ctx.addInitScript(m => { try { for (const k of ['vn.snd.host', 'vn.snd.solo']) { const v = JSON.parse(localStorage.getItem(k) || '{}'); v.motion = m; v.bgm = false; v.sfx = false; localStorage.setItem(k, JSON.stringify(v)); } } catch {} }, m);
async function joinPage(b, { view = { width: 1366, height: 768 }, scheme = 'light', forced = 'none', code = '' } = {}) {
  const ctx = await b.newContext({ viewport: view, colorScheme: scheme, forcedColors: forced });
  await motionInit('off')(ctx);
  const p = await ctx.newPage();
  await p.goto(`${srv.base}/?mock=${encodeURIComponent(srv.mockURL)}${code ? '&code=' + code : ''}`);
  await p.waitForSelector('#iCode'); await sleep(500);
  return p;
}
async function student(b, code, num, view, motion = 'off') {
  const ctx = await b.newContext({ viewport: view });
  await motionInit(motion)(ctx);
  const page = await ctx.newPage();
  await page.goto(`${srv.base}/?mock=${encodeURIComponent(srv.mockURL)}&code=${code}`);
  await page.waitForSelector('#iNum');
  await page.evaluate(n => { document.querySelector('#iNum').value = String(n); document.querySelector('#joinF').requestSubmit(); }, num);
  await waitFor(() => page.evaluate(() => window.__vnPlay && window.__vnPlay.joined), { what: `${num}번` });
  return { ctx, page };
}
async function host(b, opts) {
  // 움직임: 「끄기」는 컴퓨터의 「움직임 줄이기」(reducedMotion)로 처음 값이 끄기가 된다 · 「상」은 진행판 기본값
  const h = await openHost(b, srv, { ...opts, reduce: opts.motion !== 'hi' });
  await h.page.evaluate(m => window.__vnSound.set({ motion: m, bgm: false, sfx: false }), opts.motion || 'off');
  return h;
}
const V1366 = { width: 1366, height: 768 }, V375 = { width: 375, height: 812 }, V1920 = { width: 1920, height: 1080 };

// ── 1. 들어가기 화면 ─────────────────────────────────────────────
let darkJoin = { dark: 0, forcedark: 0 }, darkDia = { dark: 0, forcedark: 0 };
if (want('join')) {
for (const v of [V1366, V375, V1920]) {
  const p = await joinPage(browser, { view: v });
  await audit(p, 'join(빈 칸)');
  await p.evaluate(() => { document.querySelector('#iCode').value = '1234'; document.querySelector('#iNum').value = '7'; });
  await audit(p, 'join(입력)');
  await p.evaluate(() => { document.querySelector('#iCode').value = '0000'; document.querySelector('#iNum').value = '5'; document.querySelector('#joinF').requestSubmit(); });
  await waitFor(() => p.evaluate(() => { const e = document.querySelector('.errbox'); return e && !e.hidden; }), { what: '오류 문구', timeout: 8000 }).catch(() => {});
  await audit(p, 'join(오류)');
  await p.context().close();
}
for (const v of [V1366, V375]) { const p = await joinPage(browser, { view: v, forced: 'active' }); await audit(p, 'join(forced-colors)'); await p.context().close(); }
darkJoin = await sameAsLight('join_1366', (b, scheme) => joinPage(b, { scheme }));
}

// ── 2. 진행판 + 전체 모드 학생: 장면마다 ─────────────────────────────
if (want('class')) {
const hv = await host(browser, { mode: 'class', seats: 28, speed: 1, motion: 'off' });
const H = hv.page;
const big = await student(browser, hv.code, 1, V1366), ph = await student(browser, hv.code, 2, V375);
await waitFor(() => H.evaluate(() => Object.values(window.__vnHost.players).filter(p => p.on).length >= 2), { what: '둘 다' });
await audit(H, 'host 대기실(28)'); await audit(big.page, 'class 대기실'); await audit(ph.page, 'class 대기실');
await tap(H, '#bar [data-set="1"]'); await sleep(300); await audit(H, 'host ⚙ 설정 판'); await tap(H, '#bar [data-set="1"]');
await tap(H, '#bStart');
const kind = () => H.evaluate(() => { const v = window.__vnHost.view; return { kind: v.kind, k: v.k || '', id: v.id || '', shown: v.shown || 0 }; });
const done = new Set(); let lastVote = null, paused = false;
for (let i = 0; i < 4000; i++) {
  const v = await kind();
  if (v.kind === 'endcard') break;
  const key = `${v.kind}:${v.k}:${v.id}`;
  const lineKey = v.kind === 'lines' ? `${key}:${v.shown >= 3 ? 'n' : v.shown}` : key;
  if (!done.has(lineKey) && (v.kind !== 'lines' || v.shown >= 1) && (!QUICK || v.kind === 'lines')) {
    done.add(lineKey);
    await sleep(250);
    await audit(H, `host ${v.kind}${v.k ? '/' + v.k : ''} ${v.id} #${v.shown}`);
    if (!done.has('w-' + v.kind) && ['lines', 'vote', 'tally', 'title'].includes(v.kind)) { done.add('w-' + v.kind); await H.setViewportSize(V1920); await sleep(200); await audit(H, `host ${v.kind} ${v.id} 1920`); await H.setViewportSize(V1366); await sleep(150); }
    if (v.kind === 'lines' && !paused && v.shown >= 2) { paused = true; await H.evaluate(() => window.__vnHost.api.togglePause()); await sleep(200); await audit(H, 'host ⏸ 멈춤'); await H.evaluate(() => window.__vnHost.api.togglePause()); }
    if (!done.has('s-' + v.kind) && ['lines', 'vote', 'tally', 'think', 'fx'].includes(v.kind)) { done.add('s-' + v.kind); await sleep(200); await audit(big.page, `class ${v.kind}`); await audit(ph.page, `class ${v.kind}`); }
  }
  if (v.kind === 'vote' && lastVote !== v.id) {
    lastVote = v.id;
    if (v.id === 'V1' || v.id === 'V2') {
      await waitFor(() => big.page.evaluate(() => !!document.querySelector('.vbtn:not([disabled])')), { what: '투표 단추' }).catch(() => {});
      await audit(big.page, `class vote ${v.id} (고르기 전)`);
      for (const s of [big, ph]) await s.page.evaluate(c => { const b = document.querySelector(`.vbtn[data-c="${c}"]`); if (b && !b.disabled) b.click(); }, v.id === 'V1' ? 1 : 2);
      await sleep(200); await audit(big.page, `class vote ${v.id} (고름)`); await audit(ph.page, `class vote ${v.id} (고름)`);
    } else if (v.id === 'V3') { /* 아무도 안 냄 → 🎲 */ }
    else { const c = ENDING_PATHS.E5[v.id] || 1; await H.evaluate(c => window.__vnHost.api.teacherDecide(c), c); }
  }
  if (['title', 'lines', 'think', 'fx', 'tally'].includes(v.kind)) await H.evaluate(() => window.__vnHost.api.next());
  await sleep(30);
}
await waitFor(() => H.evaluate(() => window.__vnHost.view.kind === 'endcard'), { timeout: 60000, what: '엔딩 카드' });
await sleep(300);
await audit(H, 'host 엔딩 카드'); await audit(big.page, 'class 엔딩 카드'); await audit(ph.page, 'class 엔딩 카드');
await H.setViewportSize(V1920); await sleep(200); await audit(H, 'host 엔딩 카드 1920'); await H.setViewportSize(V1366);
if (!QUICK) {
  await H.evaluate(() => window.__vnHost.api.openRefl());
  await waitFor(() => big.page.evaluate(() => !!document.querySelector('#reflF')), { what: '성찰 칸' });
  await audit(big.page, 'class 성찰 칸'); await audit(ph.page, 'class 성찰 칸');
  for (const s of [big, ph]) await s.page.evaluate(() => { const f = document.querySelector('#reflF'); f.q1.value = '냉장고는 전기가 없으면 못 쓴다.'; f.q2.value = '자전거 발전기'; f.requestSubmit(); });
  await waitFor(() => H.evaluate(() => Object.keys(window.__vnHost.refl).length >= 2), { what: '성찰 둘' });
  await sleep(300); await audit(H, 'host 성찰 벽'); await audit(big.page, 'class 성찰 보냄');
  // 같은 번호로 다른 기기 → 앞 기기 밀림
  const dup = await student(browser, hv.code, 2, V375);
  await waitFor(() => ph.page.evaluate(() => !!window.__vnPlay.kicked), { what: '밀림' }).catch(() => {});
  await sleep(300); await audit(ph.page, 'class 밀림(같은 번호)');
  await H.evaluate(() => window.__vnHost.api.closeClass());
  await sleep(800); await audit(big.page, 'class 수업 끝'); await dup.ctx.close();
}

}
// ── 3. 진행판 시작 화면 · 설정 · 기록판 · 대기실 45 · 비상 모드 ─────────
if (!QUICK && want('host')) {
  for (const v of [V1366, V1920, V375]) {
    const c = await browser.newContext({ viewport: v }); await motionInit('off')(c);
    const p = await c.newPage(); p.on('dialog', d => d.accept());
    await p.goto(`${srv.base}/host.html?mock=${encodeURIComponent(srv.mockURL)}`);
    await p.waitForSelector('#bNew:not([disabled])'); await sleep(400);
    await audit(p, 'host 스플래시');
    await p.evaluate(() => { const s = document.getElementById('tsSplash'); if (s) s.click(); }); await sleep(500);
    await audit(p, 'host 첫 화면');
    await p.evaluate(() => document.getElementById('bBoard').click()); await sleep(200); await audit(p, 'host 기록판');
    await p.evaluate(() => document.getElementById('bNew').click()); await sleep(200); await audit(p, 'host 수업 설정');
    await c.close();
  }
  const h45 = await host(browser, { mode: 'class', seats: 45, motion: 'off' });
  for (let n = 1; n <= 3; n++) await student(browser, h45.code, n, V1366);
  await sleep(600); await audit(h45.page, 'host 대기실(45)');
  await h45.page.setViewportSize(V1920); await sleep(200); await audit(h45.page, 'host 대기실(45) 1920');
  // 비상 모드
  const c = await browser.newContext({ viewport: V1366 }); await motionInit('off')(c);
  const p = await c.newPage(); p.on('dialog', d => d.accept());
  await p.goto(`${srv.base}/host.html?mock=${encodeURIComponent(srv.mockURL)}&speed=20`);
  await p.waitForSelector('#bOffline'); await p.evaluate(() => document.querySelector('#bOffline').click());
  for (let i = 0, picks = 0; i < 3000; i++) {
    const k = await p.evaluate(() => window.__vnHost.view.kind);
    if (k === 'endcard') { await audit(p, 'host 비상 모드 엔딩 카드'); break; }
    if (k === 'offline-pick') { if (picks++ < 2) await audit(p, 'host 비상 모드 고르기'); await p.evaluate(() => { const b = document.querySelector('[data-pick="1"]'); if (b) b.click(); }); }
    else await p.evaluate(() => window.__vnHost.api.next());
    await sleep(20);
  }
  await c.close();
}

// ── 4. 개인 모드: 엔딩 열 가지 + 장면마다 ─────────────────────────────
if (want('solo')) {
const hs = await host(browser, { mode: 'solo', motion: 'off' });
const list = QUICK ? [['E1', V1366], ['E6', V375]] : [['E1', V1366], ['E2', V1366], ['E3', V1366], ['E4', V1366], ['E5', V1366], ['E6', V1366], ['E7', V1366], ['E8', V1366], ['E9', V1366], ['E10', V1366], ['E6', V375], ['E10', V375], ['E1', V375], ['E3', V1920]];
const studs = [];
for (const [i, [e, v]] of list.entries()) studs.push({ e, v, s: await student(browser, hs.code, i + 1, v) });
await audit(studs[0].s.page, 'solo 대기실');
await tap(hs.page, '#bStart');
const soloSeen = new Set();
for (const [si, { e, v, s }] of studs.entries()) {
  const tag = `${e} ${v.width}`, full = si === 0 || v.width !== 1366;
  const route = ENDING_PATHS[e];
  for (let i = 0; i < 4000; i++) {
    const pos = await s.page.evaluate(() => { const P = window.__vnPlay; return P && P.solo && P.meta && P.meta.phase === 'play' ? P.solo.pos : null; });
    if (!pos) { await sleep(40); continue; }
    if (pos.k === 'done') break;
    const k = `${v.width}:${pos.k}:${pos.id}:${pos.k === 'scene' || pos.k === 'after' ? (pos.i >= 2 ? 'n' : pos.i) : ''}${pos.fx ? 'fx' : ''}`;
    const want = pos.k === 'ending' ? pos.i >= 4 && !soloSeen.has(`${tag}:end`) : full && !soloSeen.has(k);
    if (want && (!QUICK || pos.k === 'scene' || pos.k === 'ending')) {
      soloSeen.add(pos.k === 'ending' ? `${tag}:end` : k);
      await sleep(200);
      await audit(s.page, `solo ${pos.k} ${pos.id} #${pos.i} (${tag})`);
    }
    if (pos.k === 'card' && !soloSeen.has(`${tag}:card`)) { soloSeen.add(`${tag}:card`); await audit(s.page, `solo 엔딩 카드 (${tag})`); }
    await s.page.evaluate(p => {
      const q = x => document.querySelector(x);
      const b = p.k === 'gender' ? q('[data-g="f"]') : p.k === 'name' ? q('[data-n]') : p.k === 'choice' ? q(`[data-c="${p.c}"]`) : p.k === 'card' ? q('#bDone') : q('#bNext');
      if (b) b.click();
    }, { k: pos.k, c: pos.k === 'choice' ? route[pos.id] : 0 });
    await sleep(15);
  }
  if (full && !QUICK) {
    await waitFor(() => s.page.evaluate(() => !!document.querySelector('#reflF')), { what: '성찰' }).catch(() => {});
    await audit(s.page, `solo 성찰 (${tag})`);
    await s.page.evaluate(() => { const f = document.querySelector('#reflF'); if (f) { f.q2.value = '빗물 탱크'; f.requestSubmit(); } });
    await waitFor(() => s.page.evaluate(() => !!document.querySelector('.dex')), { what: '도감' }).catch(() => {});
    await sleep(200); await audit(s.page, `solo 도감 (${tag})`);
  }
}
if (!QUICK) {
  await sleep(1200); await audit(hs.page, 'host 개인 모드 진행');
  await tap(hs.page, '#bGrad'); await sleep(500); await audit(hs.page, 'host 개인 모드 통계'); await audit(studs[0].s.page, 'solo 통계');
}

}
// ── 5. 움직임 「상」: 장 제목 띠 · 빛 · 글자 찍기 중간 · 낱말 반짝 ─────────
if (want('hi')) {
  const hh = await host(browser, { mode: 'class', seats: 3, speed: 1, motion: 'hi' });
  const s1 = await student(browser, hh.code, 1, V1366, 'hi');
  await tap(hh.page, '#bStart');
  let n = 0;
  for (let i = 0; i < 400 && n < (QUICK ? 12 : 30); i++) {
    const v = await hh.page.evaluate(() => { const v = window.__vnHost.view; return { kind: v.kind, id: v.id || '' }; });
    if (v.kind === 'endcard') break;
    if (v.kind === 'vote') { await hh.page.evaluate(() => window.__vnHost.api.teacherDecide(1)); await sleep(200); continue; }
    await hh.page.evaluate(() => window.__vnHost.api.next());
    for (const t of [120, 450, 900]) { await sleep(t === 120 ? 120 : t - 120); await audit(hh.page, `상 ${v.kind} ${v.id} +${t}ms`); n++; }
  }
  await audit(s1.page, '상 class');
}

// ── 6. 다크 모드: 대사 장면도 밝은 모드와 같은지 ───────────────────────
if (want('dark')) darkDia = await sameAsLight('dialogue_1366', async (b, scheme) => {
  const c = await b.newContext({ viewport: V1366, colorScheme: scheme }); await motionInit('off')(c);
  const p = await c.newPage(); p.on('dialog', d => d.accept());
  await p.goto(`${srv.base}/host.html?mock=${encodeURIComponent(srv.mockURL)}&speed=1`);
  await p.waitForSelector('#bOffline'); await p.evaluate(() => document.querySelector('#bOffline').click());
  for (let i = 0; i < 200; i++) { const v = await p.evaluate(() => { const v = window.__vnHost.view; return v.kind + ':' + (v.k || '') + ':' + (v.shown || 0); }); if (/^lines:scene:[2-9]/.test(v)) break; await p.evaluate(() => window.__vnHost.api.next()); await sleep(80); }
  await sleep(600);
  await p.evaluate(() => document.querySelectorAll('.adv-hint,.toast').forEach(e => e.remove()));
  const k = await p.evaluate(() => !!document.querySelector('.vn-box .vn-line'));
  if (!k) throw new Error('다크 모드 비교: 대사 화면까지 못 감');
  return p;
});

await browser.close(); srv.close();
// ── 보고 ────────────────────────────────────────────────────────
const fails = results.filter(r => r.level === 'fail').sort((a, b) => a.ratio - b.ratio);
const warns = results.filter(r => r.level === 'warn').sort((a, b) => a.ratio - b.ratio);
fs.writeFileSync(path.join(DIR, 'contrast_report.json'), JSON.stringify({ screens, checked: results.length, fails, warns, darkJoin, darkDia }, null, 1));
const fmt = r => `${r.ratio.toFixed(2)} < ${r.need} | ${r.screen} @${r.view} | ${r.sel} 「${r.text}」 fg ${r.fg} bg ${r.bg}`;
console.log(`화면 ${screens}번 · 글자 ${results.length}개 · 실패 ${fails.length} · 경고(엄한 칸 7 미만) ${warns.length}`);
for (const r of fails.slice(0, 60)) console.log('  ✗ ' + fmt(r));
for (const r of warns.slice(0, 20)) console.log('  △ ' + fmt(r).replace(' < 4.5', ' < 7'));
const darkOk = darkJoin.dark < 0.5 && darkJoin.forcedark < 0.5 && darkDia.dark < 0.5 && darkDia.forcedark < 0.5;
console.log(`다크 모드 = 밝은 모드? 들어가기 평균 화소 차 dark ${darkJoin.dark} · 자동 어둡게 ${darkJoin.forcedark} / 대사 dark ${darkDia.dark} · 자동 어둡게 ${darkDia.forcedark} → ${darkOk ? '같음' : '다름'}`);
process.exit(fails.length || !darkOk ? 1 : 0);
