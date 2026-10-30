// 단위 시험: 이야기 지도 · 상태 값 · 엔딩 판정 · 글 · 투표 셈 · 한 판 시간
//   node test/unit.mjs
import {
  NODES, START, CHOICE_IDS, ENDING_IDS, NAMES, CHARS, CARDS, LIGHTS, RANGE,
  statsOf, endingOf, lightsOf, topSlot, nextOf, walk, linesOf, optionLabels, say, josa, rethinkOf, E10_HINT,
} from '../src/story.js';
import { countVotes, resolveVote, rollDice } from '../src/vote.js';
import { estimateRun, T } from '../src/flow.js';
import { ENDING_PATHS, P } from './paths.mjs';
import { TRACKS, MAIN_IDS, parseMel, chordOf, midiOf } from '../src/sound.js';
import { moodOf, weatherOf, lineFx, isAdvanceClick, chapterOf, CAP } from '../src/fx.js';
import { seatsOf, seatLabel, MAX_NUM } from '../src/shared.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — 기대 ${JSON.stringify(b)} · 실제 ${JSON.stringify(a)}`); }

// ── 1. 지도: 모든 마디에 닿는가 · 막다른 길 없음 ──────────────────
{
  const seen = new Set();
  const q = [START];
  while (q.length) {
    const id = q.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const n = NODES[id];
    ok(!!n, `마디 ${id} 가 있다`);
    if (!n) continue;
    let outs = [];
    if (n.type === 'scene' || n.type === 'choice') outs = [n.next];
    else if (n.type === 'branch') outs = n.outs;
    else if (n.type === 'ending') outs = [];
    if (n.type !== 'ending') ok(outs.length > 0 && outs.every(o => NODES[o]), `${id}: 다음 마디가 있다(막다른 길 없음)`);
    for (const o of outs) q.push(o);
  }
  for (const id of Object.keys(NODES)) ok(seen.has(id), `${id} 에 닿는다`);
  eq(CHOICE_IDS.length + 1, 12, '선택 12번(V0 + V1~V11)');
  eq(ENDING_IDS.length, 10, '엔딩 10개');
  for (const id of CHOICE_IDS) {
    const n = NODES[id];
    ok(n.opts.length >= 2 && n.opts.length <= 4, `${id} 선택지 2~4개`);
  }
}

// ── 2. 모든 길(3^7 × 4^4 = 559,872) 걸어 보기 ────────────────────
const sizes = CHOICE_IDS.map(id => NODES[id].opts.length);
const endCount = Object.fromEntries(ENDING_IDS.map(e => [e, 0]));
const maxSt = { h: 0, o: 0, u: 0, w: 0, A: 0, B: 0, C: 0, T: 0 };
let all10 = 0, total = 0, badWalk = 0, lightsCount = { 1: 0, 2: 0, 3: 0 };
const firstPath = {};
{
  const idx = new Array(sizes.length).fill(0);
  for (;;) {
    const ch = {};
    CHOICE_IDS.forEach((id, i) => { ch[id] = idx[i] + 1; });
    const run = { g: 'm', ch };
    const st = statsOf(run);
    for (const k of Object.keys(maxSt)) {
      if (st[k] > maxSt[k]) maxSt[k] = st[k];
      if (st[k] < 0 || st[k] > RANGE[k]) badWalk++;
    }
    if (st.h === 10 && st.o === 10 && st.u === 10) all10++;
    const e = endingOf(run);
    endCount[e]++;
    lightsCount[lightsOf(st)]++;
    if (!firstPath[e]) firstPath[e] = { ...ch };
    if (total % 997 === 0) {   // 걷기는 표본만(빠르게) — 끝은 엔딩, 판정과 같은 엔딩
      const w = walk(run);
      if (w[w.length - 1] !== e || NODES[w[w.length - 1]].type !== 'ending') badWalk++;
    }
    total++;
    let i = sizes.length - 1;
    while (i >= 0 && ++idx[i] >= sizes[i]) { idx[i] = 0; i--; }
    if (i < 0) break;
  }
  eq(total, 559872, '길 수');
  for (const e of ENDING_IDS) ok(endCount[e] > 0, `${e} 에 닿는 길이 있다 (${endCount[e]}개)`);
  eq(maxSt, { h: 10, o: 10, u: 10, w: 5, A: 9, B: 9, C: 9, T: 5 }, '각 값의 최대가 범위 끝에 정확히 닿는다');
  eq(all10, 0, '🤝10 · 🌱10 · 💡10 동시에는 안 된다');
  eq(badWalk, 0, '걷기 · 범위 오류 없음');
  ok(lightsCount[1] > 0 && lightsCount[2] > 0 && lightsCount[3] > 0, '불빛 1 · 2 · 3 모두 나온다');
}

// ── 3. 엔딩마다 구체적인 길 (두 성별) ────────────────────────────
for (const g of ['m', 'f']) {
  for (const [e, ch] of Object.entries(ENDING_PATHS)) {
    const run = { g, ch };
    eq(endingOf(run), e, `${g} 길 → ${e}`);
    const w = walk(run);
    eq(w[w.length - 1], e, `${g} 걷기 → ${e}`);
  }
}
// 기획서 7절 표의 숫자
{
  const st = id => statsOf({ g: 'm', ch: ENDING_PATHS[id] });
  eq(st('E1').A, 6, 'E1 길 A 6');
  const s4 = st('E4'); eq([s4.A, s4.B, s4.C], [4, 4, 4], 'E4 길 A4 · B4 · C4');
  const s5 = st('E5'); ok(s5.h >= 6 && s5.o >= 6 && s5.w === 0, 'E5 길 🤝 ≥ 6 · 🌱 ≥ 6 · ⚠0');
  // 기획서 그대로: V2② V3③ V5② V6② V8② V9② (나머지는 지표를 안 건드리는 것) → 🤝8 · 🌱8
  const doc5 = statsOf({ g: 'm', ch: P(1, 2, 3, 1, 2, 2, 1, 2, 2, 2, 3) });
  eq([doc5.h, doc5.o, doc5.w], [8, 8, 0], '기획서 E5 예시 🤝8 · 🌱8 · ⚠0');
  const doc8 = statsOf({ g: 'm', ch: P(1, 2, 2, 1, 2, 1, 1, 3, 2, 1, 3) });
  eq([doc8.T, doc8.w], [5, 1], '기획서 E8 예시 T5 · ⚠1');
  const doc9 = statsOf({ g: 'm', ch: P(1, 1, 3, 1, 1, 1, 1, 2, 3, 4, 4) });
  ok(doc9.o >= 5 && doc9.book, '기획서 E9 예시 🌱 ≥ 5 · 📘');
  eq(st('E6').w, 2, 'E6 길 ⚠2');
  ok(st('E7').u >= 5, 'E7 길 💡 ≥ 5');
}

// ── 4. 판정 경계 · 동률 ──────────────────────────────────────────
{
  const z = { h: 0, o: 0, u: 0, w: 0, A: 0, B: 0, C: 0, T: 0, book: false };
  eq(topSlot({ ...z, A: 4, B: 4, C: 1 }, { V1: 2 }), 'B', '동률 → V1에서 고른 사람');
  eq(topSlot({ ...z, A: 4, B: 4, C: 1 }, { V1: 3, V10: 1 }), 'A', '동률 · V1 사람이 후보 아님 → V10 사람');
  eq(topSlot({ ...z, A: 4, B: 4, C: 4 }, {}), 'A', '모두 같음 → A · B · C 순');
  eq(topSlot({ ...z, A: 2, B: 5, C: 1 }, { V1: 1 }), 'B', '1위가 하나면 그 사람');
  eq(lightsOf({ ...z, h: 6, o: 6 }), 3, '불빛 3');
  eq(lightsOf({ ...z, h: 6, o: 6, w: 1 }), 2, '⚠1 이면 불빛 3 아님 → 2');
  eq(lightsOf({ ...z, h: 3, o: 3, u: 3, w: 1 }), 1, '합 9 → 불빛 1');
  eq(lightsOf({ ...z, h: 4, o: 3, u: 3, w: 1 }), 2, '합 10 · ⚠1 → 불빛 2');
  eq(lightsOf({ ...z, h: 9, o: 9, w: 2 }), 1, '⚠2 → 불빛 1');
  // ③ 영상 편지: E5 가 E8 보다 먼저
  const r5 = { g: 'f', ch: ENDING_PATHS.E5 };
  ok(statsOf(r5).T >= 0 && endingOf(r5) === 'E5', 'E5 조건이면 테누 우정과 상관없이 E5');
  // S7' 자동 장면
  const rA = { g: 'm', ch: P(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1) }; // V1 A+2, V4 A+2 → A4
  ok(walk(rA).includes('S7A'), "S7': 호감 1위 ≥ 4 → 그 사람과 하굣길");
  const rG = { g: 'm', ch: P(1, 1, 1, 2, 1, 1, 4, 1, 1, 1, 1) }; // A3 B3 C1 → 1위 3
  ok(walk(rG).includes('S7G'), "S7': 아니면 동아리 넷 장면");
  // E6 · 다시 생각할 점
  eq(rethinkOf({ g: 'm', ch: ENDING_PATHS.E6 }).length, 2, '다시 생각할 점 = ⚠ 고른 수');
  for (const k of [1, 2, 3, 4]) ok(!!E10_HINT[k], `E10 힌트 ${k}`);
}

// ── 5. 조사 ──────────────────────────────────────────────────────
eq(josa('한결', '아'), '한결아', '한결아'); eq(josa('준호', '아'), '준호야', '준호야');
eq(josa('소윤', '이'), '소윤이', '소윤이'); eq(josa('하루', '이'), '하루가', '하루가');
eq(josa('한별', '과'), '한별과', '한별과'); eq(josa('채원', '은'), '채원은', '채원은'); eq(josa('하루', '은'), '하루는', '하루는');
eq(josa('자전거 발전기', '이'), '자전거 발전기가', '발전기가');
eq(josa('빗물 탱크 꼭지', '이'), '빗물 탱크 꼭지가', '꼭지가');
eq(josa('굴리는 물통 손잡이', '이'), '굴리는 물통 손잡이가', '손잡이가');

// ── 6. 글: 자리표 · 길이 · 상자 수 · 두 성별 · 이름 8개 ────────────
{
  // 조건 줄을 모두 지나가도록 여러 길을 섞는다
  const runs = [];
  for (const g of ['m', 'f']) for (const name of NAMES[g]) for (const ch of Object.values(ENDING_PATHS)) runs.push({ g, name, ch });
  // 장치 · E6 · E10 변형을 위한 길
  runs.push({ g: 'm', name: '한결', ch: P(1, 3, 2, 1, 1, 1, 1, 3, 1, 1, 4) }); // V3② · V9① → E6 트럭? 확인용
  runs.push({ g: 'f', name: '다온', ch: P(1, 3, 1, 1, 1, 1, 1, 1, 3, 1, 3) });
  let long = [], unresolved = [], many = [], badRole = [];
  for (const run of runs) {
    for (const [id, n] of Object.entries(NODES)) {
      const groups = [];
      if (n.lines) groups.push([id, linesOf(n.lines, run), 6]);
      if (n.opts) n.opts.forEach((o, i) => { if (o.after) groups.push([`${id}-${i + 1}`, linesOf(o.after, run), 6]); });
      for (const [gid, ls, cap] of groups) {
        if (ls.length > cap) many.push(`${gid} ${ls.length}줄`);
        for (const l of ls) {
          if ([...l.text].length > 40) long.push(`${gid}: ${l.text} (${[...l.text].length})`);
          if (/[{}]/.test(l.text)) unresolved.push(`${gid}: ${l.text}`);
          if (l.role && !l.char) badRole.push(`${gid}: ${l.role}`);
          if (l.char && !CHARS[l.char]) badRole.push(`${gid}: ${l.char}`);
        }
      }
      if (n.opts) for (const lab of optionLabels(n, run)) {
        if ([...lab].length > 22) long.push(`${id} 선택지: ${lab} (${[...lab].length})`);
        if (/[{}]/.test(lab)) unresolved.push(`${id}: ${lab}`);
      }
      if (n.q && [...n.q].length > 24) long.push(`${id} 질문: ${n.q}`);
    }
  }
  eq([...new Set(long)], [], '한 줄 40자 · 선택지 22자 이하');
  eq([...new Set(unresolved)], [], '자리표가 모두 채워짐');
  eq([...new Set(many)], [], '한 장면 대사 6개 이하');
  eq([...new Set(badRole)], [], '말하는 사람이 모두 그림 id 와 이어짐');
  // 엔딩 장면은 조건 줄이 걸러져도 1줄 이상 · 카드 · 이름
  for (const e of ENDING_IDS) {
    const n = NODES[e];
    ok(CARDS[n.card], `${e} 기술 카드`);
    ok(n.name && n.msg, `${e} 이름 · 메시지`);
  }
  for (const k of [1, 2, 3]) ok(!!LIGHTS[k], `불빛 ${k} 문장`);
  // 남 · 여 주인공의 이름이 실제로 바뀌는가
  ok(say('{me:아}', { g: 'f', name: '지유', ch: {} }) === '지유야', '여주인공 이름 지유야');
  ok(say('{A}', { g: 'f', ch: {} }) === '은결' && say('{A}', { g: 'm', ch: {} }) === '소윤', '슬롯 A 이름이 성별에 따라 바뀜');
  // 상표 이름 금지
  const allText = JSON.stringify(Object.values(NODES).map(n => [n.lines, n.opts, n.q])) + JSON.stringify(CARDS);
  for (const bad of ['Q드럼', '라이프스트로', '리터 오브 라이트', '팟인팟', '호원']) ok(!allText.includes(bad), `게임 글에 「${bad}」 없음`);
}

// ── 7. 투표 셈 ───────────────────────────────────────────────────
{
  const seats = { u1: 1, u2: 2, u3: 3, u4: 4, u5: 5 };
  let t = countVotes({ u1: { c: 1, t: 10 }, u2: { c: 1, t: 11 }, u3: { c: 2, t: 12 } }, seats, [1, 2, 3], 100);
  eq(t.counts, { 1: 2, 2: 1, 3: 0 }, '표 세기');
  eq(resolveVote(t, 1, [1, 2, 3]), { kind: 'pick', pick: 1 }, '최다 득표');
  t = countVotes({ u1: { c: 1, t: 10 }, u2: { c: 2, t: 11 }, u3: { c: 3, t: 12 }, u4: { c: 3, t: 1 }, u5: { c: 1, t: 2 } }, seats, [1, 2, 3], 100);
  eq(resolveVote(t, 1, [1, 2, 3]), { kind: 'retie', cands: [1, 3] }, '동률 → 동률 후보만 다시 투표');
  t = countVotes({ u1: { c: 1, t: 10 }, u2: { c: 3, t: 11 } }, seats, [1, 3], 100);
  eq(resolveVote(t, 2, [1, 3]), { kind: 'dice', cands: [1, 3] }, '또 동률 → 🎲');
  t = countVotes({}, seats, [1, 2, 3, 4], 100);
  eq(resolveVote(t, 1, [1, 2, 3, 4]), { kind: 'dice', cands: [1, 2, 3, 4] }, '아무도 안 냄 → 바로 🎲');
  t = countVotes({ u1: { c: 2, t: 10 }, u2: { c: 3, t: 200 } }, seats, [1, 2, 3], 100);
  eq(t.counts, { 1: 0, 2: 1, 3: 0 }, '마감 뒤에 낸 표는 안 셈');
  t = countVotes({ u1: { c: 2, t: 10 }, x9: { c: 3, t: 11 } }, seats, [1, 2, 3], 100);
  eq(t.total, 1, '자리 없는 기기 표는 안 셈');
  t = countVotes({ u1: { c: 4, t: 10 } }, seats, [1, 3], 100);
  eq(t.total, 0, '후보 밖 번호는 안 셈');
  t = countVotes({ u1: { c: 1, t: 10 }, u9: { c: 2, t: 20 } }, { u1: 1, u9: 1 }, [1, 2], 100);
  eq(t.counts, { 1: 0, 2: 1 }, '같은 번호 두 기기 → 나중 표 하나만');
  // 주사위 공정성
  const hits = { 1: 0, 3: 0 };
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4000; i++) hits[rollDice([1, 3], rnd)]++;
  ok(Math.abs(hits[1] - hits[3]) < 400, `주사위 고르게 (${hits[1]} : ${hits[3]})`);
}

// ── 8. 한 판 시간 (전체 모드 · 기획서 시간) ───────────────────────
const timing = {};
{
  const min = ms => ms / 60000;
  const allVotes = ['V0', ...CHOICE_IDS];
  for (const [e, ch] of Object.entries(ENDING_PATHS)) {
    for (const g of ['m', 'f']) {
      const run = { g, ch, v0: g === 'm' ? 1 : 2 };
      const base = min(estimateRun(run).total);
      const quick = min(estimateRun(run, { voteFull: false }).total);
      const ties4 = min(estimateRun(run, { ties: ['V1', 'V4', 'V7', 'V10'] }).total);
      const tiesAll = min(estimateRun({ ...run, v0: 3 }, { ties: allVotes }).total);
      timing[`${e}-${g}`] = { base: +base.toFixed(1), quick: +quick.toFixed(1), ties4: +ties4.toFixed(1), tiesAll: +tiesAll.toFixed(1) };
      ok(base >= 28 && base <= 35, `${e}-${g} 한 판 ${base.toFixed(1)}분 (28~35분)`);
      ok(ties4 <= 35, `${e}-${g} 동률 4번이어도 ${ties4.toFixed(1)}분 ≤ 35`);
    }
  }
}

// ── 소리 · 효과 · 학생 수 (2026-10-30) ─────────────────────────
{
  eq(Object.keys(TRACKS).sort(), ['end', 'm1', 'm2', 'm3', 'open'], '곡 5개(여는 곡 · 본 곡 3 · 엔딩 곡)');
  eq(MAIN_IDS, ['m1', 'm2', 'm3'], '교사가 고르는 본 곡 3개');
  const sig = {};
  for (const [id, t] of Object.entries(TRACKS)) {
    const ch = t.chords.split(' ');
    eq(ch.length, t.mel.length, `${id} 화음 수 = 선율 마디 수`);
    t.mel.forEach((m, i) => { const p = parseMel(m); ok(Math.abs(p.len - t.beats) < 1e-9, `${id} ${i + 1}마디 박 수 ${p.len} = ${t.beats}`); p.notes.forEach(n => ok(n.midi >= 55 && n.midi <= 90, `${id} ${i + 1}마디 음 높이 ${n.midi}`)); });
    ch.forEach(c => { const x = chordOf(c); ok(x.bass >= 33 && x.bass <= 47 && x.tones.every(m => m >= 53 && m <= 80), `${id} 화음 ${c} 음역`); });
    const sec = 60 / t.bpm * t.beats * ch.length;
    ok(sec >= 30 && sec <= 75, `${id} 한 바퀴 ${sec.toFixed(1)}초 (30~75초)`);
    sig[id] = `${t.voice}|${t.bpm}|${t.beats}|${t.mel.slice(0, 4).join()}`;
  }
  ok(new Set(MAIN_IDS.map(id => TRACKS[id].voice)).size === 3, '본 곡 3개는 악기가 다르다');
  ok(new Set(MAIN_IDS.map(id => TRACKS[id].bpm)).size === 3, '본 곡 3개는 빠르기가 다르다');
  ok(new Set(Object.values(sig)).size === 5, '곡 5개 첫 선율이 모두 다르다');
  eq(midiOf('A4'), 69, '음 이름 A4 = 69'); eq(chordOf('D/F#').bass % 12, 6, 'D/F# 베이스는 F#');
  // 분위기 · 날씨
  eq(moodOf('S9', NODES.S9), 'tension', 'S9 고장 사건 = 긴장');
  eq(moodOf('S5', NODES.S5), 'night', 'S5 밤 = 밤');
  eq(moodOf('S1', NODES.S1), 'day', 'S1 동아리 = 낮');
  eq(moodOf('V3', NODES.V3, 'after', NODES.V3.opts[1]), 'tension', '⚠ 선택 결과 = 긴장');
  eq(weatherOf('roof'), ['rain', 'glint'], '빗물 탱크 = 비 + 물 반짝'); eq(weatherOf('snow'), ['snow', 'puff'], '눈 길 = 눈 + 눈 뭉치'); eq(weatherOf('club', 'night'), ['night'], '밤 동아리 = 반딧불 · 별');
  eq(weatherOf('field'), ['petals', 'rays'], '운동장 = 꽃잎 + 햇살'); eq(weatherOf('snow', null, true), ['snow', 'puff', 'bokeh'], '설렘 장면 = 분홍 빛망울 더함');
  ok(lineFx({ role: 'A', face: 1, text: '같이 하자!' }).ex, '느낌표 줄 = 톡'); ok(lineFx({ text: '내가 누구에게 건네려던 편지였더라?' }).whisper, '혼잣말 물음 = 속마음');
  eq(lineFx({ text: '지붕에 홈통을 잇고 빗물 탱크까지 만들었다.' }).key, '빗물 탱크', '기술 낱말 찾기');
  ok(lineFx({ text: '바퀴가 돌더니 전구에 반짝 불이 켜졌다.' }).tech && !lineFx({ text: '바퀴가 돌더니 전구에 반짝 불이 켜졌다.' }).water, '불 켜짐 = 기술(물 아님)');
  eq(chapterOf('중2 · 12월').season, '겨울', '12월 = 겨울'); eq(chapterOf('중3 · 4월').grade, '중3', '학년 읽기');
  ok(lineFx({ text: '중3 7월. 루미타에서 다급한 연락이 왔다.' }).shake, '다급 → 흔들림');
  ok(lineFx({ text: '바퀴가 돌더니 전구에 반짝 불이 켜졌다.' }).tech, '불이 켜짐 → 빛 터짐');
  eq(CAP, { hi: 120, mid: 50, lo: 0, off: 0 }, '알갱이 상한 상 120 · 중 50 · 하 0 · 끄기 0');
  eq(lineFx({ role: 'A', face: 1, text: '같이 하자!' }, true).emote, 'heart', '설렘 장면 다정한 말 = ♡(머리 옆)'); eq(lineFx({ role: 'A', face: 1, text: '눈이 온다.' }, true).emote, 'spark', '설렘 장면 그 밖 = 반짝이');
  eq(lineFx({ role: 'A', face: 0, text: '사실… 무서웠어' }, true).emote, null, '설렘 장면에는 땀방울 없음');
  // 클릭 넘기기 판정(단추 · 두 번 누름 제외)
  const el = sel => ({ closest: s => (s.split(',').some(x => x.trim() === sel) ? {} : null) });
  ok(isAdvanceClick({ button: 0, detail: 1, target: el('div') }), '빈 곳 누름 = 넘김');
  ok(!isAdvanceClick({ button: 0, detail: 1, target: el('button') }), '단추 누름 ≠ 넘김');
  ok(!isAdvanceClick({ button: 0, detail: 2, target: el('div') }), '두 번 누름의 둘째 ≠ 넘김');
  // 학생 수(meta.cls 「24명」)
  eq(seatsOf({ cls: seatLabel(24) }), 24, '24명 → 24'); eq(seatsOf({ cls: '3-4' }), MAX_NUM, '옛 반 이름 → 99(막지 않음)');
  eq(seatsOf({ cls: '45명' }), 45, '45명 → 45'); eq(seatsOf({ cls: '100명' }), MAX_NUM, '100명 → 99(못 읽으면 막지 않음)'); eq(MAX_NUM, 99, '번호 끝 99(규칙과 같음)'); eq(seatsOf(null), MAX_NUM, '없으면 30');
  ok(seatLabel(99).length <= 10, '규칙: cls 는 10자 이하');
}

console.log(`단위 시험: 통과 ${pass} · 실패 ${fail}`);
console.log('엔딩별 길 수:', endCount);
console.log('불빛별 길 수:', lightsCount);
const tv = Object.values(timing);
const rng = k => `${Math.min(...tv.map(x => x[k]))}~${Math.max(...tv.map(x => x[k]))}분`;
console.log(`한 판 시간(전체 모드): 투표 끝까지 ${rng('base')} · 모두 빨리 냄 ${rng('quick')} · 동률 4번 ${rng('ties4')} · 모든 갈림길 동률 ${rng('tiesAll')}`);
if (fail) { console.log('실패:\n - ' + fails.slice(0, 40).join('\n - ')); process.exit(1); }
