import { Threats } from '../content/threats';
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
  /** Snow pile to shovel when there is nothing to carry (avalanche, lowest priority). */
  digSite?: () => DigSite | null;
  /** True while that pile still stands. */
  digAlive?: (id: number) => boolean;
}

/** A spot next to a snow pile, reached through a graph node. */
export interface DigSite {
  id: number;
  node: PathNodeId;
  x: number;
  z: number;
}

export type WorkerPhase = 'idle' | 'toPickup' | 'picking' | 'toDrop' | 'dropping' | 'hiding' | 'toDig' | 'digging';

interface Job {
  from: StoreId;
  to: StoreId;
}

const CAP = Workers.penguin.carryCapacity;

/**
 * Helper state machine (GDD §7): idle → going → taking → going → dropping.
 * Job priority: smoked fish → counter; raw fish → smokehouse (if it has room); raw fish → counter; shovel a snow pile;
 * else wait home. A bear makes a helper run into the hut and hide for a while (it keeps what it carries).
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
  /** True while hidden inside the hut (drawn invisible). */
  inside = false;
  /** Pile being shoveled (or walked to). */
  digId: number | null = null;
  private fear = 0;
  /** Seconds spent walking to a pile (gives up if it cannot get there). */
  private digWalk = 0;
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
      case 'hiding':
        this.updateHiding(dt, ctx);
        break;
      case 'toDig':
        this.digWalk += dt;
        if (!ctx.digAlive?.(this.digId ?? -1) || this.digWalk > 30) this.toIdle();
        else if (this.walk(dt, ctx)) this.setPhase('digging', 0);
        break;
      case 'digging':
        this.updateDigging(dt, ctx, all);
        break;
    }
    const moved = dt > 0 ? Math.hypot(this.x - prevX, this.z - prevZ) / dt : 0;
    this.speed01 = Math.min(moved / Workers.penguin.walkSpeed, 1.4);
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
      const site = this.pickDig(ctx, all);
      if (site) {
        this.digId = site.id;
        this.digWalk = 0;
        this.atHome = false;
        this.idleTime = 0;
        this.path = [...ctx.nav.route(this, site.node), { x: site.x, z: site.z }];
        this.setPhase('toDig', 0);
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

  /** A bear came for this helper: run to the hut and hide for `seconds`. */
  scare(seconds: number, ctx: WorkContext): void {
    if (this.phase === 'hiding') return;
    this.fear = seconds;
    this.job = null;
    this.digId = null;
    this.atHome = false;
    this.idleTime = 0;
    this.goTo('hiding', ctx.homeNode, ctx);
  }

  get hiding(): boolean {
    return this.phase === 'hiding';
  }

  private updateHiding(dt: number, ctx: WorkContext): void {
    this.fear -= dt;
    if (this.path.length > 0) {
      if (this.walk(dt, ctx)) this.inside = true;
    } else {
      this.inside = true;
    }
    if (this.fear <= 0) {
      this.inside = false;
      this.toIdle();
    }
  }

  private updateDigging(dt: number, ctx: WorkContext, all: readonly WorkerBrain[]): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = WorkerFeel.jobCheckInterval;
    // Carrying fish always comes first: drop the shovel as soon as there is a job.
    if (!ctx.digAlive?.(this.digId ?? -1) || this.pickJob(ctx, all)) this.toIdle();
  }

  private pickDig(ctx: WorkContext, all: readonly WorkerBrain[]): DigSite | null {
    const site = ctx.digSite?.();
    // One shoveler at a time; the others keep carrying.
    if (!site || all.some((w) => w !== this && w.digId !== null)) return null;
    return site;
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
    this.digId = null;
    this.path = [];
    this.setPhase('idle', 0);
  }

  /** Follows `path`. Returns true on arrival at its last point. */
  private walk(dt: number, ctx: WorkContext): boolean {
    let step = Workers.penguin.walkSpeed * (this.phase === 'hiding' ? Threats.bear.penguinFleeSpeed : 1) * dt;
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
