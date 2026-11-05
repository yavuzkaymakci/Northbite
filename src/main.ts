import './style.css';
import { Game } from './core/Game';
import { audio } from './audio/AudioEngine';
import { applyPaletteToCss } from './render/Palette';
import { Splash } from './ui/Splash';
import { panels } from './ui/PanelManager';

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
// The splash is painted first; the game is built after that paint (rAF runs before it, the timeout after it).
const splash = new Splash(container);
requestAnimationFrame(() =>
  window.setTimeout(() => {
    const game = new Game(container);
    // Dev-only handle for debugging in the browser console. Stripped from production builds.
    if (import.meta.env.DEV) Object.assign(window, { __game: game, __audio: audio, __panels: panels });
    splash.finish(() => game.start());
  }, 0),
);
