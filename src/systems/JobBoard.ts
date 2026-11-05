import { Jobs, RoleById, type JobId, type RoleId, type StoreId } from '../content/roles';
import type { PathNodeId, Vec2 } from '../content/zones';
import type { WorkerItem } from '../core/GameState';

// Job board (GDD §24): stations post listings (what can move from where to where, right now), penguins claim the
// best listing for their role, and a reservation keeps two penguins off the same pieces or the same free places.
// Listings are worked out from the live stock every time, so when the player takes the fish first the listing simply
// shrinks: the penguin arrives, finds less (or nothing) and goes on; nothing is counted twice.
// Pure logic: the game and the balance sim plug their own stores in.

/** Who claims jobs (WorkerBrain); kept minimal so the board does not depend on the brain. */
export interface JobWorker {
  readonly x: number;
  readonly z: number;
}

/** A place goods are taken from or brought to. The game adds flights; the sim moves items at once. */
export interface WorkStore {
  /** Graph node where a penguin stands to use it. */
  readonly node: PathNodeId;
  enabled(): boolean;
  /** Pieces a penguin may take right now. */
  takeable(): number;
  take(w: JobWorker): WorkerItem | null;
  /** Free places right now. */
  room(): number;
  give(item: WorkerItem, w: JobWorker): void;
  /** Goods this store takes in (used to finish a delivery after a reload or a role change). */
  accepts(item: WorkerItem): boolean;
  /** Exact spot to walk to after the node (a crystal vein), or null for the node itself. */
  spot?(w: JobWorker): Vec2 | null;
  /** Source-side claim (a vein is worked by one penguin at a time): pieces claimed for this worker (0 = none). */
  claim?(w: JobWorker): number;
  release?(w: JobWorker): void;
}

export type Stores = Record<StoreId, WorkStore>;

interface Reservation {
  job: JobId;
  /** Pieces still to take at the source / to give at the destination. */
  take: number;
  give: number;
}

export class JobBoard {
  private readonly res = new Map<JobWorker, Reservation>();

  constructor(readonly stores: Stores) {}

  /** Pieces at a source nobody has claimed yet. */
  avail(id: StoreId): number {
    const s = this.stores[id];
    if (!s.enabled()) return 0;
    let n = s.takeable();
    for (const r of this.res.values()) if (Jobs[r.job].from === id) n -= r.take;
    return n;
  }

  /** Free places at a destination nobody has claimed yet. */
  room(id: StoreId): number {
    const s = this.stores[id];
    if (!s.enabled()) return 0;
    let n = s.room();
    for (const r of this.res.values()) if (Jobs[r.job].to === id) n -= r.give;
    return n;
  }

  /** Open listings right now (debug view). */
  listings(): Array<{ job: JobId; amount: number }> {
    return (Object.keys(Jobs) as JobId[])
      .map((job) => ({ job, amount: Math.min(this.avail(Jobs[job].from), this.room(Jobs[job].to)) }))
      .filter((l) => l.amount > 0);
  }

  jobOf(w: JobWorker): JobId | null {
    return this.res.get(w)?.job ?? null;
  }

  /** Claimed pieces left to take (the brain stops picking at 0). */
  toTake(w: JobWorker): number {
    return this.res.get(w)?.take ?? 0;
  }

  /**
   * The best listing for this role (its jobs in priority order; a job marked `unlessRole` is skipped while a penguin
   * with that role exists). Reserves up to `cap` pieces and the same number of places. Returns the job or null.
   */
  claim(w: JobWorker, role: RoleId, present: ReadonlySet<RoleId>, cap: number): JobId | null {
    this.release(w);
    for (const rj of RoleById[role].jobs) {
      if (rj.unlessRole && present.has(rj.unlessRole)) continue;
      const job = Jobs[rj.job];
      let n = Math.min(cap, job.max ?? Infinity, this.avail(job.from), this.room(job.to));
      if (n <= 0) continue;
      const from = this.stores[job.from];
      if (from.claim) {
        n = Math.min(n, from.claim(w));
        if (n <= 0) {
          from.release?.(w);
          continue;
        }
      }
      this.res.set(w, { job: rj.job, take: n, give: n });
      return rj.job;
    }
    return null;
  }

  /**
   * Goods already on the back (after a reload, a role change, a scare): a destination that takes them and has room,
   * the role's own jobs first. Null = nowhere to go right now.
   */
  resume(w: JobWorker, role: RoleId, items: readonly WorkerItem[]): JobId | null {
    this.release(w);
    const first = items[0];
    if (!first) return null;
    const own = RoleById[role].jobs.map((j) => j.job);
    const all = [...own, ...(Object.keys(Jobs) as JobId[]).filter((j) => !own.includes(j))];
    for (const id of all) {
      const to = this.stores[Jobs[id].to];
      if (!to.accepts(first) || this.room(Jobs[id].to) <= 0) continue;
      this.res.set(w, { job: id, take: 0, give: items.length });
      return id;
    }
    return null;
  }

  /** A piece came off the source. */
  took(w: JobWorker): void {
    const r = this.res.get(w);
    if (r) r.take = Math.max(r.take - 1, 0);
  }

  /** A piece went into the destination. */
  gave(w: JobWorker): void {
    const r = this.res.get(w);
    if (r) r.give = Math.max(r.give - 1, 0);
  }

  /** Picking ended: free whatever was not taken (the places stay claimed only for what is carried). */
  doneTaking(w: JobWorker, carried: number): void {
    const r = this.res.get(w);
    if (!r) return;
    r.take = 0;
    r.give = carried;
    this.stores[Jobs[r.job].from].release?.(w);
  }

  release(w: JobWorker): void {
    const r = this.res.get(w);
    if (!r) return;
    this.stores[Jobs[r.job].from].release?.(w);
    this.res.delete(w);
  }
}
