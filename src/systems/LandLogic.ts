import { Guests as G } from '../content/guests';
import { Camp, Cave } from '../content/land';
import { CampLayout, CaveLayout, type Vec2 } from '../content/zones';
import { LandFeel } from '../settings';
import type { FishItem, GameState } from '../core/GameState';
import { payout } from './Rest';

// Visual-free rules for the Ice Cave and the Hot Spring Camp (GDD §15), shared by the game and the balance sim.

/** A payment that lands on a land's coin pile (the game draws the coins). */
export interface Payment {
  value: number;
  tip: number;
  x: number;
  z: number;
}

// ---------- Ice Cave ----------

/** Crystal veins, the crystal bench and the collector's visits. */
export class CaveLogic {
  /** Seconds the collector has left at the cave (0 = away). */
  present = 0;
  private buyTimer = 0;
  private readonly tipCarry = { value: 0 };

  constructor(private readonly state: GameState) {}

  get benchWorking(): boolean {
    const c = this.state.cave;
    return c.input > 0 && c.output < Cave.bench.outputCapacity;
  }

  veinReady(i: number): boolean {
    return (this.state.cave.veins[i] ?? 1) <= 0;
  }

  /** Breaks crystals off a ready vein; returns how many (the vein starts growing back). */
  mine(i: number): number {
    const v = CaveLayout.veins[i];
    if (!v || !this.veinReady(i)) return 0;
    this.state.cave.veins[i] = Cave.refill;
    this.state.cave.mined++;
    return Cave.yieldBySize[v.size - 1] ?? 1;
  }

  /** The collector's first visit after the bench is built. */
  benchBuilt(): void {
    this.state.cave.collectorIn = Cave.collector.firstDelay;
  }

  /**
   * Veins grow back; the bench carves; the collector comes and buys statuettes one by one.
   * Returns what happened this step for the visuals.
   */
  update(dt: number, bench: boolean): { carved: boolean; arrived: boolean; left: boolean; sold: Payment | null } {
    const c = this.state.cave;
    for (let i = 0; i < c.veins.length; i++) c.veins[i] = Math.max((c.veins[i] as number) - dt, 0);
    const out = { carved: false, arrived: false, left: false, sold: null as Payment | null };
    if (!bench) return out;

    if (this.benchWorking) {
      c.progress += dt / Cave.bench.processTime;
      if (c.progress >= 1) {
        c.progress = 0;
        c.input--;
        c.output++;
        out.carved = true;
      }
    }

    if (this.present > 0) {
      this.present -= dt;
      this.buyTimer -= dt;
      if (c.output > 0 && this.buyTimer <= 0) {
        this.buyTimer = LandFeel.collectorBuyInterval;
        c.output--;
        const pay = payout(this.state, Cave.statuetteValue, this.tipCarry);
        c.pile += pay.value + pay.tip;
        out.sold = { ...pay, x: CaveLayout.collector.x, z: CaveLayout.collector.z };
      }
      if (this.present <= 0) {
        this.present = 0;
        c.collectorIn = Cave.collector.interval;
        out.left = true;
      }
    } else {
      c.collectorIn -= dt;
      if (c.collectorIn <= 0) {
        c.collectorIn = 0;
        this.present = Cave.collector.stay;
        this.buyTimer = LandFeel.collectorBuyInterval;
        out.arrived = true;
      }
    }
    return out;
  }
}

// ---------- Hot Spring Camp ----------

/** Kitchen: turns smoked fish into platters one at a time. */
export class KitchenLogic {
  constructor(private readonly state: GameState) {}

  get working(): boolean {
    const k = this.state.camp;
    return k.input.length > 0 && k.plates.length < Camp.kitchen.outputCapacity;
  }

  /** Returns the platter value when one is done this step. */
  update(dt: number): number | null {
    const k = this.state.camp;
    if (!this.working) return null;
    k.progress += dt / Camp.kitchen.plateTime;
    if (k.progress < 1) return null;
    k.progress = 0;
    const fish = k.input.shift() as FishItem;
    const value = Math.round(fish.price * Camp.kitchen.plateMultiplier);
    k.plates.push(value);
    return value;
  }
}

export type GuestPhase = 'queue' | 'toTent' | 'stay' | 'leave';

export interface Guest {
  id: number;
  phase: GuestPhase;
  x: number;
  z: number;
  heading: number;
  /** Walking speed 0..1 (drives the walk animation). */
  walk01: number;
  path: Vec2[];
  /** Waiting in the queue / staying in the tent. */
  timer: number;
  wantsPlate: boolean;
  /** A platter is flying to this guest (the game sets it when serving starts). */
  serving: boolean;
  tent: number;
  /** Appearance seed for the game's model. */
  seed: number;
}

/** Peace (GDD §14) makes guests come more often: up to +25%. */
export function guestRateBonus(peace: number): number {
  return Math.min(peace * G.peaceBonusPerPoint, G.maxPeaceBonus);
}

/**
 * Camp guests (GDD §15): they walk in, queue for a platter (when there is a kitchen), stay in a free tent (rent paid on
 * leaving) and walk off. Pure logic with positions so the sim can run it; guests are never saved.
 */
export class GuestLogic {
  readonly guests: Guest[] = [];
  private spawnTimer = 4;
  private nextId = 1;
  private readonly tentBusy: boolean[] = [false, false, false];
  private readonly tipCarry = { value: 0 };

  constructor(
    private readonly state: GameState,
    private readonly rand: () => number = Math.random,
  ) {}

  /** The first queued guest standing in line and not yet being served (platters go out one by one, in order). */
  nextToServe(): Guest | null {
    return this.queue.find((g) => !g.serving && g.path.length === 0) ?? null;
  }

  get queue(): Guest[] {
    return this.guests.filter((g) => g.phase === 'queue');
  }

  /** Tents (0..3) built, whether the kitchen is there, and the peace score. Returns payments made this step. */
  update(dt: number, tents: number, kitchen: boolean, peace: number): Payment[] {
    const pays: Payment[] = [];
    const freeTent = this.tentBusy.findIndex((b, i) => !b && i < tents);
    this.spawnTimer -= dt * (1 + guestRateBonus(peace));
    if (this.spawnTimer <= 0) {
      this.spawnTimer = G.interval * (0.6 + this.rand() * 0.8);
      const room = this.queue.length < G.maxQueue;
      if ((kitchen && room) || (!kitchen && freeTent >= 0)) this.spawn(kitchen, freeTent);
    }

    const queue = this.queue;
    for (let i = this.guests.length - 1; i >= 0; i--) {
      const g = this.guests[i] as Guest;
      if (g.phase === 'queue') {
        // Walk to the current slot; give up on the platter after a while.
        const slot = queue.indexOf(g);
        const sp = CampLayout.servePoint;
        const target = { x: sp.x + slot * CampLayout.queueSpacing, z: sp.z };
        if (g.path.length === 0 && Math.hypot(g.x - target.x, g.z - target.z) > 0.1) g.path = [target];
        else if (g.path.length > 0) (g.path[g.path.length - 1] as Vec2).x = target.x;
        g.timer += dt;
        if (g.timer > G.plateWait && !g.serving) this.afterPlate(g, tents);
      } else if (g.phase === 'stay') {
        g.timer -= dt;
        if (g.timer <= 0) {
          const pay = payout(this.state, Math.round((Camp.tent.rentPerMin * Camp.tent.stay) / 60), this.tipCarry);
          this.state.camp.pile += pay.value + pay.tip;
          pays.push({ ...pay, x: g.x, z: g.z });
          this.tentBusy[g.tent] = false;
          this.leave(g, CampLayout.tents[g.tent]?.via ?? []);
        }
      }
      const arrived = this.walk(g, dt);
      if (arrived && g.phase === 'toTent') {
        g.phase = 'stay';
        g.timer = Camp.tent.stay;
      } else if (arrived && g.phase === 'leave') {
        this.guests.splice(i, 1);
      }
    }
    return pays;
  }

  /** Hands a platter to a queued guest: they pay (platter + peace tip) and move on. */
  serve(g: Guest, plateValue: number, tents: number): Payment {
    const pay = payout(this.state, plateValue, this.tipCarry);
    this.state.camp.pile += pay.value + pay.tip;
    this.state.camp.served++;
    const out = { ...pay, x: g.x, z: g.z };
    this.afterPlate(g, tents);
    return out;
  }

  private spawn(kitchen: boolean, freeTent: number): void {
    const s = CampLayout.guestSpawn;
    const g: Guest = {
      id: this.nextId++,
      phase: 'queue',
      x: s.x,
      z: s.z,
      heading: -Math.PI / 2,
      walk01: 0,
      path: [],
      timer: 0,
      wantsPlate: kitchen,
      serving: false,
      tent: -1,
      seed: Math.floor(this.rand() * 1e6),
    };
    this.guests.push(g);
    if (!kitchen) this.toTent(g, freeTent);
  }

  /** Off to a free tent, or home when there is none. */
  private afterPlate(g: Guest, tents: number): void {
    g.serving = false;
    const free = this.tentBusy.findIndex((b, i) => !b && i < tents);
    if (free >= 0) this.toTent(g, free);
    else this.leave(g, []);
  }

  private toTent(g: Guest, tent: number): void {
    const t = CampLayout.tents[tent];
    if (!t) return;
    this.tentBusy[tent] = true;
    g.tent = tent;
    g.phase = 'toTent';
    g.path = [CampLayout.guestStep, ...t.via, t.door].map((p) => ({ ...p }));
  }

  private leave(g: Guest, via: readonly Vec2[]): void {
    g.phase = 'leave';
    g.path = [...[...via].reverse(), CampLayout.guestStep, CampLayout.guestExit].map((p) => ({ ...p }));
  }

  /** Follows the path; returns true on arrival at its end. */
  private walk(g: Guest, dt: number): boolean {
    let step = G.walkSpeed * dt;
    const had = g.path.length > 0;
    while (step > 0 && g.path.length > 0) {
      const p = g.path[0] as Vec2;
      const dx = p.x - g.x;
      const dz = p.z - g.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        g.path.shift();
        continue;
      }
      const s = Math.min(step, d);
      g.x += (dx / d) * s;
      g.z += (dz / d) * s;
      step -= s;
      g.heading = Math.atan2(dx, dz);
    }
    g.walk01 = step < G.walkSpeed * dt ? 1 : 0;
    return had && g.path.length === 0;
  }
}
