// 화면 효과 — 장면 넘김 · 날씨 알갱이(캔버스 하나) · 감정 표시 · 흔들림 · 빛 · 카메라 밀기 · 장 제목 · 글 강조 · 꽃가루 · 투표 연출 · 글자 찍기 · 「눌러도 넘어가요」.
// 효과마다 짝 효과음을 같이 낸다(sound.js play — 효과음 끄면 조용, 전체 모드 크롬북은 잠금이라 늘 조용).
// 꼭 지킬 것: 어떤 효과도 인물 얼굴(머리)을 덮지 않는다.
//   - 날씨 캔버스와 빛 터짐은 인물 그림 **뒤**(배경과 인물 사이)에 그린다. 그래도 머리 둘레 투명한 곳은 그리지 않는다(얼굴 상자 + 여유)
//   - 햇살 줄기는 가장 높은 머리보다 위 띠에만. 감정 표시 · ♡ 는 머리 **옆**(그림 오른쪽 바깥 칸), 지표 꼬리표 · 반짝 길은 지표 줄 높이(맨 위)
//   - 장 제목은 대사 상자 자리(아래)에. 엔딩 그림 위에는 아무것도 뿌리지 않는다(꽃가루는 글 칸 · 엔딩 카드 제목 칸 안에만)
// 움직임 단계 <html data-motion>: hi 상(전부) · mid 중(알갱이 절반 · 흔들림 · 카메라 없음) · lo 하(나타나기만 · 알갱이 없음) · off 끄기(움직임 없음)
import { play as sfx, ambience } from './sound.js';

const doc = typeof document !== 'undefined' ? document : null;
/** 지금 움직임 단계: 'hi' | 'mid' | 'lo' | 'off' */
export function lv() {
  const m = doc && doc.documentElement.dataset.motion;
  if (m) return m;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'hi'; } catch { return 'hi'; }
}
/** 움직임 끄기(예전 이름 유지) */
export function reduced() { return lv() === 'off'; }
const atLeast = k => ({ hi: 3, mid: 2, lo: 1, off: 0 })[lv()] >= ({ hi: 3, mid: 2, lo: 1, off: 0 })[k];

// ── 분위기 · 날씨 ────────────────────────────────────────────────
const TENSE = new Set(['S3', 'V3', 'S8', 'V8', 'S9', 'V9']);   // 문제가 터지는 장면(음악을 조금 어둡게)
/** 장면 분위기(음악 밝기): 'day' | 'night' | 'tension' */
export function moodOf(id, node, k = null, opt = null) {
  if (!node) return 'day';
  if (k === 'after' && opt && opt.rethink) return 'tension';
  if (k !== 'after' && TENSE.has(id)) return 'tension';
  const bg = (opt && opt.bg) || node.bg;
  if (node.tint === 'night' || bg === 'night' || bg === 'snow') return 'night';
  return 'day';
}
/** 배경마다 날씨 층(앞 것이 환경음): 빗물 탱크 비 + 물 반짝 · 우물 먼지 + 물 반짝 · 눈 + 눈 뭉치 · 밤 반딧불 · 별 ·
 *  봄 학교 꽃잎 + 햇살 · 장터 먼지 + 햇살 · 동아리방 · 대장간 먼지 빛. romance 면 분홍 빛망울을 더한다 */
export function weatherOf(bg, tint, romance = false) {
  let k;
  if (tint === 'night' || bg === 'night') k = ['night'];
  else k = ({ roof: ['rain', 'glint'], well: ['dust', 'glint'], snow: ['snow', 'puff'], field: ['petals', 'rays'], garden: ['petals', 'rays'], hall: ['petals'],
    market: ['dust', 'rays'], club: ['dust'], forge: ['dust'], fest: ['dust'], call: ['dust'] })[bg] || [];
  return romance ? [...k, 'bokeh'] : k;
}

// ── 대사 한 줄에 붙는 효과 ─────────────────────────────────────────
const SHAKE_RE = /다급|앗,|멈췄어|뚝뚝 샌다|멈춰 버린/;
const TECH_RE = /불이 켜졌|불 켜졌다|LED가 켜졌|노란 불이|보글보글 끓었|시원해진다|빗물을 건기까지|물을 날랐|데구루루/;
const WATER_RE = /물|빗물|보글|데구루루/;
const IDEA_RE = /아이디어|떠올|그렇구나|방법이|같이 고치|해 보자/;
export const KEYWORDS = ['적정 기술', '자전거 발전기', '빗물 탱크', '빗물', '굴리는 물통', '물통', '정수 빨대', '반사판', '항아리 냉장고', '모래', 'LED', '설명서', '거름', '부품', '태양광'];
/** 줄 → { shake, tech, water, emote, ex(느낌표), whisper(속마음), key(기술 낱말) }. soft = 설렘 장면(반짝이 · ♡ 만) */
export function lineFx(line, soft = false) {
  if (!line) return {};
  const t = line.text || '';
  const out = { shake: SHAKE_RE.test(t), tech: TECH_RE.test(t), water: false, emote: null, ex: false, whisper: false, key: KEYWORDS.find(w => t.includes(w)) || null };
  out.water = out.tech && WATER_RE.test(t);
  out.ex = !!line.role && /[!！]\s*$|\?!|!\s/.test(t);
  out.whisper = (!line.role && (/\?\s*$|…/.test(t) || /속으로|마음속|혼잣말/.test(t))) || (line.role === 'me' && /…/.test(t));
  if (!line.role) return out;
  if (soft) { out.emote = line.face >= 1 ? (/[!♡]|좋|같이|함께|고마/.test(t) ? 'heart' : 'spark') : null; return out; }
  if (/사실…|…$/.test(t) && !line.face) out.emote = 'sweat';
  else if (IDEA_RE.test(t)) out.emote = 'idea';
  else if (line.face >= 1 && /!/.test(t)) out.emote = 'spark';
  return out;
}
const EMO = { spark: '✨', sweat: '💧', idea: '💡', note: '♪', heart: '♡' };
/** 말하는 인물 옆에 감정 표시(2.2초 뒤 사라짐). ♡ 는 하프 소리 */
export function emote(stageEl, role, kind) {
  if (!stageEl || !role || !kind || lv() === 'off') return;
  const a = stageEl.querySelector(`.vn-actor[data-role="${role}"]`);
  if (!a) return;
  a.querySelectorAll('.vn-emote').forEach(e => e.remove());
  const e = doc.createElement('span');
  e.className = 'vn-emote e-' + kind; e.textContent = EMO[kind] || ''; e.setAttribute('aria-hidden', 'true');
  a.appendChild(e);
  placeMark(a, e);
  if (kind === 'heart') sfx('harp');
  setTimeout(() => e.remove(), 2200);
}

// ── 머리 상자 · 감정 표시 자리 ────────────────────────────────────────
/** 서 있는 그림의 머리(머리카락 · 묶은 머리까지) 상자 — 화면 좌표. data-head(그림 비율, art.py) ∪ 얼굴 상자(가로 15~85% · 위 36%) */
export function headRect(sprite) {
  const q = sprite.getBoundingClientRect();
  if (q.width < 2) return null;
  const nw = Number(sprite.getAttribute('width')) || sprite.naturalWidth || 0, nh = Number(sprite.getAttribute('height')) || sprite.naturalHeight || 0;
  let ww = q.width, hh = q.height;
  if (nw && nh && sprite.tagName === 'IMG') { const sc = Math.min(q.width / nw, q.height / nh); ww = nw * sc; hh = nh * sc; }
  const x = q.left + (q.width - ww) / 2, y = q.bottom - hh;
  const [a, b, c, d] = (sprite.dataset && sprite.dataset.head ? sprite.dataset.head.split(',').map(Number) : [0.15, 0, 0.85, 0.36]);
  // 얼굴 상자(가로 15~85% · 위 36%, 화면 시험과 같은 것)와 합친다 — 머리카락이 좁은 인물도 얼굴 상자만큼은 비킨다
  return { left: x + Math.min(a, 0.15) * ww, top: y + Math.min(b, 0) * hh, right: x + Math.max(c, 0.85) * ww, bottom: y + Math.max(d, 0.36) * hh };
}
// 창 크기가 바뀌면(인물 상자 비율이 바뀐다) 떠 있는 감정 표시 · ♪ 자리를 다시 잡는다
if (typeof window !== 'undefined') {
  let raf = 0;
  window.addEventListener('resize', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; for (const m of doc.querySelectorAll('.vn-actor > .vn-emote, .vn-actor > .vn-note')) placeMark(m.parentElement, m); });
  });
}
const GAP = 10;   // 머리와 감정 표시 사이(확대 애니메이션 1.15배 몫까지)
/** 감정 표시 · ♪ 를 머리 밖에 둔다: 머리 오른쪽 → 왼쪽 → 위. 옆 인물 머리 · 지표 · 무대 밖과 겹치지 않는 첫 자리.
 *  위치는 인물 상자의 % 로 넣는다(창 크기가 바뀌어도 같이 따라간다) */
export function placeMark(actor, el) {
  const sp = actor && actor.querySelector('.vn-sprite');
  const scene = actor && actor.closest('.vn-scene');
  if (!sp || !scene || !el) return;
  const me = headRect(sp), ar = actor.getBoundingClientRect(), sr = scene.getBoundingClientRect();
  if (!me || ar.width < 2) return;
  const ew = el.offsetWidth || 30, eh = el.offsetHeight || 30;
  const blocks = [];
  for (const o of scene.querySelectorAll('.vn-actor .vn-sprite')) {
    const h = headRect(o);
    if (h) blocks.push(h);   // 자기 머리도 넣는다(아래 후보는 이미 밖이지만 겹침 검사로 한 번 더)
  }
  for (const s of ['.vn-hud', '.vn-chip:not([hidden])']) { const u = scene.querySelector(s); if (u) { const q = u.getBoundingClientRect(); if (q.width > 2) blocks.push(q); } }
  const hy = me.top + (me.bottom - me.top) * 0.12;
  const cands = [
    [me.right + GAP, hy], [me.left - GAP - ew, hy],
    [(me.left + me.right - ew) / 2, me.top - GAP - eh], [me.right + GAP - ew * 0.3, me.top - GAP - eh * 0.6],
  ];
  const cost = ([x, y]) => {
    let c = 0;
    if (x < sr.left + 2 || x + ew > sr.right - 2 || y < sr.top + 2) c += 1e6;
    for (const b of blocks) {
      const ix = Math.min(x + ew + GAP / 2, b.right) - Math.max(x - GAP / 2, b.left), iy = Math.min(y + eh + GAP / 2, b.bottom) - Math.max(y - GAP / 2, b.top);
      if (ix > 0 && iy > 0) c += ix * iy;
    }
    return c;
  };
  let best = cands[0], bc = Infinity;
  for (const k of cands) { const c = cost(k); if (c < bc) { bc = c; best = k; } if (c === 0) break; }
  el.style.left = ((best[0] - ar.left) / ar.width * 100).toFixed(2) + '%';
  el.style.top = ((best[1] - ar.top) / ar.height * 100).toFixed(2) + '%';
  el.style.right = 'auto';
}
/** 말하는 사람이 바뀜(무대가 부른다): 아주 작은 톡 */
export function speakerChanged() { sfx('speak'); }
/** 놀람 · 문제: 무대를 살짝 흔든다(4px · 상에서만) */
export function shake(stageEl) {
  sfx('shake');
  const sc = stageEl && stageEl.querySelector('.vn-scene');
  if (!sc || !atLeast('hi')) return;
  sc.classList.remove('shake'); void sc.offsetWidth; sc.classList.add('shake');
  setTimeout(() => sc.classList.remove('shake'), 500);
}
/** 빛 터짐(인물 뒤) */
export function bloom(stageEl) {
  const sc = stageEl && stageEl.querySelector('.vn-scene');
  if (!sc || !atLeast('mid')) return;
  const b = doc.createElement('div'); b.className = 'vn-bloom'; b.setAttribute('aria-hidden', 'true');
  const cast = sc.querySelector(':scope > .vn-cast');
  sc.insertBefore(b, cast || sc.querySelector('.vn-chip'));
  setTimeout(() => b.remove(), 1800);
}
/** 기술이 작동: 빛 터짐 + 카메라 살짝 밀기(상) + 지표 💡 쪽으로 반짝 길(맨 위 띠) + 올라가는 종 · 따뜻한 웅 (물이면 보글보글) */
export function techBurst(stageEl, water = false) {
  sfx('tech'); setTimeout(() => sfx('hum'), 60); if (water) setTimeout(() => sfx('water'), 250);
  bloom(stageEl);
  const sc = stageEl && stageEl.querySelector('.vn-scene');
  if (!sc) return;
  if (atLeast('hi')) { sc.classList.remove('pushin'); void sc.offsetWidth; sc.classList.add('pushin'); setTimeout(() => sc.classList.remove('pushin'), 1000); }
  if (atLeast('mid')) {
    sc.querySelectorAll(':scope > .fx-trail').forEach(x => x.remove());
    const t = doc.createElement('div'); t.className = 'fx-trail'; t.setAttribute('aria-hidden', 'true');
    t.innerHTML = Array.from({ length: 7 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    sc.appendChild(t);
    setTimeout(() => t.remove(), 1600);
  }
}
/** 지표가 오르면 「+2 함께」 꼬리표가 지표 줄 자리에서 톡 */
export function floatChips(stageEl, delta, shown) {
  const sc = stageEl && stageEl.querySelector('.vn-scene');
  if (!sc || !delta) return;
  sc.querySelectorAll('.fx-chips').forEach(x => x.remove());
  const items = shown.filter(s => delta[s.k] > 0);
  if (!items.length) return;
  sfx('stat');
  if (lv() === 'off') return;
  const w = doc.createElement('div'); w.className = 'fx-chips'; w.setAttribute('aria-hidden', 'true');
  w.innerHTML = items.map((s, i) => `<span class="fx-chip" style="--i:${i}">${s.icon} +${delta[s.k]} ${s.label}</span>`).join('');
  sc.appendChild(w);
  chipsBesideHud(sc, w);
  setTimeout(() => w.remove(), 2600);
}

/** 꼬리표 줄 자리: 지표(HUD) 왼쪽 같은 줄 → 지표 밑(지표가 아래면 위) → 무대 반대쪽 끝. 지표 글자 · 장 이름표 · 인물 머리를 덮지 않는 첫 자리 */
function chipsBesideHud(sc, w) {
  const hud = sc.querySelector('.vn-hud');
  const hr = hud && hud.getBoundingClientRect();
  if (!hr || hr.width < 2) return;
  const sr = sc.getBoundingClientRect();
  const blocks = [];
  for (const sp of sc.querySelectorAll('.vn-sprite')) { const h = headRect(sp); if (h) blocks.push(h); }
  const root = sc.closest('.host-play') || sc.parentElement || sc;
  for (const u of [sc.querySelector('.vn-chip:not([hidden])'), ...root.querySelectorAll('.paused-tag, .fx-card .fc-band, .vn-box')]) {
    if (!u) continue;
    const q = u.getBoundingClientRect(); if (q.width > 2) blocks.push(q);
  }
  const atTop = hr.top + hr.height / 2 < sr.top + sr.height / 2;
  const set = ([top, right, bottom, col]) => {
    w.style.top = top == null ? 'auto' : top + 'px'; w.style.bottom = bottom == null ? 'auto' : bottom + 'px'; w.style.right = right + 'px';
    w.classList.toggle('up', bottom != null); w.classList.toggle('col', !!col);
  };
  const right0 = Math.max(4, sr.right - hr.right);
  const cands = [
    [hr.top - sr.top, sr.right - hr.left + CHIP_GAP, null],                                   // 지표 왼쪽 같은 줄
    atTop ? [hr.bottom - sr.top + CHIP_GAP, right0, null] : [null, right0, sr.bottom - hr.top + CHIP_GAP],   // 지표 밑(아래 지표면 위)
    atTop ? [hr.bottom - sr.top + CHIP_GAP, right0, null, 1] : [null, right0, sr.bottom - hr.top + CHIP_GAP, 1],   // 같은 자리에 세로로(오른쪽 끝에 붙여 좁게)
    atTop ? [null, right0, CHIP_GAP] : [CHIP_GAP, right0, null],                              // 낮은 창: 무대 반대쪽 끝(머리에서 먼 발치)
  ];
  let best = cands[cands.length - 1], bc = Infinity;
  for (const k of cands) {
    set(k);
    const q = w.getBoundingClientRect();
    let c = (q.left < sr.left + 2 || q.top < sr.top + 2 || q.bottom > sr.bottom - 2) ? 1e6 : 0;
    for (const b of blocks) {
      const ix = Math.min(q.right, b.right + 4) - Math.max(q.left, b.left - 4), iy = Math.min(q.bottom, b.bottom + 4) - Math.max(q.top, b.top - 4);
      if (ix > 0 && iy > 0) c += ix * iy;
    }
    if (c < bc) { bc = c; best = k; }
    if (!c) break;
  }
  set(best);
}
const CHIP_GAP = 8;

// ── 장 제목 카드(학년 · 철이 바뀔 때) ──────────────────────────────
/** 「중1 · 3월」 → 학년 「중1」, 철 「봄」 */
export function chapterOf(when) {
  const m = /^(중\d)\s*·\s*(\d+)월/.exec(when || '') || [];
  const mo = Number(m[2]);
  const season = !mo ? '' : mo >= 3 && mo <= 5 ? '봄' : mo >= 6 && mo <= 8 ? '여름' : mo >= 9 && mo <= 11 ? '가을' : '겨울';
  return { grade: m[1] || '', season, key: (m[1] || '') + season || String(when || '') };
}
/** 장 제목 카드: 붓 띠가 쓱 지나가며 「중2 · 겨울」 → 1.2초 머문 뒤 쓱 나간다. 대사 상자 자리(아래)에 — 얼굴 쪽에 두지 않음.
 *  big = 학년이 바뀜. 누르면 바로 닫힌다(cardSkip) */
export function chapterCard(stageEl, when, title, big = false) {
  if (!stageEl) return null;
  sfx('chapter');
  if (lv() === 'off') return null;
  const st = stageEl.querySelector('.vn-stage') || stageEl;
  st.querySelectorAll(':scope > .fx-card').forEach(x => x.remove());
  const c = doc.createElement('div');
  c.className = 'fx-card' + (big ? ' big' : ''); c.setAttribute('role', 'status');
  c.innerHTML = `<div class="fc-band"><span class="fc-when">${escH(when || '')}</span>${title ? `<b class="fc-title">${escH(title)}</b>` : ''}</div>`;
  st.appendChild(c);
  clearOfTag(c);
  const re = () => { if (c.isConnected) clearOfTag(c); else window.removeEventListener('resize', re); };
  window.addEventListener('resize', re);
  setTimeout(() => { c.remove(); window.removeEventListener('resize', re); }, lv() === 'lo' ? 1500 : 2300);
  return c;
}
/** 진행판 「⏸ 멈춤」 표시와 겹치면 카드를 그만큼 위로(띠 · 표시 모두 글자가 잘리지 않게) */
export function clearOfTag(c) {
  const host = c && c.closest('.host-play');
  const tag = host && host.querySelector('.paused-tag');
  const band = c && c.querySelector('.fc-band');
  if (!c) return;
  c.style.bottom = '';
  if (!tag || !band) return;
  const t = tag.getBoundingClientRect(), cr = c.getBoundingClientRect();
  const bw = band.offsetWidth, bx0 = cr.left + (cr.width - bw) / 2, bx1 = bx0 + bw;
  if (t.width < 2 || t.right <= bx0 || t.left >= bx1) return;
  const over = cr.bottom - (t.top - 6);
  if (over > 0) c.style.bottom = (parseFloat(getComputedStyle(c).bottom) + over) + 'px';
}
/** 떠 있는 장 제목 카드를 닫는다(있었으면 true) */
export function cardSkip(root = doc) {
  const c = root && root.querySelector('.fx-card');
  if (!c) return false;
  c.remove(); return true;
}
const escH = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// ── 글 강조 ────────────────────────────────────────────────────────
/** 지금 줄에 느낌표 「톡」 · 속마음 「스르륵 기울임」 표시와 짝 소리 */
export function emphasize(root, f) {
  const lines = root && root.querySelectorAll('.vn-box:not(.choice) > .vn-line.new');
  const line = lines && lines[lines.length - 1];
  if (!line || !f) return;
  if (f.ex) { line.classList.add('ex'); sfx('pop'); }
  if (f.whisper) { line.classList.add('whisper'); sfx('whisper'); }
}
/** 다 찍힌 줄의 첫 기술 낱말에 반짝(한 번) */
function markKey(el, key) {
  if (!el || !key || !atLeast('mid')) return;
  const tn = [...el.childNodes].find(n => n.nodeType === 3 && n.data.includes(key));
  if (!tn) return;
  const i = tn.data.indexOf(key);
  const after = tn.splitText(i); after.splitText(key.length);
  const m = doc.createElement('mark'); m.className = 'kw'; m.textContent = key;
  after.replaceWith(m);
  sfx('shimmer');
}

// ── 꽃가루 · 종이 조각(정해진 칸 안에서만) ─────────────────────────
const CONF_COL = ['#f6b8c4', '#fbd38d', '#f9a8b8', '#bfe3c0', '#ffe7a3', '#f4c2d7'];
/** target 칸 안(넘치는 건 잘림)에 꽃잎 · 종이가 떨어진다. 칸 안 글자보다 뒤에 깐다. 반짝 소리 몇 번 */
export function confetti(target, n = 26, opts = {}) {
  if (!target) return;
  [0, 450, 1000].forEach(d => setTimeout(() => sfx('twinkle'), d));
  if (!atLeast('mid')) return;
  if (lv() === 'mid') n = Math.ceil(n / 2);
  target.querySelectorAll(':scope > .fx-conf').forEach(x => x.remove());
  const w = doc.createElement('div'); w.className = 'fx-conf'; w.setAttribute('aria-hidden', 'true');
  let h = '';
  for (let i = 0; i < n; i++) {
    const petal = opts.paper ? i % 3 === 0 : i % 3 !== 0;
    h += `<i class="${petal ? 'cf-p' : 'cf-s'}" style="--x:${(Math.random() * 100).toFixed(1)}%;--dl:${(Math.random() * (opts.spread || 1.6)).toFixed(2)}s;--d:${(2.8 + Math.random() * 2.4).toFixed(2)}s;--r:${Math.round(Math.random() * 360)}deg;--sw:${Math.round(-40 + Math.random() * 80)}px;--c:${CONF_COL[i % CONF_COL.length]}"></i>`;
  }
  w.innerHTML = h;
  target.prepend(w);
  setTimeout(() => w.remove(), 7000);
}
/** 엔딩 그림이 열림: 부풀기 소리 · 빛 번짐(글 칸 · 그림 밝기) · 꽃가루(글 칸) */
export function endingReveal(stageEl) {
  sfx('ending'); sfx('endSwell'); setTimeout(() => sfx('leak'), 800);
  const st = stageEl && stageEl.querySelector('.vn-stage.has-cg');
  if (!st) return;
  const box = st.querySelector('.vn-box');
  if (box) confetti(box, 24);
}

// ── 투표 · 선택 연출 ────────────────────────────────────────────────
/** 투표 결과: 이긴 줄 둘레에서 반짝 터짐 + 「도장」 */
export function winBurst(row, stamp = false) {
  if (!row) return;
  if (stamp) { sfx('stamp'); row.classList.add('stamped'); }
  if (!atLeast('mid')) return;
  const w = doc.createElement('span'); w.className = 'fx-burst'; w.setAttribute('aria-hidden', 'true');
  w.innerHTML = Array.from({ length: 10 }, (_, i) => `<i style="--a:${i * 36}deg;--dl:${(i % 3) * 0.04}s"></i>`).join('');
  row.appendChild(w);
  setTimeout(() => w.remove(), 1400);
}
/** 투표 결과 공개: 막대가 차례로 차오르며 작은 북 굴림 → 이긴 줄에 도장 */
export function tallyDrama(root, rows = 3) {
  const dur = 0.4 + rows * 0.18;
  sfx('drumroll', { dur });
  const win = root && root.querySelector('.vo-row.win');
  setTimeout(() => winBurst(win, true), (dur + 0.25) * 1000);
}
/** 마지막 3초: 두근 소리 · 둘레 붉은 그림자(무대 둘레에만) */
export function countdown(left, el) {
  if (left >= 1 && left <= 3) sfx('heartbeat', { last: left === 1 });
  if (el) el.classList.toggle('last3', left >= 1 && left <= 3);
}

// ── 글자 찍기(지금 줄) ──────────────────────────────────────────────
const TW = { el: null, full: '', i: 0, timer: null, key: null };
/** root 안 맨 아래 새 줄을 한 글자씩. 글 자리(크기)는 처음부터 다 차지해서 줄이 흔들리지 않는다. 다 찍히면 기술 낱말 반짝 */
export function typewrite(root, { cps = 40, speed = 1, key = null } = {}) {
  twFinish();
  const lines = root && root.querySelectorAll('.vn-box:not(.choice) > .vn-line.new');
  const line = lines && lines[lines.length - 1];
  if (!line) return;
  const el = line.querySelector('.vn-text') || line;
  if (el.dataset.tw === 'done') return;
  if (lv() === 'off') { markKey(el, key); el.dataset.tw = 'done'; return; }
  const full = el.textContent;
  if (full.length < 2) return;
  el.textContent = '';
  const v = doc.createElement('span'), hd = doc.createElement('span');
  v.className = 'tw-v'; hd.className = 'tw-h'; hd.setAttribute('aria-hidden', 'true');
  v.appendChild(doc.createTextNode('')); hd.appendChild(doc.createTextNode(full));
  el.append(v, hd);
  el.setAttribute('aria-label', full);
  Object.assign(TW, { el, full, i: 0, v, hd, key });
  const step = Math.max(8, 1000 / cps / speed);
  TW.timer = setInterval(() => {
    if (!TW.el || !TW.el.isConnected) return twFinish();
    TW.i += 1;
    if (TW.i >= TW.full.length) return twFinish();
    TW.v.firstChild.data = TW.full.slice(0, TW.i);       // 글자 바꾸기만(노드 추가 없음 → 대사 상자 자르기가 다시 돌지 않는다)
    TW.hd.firstChild.data = TW.full.slice(TW.i);
  }, step);
}
/** 찍는 중이면 true */
export function twBusy() { return !!(TW.timer && TW.el && TW.el.isConnected); }
/** 지금 줄을 바로 다 보여 준다 */
export function twFinish() {
  if (TW.timer) clearInterval(TW.timer);
  TW.timer = null;
  if (TW.el && TW.el.isConnected) { TW.el.textContent = TW.full; TW.el.dataset.tw = 'done'; TW.el.removeAttribute('aria-label'); markKey(TW.el, TW.key); }
  TW.el = null;
}

// ── 「눌러도 넘어가요」 안내(이 탭에서 한 번) ──────────────────────
export function hintOnce(key, msg) {
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch {}
  const h = doc.createElement('div');
  h.className = 'adv-hint'; h.setAttribute('role', 'status'); h.textContent = msg;
  doc.body.appendChild(h);
  setTimeout(() => h.classList.add('out'), 3800);
  setTimeout(() => h.remove(), 4600);
}

// ── 화면 어디를 눌러도 다음으로 ─────────────────────────────────────
/** 눌러도 넘기지 않는 곳: 단추 · 입력 · 링크 · 머리띠 · 설정 · 교사 선택 판 · 선택지 */
export const CONTROL_SEL = 'button, a, input, select, textarea, label, summary, [role="button"], [contenteditable], #bar, #setp, .snd, .picker, .vbtn, .vo-row, [data-pick], .vn-box.choice';
/** 클릭이 넘기기로 쓰여도 되는지(두 번 누르기의 둘째 · 셋째 누름은 무시) */
export function isAdvanceClick(e) {
  if (e.button != null && e.button !== 0) return false;
  if (e.detail > 1) return false;
  const t = e.target;
  return !(t && t.closest && t.closest(CONTROL_SEL));
}

// ── 날씨 알갱이(무대마다 캔버스 하나 · 인물 뒤) ─────────────────────
const WX = { list: new Set(), raf: 0, last: 0, fps: [] };
/** 상 단계 기본 개수(넓이에 따라 줄임 · 전체 상한 CAP) */
const KIND = { rain: 70, glint: 14, dust: 26, snow: 46, puff: 10, night: 34, petals: 18, rays: 4, bokeh: 12 };
const AREA = { rain: 9000, glint: 40000, dust: 28000, snow: 14000, puff: 60000, night: 16000, petals: 30000, rays: 1, bokeh: 50000 };
export const CAP = { hi: 120, mid: 50, lo: 0, off: 0 };
/** 무대 안 캔버스를 만들거나 바꾼다. 단계에 따라 개수 · 없음. 환경음도 같이(첫 층) */
export function setWeather(sceneEl, kinds) {
  if (!sceneEl) return;
  kinds = (Array.isArray(kinds) ? kinds : kinds ? [kinds] : []).filter(k => KIND[k]);
  sceneEl.__wxKinds = kinds;
  ambience(kinds[0] || null);
  let cv = sceneEl.querySelector(':scope > canvas.vn-wx');
  const cap = CAP[lv()] || 0;
  if (!kinds.length || !cap) { if (cv) { WX.list.delete(cv.__wx); cv.remove(); } return; }
  const sig = kinds.join() + '|' + cap;
  if (cv && cv.__wx && cv.__wx.sig === sig) return;
  if (cv) { WX.list.delete(cv.__wx); cv.remove(); }
  cv = doc.createElement('canvas'); cv.className = 'vn-wx'; cv.setAttribute('aria-hidden', 'true');
  const cast = sceneEl.querySelector(':scope > .vn-cast');
  sceneEl.insertBefore(cv, cast || sceneEl.querySelector(':scope > .vn-chip'));
  const w = { cv, kinds, sig, cap, scene: sceneEl, parts: [], w: 0, h: 0, faces: [], drawn: [] };
  cv.__wx = w; cv.__vnDrawn = () => w.drawn;   // 시험: 마지막으로 그린 알갱이 상자(화면 좌표)
  WX.list.add(w);
  if (!WX.raf) WX.raf = requestAnimationFrame(frame);
}
// 움직임 단계를 바꾸면 떠 있는 무대의 날씨를 다시(개수 · 있음/없음)
if (typeof window !== 'undefined') window.addEventListener('vn-motion', () => {
  for (const sc of doc.querySelectorAll('.vn-scene')) if (sc.__wxKinds) setWeather(sc, sc.__wxKinds);
  if (lv() === 'off' || lv() === 'lo') twFinish();
});
if (typeof window !== 'undefined') window.__vnFx = { wxStats: () => wxStats(), lv, weather: (kinds, root = doc) => { const sc = root.querySelector('.vn-scene'); if (sc) setWeather(sc, kinds); } };
/** 시험 · 점검: 지금 그리는 알갱이 수 · 최근 프레임 빠르기 */
export function wxStats() {
  let parts = 0; for (const w of WX.list) parts += w.parts.length;
  const f = WX.fps.slice(-60), avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
  return { canvases: WX.list.size, parts, frameMs: Math.round(avg * 10) / 10 };
}
function sizeOf(w) {
  const r = w.cv.getBoundingClientRect();
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  if (Math.abs(r.width - w.w) > 1 || Math.abs(r.height - w.h) > 1) {
    w.w = r.width; w.h = r.height; w.cv.width = Math.round(r.width * dpr); w.cv.height = Math.round(r.height * dpr); w.dpr = dpr;
    const want = w.kinds.map(k => Math.min(KIND[k], k === 'rays' ? KIND.rays : Math.round(r.width * r.height / AREA[k])));
    const sum = want.reduce((a, b) => a + b, 0), sc = sum > w.cap ? w.cap / sum : 1;
    w.parts = [];
    w.kinds.forEach((k, i) => { for (let j = 0; j < Math.floor(want[i] * sc); j++) w.parts.push(spawn(w, k, true)); });
  }
  return r;
}
function spawn(w, k, anywhere) {
  const W = w.w, H = w.h, R = Math.random;
  switch (k) {
    case 'rain': return { k, x: R() * W * 1.1, y: anywhere ? R() * H : -20, v: 700 + R() * 300, l: 12 + R() * 10, a: 0.25 + R() * 0.25 };
    case 'snow': return { k, x: R() * W, y: anywhere ? R() * H : -8, v: 28 + R() * 40, s: 1.5 + R() * 2.5, ph: R() * 6.3, a: 0.6 + R() * 0.35 };
    case 'puff': return { k, x: R() * W, y: H * (0.75 + R() * 0.22), s: 8 + R() * 10, ph: R() * 6.3, vx: (R() - 0.5) * 10, a: 0.35 };
    case 'night': return R() < 0.45
      ? { k, star: 1, x: R() * W, y: R() * H * 0.4, s: 0.8 + R() * 1.3, ph: R() * 6.3, a: 0.7 }
      : { k, x: R() * W, y: H * (0.35 + R() * 0.6), s: 1.8 + R() * 1.8, ph: R() * 6.3, vx: (R() - 0.5) * 16, vy: (R() - 0.5) * 10, a: 0.9 };
    case 'petals': return { k, x: R() * W, y: anywhere ? R() * H : -14, v: 26 + R() * 30, s: 4 + R() * 4, ph: R() * 6.3, rot: R() * 6.3, a: 0.75 };
    case 'glint': return { k, x: R() * W, y: H * (0.62 + R() * 0.34), s: 2 + R() * 3, ph: R() * 6.3, sp: 1.5 + R() * 2, a: 0.9 };
    case 'rays': return { k, x: W * (0.05 + R() * 0.5), wd: W * (0.05 + R() * 0.07), ph: R() * 6.3, a: 0.16 };
    case 'bokeh': return { k, x: R() * W, y: H * (0.2 + R() * 0.75), s: 6 + R() * 10, ph: R() * 6.3, vy: -(4 + R() * 6), a: 0.35 };
    default: return { k, x: R() * W, y: anywhere ? R() * H : H + 8, v: 6 + R() * 10, s: 1 + R() * 2, ph: R() * 6.3, a: 0.5 };   // dust: 천천히 떠오름
  }
}
/** 머리 상자(머리카락 · 묶은 머리까지, data-head) + 얼굴 상자(가로 8~92% · 세로 위 42%)를 합쳐 10px 넉넉하게 — 무대 좌표 */
function faceBoxes(w, r) {
  const out = [];
  for (const el of w.scene.querySelectorAll('.vn-sprite')) {
    const q = el.getBoundingClientRect();
    if (q.width < 2) continue;
    let ww = q.width, hh = q.height;
    if (el.naturalWidth) { const s = Math.min(q.width / el.naturalWidth, q.height / el.naturalHeight); ww = el.naturalWidth * s; hh = el.naturalHeight * s; }
    const x = q.left + (q.width - ww) / 2 - r.left, y = q.bottom - hh - r.top;
    const h = headRect(el);
    const hx0 = h ? h.left - r.left : x, hx1 = h ? h.right - r.left : x + ww, hy1 = h ? h.bottom - r.top : y;
    out.push([Math.min(x + ww * 0.08, hx0) - 10, y - 10, Math.max(x + ww * 0.92, hx1) + 10, Math.max(y + hh * 0.42, hy1) + 10]);
  }
  return out;
}
function frame(ts) {
  WX.raf = 0;
  if (!WX.list.size) return;
  WX.raf = requestAnimationFrame(frame);
  if (doc.hidden) return;
  if (ts - WX.last < 32) return;          // 30 프레임이면 충분(낮은 사양 크롬북)
  const dt = Math.min(0.08, (ts - (WX.last || ts)) / 1000) || 0.033;
  WX.last = ts;
  const t0 = performance.now();
  for (const w of [...WX.list]) {
    if (!w.cv.isConnected) { WX.list.delete(w); continue; }
    const r = sizeOf(w);
    w.faces = faceBoxes(w, r);   // 매 장마다(인물이 들어오며 움직이거나 창 크기가 바뀌어도 따라간다)
    draw(w, dt, ts / 1000, r);
  }
  WX.fps.push(performance.now() - t0); if (WX.fps.length > 120) WX.fps.splice(0, 60);
}
function hitFace(w, x0, y0, x1, y1) {
  for (const f of w.faces) if (x1 > f[0] && x0 < f[2] && y1 > f[1] && y0 < f[3]) return true;
  return false;
}
function draw(w, dt, t, r) {
  const g = w.cv.getContext('2d'), W = w.w, H = w.h;
  g.setTransform(w.dpr, 0, 0, w.dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  w.drawn.length = 0;
  const top = w.faces.length ? Math.min(...w.faces.map(f => f[1])) : H;   // 햇살은 가장 높은 머리보다 위에서만
  for (let i = 0; i < w.parts.length; i++) {
    let p = w.parts[i];
    let x0, y0, x1, y1;
    switch (p.k) {
      case 'rain': p.y += p.v * dt; p.x -= p.v * 0.12 * dt; if (p.y > H + 20) p = w.parts[i] = spawn(w, p.k); x0 = p.x - 2; y0 = p.y - p.l; x1 = p.x + 2; y1 = p.y; break;
      case 'snow': p.y += p.v * dt; p.x += Math.sin(t * 0.8 + p.ph) * 14 * dt; if (p.y > H + 8) p = w.parts[i] = spawn(w, p.k); x0 = p.x - p.s; y0 = p.y - p.s; x1 = p.x + p.s; y1 = p.y + p.s; break;
      case 'puff': p.x += (p.vx + Math.sin(t * 0.4 + p.ph) * 6) * dt; if (p.x < -20 || p.x > W + 20) p = w.parts[i] = spawn(w, p.k); x0 = p.x - p.s; y0 = p.y - p.s; x1 = p.x + p.s; y1 = p.y + p.s; break;
      case 'night':
        if (!p.star) { p.x += (p.vx + Math.sin(t + p.ph) * 8) * dt; p.y += (p.vy + Math.cos(t * 0.7 + p.ph) * 6) * dt; if (p.x < -10 || p.x > W + 10 || p.y < H * 0.25 || p.y > H + 10) p = w.parts[i] = spawn(w, p.k, true); }
        x0 = p.x - p.s * 3; y0 = p.y - p.s * 3; x1 = p.x + p.s * 3; y1 = p.y + p.s * 3; break;
      case 'petals': p.y += p.v * dt; p.x += Math.sin(t * 0.9 + p.ph) * 22 * dt; p.rot += dt * 1.4; if (p.y > H + 14) p = w.parts[i] = spawn(w, p.k); x0 = p.x - p.s * 1.4; y0 = p.y - p.s * 1.4; x1 = p.x + p.s * 1.4; y1 = p.y + p.s * 1.4; break;
      case 'glint': x0 = p.x - p.s * 2; y0 = p.y - p.s * 2; x1 = p.x + p.s * 2; y1 = p.y + p.s * 2; break;
      case 'bokeh': p.y += p.vy * dt; p.x += Math.sin(t * 0.5 + p.ph) * 5 * dt; if (p.y < H * 0.15) p = w.parts[i] = spawn(w, p.k); x0 = p.x - p.s; y0 = p.y - p.s; x1 = p.x + p.s; y1 = p.y + p.s; break;
      case 'rays': {
        const bottom = Math.min(H, top - 12);
        if (bottom < 30) continue;
        x0 = p.x; y0 = 0; x1 = p.x + p.wd + bottom * 0.45; y1 = bottom;
        g.save(); g.beginPath(); g.rect(0, 0, W, bottom); g.clip();
        const a = p.a * (0.6 + 0.4 * Math.sin(t * 0.35 + p.ph));
        const gr = g.createLinearGradient(0, 0, 0, bottom); gr.addColorStop(0, `rgba(255,246,210,${a})`); gr.addColorStop(1, 'rgba(255,246,210,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(p.x, 0); g.lineTo(p.x + p.wd, 0); g.lineTo(p.x + p.wd + bottom * 0.45, bottom); g.lineTo(p.x + bottom * 0.45, bottom); g.closePath(); g.fill(); g.restore();
        w.drawn.push({ left: r.left + x0, top: r.top + y0, right: r.left + x1, bottom: r.top + y1 });
        continue;
      }
      default: p.y -= p.v * dt; p.x += Math.sin(t * 0.5 + p.ph) * 6 * dt; if (p.y < -8) p = w.parts[i] = spawn(w, p.k); x0 = p.x - p.s * 2; y0 = p.y - p.s * 2; x1 = p.x + p.s * 2; y1 = p.y + p.s * 2;
    }
    if (hitFace(w, x0, y0, x1, y1)) continue;      // 머리 둘레는 건너뛴다(인물 뒤로 지나가는 것처럼)
    w.drawn.push({ left: r.left + x0, top: r.top + y0, right: r.left + x1, bottom: r.top + y1 });
    g.globalAlpha = p.a;
    switch (p.k) {
      case 'rain': g.strokeStyle = '#e8f2ff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p.x, p.y - p.l); g.lineTo(p.x - p.l * 0.12, p.y); g.stroke(); break;
      case 'snow': g.fillStyle = '#ffffff'; g.beginPath(); g.arc(p.x, p.y, p.s, 0, 6.283); g.fill(); break;
      case 'puff': { const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s); gr.addColorStop(0, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0); break; }
      case 'night': {
        const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * (p.star ? 1.3 : 2) + p.ph));
        g.globalAlpha = p.a * tw;
        if (p.star) { g.fillStyle = '#fff8dc'; g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
        else { const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * 3); gr.addColorStop(0, 'rgba(255,248,170,1)'); gr.addColorStop(0.35, 'rgba(214,240,120,.55)'); gr.addColorStop(1, 'rgba(214,240,120,0)'); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
        break;
      }
      case 'petals': g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = '#f7b6c6'; g.beginPath(); g.ellipse(0, 0, p.s * 1.3, p.s * 0.7, 0, 0, 6.283); g.fill(); g.restore(); break;
      case 'glint': {   // 물 반짝: 십자 빛
        const k = Math.max(0, Math.sin(t * p.sp + p.ph)); if (k < 0.2) break;
        g.globalAlpha = p.a * k; g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.beginPath();
        g.moveTo(p.x - p.s * 2 * k, p.y); g.lineTo(p.x + p.s * 2 * k, p.y); g.moveTo(p.x, p.y - p.s * 2 * k); g.lineTo(p.x, p.y + p.s * 2 * k); g.stroke(); break;
      }
      case 'bokeh': { g.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t + p.ph)); const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s); gr.addColorStop(0, 'rgba(255,190,210,.9)'); gr.addColorStop(1, 'rgba(255,190,210,0)'); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0); break; }
      default: g.fillStyle = '#fff3c8'; g.globalAlpha = p.a * (0.5 + 0.5 * Math.sin(t * 1.5 + p.ph)); g.beginPath(); g.arc(p.x, p.y, p.s, 0, 6.283); g.fill();
    }
  }
  g.globalAlpha = 1;
}
