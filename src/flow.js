// 전체 모드 진행 시간표 — 진행판이 실제로 쓰는 시간과 시험의 「한 판 몇 분?」 계산이 같은 함수를 쓴다.
// 모든 값은 ms. 진행판은 ?speed=N 이면 N 배 빨리 돈다(시험용).
import { NODES, linesOf, nextOf, START } from './story.js';

export const T = {
  title: 3500,        // 장면 제목 카드(「중1 · 4월 — 첫 화상 통화」)
  lineBase: 3200,     // 대사 한 줄: 기본 + 글자 수 × perChar (학생이 큰 화면 글을 스스로 읽는 속도)
  perChar: 160,
  hold: 7000,         // 장면 끝 — 모두 다 읽을 때까지 잠깐 멈춤
  think: 40000,       // 💬 생각 시간: 질문 · 선택지를 보며 옆 친구와 이야기(교사가 「바로 투표」로 건너뛸 수 있음)
  vote: 20000,        // 투표 (기획서: 보통 20초)
  voteLong: 30000,    // 주인공 고르기(V0) · 마지막 갈림길(V11)
  retie: 15000,       // 동률 다시 투표
  allIn: 3000,        // 모두 냈으면 3초 뒤 마감
  grace: 1200,        // 마감 뒤 늦게 도착한 입력 기다림(마감 전에 낸 것만 센다)
  tally: 3000,        // 막대 공개
  dice: 3200,         // 🎲 이야기 주사위
  fx: 3000,           // 「🤝 +2」 지표 변화
  endCard: 30000,     // 엔딩 카드(불빛 · 기술 카드 · 메시지)
};

export const PACES = { slow: 1.25, normal: 1, fast: 0.8 };

export function lineMs(text, pace = 1) {
  return Math.round((T.lineBase + T.perChar * [...String(text)].length) * pace);
}

/** 장면 하나(제목 + 대사 + 멈춤)의 시간 */
export function sceneMs(lines, pace = 1, withTitle = true) {
  let ms = withTitle ? T.title : 0;
  for (const l of lines) ms += lineMs(l.text, pace);
  return ms + (lines.length ? T.hold : 0);
}

/**
 * 한 판 전체(프롤로그 → 엔딩 카드)의 시간 계산
 * run: { g, name, ch: {V1..V11} }
 * opts.pace · opts.ties: 동률이 나는 갈림길 id 집합(다시 투표 + 🎲 까지 간다고 본다) · opts.voteFull: 투표를 끝까지 기다림(기본 true)
 */
export function estimateRun(run, opts = {}) {
  const pace = opts.pace || 1;
  const ties = new Set(opts.ties || []);
  const full = opts.voteFull !== false;
  const parts = [];
  let id = START, guard = 0;
  while (id && guard++ < 100) {
    const n = NODES[id];
    if (n.type === 'scene') parts.push([id, sceneMs(linesOf(n.lines, run), pace)]);
    else if (n.type === 'choice') {
      let ms = T.title + (id === 'V0' ? 0 : T.think);
      const vt = n.time === 30 ? T.voteLong : T.vote;
      ms += (full ? vt : T.allIn) + T.grace + T.tally;
      if (ties.has(id)) ms += T.retie + T.grace + T.tally + T.dice;
      if (id === 'V0') {
        if (run.v0 === 3) ms += T.dice;     // 「랜덤」이 이기면 🎲
      } else if (id !== 'V11') {
        ms += T.fx;
        const after = linesOf(n.opts[run.ch[id] - 1].after || [], run);
        ms += sceneMs(after, pace, false);
      }
      parts.push([id, ms]);
    } else if (n.type === 'ending') {
      parts.push([id, sceneMs(linesOf(n.lines, run), pace) + T.endCard]);
      break;
    }
    id = nextOf(id, run);
  }
  const total = parts.reduce((a, [, ms]) => a + ms, 0);
  return { total, parts };
}
