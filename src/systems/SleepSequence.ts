import { HapticsSettings, SleepFeel as F } from '../settings';
import { vibrate } from '../core/Haptics';

type Step = 'off' | 'out' | 'dark' | 'in';

/**
 * Falling asleep (GDD §14): the screen fades to night blue with a "Zzz", `onAsleep` runs while it is dark (the clock
 * jumps to morning there), then it fades back in. The game locks input while this runs; nothing of it is saved.
 */
export class SleepSequence {
  private step: Step = 'off';
  private t = 0;
  private readonly el: HTMLDivElement;
  private onAsleep: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'sleep-fade';
    this.el.innerHTML = '<div class="zzz"><span>Z</span><span>z</span><span>z</span></div>';
    container.appendChild(this.el);
  }

  get active(): boolean {
    return this.step !== 'off';
  }

  start(onAsleep: () => void): void {
    if (this.active) return;
    this.onAsleep = onAsleep;
    this.step = 'out';
    this.t = 0;
    this.el.classList.add('on');
    vibrate(HapticsSettings.sleep);
  }

  update(dt: number): void {
    if (this.step === 'off') return;
    this.t += dt;
    if (this.step === 'out') {
      this.el.style.opacity = String(Math.min(this.t / F.fadeOut, 1));
      if (this.t >= F.fadeOut) this.next('dark');
    } else if (this.step === 'dark') {
      this.el.style.opacity = '1';
      if (this.onAsleep) {
        this.onAsleep();
        this.onAsleep = null;
      }
      if (this.t >= F.darkTime) this.next('in');
    } else {
      this.el.style.opacity = String(Math.max(1 - this.t / F.fadeIn, 0));
      if (this.t >= F.fadeIn) {
        this.step = 'off';
        this.el.classList.remove('on');
      }
    }
  }

  private next(step: Step): void {
    this.step = step;
    this.t = 0;
  }
}
