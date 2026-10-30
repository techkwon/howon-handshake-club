// 🗣 목소리 찾기 열쇠 — DOM · 소리 없음(진행판 · 크롬북 · node 시험이 함께 쓴다)
// 녹음 열쇠 = 「그림 id(해설은 narr) | 화면에 보이는 글」의 FNV-1a 32bit 해시(36진수).
// 녹음 만드는 쪽(scratchpad voice/extract.mjs)과 같은 계산 → 글이 바뀌면 열쇠가 달라져 조용히 글만 보인다.
export function voiceHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
/** linesOf() 가 돌려준 줄 하나({char, text}) → 열쇠 */
export function voiceKey(line) { return voiceHash(`${(line && line.char) || 'narr'}|${(line && line.text) || ''}`); }
/** 열쇠 → { src, ms } 또는 null. manifest = src/voice-manifest.json */
export function clipIn(manifest, line, base = 'voice/') {
  if (!manifest || !manifest.clips || !line || !line.text) return null;
  const c = manifest.clips[voiceKey(line)];
  return c ? { src: base + c[0], ms: c[1] } : null;
}
