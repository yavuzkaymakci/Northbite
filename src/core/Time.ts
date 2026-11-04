import { TimeSettings } from '../settings';

/** Frame timing. `delta` is clamped so a long hitch (or returning from background) never teleports things. */
export class Time {
  delta = 0;
  elapsed = 0;
  private last = -1;

  tick(nowMs: number): void {
    if (this.last < 0) this.last = nowMs;
    const raw = (nowMs - this.last) / 1000;
    this.last = nowMs;
    this.delta = Math.min(Math.max(raw, 0), TimeSettings.maxDelta);
    this.elapsed += this.delta;
  }

  /** Call when resuming so the paused duration is not counted as one frame. */
  reset(): void {
    this.last = -1;
    this.delta = 0;
  }
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(sharpness: number, dt: number): number {
  return 1 - Math.exp(-sharpness * dt);
}
