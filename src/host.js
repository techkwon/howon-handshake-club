// 진행판(교사 큰 화면) — 방을 만들고, 전체 모드는 이야기를 직접 돌리며 투표를 판정한다(host-authoritative).
// 개인 모드는 학생 진행 기록(숫자만)을 모아 반 통계를 보여 준다. 수업이 끝나면 방을 통째로 지운다.
import { connectNet, netMode, isTestMode } from './net.js';
import * as S from './story.js';
import { T, PACES, lineMs } from './flow.js';
import { countVotes, resolveVote } from './vote.js';
import { renderStage, boxHTML, cardHTML, lightsHTML, faceHTML, preload, artFor, cgKey, statIcon, petalsHTML, logoHTML, emblemHTML, kvHTML, cgHead } from './stage.js';
import { initSound, music, play as sfx, soundSlot, mountSoundSlots } from './sound.js';
import { speak, stopVoice, preloadVoice, VOICE_PAD } from './voice.js';
import { moodOf, lineFx, emote, shake, bloom, techBurst, floatChips, confetti, winBurst, tallyDrama, countdown, emphasize, endingReveal, chapterOf, chapterCard, typewrite, twBusy, twFinish, hintOnce, isAdvanceClick } from './fx.js';
import { ROOT, MAX_NUM, DEFAULT_SEATS, seatsOf, seatLabel, DAY_MS, esc, parseJSON, newRoomCode, devTag, CIRCLED, LS, REFL_Q, randInt, gradeOf, GRADE_LABEL, speedFactor } from './shared.js';

const $ = s => document.querySelector(s);
const stage = $('#stage');
const PREF0 = { seats: DEFAULT_SEATS, mode: 'class', pace: 'normal' };
const LS_SNAP = 'vn.host.snap', LS_ROOMS = 'vn.host.rooms', LS_PREF = 'vn.host.pref', LS_BOARD = 'vn.board';
const SPEED = speedFactor();
const CANCEL = Symbol('cancel');

const H = {
  net: null, connected: false, error: '',
  code: null, offline: false, meta: null,
  players: {}, kicked: {}, dupWarn: {}, swaps: {}, numOf: {},
  // 전체 모드
  run: null, pos: null, hist: {}, core: {}, pace: 'normal', auto: true,
  vote: null, inputs: {}, inputsOff: null, teacherPick: null, picker: false, attempt: {}, gen: 0, waiter: null,
  view: {},               // 지금 그리는 것 { kind, ... }
  // 개인 모드 · 성찰
  solo: {}, refl: {}, hidden: {}, statsAt: 0, statsSig: '',
  offs: [],
};
window.__vnHost = H; // 시험 · 점검용
// 소리: 진행판(프로젝터)은 BGM 켬(작게) · 효과음 켬. 처음 누를 때(시작 그림 · 새 수업 시작) 소리 장치를 연다
initSound({ page: 'host', defaults: { bgm: true, sfx: true, bgmVol: 0.35, sfxVol: 0.5, track: 'm1', motion: 'hi', voice: true, voiceVol: 0.9, narr: true } });   // 진행판: 소리 켬 · 움직임 「상」

const now = () => (H.net && !H.offline ? H.net.serverNow() : Date.now());
const roomP = p => `${ROOT}/${H.code}/${p}`;
function U(obj) {
  if (H.offline || !H.net || !H.code) return Promise.resolve();
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v;
  return H.net.update(`${ROOT}/${H.code}`, out).catch(e => { toast('저장하지 못했어요: ' + (e.code || e.message), true); });
}

// ── 시작 ─────────────────────────────────────────────────────────
async function boot() {
  renderStart({ connecting: true });
  try {
    H.net = await connectNet();
    H.net.onConnected(c => { H.connected = c; renderBar(); });
    await cleanupOldRooms();
    renderStart({});
  } catch (e) {
    H.error = '인터넷(데이터베이스)에 연결하지 못했어요. ' + (e.message || '');
    renderStart({ failed: true });
  }
}

async function cleanupOldRooms() {
  const list = LS.get(LS_ROOMS, []);
  const keep = [];
  for (const r of list) {
    if (Date.now() - r.at > DAY_MS) {
      try { await H.net.withTimeout(H.net.remove(`${ROOT}/${r.code}`), 5000, '옛 방 지우기'); } catch { keep.push(r); }
    } else keep.push(r);
  }
  LS.set(LS_ROOMS, keep);
}

let splashGone = (() => { try { return sessionStorage.getItem('vn.splash') === '1'; } catch { return false; } })();
let boardOpen = false;
let startStep = 'menu';   // 'menu'(타이틀) → 'setup'(수업 설정 판)
function hideSplash() {
  splashGone = true;
  try { sessionStorage.setItem('vn.splash', '1'); } catch {}
  const sp = document.getElementById('tsSplash');
  if (!sp) return;
  sp.classList.add('out');
  setTimeout(() => sp.remove(), 600);
  const b = document.getElementById('bNew') || document.getElementById('bCreate'); if (b && !b.disabled) b.focus({ preventScroll: true });
}

/** 수업 설정(학생 수 1~99 · 방식 · 속도). 옛 설정(반 번호 cls)은 버린다 */
function prefGet() {
  const p = { ...PREF0, ...LS.get(LS_PREF, {}) };
  p.seats = Math.min(MAX_NUM, Math.max(1, Math.round(Number(p.seats)) || DEFAULT_SEATS));
  return p;
}
function prefSet(patch) { const p = { ...prefGet(), ...patch }; delete p.cls; LS.set(LS_PREF, p); return p; }
const SEAT_QUICK = [20, 24, 26, 28, 30, 32, 35];
/** 기록판 날짜: 10.30(금) 3교시 같은 꼴 대신 「10.30 14:05」 */
function when(at) { const d = new Date(at || 0); const z = n => String(n).padStart(2, '0'); return `${d.getMonth() + 1}.${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; }

function renderStart(st) {
  H.view = { kind: 'start' };
  music('open');
  document.body.classList.add('at-title');
  const pref = prefGet();
  const snap = LS.get(LS_SNAP);
  const canResume = snap && Date.now() - snap.savedAt < 8 * 3600 * 1000 && snap.meta;
  const board = LS.get(LS_BOARD, []).slice(-12).reverse();
  renderBar();
  const ready = !st.connecting && !st.failed;
  stage.innerHTML = `
  <div class="ts ts-host">
    ${kvHTML()}<div class="ts-veil" aria-hidden="true"></div>
    ${petalsHTML(18, 11)}
    <div class="ts-col">
      ${logoHTML()}
      ${startStep === 'setup' ? `<section class="ts-setup panel" aria-label="수업 설정">
        <h2 class="setup-h">새 수업 준비</h2>
        <div class="lbl" id="lblSeats">학생 수 <span class="dim">· 번호 1번부터 몇 번까지 · 1~${MAX_NUM}명</span></div>
        <div class="seats" role="group" aria-labelledby="lblSeats">
          <button class="seat-b" id="seatMinus" aria-label="한 명 줄이기" ${pref.seats <= 1 ? 'disabled' : ''}>−</button>
          <label class="seat-n"><input id="iSeats" class="num" type="number" inputmode="numeric" min="1" max="${MAX_NUM}" value="${pref.seats}" aria-label="학생 수"><span>명</span></label>
          <button class="seat-b" id="seatPlus" aria-label="한 명 늘리기" ${pref.seats >= MAX_NUM ? 'disabled' : ''}>+</button>
          <span class="seat-q">${SEAT_QUICK.map(n => `<button class="segb ${pref.seats === n ? 'on' : ''}" data-seats="${n}" aria-pressed="${pref.seats === n}">${n}</button>`).join('')}</span>
        </div>
        <div class="lbl">방식</div>
        <div class="seg" id="segMode">
          <button class="segb ${pref.mode === 'class' ? 'on' : ''}" data-v="class" aria-pressed="${pref.mode === 'class'}">전체 모드 <small>반 전체가 투표로</small></button>
          <button class="segb ${pref.mode === 'solo' ? 'on' : ''}" data-v="solo" aria-pressed="${pref.mode === 'solo'}">개인 모드 <small>크롬북에서 각자</small></button>
        </div>
        <div class="lbl">글 넘기는 속도 <span class="dim">· 전체 모드 · 진행 중에도 바꿀 수 있어요</span></div>
        <div class="seg" id="segPace">${[['slow', '느리게'], ['normal', '보통'], ['fast', '빠르게']].map(([k, l]) => `<button class="segb ${pref.pace === k ? 'on' : ''}" data-v="${k}" aria-pressed="${pref.pace === k}">${l}</button>`).join('')}</div>
        <div class="setup-go">
          <button class="menu-i main" id="bCreate" ${ready ? '' : 'disabled'}>${st.connecting ? '연결 중…' : st.failed ? '연결 안 됨' : `방 만들기 <small>${pref.seats}명 · ${pref.mode === 'class' ? '전체' : '개인'} 모드</small>`}</button>
          <button class="btn ghost small" id="bBackMenu">← 처음 화면</button>
        </div>
      </section>` : `<nav class="ts-menu" aria-label="시작 메뉴">
        <button class="menu-i main" id="bNew" ${ready ? '' : 'disabled'}>${st.connecting ? '연결 중…' : st.failed ? '연결 안 됨' : '새 수업 시작 <small>학생 수 · 방식 고르기</small>'}</button>
        ${canResume ? `<button class="menu-i" id="bResume">이어서 하기 <small>${seatsOf(snap.meta)}명 · ${snap.offline ? '비상 모드' : '방 ' + esc(snap.code)}</small></button>` : ''}
        <button class="menu-i" id="bOffline" title="인터넷이 안 될 때: 학생 투표 없이 교사가 갈림길을 고른다">비상 모드 <small>인터넷 없이 · 전체</small></button>
        <button class="menu-i" id="bBoard" aria-expanded="${boardOpen}" aria-controls="tsBoard">반 기록판 <small>${board.length ? board.length + '개' : '아직 없음'}</small></button>
      </nav>`}
      <aside class="ts-board panel" id="tsBoard" ${boardOpen ? '' : 'hidden'} aria-label="반 기록판">
        <div class="lbl">반 기록판 <span class="dim">(이 컴퓨터에만 · 이름 · 번호 없음)</span></div>
        ${board.length ? `<table class="board"><thead><tr><th>날짜</th><th>방식</th><th>결과</th><th>불빛</th></tr></thead><tbody>
          ${board.map(b => `<tr><td class="num">${esc(when(b.at))}</td><td>${b.mode === 'class' ? '전체' : '개인'}</td><td>${esc(b.text)}</td><td>${b.lights ? '💡'.repeat(b.lights) : esc(b.lightsText || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="dim">아직 기록이 없어요.</p>'}
        <p class="dim small">학생 이름 · 성별은 어디에도 저장하지 않아요. 방 코드 + 번호만 써요.</p>
      </aside>
      ${st.failed ? `<p class="errbox" role="alert">${esc(H.error)}<br>비상 모드로는 진행할 수 있어요.</p>` : ''}
    </div>
    <footer class="ts-foot"><span>성적 미반영 · 학생 이름을 받지 않아요</span>${soundSlot('ts')}${netMode().kind !== 'firebase' ? `<span class="ts-dev">시험 연결 ${esc(netMode().kind)} · ×${SPEED}</span>` : ''}<span class="ts-credit">글꼴 Noto Serif KR · OFL</span></footer>
    ${splashGone ? '' : `<div class="ts-splash ${ready ? 'ready' : ''}" id="tsSplash" role="button" tabindex="0" aria-label="시작 화면으로">
      ${kvHTML()}
      ${logoHTML('big', 'div')}
      <p class="sp-press">${ready || st.failed ? '화면을 누르면 시작' : '여는 중…'}</p></div>`}
  </div>`;
  mountSoundSlots(stage);
  const seg = (id, key, num) => stage.querySelectorAll(`#${id} .segb`).forEach(b => b.onclick = () => {
    prefSet({ [key]: num ? Number(b.dataset.v) : b.dataset.v }); renderStart(st);
    const again = stage.querySelector(`#${id} .segb[data-v="${b.dataset.v}"]`); if (again) again.focus({ preventScroll: true });
  });
  seg('segMode', 'mode'); seg('segPace', 'pace');
  // 학생 수: − / 숫자 / + 와 빠른 단추(20 · 24 · 26 · 28 · 30 · 32 · 35)
  const setSeats = (n, focusSel) => {
    prefSet({ seats: Math.min(MAX_NUM, Math.max(1, Math.round(n) || DEFAULT_SEATS)) }); renderStart(st);
    const f = focusSel && stage.querySelector(focusSel); if (f && !f.disabled) f.focus({ preventScroll: true });
  };
  const onId = (id, f) => { const e = document.getElementById(id); if (e) e.onclick = f; };
  onId('seatMinus', () => setSeats(prefGet().seats - 1, '#seatMinus'));
  onId('seatPlus', () => setSeats(prefGet().seats + 1, '#seatPlus'));
  stage.querySelectorAll('[data-seats]').forEach(b => b.onclick = () => setSeats(Number(b.dataset.seats), `[data-seats="${b.dataset.seats}"]`));
  const iS = $('#iSeats');
  if (iS) { iS.onchange = () => setSeats(Number(iS.value), '#iSeats'); iS.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); iS.blur(); } }; }
  const on = (id, f) => { const e = document.getElementById(id); if (e) e.onclick = f; };
  on('bCreate', () => createRoom());
  on('bNew', () => { startStep = 'setup'; boardOpen = false; renderStart(st); const f = $('#iSeats'); if (f) f.focus({ preventScroll: true }); });
  on('bBackMenu', () => { startStep = 'menu'; renderStart(st); const f = $('#bNew'); if (f) f.focus({ preventScroll: true }); });
  on('bOffline', () => startOffline());
  on('bBoard', () => { boardOpen = !boardOpen; $('#tsBoard').hidden = !boardOpen; $('#bBoard').setAttribute('aria-expanded', String(boardOpen)); });
  on('bResume', () => resume(snap));
  // 메뉴는 위 · 아래 화살표로도 움직인다
  const items = [...stage.querySelectorAll('.ts-menu .menu-i')];
  items.forEach(b => b.onkeydown = e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = items.filter(x => !x.disabled);
    const j = list.indexOf(b) + (e.key === 'ArrowDown' ? 1 : -1);
    (list[(j + list.length) % list.length] || b).focus();
  });
  const sp = $('#tsSplash');
  if (sp) {
    sp.onclick = hideSplash;
    sp.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hideSplash(); } };
    if (ready || st.failed) { sp.focus({ preventScroll: true }); setTimeout(() => { if (H.view.kind === 'start') hideSplash(); }, 2600 / SPEED); }
  } else if (ready && startStep === 'menu' && $('#bNew')) $('#bNew').focus({ preventScroll: true });
}

async function createRoom() {
  const pref = prefGet();
  const btn = $('#bCreate'); btn.disabled = true; btn.textContent = '만드는 중…';
  try {
    let code = null;
    for (let i = 0; i < 8 && !code; i++) {
      const c = newRoomCode(Math.random, isTestMode());
      const ex = await H.net.withTimeout(H.net.get(`${ROOT}/${c}/meta`), 8000, '방 확인').catch(e => { if (/PERMISSION/i.test(e.code || e.message)) return { taken: true }; throw e; });
      if (!ex) code = c;
    }
    if (!code) throw new Error('빈 방 코드를 찾지 못했어요');
    const meta = { host: H.net.uid, createdAt: H.net.TS, cls: seatLabel(pref.seats), mode: pref.mode, phase: 'lobby', version: 1 };   // 학생 수는 cls 칸에 「24명」(규칙이 새 칸을 막음)
    await H.net.withTimeout(H.net.set(`${ROOT}/${code}/meta`, meta), 8000, '방 만들기');
    H.code = code; H.offline = false;
    H.meta = { ...meta, createdAt: Date.now() };
    H.pace = pref.pace || 'normal';
    LS.set(LS_ROOMS, [...LS.get(LS_ROOMS, []), { code, at: Date.now() }]);
    resetGame();
    await U({ 'state/c': JSON.stringify({ m: H.meta.mode, ph: 'lobby' }) });
    subscribeRoom();
    saveSnap();
    render();
  } catch (e) {
    toast('방을 만들지 못했어요: ' + (e.message || e), true);
    renderStart({});
  }
}

function resetGame() {
  H.players = {}; H.kicked = {}; H.dupWarn = {}; H.swaps = {}; H.numOf = {};
  H.run = { g: null, name: null, ch: {}, v0: null }; H.pos = { id: 'P', k: 'scene', i: 0 }; H.hist = {}; H.core = { m: H.meta.mode, ph: 'lobby' };
  H.solo = {}; H.refl = {}; H.hidden = {}; H.attempt = {}; H.vote = null; H.teacherPick = null;
}

function startOffline() {
  const pref = prefGet();
  if (!confirm('비상 모드(인터넷 없이)로 시작할까요?\n학생 투표는 받지 않고, 교사가 손 든 수를 보고 갈림길을 고릅니다.')) return;
  H.offline = true; H.code = null;
  H.meta = { host: 'local', createdAt: Date.now(), cls: seatLabel(pref.seats), mode: 'class', phase: 'play', version: 1 };
  H.pace = pref.pace || 'normal';
  resetGame();
  saveSnap();
  startStory();
}

async function resume(snap) {
  try {
    if (!snap.offline) {
      const meta = await H.net.withTimeout(H.net.get(`${ROOT}/${snap.code}/meta`), 8000, '방 확인');
      if (!meta || meta.host !== H.net.uid) throw new Error('방이 없거나 다른 사람 방이에요');
      H.meta = { ...meta };
    } else H.meta = snap.meta;
    H.code = snap.code; H.offline = !!snap.offline;
    resetGame();
    Object.assign(H, { run: snap.run || H.run, pos: snap.pos || H.pos, hist: snap.hist || {}, pace: snap.pace || 'normal', hidden: snap.hidden || {}, attempt: snap.attempt || {}, kicked: snap.kicked || {}, numOf: snap.numOf || {} });
    if (!H.offline) { subscribeRoom(); if (H.meta.mode === 'class') U({ 'state/inputKey': null }); }   // 열려 있던 투표는 닫고 새 열쇠로 다시 연다
    if (H.meta.mode === 'class' && H.meta.phase === 'play') {
      // 이어서: 지금 마디를 처음부터(투표는 새 열쇠로 다시 연다)
      const p = H.pos;
      if (p.k === 'endcard' || p.k === 'refl' || p.k === 'done') {
        H.core = snap.core || H.core;
        H.view = p.k === 'endcard' ? { kind: 'endcard', id: p.id } : { kind: 'refl' };
        render();
      }
      else direct({ id: p.id, k: p.k === 'after' ? 'after' : null, i: p.k === 'scene' || p.k === 'after' || p.k === 'ending' ? Math.max(0, (p.i || 1) - 1) : 0 });
    } else render();
  } catch (e) {
    toast('이어서 하지 못했어요: ' + (e.message || e), true);
    LS.del(LS_SNAP); renderStart({});
  }
}

function saveSnap() {
  if (!H.meta) return;
  LS.set(LS_SNAP, { savedAt: Date.now(), code: H.code, offline: H.offline, meta: H.meta, run: H.run, pos: H.pos, hist: H.hist, pace: H.pace, hidden: H.hidden, attempt: H.attempt, kicked: H.kicked, numOf: H.numOf, core: H.core });
}

function setMeta(patch) {
  Object.assign(H.meta, patch);
  const upd = {};
  for (const [k, v] of Object.entries(patch)) upd['meta/' + k] = v;
  U(upd); saveSnap();
}

// ── 방 구독 ──────────────────────────────────────────────────────
function subscribeRoom() {
  for (const off of H.offs) off();
  H.offs = [];
  const on = (p, cb) => H.offs.push(H.net.on(roomP(p), cb, e => toast('읽기 오류: ' + (e && (e.code || e.message)), true)));
  on('players', v => { H.players = v || {}; onPlayers(); });
  on('refl', v => { H.refl = v || {}; onRefl(); });
  if (H.meta.mode === 'solo') on('solo', v => { H.solo = v || {}; onSolo(); });
}

// 같은 번호가 둘이면 나중에 들어온 기기를 받고 앞의 것은 내보낸다(2분 안에 3번째로 바뀌면 자동으로 안 하고 알린다)
function present() {
  return Object.entries(H.players)
    .filter(([u, p]) => p && Number.isInteger(p.num) && p.num >= 1 && p.num <= seatsOf(H.meta) && !H.kicked[u])
    .map(([uid, p]) => ({ uid, ...p }));
}
function onPlayers() {
  for (const [u, p] of Object.entries(H.players)) if (p && Number.isInteger(p.num)) H.numOf[u] = p.num;
  for (const [u, at] of Object.entries(H.kicked)) {
    const p = H.players[u];
    if (p && p.joinedAt && p.joinedAt > at) { delete H.kicked[u]; U({ [`kick/${u}`]: null }); }
  }
  const byNum = {};
  for (const p of present()) (byNum[p.num] = byNum[p.num] || []).push(p);
  for (const [n, list] of Object.entries(byNum)) {
    if (list.length < 2) { delete H.dupWarn[n]; continue; }
    const t = Date.now();
    const recent = (H.swaps[n] || []).filter(x => t - x < 120000);
    if (recent.length >= 2) {
      if (!H.dupWarn[n]) { H.dupWarn[n] = list.map(p => devTag(p.uid)); toast(`⚠ ${n}번이 두 기기예요 (${H.dupWarn[n].join(' · ')}) — 학생에게 번호를 확인해 주세요`, true); }
      continue;
    }
    H.swaps[n] = [...recent, t];
    list.sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
    for (const old of list.slice(1)) kick(old.uid, 'dup');
  }
  if (H.vote && !H.vote.closed) checkAllIn();
  renderPeople();
  if (H.view.kind === 'lobby') renderLobby();
}
function kick(uid, why) {
  const at = (H.players[uid] && H.players[uid].joinedAt) || Date.now();
  H.kicked[uid] = at;
  U({ [`kick/${uid}`]: { at, why }, [`players/${uid}`]: null });
  saveSnap();
}
/** uid → 번호 (지금 자리가 있는 기기만, 같은 번호면 나중 기기) */
function seats() {
  const out = {};
  for (const p of present()) out[p.uid] = p.num;
  return out;
}
const onlineNums = () => [...new Set(present().filter(p => p.on).map(p => p.num))];

// ── 전체 모드: 이야기 감독 ───────────────────────────────────────
function pub(core) {
  H.core = { m: 'class', ...core };
  const upd = { 'state/c': JSON.stringify(H.core) };
  if ('inputKey' in core) { upd['state/inputKey'] = core.inputKey; delete H.core.inputKey; upd['state/c'] = JSON.stringify(H.core); }
  saveSnap();
  return U(upd);
}

function chipOf(n) { return n ? `${n.when}${n.title ? ' · ' + n.title : ''}` : ''; }

/** 기다리기: 다음 ▶ 이면 바로 끝, ⏸ 이면 멈춤. ms 는 배속 전 값 */
function wait(ms, my, opts = {}) {
  return new Promise((resolve, reject) => {
    if (my !== H.gen) return reject(CANCEL);
    const w = { resolve, reject, left: ms / SPEED, timer: null, t0: 0, my, pausable: opts.pausable !== false, skip: opts.skip !== false };
    const go = () => { w.t0 = Date.now(); w.timer = setTimeout(done, w.left); };
    const done = () => { if (H.waiter === w) H.waiter = null; resolve(); };
    w.pause = () => { if (w.timer) { clearTimeout(w.timer); w.timer = null; w.left -= Date.now() - w.t0; } };
    w.resume = () => { if (!w.timer) go(); };
    w.finish = () => { if (w.timer) clearTimeout(w.timer); done(); };
    w.cancel = () => { if (w.timer) clearTimeout(w.timer); if (H.waiter === w) H.waiter = null; reject(CANCEL); };
    H.waiter = w;
    if (!H.auto && w.pausable) return; // 멈춤 중이면 「다음 ▶」을 기다린다
    go();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms / SPEED));
function chk(my) { if (my !== H.gen) throw CANCEL; }

function startStory() {
  setMeta({ phase: 'play' });
  H.run = { g: null, name: null, ch: {}, v0: null }; H.hist = {}; H.attempt = {};
  direct({ id: 'P', k: null, i: 0 });
}

async function direct(from) {
  const my = ++H.gen;
  stopVoice();
  if (H.waiter) { const w = H.waiter; H.waiter = null; w.cancel && w.cancel(); }
  let id = from.id, k = from.k, start = from.i || 0;
  try {
    while (id) {
      const n = S.NODES[id];
      if (n.type === 'branch') { id = S.nextOf(id, H.run); k = null; start = 0; continue; }
      if (n.type === 'scene') await playLines(id, 'scene', S.linesOf(n.lines, H.run), start, my);
      else if (n.type === 'choice') {
        if (k !== 'after') {
          const c = await playChoice(id, my);
          if (id === 'V0' && c === 3) {   // 「랜덤」이 이기면 🎲 로 남 · 여
            const g = await rollDice('V0', [1, 2], my);
            H.hist.V0 = { ...H.hist.V0, gender: g === 1 ? 'm' : 'f' };
          }
          applyPick(id, c);
          if (id !== 'V0' && id !== 'V11') await showFx(id, c, my);
        }
        const opt = id !== 'V0' && n.opts[H.run.ch[id] - 1];
        if (opt && opt.after) await playLines(id, 'after', S.linesOf(opt.after, H.run), k === 'after' ? start : 0, my);
      } else if (n.type === 'ending') {
        await playLines(id, 'ending', S.linesOf(n.lines, H.run), start, my);
        return endCard(id);
      }
      id = S.nextOf(id, H.run); k = null; start = 0;
    }
  } catch (e) {
    if (e !== CANCEL) { console.error(e); toast('진행 오류: ' + (e.message || e), true); }
  }
}

async function playLines(id, k, lines, start, my) {
  const n = S.NODES[id];
  const pace = PACES[H.pace] || 1;
  H.pos = { id, k, i: start };
  if (k === 'scene' && start === 0) {
    H.view = { kind: 'title', id };
    pub({ ph: 'scene', chip: chipOf(n) });
    render();
    preload(artFor(n, H.run));
    await wait(T.title, my);
  } else if (start === 0) pub({ ph: k === 'ending' ? 'ending' : 'scene', chip: k === 'ending' ? '졸업식' : chipOf(n) });
  for (let i = start; i < lines.length; i++) {
    H.pos = { id, k, i: i + 1 };
    H.view = { kind: 'lines', id, k, lines, shown: i + 1 };
    render(); saveSnap();
    // 🗣 목소리: 녹음이 있으면 끝날 때까지(+ 조금) 기다린다 — 읽는 시간이 더 길면 그대로. 녹음이 없거나 끔이면 0
    const vms = speak(lines[i]);
    if (lines[i + 1]) preloadVoice(lines[i + 1]);
    await wait(Math.max(lineMs(lines[i].text, pace), vms ? vms + VOICE_PAD : 0), my);
  }
  if (lines.length) await wait(T.hold, my);
  // 다음 장면 그림 미리
  const nx = S.NODES[S.nextOf(id, H.run) || ''];
  if (nx) preload(artFor(nx, H.run));
}

function voteKey(id, round) {
  const base = id.toLowerCase() + (round === 2 ? 'r' : '');
  const a = H.attempt[id] || 0;
  return a ? `${base}x${a}` : base;
}

async function playChoice(id, my) {
  const n = S.NODES[id];
  const labels = S.optionLabels(n, H.run);
  const cands = labels.map((_, i) => i + 1);
  H.attempt[id] = (H.attempt[id] || 0) + (H.hist[id] && H.hist[id].opened ? 1 : 0);
  H.hist[id] = { opened: true };
  H.teacherPick = null;
  H.pos = { id, k: 'choice', i: 0 };
  stopVoice();
  // 제목 + 생각 시간
  H.view = { kind: 'think', id, labels, cands, title: true };
  pub({ ph: 'think', chip: chipOf(n), vote: { id, q: n.q, labels, cands } });
  render();
  await wait(T.title, my);
  if (H.teacherPick) return finishPick(id, H.teacherPick, 'teacher', null, my);
  if (id !== 'V0') {
    H.view = { kind: 'think', id, labels, cands, until: Date.now() + T.think / SPEED };
    render();
    await wait(T.think, my, { pausable: false });
    if (H.teacherPick) return finishPick(id, H.teacherPick, 'teacher', null, my);
  }
  if (H.offline) {
    H.view = { kind: 'offline-pick', id, labels, cands };
    render();
    const c = await waitTeacher(my);
    return finishPick(id, c, 'teacher', null, my);
  }
  // 1차 투표
  const r1 = await runVote(id, labels, cands, 1, n.time === 30 ? T.voteLong : T.vote, my);
  if (r1.teacher) return finishPick(id, r1.teacher, 'teacher', r1, my);
  H.hist[id].r1 = { counts: r1.counts, total: r1.total };
  let res = resolveVote(r1, 1, cands), keys = [r1.key], r2 = null;
  if (res.kind === 'retie') {
    await showTally(id, labels, r1, null, 'retie', my);
    r2 = await runVote(id, labels, res.cands, 2, T.retie, my);
    keys.push(r2.key);
    if (r2.teacher) return finishPick(id, r2.teacher, 'teacher', r1, my, keys);
    H.hist[id].r2 = { counts: r2.counts, total: r2.total };
    res = resolveVote(r2, 2, res.cands);
  }
  if (res.kind === 'dice') {
    const c = await rollDice(id, res.cands, my);
    return finishPick(id, c, 'dice', r2 || r1, my, keys);
  }
  return finishPick(id, res.pick, 'vote', r2 || r1, my, keys);
}

async function finishPick(id, c, how, tally, my, keys = []) {
  const n = S.NODES[id];
  const labels = S.optionLabels(n, H.run);
  H.hist[id] = { ...H.hist[id], pick: c, how };
  if (H.vote && !H.vote.closed) await closeVote(true);
  pub({ ph: 'tally', chip: chipOf(n), res: { id, pick: c, label: labels[c - 1], how, keys } });
  H.view = { kind: 'tally', id, labels, tally, pick: c, how };
  render();
  await wait(T.tally, my);
  return c;
}

async function runVote(id, labels, cands, round, ms, my) {
  const n = S.NODES[id];
  const key = voteKey(id, round);
  H.inputs = {};
  H.vote = { id, key, cands, round, labels, deadline: now() + ms / SPEED, total: ms / SPEED, closed: false, early: false };
  pub({ ph: 'vote', chip: chipOf(n), vote: { id, key, q: n.q, labels, cands, round, deadline: H.vote.deadline }, inputKey: key });
  if (H.inputsOff) H.inputsOff();
  H.inputsOff = H.net.on(roomP(`inputs/${key}`), v => { H.inputs = v || {}; checkAllIn(); if (H.view.kind === 'vote') renderVoteCount(); }, () => {});
  H.view = { kind: 'vote', id, labels, cands, round };
  render();
  while (true) {
    await new Promise(r => setTimeout(r, 150));
    chk(my);
    if (H.teacherPick) { const t = H.teacherPick; await closeVote(true); return { teacher: t, key, counts: {}, total: 0 }; }
    if (now() >= H.vote.deadline) break;
    renderTimer();
  }
  const cutoff = H.vote.deadline;            // 공개한 마감 시각까지 낸 표만 센다
  await closeVote(false);                    // 마감(열쇠 닫기) 저장이 서버에 닿을 때까지 기다린다
  await sleep(T.grace);
  chk(my);
  const t = countVotes(H.inputs, seats(), cands, cutoff);
  if (H.inputsOff) { H.inputsOff(); H.inputsOff = null; }
  if (H.teacherPick) return { teacher: H.teacherPick, key, counts: {}, total: 0 };   // 마감 직후에 교사가 고른 것이 우선
  return { ...t, key };
}

async function closeVote(fast) {
  if (!H.vote || H.vote.closed) return;
  H.vote.closed = true;
  const c = { ...H.core, ph: fast ? H.core.ph : 'closing', inputKey: null };
  await pub(c);
  if (fast && H.inputsOff) { H.inputsOff(); H.inputsOff = null; }
}

function checkAllIn() {
  const v = H.vote;
  if (!v || v.closed || v.early) return;
  const on = onlineNums();
  if (!on.length) return;
  const voted = new Set(countVotes(H.inputs, seats(), v.cands).voters);
  if (on.every(n => voted.has(n))) {
    v.early = true;
    const d = now() + T.allIn / SPEED;
    if (d < v.deadline) {
      v.deadline = d;
      pub({ ...H.core, vote: { ...H.core.vote, deadline: d } });
    }
  }
}

async function showTally(id, labels, tally, pick, how, my) {
  H.view = { kind: 'tally', id, labels, tally, pick, how };
  pub({ ph: 'closing', chip: H.core.chip, vote: H.core.vote });
  render();
  await wait(T.tally, my);
}

async function rollDice(id, cands, my) {
  const c = cands[randInt(cands.length)];
  H.view = { kind: 'dice', id, cands, pick: c, labels: S.optionLabels(S.NODES[id], H.run), t0: Date.now() };
  pub({ ph: 'dice', chip: H.core.chip });
  render();
  await wait(T.dice, my, { skip: false, pausable: false });
  return c;
}

function waitTeacher(my) {
  return new Promise((resolve, reject) => {
    const iv = setInterval(() => {
      if (my !== H.gen) { clearInterval(iv); reject(CANCEL); }
      else if (H.teacherPick) { clearInterval(iv); resolve(H.teacherPick); }
    }, 120);
  });
}

function applyPick(id, c) {
  if (id === 'V0') {
    H.run.v0 = c;
    let g = c === 1 ? 'm' : c === 2 ? 'f' : null;
    if (!g) g = H.hist.V0 && H.hist.V0.gender || (randInt(2) ? 'f' : 'm');
    H.run.g = g; H.run.name = S.NAMES[g][0];
  } else H.run.ch[id] = c;
  saveSnap();
}

async function showFx(id, c, my) {
  const fx = S.fxOf(id, c);
  H.view = { kind: 'fx', id, fx };
  pub({ ph: 'fx', chip: H.core.chip, res: H.core.res });
  render();
  await wait(T.fx, my);
}

function endCard(id) {
  const n = S.NODES[id];
  const st = S.statsOf(H.run), l = S.lightsOf(st);
  H.pos = { id, k: 'endcard', i: 0 };
  stopVoice();
  H.view = { kind: 'endcard', id };
  pub({ ph: 'endcard', chip: '졸업식', end: { id, name: n.name, lights: l } });
  const board = LS.get(LS_BOARD, []);
  board.push({ mode: 'class', text: `E${n.no} ${n.name}`, lights: l, at: Date.now() });
  LS.set(LS_BOARD, board.slice(-60));
  render();
}

// ── 교사 조작 ────────────────────────────────────────────────────
function next() {
  const w = H.waiter;
  if (w && w.skip) w.finish();
}
function togglePause() {
  H.auto = !H.auto;
  const w = H.waiter;
  if (w && w.pausable) { if (H.auto) w.resume(); else w.pause(); }
  renderBar();
}
function teacherDecide(c) {
  H.teacherPick = c; H.picker = false;
  const w = H.waiter; if (w && w.skip) w.finish();
  render();
}
function setPace(p) { H.pace = p; const pr = LS.get(LS_PREF, {}); pr.pace = p; LS.set(LS_PREF, pr); saveSnap(); renderBar(); }

function openRefl() {
  H.pos = { ...H.pos, k: 'refl' };
  if (H.meta.mode === 'class') pub({ ph: 'refl', chip: '생각 정리' });
  H.view = { kind: 'refl' };
  render();
}

async function closeClass() {
  if (!confirm('수업을 끝낼까요?\n방과 학생 기록(투표 · 진행 · 성찰)을 모두 지웁니다.')) return;
  H.gen++;
  if (H.waiter) { try { H.waiter.cancel(); } catch {} }
  if (H.meta && H.meta.mode === 'solo' && H.solo) recordSoloBoard();
  if (!H.offline && H.code) {
    for (const off of H.offs) off();
    H.offs = [];
    try { await H.net.withTimeout(H.net.remove(`${ROOT}/${H.code}`), 8000, '방 지우기'); }
    catch { toast('방을 지우지 못했어요. 인터넷을 확인하고 다시 눌러 주세요', true); return; }
    LS.set(LS_ROOMS, LS.get(LS_ROOMS, []).filter(r => r.code !== H.code));
  }
  LS.del(LS_SNAP);
  Object.assign(H, { code: null, meta: null, offline: false, run: null, pos: null, view: {}, solo: {}, refl: {}, players: {} });
  startStep = 'menu'; fxKey = ''; H.ecShown = null;
  renderStart({});
}

// ── 개인 모드 ────────────────────────────────────────────────────
function soloRecords() {
  // 번호마다 하나: 가장 많이 간 기록(같으면 나중 기기)
  const byNum = {};
  for (const [u, r] of Object.entries(H.solo || {})) {
    const p = H.players[u] || {};
    const num = p.num || H.numOf[u];          // 기기를 바꿔 자리가 지워진 옛 기록도 번호로 센다
    if (!num || num > seatsOf(H.meta) || !r || typeof r.st !== 'number') continue;
    const cur = byNum[num];
    const score = (r.e ? 100 : 0) + r.st;
    if (!cur || score > cur.score || (score === cur.score && (p.joinedAt || 0) > (cur.at || 0))) byNum[num] = { ...r, score, at: p.joinedAt };
  }
  return Object.values(byNum);
}
function soloStats() {
  const recs = soloRecords();
  const ends = {}, lights = { 1: 0, 2: 0, 3: 0 }, grade = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const picks = {};
  let n = 0;
  for (const r of recs) {
    grade[gradeOf(r.st, r.e)]++;
    if (Number.isInteger(r.e) && r.e >= 1 && r.e <= 10) { n++; ends['E' + r.e] = (ends['E' + r.e] || 0) + 1; if (r.l >= 1 && r.l <= 3) lights[r.l]++; }
    S.CHOICE_IDS.forEach((id, i) => {
      const c = r['c' + (i + 1)];
      if (!Number.isInteger(c) || c < 1 || c > S.NODES[id].opts.length) return;   // 규칙을 통과해도 선택지 밖 번호는 버린다
      picks[id] = picks[id] || {}; picks[id][c] = (picks[id][c] || 0) + 1;
    });
  }
  return { n, ends, lights, grade, picks, people: recs.length };
}
function onSolo() {
  const st = soloStats();
  const pubStats = { n: st.n, ends: st.ends, lights: st.lights };
  const sig = JSON.stringify(pubStats);
  if (sig !== H.statsSig) {
    H.statsSig = sig;
    const t = Date.now();
    const go = () => { H.statsAt = Date.now(); H.core = { m: 'solo', ph: H.meta.phase, stats: pubStats }; U({ 'state/c': JSON.stringify(H.core) }); };
    clearTimeout(H.statsTimer);
    if (t - H.statsAt > 1500) go(); else H.statsTimer = setTimeout(go, 1500);
  }
  if (H.view.kind === 'solo') renderSolo();
}
function recordSoloBoard() {
  const st = soloStats();
  if (!st.n) return;
  const top = Object.entries(st.ends).sort((a, b) => b[1] - a[1])[0];
  const board = LS.get(LS_BOARD, []);
  board.push({ mode: 'solo', text: `${st.n}명 졸업 · 가장 많은 엔딩 E${top[0].slice(1)}`, lightsText: `💡💡💡 ${st.lights[3]}명`, at: Date.now() });
  LS.set(LS_BOARD, board.slice(-60));
}
function onRefl() { if (H.view.kind === 'refl' || H.view.kind === 'solo') render(); else renderBar(); }

// ── 그리기 ───────────────────────────────────────────────────────
function renderBar() {
  const m = H.meta;
  const ppl = present().filter(p => p.on).length;
  const cls = m && m.mode === 'class' && m.phase === 'play' && !['endcard', 'refl'].includes(H.view.kind);
  $('#bar').innerHTML = `
    <span class="b-title">${emblemHTML()}<span>손잡이 동아리</span></span>
    ${m ? `<span class="b-chip mode">${seatsOf(m)}명 · ${m.mode === 'class' ? '전체 모드' : '개인 모드'}</span>` : ''}
    ${H.code ? `<span class="b-chip strong">방 <b class="num">${esc(H.code)}</b></span>` : ''}
    ${m && !H.offline ? `<span class="b-chip" id="pplChip">👥 <b class="num">${ppl}</b>명</span>` : ''}
    ${H.offline ? '<span class="b-conn off"><i></i>비상 모드(인터넷 없이)</span>' : m ? `<span class="b-conn ${H.connected ? 'ok' : 'bad'}"><i></i>${H.connected ? '연결됨' : '끊김'}</span>` : ''}
    <span class="b-sp"></span>
    ${cls ? `
      <button class="b-btn ${H.auto ? '' : 'on'}" id="bPause" aria-pressed="${!H.auto}">${H.auto ? '⏸ 멈춤' : '▶ 자동 진행'}</button>
      <button class="b-btn" id="bNext" title="다음 줄 · 다음 단계로 (오른쪽 화살표 · 스페이스)">다음 ▶</button>
      <span class="b-pace" role="group" aria-label="글 속도">${[['slow', '느리게'], ['normal', '보통'], ['fast', '빠르게']].map(([k, l]) => `<button class="b-btn ${H.pace === k ? 'on' : ''}" data-pace="${k}">${l}</button>`).join('')}</span>
      <button class="b-btn" id="bPick">교사가 정하기</button>` : ''}
    ${soundSlot('bar')}
    ${m ? '<button class="b-btn" id="bFull" title="전체 화면">⛶</button><button class="b-btn danger" id="bEnd">수업 끝</button>' : ''}`;
  mountSoundSlots($('#bar'));
  const b = id => document.getElementById(id);
  if (b('bPause')) b('bPause').onclick = togglePause;
  if (b('bNext')) b('bNext').onclick = e => advance('button', e);
  if (b('bPick')) b('bPick').onclick = () => {
    if (!['think', 'vote', 'offline-pick'].includes(H.view.kind)) { toast('갈림길(생각 시간 · 투표)에서 쓸 수 있어요'); return; }
    H.picker = !H.picker; render();
  };
  document.querySelectorAll('[data-pace]').forEach(x => x.onclick = () => setPace(x.dataset.pace));
  if (b('bFull')) b('bFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); };
  if (b('bEnd')) b('bEnd').onclick = closeClass;
}
function renderPeople() {
  const c = document.getElementById('pplChip');
  if (c) c.innerHTML = `👥 <b class="num">${present().filter(p => p.on).length}</b>명`;
}

function render() {
  if (H.meta) document.body.classList.remove('at-title');
  renderBar();
  if (!H.meta) return;
  if (H.meta.phase === 'lobby') return renderLobby();
  if (H.meta.mode === 'solo') return H.view.kind === 'refl' ? renderReflWall() : renderSolo();
  const v = H.view;
  if (v.kind === 'endcard') return renderEndCard();
  if (v.kind === 'refl') return renderReflWall();
  return renderPlay();
}

function joinURL() {
  const u = new URL('./', location.href);
  return u.href.replace(/\/$/, '/');
}

function renderLobby() {
  H.view = { kind: 'lobby' };
  music('open');
  const nums = {};
  for (const p of present()) nums[p.num] = nums[p.num] || p.on;
  const n = Object.values(nums).filter(Boolean).length;
  stage.innerHTML = `<div class="lobby">
    <div class="lobby-l">
      <div class="eyebrow">${H.meta.mode === 'class' ? '전체 모드 · 반 전체가 한 사람의 3년을 고른다' : '개인 모드 · 크롬북에서 각자 끝까지'}</div>
      <div class="lobby-code"><span class="dim">방 코드</span><b class="num">${esc(H.code)}</b></div>
      <div class="lobby-url">${esc(joinURL())}</div>
      <p class="lead">크롬북에서 위 주소 → 방 코드 + 내 번호. 이름은 넣지 않아요.</p>
      <div class="pv-row"><button class="btn big" id="bStart">${H.meta.mode === 'class' ? '이야기 시작 ▶' : '개인 모드 시작 ▶'}</button><span class="dim">지금 <b class="num">${n}</b>명</span></div>
    </div>
    <div class="lobby-r"><div class="numgrid ${seatsOf(H.meta) > 60 ? 'lots' : seatsOf(H.meta) > 30 ? 'many' : ''}">${Array.from({ length: seatsOf(H.meta) }, (_, i) => i + 1).map(k => `<span class="ng ${nums[k] ? 'on' : nums[k] === false ? 'off' : ''}">${k}${nums[k] ? '<i>✓</i>' : ''}</span>`).join('')}</div>
      <p class="dim small">✓ 접속 · 흐린 칸 = 아직 · 줄 친 칸 = 끊김</p></div>
  </div>`;
  $('#bStart').onclick = () => {
    if (H.meta.mode === 'class') startStory();
    else { setMeta({ phase: 'play' }); H.core = { m: 'solo', ph: 'play', stats: { n: 0, ends: {}, lights: {} } }; U({ 'state/c': JSON.stringify(H.core) }); H.view = { kind: 'solo' }; render(); }
  };
}

function renderPlay() {
  const v = H.view;
  if (!v || !v.id) { stage.innerHTML = ''; return; }
  const n = S.NODES[v.id];
  const run = H.run;
  const st = run.g ? S.statsOf(run) : null;
  let lines = [], shown = 0, overlay = '', speaker = null, bg = n.bg, cg = null, cast = n.cast || [], notes = [], delta = null;
  if (v.kind === 'lines') {
    lines = v.lines; shown = v.shown; speaker = lines[shown - 1] && lines[shown - 1].role;
    if (v.k === 'after') { const opt = n.opts[run.ch[v.id] - 1]; if (opt && opt.bg) bg = opt.bg; }
    if (v.k === 'ending') { cg = cgKey(v.id, run.g); if (cg) cast = []; }
  } else if (v.kind === 'title') {
    if (v.big == null) { const ch = chapterOf(n.when); v.big = !!ch.grade && ch.grade !== H.lastGrade; }
    const big = v.big;
    overlay = `<div class="ov-title ${big ? 'big' : ''}"><div class="fc-band"><span class="ov-when">${esc(n.when || '')}</span><b class="ov-name">${esc(n.title || '')}</b></div></div>`;
  } else if (v.kind === 'think' || v.kind === 'vote' || v.kind === 'offline-pick' || v.kind === 'tally' || v.kind === 'dice') {
    overlay = voteOverlay(v, n);
  } else if (v.kind === 'fx') {
    delta = {};
    for (const s of S.SHOWN) if (v.fx[s.k] > 0) delta[s.k] = v.fx[s.k];
    notes = ['A', 'B', 'C', 'T'].filter(k => v.fx[k] > 0);
    if (notes.includes('T') && !cast.includes('T')) cast = [...cast, 'T'];
    overlay = fxOverlay(v.fx, cast, run);
  }
  if (n.type === 'choice' && v.kind !== 'lines') speaker = null;
  // 장면 제목 · 갈림길 판(생각 · 투표 · 결과 · 주사위)이 뜨는 동안은 인물을 내린다 — 판이 얼굴을 덮지 않게
  if (['title', 'think', 'vote', 'offline-pick', 'tally', 'dice'].includes(v.kind)) cast = [];
  let hp = stage.querySelector(':scope > .host-play');
  if (!hp) { stage.innerHTML = '<div class="host-play"><div class="hp-stage"></div><div class="hp-extra"></div></div>'; hp = stage.firstElementChild; }
  const isCg = v.kind === 'lines' && v.k === 'ending' && !!cg;
  const rebuilt = renderStage(hp.querySelector('.hp-stage'), { bg, tint: n.tint, cg, cast, speaker, run, when: n.when, romance: !!n.rel, chip: n.type === 'ending' ? `졸업식 · ${n.name}` : chipOf(n), hud: st, delta, notes, overlay,
    boxHTML: v.kind === 'lines' ? boxHTML(lines, shown, isCg ? { keep: 2, cls: 'cg-box', head: cgHead(n) } : { keep: 6 }) : '', cls: 'big' });
  hp.querySelector('.hp-extra').innerHTML = `${H.picker && ['think', 'vote', 'offline-pick'].includes(v.kind) ? pickerHTML(n) : ''}
    ${!H.auto ? '<div class="paused-tag" role="status">⏸ 멈춤 — 「다음 ▶」으로 한 줄씩</div>' : ''}`;
  stage.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => teacherDecide(Number(b.dataset.pick)));
  const cl = $('#bPickClose'); if (cl) cl.onclick = () => { H.picker = false; render(); };
  const go = $('#bGoVote'); if (go) go.onclick = next;
  if (v.kind === 'dice') animateDice(v);
  if (v.kind === 'vote') { renderTimer(); renderVoteCount(); }
  if (v.kind === 'think' && v.until) thinkTimer(v);
  playFx(v, n, hp.querySelector('.hp-stage'), rebuilt, delta, notes);
}

// ── 소리 · 효과(그릴 때마다 부르되, 같은 순간에는 한 번만) ─────────────
let fxKey = '';
function playFx(v, n, st, rebuilt, delta, notes) {
  const run = H.run;
  if (v.kind === 'lines' && v.k === 'ending') music('end');
  else music('main', moodOf(v.id, n, v.k, v.k === 'after' && n.opts ? n.opts[run.ch[v.id] - 1] : null));
  const key = [v.kind, v.id, v.k || '', v.shown || 0, v.round || 0, v.how || '', v.pick || 0, v.title ? 1 : 0, v.until ? 1 : 0].join('|');
  if (key === fxKey) return;
  fxKey = key;
  if (rebuilt && !['lines', 'title'].includes(v.kind)) sfx('whoosh');
  if (v.kind === 'title') { sfx('chapter'); const ch = chapterOf(n.when); if (ch.grade) H.lastGrade = ch.grade; }
  else if (v.kind === 'lines') {
    const line = v.lines[v.shown - 1];
    const f = lineFx(line, !!(n.rel || n.slot));
    typewrite(st, { speed: SPEED, key: f.key });
    if (v.k === 'ending' && v.shown === 1) endingReveal(st);
    else if (rebuilt) sfx('whoosh');
    else sfx('tick');
    emphasize(st, f);
    if (f.shake) shake(st);
    if (f.tech) techBurst(st, f.water);
    if (f.emote && line && line.role) emote(st, line.role, f.emote);
    hintOnce('vn.hint.host', '화면을 눌러도 다음 줄로 넘어가요 (스페이스 · →)');
  } else if (v.kind === 'think') { if (!v.title) sfx('select'); else sfx('slide'); }
  else if (v.kind === 'vote') { H.countLast = null; sfx('voteOpen'); sfx('slide'); }
  else if (v.kind === 'tally') {
    if (v.how === 'retie') sfx('tie');
    else tallyDrama(st, (v.labels || []).length || 3);
  } else if (v.kind === 'dice') sfx('dice', { dur: T.dice / SPEED * 0.8 / 1000 });
  else if (v.kind === 'fx') {
    floatChips(st, delta, S.SHOWN);
    if (notes && notes.length) setTimeout(() => sfx('note'), 380);
  }
}

// ── 화면을 눌러도 다음으로(대사 · 장면 제목 · 지표 변화에서만 — 갈림길 · 투표 · 결과는 넘기지 않음) ──
let lastAdv = 0;
const ADV_KINDS = ['lines', 'title', 'fx'];
function advance(src, e) {
  if (e && (e.repeat || e.detail > 1)) return;   // 키 누르고 있기 · 두 번 누름의 둘째는 무시
  const t = performance.now();
  if (e && e.isTrusted && t - lastAdv < 250) return;   // 진짜 손가락 · 키 연타(250ms 안)는 한 번만
  lastAdv = t;
  if (twBusy()) { twFinish(); return; }       // 글자를 찍는 중이면 먼저 다 보여 준다(이것도 한 번 누름으로 센다)
  next();
}
stage.addEventListener('click', e => {
  if (!H.meta || H.meta.mode !== 'class' || H.meta.phase !== 'play') return;
  if (!ADV_KINDS.includes(H.view.kind)) return;
  if (!isAdvanceClick(e)) return;
  advance('click', e);
});

function voteOverlay(v, n) {
  const labels = v.labels || S.optionLabels(n, H.run);
  const cands = v.cands || labels.map((_, i) => i + 1);
  const tally = v.tally;
  const total = tally ? tally.total : 0;
  const head = v.kind === 'think' ? (v.title ? '갈림길!' : '💬 생각 시간 — 옆 친구와 이야기해요')
    : v.kind === 'vote' ? (v.round === 2 ? '동률! 동률인 길만 다시 투표' : '크롬북으로 투표하세요')
    : v.kind === 'offline-pick' ? '손을 들어 고르고, 선생님이 눌러요'
    : v.kind === 'dice' ? '🎲 이야기 주사위' : v.how === 'retie' ? '동률이에요!' : v.how === 'teacher' ? '선생님이 정했어요' : v.how === 'dice' ? '🎲 주사위가 정했어요' : '우리 반의 선택';
  const rows = labels.map((l, i) => {
    const c = i + 1;
    const inPlay = cands.includes(c) || v.kind === 'tally';
    const cnt = tally ? (tally.counts[c] || 0) : 0;
    const pct = total ? Math.round(cnt / total * 100) : 0;
    const win = v.pick === c;
    return `<div class="vo-row ${inPlay ? '' : 'out'} ${win ? 'win' : ''}" data-c="${c}">
      <span class="vo-n">${CIRCLED[c]}</span><span class="vo-t">${esc(l)}</span>
      ${tally && v.kind === 'tally' ? `<span class="vo-bar"><i style="width:${pct}%"></i></span><b class="num vo-c">${cnt}표 · ${pct}%</b>` : ''}
      ${win ? '<span class="vo-win">✓ 이 길로</span>' : ''}
      ${v.kind === 'offline-pick' ? `<button class="btn small" data-pick="${c}">이 길로</button>` : ''}
    </div>`;
  }).join('');
  return `<div class="ov-vote ${v.kind}" role="region" aria-label="갈림길">
    <div class="vo-head"><span class="vo-kicker">${esc(head)}</span>${v.kind === 'vote' ? '<span class="vo-timer num" id="voTimer"></span>' : ''}${v.kind === 'think' && v.until ? '<span class="vo-timer num" id="thTimer"></span>' : ''}</div>
    <h2 class="vo-q">${esc(n.q || '')}</h2>
    <div class="vo-rows">${rows}</div>
    <div class="vo-foot">${v.kind === 'vote' ? '<span id="voCount" class="num"></span>' : ''}
      ${v.kind === 'think' && v.until ? '<button class="btn" id="bGoVote">바로 투표 ▶</button>' : ''}
      ${v.kind === 'dice' ? `<div class="dice-face num" id="diceFace">🎲</div>` : ''}</div>
  </div>`;
}

function renderTimer() {
  const el = document.getElementById('voTimer');
  if (!el || !H.vote) return;
  const left = Math.max(0, Math.ceil((H.vote.deadline - now()) / 1000 * SPEED));
  el.textContent = `${left}초`;
  el.classList.toggle('hurry', left <= 5);
  el.style.setProperty('--p', H.vote.total ? Math.max(0, Math.min(1, (H.vote.deadline - now()) / H.vote.total)).toFixed(3) : 1);
  if (H.countLast !== left) { H.countLast = left; countdown(left, stage.querySelector('.ov-vote')); }
}
function renderVoteCount() {
  const el = document.getElementById('voCount');
  if (!el || !H.vote) return;
  const t = countVotes(H.inputs, seats(), H.vote.cands);
  el.textContent = `${t.total} / ${onlineNums().length}명 냈어요 (누가 냈는지는 안 보여요)`;
}
function thinkTimer(v) {
  const tick = () => {
    const el = document.getElementById('thTimer');
    if (!el || H.view !== v) return;
    el.textContent = `${Math.max(0, Math.ceil((v.until - Date.now()) / 1000 * SPEED))}초`;
    setTimeout(tick, 250);
  };
  tick();
}
function animateDice(v) {
  const el = document.getElementById('diceFace');
  if (!el) return;
  const rows = stage.querySelectorAll('.vo-row');
  const dur = T.dice / SPEED * 0.8;
  let i = 0;
  const step = () => {
    if (H.view !== v) return;
    const elapsed = Date.now() - v.t0;
    const c = elapsed >= dur ? v.pick : v.cands[i++ % v.cands.length];
    el.textContent = `🎲 ${CIRCLED[c]}`;
    rows.forEach(r => r.classList.toggle('roll', Number(r.dataset.c) === c));
    if (elapsed < dur) setTimeout(step, 120 + elapsed / dur * 200);
    else { rows.forEach(r => r.classList.toggle('win', Number(r.dataset.c) === v.pick)); sfx('diceStop'); winBurst(stage.querySelector('.vo-row.win'), true); }
  };
  step();
}
function fxOverlay(fx, cast = [], run = {}) {
  const parts = S.SHOWN.filter(x => fx[x.k] > 0).map(x => `<span class="fx-i">${statIcon(x.k)} ${x.label} <b>+${fx[x.k]}</b></span>`);
  if (fx.book) parts.push('<span class="fx-i">📘 후배 설명서</span>');
  // 무대에 없는 사람의 호감이 오르면 얼굴 + ♪ (숫자는 안 보인다)
  const off = ['A', 'B', 'C', 'T'].filter(k => fx[k] > 0 && !cast.includes(k));
  if (off.length) parts.push(`<span class="fx-i soft">${off.map(k => faceHTML(S.roleChar(k, run), 1)).join('')} ♪</span>`);
  if (!parts.length) return '';
  return `<div class="vn-fx big" role="status">${parts.join('')}</div>`;
}
function pickerHTML(n) {
  if (n.type !== 'choice') return `<div class="picker card"><b>교사가 정하기</b><p class="dim">갈림길에서 쓸 수 있어요.</p><button class="btn ghost" id="bPickClose">닫기</button></div>`;
  const labels = S.optionLabels(n, H.run);
  return `<div class="picker card" role="dialog" aria-label="교사가 정하기"><b>교사가 정하기 — ${esc(n.q)}</b>
    <div class="pk-rows">${labels.map((l, i) => `<button class="btn ghost" data-pick="${i + 1}">${CIRCLED[i + 1]} ${esc(l)}</button>`).join('')}</div>
    <button class="btn ghost small" id="bPickClose">닫기</button></div>`;
}

/** 길 표에 쓸 짧은 이름: 「은결 옆에 앉기 — 질문하던 친구」 → 「은결 옆에 앉기」 (앞부분이 너무 짧으면 그대로) */
function shortLab(lab) {
  const s = String(lab || '');
  const i = s.indexOf(' — ');
  return i >= 4 ? s.slice(0, i) : s;
}
function renderEndCard() {
  const id = H.view.id, n = S.NODES[id], run = H.run;
  const st = S.statsOf(run), l = S.lightsOf(st);
  const re = S.rethinkOf(run);
  const path = S.CHOICE_IDS.map(cid => {
    const h = H.hist[cid] || {};
    const c = run.ch[cid];
    const lab = S.optionLabels(S.NODES[cid], run)[c - 1];
    const r1 = h.r1;
    const other = r1 && r1.total ? Math.round((r1.total - (r1.counts[c] || 0)) / r1.total * 100) : null;
    return `<tr><td class="num">${cid}</td><td>${CIRCLED[c]} ${esc(shortLab(lab))}</td><td class="pt-how">${h.how === 'teacher' ? '선생님' : h.how === 'dice' ? '주사위' : '투표'}</td><td class="num pt-other">${other == null ? '' : `다른 길 ${other}%`}</td></tr>`;
  }).join('');
  stage.innerHTML = `<div class="endcard host">
    <div class="ec-head"><div class="eyebrow">졸업식 · 엔딩 ${n.no} / 10</div>
      <h1 class="ec-title">${esc(n.name)}${n.sub ? ` <span class="dim">· ${esc(n.sub)}</span>` : ''}</h1>
      <p class="ec-msg">${esc(n.msg)}</p></div>
    <div class="ec-grid three">
      <div class="ec-lights card"><div class="lbl">루미타의 불빛 <span class="num">${l} / 3</span></div>${lightsHTML(l)}<p>${esc(S.LIGHTS[l])}</p>
        <div class="lbl">우리 반 지표</div><p class="num ec-stats">${S.SHOWN.map(x => `<span>${statIcon(x.k)} ${x.label} <b>${st[x.k]}</b></span>`).join('')}</p>
        ${re.length ? `<div class="lbl">다음엔 이렇게 해 볼까?</div><ul class="rethink">${re.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${id === 'E10' ? `<div class="hint">💡 ${esc(S.E10_HINT[run.ch.V11] || '')}</div>` : ''}</div>
      ${cardHTML(n.card)}
      <div class="card path"><div class="lbl">우리 반이 간 길</div><table class="ptable"><tbody>${path}</tbody></table></div>
    </div>
    <div class="pv-row"><button class="btn big" id="bRefl">생각 정리(성찰) 열기 ▶</button></div>
  </div>`;
  $('#bRefl').onclick = openRefl;
  music('end');
  if (H.ecShown !== id) { H.ecShown = id; sfx('reveal'); confetti(stage.querySelector('.ec-head'), 30, { paper: true }); }
}

function reflItems() {
  const out = [];
  for (const [u, r] of Object.entries(H.refl || {})) {
    if (!r || H.hidden[u]) continue;
    for (const q of REFL_Q) if (typeof r[q.k] === 'string' && r[q.k].trim()) out.push({ u, k: q.k, tag: q.tag, text: r[q.k].slice(0, 300), h: hash(u + q.k) });
  }
  const qi = k => REFL_Q.findIndex(q => q.k === k);
  return out.sort((a, b) => qi(a.k) - qi(b.k) || a.h - b.h);   // 질문 순서대로(같은 질문 안은 섞어서 — 이름 · 순서로 누구인지 알 수 없게)
}
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }

function reflWallHTML() {
  const items = reflItems();
  const people = Object.keys(H.refl || {}).filter(u => !H.hidden[u]).length;
  return `<div class="wall">
    <div class="wall-head"><b>생각 정리</b> <span class="dim">· 이름 없이 · ${people}명 보냄</span></div>
    <div class="wall-cols">${REFL_Q.map((q, i) => {
      const mine = items.filter(it => it.k === q.k);
      return `<section class="wall-col q-${q.k}" aria-label="${esc(q.tag)}">
        <div class="wall-q"><div class="wq-top"><span class="wq-tag">${i + 1} · ${esc(q.tag)}</span><span class="num" aria-label="${mine.length}개">${mine.length}</span></div>
          <b class="wq-short">${esc(q.short || q.tag)}</b>${q.term ? `<span class="wq-term">${esc(q.term)}</span>` : ''}<p>${esc(q.q)}</p></div>
        ${mine.map(it => `<div class="wcard q-${it.k}"><p>${esc(it.text)}</p>
          <button class="wc-hide" data-hide="${esc(it.u)}" title="이 학생의 성찰을 가리고 지워요" aria-label="가리기">가리기</button></div>`).join('') || '<p class="dim small">아직 없어요</p>'}
      </section>`; }).join('')}</div>
  </div>`;
}
function bindWall() {
  stage.querySelectorAll('[data-hide]').forEach(b => b.onclick = () => {
    const u = b.dataset.hide;
    if (!confirm('이 성찰을 가릴까요? (데이터에서도 지워요)')) return;
    H.hidden[u] = true; saveSnap();
    U({ [`refl/${u}`]: null });
    render();
  });
}
function renderReflWall() {
  music('end');
  stage.innerHTML = `<div class="refl-host">${reflWallHTML()}
    <div class="pv-row"><button class="btn ghost" id="bBack">← ${H.meta.mode === 'class' ? '엔딩 카드' : '반 통계'}로</button><button class="btn" id="bEnd2">수업 끝(방 지우기)</button></div></div>`;
  bindWall();
  $('#bBack').onclick = () => { H.view = H.meta.mode === 'class' ? { kind: 'endcard', id: H.pos.id } : { kind: 'solo' }; render(); };
  $('#bEnd2').onclick = closeClass;
}

function renderSolo() {
  H.view = { kind: 'solo' };
  music(H.meta.phase === 'play' ? 'main' : 'end');
  const st = soloStats();
  const phase = H.meta.phase;
  const reflN = Object.keys(H.refl || {}).filter(u => !H.hidden[u]).length;
  const maxE = Math.max(1, ...S.ENDING_IDS.map(e => st.ends[e] || 0));
  if (phase === 'play') {
    stage.innerHTML = `<div class="solo-host">
      <div class="sh-grades">${[1, 2, 3, 4].map(g => `<div class="gcol"><div class="gbar"><i style="height:${st.people ? st.grade[g] / st.people * 100 : 0}%"></i></div><b class="num">${st.grade[g]}</b><span>${GRADE_LABEL[g]}</span></div>`).join('')}</div>
      <div class="sh-board"><div class="lbl">엔딩 판 <span class="dim">(첫 엔딩만 · 이름 없음)</span></div>
        <div class="eboard">${S.ENDING_IDS.map(e => `<div class="ecell ${st.ends[e] ? 'got' : ''}"><b>${S.NODES[e].no}</b><span>${esc(S.NODES[e].name)}</span><em class="num">${st.ends[e] || ''}</em></div>`).join('')}</div>
        <p class="dim">졸업 <b class="num">${st.n}</b> / ${seatsOf(H.meta)}명 · 불빛 ${[3, 2, 1].map(k => `${'💡'.repeat(k)} ${st.lights[k]}`).join(' · ')} · 성찰 ${reflN}명</p>
        <div class="pv-row"><button class="btn big" id="bGrad">모두 졸업! → 반 통계 ▶</button></div></div>
    </div>`;
    $('#bGrad').onclick = () => { setMeta({ phase: 'stats' }); H.core = { ...H.core, ph: 'stats' }; U({ 'state/c': JSON.stringify(H.core) }); render(); };
    return;
  }
  // stats
  const pickRows = S.CHOICE_IDS.map(id => {
    const p = st.picks[id] || {};
    const tot = Object.values(p).reduce((a, b) => a + b, 0);
    if (!tot) return `<tr><td class="num">${id}</td><td colspan="2" class="dim">—</td></tr>`;
    const [c, k] = Object.entries(p).sort((a, b) => b[1] - a[1])[0];
    return `<tr><td class="num">${id}</td><td>${CIRCLED[c]} ${esc(S.neutralLabel(S.NODES[id].opts[c - 1].label))}</td><td class="num">${Math.round(k / tot * 100)}%</td></tr>`;
  }).join('');
  stage.innerHTML = `<div class="solo-stats">
    <div class="ss-l card"><div class="lbl">우리 반 첫 엔딩 <span class="dim">(${st.n}명 · 성별 · 이름 없음)</span></div>
      ${S.ENDING_IDS.map(e => { const v = st.ends[e] || 0; return `<div class="cs-row"><span class="cs-n">${S.NODES[e].no}. ${esc(S.NODES[e].name)}</span><span class="cs-bar"><i style="width:${v / maxE * 100}%"></i></span><b class="num">${v}</b></div>`; }).join('')}
      <div class="cs-l">루미타의 불빛 ${[3, 2, 1].map(k => `${'💡'.repeat(k)} <b class="num">${st.lights[k]}</b>명`).join(' · ')}</div></div>
    <div class="ss-r card"><div class="lbl">갈림길마다 가장 많이 고른 길</div><table class="ptable"><tbody>${pickRows}</tbody></table></div>
    <div class="pv-row ss-foot"><button class="btn big" id="bWall">성찰 모아 보기 (${reflN}) ▶</button><button class="btn ghost" id="bBackPlay">← 진행 화면</button></div>
  </div>`;
  $('#bWall').onclick = () => { H.view = { kind: 'refl' }; render(); };
  $('#bBackPlay').onclick = () => { setMeta({ phase: 'play' }); H.core = { ...H.core, ph: 'play' }; U({ 'state/c': JSON.stringify(H.core) }); render(); };
}

// ── 알림 ─────────────────────────────────────────────────────────
function toast(msg, bad = false) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; t.setAttribute('role', 'status');
  box.appendChild(t);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => t.remove(), bad ? 6000 : 3000);
}

document.addEventListener('keydown', e => {
  if (!H.meta || H.meta.mode !== 'class' || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const ae = document.activeElement;
  const field = ae.closest && ae.closest('input, select, textarea, [contenteditable], [role="slider"]');   // → 는 입력 칸 · 크기 막대에서만 양보
  const free = ae === document.body || !ae.closest('button, a, input, select, textarea, [role="button"]');  // 스페이스 · Enter 는 단추 위에서 양보(단추 자체가 눌린다)
  if ((e.key === 'ArrowRight' && !field && (free || ae.id === 'bNext')) || ((e.key === ' ' || e.key === 'Enter') && free)) {   // → 도 단추 · 설정 위에서는 양보(「다음」 단추만 예외)
    e.preventDefault();
    if (e.repeat) return;
    if (ADV_KINDS.includes(H.view.kind)) advance('key', e);
    else if (e.key !== 'Enter') next();      // 생각 시간 건너뛰기 등은 예전처럼(→ · 스페이스만)
  }
  if (e.key === 'p' || e.key === 'P') togglePause();
});
window.addEventListener('beforeunload', e => {
  if (H.meta && H.meta.phase !== 'done' && (H.code || H.offline)) { saveSnap(); e.preventDefault(); e.returnValue = ''; }
});

// 시험용 손잡이
// 시험 · 시연용: 효과를 바로 띄워 보기(얼굴 가림 검사에 쓴다)
H.fx = { emote: (role, k) => emote(stage.querySelector('.hp-stage'), role, k), bloom: () => bloom(stage.querySelector('.hp-stage')), shake: () => shake(stage.querySelector('.hp-stage')), tech: w => techBurst(stage.querySelector('.hp-stage'), w),
  chips: d => floatChips(stage.querySelector('.hp-stage'), d, S.SHOWN), twBusy, card: (w, t, b) => chapterCard(stage.querySelector('.hp-stage'), w, t, b), tally: () => tallyDrama(stage, 3), count: l => countdown(l, null), ending: () => endingReveal(stage.querySelector('.hp-stage')), emph: f => emphasize(stage.querySelector('.hp-stage'), f) };
H.api = { next, togglePause, teacherDecide, closeClass: () => { window.confirm = () => true; return closeClass(); }, openRefl, setPace };

boot();
