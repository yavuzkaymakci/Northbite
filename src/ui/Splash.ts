import { SplashFeel as F } from '../settings';

/**
 * Splash (GDD §22): logo, "Northbite" and falling snowflakes for ~1.5 s while the game is built behind it. No progress
 * bar. Built before the game so the browser paints it first.
 */
export class Splash {
  private readonly el: HTMLDivElement;
  private readonly shownAt = performance.now();

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'splash';
    this.el.style.setProperty('--splash-fade', `${F.fadeMs}ms`);
    const flakes = Array.from({ length: F.flakes }, (_, i) => {
      // Spread across the width, with varied size, speed and start time.
      const x = ((i * 37) % 100) + (i % 3) * 2;
      const size = 6 + ((i * 7) % 9);
      const dur = 3.2 + ((i * 13) % 20) / 10;
      const delay = -((i * 0.41) % dur);
      return `<span class="splash-flake" style="left:${x}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s"></span>`;
    }).join('');
    this.el.innerHTML = `${flakes}
      <div class="splash-center">
        <img class="splash-logo" src="${import.meta.env.BASE_URL}icon.svg" alt="" draggable="false" />
        <div class="splash-title">Northbite</div>
        <svg class="splash-snowflake" viewBox="0 0 40 40" aria-hidden="true"><g stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none">
          <path d="M20 4v32M6.1 12l27.8 16M6.1 28l27.8-16"/>
          <path d="M15.5 6.5 20 10l4.5-3.5M15.5 33.5 20 30l4.5 3.5M5.6 17.6l5.3-1.1-1.7-5.1M34.4 22.4l-5.3 1.1 1.7 5.1M5.6 22.4l5.3 1.1-1.7 5.1M34.4 17.6l-5.3-1.1 1.7-5.1"/>
        </g></svg>
      </div>`;
    container.appendChild(this.el);
  }

  /** Waits for the minimum time, then fades out; `onReveal` runs as the fade starts. */
  finish(onReveal: () => void): void {
    const wait = Math.max(F.minMs - (performance.now() - this.shownAt), 0);
    window.setTimeout(() => {
      onReveal();
      this.el.classList.add('out');
      window.setTimeout(() => this.el.remove(), F.fadeMs + 50);
    }, wait);
  }
}
