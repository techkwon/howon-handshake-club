// 🗣 목소리 시험 — node test/voice.mjs
// 1) 모든 길(성별 · 이름 · 갈림길)에서 보이는 대사 줄마다 녹음이 있다(해설 · 인물 모두, 선택지 글은 제외)
// 2) 녹음 파일이 site/voice 에 있고 길이가 0 이 아니다 · 쓰지 않는 파일이 없다
// 3) 전체 모드 한 판 시간: 줄마다 max(읽는 시간, 녹음 + VOICE_PAD) 로 셈 → 목소리를 켜도 범위 안
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../src/story.js';
import { clipIn, voiceKey } from '../src/voice-key.js';
import { estimateRun, lineMs } from '../src/flow.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/voice-manifest.json'), 'utf8'));
const VOICE_PAD = 450;
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

// 1) 모든 마디 · 모든 변형
const DEV = [{ V5: 2 }, { V3: 3 }, { V3: 1 }, {}];
const missing = new Set(), pendingSeen = new Set();
let seen = 0;
for (const g of ['m', 'f']) for (const name of S.NAMES[g]) for (const dch of DEV) for (const v1 of [1, 2, 3]) {
  const run = { g, name, ch: { ...dch, V1: v1 } };
  for (const [id, n] of Object.entries(S.NODES)) {
    const blocks = [];
    if (n.lines) blocks.push(n.lines.filter(l => !l[3]));          // 조건 줄은 아래에서 따로
    if (n.lines) blocks.push(n.lines.filter(l => l[3]));
    if (n.opts) n.opts.forEach(o => o.after && blocks.push(o.after));
    for (const b of blocks) for (const L of S.linesOf(b.map(l => l.slice(0, 3)), run)) {
      seen++;
      if (clipIn(MAN, L)) continue;
      if ((MAN.pending || []).includes(voiceKey(L))) pendingSeen.add(L.text);   // 받아쓰기 QA 를 기다리며 빼 둔 녹음(그 줄은 글만)
      else missing.add(`${id} ${L.char || 'narr'}: ${L.text}`);
    }
  }
}
ok(missing.size === 0, `녹음 없는 줄 ${missing.size}개: ${[...missing].slice(0, 5).join(' / ')}`);

// 2) 파일
const dir = path.join(ROOT, 'site/voice');
const files = new Set(fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.ogg')) : []);
let bytes = 0;
for (const [h, [f, ms]] of Object.entries(MAN.clips)) {
  ok(files.has(f), `파일 없음 ${f}`);
  ok(ms > 200 && ms < 15000, `길이 이상 ${f} ${ms}ms`);
  if (files.has(f)) bytes += fs.statSync(path.join(dir, f)).size;
}
const used = new Set(Object.values(MAN.clips).map(c => c[0]));
ok([...files].every(f => used.has(f)), `쓰지 않는 녹음 파일 ${[...files].filter(f => !used.has(f)).length}개`);

// 3) 목소리를 켠 전체 모드 시간 — 한 판 길이는 대사 줄 시간만 바뀐다
// 무작위 길 300개(모든 갈림길 동률 + 🎲)에서 가장 긴 판을 본다
const allVotes = S.CHOICE_IDS;
let worst = 0, worstBase = 0;
function randRun(seed) {
  let x = seed; const r = n => { x = (x * 1103515245 + 12345) % 2147483648; return 1 + (x % n); };
  const ch = {};
  for (const id of S.CHOICE_IDS) ch[id] = r(S.NODES[id].opts.length);
  return { g: r(2) === 1 ? 'm' : 'f', name: null, ch, v0: 3 };
}
function extra(run) {   // 목소리 때문에 늘어나는 ms
  let add = 0;
  for (const id of S.walk(run)) {
    const n = S.NODES[id];
    let lines = [];
    if (n.type === 'scene' || n.type === 'ending') lines = S.linesOf(n.lines, run);
    else if (n.type === 'choice' && id !== 'V0' && id !== 'V11') lines = S.linesOf(n.opts[run.ch[id] - 1].after || [], run);
    for (const L of lines) {
      const c = clipIn(MAN, L);
      if (c) add += Math.max(0, c.ms + VOICE_PAD - lineMs(L.text));
    }
  }
  return add;
}
for (let s = 1; s <= 300; s++) {
  const run = randRun(s);
  const base = estimateRun(run, { ties: allVotes }).total;
  const tot = base + extra(run);
  if (tot > worst) { worst = tot; worstBase = base; }
}
ok(worst / 60000 <= 36, `목소리 켠 최악 시간 ${(worst / 60000).toFixed(1)}분 ≤ 36`);

console.log(`목소리 시험: 통과 ${pass} · 실패 ${fail} · 확인한 줄 ${seen} · 녹음 ${Object.keys(MAN.clips).length}개 · ${(bytes / 1e6).toFixed(2)} MB · QA 대기로 빼 둔 줄 ${pendingSeen.size}개`);
console.log(`모든 갈림길 동률 최악(무작위 300판): 글만 ${(worstBase / 60000).toFixed(1)}분 → 목소리 ${(worst / 60000).toFixed(1)}분`);
if (fail) { console.log('실패:\n - ' + fails.slice(0, 20).join('\n - ')); process.exit(1); }
