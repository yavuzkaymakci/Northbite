import { t } from '../content/strings';

/** Top HUD: coin counter (placeholder until Demo 1), FPS readout and the first-move hint. */
export class HUD {
  private readonly coinValue: HTMLSpanElement;
  private readonly fpsEl: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;
  private frames = 0;
  private fpsTimer = 0;
  private hintHidden = false;

  constructor(overlay: HTMLElement) {
    const bar = document.createElement('div');
    bar.className = 'hud-bar';

    const coin = document.createElement('div');
    coin.className = 'hud-pill';
    coin.innerHTML = '<span class="coin-icon"></span>';
    this.coinValue = document.createElement('span');
    this.coinValue.className = 'hud-value';
    this.coinValue.textContent = '0';
    coin.appendChild(this.coinValue);

    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'hud-fps';
    this.fpsEl.textContent = `-- ${t('fps')}`;

    bar.append(coin, this.fpsEl);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'hud-hint';
    this.hintEl.textContent = t('moveHint');

    overlay.append(bar, this.hintEl);
  }

  setCoins(value: number): void {
    this.coinValue.textContent = String(value);
  }

  hideHint(): void {
    if (this.hintHidden) return;
    this.hintHidden = true;
    this.hintEl.classList.add('hidden');
  }

  update(dt: number): void {
    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.fpsTimer)} ${t('fps')}`;
      this.frames = 0;
      this.fpsTimer = 0;
    }
  }
}
