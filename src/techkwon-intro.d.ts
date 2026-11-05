export interface TechkwonIntroOptions {
  /** the TechKwon logo image, bundled with the game */
  logoUrl: string;
  /** where to put the overlay (default document.body) */
  host?: HTMLElement;
  /** the intro waits for it before fading out (game loading) */
  ready?: Promise<unknown>;
  /** false: never ask for the tap (default true) */
  fullscreen?: boolean;
  /** override: end on "로고를 터치하세요" (default: when full screen is possible) */
  waitForTap?: boolean;
  /** short fade only (default: prefers-reduced-motion) */
  reduced?: boolean;
  /** big text under the logo (default '테크권') */
  word?: string;
  /** small text (default 'presents') */
  sub?: string;
  /** tap prompt (default '로고를 터치하세요') */
  prompt?: string;
}
export function playTechkwonIntro(options: TechkwonIntroOptions): Promise<void>;
export function armFullscreenOnFirstTap(enabled?: () => boolean): void;
export function createFullscreenButton(options?: { className?: string }): HTMLButtonElement | null;
export function fullscreenGlyph(exit?: boolean): HTMLSpanElement;
export function fullscreenSupported(): boolean;
export function isFullscreen(): boolean;
export function isStandaloneApp(): boolean;
export function enterFullscreen(): void;
export function exitFullscreen(): void;
export function onFullscreenChange(fn: () => void): void;
