import { DayFeel } from '../settings';
import { sfx } from '../audio/AudioEngine';

export type BannerTone = 'info' | 'warn' | 'good';

/** Strip under the HUD for short notices (storm, night, buffs, later threats). One at a time; newest wins. */
export class Banner {
  private readonly el: HTMLDivElement;
  private timer = 0;

  constructor(overlay: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'banner';
    overlay.appendChild(this.el);
  }

  show(text: string, tone: BannerTone = 'info', seconds: number = DayFeel.bannerTime): void {
    this.el.textContent = text;
    this.el.dataset.tone = tone;
    // Warnings come with their own sound (bear, avalanche, storm); others get a gentle chime.
    if (tone !== 'warn') sfx('banner');
    this.el.classList.remove('show');
    void this.el.offsetWidth;
    this.el.classList.add('show');
    this.timer = seconds;
  }

  update(dt: number): void {
    if (this.timer <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) this.el.classList.remove('show');
  }
}
