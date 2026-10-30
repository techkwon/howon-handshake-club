// 무대 그리기 — 배경 · 서 있는 그림 · 대사 상자(말하는 사람 얼굴 + 이름). 진행판(전체 모드)과 크롬북(개인 모드)이 같이 쓴다.
// 그림이 없으면 자리 그림(색 그라데이션 · 실루엣 · 이름 첫 글자)을 쓴다.
import ART from './art-manifest.json';
import { CHARS, roleChar, SHOWN, CARDS } from './story.js';
import { esc } from './shared.js';

// 배경 자리 그림: [위 색, 아래 색, 그림 글자, 이름]
const BG_PH = {
  field: ['#fde2e4', '#e8f3d6', '🌸', '학교 운동장'], club: ['#f3ead8', '#e4d7bd', '🔧', '동아리실'],
  call: ['#e3eef8', '#cfe0ee', '💻', '화상 통화'], fest: ['#fff1d6', '#f6d7b0', '🎪', '축제 부스'],
  well: ['#ffe9c7', '#e8b98a', '🪣', '루미타 우물 길'], market: ['#fde5c4', '#e7b07a', '🧺', '루미타 장터'],
  forge: ['#f2ddcc', '#c99a7a', '⚒️', '테누네 대장간'], roof: ['#dfeef5', '#c9b79c', '🌧️', '지붕과 빗물 탱크'],
  night: ['#2d3557', '#4b4f7a', '🌙', '밤의 루미타'], snow: ['#eef3f8', '#d9e3ec', '❄️', '눈 오는 하굣길'],
  hall: ['#f6eddc', '#e2cfae', '🎓', '강당'], garden: ['#e9f4dc', '#c8deaa', '🌱', '학교 텃밭'],
};

export function bgStyle(id, cg) {
  const src = (cg && ART.end && ART.end[cg]) || (ART.bg && ART.bg[id]);
  if (src) return `background-image:url('${src}')`;
  const [a, b] = BG_PH[id] || ['#f3efe6', '#e2dccd'];
  return `background-image:linear-gradient(180deg, ${a}, ${b})`;
}
export function bgMotif(id, cg) {
  if ((cg && ART.end && ART.end[cg]) || (ART.bg && ART.bg[id])) return '';
  const p = BG_PH[id];
  return p ? `<div class="vn-motif" aria-hidden="true">${p[2]}</div><div class="vn-bgname">${esc(p[3])}</div>` : '';
}
export function hasArt(kind, id) { return !!(ART[kind] && ART[kind][id]); }
export function cgKey(ending, g) {
  if (!ART.end) return null;
  if (ART.end[ending + g]) return ending + g;
  if (ART.end[ending]) return ending;
  return null;
}

/** 서 있는 그림 HTML (없으면 실루엣) */
export function spriteHTML(charId, cls = '') {
  const c = CHARS[charId];
  const a = ART.chars && ART.chars[charId];
  if (a && a.sprite) return `<img class="vn-sprite ${cls}" src="${a.sprite.src}" alt="${esc(c.name)}" width="${a.sprite.w}" height="${a.sprite.h}" draggable="false">`;
  const col = c ? c.color : '#b0aea5';
  return `<svg class="vn-sprite ph ${cls}" viewBox="0 0 120 300" role="img" aria-label="${esc(c ? c.name : '')}">
    <circle cx="60" cy="58" r="40" fill="${col}" opacity=".85"/><rect x="22" y="104" width="76" height="150" rx="34" fill="${col}" opacity=".7"/>
    <rect x="34" y="240" width="20" height="56" rx="8" fill="${col}" opacity=".6"/><rect x="66" y="240" width="20" height="56" rx="8" fill="${col}" opacity=".6"/>
    <text x="60" y="72" text-anchor="middle" font-size="38" font-weight="800" fill="#141413">${esc(c ? c.name[0] : '?')}</text></svg>`;
}

/** 표정 얼굴(동그라미). face 번호가 없으면 마지막 것 */
export function faceHTML(charId, face = 0, cls = '') {
  const c = CHARS[charId];
  if (!c) return '';
  const a = ART.chars && ART.chars[charId];
  if (a && a.faces && a.faces.length) {
    const src = a.faces[Math.min(face, a.faces.length - 1)];
    return `<img class="vn-face ${cls}" src="${src}" alt="" width="160" height="160" draggable="false">`;
  }
  return `<span class="vn-face ph ${cls}" style="--fc:${c.color}" aria-hidden="true">${esc(c.name[0])}</span>`;
}

/**
 * 무대 전체 HTML
 * o: { bg, tint, cg, cast:[role], speaker(role), run, chip, hud(stats|null), boxHTML, notes(♪ 붙일 역할 목록) }
 */
export function stageHTML(o) {
  const run = o.run || {};
  const cast = (o.cast || []).map(r => [r, roleChar(r, run)]).filter(([, id]) => id);
  const roles = cast.map(([r]) => r);
  const sp = o.speaker && roles.includes(o.speaker) ? o.speaker : null;
  const showCast = !(o.cg && ART.end && ART.end[o.cg]);
  return `
  <div class="vn-stage ${o.tint ? 'tint-' + o.tint : ''} ${o.cls || ''} ${showCast ? '' : 'has-cg'}">
    <div class="vn-scene">
      <div class="vn-bg" style="${bgStyle(o.bg, o.cg)}">${bgMotif(o.bg, o.cg)}</div>
      ${showCast && cast.length ? `<div class="vn-cast n${cast.length}">${cast.map(([r, id]) => `
        <div class="vn-actor ${sp && sp !== r ? 'dim' : ''} ${sp === r ? 'speak' : ''}" data-role="${r}">
          ${spriteHTML(id)}${(o.notes || []).includes(r) ? '<span class="vn-note" aria-label="호감이 올랐어요">♪</span>' : ''}
        </div>`).join('')}</div>` : ''}
      <div class="vn-chip" ${o.chip ? '' : 'hidden'}>${esc(o.chip || '')}</div>
      <div class="vn-hudw">${o.hud ? hudHTML(o.hud, o.delta) : ''}</div>
      <div class="vn-ov">${o.overlay || ''}</div>
    </div>
    <div class="vn-boxw">${o.boxHTML || ''}</div>
  </div>`;
}

const NOTE = '<span class="vn-note" aria-label="호감이 올랐어요">♪</span>';
/**
 * 무대를 그리되, 같은 장면(배경 · 인물이 같음)이면 바뀐 부분만 고친다 — 줄마다 인물이 다시 나타나며 깜빡이지 않게
 */
export function renderStage(el, o) {
  const run = o.run || {};
  const cast = (o.cast || []).map(r => [r, roleChar(r, run)]).filter(([, id]) => id);
  const sig = JSON.stringify([o.bg, o.cg, o.tint, cast, o.cls || '']);
  const st = el.firstElementChild;
  if (!st || !st.classList.contains('vn-stage') || st.dataset.sig !== sig) {
    el.innerHTML = stageHTML(o);
    el.firstElementChild.dataset.sig = sig;
    const ov = el.querySelector('.vn-ov'), bw = el.querySelector('.vn-boxw');
    ov.dataset.h = o.overlay || ''; bw.dataset.h = o.boxHTML || '';
    return true;
  }
  const roles = cast.map(([r]) => r);
  const sp = o.speaker && roles.includes(o.speaker) ? o.speaker : null;
  st.querySelectorAll('.vn-actor').forEach(a => {
    const r = a.dataset.role;
    a.classList.toggle('dim', !!sp && sp !== r);
    a.classList.toggle('speak', sp === r);
    const has = a.querySelector('.vn-note'), want = (o.notes || []).includes(r);
    if (want && !has) a.insertAdjacentHTML('beforeend', NOTE);
    if (!want && has) has.remove();
  });
  const chip = st.querySelector('.vn-chip');
  chip.hidden = !o.chip; chip.textContent = o.chip || '';
  const hud = o.hud ? hudHTML(o.hud, o.delta) : '';
  const hw = st.querySelector('.vn-hudw'); if (hw.dataset.h !== hud) { hw.innerHTML = hud; hw.dataset.h = hud; }
  const ov = st.querySelector('.vn-ov'); if (ov.dataset.h !== (o.overlay || '')) { ov.innerHTML = o.overlay || ''; ov.dataset.h = o.overlay || ''; }
  const bw = st.querySelector('.vn-boxw'); if (bw.dataset.h !== (o.boxHTML || '')) { bw.innerHTML = o.boxHTML || ''; bw.dataset.h = o.boxHTML || ''; }
  return false;
}

export function hudHTML(st, delta = null) {
  return `<div class="vn-hud" aria-label="프로젝트 지표">${SHOWN.map(s => `
    <span class="hud-i">${statIcon(s.k)}<span class="hud-l">${s.label}</span><b class="num">${st[s.k] || 0}</b>${delta && delta[s.k] ? `<em class="hud-d">+${delta[s.k]}</em>` : ''}</span>`).join('')}</div>`;
}

/** 대사 상자: 지금까지 나온 줄들(최근 것이 아래, 진하게) */
export function boxHTML(lines, shown, opts = {}) {
  const vis = lines.slice(0, shown);
  const keep = opts.keep || 6;
  const start = Math.max(0, vis.length - keep);
  return `<div class="vn-box" role="log" aria-live="polite" aria-relevant="additions">
    ${vis.slice(start).map((l, i) => lineHTML(l, start + i === vis.length - 1)).join('')}
    ${opts.footer || ''}
  </div>`;
}

export function lineHTML(l, isNew) {
  if (!l.role) return `<p class="vn-line narr ${isNew ? 'new' : 'old'}">${esc(l.text)}</p>`;
  const c = CHARS[l.char];
  return `<p class="vn-line ${isNew ? 'new' : 'old'}">
    ${faceHTML(l.char, l.face)}<span class="vn-name" style="--nc:${c ? c.color : '#ccc'}">${esc(l.name)}</span><span class="vn-text">${esc(l.text)}</span></p>`;
}

/** 기술 카드 */
export function cardHTML(key) {
  const c = CARDS[key];
  if (!c) return '';
  const src = ART.card && ART.card[key];
  return `<div class="tech-card">
    ${src ? `<img src="${src}" alt="" class="tc-img">` : `<div class="tc-ph" aria-hidden="true">${c.icon}</div>`}
    <div class="tc-body"><div class="tc-kicker">기술 카드</div><div class="tc-name">${esc(c.name)}</div><p>${esc(c.text)}</p></div>
  </div>`;
}

export function lightsHTML(n) {
  return `<span class="lights" aria-label="루미타의 불빛 ${n}개">${[1, 2, 3].map(i => `<span class="lt ${i <= n ? 'on' : ''}">${i <= n ? '💡' : '·'}</span>`).join('')}</span>`;
}

/** 다음 장면 그림 미리 불러오기 */
const pre = new Set();
export function preload(srcs) {
  for (const s of srcs) {
    if (!s || pre.has(s)) continue;
    pre.add(s);
    const i = new Image(); i.decoding = 'async'; i.src = s;
  }
}
export function artFor(node, run) {
  const out = [];
  if (!node) return out;
  if (node.bg && ART.bg && ART.bg[node.bg]) out.push(ART.bg[node.bg]);
  for (const r of node.cast || []) {
    const id = roleChar(r, run);
    const a = id && ART.chars && ART.chars[id];
    if (a) out.push(a.sprite.src, ...a.faces);
  }
  return out;
}
export const ARTSET = ART;

// ── 화면 꾸밈(미연시 UI 그림) ──────────────────────────────────────
const UI = ART.ui || {};
const ICON_OF = { h: 'icon_h', o: 'icon_o', u: 'icon_u' };
/** 지표 아이콘(그림이 없으면 이모지) */
export function statIcon(k, cls = '') {
  const u = UI[ICON_OF[k]];
  const s = SHOWN.find(x => x.k === k);
  return u ? `<img class="st-ic ${cls}" src="${u.src}" alt="" width="40" height="40" draggable="false">` : `<span class="st-ic emo ${cls}" aria-hidden="true">${s ? s.icon : ''}</span>`;
}
/** 떨어지는 꽃잎 · 반짝이(장식, 움직임 줄이기면 CSS 가 멈춘다). 같은 seed 면 같은 배치 */
export function petalsHTML(n = 14, seed = 7) {
  let r = seed >>> 0;
  const rnd = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296);
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = 1 + Math.floor(rnd() * 6);
    out.push(`<i class="petal" style="--x:${(rnd() * 100).toFixed(1)}%;--d:${(9 + rnd() * 9).toFixed(1)}s;--dl:-${(rnd() * 18).toFixed(1)}s;--s:${Math.round(14 + rnd() * 18)}px;--sw:${Math.round(30 + rnd() * 70)}px;--r:${Math.round(rnd() * 360)}deg;background-image:url('${(UI['petal' + k] || {}).src || ''}')"></i>`);
  }
  for (let i = 0; i < Math.ceil(n / 4); i++) {
    const k = 1 + (i % 3);
    out.push(`<i class="spark" style="--x:${(rnd() * 95).toFixed(1)}%;--y:${(5 + rnd() * 70).toFixed(1)}%;--d:${(2.6 + rnd() * 2.4).toFixed(1)}s;--dl:-${(rnd() * 4).toFixed(1)}s;--s:${Math.round(12 + rnd() * 14)}px;background-image:url('${(UI['spark' + k] || {}).src || ''}')"></i>`);
  }
  return `<div class="petals" aria-hidden="true">${out.join('')}</div>`;
}
/** 제목 글자(로고) — 그림 글자 아님: 글꼴(Noto Serif KR 900)로 쓴 진짜 글 */
export function logoHTML(cls = '', tag = 'h1') {
  return `<div class="logo ${cls}">
    <span class="logo-kicker">적정 기술 비주얼 노벨</span>
    <${tag} class="logo-main" aria-label="손잡이 동아리"><span class="lw" data-t="손잡이" aria-hidden="true">손잡이</span><span class="lw lw2" data-t="동아리" aria-hidden="true">동아리</span></${tag}>
    <span class="logo-sub" lang="en"><span>Handshake Club <i aria-hidden="true">·</i> Three Springs with Lumita</span></span>
  </div>`;
}
/** 타이틀 키 비주얼. data-faces = 얼굴 상자(그림 비율) — 화면 시험이 UI 와 겹치는지 본다 */
export function kvHTML(cls = '') {
  const k = UI.kv;
  return `<div class="ts-kv ${cls}" aria-hidden="true"${k && k.faces ? ` data-faces='${JSON.stringify(k.faces)}' data-iw="${k.w}" data-ih="${k.h}"` : ''}></div>`;
}
/** 앱 메달(머리띠 제목 옆) */
export function emblemHTML(cls = '') {
  const u = UI.emblem;
  return u ? `<img class="emblem ${cls}" src="${u.src}" alt="" width="40" height="38" draggable="false">` : '<span aria-hidden="true">🤝</span>';
}

/** 대사 상자: 맨 위 줄이 반만 잘려 보이지 않게, 넘치는 지난 줄은 위에서부터 통째로 숨긴다(지금 줄은 숨기지 않는다).
 *  상자를 새로 그릴 때 · 창 크기가 바뀔 때 저절로 돈다. */
export function trimBoxes(root = typeof document !== 'undefined' ? document : null) {
  if (!root) return;
  for (const box of root.querySelectorAll('.vn-box:not(.choice)')) {
    const lines = [...box.querySelectorAll(':scope > .vn-line')];
    lines.forEach(l => l.classList.remove('cut'));
    const cs = getComputedStyle(box);
    const top = box.getBoundingClientRect().top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
    for (const l of lines) {
      if (l === lines[lines.length - 1] || l.classList.contains('new')) break;
      if (l.getBoundingClientRect().top >= top - 1) break;
      l.classList.add('cut');
    }
  }
}
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  let queued = false;
  const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; trimBoxes(); }); };
  const start = () => {
    new MutationObserver(ms => { if (ms.some(m => m.addedNodes.length)) later(); }).observe(document.body, { childList: true, subtree: true });
    addEventListener('resize', later);
    later();
  };
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);
}
