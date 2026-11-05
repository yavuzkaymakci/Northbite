import './style.css';
import { Game } from './core/Game';
import { audio } from './audio/AudioEngine';
import { applyPaletteToCss } from './render/Palette';

/** Blocks browser gestures that fight the game: pinch/double-tap zoom, long-press menus, rubber-band scroll. */
function lockBrowserGestures(): void {
  const prevent = (e: Event) => e.preventDefault();
  // iOS Safari ignores user-scalable=no, so pinch has to be cancelled by hand.
  document.addEventListener('gesturestart', prevent, { passive: false });
  document.addEventListener('gesturechange', prevent, { passive: false });
  document.addEventListener('touchmove', prevent, { passive: false });
  document.addEventListener('dblclick', prevent, { passive: false });
  document.addEventListener('contextmenu', prevent);
  // Text selection stays off, except inside text fields (the character name).
  document.addEventListener('selectstart', (e) => {
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
  });
  // Double-tap zoom on older iOS: swallow a second touchend arriving quickly.
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = performance.now();
      // Text fields are exempt: blocking their touchend would stop them from getting focus.
      if (now - lastTouchEnd < 300 && !(e.target instanceof HTMLInputElement)) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );
}

applyPaletteToCss();
lockBrowserGestures();

const container = document.getElementById('app');
if (!container) throw new Error('#app missing');
const game = new Game(container);
game.start();
// Dev-only handle for debugging in the browser console. Stripped from production builds.
if (import.meta.env.DEV) Object.assign(window, { __game: game, __audio: audio });
