// 전체 모드 투표 셈 — 최다 득표 · 동률은 다시 투표(동률 후보만 15초) → 또 동률이면 🎲. 빠르기로 가르지 않는다.
// DOM · Firebase 없음(node 시험 가능)

/**
 * 표 세기
 * inputs: { uid: { c, t } }  · seats: { uid: num } (지금 자리가 있는 기기만 — 같은 번호는 하나만 들어 있어야 한다)
 * cands: 고를 수 있는 번호 [1,2,3] · deadline: 서버 시각(이 시각 뒤에 낸 표는 세지 않음, 없으면 다 셈)
 */
export function countVotes(inputs, seats, cands, deadline = null) {
  const counts = Object.fromEntries(cands.map(c => [c, 0]));
  const byNum = {};
  for (const [uid, v] of Object.entries(inputs || {})) {
    const num = seats[uid];
    if (!num || !v || typeof v.c !== 'number') continue;
    if (!cands.includes(v.c)) continue;
    if (deadline != null && typeof v.t === 'number' && v.t > deadline) continue;
    // 같은 번호의 표가 둘이면(기기 바꿈 직후) 나중 것
    if (!byNum[num] || (v.t || 0) >= (byNum[num].t || 0)) byNum[num] = v;
  }
  for (const v of Object.values(byNum)) counts[v.c]++;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...Object.values(counts));
  const leaders = total ? cands.filter(c => counts[c] === max) : [];
  return { counts, total, leaders, voters: Object.keys(byNum).map(Number) };
}

/**
 * 결과 정하기. round 1 = 첫 투표, 2 = 동률 다시 투표
 * 돌려줌: { kind: 'pick', pick } | { kind: 'retie', cands } | { kind: 'dice', cands }
 */
export function resolveVote(tally, round, cands) {
  if (!tally.total) return { kind: 'dice', cands: cands.slice() };      // 아무도 안 냄 → 바로 🎲
  if (tally.leaders.length === 1) return { kind: 'pick', pick: tally.leaders[0] };
  if (round === 1) return { kind: 'retie', cands: tally.leaders.slice() };
  return { kind: 'dice', cands: tally.leaders.slice() };
}

/** 주사위: 후보 중 하나(공정) */
export function rollDice(cands, rnd = Math.random) {
  return cands[Math.floor(rnd() * cands.length) % cands.length];
}
