// 테크권 로고 인트로(교사 확정 모양 — 스킬 techkwon-intro 그대로) · 세 시작 화면(학생 들어가기 · 진행판 · 혼자 하기)
//   - 타이틀을 먼저 그려 두고 그 위에 인트로 → 끝에 「로고를 터치하세요」 → 그 누름이 전체 화면 + 소리 잠금 풀기(sound.js 첫 누름)
//   - ⚙ 설정 「전체 화면으로 시작」(S.pref.fs, 기본 켬)을 끄면 누름 없이 저절로 넘어간다 · 움직임 「끄기」면 짧은 페이드만
//   - 건너뛰기: ?nointro=1 · 시험 연결(?mock= · ?emu= · ?speed=) · 시험 도구가 심은 window.__vnNoIntro. ?intro=1 이면 시험 연결에서도 튼다
import { playTechkwonIntro, armFullscreenOnFirstTap } from './techkwon-intro.js';
import { soundState } from './sound.js';
import { fsManualUsed } from './fullscreen.js';

export const TK_LOGO = 'brand/techkwon-logo.jpg';

export function introOff() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('intro') === '1') return false;
    if (window.__vnNoIntro || q.has('nointro')) return true;
    return q.has('mock') || q.has('emu') || q.has('speed');
  } catch { return false; }
}

/** 타이틀을 그린 뒤에 부른다. 끝나면(또는 건너뛰면) 풀리는 약속. quiet = 로고 없이 전체 화면 첫 누름만 건다(수업 중 새로 고침) */
export function startIntro({ quiet = false } = {}) {
  window.__vnIntro = { state: 'off' };
  if (introOff()) return Promise.resolve();
  const fsOn = () => soundState().fs !== false;
  armFullscreenOnFirstTap(() => fsOn() && !fsManualUsed());
  if (quiet) return Promise.resolve();
  const back = document.activeElement;   // 타이틀이 잡아 둔 포커스(방 코드 칸 · 이야기 시작) — 인트로가 걷히면 되돌린다
  const s = soundState();
  window.__vnIntro.state = 'on';
  const p = playTechkwonIntro({ logoUrl: TK_LOGO, ready: Promise.resolve(), fullscreen: fsOn(), reduced: s.motion === 'off' ? true : undefined });
  // 인트로 동안 뒤 화면은 inert — 진행판이 연결된 뒤 다시 그리며 「새 수업 시작」에 포커스를 주어도 못 받고, Tab · Enter 가 뒤 메뉴로 새지 않는다
  const root = document.querySelector('.tk-intro');
  const held = [...document.body.children].filter(x => x !== root && !x.inert && x.tagName !== 'SCRIPT' && x.tagName !== 'STYLE');
  for (const x of held) x.inert = true;
  return p.finally(() => { for (const x of held) x.inert = false; })
    .then(() => {
      window.__vnIntro.state = 'done';
      const ae = document.activeElement;
      if (ae && ae !== document.body) return;
      const t = back && back !== document.body && back.isConnected ? back
        : document.querySelector('#tsSplash, #bNew:not([disabled]), #bStartAlone, #iCode');   // 그 사이 다시 그려졌으면 지금 화면의 첫 단추
      if (t) t.focus({ preventScroll: true });
    });
}
