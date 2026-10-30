// 진행판 · 크롬북이 함께 쓰는 작은 도구 (DOM 없음 → node 시험 가능)

export const ROOT = 'vn/rooms';          // 대결 판의 /rooms 와 섞이지 않게 따로 둔다
export const MAX_NUM = 30;
export const DAY_MS = 24 * 3600 * 1000;
export const MAX_REFL = 200;             // 성찰 한 칸 글자 수(규칙은 300까지 받는다)

export const REFL_Q = [
  // short = 큰 화면에 크게 보일 핵심 질문 · term = 배울 낱말(작은 부제) · q = 자세한 질문
  { k: 'q1', tag: '의미', short: '비싸고 새것 vs 마을에 딱 맞는 것', term: '마을에 딱 맞는 기술 = 적정 기술',
    q: '우리 이야기에서 「비싸고 새것」과 「마을에 딱 맞는 것」이 갈린 선택 하나를 골라, 무엇이 달랐는지 써 보자.' },
  { k: 'q2', tag: '지속가능 발전', short: '졸업 뒤에도 남을 기술은?', term: '',
    q: '우리가 졸업한 뒤에도 루미타에 남아 계속 쓰일 기술은 무엇일까? 왜 계속 쓰일 수 있을까?' },
  { k: 'q3', tag: '다음 차시', short: '우리 동네 불편, 어떻게 풀까?', term: '',
    q: '우리 학교나 동네의 불편 하나를 골라, 「먼저 묻기 · 그곳 재료 · 쉬운 수리 · 싼 값 · 오래」 중 두 가지를 넣어 해결 방법을 한 줄로 써 보자.' },
];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function parseJSON(s, fallback = null) {
  if (typeof s !== 'string') return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}
/** 4자리 방 코드 (첫 자리 1~8 — 9xxx 는 시험용) */
export function newRoomCode(rnd = Math.random, test = false) {
  const first = test ? 9 : 1 + Math.floor(rnd() * 8);
  return String(first) + String(Math.floor(rnd() * 1000)).padStart(3, '0');
}
/** 기기 표시(K7 같은 두 글자). 같은 번호가 두 기기일 때 교사가 구분하는 데 쓴다. 개인정보 아님 */
export function devTag(uid) {
  let h = 2166136261;
  for (const c of String(uid || '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return L[h % L.length] + String(Math.floor(h / L.length) % 9 + 1);
}
export const CIRCLED = ['', '①', '②', '③', '④'];

/** 공정한 난수 0..n-1 (crypto 가 있으면 그것으로) */
export function randInt(n) {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  } catch { return Math.floor(Math.random() * n); }
}
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** 개인 모드 진행 기록(크롬북 → DB) 한 칸 검사용: 진행 단계 st(고른 갈림길 수 0~11) → 학년 */
export function gradeOf(st, e) {
  if (e) return 4;          // 졸업
  if (st < 4) return 1;     // V1~V4 고르는 중
  if (st < 7) return 2;     // V5~V7
  return 3;                 // V8~V11
}
export const GRADE_LABEL = ['', '중1', '중2', '중3', '졸업'];

export const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

/** 시간 배속(시험용): ?speed=10 이면 진행판의 모든 기다림이 10배 빠르다 */
export function speedFactor() {
  try {
    const v = Number(new URLSearchParams(location.search).get('speed'));
    return v > 0 && v <= 200 ? v : 1;
  } catch { return 1; }
}
