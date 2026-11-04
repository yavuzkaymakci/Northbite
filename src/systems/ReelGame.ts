import { FishingFeel as F } from '../settings';
import { damp } from '../core/Time';
import type { HookedFish } from './FishRoll';
import { NO_MODS, type FishingMods } from './Upgrades';

export type TensionZone = 'green' | 'yellow' | 'red';
export type ReelResult = 'reeling' | 'caught' | 'snapped';
type TugPhase = 'calm' | 'warn' | 'pull';

/**
 * Reeling mini-game rules, free of visuals (GDD §2.1).
 * Holding settles tension around `holdTension`; tugs add force on top. Holding through a strong tug breaks the line.
 */
export class ReelGame {
  tension = 0;
  progress = 0;
  /** Current tug force (0..~1). */
  force = 0;
  phase: TugPhase = 'calm';

  private phaseTimer = 0;
  private nextTugIn: number;
  private tugPower = 0;

  constructor(
    readonly fish: HookedFish,
    private readonly rand: () => number = Math.random,
    private readonly mods: Pick<FishingMods, 'lineStrength' | 'reelSpeed'> = NO_MODS,
  ) {
    this.nextTugIn = this.tugInterval() * 0.7;
  }

  get greenZone(): number {
    return this.fish.species.greenZone;
  }

  get zone(): TensionZone {
    if (this.tension < this.greenZone) return 'green';
    if (this.tension < F.redZoneStart) return 'yellow';
    return 'red';
  }

  /** 0..1 while a tug is being telegraphed. */
  get warning(): number {
    return this.phase === 'warn' ? 1 - this.phaseTimer / F.tugWarnTime : 0;
  }

  update(dt: number, holding: boolean): ReelResult {
    this.updateTug(dt, holding);

    const target = holding ? F.holdTension + this.force : this.force * F.releaseTugShare;
    const sharp = target > this.tension ? F.tensionRiseSharpness : F.tensionFallSharpness;
    this.tension += (target - this.tension) * damp(sharp, dt);
    if (this.tension >= F.breakTension) return 'snapped';

    if (holding) {
      const zone = this.zone;
      const mul = zone === 'green' ? 1 : zone === 'yellow' ? F.progressYellowMul : F.progressRedMul;
      this.progress += (mul * this.mods.reelSpeed * dt) / (this.fish.species.reelTime * this.fish.difficulty);
    } else {
      this.progress -= F.progressDecayPerSec * dt;
    }
    this.progress = Math.min(Math.max(this.progress, 0), 1);
    return this.progress >= 1 ? 'caught' : 'reeling';
  }

  private updateTug(dt: number, holding: boolean): void {
    const s = this.fish.species;
    switch (this.phase) {
      case 'calm':
        this.force = 0;
        this.nextTugIn -= dt;
        if (this.nextTugIn <= 0) {
          this.phase = 'warn';
          this.phaseTimer = F.tugWarnTime;
          const jitter = 1 + s.tugIrregularity * (this.rand() * 2 - 1);
          // A stronger line raises the effective break ceiling, i.e. the same tug moves tension less.
          this.tugPower = (s.tugStrength * this.fish.difficulty * jitter) / this.mods.lineStrength;
        }
        break;
      case 'warn':
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
          this.phase = 'pull';
          this.phaseTimer = 0;
          this.tension += this.tugPower * F.tugImpulse * (holding ? 1 : F.releaseTugShare);
        }
        break;
      case 'pull': {
        this.phaseTimer += dt;
        const t = this.phaseTimer;
        this.force = this.tugPower * Math.min(t / F.tugRampTime, 1);
        if (t >= F.tugRampTime + F.tugHoldTime) {
          this.phase = 'calm';
          this.force = 0;
          this.nextTugIn = this.tugInterval();
        }
        break;
      }
    }
  }

  private tugInterval(): number {
    const s = this.fish.species;
    return s.tugIntervalMin + this.rand() * (s.tugIntervalMax - s.tugIntervalMin);
  }
}
