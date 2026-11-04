import './style.css';
import { Game } from './core/Game';
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
  document.addEventListener('selectstart', prevent);
  // Double-tap zoom on older iOS: swallow a second touchend arriving quickly.
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = performance.now();
      if (now - lastTouchEnd < 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );
}

applyPaletteToCss();
lockBrowserGestures();

const container = document.getElementById('app');
if (!container) throw new Error('#app missing');
new Game(container).start();
