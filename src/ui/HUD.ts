import { t } from '../content/strings';
import { CoinFeel } from '../settings';
import { damp } from '../core/Time';

/** Top HUD: coin counter (counts toward its target), FPS readout and the first-move hint. */
export class HUD {
  private readonly coinPill: HTMLDivElement;
  private readonly coinValue: HTMLSpanElement;
  private readonly fpsEl: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;
  private frames = 0;
  private fpsTimer = 0;
  private hintHidden = false;
  private shown = 0;
  private target = 0;
  private lastText = '';

  constructor(overlay: HTMLElement) {
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

    bar.append(this.coinPill, this.fpsEl);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'hud-hint';
    this.hintEl.textContent = t('moveHint');

    overlay.append(bar, this.hintEl);
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
