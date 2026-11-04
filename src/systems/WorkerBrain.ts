import { Workers } from '../content/workers';
import type { PathNodeId, Vec2 } from '../content/zones';
import { WorkerFeel } from '../settings';
import type { FishItem, WorkerData } from '../core/GameState';
import { resolveCollisions } from './Collision';
import type { Walkable } from './Movement';
import type { PathGraphNav } from './Pathfinding';

export type StoreId = 'basket' | 'smokerIn' | 'smokerOut' | 'counter';

/** A place helpers take fish from or bring fish to. The game adds flights; the sim moves items instantly. */
export interface WorkStore {
  /** Graph node where a helper stands to use it. */
  readonly node: PathNodeId;
  enabled(): boolean;
  /** Fish a helper may take right now. */
  takeable(): number;
  take(worker: WorkerBrain): FishItem | null;
  /** Free places right now. */
  room(): number;
  give(item: FishItem, worker: WorkerBrain): void;
}

export interface WorkContext {
  stores: Record<StoreId, WorkStore>;
  nav: PathGraphNav;
  /** Node helpers return to when there is nothing to do. */
  homeNode: PathNodeId;
  /** Static colliders for light local avoidance (optional in the sim). */
  walkable?: Walkable;
}

export type WorkerPhase = 'idle' | 'toPickup' | 'picking' | 'toDrop' | 'dropping';

interface Job {
  from: StoreId;
  to: StoreId;
}

const CAP = Workers.penguin.carryCapacity;

/**
 * Helper state machine (GDD §7): idle → going → taking → going → dropping.
 * Job priority: smoked fish → counter; raw fish → smokehouse (if it has room); raw fish → counter; else wait home.
 * Pure logic: positions and timers only, so the balance sim can run it without Three.js.
 */
export class WorkerBrain {
  x: number;
  z: number;
  heading = 0;
  /** 0..1 actual speed relative to walk speed (drives the waddle). */
  speed01 = 0;
  phase: WorkerPhase = 'idle';
  job: Job | null = null;
  /** Seconds spent idle at home (visuals use it for flaps and look-arounds). */
  idleTime = 0;
  private path: Vec2[] = [];
  private timer = 0;
  private atHome = false;

  constructor(
    readonly data: WorkerData,
    readonly index: number,
    x: number,
    z: number,
  ) {
    this.x = x;
    this.z = z;
  }

  get carried(): FishItem[] {
    return this.data.carried;
  }

  update(dt: number, ctx: WorkContext, all: readonly WorkerBrain[]): void {
    const prevX = this.x;
    const prevZ = this.z;
    switch (this.phase) {
      case 'idle':
        this.updateIdle(dt, ctx, all);
        break;
      case 'toPickup':
        if (this.walk(dt, ctx)) this.setPhase('picking', 0);
        break;
      case 'picking':
        this.updatePicking(dt, ctx);
        break;
      case 'toDrop':
        if (this.walk(dt, ctx)) this.setPhase('dropping', 0);
        break;
      case 'dropping':
        this.updateDropping(dt, ctx);
        break;
    }
    const moved = dt > 0 ? Math.hypot(this.x - prevX, this.z - prevZ) / dt : 0;
    this.speed01 = Math.min(moved / Workers.penguin.walkSpeed, 1);
  }

  private updateIdle(dt: number, ctx: WorkContext, all: readonly WorkerBrain[]): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = WorkerFeel.jobCheckInterval;
      const job = this.carried.length > 0 ? this.resumeJob(ctx) : this.pickJob(ctx, all);
      if (job) {
        this.job = job;
        this.atHome = false;
        this.idleTime = 0;
        if (this.carried.length > 0) this.goTo('toDrop', ctx.stores[job.to].node, ctx);
        else this.goTo('toPickup', ctx.stores[job.from].node, ctx);
        return;
      }
      if (!this.atHome && this.path.length === 0) {
        const home = ctx.nav.node(ctx.homeNode);
        this.path = ctx.nav.route(this, ctx.homeNode);
        this.path[this.path.length - 1] = { x: home.x + this.index * WorkerFeel.homeSpacing, z: home.z + this.index * 0.3 };
      }
    }
    if (this.path.length > 0) {
      if (this.walk(dt, ctx)) this.atHome = true;
    } else if (this.atHome) {
      this.idleTime += dt;
    }
  }

  private updatePicking(dt: number, ctx: WorkContext): void {
    const job = this.job as Job;
    const store = ctx.stores[job.from];
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = WorkerFeel.transferInterval;
    if (this.carried.length < CAP && store.enabled() && store.takeable() > 0) {
      const item = store.take(this);
      if (item) this.carried.push(item);
      return;
    }
    if (this.carried.length === 0) {
      this.toIdle(); // someone else emptied it first
      return;
    }
    this.goTo('toDrop', ctx.stores[job.to].node, ctx);
  }

  private updateDropping(dt: number, ctx: WorkContext): void {
    const job = this.job as Job;
    const store = ctx.stores[job.to];
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = WorkerFeel.transferInterval;
    if (this.carried.length === 0) {
      this.toIdle();
      return;
    }
    // Waits at a full destination until there is room again.
    if (store.enabled() && store.room() > 0) store.give(this.carried.pop() as FishItem, this);
  }

  private pickJob(ctx: WorkContext, all: readonly WorkerBrain[]): Job | null {
    const s = ctx.stores;
    const avail = (id: StoreId) => (s[id].enabled() ? s[id].takeable() - this.claimedFrom(id, all) : 0);
    const room = (id: StoreId) => (s[id].enabled() ? s[id].room() - this.claimedTo(id, all) : 0);
    if (avail('smokerOut') > 0 && room('counter') > 0) return { from: 'smokerOut', to: 'counter' };
    if (avail('basket') > 0 && room('smokerIn') > 0) return { from: 'basket', to: 'smokerIn' };
    if (avail('basket') > 0 && room('counter') > 0) return { from: 'basket', to: 'counter' };
    return null;
  }

  /** A loaded helper (e.g. after a reload) finishes its delivery first. */
  private resumeJob(ctx: WorkContext): Job {
    const raw = this.carried[0]?.kind === 'raw';
    const smoker = ctx.stores.smokerIn;
    if (raw && smoker.enabled() && smoker.room() > 0) return { from: 'basket', to: 'smokerIn' };
    return { from: raw ? 'basket' : 'smokerOut', to: 'counter' };
  }

  private claimedFrom(id: StoreId, all: readonly WorkerBrain[]): number {
    let n = 0;
    for (const w of all) {
      if (w !== this && w.job?.from === id && (w.phase === 'toPickup' || w.phase === 'picking')) n += CAP - w.carried.length;
    }
    return n;
  }

  private claimedTo(id: StoreId, all: readonly WorkerBrain[]): number {
    let n = 0;
    for (const w of all) {
      if (w === this || w.job?.to !== id || w.phase === 'idle') continue;
      n += w.phase === 'toPickup' || w.phase === 'picking' ? CAP : w.carried.length;
    }
    return n;
  }

  private goTo(phase: WorkerPhase, node: PathNodeId, ctx: WorkContext): void {
    this.path = ctx.nav.route(this, node);
    this.setPhase(phase, 0);
  }

  private setPhase(phase: WorkerPhase, timer: number): void {
    this.phase = phase;
    this.timer = timer;
  }

  private toIdle(): void {
    this.job = null;
    this.path = [];
    this.setPhase('idle', 0);
  }

  /** Follows `path`. Returns true on arrival at its last point. */
  private walk(dt: number, ctx: WorkContext): boolean {
    let step = Workers.penguin.walkSpeed * dt;
    while (step > 0 && this.path.length > 0) {
      const target = this.path[0] as Vec2;
      const dx = target.x - this.x;
      const dz = target.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d <= WorkerFeel.arriveDistance) {
        this.path.shift();
        continue;
      }
      const s = Math.min(step, d);
      this.x += (dx / d) * s;
      this.z += (dz / d) * s;
      step -= s;
      const want = Math.atan2(dx, dz);
      const diff = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
      this.heading += diff * Math.min(1, dt * WorkerFeel.turnSharpness);
    }
    if (ctx.walkable) resolveCollisions(this, WorkerFeel.radius, ctx.walkable.colliders, ctx.walkable.bounds);
    return this.path.length === 0;
  }
}
