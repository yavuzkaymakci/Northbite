import { t, tf } from '../content/strings';
import { DayFeel } from '../settings';
import type { DayTotals } from '../core/GameState';
import { onTap } from './tap';
import { panels } from './PanelManager';

/** "Day N summary" card shown at dawn (GDD §12). Closes by itself or on tap; the game keeps running. */
export class DaySummary {
  private readonly el: HTMLDivElement;
  private timer = 0;

  constructor(overlay: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'day-summary';
    onTap(this.el, () => panels.close('daySummary', 'button'));
    overlay.appendChild(this.el);
    panels.register({
      id: 'daySummary',
      kind: 'card',
      root: this.el,
      show: () => {
        this.el.classList.remove('show');
        void this.el.offsetWidth;
        this.el.classList.add('show');
      },
      hide: () => {
        this.timer = 0;
        this.el.classList.remove('show');
      },
    });
  }

  /** `sleep` is the rested line ("Well rested (Quality N)"), or null when the player did not sleep. */
  show(day: number, totals: DayTotals, sleep: string | null): void {
    panels.showCard('daySummary', () => this.fill(day, totals, sleep));
  }

  private fill(day: number, totals: DayTotals, sleep: string | null): void {
    this.el.innerHTML = `<div class="ds-title">${tf('daySummaryTitle', { n: day })}</div>
      <div class="ds-row"><span>${t('summaryCoins')}</span><b><span class="coin-icon small"></span>${Math.round(totals.coins)}</b></div>
      <div class="ds-row"><span>${t('summaryCaught')}</span><b>${totals.caught}</b></div>
      <div class="ds-row"><span>${t('summarySold')}</span><b>${totals.sold}</b></div>
      <div class="ds-row"><span>${t('summarySleep')}</span><b>${sleep ?? t('summaryNoSleep')}</b></div>`;
    this.timer = DayFeel.summaryTime;
  }

  update(dt: number): void {
    if (this.timer <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) panels.close('daySummary', 'auto');
  }
}
