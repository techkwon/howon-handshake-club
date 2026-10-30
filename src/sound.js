// 소리 — 배경 음악(BGM) 5곡과 효과음(SFX)을 Web Audio 로 코드에서 바로 만든다(내려받는 파일 없음 · 저작권 걱정 없음).
//   여는 곡(타이틀 · 수업 설정 · 대기실) → 본 이야기 곡 3개 중 교사가 고른 것 → 엔딩 곡(엔딩 장면 · 엔딩 카드 · 성찰)
//   장면 분위기(낮 · 밤 · 문제)는 곡을 바꾸지 않고 소리 크기 · 밝기(저역 통과 필터)만 바꾼다.
// 브라우저 자동 재생 규칙: 사용자가 처음 누를 때(누르기 · 키) 소리 장치를 만든다. 탭이 숨으면 멈춘다.
// 설정(BGM · SFX 켜기, 크기, 곡 번호)은 이 기기 localStorage 에만(시도 · 실패해도 됨).
import { LS } from './shared.js';

// ── 곡 악보 ─────────────────────────────────────────────────────
// 화음 이름(C · Am · F/A · Bbmaj7 · Em7 · C7 · D/F#)과 마디마다 선율(「음이름:박」, r = 쉼).
// beats = 한 마디 박 수, sub = 한 박을 몇 칸으로 나눠 반주하는지, swing = 뒷박을 늦추는 정도(0~0.33)
export const TRACKS = {
  open: {
    name: '여는 이야기', kind: 'open', bpm: 92, beats: 3, sub: 1,
    voice: 'box', arp: 'celesta', bassV: 'bass', pad: 'soft', padLvl: 0.5,
    chords: 'G D/F# Em C G D C D Em C G D Em C Am D G D/F# Em C Am D G G',
    mel: [
      'D5:1 G5:1 B5:1', 'A5:2 F#5:1', 'G5:1 E5:1 B4:1', 'C5:2 E5:1',
      'D5:1 G5:1 B5:1', 'A5:1 D6:1 A5:1', 'G5:1 E5:1 C5:1', 'D5:3',
      'E5:1 G5:1 B5:1', 'C6:2 G5:1', 'B5:1 A5:1 G5:1', 'F#5:2 A5:1',
      'G5:1 E5:1 G5:1', 'E5:1 C5:1 E5:1', 'A5:2 E5:1', 'F#5:1 E5:1 D5:1',
      'D5:1 G5:1 B5:1', 'A5:2 F#5:1', 'G5:1 E5:1 B4:1', 'C5:2 E5:1',
      'C5:1 E5:1 A5:1', 'F#5:2 A5:1', 'G5:3', 'r:3'],
    arpPat: [[null, [1, 2], [1, 2]]],      // 쿵 · 짝 · 짝(왈츠): 둘째 · 셋째 박에 화음 위 두 음
    bassHits: [0],
  },
  m1: {
    name: '봄 교정', kind: 'main', bpm: 84, beats: 4, sub: 2,
    voice: 'box', arp: 'pluck', bassV: 'bass', pad: 'soft', padLvl: 0.55,
    chords: 'C Am F G C Em F G Am Em F C Dm G C G',
    mel: [
      'E5:1 G5:1 C6:2', 'B5:1 A5:1 E5:2', 'F5:1 A5:1 C6:1 A5:1', 'G5:3 r:1',
      'E5:1 G5:1 E5:1 C5:1', 'B4:1 E5:1 G5:2', 'A5:1 G5:1 F5:1 A5:1', 'G5:2 D5:2',
      'C6:1 B5:1 A5:2', 'G5:1 E5:1 B4:2', 'A5:1 C6:1 F5:2', 'E5:1 D5:1 C5:2',
      'D5:1 F5:1 A5:2', 'B5:1 A5:1 G5:1 F5:1', 'E5:2 G5:1 E5:1', 'D5:3 r:1'],
    arpPat: [[0, 1, 2, 1, 3, 2, 1, 2], [0, null, 2, null, 1, 3, 2, null]],   // 8분음표 하프 펼침(두 무늬 번갈아)
    bassHits: [0, 2],
  },
  m2: {
    name: '루미타 바람', kind: 'main', bpm: 200, beats: 6, sub: 1,   // 6/8 (한 「박」= 8분음표)
    voice: 'marimba', arp: 'pluck', bassV: 'pluckBass', pad: 'none', padLvl: 0, shaker: true,
    chords: 'D C G D D C Bm A G D C D Bm G A A D C G D G A D D',
    mel: [
      'A4:2 D5:1 F#5:2 E5:1', 'E5:3 G5:2 E5:1', 'D5:2 B4:1 G4:3', 'F#5:3 D5:3',
      'A5:2 F#5:1 A5:2 D6:1', 'C6:3 G5:3', 'F#5:2 D5:1 B4:3', 'C#5:2 E5:1 A5:3',
      'B5:2 A5:1 G5:2 D5:1', 'F#5:3 A5:3', 'G5:2 E5:1 C5:3', 'D5:6',
      'D5:2 F#5:1 B5:3', 'B5:2 G5:1 D5:3', 'E5:2 A5:1 C#6:3', 'A5:3 r:3',
      'A4:2 D5:1 F#5:2 E5:1', 'E5:3 G5:2 E5:1', 'D5:2 B4:1 G4:3', 'F#5:3 D5:3',
      'G5:2 B5:1 D6:3', 'C#6:2 A5:1 E5:3', 'D6:3 A5:3', 'D5:3 r:3'],
    arpPat: [[0, null, 1, 2, null, 1]],   // 기타 손가락 퉁김(6/8)
    bassHits: [0, 3],
  },
  m3: {
    name: '동아리방 오후', kind: 'main', bpm: 70, beats: 4, sub: 2, swing: 0.17,
    voice: 'rhodes', arp: 'rhodes', bassV: 'bass', pad: 'soft', padLvl: 0.35, beat: true,
    chords: 'Fmaj7 Em7 Dm7 Cmaj7 Bbmaj7 Am7 Gm7 C7 Fmaj7 Am7 Dm7 Gm7 Bbmaj7 C7 Fmaj7 C7',
    mel: [
      'C5:1.5 E5:0.5 A5:2', 'G5:1.5 D5:0.5 B4:2', 'A4:1 C5:1 F5:1 E5:1', 'G5:3 r:1',
      'F5:1.5 A5:0.5 D5:2', 'E5:1.5 G5:0.5 C5:2', 'Bb4:1 D5:1 F5:1 G5:1', 'E5:2 r:2',
      'A5:1 G5:0.5 F5:0.5 E5:2', 'C6:1.5 A5:0.5 E5:2', 'F5:1 A5:1 C6:1 A5:1', 'Bb5:1.5 A5:0.5 G5:2',
      'D5:1 F5:1 A5:2', 'G5:1 E5:1 Bb4:2', 'A4:1 C5:1 E5:1 F5:1', 'G5:2 E5:2'],
    comp: [0, 1.5, 3],                     // 왼손 화음을 1 · 2와 · 4 박에(느슨한 로파이 리듬)
    bassHits: [0, 2.5],
  },
  end: {
    name: '졸업 편지', kind: 'end', bpm: 64, beats: 4, sub: 2,
    voice: 'piano', arp: 'piano', bassV: 'bass', pad: 'strings', padLvl: 0.8,
    chords: 'F C/E Dm Bb F/A Gm C C Dm Am Bb F/A Gm C F F',
    mel: [
      'C5:1 F5:1 A5:2', 'G5:1 E5:1 C5:2', 'D5:1 F5:1 A5:1 C6:1', 'Bb5:2 A5:1 F5:1',
      'A5:1.5 G5:0.5 F5:2', 'G5:1 Bb5:1 D6:2', 'C6:1 Bb5:1 G5:1 E5:1', 'G5:4',
      'F5:1 A5:1 D6:2', 'C6:1 A5:1 E5:2', 'D6:1 C6:1 Bb5:1 A5:1', 'A5:2 F5:2',
      'G5:1 A5:1 Bb5:1 D6:1', 'C6:2 E5:1 G5:1', 'F5:4', 'r:4'],
    arpPat: [[0, 2, 1, 3, 0, 2, 1, 3]],
    bassHits: [0],
  },
};
export const MAIN_IDS = ['m1', 'm2', 'm3'];
export const MAIN_NAMES = MAIN_IDS.map(id => TRACKS[id].name);

// ── 음 이름 · 화음 ───────────────────────────────────────────────
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midiOf(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  return (Number(m[3]) + 1) * 12 + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const QUAL = { maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], m: [0, 3, 7], sus4: [0, 5, 7], '': [0, 4, 7] };
/** 'Bbmaj7' · 'D/F#' → { bass(36~47), tones(가운데 음역 4음 이하) } */
export function chordOf(sym) {
  const [main, slash] = sym.split('/');
  const m = /^([A-G][#b]?)(maj7|m7|sus4|7|m)?$/.exec(main);
  const pcOf = s => ((PC[s[0]] + (s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0)) + 12) % 12;
  const root = pcOf(m[1]);
  const iv = QUAL[m[2] || ''];
  let r = 48 + root; if (r > 55) r -= 12;              // 화음 뿌리 F3(53) 언저리
  const tones = iv.map(i => r + i + 12);                // 반주는 한 옥타브 위(G3~E5)
  const bp = slash ? pcOf(slash) : root;
  let bass = 36 + bp; if (bass > 45) bass -= 12;
  return { bass, tones };
}
export function parseMel(s) {
  const out = []; let t = 0;
  for (const tok of s.trim().split(/\s+/)) {
    const [n, d] = tok.split(':'); const dur = Number(d);
    if (n !== 'r') out.push({ t, midi: midiOf(n), dur });
    t += dur;
  }
  return { notes: out, len: t };
}
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

// ── 소리 장치 ────────────────────────────────────────────────────
const MOODS = {   // 장면 분위기: 밝기(Hz) · 크기
  day: { f: 9000, g: 1 }, night: { f: 2400, g: 0.72 }, tension: { f: 1500, g: 0.8 },
};
const S = {
  page: 'host', key: 'vn.snd.host', locked: true,
  pref: { bgm: true, sfx: true, bgmVol: 0.35, sfxVol: 0.5, track: 'm1', motion: 'hi' },
  amb: null, ambNode: null, log: [],
  ctx: null, master: null, bgmBus: null, sfxBus: null, verbM: null, verbS: null, mSend: null, noise: null,
  want: null,        // 지금 틀어야 하는 곡 id(open · m1~3 · end) — 소리가 꺼져 있어도 기억한다
  mood: 'day', cur: null, timer: null, hidden: typeof document !== 'undefined' && !!document.hidden, measuring: false, listeners: new Set(),
};

export const MOTIONS = [['hi', '상'], ['mid', '중'], ['lo', '하'], ['off', '끄기']];
const clamp01 = v => Math.min(1, Math.max(0, Number(v) || 0));
export function initSound({ page, defaults = {}, locked = false } = {}) {
  S.page = page; S.key = 'vn.snd.' + page; S.locked = !!locked;
  const saved = LS.get(S.key, {});
  if (saved.vol != null && saved.bgmVol == null) { saved.bgmVol = saved.vol; saved.sfxVol = saved.vol; }   // 옛 설정(크기 하나) 옮기기
  delete saved.vol;
  // 움직임 처음 값: 저장된 값 > 컴퓨터의 「움직임 줄이기」(끄기) > 화면별 기본값
  let osReduce = false; try { osReduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch {}
  S.pref = { ...S.pref, ...defaults, ...(osReduce ? { motion: 'off' } : {}), ...saved };
  if (!MAIN_IDS.includes(S.pref.track)) S.pref.track = 'm1';
  if (!MOTIONS.some(([k]) => k === S.pref.motion)) S.pref.motion = 'hi';
  S.pref.bgmVol = clamp01(S.pref.bgmVol); S.pref.sfxVol = clamp01(S.pref.sfxVol);
  applyMotion();
  const unlock = () => { if (!S.locked && (S.pref.bgm || S.pref.sfx)) ensure(); };
  for (const ev of ['pointerdown', 'keydown', 'click']) document.addEventListener(ev, unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    S.hidden = document.hidden;
    if (!S.ctx) return;
    if (S.hidden) S.ctx.suspend().catch(() => {});
    else if (!S.locked && (S.pref.bgm || S.pref.sfx)) S.ctx.resume().catch(() => {});
  });
  window.__vnSound = { state: soundState, set: setSound, play, music, measure, ambience, TRACKS, log: S.log };
}

export function soundState() {
  return {
    page: S.page, locked: S.locked, bgm: S.pref.bgm, sfx: S.pref.sfx, bgmVol: S.pref.bgmVol, sfxVol: S.pref.sfxVol, track: S.pref.track, motion: S.pref.motion,
    want: S.want, playing: S.cur ? S.cur.id : null, mood: S.mood, ctx: S.ctx ? S.ctx.state : 'none', amb: S.amb, ambOn: !!S.ambNode,
  };
}
export function onSoundChange(f) { S.listeners.add(f); return () => S.listeners.delete(f); }
const changed = () => S.listeners.forEach(f => { try { f(soundState()); } catch {} });

/** 잠금(전체 모드 학생 크롬북): 소리 장치를 만들지 않고, 있던 소리도 끈다 */
export function setLocked(v) {
  S.locked = !!v;
  if (S.locked && S.ctx && !S.measuring) {   // 잠금: 이미 예약된 효과음 · 잔향까지 바로 끊는다
    const t = S.ctx.currentTime;
    S.master.gain.cancelScheduledValues(t); S.master.gain.setValueAtTime(0, t);
    S.ctx.suspend().catch(() => {});
  }
  if (S.locked) { stopMusic(); syncAmb(); }
  else if (S.ctx) { applyLevels(); if (!S.hidden && (S.pref.bgm || S.pref.sfx)) S.ctx.resume().catch(() => {}); syncMusic(); }
  changed();
}

export function setSound(patch) {
  Object.assign(S.pref, patch);
  if (patch.bgmVol != null) S.pref.bgmVol = clamp01(patch.bgmVol);
  if (patch.sfxVol != null) S.pref.sfxVol = clamp01(patch.sfxVol);
  if (patch.track && !MAIN_IDS.includes(S.pref.track)) S.pref.track = 'm1';
  if (patch.motion) { if (!MOTIONS.some(([k]) => k === S.pref.motion)) S.pref.motion = 'hi'; applyMotion(); }
  LS.set(S.key, S.pref);
  if (!S.locked && (S.pref.bgm || S.pref.sfx)) ensure();
  if (S.ctx) applyLevels();
  if ('track' in patch && S.want && TRACKS[S.want] && TRACKS[S.want].kind === 'main') S.want = S.pref.track;
  syncMusic(); syncAmb();
  changed();
}
/** 움직임 단계: <html data-motion="hi|mid|lo|off"> — 효과(fx.js) · CSS 가 이것만 본다. 바뀌면 'vn-motion' 알림 */
function applyMotion() {
  try { document.documentElement.dataset.motion = S.pref.motion; window.dispatchEvent(new CustomEvent('vn-motion', { detail: S.pref.motion })); } catch {}
}

function ensure() {
  if (S.locked || S.measuring) return null;
  if (!S.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { S.ctx = new AC(); } catch { return null; }
    buildGraph(S.ctx);
    applyLevels(true);
    if (S.hidden) S.ctx.suspend().catch(() => {});
    syncMusic(); syncAmb();
    changed();
  } else if (S.ctx.state === 'suspended' && !S.hidden) S.ctx.resume().catch(() => {});
  return S.ctx;
}
/** 소리 길(공용): 곡 → 분위기 필터 → BGM 통로 ┐
 *                     효과음 → 효과음 통로   ┴→ 전체 크기 → 압축기(갑자기 커지지 않게) → 스피커 */
function buildGraph(c) {
  S.master = c.createGain();
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
  S.master.connect(comp); comp.connect(c.destination);
  S.bgmBus = c.createGain(); S.sfxBus = c.createGain();
  S.moodF = c.createBiquadFilter(); S.moodF.type = 'lowpass'; S.moodF.Q.value = 0.5; S.moodF.frequency.value = MOODS.day.f;
  S.moodG = c.createGain();
  S.moodF.connect(S.moodG); S.moodG.connect(S.bgmBus);
  S.bgmBus.connect(S.master); S.sfxBus.connect(S.master);
  // 작은 울림(잔향): 음악은 곡 크기(out) 뒤에서, 효과음은 효과음 통로 안에서 — 끄면 울림도 같이 꺼진다
  const ir = impulse(c, 2.2);
  S.verbM = c.createConvolver(); S.verbM.buffer = ir; S.mSend = c.createGain(); S.mSend.gain.value = 0.3;
  S.mSend.connect(S.verbM); S.verbM.connect(S.moodF);
  S.verbS = c.createConvolver(); S.verbS.buffer = ir; S.verbS.connect(S.sfxBus);
  S.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = S.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
/** 점검용: 곡 하나(또는 효과음 하나)를 소리 없이 미리 만들어 크기를 잰다 → { peak, rms(dBFS) }. 실제 소리 장치는 건드리지 않는다 */
export async function measure(id, { sec = 24, vol = null, sfx = null } = {}) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const keep = { ...S };
  const c = new OAC(2, Math.round(44100 * sec), 44100);
  // 오프라인 그래프에 예약하는 동안만(동기 · 한순간) S 를 빌려 쓰고, 렌더링을 기다리기 **전에** 실제 소리 상태로 되돌린다
  try {
    S.ctx = c; S.measuring = true; buildGraph(c);
    const v = vol == null ? (sfx ? S.pref.sfxVol : S.pref.bgmVol) : vol;
    S.master.gain.value = 1; S.bgmBus.gain.value = BGM_BUS * masterGain(v); S.sfxBus.gain.value = SFX_BUS * masterGain(v);
    if (sfx) SFX[sfx](c, 0.05, {});
    else {
      const out = c.createGain(); out.connect(S.moodF); out.connect(S.mSend);
      const tr = TRACKS[id];
      const p = { id, tr, out, bar: 0, next: 0.05, spb: 60 / tr.bpm, chords: tr.chords.split(' ').map(chordOf), mel: tr.mel.map(parseMel) };
      while (p.next < sec) { scheduleBar(p, p.bar % p.chords.length, p.next); p.next += tr.beats * p.spb; p.bar++; }
    }
  } finally { for (const k of Object.keys(S)) if (!(k in keep)) delete S[k]; Object.assign(S, keep); S.measuring = false; }
  const buf = await c.startRendering();
  let pk = 0, sum = 0, n = 0;
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; sum += d[i] * d[i]; n++; } }
  const db = x => Math.round(20 * Math.log10(Math.max(1e-9, x)) * 10) / 10;
  return { peak: db(pk), rms: db(Math.sqrt(sum / n)) };
}
function impulse(c, sec) {
  const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
  return b;
}
const BGM_BUS = 0.55, SFX_BUS = 1.6;
/** 크기 슬라이더(0~1) → 전체 크기. 귀에 맞게 1.5제곱(작은 쪽을 세밀하게) */
const masterGain = v => Math.pow(Math.min(1, Math.max(0, v)), 1.5) * 2.2;
function applyLevels(now = false) {
  const c = S.ctx, t = c.currentTime, k = now ? 0.01 : 0.3;
  const on = !S.locked;
  S.master.gain.setTargetAtTime(on ? 1 : 0, t, k);
  S.bgmBus.gain.setTargetAtTime(on && S.pref.bgm ? BGM_BUS * masterGain(S.pref.bgmVol) : 0, t, k);
  S.sfxBus.gain.setTargetAtTime(on && S.pref.sfx ? SFX_BUS * masterGain(S.pref.sfxVol) : 0, t, k);
}

// ── 배경 음악 ────────────────────────────────────────────────────
/** 어떤 곡을 틀지 알린다: kind = 'open' | 'main' | 'end', mood = 'day' | 'night' | 'tension' */
export function music(kind, mood = 'day') {
  const id = kind === 'main' ? S.pref.track : kind === 'end' ? 'end' : kind === 'open' ? 'open' : null;
  const moodChanged = mood !== S.mood;
  S.mood = MOODS[mood] ? mood : 'day';
  if (kind !== 'main') ambience(null);
  if (id !== S.want || moodChanged) { S.want = id; syncMusic(); changed(); }
}
function stopMusic() {
  if (S.cur) fadeOut(S.cur);
  S.cur = null;
  if (S.timer) { clearInterval(S.timer); S.timer = null; }
}
function fadeOut(p) {
  const t = S.ctx.currentTime;
  p.out.gain.cancelScheduledValues(t);
  p.out.gain.setValueAtTime(p.out.gain.value, t);
  p.out.gain.linearRampToValueAtTime(0, t + 1.6);
  setTimeout(() => { try { p.out.disconnect(); } catch {} }, 6000);
}
function syncMusic() {
  if (!S.ctx || S.locked || S.measuring) return;
  const m = MOODS[S.mood] || MOODS.day, t = S.ctx.currentTime;
  S.moodF.frequency.setTargetAtTime(m.f, t, 0.8);
  S.moodG.gain.setTargetAtTime(m.g, t, 0.8);
  const id = S.pref.bgm ? S.want : null;
  if ((S.cur && S.cur.id) === id) return;
  if (S.cur) fadeOut(S.cur);
  S.cur = null;
  if (!id || !TRACKS[id]) { if (S.timer) { clearInterval(S.timer); S.timer = null; } return; }
  const out = S.ctx.createGain();
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(1, t + 2.2);
  out.connect(S.moodF); out.connect(S.mSend);
  const tr = TRACKS[id];
  S.cur = { id, tr, out, bar: 0, next: t + 0.15, spb: 60 / tr.bpm, chords: tr.chords.split(' ').map(chordOf), mel: tr.mel.map(parseMel) };
  if (!S.timer) S.timer = setInterval(tick, 250);
  tick();
}
function tick() {
  if (S.measuring) return;          // 점검(measure) 중에는 실제 음악 예약을 잠깐 쉰다
  const p = S.cur;
  if (!p || !S.ctx) return;
  // 1.2초 앞까지 마디 단위로 미리 예약한다(탭이 숨어 타이머가 느려져도 끊기지 않게)
  while (p.next < S.ctx.currentTime + 1.2) {
    scheduleBar(p, p.bar % p.chords.length, p.next);
    p.next += p.tr.beats * p.spb; p.bar++;
  }
}
function scheduleBar(p, i, t0) {
  const tr = p.tr, spb = p.spb, ch = p.chords[i], c = S.ctx, out = p.out;
  const nb = p.chords[(i + 1) % p.chords.length];
  const at = beat => {           // 박 → 시각(뒷박 스윙)
    const frac = beat % 1;
    return t0 + (beat + (tr.swing && Math.abs(frac - 0.5) < 1e-6 ? tr.swing : 0)) * spb;
  };
  const hum = () => (Math.random() - 0.5) * 0.012;
  const barLen = tr.beats * spb;
  // 선율
  // 되풀이마다 조금씩 다르게(30분 수업에서 같은 소리가 덜 들리게): 1바퀴 그대로 · 2바퀴 선율을 반주 악기 소리로 · 3바퀴 앞 절반은 반주만(쉼)
  const pass = Math.floor(p.bar / p.chords.length) % 3, half = p.chords.length / 2;
  const mv = pass === 1 && tr.arp !== tr.voice ? tr.arp : tr.voice;
  if (!(pass === 2 && i < half)) for (const n of p.mel[i].notes) VOICE[mv](c, out, at(n.t) + hum(), hz(n.midi), n.dur * spb, (n.t === 0 ? 1 : 0.85) * (mv === tr.voice ? 1 : 1.5));
  // 반주(펼침화음 · 왈츠 · 로파이 왼손)
  if (tr.arpPat) {
    const pat = tr.arpPat[(Math.floor(i / 2) + pass) % tr.arpPat.length];
    const steps = pat.length, stepLen = tr.beats / steps;
    const tones = [...ch.tones, ...ch.tones.map(x => x + 12)];
    pat.forEach((ix, s) => {
      if (ix == null) return;
      for (const j of Array.isArray(ix) ? ix : [ix]) VOICE[tr.arp](c, out, at(s * stepLen) + hum(), hz(tones[j % tones.length]), stepLen * spb * 1.6, s === 0 ? 0.8 : 0.6, true);
    });
  }
  if (tr.comp) for (const b of tr.comp) for (const m of ch.tones) VOICE.rhodes(c, out, at(b) + hum() * 2, hz(m - 12 + (m < 57 ? 12 : 0)), 1.2 * spb, 0.45, true);
  // 베이스
  for (const b of tr.bassHits || []) VOICE[tr.bassV](c, out, at(b), hz(ch.bass), Math.min(barLen - b * spb, 2 * spb), b === 0 ? 1 : 0.7);
  // 바탕 화음(패드): 마디 내내, 다음 마디와 살짝 겹침
  if (tr.pad !== 'none') for (const m of ch.tones.slice(0, 3)) pad(c, out, t0, hz(m), barLen, tr.padLvl, tr.pad === 'strings');
  // 타악(아주 작게)
  if (tr.shaker) for (let s = 0; s < tr.beats; s++) noiseHit(c, out, at(s), s % 3 === 0 ? 0.018 : 0.011, 'bandpass', 5200, 0.06);
  if (tr.beat) {
    kick(c, out, at(0)); kick(c, out, at(2.5), 0.6);
    for (const b of [1, 3]) noiseHit(c, out, at(b), 0.02, 'highpass', 6500, 0.09);
    for (const b of [0.5, 1.5, 2.5, 3.5]) noiseHit(c, out, at(b), 0.008, 'highpass', 8000, 0.04);
  }
  void nb;
}

// ── 악기(모두 부드럽게 · 빠른 붙임 · 자연 감쇠) ───────────────────
function env(c, t, peak, attack, decay) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}
function osc(c, type, f, t, stop, dest, detune = 0) {
  const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
  o.connect(dest); o.start(t); o.stop(stop); return o;
}
function sendS(c, g, amt) { const s = c.createGain(); s.gain.value = amt; g.connect(s); s.connect(S.verbS); }
const VOICE = {
  box(c, out, t, f, dur, v = 1) {         // 오르골: 사인 + 살짝 어긋난 2배음(금속 떨림)
    const g = env(c, t, 0.11 * v, 0.004, 1.7); g.connect(out);
    osc(c, 'sine', f, t, t + 1.8, g);
    const g2 = env(c, t, 0.025 * v, 0.003, 0.5); g2.connect(out);
    osc(c, 'sine', f * 2.01, t, t + 0.6, g2);
  },
  celesta(c, out, t, f, dur, v = 1) {
    const g = env(c, t, 0.045 * v, 0.004, 1.0); g.connect(out);
    osc(c, 'sine', f, t, t + 1.1, g);
    const g2 = env(c, t, 0.006 * v, 0.002, 0.2); g2.connect(out); osc(c, 'sine', f * 4, t, t + 0.3, g2);
  },
  marimba(c, out, t, f, dur, v = 1) {     // 나무 건반: 사인 + 빨리 사라지는 4배음
    const g = env(c, t, 0.13 * v, 0.003, 0.75); g.connect(out);
    osc(c, 'sine', f, t, t + 0.8, g);
    const g2 = env(c, t, 0.03 * v, 0.002, 0.07); g2.connect(out);
    osc(c, 'sine', f * 4, t, t + 0.1, g2);
  },
  pluck(c, out, t, f, dur, v = 1) {       // 손가락으로 퉁긴 줄: 삼각파 + 닫히는 필터
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(2800, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    const g = env(c, t, 0.05 * v, 0.004, Math.min(1.4, Math.max(0.5, dur))); lp.connect(g); g.connect(out);
    osc(c, 'triangle', f, t, t + 1.5, lp);
  },
  pluckBass(c, out, t, f, dur, v = 1) {
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const g = env(c, t, 0.13 * v, 0.006, Math.min(1.1, dur)); lp.connect(g); g.connect(out);
    osc(c, 'triangle', f, t, t + 1.2, lp);
  },
  rhodes(c, out, t, f, dur, v = 1) {      // 전자 피아노: 두 사인을 살짝 어긋나게(합창 느낌)
    const d = Math.min(2.6, Math.max(0.8, dur * 1.4));
    const g = env(c, t, 0.06 * v, 0.008, d); g.connect(out);
    osc(c, 'sine', f, t, t + d + 0.1, g, -4); osc(c, 'sine', f, t, t + d + 0.1, g, 4);
    const g2 = env(c, t, 0.012 * v, 0.004, 0.25); g2.connect(out);
    osc(c, 'sine', f * 3, t, t + 0.3, g2);
  },
  piano(c, out, t, f, dur, v = 1) {
    const d = Math.min(3, Math.max(1, dur * 1.5));
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(900, t + d);
    const g = env(c, t, 0.075 * v, 0.005, d); lp.connect(g); g.connect(out);
    osc(c, 'triangle', f, t, t + d + 0.1, lp); osc(c, 'sine', f, t, t + d + 0.1, lp);
  },
  bass(c, out, t, f, dur, v = 1) {
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = env(c, t, 0.12 * v, 0.02, Math.max(0.5, dur)); lp.connect(g); g.connect(out);
    osc(c, 'triangle', f, t, t + dur + 0.6, lp);
  },
};
function pad(c, out, t, f, len, lvl, strings) {
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = strings ? 1300 : 900;
  const g = c.createGain(), pk = 0.018 * lvl;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(pk, t + Math.min(0.9, len * 0.3));
  g.gain.setValueAtTime(pk, t + len * 0.85);
  g.gain.linearRampToValueAtTime(0.0001, t + len + 0.5);
  lp.connect(g); g.connect(out);
  const type = strings ? 'sawtooth' : 'triangle';
  osc(c, type, f, t, t + len + 0.6, lp, -6); osc(c, type, f, t, t + len + 0.6, lp, 6);
}
function noiseHit(c, out, t, lvl, type, freq, dec) {
  const s = c.createBufferSource(); s.buffer = S.noise;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = env(c, t, lvl, 0.002, dec);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.05);
}
function kick(c, out, t, v = 1) {
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  const g = env(c, t, 0.12 * v, 0.004, 0.28); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.35);
}

// ── 효과음 ───────────────────────────────────────────────────────
const bell = (c, t, m, lvl, dec = 1.2) => {
  const f = hz(m), g = env(c, t, lvl, 0.004, dec); g.connect(S.sfxBus); sendS(c, g, 0.4);
  osc(c, 'sine', f, t, t + dec + 0.1, g);
  const g2 = env(c, t, lvl * 0.25, 0.003, dec * 0.35); g2.connect(S.sfxBus); osc(c, 'sine', f * 2.01, t, t + dec * 0.4, g2);
};
const SFX = {
  tick(c, t) { const g = env(c, t, 0.022, 0.002, 0.05); g.connect(S.sfxBus); osc(c, 'triangle', 1400, t, t + 0.08, g); },
  hover(c, t) { bell(c, t, 88, 0.018, 0.18); },
  select(c, t) { bell(c, t, 76, 0.06, 0.5); bell(c, t + 0.07, 83, 0.05, 0.7); },
  voteOpen(c, t) { [72, 76, 79].forEach((m, i) => bell(c, t + i * 0.09, m, 0.06, 0.9)); },
  count(c, t, o = {}) { const g = env(c, t, 0.05, 0.002, 0.09); g.connect(S.sfxBus); osc(c, 'sine', o.last ? 1320 : 990, t, t + 0.12, g); },
  reveal(c, t) {
    const s = c.createBufferSource(); s.buffer = S.noise; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.4);
    const g = env(c, t, 0.03, 0.2, 0.25); s.connect(f); f.connect(g); g.connect(S.sfxBus); s.start(t); s.stop(t + 0.5);
    [72, 76, 79, 84].forEach((m, i) => bell(c, t + 0.35 + i * 0.06, m, 0.055, 1.4));
  },
  tie(c, t) { bell(c, t, 79, 0.05, 0.4); bell(c, t + 0.22, 79, 0.05, 0.4); bell(c, t + 0.44, 77, 0.04, 0.7); },
  dice(c, t, o = {}) {
    const n = Math.round((o.dur || 1.6) / 0.09);
    for (let i = 0; i < n; i++) noiseHit(c, S.sfxBus, t + i * 0.09 + Math.random() * 0.03, 0.045, 'bandpass', 2200 + Math.random() * 1200, 0.03);
  },
  diceStop(c, t) { kick(c, S.sfxBus, t, 0.6); bell(c, t + 0.05, 79, 0.06, 0.8); bell(c, t + 0.12, 84, 0.05, 1.0); },
  stat(c, t) { [79, 83, 86].forEach((m, i) => bell(c, t + i * 0.07, m, 0.035, 0.5)); },
  note(c, t) { bell(c, t, 81, 0.04, 0.4); bell(c, t + 0.12, 84, 0.035, 0.6); },
  whoosh(c, t) {
    const s = c.createBufferSource(); s.buffer = S.noise; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.45);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    s.connect(f); f.connect(g); g.connect(S.sfxBus); s.start(t, Math.random() * 0.3); s.stop(t + 0.6);
  },
  tech(c, t) {
    noiseHit(c, S.sfxBus, t, 0.03, 'highpass', 3000, 0.02);   // 딸깍
    const g = env(c, t + 0.03, 0.03, 0.15, 0.6); g.connect(S.sfxBus);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(600, t + 0.03); o.frequency.exponentialRampToValueAtTime(1200, t + 0.4);
    o.connect(g); o.start(t + 0.03); o.stop(t + 0.8);
    [79, 84, 88].forEach((m, i) => bell(c, t + 0.25 + i * 0.08, m, 0.045, 1.1));
  },
  ending(c, t) { [65, 69, 72, 77, 81].forEach((m, i) => bell(c, t + i * 0.16, m, 0.06, 2.6)); },
  shake(c, t) { kick(c, S.sfxBus, t, 0.5); },
  // ── 움직임 효과 짝 소리(2026-10-30) — 모두 짧고(≤0.6초, 부풀기 · 환경음 빼고) 작게 · 높은 쇳소리 없이 ──
  speak(c, t) { const g = env(c, t, 0.012, 0.002, 0.04); g.connect(S.sfxBus); osc(c, 'triangle', 990, t, t + 0.06, g); },          // 말하는 사람 바뀜: 아주 작은 톡
  chapter(c, t) {                                                                                                               // 장 제목: 붓 쓱 + 맑은 종
    const s = c.createBufferSource(); s.buffer = S.noise; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.35);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    s.connect(f); f.connect(g); g.connect(S.sfxBus); s.start(t, Math.random() * 0.3); s.stop(t + 0.5);
    bell(c, t + 0.28, 79, 0.045, 1.0); bell(c, t + 0.36, 86, 0.03, 1.1);
  },
  pop(c, t) {                                                                                                                   // 느낌표 줄: 작은 「통」
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(620, t + 0.06); o.frequency.exponentialRampToValueAtTime(460, t + 0.14);
    const g = env(c, t, 0.05, 0.004, 0.16); o.connect(g); g.connect(S.sfxBus); o.start(t); o.stop(t + 0.2);
  },
  whisper(c, t) {                                                                                                               // 속마음 줄: 숨결 같은 부풀기(0.9초)
    const s = c.createBufferSource(); s.buffer = S.noise; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + 0.9);
    s.connect(f); f.connect(g); g.connect(S.sfxBus); s.start(t, Math.random() * 0.2); s.stop(t + 0.95);
    pad(c, S.sfxBus, t, hz(69), 0.7, 0.5, false);
  },
  shimmer(c, t) { [84, 88, 91].forEach((m, i) => bell(c, t + i * 0.05, m, 0.018, 0.4)); },                                       // 기술 낱말 반짝
  water(c, t) {                                                                                                                 // 물: 보글보글(사인 미끄럼 거품 몇 개)
    for (let i = 0; i < 5; i++) {
      const t0 = t + i * 0.07 + Math.random() * 0.03, f0 = 280 + Math.random() * 220;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * 1.8, t0 + 0.07);
      const g = env(c, t0, 0.03, 0.005, 0.08); o.connect(g); g.connect(S.sfxBus); o.start(t0); o.stop(t0 + 0.1);
    }
  },
  hum(c, t) { const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + 1.2); g.connect(S.sfxBus); osc(c, 'sine', 110, t, t + 1.3, g); osc(c, 'sine', 165, t, t + 1.3, g); },
  slide(c, t) {                                                                                                                 // 선택지가 미끄러져 들어옴
    const s = c.createBufferSource(); s.buffer = S.noise; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1;
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.3);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    s.connect(f); f.connect(g); g.connect(S.sfxBus); s.start(t, Math.random() * 0.3); s.stop(t + 0.4);
  },
  heartbeat(c, t, o = {}) { kick(c, S.sfxBus, t, o.last ? 0.75 : 0.55); kick(c, S.sfxBus, t + 0.16, o.last ? 0.45 : 0.32); },   // 마지막 3초: 두근
  drumroll(c, t, o = {}) {                                                                                                      // 결과 공개 전 작은 북 굴림
    const d = o.dur || 0.9, n = Math.round(d / 0.045);
    for (let i = 0; i < n; i++) noiseHit(c, S.sfxBus, t + i * 0.045, 0.012 + 0.02 * (i / n), 'bandpass', 1800, 0.035);
  },
  stamp(c, t) { kick(c, S.sfxBus, t, 0.9); noiseHit(c, S.sfxBus, t, 0.03, 'lowpass', 900, 0.08); [84, 88].forEach((m, i) => bell(c, t + 0.08 + i * 0.06, m, 0.035, 0.6)); },
  harp(c, t) { [72, 76, 79, 83, 86].forEach((m, i) => VOICE.pluck(c, S.sfxBus, t + i * 0.08, hz(m), 0.8, 1.2)); bell(c, t + 0.42, 88, 0.02, 0.9); },   // 설렘: 하프 올림
  endSwell(c, t) {                                                                                                              // 엔딩 그림이 열릴 때 부풀기(2초)
    for (const m of [53, 60, 65, 69]) pad(c, S.sfxBus, t, hz(m), 1.6, 1.4, true);
  },
  leak(c, t) { [79, 83, 86, 91].forEach((m, i) => bell(c, t + i * 0.12, m, 0.016, 0.9)); },                                       // 빛 번짐: 맑게 반짝
  twinkle(c, t) { bell(c, t, 84 + Math.floor(Math.random() * 3) * 2, 0.015, 0.4); },                                            // 꽃가루 한 조각
};
let lastAt = {};
const recent = [], MINOR = new Set(['hover', 'tick', 'speak', 'pop', 'shimmer', 'twinkle', 'slide', 'whoosh', 'note', 'stat']);
const GAP = { hover: 80, tick: 70, speak: 120, pop: 150, shimmer: 400, twinkle: 250, count: 500 };   // 같은 소리 사이 최소 간격(ms) — 연타 · 겹침 막기
/** 효과음 하나. 시험용으로 요청은 모두 S.log 에 남긴다({ n: 이름, ok: 실제로 울렸나 }) */
export const SFX_IDS = () => Object.keys(SFX);
export function play(name, o = {}) {
  const rec = { n: name, ok: false };
  S.log.push(rec); if (S.log.length > 300) S.log.splice(0, 100);
  if (S.locked || S.measuring || !S.pref.sfx || !SFX[name]) return false;
  const c = ensure();
  if (!c) return false;
  const now = performance.now();
  if (now - (lastAt[name] || 0) < (GAP[name] || 60)) return false;
  // 전체 겹침 막기: 0.4초 안에 이미 5개가 울렸으면 자잘한 소리(올림 · 톡 · 말 바뀜 · 반짝)는 건너뛴다
  while (recent.length && now - recent[0] > 400) recent.shift();
  if (recent.length >= 5 && MINOR.has(name)) return false;
  if (recent.length >= 8) return false;
  recent.push(now);
  lastAt[name] = now;
  rec.ok = true;                                   // 켜져 있고 간격도 지켰다(시험은 이것을 본다)
  if (c.state !== 'running') return false;         // 멈춘 장치에 예약하면 다시 켤 때 한꺼번에 울린다 → 건너뜀
  try { SFX[name](c, c.currentTime + 0.01, o); } catch { return false; }
  return true;
}

// ── 환경음(날씨) — 효과음 켜기를 따른다 · 배경 음악보다 훨씬 작게 · 장면이 바뀌면 스르륵 ──────
export const AMB_OF = { rain: 'rain', night: 'night', snow: 'wind', dust: 'room' };
const AMB_LVL = 0.22;   // 효과음 통로 안에서 한 번 더 줄인다
/** 날씨 이름(rain · night · snow · dust) 또는 환경음 이름(rain · night · wind · room) · null */
export function ambience(kind) {
  S.amb = kind ? (AMB_OF[kind] || (Object.values(AMB_OF).includes(kind) ? kind : null)) : null;
  syncAmb();
}
function syncAmb() {
  if (!S.ctx || S.measuring) return;
  const want = !S.locked && S.pref.sfx ? S.amb : null;
  if ((S.ambNode ? S.ambNode.kind : null) === want) return;
  if (S.ambNode) {
    const a = S.ambNode, t = S.ctx.currentTime;
    a.g.gain.cancelScheduledValues(t); a.g.gain.setValueAtTime(a.g.gain.value, t); a.g.gain.linearRampToValueAtTime(0, t + 1.5);
    clearInterval(a.iv); setTimeout(() => { try { a.src.stop(); if (a.lfo) { a.lfo.stop(); a.lfo.disconnect(); } a.g.disconnect(); } catch {} }, 1800);
    S.ambNode = null;
  }
  if (!want) { changed(); return; }
  const c = S.ctx, t = c.currentTime;
  const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(AMB_LVL, t + 2);
  g.connect(S.sfxBus);
  const src = c.createBufferSource(); src.buffer = S.noise; src.loop = true;
  const f = c.createBiquadFilter(), sg = c.createGain(), n = { kind: want, g, src, iv: null };
  src.connect(f); f.connect(sg); sg.connect(g);
  if (want === 'rain') { f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.4; sg.gain.value = 0.09; }           // 빗소리: 가운데 대역 쉬 소리
  else if (want === 'room') { f.type = 'lowpass'; f.frequency.value = 260; sg.gain.value = 0.08; }                          // 방 울림: 아주 낮은 웅
  else {                                                                                                                     // 바람(눈) · 밤(바람 + 아주 작은 풀벌레)
    f.type = 'lowpass'; f.frequency.value = 420; sg.gain.value = 0.07;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 180; lfo.connect(lg); lg.connect(f.frequency); lfo.start(t);
    n.lfo = lfo;
    if (want === 'night') n.iv = setInterval(() => {
      if (!S.ctx || S.ctx.state !== 'running' || Math.random() < 0.45) return;
      const t0 = S.ctx.currentTime + 0.05;
      for (let i = 0; i < 3; i++) { const e = env(S.ctx, t0 + i * 0.07, 0.006, 0.01, 0.05); e.connect(g); osc(S.ctx, 'sine', 3000 + Math.random() * 200, t0 + i * 0.07, t0 + i * 0.07 + 0.08, e); }
    }, 900);
  }
  src.start(t, Math.random() * 0.8);
  S.ambNode = n;
  changed();
}


// ── 조절 단추(머리띠 · 타이틀 바닥) + ⚙ 설정 판 ──────────────────────
// 머리띠에는 바로 쓰는 🎵 · 🔊 와 ⚙ 설정만. 설정 판은 머리띠 바로 아래 「한 줄 더」로 열린다(화면을 밀어 내림 — 무대 위를 덮지 않는다)
const MOTION_DESC = { hi: '모든 움직임(날씨 · 숨쉬기 · 카메라 · 장 제목 · 글 효과)', mid: '알갱이 절반 · 흔들림 · 카메라 없음', lo: '나타나기 · 밀려오기만(알갱이 · 숨쉬기 없음)', off: '움직임 없음(바로 바뀜)' };
/** 머리띠 빠른 단추. 잠금(전체 모드 크롬북)이면 ⚙ 만(움직임 설정) */
export function soundCtlHTML(cls = '') {
  const p = S.pref, open = !!document.getElementById('setp');
  const gear = `<button type="button" class="snd-b gear ${open ? 'on' : ''}" data-set="1" aria-expanded="${open}" aria-controls="setp" title="설정 — 배경음악 · 효과음 · 움직임">⚙<span class="snd-l">설정</span></button>`;
  if (S.locked) return `<span class="snd ${cls}" role="group" aria-label="설정">${gear}</span>`;
  return `<span class="snd ${cls}" role="group" aria-label="소리 · 설정">
    <button type="button" class="snd-b ${p.bgm ? 'on' : ''}" data-snd="bgm" aria-pressed="${p.bgm}" title="배경음악 켜기 · 끄기">🎵<span class="snd-l">음악</span></button>
    <button type="button" class="snd-b ${p.sfx ? 'on' : ''}" data-snd="sfx" aria-pressed="${p.sfx}" title="효과음 켜기 · 끄기(날씨 소리도 함께)">${p.sfx ? '🔊' : '🔈'}<span class="snd-l">효과음</span></button>
    ${gear}</span>`;
}
function settingsHTML() {
  const p = S.pref;
  const sw = (k, on) => `<button type="button" class="sp-sw ${on ? 'on' : ''}" data-snd="${k}" aria-pressed="${on}">${on ? '켬' : '끔'}</button>`;
  const vol = (k, label) => `<label class="sp-vol">${label}<input type="range" min="0" max="100" step="5" value="${Math.round(p[k] * 100)}" data-vol="${k}" aria-label="${label}"></label>`;
  return `<div class="sp-in">
    ${S.locked ? '<div class="sp-g"><b>🔇 소리</b><span class="dim">이 화면은 소리가 나지 않아요 — 소리는 큰 화면에서</span></div>' : `
    <div class="sp-g" role="group" aria-label="배경음악"><b>🎵 배경음악</b>${sw('bgm', p.bgm)}
      <span class="sp-tr">${MAIN_IDS.map((id, i) => `<button type="button" class="sp-trb ${p.track === id ? 'on' : ''}" data-trk="${id}" aria-pressed="${p.track === id}">${i + 1} ${TRACKS[id].name}</button>`).join('')}</span>
      ${vol('bgmVol', '크기')}</div>
    <div class="sp-g" role="group" aria-label="효과음"><b>🔊 효과음</b>${sw('sfx', p.sfx)}${vol('sfxVol', '크기')}<span class="dim small">날씨 소리(환경음)도 함께 켜고 꺼요</span></div>`}
    <div class="sp-g" role="group" aria-label="움직임"><b>✨ 움직임</b>
      <span class="sp-mo">${MOTIONS.map(([k, l]) => `<button type="button" class="sp-mob ${p.motion === k ? 'on' : ''}" data-motion="${k}" aria-pressed="${p.motion === k}">${l}</button>`).join('')}</span>
      <span class="dim small sp-md">${MOTION_DESC[p.motion]}</span></div>
    <button type="button" class="sp-x" data-set="0" aria-label="설정 닫기">닫기 ✕</button></div>`;
}
/** 설정 판 열기 · 닫기(머리띠 바로 아래 한 줄) */
export function toggleSettings(force) {
  let el = document.getElementById('setp');
  const want = force == null ? !el : !!force;
  if (!want) { if (el) el.remove(); document.body.classList.remove('set-open'); mountSoundSlots(); return; }
  if (!el) {
    el = document.createElement('section'); el.id = 'setp'; el.className = 'setp'; el.setAttribute('aria-label', '설정');
    const bar = document.getElementById('bar'); bar.insertAdjacentElement('afterend', el);
  }
  document.body.classList.add('set-open');
  renderSettings();
  mountSoundSlots();
}
function renderSettings() {
  const el = document.getElementById('setp');
  if (!el) return;
  el.innerHTML = settingsHTML();
  bindSoundCtl(el, () => { renderSettings(); mountSoundSlots(); });
}
/** root 안의 소리 · 설정 단추에 동작을 붙인다(그린 뒤마다 부른다) */
export function bindSoundCtl(root, rerender) {
  if (!root) return;
  const re = () => { rerender && rerender(); renderSettings(); };
  root.querySelectorAll('[data-snd]').forEach(b => b.onclick = () => { const k = b.dataset.snd; setSound({ [k]: !S.pref[k] }); if (k === 'sfx' && S.pref.sfx) play('select'); re(); });
  root.querySelectorAll('[data-trk]').forEach(b => b.onclick = () => { setSound({ track: b.dataset.trk, bgm: true }); re(); });
  root.querySelectorAll('[data-motion]').forEach(b => b.onclick = () => { setSound({ motion: b.dataset.motion }); re(); const f = document.querySelector(`#setp [data-motion="${b.dataset.motion}"]`); if (f) f.focus({ preventScroll: true }); });
  root.querySelectorAll('[data-vol]').forEach(r => { r.oninput = () => setSound({ [r.dataset.vol]: Number(r.value) / 100 }); r.onchange = () => { if (r.dataset.vol === 'sfxVol') play('select'); }; });
  root.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { toggleSettings(b.dataset.set === '1' ? undefined : false); const g = document.querySelector('.snd [data-set="1"]'); if (g && b.dataset.set === '0') g.focus({ preventScroll: true }); });
}
/** 소리 조절 자리(그린 뒤 mountSoundSlots 로 채운다) */
export function soundSlot(cls = '') { return `<span class="snd-slot" data-cls="${cls}"></span>`; }
export function mountSoundSlots(root = document) {
  root.querySelectorAll('.snd-slot').forEach(sl => { sl.innerHTML = soundCtlHTML(sl.dataset.cls || ''); bindSoundCtl(sl, () => mountSoundSlots()); });
}
if (typeof document !== 'undefined') document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('setp')) toggleSettings(false); });
