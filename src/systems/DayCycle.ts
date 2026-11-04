import { TimeOfDay as T, type DayPart } from '../content/time';
import type { DayTotals, GameState } from '../core/GameState';

export interface DayEvents {
  /** Set when a new day started this step: the totals of the day that just ended. */
  dayEnded?: { day: number; totals: DayTotals };
  stormWarning?: boolean;
  stormStarted?: boolean;
  stormEnded?: boolean;
}

/**
 * In-game clock, day parts and storms (GDD §12). Pure logic shared with the balance sim.
 * The clock only advances when `update` is called, i.e. while the game screen is running.
 */
export class DayCycle {
  /** Storm for the current day: start time (fraction of day) and length in seconds; null = no storm today. */
  private storm: { at: number; length: number } | null = null;
  private stormLeft = 0;
  private warned = false;

  constructor(
    private readonly state: GameState,
    private readonly dayLength: () => number,
    private readonly rand: () => number = Math.random,
  ) {
    this.planStorm(true);
  }

  get t(): number {
    return this.state.clock.t;
  }

  get day(): number {
    return this.state.clock.day;
  }

  get part(): DayPart {
    let part: DayPart = 'morning';
    for (const p of T.parts) if (this.t >= p.start) part = p.id;
    return part;
  }

  get isNight(): boolean {
    return this.part === 'night';
  }

  /** The aurora shines every night. */
  get auroraActive(): boolean {
    return this.isNight;
  }

  get stormActive(): boolean {
    return this.stormLeft > 0;
  }

  /** Customer arrival rate multiplier (night and storm). */
  get customerRate(): number {
    return (this.isNight ? T.night.customerRate : 1) * (this.stormActive ? T.storm.customerRate : 1);
  }

  /** Bite weight multiplier for non-common fish (storm). */
  get rareFishBonus(): number {
    return this.stormActive ? T.storm.rareFishBonus : 1;
  }

  update(dt: number): DayEvents {
    const ev: DayEvents = {};
    const c = this.state.clock;
    c.t += dt / this.dayLength();
    const b = this.state.buffs;
    b.aurora = Math.max(b.aurora - dt, 0);

    if (c.t >= 1) {
      c.t -= 1;
      ev.dayEnded = { day: c.day, totals: { ...this.state.today } };
      c.day++;
      this.state.today = { coins: 0, caught: 0, sold: 0 };
      this.planStorm(false);
    }

    if (this.stormLeft > 0) {
      this.stormLeft -= dt;
      if (this.stormLeft <= 0) {
        this.stormLeft = 0;
        ev.stormEnded = true;
      }
    } else if (this.storm) {
      const warnAt = this.storm.at - T.storm.warning / this.dayLength();
      if (!this.warned && c.t >= warnAt) {
        this.warned = true;
        ev.stormWarning = true;
      }
      if (c.t >= this.storm.at) {
        this.stormLeft = this.storm.length;
        this.storm = null;
        ev.stormStarted = true;
      }
    }
    return ev;
  }

  /** Jumps the clock (sleeping in the igloo, Demo 4 stage 3). */
  skipTo(t: number): DayEvents {
    const c = this.state.clock;
    const ahead = (t - c.t + 1) % 1;
    return this.update(ahead * this.dayLength());
  }

  private planStorm(resumed: boolean): void {
    this.warned = false;
    this.storm = null;
    if (this.rand() >= T.storm.chancePerDay) return;
    // On a resumed save the storm is placed later in the current day so it can still happen.
    const from = resumed ? Math.max(this.state.clock.t + 0.02, 0.1) : 0.1;
    if (from >= 0.9) return;
    this.storm = {
      at: from + this.rand() * (0.9 - from),
      length: T.storm.durationMin + this.rand() * (T.storm.durationMax - T.storm.durationMin),
    };
  }

  /** Debug / test helper: start a storm warning now. */
  forceStorm(): void {
    this.storm = { at: Math.min(this.state.clock.t + T.storm.warning / this.dayLength(), 0.999), length: T.storm.durationMin };
    this.warned = false;
    this.stormLeft = 0;
  }
}
