// ▶ PV(소개 영상) — 타이틀 화면(진행판 · 학생 들어가기 · 혼자 하기)의 「▶ PV 보기」가 여는 영상 창.
//   파일: site/video/pv.mp4 + pv.jpg(첫 그림). 이름만 같으면 파일을 바꿔 넣는 것으로 끝(코드 그대로).
//   - 저절로 틀지 않는다(preload="none" · 첫 그림만 보이고 ▶ 를 눌러야 재생)
//   - 창이 열려 있는 동안 게임 음악 · 효과음은 조용히(hush), 목소리는 멈춘다 → 닫으면 되돌린다
//   - 닫기: ✕ · Esc · 영상 바깥(어두운 곳) 누르기
//   - 영상을 못 불러오면 창 안에 알림만 띄운다(멈춰 버리는 일 없음)
import { hush } from './sound.js';
import { stopVoice } from './voice.js';
import { menuIcon, esc } from './shared.js';

export const PV_SRC = 'video/pv.mp4';
export const PV_POSTER = 'video/pv.jpg';
/**
 * 유튜브에 올린 PV 주소 — 비어 있으면 유튜브 단추 · 알림 고리가 모두 숨는다.
 * 넣으면: PV 창 머리 줄 「YouTube에서 보기 ↗」 + 혼자 하기 타이틀 「유튜브에서 PV 보기 ↗」(새 탭).
 * https://youtu.be/… · https://www.youtube.com/… 만 받는다(다른 주소면 숨김). 바꾼 뒤 npm run build → 배포
 */
export const PV_YOUTUBE_URL = 'https://youtu.be/3cygUKyquNA';
/** 쓸 수 있는 유튜브 주소(아니면 '') */
export function pvYoutubeURL(u = PV_YOUTUBE_URL) {
  const s = String(u || '').trim();
  return /^https:\/\/(?:(?:www\.|m\.)?youtube\.com|youtu\.be)\/[^\s"'<>]+$/.test(s) ? s : '';
}
/** 혼자 하기 타이틀의 작은 유튜브 고리(주소가 없으면 빈 글) */
export function pvYoutubeHTML(cls = 'ts-yt') {
  const u = pvYoutubeURL();
  return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${menuIcon('tv')}유튜브에서 PV 보기 <span aria-hidden="true">↗</span><span class="sr">(새 탭)</span></a>` : '';
}

const st = { el: null, back: null, inert: [] };
export const pvOpen = () => !!st.el;

/** 타이틀 메뉴 항목(진행판 · 혼자 하기의 .ts-menu 안) */
export const pvMenuHTML = () => `<button class="menu-i" id="bPV" type="button" aria-haspopup="dialog">${menuIcon('film')}PV 보기 <small>소개 영상 · 약 50초</small></button>`;

/**
 * 영상 창 열기. muted = 처음부터 소리 끔(학생 크롬북 — 교실에서 한꺼번에 울리지 않게, 영상의 소리 단추로 켤 수 있다)
 */
export function openPV({ muted = false, from = null } = {}) {
  if (st.el) return st.el;
  st.back = from || document.activeElement;
  stopVoice();
  hush(true);
  const el = document.createElement('div');
  el.className = 'pvx';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'pvxT');
  // 앞뒤 지킴이(tabindex 0): Tab 이 창 끝에 닿으면 반대쪽 끝으로 — 영상 안 단추(소리 · 앞뒤 감기 · 전체 화면)는 브라우저 그대로 돈다
  el.innerHTML = `
    <span class="pvx-guard" tabindex="0" data-to="last"></span>
    <div class="pvx-box">
      <div class="pvx-head">
        <b id="pvxT">손잡이 동아리 · PV</b>
        <span class="pvx-hint">Esc · 바깥을 누르면 닫혀요${muted ? ' · 소리는 꺼져 있어요(영상 아래 🔈 로 켜기 · 이어폰 추천)' : ''}</span>
        ${pvYoutubeURL() ? `<a class="pvx-yt" href="${esc(pvYoutubeURL())}" target="_blank" rel="noopener noreferrer">${menuIcon('tv')}YouTube에서 보기 <span aria-hidden="true">↗</span><span class="sr">(새 탭)</span></a>` : ''}
        <button class="pvx-x" type="button" aria-label="PV 닫기">✕</button>
      </div>
      <div class="pvx-frame">
        <video class="pvx-v" src="${PV_SRC}" poster="${PV_POSTER}" preload="none" controls playsinline controlslist="nodownload" ${muted ? 'muted' : ''}></video>
        <button class="pvx-play" type="button" aria-label="PV 재생">▶</button>
        <p class="pvx-err" role="alert" hidden>영상을 불러오지 못했어요.<br>인터넷을 확인하고 다시 열어 주세요.</p>
      </div>
    </div>
    <span class="pvx-guard" tabindex="0" data-to="first"></span>`;
  // 뒤쪽 화면(머리띠 · 본문 · 알림)은 창이 열린 동안 누를 수도, 포커스를 받을 수도 없게(inert)
  st.inert = [...document.body.children].filter(x => !x.inert && x.tagName !== 'SCRIPT');
  for (const x of st.inert) x.inert = true;
  document.body.appendChild(el);
  st.el = el;
  const v = el.querySelector('video'), big = el.querySelector('.pvx-play'), err = el.querySelector('.pvx-err');
  v.muted = !!muted;   // muted 속성만으로는 일부 브라우저가 소리를 낸다
  const x = el.querySelector('.pvx-x');
  // 숨기는 단추에 포커스가 있었으면 먼저 옮긴다(숨긴 단추에 포커스가 남아 보이지 않는 일 없게)
  const hideBig = to => { if (document.activeElement === big) to.focus({ preventScroll: true }); big.hidden = true; };
  const fail = () => {   // 영상 칸(▶ · 영상)에 있던 포커스는 ✕ 로 — 재생이 시작되며 영상으로 옮겨 간 경우도
    if (document.activeElement === big || document.activeElement === v) x.focus({ preventScroll: true });
    err.hidden = false; big.hidden = true; el.classList.add('failed');
  };
  const start = () => {
    stopVoice();
    const p = v.play();
    if (p && p.catch) p.catch(e => {
      if (e && e.name === 'NotAllowedError') { big.hidden = false; big.focus({ preventScroll: true }); }
      else if (!(e && e.name === 'AbortError')) fail();
    });
  };
  big.onclick = e => { e.stopPropagation(); start(); };
  v.addEventListener('play', () => { hideBig(v); err.hidden = true; el.classList.remove('failed'); stopVoice(); });
  v.addEventListener('error', fail);
  v.addEventListener('ended', () => { big.hidden = false; });
  x.onclick = () => closePV();
  const yt = el.querySelector('.pvx-yt');
  if (yt) yt.addEventListener('click', () => { try { v.pause(); } catch {} });   // 유튜브로 가면 이 창 영상은 멈춘다(소리 겹침 없게)
  el.querySelectorAll('.pvx-guard').forEach(g => g.addEventListener('focus', () => focusEdge(g.dataset.to)));
  // 바깥(어두운 바탕) 누르기 = 닫기. 영상 · 머리 줄 안을 누른 것은 닫지 않는다
  el.addEventListener('click', e => { if (e.target === el) closePV(); });
  // 창 안의 키(스페이스 · Enter · 화살표)는 뒤쪽 화면의 「다음 줄」 키로 새지 않게 여기서 멈춘다(단추 · 영상 기본 동작은 그대로)
  el.addEventListener('keydown', e => e.stopPropagation());
  big.focus({ preventScroll: true });
  return el;
}

/** 창 안에서 Tab 순서의 첫(✕) · 끝(영상 또는 ▶) 칸으로 */
function focusEdge(to) {
  if (!st.el) return;
  const f = [...st.el.querySelectorAll('.pvx-yt, .pvx-x, .pvx-v, .pvx-play')].filter(e => !e.hidden && e.offsetParent !== null);
  const t = to === 'last' ? f[f.length - 1] : f[0];
  if (t) t.focus({ preventScroll: true });
}

export function closePV() {
  const el = st.el;
  if (!el) return;
  st.el = null;
  const v = el.querySelector('video');
  try { v.pause(); v.removeAttribute('src'); v.load(); } catch {}   // 받던 것도 끊는다
  el.remove();
  for (const x of st.inert) x.inert = false;
  st.inert = [];
  hush(false);
  const back = st.back && st.back.isConnected ? st.back : document.getElementById('bPV');
  st.back = null;
  if (back && back.focus) back.focus({ preventScroll: true });
}

if (typeof document !== 'undefined') {
  // Esc 로 닫기(다른 화면 키보다 먼저). 영상 전체 화면 중의 Esc 는 전체 화면만 푼다(브라우저 몫)
  document.addEventListener('keydown', e => {
    if (!st.el) return;
    if (e.key === 'Escape') { if (document.fullscreenElement) return; e.preventDefault(); e.stopImmediatePropagation(); closePV(); return; }
    // 창이 열려 있으면 화면 뒤쪽의 키(→ · 스페이스 · Enter 넘기기 등)는 받지 않게 막는다 — 창 안 단추 · 영상은 그대로
    if (!st.el.contains(document.activeElement)) { e.stopImmediatePropagation(); }
  }, true);
  // 뒤쪽 화면이 다시 그려지며 포커스를 가져가도 창 안으로 되돌린다
  document.addEventListener('focusin', e => {
    if (st.el && !st.el.contains(e.target)) { const b = st.el.querySelector('.pvx-x'); if (b) b.focus({ preventScroll: true }); }
  });
}
