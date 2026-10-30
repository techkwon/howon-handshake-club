// 보안 규칙 시험 — database.rules.json 을 시험용 계산기(rules-eval.mjs, 가짜 DB 와 같은 것)로 판정한다.
//   node test/rules.mjs
// 대결 판(/rooms) 규칙은 한 글자도 안 바뀌었는지, 새 /vn 규칙이 학생 · 진행판을 제대로 막는지 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rules, split, setAt, getAt, resolveTS } from './rules-eval.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const RULES = JSON.parse(fs.readFileSync(path.join(here, '../database.rules.json'), 'utf8'));
const BB = JSON.parse(fs.readFileSync(path.join(here, '../../../13-16차시_생명기술/_개발/site/database.rules.json'), 'utf8'));
const rules = new Rules(RULES);

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

let tree = {};
let clock = 1_800_000_000_000;
const NOW = () => clock;   // 쓰기마다 1초씩 흐른다(옛 시각을 남기는 부분 쓰기를 잡으려면 시간이 가야 한다)
const TS = { '.sv': 'timestamp' };

/** 여러 자리 한 번에 쓰기(update) — 허용이면 tree 를 바꾸고 true */
function write(uid, base, obj, { commit = true } = {}) {
  clock += 1000;
  const now = NOW();
  const writes = Object.entries(obj).map(([k, v]) => ({ path: [...split(base), ...split(k)].join('/'), val: v }));
  let next = tree;
  for (const w of writes) next = setAt(next, split(w.path), resolveTS(w.val, now));
  for (const w of writes) if (rules.checkWrite(tree, next, w.path, uid ? { uid } : null, now)) return false;
  if (commit) tree = next;
  return true;
}
const set = (uid, p, v, o) => {
  clock += 1000;
  const now = NOW();
  const next = setAt(tree, split(p), resolveTS(v, now));
  const why = rules.checkWrite(tree, next, p, uid ? { uid } : null, now);
  if (!why && (!o || o.commit !== false)) tree = next;
  return !why;
};
const read = (uid, p) => rules.canRead(tree, p, uid ? { uid } : null, NOW());
const R = 'vn/rooms/1234';

// ── 0. 대결 판 규칙은 그대로 ─────────────────────────────────────
ok(JSON.stringify(RULES.rules.rooms) === JSON.stringify(BB.rules.rooms), '대결 판 /rooms 규칙이 한 글자도 안 바뀜');
ok(RULES.rules['.read'] === false && RULES.rules['.write'] === false, '뿌리 읽기 · 쓰기 막힘');
ok(Object.keys(RULES.rules).sort().join() === ['.read', '.write', 'rooms', 'vn'].sort().join(), '뿌리 아래는 rooms · vn 뿐');

// ── 1. 방 만들기 ─────────────────────────────────────────────────
const meta = (host, mode = 'class') => ({ host, createdAt: TS, cls: '3-4', mode, phase: 'lobby', version: 1 });
ok(!set(null, `${R}/meta`, meta('h1')), '로그인 안 하면 방 못 만듦');
ok(!set('h1', `${R}/meta`, meta('h2')), '남의 uid 로 방 못 만듦');
ok(!set('h1', 'vn/rooms/12a4/meta', meta('h1')), '방 코드는 숫자 4자리');
ok(!set('h1', `${R}/meta`, { ...meta('h1'), mode: 'party' }), 'mode 는 class · solo 만');
ok(!set('h1', `${R}/meta`, { ...meta('h1'), extra: 1 }), 'meta 에 모르는 칸 금지');
ok(set('h1', `${R}/meta`, meta('h1')), '진행판이 방 만들기');
ok(!set('h2', `${R}/meta`, meta('h2')), '이미 있는 방은 남이 못 덮음');
ok(!set('h1', `${R}/meta/host`, 'h2'), 'host 는 못 바꿈');
ok(!set('h1', `${R}/meta/mode`, 'solo'), 'mode 는 만든 뒤 못 바꿈');
ok(set('h1', `${R}/meta/phase`, 'play'), '진행판은 phase 바꿈');
ok(write('h1', R, { 'state/c': '{"ph":"lobby"}' }), '진행판 state 쓰기');
ok(!set('h1', `${R}/state/x`, 'a'), 'state 에 모르는 칸 금지');
ok(!set('h1', `${R}/hack`, 'a'), '방에 모르는 칸 금지');

// ── 2. 학생 자리 ─────────────────────────────────────────────────
ok(!set('s1', 'vn/rooms/5555/players/s1', { num: 3, joinedAt: TS, on: false, last: TS }), '없는 방에는 못 들어감');
// Firebase 는 onDisconnect 를 걸 때 규칙을 검사한다 — 자리 없이 {on,last} 만 쓰면 거절
ok(!write('s1', `${R}/players/s1`, { on: false, last: TS }, { commit: false }), '자리(num) 없이 끊김 처리만 걸면 거절(그래서 자리를 먼저 만든다)');
ok(set('s1', `${R}/players/s1`, { num: 3, joinedAt: TS, on: false, last: TS }), '학생 자리 만들기');
ok(write('s1', `${R}/players/s1`, { on: false, last: TS }, { commit: false }), '자리 뒤 끊김 처리 허용');
ok(set('s2', `${R}/players/s2`, { num: 4, joinedAt: TS, on: true, last: TS }), '두 번째 학생');
ok(!set('s1', `${R}/players/s2`, { num: 9, joinedAt: TS, on: true, last: TS }), '남의 자리 못 씀');
ok(!set('s3', `${R}/players/s3`, { num: 31, joinedAt: TS, on: true, last: TS }), '번호 1~30');
ok(!set('s3', `${R}/players/s3`, { num: 5, joinedAt: TS, name: '홍길동' }), '자리에 이름 칸 없음');
ok(!set('s3', `${R}/players/s3`, { num: 5, joinedAt: 12345 }), 'joinedAt 은 서버 시각만');
ok(!set('s1', `${R}/state/c`, '{}'), '학생은 state 못 씀');
ok(!set('s1', `${R}/meta/phase`, 'end'), '학생은 meta 못 씀');
ok(!set('s1', `${R}/kick/s1`, { at: 1 }), '학생은 kick 못 씀');
ok(!set('s1', R, null), '학생은 방 못 지움');

// ── 3. 읽기 ─────────────────────────────────────────────────────
ok(read('s1', `${R}/meta`) && read('s1', `${R}/state`), '학생은 meta · state 읽음');
ok(!read('s1', R), '학생은 방 통째로 못 읽음');
ok(!read('s1', `${R}/players`) && !read('s1', `${R}/players/s2`), '학생은 남의 자리 못 읽음');
ok(read('s1', `${R}/players/s1`), '자기 자리는 읽음');
ok(read('h1', R), '진행판은 방 통째로 읽음');
ok(!read('h2', R), '다른 진행판은 남의 방 못 읽음');
ok(!read(null, `${R}/meta`), '로그인 안 하면 못 읽음');

// ── 4. 전체 모드 투표 ────────────────────────────────────────────
ok(write('h1', R, { 'state/inputKey': 'v1' }), '진행판이 투표 열기');
ok(set('s1', `${R}/inputs/v1/s1`, { c: 2, t: TS }), '자리 있는 학생 투표');
ok(set('s1', `${R}/inputs/v1/s1`, { c: 3, t: TS }), '다시 누르면 바뀜');
ok(!set('s1', `${R}/inputs/v1/s2`, { c: 1, t: TS }), '남의 칸에 투표 못 함');
ok(!set('s1', `${R}/inputs/v2/s1`, { c: 1, t: TS }), '열린 투표가 아니면 못 냄');
ok(!set('s1', `${R}/inputs/v1/s1`, { c: 5, t: TS }), '번호 1~4');
ok(!set('s1', `${R}/inputs/v1/s1`, { c: 1, t: 99 }), '시각은 서버 시각(now)만');
ok(!set('s1', `${R}/inputs/v1/s1`, { c: 1, t: TS, x: 'a' }), '투표 칸에 다른 것 금지');
ok(!set('s1', `${R}/inputs/v1/s1/c`, 2), '선택만 바꾸고 옛 시각을 남기는 부분 쓰기 금지(시각도 같이 새로)');
ok(!write('s1', `${R}/inputs/v1/s1`, { c: 1 }), '부분 업데이트로 옛 시각 남기기 금지');
ok(!set('s9', `${R}/inputs/v1/s9`, { c: 1, t: TS }), '자리 없는 기기는 투표 못 함');
ok(!read('s1', `${R}/inputs/v1`) && !read('s1', `${R}/inputs/v1/s2`), '남의 표 못 읽음');
ok(read('s1', `${R}/inputs/v1/s1`), '내 표는 읽음');
ok(write('h1', R, { 'state/inputKey': null }), '진행판이 투표 닫기');
ok(!set('s2', `${R}/inputs/v1/s2`, { c: 1, t: TS }), '닫힌 뒤에는 못 냄');
ok(!set('s1', `${R}/solo/s1`, { st: 1, e: 0, l: 0, t: TS, c1: 1 }), '전체 모드 방에는 개인 기록 못 씀');

// ── 5. 개인 모드 ─────────────────────────────────────────────────
const R2 = 'vn/rooms/2345';
ok(set('h1', `${R2}/meta`, meta('h1', 'solo')), '개인 모드 방');
ok(set('s1', `${R2}/players/s1`, { num: 7, joinedAt: TS, on: true, last: TS }), '개인 모드 자리');
ok(!set('s1', `${R2}/solo/s1`, { st: 1, e: 0, l: 0, t: TS, c1: 1 }), '시작 전(lobby)에는 못 씀');
ok(set('h1', `${R2}/meta/phase`, 'play'), '진행판이 시작');
ok(set('s1', `${R2}/solo/s1`, { st: 3, e: 0, l: 0, t: TS, c1: 1, c2: 3, c3: 2 }), '진행 기록(숫자만)');
ok(set('s1', `${R2}/solo/s1`, { st: 11, e: 5, l: 3, t: TS, c1: 1, c2: 2, c3: 3, c4: 1, c5: 2, c6: 2, c7: 3, c8: 2, c9: 2, c10: 1, c11: 3 }), '엔딩 기록');
ok(!set('s1', `${R2}/solo/s1/e`, 3), '진행 기록 부분 쓰기 금지(시각도 같이 새로)');
ok(!set('s1', `${R2}/solo/s1`, { st: 12, e: 0, l: 0, t: TS }), 'st 0~11');
ok(!set('s1', `${R2}/solo/s1`, { st: 1, e: 11, l: 0, t: TS }), 'e 0~10');
ok(!set('s1', `${R2}/solo/s1`, { st: 1, e: 0, l: 4, t: TS }), 'l 0~3');
ok(!set('s1', `${R2}/solo/s1`, { st: 1, e: 0, l: 0, t: TS, c12: 1 }), 'c1~c11 만');
ok(!set('s1', `${R2}/solo/s1`, { st: 1, e: 0, l: 0, t: TS, g: 'm' }), '성별 · 이름은 보낼 수 없음');
ok(!set('s1', `${R2}/solo/s1`, { st: 1, e: 0, l: 0, t: TS, c1: 'a' }), '고른 번호는 숫자');
ok(!set('s1', `${R2}/solo/s2`, { st: 1, e: 0, l: 0, t: TS }), '남의 기록 못 씀');
ok(!set('s9', `${R2}/solo/s9`, { st: 1, e: 0, l: 0, t: TS }), '자리 없으면 못 씀');
ok(!read('s1', `${R2}/solo`) && !read('s1', `${R2}/solo/s2`), '남의 기록 못 읽음');
ok(write('h1', R2, { 'state/inputKey': 'v1' }), '(시험) 개인 모드 방에 투표 열쇠를 열어 봄');
ok(!set('s1', `${R2}/inputs/v1/s1`, { c: 1, t: TS }), '개인 모드 방에는 투표 못 함');
ok(set('h1', `${R2}/meta/phase`, 'stats'), '모두 졸업');
ok(!set('s1', `${R2}/solo/s1`, { st: 11, e: 2, l: 1, t: TS }), '마감 뒤에는 진행 기록 못 씀');

// ── 6. 성찰 ─────────────────────────────────────────────────────
ok(set('s1', `${R2}/refl/s1`, { q1: '물통은 마을에서 고칠 수 있었다', q2: '빗물 탱크', t: TS }), '성찰 보내기(마감 뒤에도)');
ok(!set('s1', `${R2}/refl/s1`, { q1: 'x'.repeat(301), t: TS }), '한 칸 300자까지');
ok(!set('s1', `${R2}/refl/s1`, { q4: 'a', t: TS }), 'q1~q3 만');
ok(!set('s1', `${R2}/refl/s2`, { q1: 'a', t: TS }), '남의 성찰 못 씀');
ok(!set('s9', `${R2}/refl/s9`, { q1: 'a', t: TS }), '자리 없으면 못 보냄');
ok(!read('s1', `${R2}/refl`) && !read('s1', `${R2}/refl/s2`), '남의 성찰 못 읽음');
ok(read('h1', `${R2}/refl`), '진행판은 성찰 읽음');
ok(set('h1', `${R2}/refl/s1`, null), '진행판이 성찰 가리기(지우기)');

// ── 7. 방 지우기 · 다른 방 · 대결 판과 섞이지 않음 ─────────────────
ok(!set('h2', R, null), '남의 방 못 지움');
ok(!set('h1', 'rooms/1234/meta', { host: 'h9', createdAt: TS, phase: 'lobby' }), '대결 판 /rooms 에 남의 uid 로 못 만듦(그대로)');
ok(set('h1', R, null), '진행판이 방 통째로 지우기');
ok(getAt(tree, split(R)) === null, '지운 방은 남지 않음');
ok(!write('s1', `${R}/players/s1`, { on: false, last: TS }), '지운 방에 끊김 처리가 와도 거절(빈 방이 다시 생기지 않음)');

console.log(`규칙 시험: 통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log(' - ' + fails.join('\n - ')); process.exit(1); }
