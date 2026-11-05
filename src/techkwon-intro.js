/**
 * TechKwon logo intro + full screen helpers for web games.
 * No dependencies (Web Animations API + CSS), no network requests. Works in plain HTML,
 * Vite/TS, React, PixiJS, Phaser... Copy this file and the logo image into the game.
 *
 *   import { playTechkwonIntro, armFullscreenOnFirstTap, createFullscreenButton } from './techkwon-intro.js';
 *   import logoUrl from './techkwon-logo.jpg'; // or 'assets/techkwon-logo.jpg' in plain HTML
 *
 *   armFullscreenOnFirstTap();                       // first tap anywhere opens full screen
 *   const intro = playTechkwonIntro({ logoUrl, ready: loadGame() });
 *   await intro;                                     // the game is visible now
 *
 * Browsers open full screen only inside a user gesture, so nothing can open it on page load.
 * Where full screen is possible the intro ends on a blinking "로고를 터치하세요"; that tap is the
 * gesture (armFullscreenOnFirstTap turns it into full screen). Where it is not possible (iPhone
 * Safari, an installed home-screen app, fullscreen: false) the intro ends by itself.
 */

const CSS = `
.tk-intro { --card: min(36vmin, 168px); position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; overflow: hidden; background: #08070c; color: #f3efff; font-family: system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.tk-intro[role='button'] { cursor: pointer; outline: none; }
.tk-intro.tk-leaving { opacity: 0; pointer-events: none; transition: opacity 0.6s ease-in-out; will-change: opacity; }
.tk-intro-glow { position: absolute; left: 50%; top: 46%; width: min(110vmin, 820px); aspect-ratio: 1; transform: translate(-50%, -50%); pointer-events: none; }
.tk-intro-glow-in { width: 100%; height: 100%; border-radius: 50%; background: radial-gradient(circle, rgba(155, 107, 255, 0.34) 0%, rgba(255, 122, 182, 0.14) 38%, rgba(8, 7, 12, 0) 68%); }
.tk-intro-center { position: relative; display: grid; justify-items: center; align-content: center; gap: 6px; }
.tk-intro-burst { position: absolute; left: 50%; top: calc(var(--card) / 2); width: 0; height: 0; }
.tk-intro-ring { position: absolute; left: calc(var(--card) * -0.62); top: calc(var(--card) * -0.62); width: calc(var(--card) * 1.24); height: calc(var(--card) * 1.24); border-radius: 50%; border: 4px solid #b48cff; opacity: 0; box-sizing: border-box; }
.tk-intro-ring.tk-two { border-width: 3px; border-color: #ff9ccf; }
.tk-intro-spark { position: absolute; left: -11px; top: -11px; width: 22px; height: 22px; opacity: 0; }
.tk-intro-card { position: relative; width: var(--card); aspect-ratio: 1; border-radius: 26px; background: #fff; box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.9), 0 0 36px rgba(155, 107, 255, 0.55); overflow: hidden; }
.tk-intro-logo { display: block; width: 100%; height: 100%; object-fit: cover; }
.tk-intro-word { margin: 16px 0 0; display: flex; gap: 0.08em; font-size: clamp(28px, 7vmin, 44px); font-weight: 900; letter-spacing: 0.02em; line-height: 1; }
.tk-intro-word span { display: inline-block; color: #d3c2ff; text-shadow: 0 0 18px rgba(155, 107, 255, 0.7); }
.tk-intro-sub { margin: 4px 0 0; padding-left: 0.5em; font-size: clamp(13px, 2.8vmin, 16px); font-weight: 700; letter-spacing: 0.5em; color: #8f86a8; }
.tk-intro-wait, .tk-intro-prompt { position: absolute; margin: 0; opacity: 0; pointer-events: none; text-align: center; }
.tk-intro-wait { bottom: max(36px, 7vh); font-size: 15px; font-weight: 700; color: #8f86a8; transition: opacity 0.3s; }
.tk-intro-wait.tk-on { opacity: 1; }
.tk-intro-prompt { bottom: max(40px, 9vh); font-size: clamp(18px, 3.8vmin, 22px); font-weight: 900; letter-spacing: 0.06em; color: #e6dcff; text-shadow: 0 0 14px rgba(155, 107, 255, 0.8); }
.tk-intro-prompt.tk-on { animation: tk-intro-blink 1.1s ease-in-out infinite; }
.tk-intro.tk-reduced .tk-intro-prompt.tk-on { animation: none; opacity: 1; }
@keyframes tk-intro-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.12; } }
@media (max-height: 420px) {
  .tk-intro { --card: min(30vmin, 150px); }
  .tk-intro-word { margin-top: 10px; }
  .tk-intro-prompt { bottom: 18px; }
}
.tk-fs-glyph { display: inline-block; width: 1.6em; height: 1.6em; vertical-align: middle; }
`;

const STAR = '<svg viewBox="0 0 24 24" width="100%" height="100%" focusable="false" aria-hidden="true"><path d="M12 0c.9 6.4 5.6 11.1 12 12-6.4.9-11.1 5.6-12 12-.9-6.4-5.6-11.1-12-12C6.4 11.1 11.1 6.4 12 0z" fill="currentColor"/></svg>';
const SPARK_COLORS = ['#b48cff', '#ffd43b', '#ff7ab6', '#5ec8ff', '#9b6bff', '#ffd43b', '#ff9ccf', '#7fd8ff'];
const BACK_OUT = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

function injectCss() {
  if (document.getElementById('tk-intro-style')) return;
  const style = document.createElement('style');
  style.id = 'tk-intro-style';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* ---------- full screen ---------- */

/** Opened from the home screen as an installed app: already full screen, nothing to ask for. */
export function isStandaloneApp() {
  try {
    return matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  } catch {
    return false;
  }
}

export function fullscreenSupported() {
  const root = document.documentElement;
  const can = typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function';
  const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true;
  return can && enabled !== false && !isStandaloneApp();
}

export function isFullscreen() {
  return Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);
}

/** Call from a tap or key handler. Fails quietly (refused, unsupported, inside a frame). */
export function enterFullscreen() {
  if (!fullscreenSupported() || isFullscreen()) return;
  const root = document.documentElement;
  try {
    const r = root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen?.();
    r?.catch?.(() => undefined);
  } catch {
    /* refused */
  }
}

export function exitFullscreen() {
  if (!isFullscreen()) return;
  try {
    const r = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen?.();
    r?.catch?.(() => undefined);
  } catch {
    /* nothing to exit */
  }
}

/** Calls fn whenever the page enters or leaves full screen (Esc, back button, buttons). */
export function onFullscreenChange(fn) {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
}

/**
 * The first tap / Enter / Space anywhere opens full screen, once per page load (a refusal is not
 * retried). Call it at startup, before the intro. Taps on links and on full screen buttons
 * (.tk-fs-btn) are left alone. `enabled` lets a settings toggle switch it off.
 */
export function armFullscreenOnFirstTap(enabled = () => true) {
  if (!fullscreenSupported()) return;
  const off = () => {
    document.removeEventListener('pointerup', onTap, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const go = (target) => {
    if (target instanceof Element && target.closest('a, .tk-fs-btn')) return;
    off();
    if (enabled() && !isFullscreen()) enterFullscreen();
  };
  const onTap = (e) => {
    if (e.button === 0) go(e.target);
  };
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') go(e.target);
  };
  document.addEventListener('pointerup', onTap, true);
  document.addEventListener('keydown', onKey, true);
}

/** Four corner brackets: pointing out = enter full screen, pointing in = back to a window. */
export function fullscreenGlyph(exit = false) {
  const span = el('span', 'tk-fs-glyph');
  span.setAttribute('aria-hidden', 'true');
  const d = exit ? 'M18 15v6h-6M30 15v6h6M18 33v-6h-6M30 33v-6h6' : 'M12 22v-6h6M36 22v-6h-6M12 26v6h6M36 26v6h-6';
  span.innerHTML = `<svg viewBox="0 0 48 48" width="100%" height="100%" focusable="false"><rect x="5" y="9" width="38" height="30" rx="7" fill="#efe7ff" stroke="#2b2a33" stroke-width="3"/><path d="${d}" fill="none" stroke="#7b4fe0" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return span;
}

/**
 * A 전체 화면 / 창 모드로 돌아가기 toggle button (icon only, name in aria-label and title).
 * Returns null where the browser has no full screen (iPhone Safari, installed app): leave it out.
 * Style it with the game's own button class: createFullscreenButton({ className: 'btn icon' }).
 */
export function createFullscreenButton({ className = '' } = {}) {
  if (!fullscreenSupported()) return null;
  injectCss();
  const b = el('button', `tk-fs-btn ${className}`.trim());
  b.type = 'button';
  const paint = () => {
    const on = isFullscreen();
    const name = on ? '창 모드로 돌아가기' : '전체 화면';
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', name);
    b.title = name;
    b.dataset.tip = name;
    b.replaceChildren(fullscreenGlyph(on));
  };
  b.addEventListener('click', () => (isFullscreen() ? exitFullscreen() : enterFullscreen()));
  onFullscreenChange(() => {
    if (b.isConnected) paint();
  });
  paint();
  return b;
}

/* ---------- intro ---------- */

function prefersReduced() {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Plays the intro over the page and resolves once it has faded out.
 *
 * @param {object} o
 * @param {string} o.logoUrl            the TechKwon logo image (bundled with the game)
 * @param {HTMLElement} [o.host]        where to put the overlay (default document.body)
 * @param {Promise<unknown>} [o.ready]  the intro waits for it before fading out (game loading)
 * @param {boolean} [o.fullscreen]      false: never ask for the tap (default true)
 * @param {boolean} [o.waitForTap]      override: end on "로고를 터치하세요" (default: when full screen is possible)
 * @param {boolean} [o.reduced]         short fade only (default: prefers-reduced-motion)
 * @param {string} [o.word]             big text under the logo (default '테크권')
 * @param {string} [o.sub]              small text (default 'presents')
 * @param {string} [o.prompt]           tap prompt (default '로고를 터치하세요')
 * @returns {Promise<void>}
 */
export function playTechkwonIntro(o) {
  injectCss();
  const host = o.host ?? document.body;
  const reduced = o.reduced ?? prefersReduced();
  const waitForTap = o.waitForTap ?? (o.fullscreen !== false && fullscreenSupported() && !isFullscreen());
  const ready = Promise.resolve(o.ready);

  const root = el('div', `tk-intro${reduced ? ' tk-reduced' : ''}`);
  root.setAttribute('role', waitForTap ? 'button' : 'img');
  root.setAttribute('aria-label', waitForTap ? '테크권 로고 · 터치하면 시작해요' : '테크권 로고');
  if (waitForTap) root.tabIndex = 0;
  const glow = el('div', 'tk-intro-glow');
  const glowIn = el('div', 'tk-intro-glow-in');
  glow.appendChild(glowIn);
  const center = el('div', 'tk-intro-center');
  const burst = el('div', 'tk-intro-burst');
  const ring = el('i', 'tk-intro-ring');
  const ring2 = el('i', 'tk-intro-ring tk-two');
  const sparks = SPARK_COLORS.map((c) => {
    const s = el('i', 'tk-intro-spark');
    s.style.color = c;
    s.innerHTML = STAR;
    return s;
  });
  burst.append(ring, ring2, ...sparks);
  const card = el('div', 'tk-intro-card');
  const logo = el('img', 'tk-intro-logo');
  logo.src = o.logoUrl;
  logo.alt = '';
  logo.draggable = false;
  card.appendChild(logo);
  const word = el('p', 'tk-intro-word');
  word.setAttribute('aria-hidden', 'true');
  const letters = Array.from(o.word ?? '테크권').map((ch) => el('span', '', ch));
  word.append(...letters);
  const sub = el('p', 'tk-intro-sub', o.sub ?? 'presents');
  const wait = el('p', 'tk-intro-wait', '불러오는 중…');
  const prompt = el('p', 'tk-intro-prompt', o.prompt ?? '로고를 터치하세요');
  center.append(burst, card, word, sub);
  root.append(glow, center, wait, prompt);
  host.appendChild(root);
  if (waitForTap) root.focus({ preventScroll: true });

  const anims = [];
  const play = (node, frames, opts) => {
    if (typeof node.animate !== 'function') return;
    anims.push(node.animate(frames, { fill: 'both', ...opts }));
  };

  let total;
  if (reduced) {
    [card, word, sub].forEach((n, i) => play(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: i * 100 }));
    total = 1300;
  } else {
    play(glowIn, [{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 1000, delay: 200, easing: EASE_OUT });
    play(card, [{ opacity: 0, transform: 'scale(0.4) rotate(-10deg)' }, { opacity: 1, transform: 'scale(1) rotate(0deg)' }], { duration: 800, delay: 350, easing: BACK_OUT });
    play(ring, [{ opacity: 0.9, transform: 'scale(0.5)' }, { opacity: 0, transform: 'scale(2.1)' }], { duration: 900, delay: 700, easing: EASE_OUT });
    play(ring2, [{ opacity: 0.7, transform: 'scale(0.5)' }, { opacity: 0, transform: 'scale(2.6)' }], { duration: 1100, delay: 820, easing: EASE_OUT });
    sparks.forEach((s, i) => {
      const a = (i / sparks.length) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.2 : 0);
      const r = 110 + (i % 3) * 26;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      const sc = 1 + (i % 2) * 0.5;
      play(s, [
        { opacity: 1, transform: 'translate(0, 0) scale(0) rotate(0deg)' },
        { opacity: 1, transform: `translate(${x}px, ${y}px) scale(${sc}) rotate(120deg)`, offset: 0.62 },
        { opacity: 0, transform: `translate(${x * 1.06}px, ${y * 1.06}px) scale(0.2) rotate(160deg)` },
      ], { duration: 1350, delay: 720, easing: 'ease-out' });
    });
    letters.forEach((l, i) => play(l, [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 450, delay: 950 + i * 70, easing: BACK_OUT }));
    play(sub, [{ opacity: 0, letterSpacing: '1.2em' }, { opacity: 1, letterSpacing: '0.5em' }], { duration: 600, delay: 1350, easing: EASE_OUT });
    play(logo, [{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }], { duration: 1200, delay: 1600, easing: 'ease-in-out' });
    total = 2900;
  }

  return new Promise((resolve) => {
    let isReady = false;
    let shown = false;
    let done = false;

    const leave = () => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      clearTimeout(timer);
      prompt.classList.remove('tk-on');
      root.classList.add('tk-leaving'); // CSS transition: runs on the compositor, stays smooth
      let gone = false;
      const end = () => {
        if (gone) return;
        gone = true;
        anims.forEach((a) => a.cancel());
        root.remove();
        resolve();
      };
      root.addEventListener('transitionend', (e) => {
        if (e.target === root && e.propertyName === 'opacity') end();
      });
      setTimeout(end, 1200);
    };
    const tryLeave = () => {
      prompt.classList.remove('tk-on');
      if (shown && isReady) leave();
      else if (shown) wait.classList.add('tk-on');
    };
    const skip = () => {
      shown = true;
      tryLeave();
    };
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') skip();
    };
    root.addEventListener('click', skip);
    document.addEventListener('keydown', onKey);

    ready.then(
      () => {
        isReady = true;
        tryLeave();
      },
      () => leave(),
    );
    const timer = setTimeout(() => {
      if (done || shown) return;
      if (waitForTap) prompt.classList.add('tk-on');
      else skip();
    }, total);
  });
}
