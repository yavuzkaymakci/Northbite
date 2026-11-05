import { Threats } from '../content/threats';
import { Jobs, RoleById, type JobId, type RoleId } from '../content/roles';
import type { PathNodeId, Vec2 } from '../content/zones';
import { WorkerFeel } from '../settings';
import type { WorkerData, WorkerItem } from '../core/GameState';
import { resolveCollisions } from './Collision';
import type { JobBoard } from './JobBoard';
import type { Walkable } from './Movement';
import type { PathGraphNav } from './Pathfinding';

export type { StoreId } from '../content/roles';
export type { WorkStore } from './JobBoard';

export interface WorkContext {
  board: JobBoard;
  nav: PathGraphNav;
  /** Node penguins return to when there is nothing to do, and their waiting spot by index. */
  homeNode: PathNodeId;
  homeSpot: (index: number) => Vec2;
  /** Static colliders for light local avoidance (optional in the sim). */
  walkable?: Walkable;
  /** Carry capacity and walk speed of one penguin (station upgrades, trait, level). */
  carry: (w: WorkerData) => number;
  speed: (w: WorkerData) => number;
  /** Snow pile to shovel (avalanche). */
  digSite?: () => DigSite | null;
  /** True while that pile still stands. */
  digAlive?: (id: number) => boolean;
  /** Experience hooks: a piece delivered, a pile cleared. */
  onDeliver?: (w: WorkerBrain) => void;
  onDug?: (w: WorkerBrain) => void;
}

/** A spot next to a snow pile, reached through a graph node (and `via` points after it). */
export interface DigSite {
  id: number;
  node: PathNodeId;
  x: number;
  z: number;
  via?: readonly Vec2[];
  /** Already inside this area (the cleared part of the corridor): walk straight to the spot. */
  inside?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export type WorkerPhase = 'idle' | 'toPickup' | 'picking' | 'toDrop' | 'dropping' | 'hiding' | 'toDig' | 'digging';

/**
 * A penguin's state machine (GDD §7, §24): idle → going → taking → going → dropping. What to do comes from the job
 * board: the best listing for the penguin's role (content/roles.ts), reserved so no two penguins take the same
 * pieces. Sweepers (and carriers while there is no sweeper) shovel snow piles when nothing else is listed. A bear
 * makes a penguin run into the hut and hide for a while (it keeps what it carries).
 * Pure logic: positions and timers only, so the balance sim can run it without Three.js.
 */
export class WorkerBrain {
  x: number;
  z: number;
  heading = 0;
  /** 0..1 actual speed relative to the base walk speed (drives the waddle). */
  speed01 = 0;
  phase: WorkerPhase = 'idle';
  /** Seconds spent idle at home (visuals use it for flaps and look-arounds). */
  idleTime = 0;
  /** True while hidden inside the hut (drawn invisible). */
  inside = false;
  /** Pile being shoveled (or walked to). */
  digId: number | null = null;
  /** Working at the source before taking (mining a vein): the visuals swing a pickaxe. */
  working = false;
  private fear = 0;
  private cap = 1;
  private walkSpeed = 1;
  private digWalk = 0;
  private path: Vec2[] = [];
  private timer = 0;
  private atHome = false;
  /** Seconds waited at a full destination. */
  private waited = 0;

  constructor(
    readonly data: WorkerData,
    public index: number,
    x: number,
    z: number,
  ) {
    this.x = x;
    this.z = z;
  }

  get carried(): WorkerItem[] {
    return this.data.carried;
  }

  get role(): RoleId {
    return this.data.role;
  }

  update(dt: number, ctx: WorkContext, all: readonly WorkerBrain[]): void {
    this.cap = ctx.carry(this.data);
    this.walkSpeed = ctx.speed(this.data);
    const prevX = this.x;
    const prevZ = this.z;
    switch (this.phase) {
      case 'idle':
        this.updateIdle(dt, ctx, all);
        break;
      case 'toPickup':
        if (this.walk(dt, ctx)) this.setPhase('picking', this.workTime(ctx));
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
        if (!ctx.digAlive?.(this.digId ?? -1) || this.digWalk > 30) this.toIdle(ctx);
        else if (this.walk(dt, ctx)) this.setPhase('digging', 0);
        break;
      case 'digging':
        this.updateDigging(dt, ctx, all);
        break;
    }
    const moved = dt > 0 ? Math.hypot(this.x - prevX, this.z - prevZ) / dt : 0;
    this.speed01 = Math.min(moved / Math.max(this.walkSpeed, 0.1), 1.4);
  }

  /** The job this penguin holds on the board, if any. */
  job(ctx: WorkContext): JobId | null {
    return ctx.board.jobOf(this);
  }

  private workTime(ctx: WorkContext): number {
    const j = this.job(ctx);
    return j && this.carried.length === 0 ? (Jobs[j].workTime ?? 0) : 0;
  }

  private rolesPresent(all: readonly WorkerBrain[]): Set<RoleId> {
    return new Set(all.map((w) => w.role));
  }

  private updateIdle(dt: number, ctx: WorkContext, all: readonly WorkerBrain[]): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = WorkerFeel.jobCheckInterval;
      const b = ctx.board;
      const job = this.carried.length > 0 ? b.resume(this, this.role, this.carried) : b.claim(this, this.role, this.rolesPresent(all), this.cap - this.carried.length);
      if (job) {
        this.atHome = false;
        this.idleTime = 0;
        const def = Jobs[job];
        if (this.carried.length > 0) this.goTo('toDrop', b.stores[def.to].node, ctx);
        else this.goTo('toPickup', b.stores[def.from].node, ctx, b.stores[def.from].spot?.(this));
        return;
      }
      const site = this.pickDig(ctx, all);
      if (site) {
        this.digId = site.id;
        this.digWalk = 0;
        this.atHome = false;
        this.idleTime = 0;
        const a = site.inside;
        const inside = a && this.x > a.minX && this.x < a.maxX && this.z > a.minZ && this.z < a.maxZ;
        this.path = inside ? [{ x: site.x, z: site.z }] : [...ctx.nav.route(this, site.node), ...(site.via ?? []), { x: site.x, z: site.z }];
        this.setPhase('toDig', 0);
        return;
      }
      if (!this.atHome && this.path.length === 0) {
        this.path = ctx.nav.route(this, ctx.homeNode);
        this.path[this.path.length - 1] = { ...ctx.homeSpot(this.index) };
      }
    }
    this.working = false;
    if (this.path.length > 0) {
      if (this.walk(dt, ctx)) this.atHome = true;
    } else if (this.atHome) {
      this.idleTime += dt;
    }
  }

  private updatePicking(dt: number, ctx: WorkContext): void {
    const job = this.job(ctx);
    if (!job) {
      this.toIdle(ctx);
      return;
    }
    const b = ctx.board;
    const store = b.stores[Jobs[job].from];
    this.timer -= dt;
    this.working = this.timer > 0 && this.carried.length === 0;
    if (this.timer > 0) return;
    this.timer = WorkerFeel.transferInterval;
    if (this.carried.length < this.cap && b.toTake(this) > 0 && store.enabled() && store.takeable() > 0) {
      const item = store.take(this);
      if (item) {
        this.carried.push(item);
        b.took(this);
        return;
      }
    }
    b.doneTaking(this, this.carried.length);
    if (this.carried.length === 0) {
      this.toIdle(ctx); // the player (or the bear) emptied it first: the listing is gone
      return;
    }
    this.waited = 0;
    this.goTo('toDrop', b.stores[Jobs[job].to].node, ctx);
  }

  private updateDropping(dt: number, ctx: WorkContext): void {
    const job = this.job(ctx);
    if (!job || this.carried.length === 0) {
      this.toIdle(ctx);
      return;
    }
    const b = ctx.board;
    const store = b.stores[Jobs[job].to];
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = WorkerFeel.transferInterval;
    const item = this.carried[this.carried.length - 1] as WorkerItem;
    if (store.enabled() && store.room() > 0 && store.accepts(item)) {
      this.carried.pop();
      store.give(item, this);
      b.gave(this);
      ctx.onDeliver?.(this);
      this.waited = 0;
      return;
    }
    // A full destination: wait a little, then look for another one (resume picks a place with room).
    this.waited += WorkerFeel.transferInterval;
    if (this.waited >= WorkerFeel.dropPatience) this.toIdle(ctx);
  }

  /** A bear came for this penguin: run to the hut and hide for `seconds`. */
  scare(seconds: number, ctx: WorkContext): void {
    if (this.phase === 'hiding') return;
    ctx.board.release(this);
    this.fear = seconds;
    this.digId = null;
    this.atHome = false;
    this.idleTime = 0;
    this.working = false;
    this.goTo('hiding', ctx.homeNode, ctx);
  }

  /** Drops the current job (role change): the penguin rethinks at once and keeps what it carries. */
  reset(ctx: WorkContext): void {
    if (this.phase === 'hiding') return;
    this.toIdle(ctx);
    this.atHome = false;
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
      this.toIdle(ctx);
    }
  }

  private updateDigging(dt: number, ctx: WorkContext, all: readonly WorkerBrain[]): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = WorkerFeel.jobCheckInterval;
    if (!ctx.digAlive?.(this.digId ?? -1)) {
      ctx.onDug?.(this);
      this.toIdle(ctx);
      return;
    }
    // Carrying always comes first: drop the shovel as soon as a job is listed.
    if (this.role !== 'sweeper' && ctx.board.claim(this, this.role, this.rolesPresent(all), this.cap)) {
      ctx.board.release(this);
      this.toIdle(ctx);
    }
  }

  private pickDig(ctx: WorkContext, all: readonly WorkerBrain[]): DigSite | null {
    const rule = RoleById[this.role].dig;
    if (!rule || (rule.unlessRole && all.some((w) => w.role === rule.unlessRole))) return null;
    const site = ctx.digSite?.();
    // One shoveler per pile; the others keep to their jobs.
    if (!site || all.some((w) => w !== this && w.digId === site.id)) return null;
    return site;
  }

  private goTo(phase: WorkerPhase, node: PathNodeId, ctx: WorkContext, spot?: Vec2 | null): void {
    this.path = ctx.nav.route(this, node);
    if (spot) this.path.push({ ...spot });
    this.setPhase(phase, 0);
  }

  private setPhase(phase: WorkerPhase, timer: number): void {
    this.phase = phase;
    this.timer = timer;
  }

  private toIdle(ctx: WorkContext): void {
    ctx.board.release(this);
    this.digId = null;
    this.working = false;
    this.path = [];
    this.setPhase('idle', 0);
  }

  /** Follows `path`. Returns true on arrival at its last point. */
  private walk(dt: number, ctx: WorkContext): boolean {
    let step = this.walkSpeed * (this.phase === 'hiding' ? Threats.bear.penguinFleeSpeed : 1) * dt;
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
