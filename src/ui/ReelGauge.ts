import { t } from '../content/strings';
import { FishingFeel } from '../settings';
import type { TensionZone } from '../systems/ReelGame';
import type { WorldLabel, WorldLabels } from './WorldLabels';

/**
 * Progress + tension gauge shown beside the player during reeling.
 * Anchored in the world so it stays near mid-screen, never under the thumb in the bottom 30%.
 */
export class ReelGauge {
  readonly label: WorldLabel;
  private readonly progressFill: HTMLDivElement;
  private readonly tensionTrack: HTMLDivElement;
  private readonly tensionMarker: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private lastZone: TensionZone | null = null;

  constructor(private readonly labels: WorldLabels) {
    this.label = labels.create(
      'reel-gauge',
      `<div class="gauge-row"><span class="gauge-name">${t('reelLabel')}</span>
         <div class="gauge-track"><div class="gauge-progress"></div></div></div>
       <div class="gauge-row"><span class="gauge-name">${t('tensionLabel')}</span>
         <div class="gauge-track tension"><div class="tension-marker"></div></div></div>
       <div class="gauge-hint">${t('reelHint')}</div>`,
    );
    this.label.clampX = true;
    const q = <T extends HTMLElement>(sel: string) => this.label.el.querySelector(sel) as T;
    this.progressFill = q('.gauge-progress');
    this.tensionTrack = q('.gauge-track.tension');
    this.tensionMarker = q('.tension-marker');
    this.hint = q('.gauge-hint');
  }

  open(greenZone: number, showHint: boolean): void {
    const g = (greenZone * 100).toFixed(1);
    const r = (FishingFeel.redZoneStart * 100).toFixed(1);
    this.tensionTrack.style.setProperty('--green-end', `${g}%`);
    this.tensionTrack.style.setProperty('--red-start', `${r}%`);
    this.hint.style.display = showHint ? '' : 'none';
    this.lastZone = null;
    this.labels.pop(this.label);
  }

  close(): void {
    this.labels.show(this.label, false);
  }

  update(progress: number, tension: number, zone: TensionZone, warning: boolean): void {
    this.progressFill.style.transform = `scaleX(${progress.toFixed(3)})`;
    const tPct = Math.min(tension / FishingFeel.breakTension, 1) * 100;
    this.tensionMarker.style.left = `${tPct.toFixed(1)}%`;
    if (zone !== this.lastZone) {
      this.label.el.dataset.zone = zone;
      this.lastZone = zone;
    }
    this.label.el.classList.toggle('warn', warning);
  }
}
