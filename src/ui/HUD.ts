import { t, tf } from '../content/strings';
import { CoinFeel } from '../settings';
import { damp } from '../core/Time';
import { onTap } from './tap';

/** Top HUD: coin counter (counts toward its target), FPS readout and the first-move hint. */
export class HUD {
  private readonly coinPill: HTMLDivElement;
  private readonly coinValue: HTMLSpanElement;
  private readonly fpsEl: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;
  private readonly dayEl: HTMLDivElement;
  private lastDayKey = '';
  private frames = 0;
  private fpsTimer = 0;
  private hintHidden = false;
  private shown = 0;
  private target = 0;
  private lastText = '';

  constructor(overlay: HTMLElement, onSettings: () => void) {
    const bar = document.createElement('div');
    bar.className = 'hud-bar';

    this.coinPill = document.createElement('div');
    this.coinPill.className = 'hud-pill';
    this.coinPill.innerHTML = '<span class="coin-icon"></span>';
    this.coinValue = document.createElement('span');
    this.coinValue.className = 'hud-value';
    this.coinValue.textContent = '0';
    this.coinPill.appendChild(this.coinValue);

    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'hud-fps';
    this.fpsEl.textContent = `-- ${t('fps')}`;

    const right = document.createElement('div');
    right.className = 'hud-right';
    const gear = document.createElement('button');
    gear.className = 'hud-gear';
    gear.setAttribute('aria-label', t('settingsOpen'));
    gear.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M13.6 3h4.8l.7 3.4 2.4 1 2.9-1.9 3.4 3.4-1.9 2.9 1 2.4 3.4.7v4.8l-3.4.7-1 2.4 1.9 2.9-3.4 3.4-2.9-1.9-2.4 1-.7 3.4h-4.8l-.7-3.4-2.4-1-2.9 1.9-3.4-3.4 1.9-2.9-1-2.4L3 18.4v-4.8l3.4-.7 1-2.4-1.9-2.9 3.4-3.4 2.9 1.9 2.4-1zM16 11a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>`;
    onTap(gear, onSettings);
    right.append(this.fpsEl, gear);
    bar.append(this.coinPill, right);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'hud-hint';
    this.hintEl.textContent = t('moveHint');

    this.dayEl = document.createElement('div');
    this.dayEl.className = 'hud-day';
    overlay.append(bar, this.dayEl, this.hintEl);
  }

  /** Sun or moon icon with "Day N" under the coin counter. */
  setDay(day: number, night: boolean): void {
    const key = `${day}|${night}`;
    if (key === this.lastDayKey) return;
    this.lastDayKey = key;
    const icon = night
      ? '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M15 3a9 9 0 1 0 6 15.7A8 8 0 0 1 15 3z"/></svg>'
      : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></g></svg>';
    this.dayEl.innerHTML = `${icon}<span>${tf('dayLabel', { n: day })}</span>`;
    this.dayEl.classList.toggle('night', night);
  }

  /** Jump straight to a value (on load). */
  setCoins(value: number): void {
    this.shown = this.target = value;
    this.render();
  }

  /** The display counts toward this value. */
  setCoinTarget(value: number): void {
    if (value > this.target) {
      this.coinPill.classList.remove('bump');
      void this.coinPill.offsetWidth;
      this.coinPill.classList.add('bump');
    }
    this.target = value;
  }

  hideHint(): void {
    if (this.hintHidden) return;
    this.hintHidden = true;
    this.hintEl.classList.add('hidden');
  }

  update(dt: number): void {
    if (this.shown !== this.target) {
      this.shown += (this.target - this.shown) * damp(CoinFeel.hudCountSpeed, dt);
      if (Math.abs(this.target - this.shown) < 0.5) this.shown = this.target;
      this.render();
    }

    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.fpsTimer)} ${t('fps')}`;
      this.frames = 0;
      this.fpsTimer = 0;
    }
  }

  private render(): void {
    const text = String(Math.round(this.shown));
    if (text !== this.lastText) {
      this.coinValue.textContent = text;
      this.lastText = text;
    }
  }
}
