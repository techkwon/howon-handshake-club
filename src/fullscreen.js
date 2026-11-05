// 전체 화면 단추(테크권 인트로 스킬의 그림 · 이름 그대로) — 소리 · ⚙ 설정 줄(.snd)에 들어간다(타이틀 아래 띠 · 머리띠 모두)
//   스킬의 createFullscreenButton 은 단추마다 fullscreenchange 듣기를 하나씩 더한다 → 우리는 머리띠를 자주 다시 그리므로
//   글(HTML)로 그리고, 누르기 · 바뀜 알림은 문서에 한 번만 건다(같은 모양 · 같은 이름 「전체 화면」/「창 모드로 돌아가기」)
import { fullscreenSupported, isFullscreen, enterFullscreen, exitFullscreen, onFullscreenChange, fullscreenGlyph } from './techkwon-intro.js';

export { fullscreenSupported, isFullscreen, enterFullscreen, exitFullscreen };

const fsName = on => on ? '창 모드로 돌아가기' : '전체 화면';
let manual = false;
/** 전체 화면 단추를 한 번이라도 눌렀으면 참 — 그 뒤로는 「첫 누름 전체 화면」(intro.js)을 쓰지 않는다(창 모드로 나온 뒤 다시 들어가 버리지 않게) */
export const fsManualUsed = () => manual;
export const markFsManual = () => { manual = true; };   // ⚙ 「전체 화면으로 시작」을 바꾼 것도 손으로 고른 것으로 친다

/** 전체 화면 단추(못 여는 곳 — 아이폰 사파리 · 설치한 앱 — 이면 빈 글) */
export function fsBtnHTML(cls = '') {
  if (typeof document === 'undefined' || !fullscreenSupported()) return '';
  const on = isFullscreen(), n = fsName(on);
  return `<button type="button" class="tk-fs-btn ${cls}" data-fs="1" aria-pressed="${on}" aria-label="${n}" title="${n}" data-tip="${n}">${fullscreenGlyph(on).outerHTML}</button>`;
}

function paintAll() {
  const on = isFullscreen(), n = fsName(on);
  document.querySelectorAll('[data-fs]').forEach(b => {
    b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', n); b.title = n; b.dataset.tip = n;
    b.replaceChildren(fullscreenGlyph(on));
  });
}

if (typeof document !== 'undefined') {
  onFullscreenChange(paintAll);
  document.addEventListener('click', e => {
    const b = e.target instanceof Element && e.target.closest('[data-fs]');
    if (!b) return;
    manual = true;
    if (isFullscreen()) exitFullscreen(); else enterFullscreen();
  });
}
