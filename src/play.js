// 크롬북(학생) — 방 코드 + 번호로 들어온다. 이름은 받지 않는다.
//   전체 모드: 큰 화면을 보고, 투표 단추만 누른다(판정은 진행판).
//   개인 모드: 이야기 전체를 이 기기에서 혼자 진행한다. DB 에는 숫자(진행 단계 · 고른 번호 · 엔딩 · 불빛)만 보낸다.
//              주인공 성별 · 이름은 이 기기 안에만 둔다.
//   혼자 하기(alone.html): 방 · 진행판 · 서버 없이 이 브라우저 혼자서. 저장하는 것은 엔딩 기록(도감)뿐이고 중간 진행은 저장하지 않는다.
import { connectNet } from './net.js';
import * as S from './story.js';
import { renderStage, boxHTML, cardHTML, lightsHTML, faceHTML, preload, artFor, cgKey, statIcon, petalsHTML, logoHTML, emblemHTML, kvHTML, cgHead } from './stage.js';
import { initSound, setLocked, music, play as sfx, soundSlot, mountSoundSlots } from './sound.js';
import { speak, stopVoice, preloadVoice } from './voice.js';
import { moodOf, lineFx, emote, shake, techBurst, floatChips, confetti, emphasize, endingReveal, chapterOf, chapterCard, cardSkip, typewrite, twBusy, twFinish, hintOnce, isAdvanceClick } from './fx.js';
import { ROOT, MAX_NUM, seatsOf, esc, parseJSON, devTag, CIRCLED, LS, REFL_Q, MAX_REFL, randInt } from './shared.js';

const $ = s => document.querySelector(s);
const main = $('#main');
const LS_JOIN = 'vn.play';
const LS_DEX = 'vn.alone.dex';   // 혼자 하기: 어떤 엔딩을 봤는지만 남긴다

const P = {
  alone: document.body.dataset.alone === '1',
  net: null, netP: null, connected: false,
  code: null, num: null, joinedAt: null, joined: false, kicked: null, ended: false,
  meta: null, core: {}, inputKey: null, mine: null, myVotes: {}, offs: [], mineOff: null,
  err: '', screen: '', solo: null, reflSent: null, reflDraft: {},
};
window.__vnPlay = P; // 시험 · 점검용
// 소리: 전체 모드 크롬북은 언제나 끔(잠금 · 단추도 숨김 — 소리는 큰 화면에서). 개인 모드는 처음엔 끔, 머리띠 단추로 켠다
if (P.alone) initSound({ page: 'alone', defaults: { bgm: true, sfx: true, bgmVol: 0.4, sfxVol: 0.5, track: 'm1', motion: 'hi', voice: true, voiceVol: 0.9, narr: true } });   // 혼자 하기: 진행판처럼 소리 켬 · 움직임 「상」
else initSound({ page: 'solo', defaults: { bgm: false, sfx: false, bgmVol: 0.4, sfxVol: 0.5, track: 'm1', motion: 'lo', voice: false, voiceVol: 0.9, narr: true }, locked: true });   // 학생 기기: 소리 끔 · 움직임 「하」(교사 확정 10.30)

function connect() {
  if (!P.netP) {
    P.netP = connectNet().then(n => {
      P.net = n;
      n.onConnected(c => { P.connected = c; if (c) presence(); renderBar(); });
      return n;
    }).catch(e => { P.netP = null; throw e; });
  }
  return P.netP;
}
const room = p => `${ROOT}/${P.code}/${p}`;
const myPath = () => room(`players/${P.net.uid}`);

function presence() {
  if (!P.joined || P.kicked || P.ended || !P.net) return;
  P.net.onDisconnectUpdate(myPath(), { on: false, last: P.net.TS }).catch(() => {});
  P.net.update(myPath(), { on: true, last: P.net.TS }).catch(() => {});
  // 끊겨 있던 사이 못 보낸 개인 모드 결과가 있으면 다시 보낸다
  if (P.meta && P.meta.mode === 'solo' && P.solo && P.solo.first && !P.solo.first.sent) sendProgress();
}

// ── 들어가기 ─────────────────────────────────────────────────────
async function join(code, num, auto = false) {
  P.err = '';
  if (!/^\d{4}$/.test(code)) { P.err = '방 코드는 숫자 4자리예요'; return renderJoin(); }
  if (!(Number.isInteger(num) && num >= 1 && num <= MAX_NUM)) { P.err = `번호는 1~${MAX_NUM} 사이예요`; return renderJoin(); }
  P.screen = ''; document.body.classList.remove('at-title'); main.innerHTML = `<div class="pv-center"><div class="pv-big">${auto ? '다시 들어가는 중…' : '들어가는 중…'}</div></div>`;
  try {
    const net = await connect();
    const meta = await net.withTimeout(net.get(`${ROOT}/${code}/meta`), 10000, '방 찾기');
    if (!meta) { P.err = '그런 방이 없어요. 큰 화면의 방 코드를 다시 보세요'; if (auto) LS.del(LS_JOIN); return renderJoin(); }
    const seats = seatsOf(meta);
    if (num > seats) { P.err = `우리 반 번호는 1~${seats}번이에요. 번호를 다시 보세요`; P.code = code; if (auto) LS.del(LS_JOIN); return renderJoin(); }
    leave();
    P.code = code; P.num = num; P.kicked = null; P.ended = false;
    // 순서가 중요하다: ① 「끊김」으로 자리를 만들고 ② 끊김 처리를 건 뒤 ③ 「접속」으로 바꾼다
    // (Firebase 는 onDisconnect 를 걸 때 규칙을 검사한다 — 자리(num)가 없으면 거절된다)
    await net.withTimeout(net.set(myPath(), { num, joinedAt: net.TS, on: false, last: net.TS }), 10000, '들어가기');
    await net.withTimeout(net.onDisconnectUpdate(myPath(), { on: false, last: net.TS }), 10000, '끊김 처리');
    await net.withTimeout(net.update(myPath(), { on: true, last: net.TS }), 10000, '접속 표시');
    P.joinedAt = await net.withTimeout(net.get(myPath() + '/joinedAt'), 10000, '확인');
    P.joined = true;
    LS.set(LS_JOIN, { code, num, at: Date.now() });
    P.roomAt = meta.createdAt || 0;
    P.solo = loadSolo();
    P.reflSent = LS.get(reflKey(), null);
    subscribe();
    render();
    if (meta.mode === 'solo' && P.solo.first && !P.solo.first.sent) sendProgress();
  } catch (e) {
    P.err = /PERMISSION/i.test(e.code || e.message || '') ? '방이 닫혔어요. 선생님께 말해 주세요' : '연결이 안 돼요. 와이파이를 확인하고 다시 눌러 주세요';
    renderJoin();
  }
}

function leave() {
  for (const off of P.offs) off();
  P.offs = [];
  if (P.mineOff) { P.mineOff(); P.mineOff = null; }
  P.joined = false; P.meta = null; P.core = {}; P.inputKey = null; P.mine = null;
  setLocked(true);
}

function subscribe() {
  const n = P.net, on = (p, cb) => P.offs.push(n.on(room(p), cb, () => {}));
  on('meta', v => {
    if (!v && P.joined) { P.ended = true; LS.del(LS_JOIN); n.onDisconnectCancel(myPath()).catch(() => {}); }
    P.meta = v; setLocked(!(v && v.mode === 'solo')); render();
  });
  on('state/c', v => { P.core = parseJSON(v, {}) || {}; render(); });
  on('state/inputKey', v => {
    if ((v || null) === P.inputKey) return;
    P.inputKey = v || null; P.mine = null;
    if (P.mineOff) { P.mineOff(); P.mineOff = null; }
    if (P.inputKey) {
      const key = P.inputKey;
      P.mineOff = n.on(room(`inputs/${key}/${n.uid}`), m => {
        P.mine = m || null;
        if (m && typeof m.c === 'number') P.myVotes[key] = m.c;
        render();
      }, () => {});
    }
    render();
  });
  on(`kick/${n.uid}`, v => {
    if (v && v.at === P.joinedAt) { P.kicked = v.why || 'dup'; n.onDisconnectCancel(myPath()).catch(() => {}); render(); }
  });
}

function vote(c) {
  if (!P.inputKey || !P.joined || P.kicked) return;
  const key = P.inputKey, before = P.mine;
  P.mine = { c }; P.myVotes[key] = c;
  render();
  P.net.set(room(`inputs/${key}/${P.net.uid}`), { c, t: P.net.TS })
    .catch(e => { if (P.inputKey === key) { P.mine = before; render(); } toast(/PERMISSION/i.test(e.code || e.message || '') ? '투표가 끝났어요' : '보내지 못했어요. 다시 눌러 주세요'); });
}

// ── 머리띠 ───────────────────────────────────────────────────────
function renderBar() {
  if (P.alone) {
    $('#bar').innerHTML = `
    <span class="b-title">${emblemHTML()}<span>손잡이 동아리</span></span>
    <span class="b-sp"></span>
    ${P.meta && P.meta.phase !== 'title' ? '<button class="b-btn" id="bHome">처음 화면</button>' : ''}
    ${soundSlot('bar')}`;
    mountSoundSlots($('#bar'));
    const h = $('#bHome'); if (h) h.onclick = aloneHome;
    return;
  }
  $('#bar').innerHTML = `
    <span class="b-title">${emblemHTML()}<span>손잡이 동아리</span></span>
    ${P.joined ? `<span class="b-chip strong"><b class="num">${P.num}</b>번</span>` : ''}
    <span class="b-sp"></span>
    ${P.joined ? soundSlot('bar') : ''}
    ${P.joined ? `<span class="b-conn ${P.connected ? 'ok' : 'bad'}"><i></i>${P.connected ? '연결됨' : '끊김 — 다시 연결 중'}</span>` : ''}
    ${P.net && P.net.uid ? `<span class="b-dev" title="같은 번호가 두 기기일 때 선생님이 이 글자로 구분해요">기기 ${devTag(P.net.uid)}</span>` : ''}`;
  mountSoundSlots($('#bar'));
}

function setScreen(key, html) {
  if (P.screen === key) return false;
  P.screen = key; main.innerHTML = html; return true;
}

function renderJoin() {
  P.screen = 'join';
  document.body.classList.add('at-title');
  renderBar();
  const saved = LS.get(LS_JOIN);
  main.innerHTML = `
  <div class="ts ts-join">
    ${kvHTML()}<div class="ts-veil" aria-hidden="true"></div>
    ${petalsHTML(10, 5)}
    <div class="ts-col">
      ${logoHTML('', 'div')}
      <form class="join panel" id="joinF" autocomplete="off">
        <h1 class="join-h">동아리방 들어가기</h1>
        <div class="jrow">
          <label class="jl">방 코드 <span class="dim">큰 화면의 숫자 4자리</span>
            <input id="iCode" class="jin num" inputmode="numeric" maxlength="4" pattern="[0-9]*" value="${esc(P.code || (saved && saved.code) || '')}" aria-label="방 코드"></label>
          <label class="jl">내 번호 <span class="dim">1~${MAX_NUM}</span>
            <input id="iNum" class="jin num" inputmode="numeric" maxlength="2" pattern="[0-9]*" value="${esc(P.num || (saved && saved.num) || '')}" aria-label="내 번호"></label>
        </div>
        <button class="btn big main" type="submit">들어가기 ▶</button>
        <p class="errbox" role="alert" ${P.err ? '' : 'hidden'}>${esc(P.err)}</p>
        <p class="dim small">이름은 넣지 않아요. 번호만!</p>
      </form>
    </div>
    <footer class="ts-foot"><span>성적 미반영 · 이름을 받지 않아요</span><span class="ts-credit">글꼴 Noto Serif KR · OFL</span></footer>
  </div>`;
  $('#joinF').onsubmit = e => { e.preventDefault(); join($('#iCode').value.trim(), Number($('#iNum').value.trim())); };
  (P.code ? $('#iNum') : $('#iCode')).focus();
}

function render() {
  if (P.alone) return renderAlone();
  if (P.joined) document.body.classList.remove('at-title');
  renderBar();
  if (!P.joined) return;
  if (P.kicked) {
    return setScreen('kicked', `
    <div class="pv-center">
      <div class="pv-huge">📵</div>
      <div class="pv-big">${P.kicked === 'host' ? '선생님이 이 기기 연결을 끊었어요. 번호를 확인해 주세요' : `다른 기기에서 ${P.num}번으로 들어왔어요`}</div>
      <p class="pv-sub">내 번호가 맞나요? 맞으면 다시 들어가고, 틀리면 번호를 고쳐요.</p>
      <div class="pv-row"><button class="btn big" id="bRe">${P.num}번으로 다시 들어가기</button><button class="btn ghost" id="bNum">번호 고치기</button></div>
    </div>`) && bindKicked();
  }
  if (P.ended || !P.meta) {
    return setScreen('ended', `<div class="pv-center"><div class="pv-huge">👋</div><div class="pv-big">수업이 끝났어요. 수고했어요!</div>
      <p class="pv-sub">이 창은 닫아도 돼요.</p></div>`);
  }
  if (P.meta.mode === 'class') return renderClass();
  return renderSoloMode();
}
function bindKicked() {
  $('#bRe').onclick = () => join(P.code, P.num);
  $('#bNum').onclick = () => { const c = P.code; leave(); P.code = c; P.num = null; P.kicked = null; renderJoin(); };
  return true;
}

// ── 전체 모드 ────────────────────────────────────────────────────
let voteTick = null;
function renderClass() {
  const c = P.core || {};
  const ph = c.ph || 'lobby';
  clearInterval(voteTick); voteTick = null;
  if (ph === 'lobby') {
    return setScreen('c-lobby', `<div class="pv-center"><div class="pv-eyebrow">연결됨 ✅</div><div class="pv-huge num">${P.num}번</div>
      <div class="pv-big">큰 화면을 보세요</div><p class="pv-sub">오늘은 반 전체가 한 사람의 3년을 골라요. 갈림길이 오면 여기에 단추가 나와요.</p></div>`);
  }
  if (ph === 'think' || ph === 'vote' || ph === 'closing') {
    const v = c.vote || {};
    const open = !!(ph === 'vote' && P.inputKey && P.inputKey === v.key);
    const key = `${ph}|${v.key}|${v.round || 0}|${open}|${P.mine ? P.mine.c : ''}`;
    const my = P.mine ? P.mine.c : null;
    if (setScreen(key, `
      <div class="vote-wrap">
        <div class="pv-eyebrow">${esc(c.chip || '')}</div>
        <h1 class="vote-q">${esc(v.q || '')}</h1>
        <p class="vote-state" id="vState" aria-live="polite"></p>
        <div class="vote-opts n${(v.cands || []).length}">
          ${(v.cands || []).map(n => `<button class="vbtn ${my === n ? 'on' : ''}" data-c="${n}" ${open ? '' : 'disabled'} aria-pressed="${my === n}">
            <span class="vb-n">${CIRCLED[n]}</span><span class="vb-t">${esc((v.labels || [])[n - 1] || '')}</span>${my === n ? '<span class="vb-me">내 선택</span>' : ''}</button>`).join('')}
        </div>
        <p class="pv-sub small">${ph === 'think' ? '💬 생각 시간 — 옆 친구와 이야기해 보세요. 곧 투표가 열려요.' : open ? '다시 누르면 바꿀 수 있어요. 많이 고른 길로 이야기가 가요.' : '마감! 세는 중…'}</p>
      </div>`)) {
      main.querySelectorAll('.vbtn').forEach(b => { b.onclick = () => vote(Number(b.dataset.c)); });
    }
    const tick = () => {
      const el = $('#vState'); if (!el) return;
      if (ph === 'vote' && v.deadline) {
        const left = Math.max(0, Math.ceil((v.deadline - P.net.serverNow()) / 1000));
        el.innerHTML = `${v.round === 2 ? '<b class="warn">동률! 다시 투표</b> · ' : ''}남은 시간 <b class="num">${left}</b>초`;
      } else el.textContent = ph === 'think' ? '' : '마감';
    };
    tick(); if (ph === 'vote') voteTick = setInterval(tick, 250);
    return;
  }
  if (ph === 'dice') {
    return setScreen('c-dice', `<div class="pv-center"><div class="pv-huge dice-spin" aria-hidden="true">🎲</div><div class="pv-big">이야기 주사위!</div><p class="pv-sub">큰 화면을 보세요</p></div>`);
  }
  if (ph === 'tally' || ph === 'fx') {
    const r = c.res || {};
    const mine = (r.keys || []).map(k => P.myVotes[k]).filter(Boolean).pop();
    const how = r.how === 'teacher' ? '선생님이 정했어요' : r.how === 'dice' ? '🎲 주사위로 정했어요' : '우리 반이 골랐어요';
    return setScreen(`c-tally-${r.id}-${r.pick}-${mine || 0}`, `<div class="pv-center">
      <div class="pv-eyebrow">${esc(how)}</div>
      <div class="pv-big">우리 반은 <b>${CIRCLED[r.pick] || ''}</b> ${esc(r.label || '')}</div>
      <p class="pv-sub">${mine ? `내 선택: ${CIRCLED[mine]}${mine === r.pick ? ' — 같은 길! ✨' : ' — 다른 길도 좋은 생각이에요'}` : '이번엔 투표하지 않았어요'}</p></div>`);
  }
  if (ph === 'endcard') {
    const e = c.end || {};
    return setScreen(`c-end-${e.id}`, `<div class="pv-center"><div class="pv-eyebrow">졸업식</div><div class="pv-big">${esc(e.name || '')}</div>
      <div class="pv-huge">${lightsHTML(e.lights || 1)}</div><p class="pv-sub">큰 화면을 보세요</p></div>`);
  }
  if (ph === 'refl') return renderRefl();
  if (ph === 'done') return setScreen('c-done', `<div class="pv-center"><div class="pv-huge">🎓</div><div class="pv-big">수고했어요!</div></div>`);
  // scene · after · title · ending 줄 읽는 중
  return setScreen(`c-watch-${c.chip || ''}`, `<div class="pv-center watch">
    <div class="pv-huge" aria-hidden="true">📺</div><div class="pv-big">큰 화면을 보세요</div>
    <div class="pv-eyebrow">${esc(c.chip || '')}</div>
    <p class="pv-sub">글은 큰 화면에서 각자 읽어요. 갈림길이 오면 여기에 단추가 나와요.</p></div>`);
}

// ── 성찰(두 모드 같음) ───────────────────────────────────────────
function renderRefl(extraTop = '') {
  const sent = P.reflSent;
  if (sent && !P.reflEdit) {
    return setScreen('refl-sent', `<div class="pv-center">${extraTop}<div class="pv-huge">📮</div><div class="pv-big">성찰을 보냈어요</div>
      <p class="pv-sub">이름 없이 큰 화면에 모여요.</p><button class="btn ghost" id="bEdit">고쳐 쓰기</button></div>`) && ($('#bEdit').onclick = () => { P.reflEdit = true; P.screen = ''; render(); });
  }
  const d = { ...(sent || {}), ...P.reflDraft };
  if (setScreen('refl-form', `
    <form class="refl card" id="reflF">
      ${extraTop}
      <h1 class="title">생각 정리 <span class="dim small">· 이름 없이 모여요 · 2개 이상 써 보자</span></h1>
      ${REFL_Q.map((q, i) => `<label class="rq"><span class="rq-tag">${i + 1}. ${esc(q.tag)}</span><span class="rq-q">${esc(q.q)}</span>${q.term ? `<span class="rq-term">${esc(q.term)}</span>` : ''}
        <textarea name="${q.k}" maxlength="${MAX_REFL}" rows="2" aria-label="${esc(q.tag)}">${esc(d[q.k] || '')}</textarea></label>`).join('')}
      <div class="pv-row"><button class="btn big" type="submit">보내기 📮</button><span class="dim small" id="rMsg" role="status"></span></div>
    </form>`)) {
    const f = $('#reflF');
    f.oninput = () => { for (const q of REFL_Q) P.reflDraft[q.k] = f[q.k].value; };
    f.onsubmit = async e => {
      e.preventDefault();
      const out = {};
      for (const q of REFL_Q) { const v = f[q.k].value.trim().slice(0, MAX_REFL); if (v) out[q.k] = v; }
      if (!Object.keys(out).length) { $('#rMsg').textContent = '한 칸 이상 써 주세요'; return; }
      $('#rMsg').textContent = '보내는 중…';
      try {
        await P.net.withTimeout(P.net.set(room(`refl/${P.net.uid}`), { ...out, t: P.net.TS }), 10000, '성찰 보내기');
        P.reflSent = out; P.reflEdit = false; P.reflDraft = {};
        LS.set(reflKey(), out);
        P.screen = ''; render();
      } catch { $('#rMsg').textContent = '보내지 못했어요. 다시 눌러 주세요'; }
    };
  }
}

// ── 개인 모드 ────────────────────────────────────────────────────
// 이 기기 안의 진행 상태: { run:{g,name,ch}, pos:{k,id,i}, first:{done,e,l}, dex:{E1m:1..}, seen:[id], runNo }
const soloKey = () => `vn.solo.${P.code}.${P.roomAt}`;   // 방 코드는 다시 쓰일 수 있어 만든 시각까지 붙인다
const reflKey = () => `vn.refl.${P.code}.${P.roomAt}`;
/** 저장된 엔딩 기록(망가진 값은 빈 기록으로) */
function aloneDex() {
  const d = LS.get(LS_DEX, {});
  return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
}
const newSolo = () => ({ run: { g: null, name: null, ch: {} }, pos: { k: 'gender' }, first: null, dex: {}, seen: [], runNo: 1 });
function loadSolo() {
  if (P.alone) return { ...newSolo(), dex: aloneDex() };
  const s = LS.get(soloKey());
  if (s && s.run && s.pos) return s;
  return newSolo();
}
function saveSolo() {
  if (P.alone) { if (Object.keys(P.solo.dex).length) LS.set(LS_DEX, { ...aloneDex(), ...P.solo.dex }); return; }
  LS.set(soloKey(), P.solo);
}

function sendProgress() {
  const s = P.solo;
  if (!s || !P.net || !P.joined) return;
  // 반 통계에는 첫 엔딩만: 첫 엔딩이 있으면 그 기록(따로 저장한 것)을, 없으면 1회차 진행을 보낸다
  let ch, e = 0, l = 0;
  if (s.first) { if (s.first.sent) return; ch = s.first.ch || s.run.ch; e = s.first.e; l = s.first.l; }
  else { if (s.runNo > 1) return; ch = s.run.ch; }
  const out = { st: 0, e, l, t: P.net.TS };
  for (const [i, id] of S.CHOICE_IDS.entries()) if (ch[id]) { out['c' + (i + 1)] = ch[id]; out.st = i + 1; }
  P.net.set(room(`solo/${P.net.uid}`), out).then(() => {
    if (e && P.solo === s && s.first && s.first.e === e) { s.first.sent = true; saveSolo(); }
  }).catch(() => {});
}

function renderSoloMode() {
  const ph = P.meta.phase;
  const s = P.solo;
  const k = s && s.pos && s.pos.k;
  music(ph === 'lobby' || k === 'gender' || k === 'name' ? 'open' : (ph !== 'play' || k === 'ending' || k === 'card' || k === 'done') ? 'end' : 'main');
  if (ph === 'lobby') {
    return setScreen('s-lobby', `<div class="pv-center"><div class="pv-eyebrow">연결됨 ✅ · 개인 모드</div><div class="pv-huge num">${P.num}번</div>
      <div class="pv-big">선생님이 시작하면 열려요</div><p class="pv-sub">혼자 끝까지 가는 이야기예요. 소리는 처음엔 꺼져 있어요 — 위쪽 🎵 · 🔊 로 켤 수 있어요(이어폰 추천).</p></div>`);
  }
  if (ph === 'stats' || ph === 'done') {
    if (!s.first) return setScreen('s-wait', `<div class="pv-center"><div class="pv-huge">📺</div><div class="pv-big">선생님 화면을 보세요</div><p class="pv-sub">반 엔딩 통계를 함께 봐요.</p></div>`);
    return renderSoloDone(true);
  }
  // play
  if (s.pos.k === 'done') return renderSoloDone(false);
  return soloStep();
}

function chipOf(n) { return n ? `${n.when}${n.title ? ' · ' + n.title : ''}` : ''; }

function soloStep() {
  const s = P.solo, pos = s.pos, run = s.run;
  if (pos.k === 'gender') {
    return setScreen('s-gender', `<div class="solo-pick">
      <div class="pv-eyebrow">이야기를 시작해요</div><h1 class="vote-q">주인공을 골라요</h1>
      <div class="vote-opts n3">
        <button class="vbtn" data-g="m">${faceHTML('hangyeol', 0, 'big')}<span class="vb-t">남학생</span></button>
        <button class="vbtn" data-g="f">${faceHTML('daon', 0, 'big')}<span class="vb-t">여학생</span></button>
        <button class="vbtn" data-g="r"><span class="vb-n">🎲</span><span class="vb-t">랜덤</span></button>
      </div><p class="pv-sub small">${P.alone ? '고른 주인공과 이름은 저장하지 않아요.' : '고른 성별과 이름은 이 기기에만 있어요. 선생님 화면에는 나오지 않아요.'}</p></div>`)
      && main.querySelectorAll('[data-g]').forEach(b => { b.onclick = () => {
        let g = b.dataset.g;
        if (g === 'r') { g = randInt(2) ? 'f' : 'm'; run.g = g; run.name = S.NAMES[g][randInt(4)]; startStory(); return; }
        run.g = g; pos.k = 'name'; saveSolo(); P.screen = ''; render();
      }; });
  }
  if (pos.k === 'name') {
    return setScreen('s-name', `<div class="solo-pick">
      <div class="pv-eyebrow">${run.g === 'f' ? '여학생' : '남학생'} 주인공</div><h1 class="vote-q">이름을 골라요</h1>
      <div class="vote-opts n4">${S.NAMES[run.g].map((nm, i) => `<button class="vbtn" data-n="${esc(nm)}"><span class="vb-t">${esc(nm)}</span>${i === 0 ? '<span class="vb-me">기본</span>' : ''}</button>`).join('')}</div>
      <button class="btn ghost" id="bBack">← 성별 다시 고르기</button></div>`)
      && (main.querySelectorAll('[data-n]').forEach(b => { b.onclick = () => { run.name = b.dataset.n; startStory(); }; }),
          $('#bBack').onclick = () => { pos.k = 'gender'; saveSolo(); P.screen = ''; render(); });
  }
  if (pos.k === 'scene' || pos.k === 'after' || pos.k === 'ending') return renderSoloScene();
  if (pos.k === 'choice') return renderSoloChoice();
  if (pos.k === 'card') return renderSoloCard();
}

function startStory() {
  const s = P.solo;
  s.pos = { k: 'scene', id: 'S1', i: 1 };
  saveSolo(); P.screen = ''; render();
}

function curLines() {
  const s = P.solo, pos = s.pos, n = S.NODES[pos.id];
  if (pos.k === 'after') return S.linesOf(n.opts[s.run.ch[pos.id] - 1].after || [], s.run);
  return S.linesOf(n.lines, s.run);
}

function renderSoloScene() {
  const s = P.solo, pos = s.pos, n = S.NODES[pos.id], run = s.run;
  const lines = curLines();
  const shown = Math.min(pos.i || 1, lines.length);
  const last = lines[shown - 1];
  const st = S.statsOf(run);
  const isEnd = pos.k === 'ending';
  const opt = pos.k === 'after' ? n.opts[run.ch[pos.id] - 1] : null;
  const bg = (opt && opt.bg) || n.bg;
  const cg = isEnd ? cgKey(pos.id, run.g) : null;
  const seen = s.seen.includes(pos.k + ':' + pos.id);
  const fx = pos.k === 'after' && pos.fx ? pos.fx : null;
  const notes = fx ? Object.keys(fx).filter(k => ['A', 'B', 'C', 'T'].includes(k) && fx[k] > 0) : [];
  const key = `s-${pos.k}-${pos.id}-${shown}-${fx ? 1 : 0}`;
  if (P.screen === key) return;
  const cont = soloBox();
  P.screen = key;
  // 🗣 목소리(개인 모드 · 학생이 ⚙ 에서 켰을 때만 — 기본 끔): 지금 줄을 읽고 다음 줄을 미리 받는다
  speak(last);
  if (lines[shown]) preloadVoice(lines[shown]);
  const cast = isEnd && cg ? [] : (n.cast || []);
  const rebuilt = renderStage(cont, {
    bg, tint: n.tint, cg, cast, speaker: last && last.role, run, when: n.when, romance: !!n.rel,
    chip: isEnd ? `졸업식 · ${n.name}` : chipOf(n), hud: st, delta: fx, notes,
    overlay: fx ? fxHTML(fx, cast, run) : '',
    boxHTML: boxHTML(lines, shown, { ...(isEnd && cg ? { keep: 3, cls: 'cg-box', head: cgHead(n) } : {}), footer: `<div class="vn-next">
      ${seen && s.runNo > 1 ? '<button class="btn ghost small" id="bSkip">⏩ 읽은 장면 넘기기</button>' : ''}
      <button class="btn" id="bNext">${shown < lines.length ? '다음 ▶' : (pos.k === 'ending' ? '졸업식 카드 ▶' : '계속 ▶')}</button></div>` }),
  });
  $('#bNext').onclick = e => soloAdvance('button', e);
  $('#bNext').focus({ preventScroll: true });
  const sk = $('#bSkip'); if (sk) sk.onclick = () => { twFinish(); pos.i = lines.length; soloNext(); };
  // 소리 · 효과
  if (!isEnd) music('main', moodOf(pos.id, n, pos.k, opt));
  const lf = lineFx(last, !!(n.rel || n.slot));
  let card = null;
  if (isEnd && shown === 1) endingReveal(cont);
  else if (pos.k === 'scene' && shown === 1) {   // 장면 첫 줄: 학년 · 철이 바뀌면 장 제목 카드(대사 상자 자리)
    const ch = chapterOf(n.when), key = ch.key;
    if (key && key !== P.lastChapter) { card = chapterCard(cont, n.when, n.title, !!ch.grade && ch.grade !== P.lastGrade); P.lastChapter = key; P.lastGrade = ch.grade; }
    else sfx('whoosh');
  } else sfx(rebuilt ? 'whoosh' : 'tick');
  // 장 제목 카드가 대사 자리를 잠깐 차지하는 동안 첫 줄은 숨겨 두고(CSS), 카드가 사라지면 그때 글자를 찍는다
  clearInterval(P.cardWait); P.cardWait = null;
  if (card) P.cardWait = setInterval(() => { if (card.isConnected) return; clearInterval(P.cardWait); P.cardWait = null; typewrite(cont, { key: lf.key }); }, 100);
  else typewrite(cont, { key: lf.key });
  emphasize(cont, lf);
  if (lf.shake) shake(cont);
  if (lf.tech) techBurst(cont, lf.water);
  if (lf.emote && last && last.role) emote(cont, last.role, lf.emote);
  if (fx && shown === 1) { floatChips(cont, fx, S.SHOWN); if (notes.length) setTimeout(() => sfx('note'), 380); }
  hintOnce('vn.hint.solo', '화면을 눌러도 다음으로 넘어가요 (스페이스 · Enter)');
  preload(artFor(S.NODES[S.nextOf(pos.id, run) || ''] || null, run));
}

/** 개인 모드 무대 그릇(같은 장면이면 다시 만들지 않는다) */
function soloBox() {
  let c = main.querySelector(':scope > .solo');
  if (!c) { main.innerHTML = '<div class="solo"></div>'; c = main.firstElementChild; }
  return c;
}

function fxHTML(fx, cast = [], run = {}) {
  const parts = S.SHOWN.filter(x => fx[x.k] > 0).map(x => `<span class="fx-i">${statIcon(x.k)} ${x.label} <b>+${fx[x.k]}</b></span>`);
  if (fx.book) parts.push('<span class="fx-i">📘 설명서</span>');
  const off = ['A', 'B', 'C', 'T'].filter(k => fx[k] > 0 && !cast.includes(k));
  if (off.length) parts.push(`<span class="fx-i soft">${off.map(k => faceHTML(S.roleChar(k, run), 1)).join('')} ♪</span>`);
  if (!parts.length) return '';
  return `<div class="vn-fx" role="status">${parts.join('')}</div>`;
}

/** 다음으로: 글자를 찍는 중이면 먼저 다 보여 주고, 다음 누름에 넘긴다. 진짜 두 번 누르기(빠른 연타)는 한 번만 */
let lastAdv = 0;
function soloAdvance(src, e) {
  if (e && (e.repeat || e.detail > 1)) return;
  const t = performance.now();
  if (e && e.isTrusted && t - lastAdv < 250) return;   // 손가락 · 키 연타(250ms 안)는 한 번만
  lastAdv = t;
  const card = cardSkip(main);                   // 장 제목 카드가 떠 있으면 닫고 같은 누름에 첫 줄을 다 보여 준다(찍기 없이)
  if (P.cardWait) { clearInterval(P.cardWait); P.cardWait = null; return; }
  if (twBusy()) { twFinish(); return; }
  if (card) return;
  soloNext();
}
main.addEventListener('click', e => {
  if (!P.solo || !P.meta || P.meta.mode !== 'solo' || P.meta.phase !== 'play') return;
  const k = P.solo.pos && P.solo.pos.k;
  if (!['scene', 'after', 'ending'].includes(k)) return;      // 갈림길 · 카드 · 성찰에서는 넘기지 않는다
  if (!e.target.closest || !e.target.closest('.solo')) return;
  if (!isAdvanceClick(e)) return;
  soloAdvance('click', e);
});

function soloNext() {
  const s = P.solo, pos = s.pos, run = s.run;
  if (!['scene', 'after', 'ending'].includes(pos.k)) return;   // 갈림길 · 카드에서는 넘기지 않는다
  const lines = curLines();
  if ((pos.i || 1) < lines.length) { pos.i = (pos.i || 1) + 1; delete pos.fx; saveSolo(); return render(); }
  // 장면 끝
  stopVoice();
  if (!s.seen.includes(pos.k + ':' + pos.id)) s.seen.push(pos.k + ':' + pos.id);
  if (pos.k === 'ending') { s.pos = { k: 'card', id: pos.id }; saveSolo(); P.screen = ''; return render(); }
  let id = pos.k === 'scene' ? S.NODES[pos.id].next : S.NODES[pos.id].next;
  // 갈래 마디(S7' · 엔딩 판정)는 바로 넘긴다
  while (id && S.NODES[id].type === 'branch') id = S.nextOf(id, run);
  const n = S.NODES[id];
  if (!n) return;
  if (n.type === 'choice') s.pos = { k: 'choice', id };
  else if (n.type === 'ending') s.pos = { k: 'ending', id, i: 1 };
  else s.pos = { k: 'scene', id, i: 1 };
  saveSolo(); P.screen = ''; render();
}

function renderSoloChoice() {
  const s = P.solo, pos = s.pos, n = S.NODES[pos.id], run = s.run;
  const labels = S.optionLabels(n, run);
  const key = `s-choice-${pos.id}`;
  if (P.screen === key) return;
  P.screen = key;
  stopVoice();
  renderStage(soloBox(), { bg: n.bg, tint: n.tint, cast: n.cast || [], run, chip: chipOf(n), hud: S.statsOf(run),
    boxHTML: `<div class="vn-box choice">
      <h2 class="vote-q">${esc(n.q)}</h2>
      <div class="vote-opts n${labels.length}">${labels.map((l, i) => `<button class="vbtn" data-c="${i + 1}"><span class="vb-n">${CIRCLED[i + 1]}</span><span class="vb-t">${esc(l)}</span></button>`).join('')}</div>
    </div>` });
  music('main', moodOf(pos.id, n));
  sfx('slide');
  main.querySelectorAll('[data-c]').forEach(b => { b.onclick = () => { sfx('select'); pick(Number(b.dataset.c)); }; b.onpointerenter = () => sfx('hover'); });
  main.querySelector('[data-c]').focus({ preventScroll: true });
}

function pick(c) {
  const s = P.solo, pos = s.pos, run = s.run, id = pos.id, n = S.NODES[id];
  if (pos.k !== 'choice') return;   // 두 번 누름 막기
  run.ch[id] = c;
  sendProgress();
  if (id === 'V11') {
    let e = S.nextOf('END', run);
    s.pos = { k: 'ending', id: e, i: 1 };
  } else {
    const opt = n.opts[c - 1];
    if (opt.after && opt.after.length) s.pos = { k: 'after', id, i: 1, fx: opt.fx };
    else { s.pos = { k: 'scene', id: n.next, i: 1 }; }
  }
  saveSolo(); P.screen = ''; render();
}

function renderSoloCard() {
  const s = P.solo, run = s.run, id = s.pos.id, n = S.NODES[id];
  const st = S.statsOf(run), l = S.lightsOf(st);
  const re = S.rethinkOf(run);
  const dexKey = n.slot ? id + run.g : id;
  if (!s.dex[dexKey]) s.dex[dexKey] = 1;
  if (!s.first) { s.first = { e: n.no, l, ch: { ...run.ch } }; sendProgress(); }
  saveSolo();
  if (!setScreen(`s-card-${id}`, `<div class="endcard">
    <div class="ec-head"><div class="pv-eyebrow">졸업식 · 엔딩 ${n.no} / 10</div>
      <h1 class="ec-title">${esc(n.name)}${n.sub ? ` <span class="dim">· ${esc(n.sub)}</span>` : ''}</h1>
      <p class="ec-msg">${esc(n.msg)}</p></div>
    <div class="ec-grid">
      <div class="ec-lights card"><div class="lbl">루미타의 불빛 <span class="num">${l} / 3</span></div>${lightsHTML(l)}<p>${esc(S.LIGHTS[l])}</p>
        ${re.length ? `<div class="lbl">다음엔 이렇게 해 볼까?</div><ul class="rethink">${re.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${id === 'E10' ? `<div class="hint">💡 ${esc(S.E10_HINT[run.ch.V11] || '')}</div>` : ''}</div>
      ${cardHTML(n.card)}
    </div>
    <div class="pv-row"><button class="btn big" id="bDone">${s.runNo === 1 && !P.alone ? '생각 정리하러 가기 ▶' : '엔딩 도감 ▶'}</button></div>
  </div>`)) return;
  $('#bDone').onclick = () => { s.pos = { k: 'done' }; saveSolo(); P.screen = ''; render(); };
  sfx('reveal'); confetti(main.querySelector('.ec-head'), 30, { paper: true });
}

function dexHTML(dex) {
  const found = S.ENDING_IDS.filter(e => dex[e] || dex[e + 'm'] || dex[e + 'f']).length;
  return `<div class="dex card"><div class="lbl">엔딩 도감 <b class="num">${found}</b> / 10</div><div class="dex-grid">
    ${S.ENDING_IDS.map(e => { const n = S.NODES[e]; const got = dex[e] || dex[e + 'm'] || dex[e + 'f'];
      const two = n.slot && dex[e + 'm'] && dex[e + 'f'];
      return `<div class="dex-c ${got ? 'got' : ''}" title="${got ? esc(n.name) : '아직 못 찾음'}"><b>${n.no}</b><span>${got ? esc(n.name) : '?'}</span>${two ? '<i>그림 2</i>' : ''}</div>`; }).join('')}
  </div></div>`;
}

function statsHTML(stats) {
  if (!stats || !stats.n) return `<div class="card dim">반 통계는 친구들이 졸업하면 모여요.</div>`;
  const max = Math.max(1, ...S.ENDING_IDS.map(e => stats.ends[e] || 0));
  return `<div class="card cstats"><div class="lbl">우리 반 첫 엔딩 <span class="dim">(${stats.n}명 · 이름 없음)</span></div>
    ${S.ENDING_IDS.map(e => { const v = stats.ends[e] || 0; return `<div class="cs-row"><span class="cs-n">${S.NODES[e].no}. ${esc(S.NODES[e].name)}</span><span class="cs-bar"><i style="width:${v / max * 100}%"></i></span><b class="num">${v}</b></div>`; }).join('')}
    <div class="cs-l">불빛 ${[3, 2, 1].map(k => `${'💡'.repeat(k)} <b class="num">${(stats.lights || {})[k] || 0}</b>명`).join(' · ')}</div></div>`;
}

function renderSoloDone(closed) {
  if (P.alone) return renderAloneDex(true);
  const s = P.solo;
  const stats = P.core && P.core.stats;
  // 첫 판이면 먼저 성찰
  if (s.runNo === 1 && !P.reflSent) return renderRefl('<p class="pv-eyebrow">졸업 축하해요 🎓 반 통계를 보기 전에 생각을 정리해요</p>');
  const key = `s-done-${closed}-${JSON.stringify(stats || {})}-${Object.keys(s.dex).length}`;
  if (P.screen === key) return;
  P.screen = key;
  main.innerHTML = `<div class="done-wrap">
    <div class="done-col">${dexHTML(s.dex)}
      ${closed ? '<p class="pv-sub">선생님 화면을 보세요 — 반 통계를 함께 봐요.</p>' : `<div class="pv-row">
        <button class="btn big" id="bAgain">다른 졸업식 찾기 ▶</button>
        <span class="dim small">2회차부터는 반 통계에 들어가지 않아요</span></div>`}
      ${P.reflSent ? '<button class="btn ghost small" id="bRefl">내 성찰 고쳐 쓰기</button>' : ''}</div>
    <div class="done-col">${statsHTML(stats)}</div></div>`;
  const a = $('#bAgain');
  if (a) a.onclick = () => {
    s.runNo++; s.run = { g: null, name: null, ch: {} }; s.pos = { k: 'gender' };
    saveSolo(); P.screen = ''; render();
  };
  const r = $('#bRefl');
  if (r) r.onclick = () => { P.reflEdit = true; P.screen = ''; renderRefl(); };
}

// ── 혼자 하기 ────────────────────────────────────────────────────
function renderAlone() {
  const ph = P.meta.phase;
  document.body.classList.toggle('at-title', ph === 'title');
  renderBar();
  if (ph === 'title') return renderAloneTitle();
  if (ph === 'dex') return renderAloneDex(false);
  return renderSoloMode();
}

function renderAloneTitle() {
  if (P.screen === 'a-title') return;
  P.screen = 'a-title';
  const d = P.solo.dex;
  const found = S.ENDING_IDS.filter(e => d[e] || d[e + 'm'] || d[e + 'f']).length;
  main.innerHTML = `
  <div class="ts ts-host">
    ${kvHTML()}<div class="ts-veil" aria-hidden="true"></div>
    ${petalsHTML(18, 11)}
    <div class="ts-col">
      ${logoHTML('', 'div')}
      <nav class="ts-menu" aria-label="시작 메뉴">
        <button class="menu-i main" id="bStartAlone">이야기 시작 <small>혼자서 약 25분</small></button>
        <button class="menu-i" id="bDexAlone">엔딩 도감 <small>${found} / 10</small></button>
      </nav>
    </div>
    <footer class="ts-foot"><span>엔딩 기록만 이 브라우저에 남아요 · 중간 저장은 없어요</span>${soundSlot('ts')}<span class="ts-credit">글꼴 Noto Serif KR · OFL</span></footer>
  </div>`;
  mountSoundSlots(main);
  music('open');
  $('#bStartAlone').onclick = () => {
    sfx('select');
    P.solo = loadSolo(); P.lastChapter = null; P.lastGrade = null;
    P.meta.phase = 'play'; P.screen = ''; render();
  };
  $('#bDexAlone').onclick = () => { sfx('select'); P.meta.phase = 'dex'; P.screen = ''; render(); };
  $('#bStartAlone').focus({ preventScroll: true });
}

/** 엔딩 도감. again = 방금 졸업했을 때(「다른 졸업식 찾기」가 있다) */
function renderAloneDex(again) {
  const s = P.solo;
  const key = `a-dex-${again}-${Object.keys(s.dex).length}`;
  if (P.screen === key) return;
  P.screen = key;
  main.innerHTML = `<div class="done-wrap alone"><div class="done-col">${dexHTML(s.dex)}
    <div class="pv-row">
      ${again ? '<button class="btn big" id="bAgain">다른 졸업식 찾기 ▶</button>' : ''}
      <button class="btn ${again ? 'ghost' : 'big'}" id="bTitle">처음 화면</button>
    </div>
    <p class="dim small">엔딩 기록은 이 브라우저에만 남아요.</p></div></div>`;
  const a = $('#bAgain');
  if (a) a.onclick = () => {
    s.runNo++; s.run = { g: null, name: null, ch: {} }; s.pos = { k: 'gender' };
    P.lastChapter = null; P.lastGrade = null;
    P.screen = ''; render();
  };
  $('#bTitle').onclick = aloneHome;
}

function aloneHome() {
  const k = P.solo.pos.k;
  if (P.meta.phase === 'play' && k !== 'gender' && k !== 'done' && !confirm('처음 화면으로 갈까요?\n진행 중인 이야기는 저장되지 않아요.')) return;
  stopVoice();
  P.solo = loadSolo(); P.meta.phase = 'title'; P.screen = ''; render();
}

// ── 알림 ─────────────────────────────────────────────────────────
function toast(msg) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
  box.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

document.addEventListener('keydown', e => {
  if (!P.solo || !P.meta || P.meta.mode !== 'solo') return;
  const k = P.solo.pos.k;
  const ae = document.activeElement;
  if ((k === 'scene' || k === 'after' || k === 'ending') && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') && !/TEXTAREA|INPUT|SELECT/.test(ae.tagName)
      && (ae.id === 'bNext' || !ae.closest('button, a, [role="button"]'))) {
    e.preventDefault(); soloAdvance('key', e);
  }
});

// ── 시작 ─────────────────────────────────────────────────────────
if (P.alone) {
  P.meta = { mode: 'solo', phase: 'title' };
  P.solo = loadSolo();
  render();
} else {
  renderBar();
  const saved = LS.get(LS_JOIN);
  const q = new URLSearchParams(location.search);
  const fresh = saved && Date.now() - saved.at < 6 * 3600 * 1000;
  if (q.get('code') && /^\d{4}$/.test(q.get('code')) && !(fresh && saved.code === q.get('code'))) { P.code = q.get('code'); renderJoin(); }
  else if (fresh) join(saved.code, saved.num, true);
  else renderJoin();
  connect().catch(() => {});
}
