// 🗣 목소리 — 대사 한 줄에 맞는 녹음(site/voice/*.ogg)을 틀고, 넘기면 멈춘다.
// 녹음 찾기: 「그림 id | 화면에 보이는 글」의 해시 → voice-manifest.json. 글이 바뀌었거나 파일이 없으면 조용히 글만 보여 준다.
// 설정(목소리 켜기 · 크기 · 해설 읽기)은 sound.js 의 설정(localStorage)에 함께 둔다 — soundState() 로 읽는다.
// 이름을 받지 않는다 · 서버로 보내는 것 없음.
import MANIFEST from './voice-manifest.json' with { type: 'json' };
import { clipIn } from './voice-key.js';
import { soundState, onSoundChange, duck } from './sound.js';

export const VOICE_PAD = 450;          // 전체 모드: 녹음이 끝난 뒤 다음 줄까지 조금 쉼(ms)
const BASE = 'voice/';

/** 줄({char, text}) → { src, ms } 또는 null */
export function clipOf(line) { return clipIn(MANIFEST, line, BASE); }

const V = { el: null, next: null, cur: null, ok: null, gen: 0 };
function canPlay() {
  if (V.ok == null) {
    try { V.ok = typeof Audio !== 'undefined' && !!new Audio().canPlayType('audio/ogg; codecs=opus'); } catch { V.ok = false; }
  }
  return V.ok;
}
/** 지금 목소리를 내도 되나: 잠금(전체 모드 학생 기기) · 끔 · 해설 읽기 끔이면 안 낸다 */
export function voiceOn(line) {
  const s = soundState();
  if (s.locked || !s.voice || !canPlay()) return false;
  if (line && !line.role && !line.char && s.narr === false) return false;
  return true;
}

/** 다음 줄 녹음을 미리 받아 둔다 */
export function preloadVoice(line) {
  const c = voiceOn(line) && clipOf(line);
  if (!c) return;
  try { const a = new Audio(); a.preload = 'auto'; a.src = c.src; V.next = a; } catch {}
}

/**
 * 한 줄 읽기. 돌려주는 값 = 기다려야 할 ms(녹음 길이, 없으면 0) — 진행판은 max(읽는 시간, 이 값 + VOICE_PAD) 만큼 기다린다.
 * 이전 줄 목소리는 끊는다.
 */
export function speak(line) {
  stopVoice();
  if (!voiceOn(line)) return 0;
  const c = clipOf(line);
  if (!c) return 0;
  const my = ++V.gen;
  let a = V.next && V.next.src.endsWith(c.src) ? V.next : null;
  V.next = null;
  try {
    if (!a) { a = new Audio(); a.preload = 'auto'; a.src = c.src; }
    a.volume = Math.max(0, Math.min(1, soundState().voiceVol ?? 0.9));
    V.cur = a;
    duck(true);
    const done = () => { if (V.gen === my) { V.cur = null; duck(false); } };
    a.onended = done; a.onerror = done;
    const p = a.play();
    if (p && p.catch) p.catch(done);   // 자동 재생 막힘 · 파일 없음 → 글만
  } catch { duck(false); return 0; }
  return c.ms;
}

export function stopVoice() {
  V.gen++;
  if (V.cur) { try { V.cur.pause(); V.cur.currentTime = 0; } catch {} V.cur = null; duck(false); }
}
export function speaking() { return !!(V.cur && !V.cur.paused && !V.cur.ended); }

// 설정이 바뀌면(끄기 · 잠금) 바로 멈추고, 크기는 바로 맞춘다
onSoundChange(s => {
  if (!V.cur) return;
  if (s.locked || !s.voice) stopVoice();
  else V.cur.volume = Math.max(0, Math.min(1, s.voiceVol ?? 0.9));
});
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) stopVoice(); });
