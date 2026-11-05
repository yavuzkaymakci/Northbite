import { t, tf } from '../content/strings';
import { OfflineFeel } from '../settings';
import { onTap } from './tap';
import { panels } from './PanelManager';

/** "While you were away…" (GDD §18): time away, coins earned (counting up), the cap, one big "Collect" button. */
export class OfflinePanel {
  private readonly root: HTMLDivElement;
  private readonly awayEl: HTMLElement;
  private readonly coinsEl: HTMLElement;
  private readonly capEl: HTMLElement;
  private onCollect: (() => void) | null = null;
  private target = 0;
  private shown = 0;
  private t = 0;

  constructor(overlay: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'offline-backdrop';
    this.root.innerHTML = `
      <div class="offline-card">
        <div class="offline-title">${t('offlineTitle')}</div>
        <div class="offline-away"></div>
        <div class="offline-coins"><span class="coin-icon"></span><b class="offline-value">0</b></div>
        <div class="offline-cap"></div>
        <button class="offline-collect">${t('offlineCollect')}</button>
        <button class="offline-boost"${OfflineFeel.showOfflineBoost ? '' : ' hidden'}>${t('offlineBoost')}</button>
      </div>`;
    this.awayEl = this.root.querySelector('.offline-away') as HTMLElement;
    this.coinsEl = this.root.querySelector('.offline-value') as HTMLElement;
    this.capEl = this.root.querySelector('.offline-cap') as HTMLElement;
    (this.root.querySelector('.offline-card') as HTMLElement).addEventListener('pointerdown', (e) => e.stopPropagation());
    onTap(this.root.querySelector('.offline-collect') as HTMLElement, () => panels.close('offline', 'done'));
    overlay.appendChild(this.root);
    // Modal. Back also collects (the coins are never lost).
    panels.register({
      id: 'offline',
      kind: 'modal',
      root: this.root,
      show: () => this.root.classList.add('open'),
      hide: () => this.root.classList.remove('open'),
      onClose: () => this.collect(),
    });
  }

  /** Showing or waiting for another window to close. */
  get isOpen(): boolean {
    return panels.isOpen('offline') || panels.isQueued('offline');
  }

  show(coins: number, seconds: number, capped: boolean, capHours: number, onCollect: () => void): void {
    this.onCollect = onCollect;
    panels.open('offline', {
      queue: true,
      run: () => {
        this.target = coins;
        this.shown = 0;
        this.t = 0;
        this.awayEl.textContent = tf('offlineAway', { t: formatDuration(seconds) });
        this.capEl.textContent = tf(capped ? 'offlineCapped' : 'offlineCap', { h: capHours });
        this.coinsEl.textContent = '0';
      },
    });
  }

  update(dt: number): void {
    if (!panels.isOpen('offline') || this.shown >= this.target) return;
    this.t += dt;
    const k = Math.min(this.t / OfflineFeel.countUpTime, 1);
    this.shown = Math.round(this.target * (1 - Math.pow(1 - k, 3)));
    this.coinsEl.textContent = String(this.shown);
  }

  private collect(): void {
    const cb = this.onCollect;
    this.onCollect = null;
    cb?.();
  }
}

/** "1 sa 25 dk" / "1 h 25 min" style. */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? tf('durationHM', { h, m: m % 60 }) : tf('durationM', { m: Math.max(m, 1) });
}
