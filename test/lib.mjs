// 브라우저 시험 공통: Playwright 찾기 · 가짜 DB + 정적 서버 · 학생 들어가기 · 기다리기
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startMock } from './mockdb.mjs';
import { startStatic } from './serve.mjs';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : d; };

export async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const roots = [];
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  if (fs.existsSync(cache)) for (const d of fs.readdirSync(cache)) roots.push(path.join(cache, d, 'node_modules', 'playwright'));
  const found = roots.filter(p => fs.existsSync(path.join(p, 'package.json')))
    .sort((a, b) => JSON.parse(fs.readFileSync(path.join(b, 'package.json'))).version.localeCompare(JSON.parse(fs.readFileSync(path.join(a, 'package.json'))).version, undefined, { numeric: true }));
  for (const p of found) { try { return await import(pathToFileURL(path.join(p, 'index.mjs')).href); } catch {} }
  throw new Error('playwright 를 찾지 못했어요: npx playwright --version 으로 한 번 받아 두세요');
}

export async function startServers({ mockPort = 8797, webPort = 8098, latency = 0 } = {}) {
  const mock = await startMock({ port: mockPort, latency });
  const web = await startStatic({ port: webPort, root: path.join(here, '../site') });
  const base = `http://127.0.0.1:${webPort}`;
  const mockURL = `http://127.0.0.1:${mockPort}`;
  return { mock, web, base, mockURL, close() { mock.close(); web.close(); } };
}

export async function waitFor(fn, { timeout = 20000, every = 100, what = '조건' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('시간 초과: ' + what);
    await sleep(every);
  }
}

/** 진행판 열고 방 만들기 → { page, code } */
export async function openHost(browser, srv, { mode = 'class', seats = 30, pace = 'fast', speed = 4, reduce = false, view = { width: 1366, height: 768 } } = {}) {
  const ctx = await browser.newContext({ viewport: view, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(p => { try { if (!localStorage.getItem('vn.host.pref')) localStorage.setItem('vn.host.pref', JSON.stringify(p)); } catch {} }, { seats, mode, pace });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[진행판 오류]', e.message));
  page.on('dialog', d => d.accept());
  await page.goto(`${srv.base}/host.html?mock=${encodeURIComponent(srv.mockURL)}&speed=${speed}`);
  // 타이틀(「새 수업 시작」 #bNew) → 수업 설정 판(「방 만들기」 #bCreate)
  await page.waitForSelector('#bNew:not([disabled])', { timeout: 20000 });
  await page.evaluate(() => document.querySelector('#bNew').click());
  await page.waitForSelector('#bCreate:not([disabled])', { timeout: 20000 });
  await page.evaluate(() => document.querySelector('#bCreate').click());
  const code = await waitFor(() => page.evaluate(() => window.__vnHost.code), { what: '방 코드' });
  return { ctx, page, code };
}

/** 학생 기기 하나(따로 된 브라우저 맥락 = 따로 된 익명 uid) */
export async function openStudent(browser, srv, code, num, { view = { width: 1366, height: 768 } } = {}) {
  const ctx = await browser.newContext({ viewport: view });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${srv.base}/?mock=${encodeURIComponent(srv.mockURL)}&code=${code}`);
  await page.waitForSelector('#iNum', { timeout: 20000 });
  await page.evaluate(n => { document.querySelector('#iNum').value = String(n); document.querySelector('#joinF').requestSubmit(); }, num);
  await waitFor(() => page.evaluate(() => window.__vnPlay && window.__vnPlay.joined), { what: `${num}번 들어가기` });
  const uid = await page.evaluate(() => window.__vnPlay.net.uid);
  return { ctx, page, num, uid, errs };
}

/** 화면 단추 누르기(page.click 은 31쪽에서 느려서 DOM 으로 바로) */
export const tap = (page, sel) => page.evaluate(s => { const b = document.querySelector(s); if (!b || b.disabled) return false; b.click(); return true; }, sel);

export async function dump(srv, p) {
  const r = await fetch(`${srv.mockURL}/admin/dump?path=${encodeURIComponent(p)}`);
  return (await r.json()).val;
}
export async function drop(srv, uid) {
  await fetch(`${srv.mockURL}/admin/drop?uid=${encodeURIComponent(uid)}`, { method: 'POST' });
}
export async function stats(srv) { return (await fetch(`${srv.mockURL}/admin/stats`)).json(); }

/** 설치된 크롬으로(Playwright 내려받기 없이) — 없으면 Playwright 의 것 */
export async function launch(headless = true) {
  const { chromium } = await loadPlaywright();
  try { return await chromium.launch({ channel: 'chrome', headless }); }
  catch { return chromium.launch({ headless }); }
}

/**
 * 얼굴 가림 검사 — 인물 얼굴(머리) 상자와 UI 상자가 겹치면 목록으로 돌려준다(빈 배열이면 통과)
 *  - 키 비주얼: [data-faces] 요소(그림 비율 상자 · background cover + position 으로 화면 좌표로 바꿈)
 *  - 서 있는 그림: .vn-sprite 위 36%(가로 15~85%) = 머리
 *  - UI: 로고 · 메뉴 · 패널 · 대사 상자 · 이름표 · 칩 · 지표 · 투표판 · 알림 · 단추 등(꽃잎 같은 작은 장식은 뺌)
 */
export const UI_SEL = ['#bar', '.ts-col > *', '.ts-foot', '.ts-splash .logo', '.sp-press', '.vn-box', '.vn-chip', '.vn-hud', '.vn-fx',
  '.ov-vote', '.ov-title > *', '.picker', '.paused-tag', '.toast', '.vn-next', '.vn-name',
  '.petal', '.spark',     // 움직이는 꽃잎 · 반짝이도 얼굴을 지나가면 안 된다(찍는 순간마다 검사)
  // 효과(2026-10-30): 감정 표시 · ♪ · 지표 꼬리표 · 꽃가루 조각 · 반짝 터짐 · 안내 · 소리 조절 · 엔딩 머리
  '.vn-emote', '.vn-note', '.fx-chip', '.fx-conf i', '.fx-burst i', '.adv-hint', '.snd', '.cg-head',
  '.fc-band', '.fx-trail i', '#setp'];   // 장 제목 띠 · 기술 반짝 길 · ⚙ 설정 판
// 날씨 캔버스(.vn-wx)는 상자 대신 「마지막으로 그린 알갱이 상자」(canvas.__vnDrawn)로 검사하고,
// 캔버스 · 빛 터짐(.vn-bloom)은 인물 칸(.vn-cast)보다 뒤에 있어야 한다(쌓임 순서 검사)
export function faceCheck(page) {
  return page.evaluate(sel => {
    const shown = el => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    };
    const faces = [], heads = [];
    for (const el of document.querySelectorAll('[data-faces]')) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const iw = Number(el.dataset.iw), ih = Number(el.dataset.ih);
      // background-size: cover · contain · 「Wpx auto」 · 「auto Hpx」 · 「Wpx Hpx」(첫 층만)
      const bs = cs.backgroundSize.split(',')[0].trim().split(/\s+/);
      let sc = Math.max(r.width / iw, r.height / ih);
      if (bs[0] === 'contain') sc = Math.min(r.width / iw, r.height / ih);
      else if (bs[0].endsWith('px')) sc = parseFloat(bs[0]) / iw;
      else if (bs[1] && bs[1].endsWith('px')) sc = parseFloat(bs[1]) / ih;
      if (bs[0].endsWith('px') || (bs[1] && bs[1].endsWith('px'))) sc *= el.offsetWidth ? r.width / el.offsetWidth : 1;   // 숨쉬기 확대(transform) 만큼
      const dw = iw * sc, dh = ih * sc;
      const pos = cs.backgroundPosition.split(',')[0].trim().split(/\s+/);
      const off = (v, free) => v.endsWith('%') ? free * parseFloat(v) / 100 : parseFloat(v) || 0;
      const ox = off(pos[0] || '50%', r.width - dw), oy = off(pos[1] || '50%', r.height - dh);
      for (const [a, b, c, d] of JSON.parse(el.dataset.faces)) {
        const f = { x0: r.left + ox + a * dw, y0: r.top + oy + b * dh, x1: r.left + ox + c * dw, y1: r.top + oy + d * dh, who: 'kv' };
        // 화면 밖으로 잘린 부분은 뺀다(보이는 얼굴만)
        f.x0 = Math.max(f.x0, r.left); f.y0 = Math.max(f.y0, r.top); f.x1 = Math.min(f.x1, r.right); f.y1 = Math.min(f.y1, r.bottom);
        if (f.x1 > f.x0 && f.y1 > f.y0) faces.push(f);
      }
    }
    for (const el of document.querySelectorAll('.vn-sprite')) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      // object-fit: contain + 아래 맞춤 → 실제 그림 상자
      let w = r.width, h = r.height;
      if (el.naturalWidth) { const s = Math.min(r.width / el.naturalWidth, r.height / el.naturalHeight); w = el.naturalWidth * s; h = el.naturalHeight * s; }
      const x = r.left + (r.width - w) / 2, y = r.bottom - h;
      faces.push({ x0: x + w * .15, y0: y, x1: x + w * .85, y1: y + h * .36, who: el.getAttribute('alt') || 'sprite' });
      // 머리(머리카락 · 묶은 머리까지, art.py 의 data-head) — 감정 표시 · ♪ 는 이 상자도 피해야 한다
      if (el.dataset.head) {
        const [a, b, c, d] = el.dataset.head.split(',').map(Number);
        heads.push({ x0: x + a * w, y0: y + b * h, x1: x + c * w, y1: y + d * h, who: (el.getAttribute('alt') || 'sprite') + ' 머리' });
      }
    }
    const hits = [];
    for (const cv of document.querySelectorAll('canvas.vn-wx')) {
      if (!shown(cv)) continue;
      for (const r of (cv.__vnDrawn ? cv.__vnDrawn() : [])) for (const f of faces) {
        const ix = Math.min(r.right, f.x1) - Math.max(r.left, f.x0), iy = Math.min(r.bottom, f.y1) - Math.max(r.top, f.y0);
        if (ix > 3 && iy > 3) hits.push(`날씨 알갱이 ↔ ${f.who}`);
      }
    }
    for (const el of document.querySelectorAll('.vn-wx, .vn-bloom')) {
      const cast = el.parentElement && el.parentElement.querySelector(':scope > .vn-cast');
      if (!cast) continue;
      const zi = x => Number(getComputedStyle(x).zIndex) || 0;
      const behind = zi(el) < zi(cast) || (zi(el) === zi(cast) && (el.compareDocumentPosition(cast) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (!behind) hits.push(`${el.className} 가 인물 앞에 있음`);
    }
    for (const s of sel) {
      for (const el of document.querySelectorAll(s)) {
        if (!shown(el)) continue;
        if (s === '#bar' && document.body.classList.contains('at-title')) continue;
        // 화면에 실제로 그려지는 부분만: overflow 로 잘라 내는 조상(꽃잎 칸 .petals 등)의 상자와 겹친 곳
        const q = el.getBoundingClientRect(), r = { left: q.left, top: q.top, right: q.right, bottom: q.bottom };
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (acs.overflowX === 'visible' && acs.overflowY === 'visible') continue;
          const ar = a.getBoundingClientRect();
          if (acs.overflowX !== 'visible') { r.left = Math.max(r.left, ar.left); r.right = Math.min(r.right, ar.right); }
          if (acs.overflowY !== 'visible') { r.top = Math.max(r.top, ar.top); r.bottom = Math.min(r.bottom, ar.bottom); }
        }
        if (r.right - r.left <= 0 || r.bottom - r.top <= 0) continue;
        for (const f of (s === '.vn-emote' || s === '.vn-note') ? faces.concat(heads) : faces) {
          const ix = Math.min(r.right, f.x1) - Math.max(r.left, f.x0), iy = Math.min(r.bottom, f.y1) - Math.max(r.top, f.y0);
          if (ix > 3 && iy > 3) hits.push(`${s} ↔ ${f.who} (${Math.round(ix)}×${Math.round(iy)}px)`);
        }
      }
    }
    return { faces: faces.length, hits: [...new Set(hits)] };
  }, UI_SEL);
}

/**
 * UI 끼리 겹침 검사 — 「⏸ 멈춤」 표시 · 장 제목 띠 · 지표 꼬리표 · 지표(HUD) 칸. 겹친 짝 목록(빈 배열이면 통과)
 * 꼬리표끼리 · 꼬리표↔지표 · 꼬리표↔띠 · 멈춤↔띠 · 멈춤↔꼬리표
 */
export function uiOverlap(page) {
  return page.evaluate(() => {
    const shown = el => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    };
    const get = (sel, nm) => [...document.querySelectorAll(sel)].filter(shown).map((el, i) => ({ nm: `${nm}${i + 1}「${el.textContent.trim().slice(0, 12)}」`, r: el.getBoundingClientRect() }));
    const tag = get('.paused-tag', '멈춤'), band = get('.fx-card .fc-band', '장 제목'), chip = get('.fx-chip', '꼬리표'), hud = get('.vn-hud .hud-i', '지표');
    const hits = [];
    const hit = (A, B, same = false) => {
      A.forEach((a, i) => B.forEach((b, j) => {
        if (same && j <= i) return;
        const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ix > 1 && iy > 1) hits.push(`${a.nm} ↔ ${b.nm} (${Math.round(ix)}×${Math.round(iy)}px)`);
      }));
    };
    hit(chip, chip, true); hit(chip, hud); hit(chip, band); hit(tag, band); hit(tag, chip);
    return { n: { tag: tag.length, band: band.length, chip: chip.length, hud: hud.length }, hits };
  });
}
