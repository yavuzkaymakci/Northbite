import { Threats as T } from '../content/threats';
import { Tuning } from '../content/tuning';
import { ThreatBuildingSpots, ThreatLayout, type BuildingId, type Vec2 } from '../content/zones';
import type { FishItem, GameState } from '../core/GameState';
import { guardWarningBonus } from './PenguinLogic';

// Visual-free threat rules (GDD §13), shared by the game and the balance sim. No Three.js or DOM here.

export type ThreatKind = 'bear' | 'avalanche';
export type BearTargetId = 'basket' | 'counter' | 'smokeOut' | 'penguin' | 'plates';

export const FIRE_PITS: readonly BuildingId[] = ['firePit1', 'firePit2', 'firePit3'];

/** True once threats may come at all: switched on in the settings, enough play time and the smokehouse is open. */
export function threatsUnlocked(state: GameState): boolean {
  return state.prefs.threats && state.stats.playTime >= T.minPlayTime && state.unlocked.includes(T.requires);
}

/**
 * Decides when the next bear or avalanche starts: random arrivals at the rates in content/threats.ts, scaled by
 * `Tuning.threatScale`. One threat at a time, a quiet gap after each, and a quiet start to every session.
 */
export class ThreatDirector {
  private quiet: number = T.sessionGrace;

  constructor(private readonly rand: () => number = Math.random) {}

  /** Call only while no threat runs. Returns the threat to start now, if any. */
  update(dt: number, state: GameState, night: boolean): ThreatKind | null {
    if (Tuning.threatScale <= 0 || !threatsUnlocked(state)) return null;
    if (this.quiet > 0) {
      this.quiet -= dt;
      return null;
    }
    const bear = 1 / (night ? T.bear.intervalNight : T.bear.intervalDay);
    const avalanche = 1 / T.avalanche.interval;
    if (this.rand() >= (bear + avalanche) * Tuning.threatScale * dt) return null;
    return this.rand() * (bear + avalanche) < bear ? 'bear' : 'avalanche';
  }

  /** A threat ended (or never came): stay quiet for a while. */
  rest(seconds: number = T.minGap): void {
    this.quiet = seconds;
  }
}

/** How much each possible target "smells": fish counts (null = not built). */
export interface BearScents {
  basket: number | null;
  counter: number;
  smokeOut: number | null;
  /** Fish carried by each penguin that is out and about (hiding ones excluded). */
  penguins: readonly number[];
  /** Platters on the camp rack; null when there is no kitchen or a fire pit covers the camp. */
  plates: number | null;
}

/**
 * Where the bear goes: the basket, then the counter, then the smokehouse output rack, then the penguin carrying
 * the most fish, last the camp's platter rack. With nothing to smell it still visits the counter (and leaves).
 */
export function pickBearTarget(s: BearScents): { id: BearTargetId; penguin: number } {
  if (s.basket) return { id: 'basket', penguin: -1 };
  if (s.counter > 0) return { id: 'counter', penguin: -1 };
  if (s.smokeOut) return { id: 'smokeOut', penguin: -1 };
  let best = -1;
  for (let i = 0; i < s.penguins.length; i++) {
    if (best < 0 || (s.penguins[i] as number) > (s.penguins[best] as number)) best = i;
  }
  if (best >= 0) return { id: 'penguin', penguin: best };
  if (s.plates) return { id: 'plates', penguin: -1 };
  return { id: 'counter', penguin: -1 };
}

/** Built fire pits within reach of a point. */
export function pitsNear(state: GameState, p: Vec2): number {
  let n = 0;
  for (const id of FIRE_PITS) {
    if (!state.unlocked.includes(id)) continue;
    const at = ThreatBuildingSpots[id].at;
    if (Math.hypot(at.x - p.x, at.z - p.z) <= T.firePit.radius) n++;
  }
  return n;
}

/** Fire pits near the target scare the bear off before it comes (each one cuts the chance). */
export function bearDeterred(state: GameState, target: Vec2, rand: () => number): boolean {
  return rand() >= Math.pow(T.firePit.chanceMul, pitsNear(state, target));
}

/** Seconds of warning before the bear shows up. */
export function bearWarning(state: GameState, night: boolean): number {
  let w: number = state.stats.bears === 0 ? T.bear.warningFirst : night ? T.bear.warningNight : T.bear.warning;
  if (FIRE_PITS.some((id) => state.unlocked.includes(id))) w += T.firePit.warningBonus;
  if (state.unlocked.includes('watchtower')) w += T.watchtower.warningBonus;
  // Guard penguins (GDD §24): +5 s each, at most two count.
  return w + guardWarningBonus(state);
}

/** Shore point and raid spot for a target; a penguin uses the approach whose shore point is nearest to it. */
export function bearApproach(target: BearTargetId, penguinAt: Vec2 | null): { from: Vec2; stand: Vec2 } {
  const A = ThreatLayout.bear.approaches;
  if (target !== 'penguin' || !penguinAt) return A[target === 'penguin' ? 'counter' : target];
  const list = [A.basket, A.counter, A.smokeOut];
  let best = list[0] as (typeof list)[number];
  for (const a of list) {
    if (Math.hypot(a.from.x - penguinAt.x, a.from.z - penguinAt.z) < Math.hypot(best.from.x - penguinAt.x, best.from.z - penguinAt.z)) best = a;
  }
  return { from: best.from, stand: penguinAt };
}

/** Straight-line route that goes through the yard pass when it crosses between the shore and the yard. */
export function bearRoute(points: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  const inYard = (p: Vec2) => p.x < -11 && p.z > -12;
  for (const p of points) {
    const prev = out[out.length - 1];
    if (prev && inYard(prev) !== inYard(p)) {
      const pass = ThreatLayout.bear.pass;
      out.push(...(inYard(prev) ? [...pass].reverse() : pass));
    }
    out.push({ x: p.x, z: p.z });
  }
  return out;
}

/** Platters the bear grabs from the camp rack: half (rounded up), value-capped like fish. Removes them from `list`. */
export function stealPlates(list: number[], rand: () => number): number[] {
  const fake = list.map((price) => ({ species: 'capelin' as const, kg: 0, kind: 'smoked' as const, price }));
  const stolen = stealFrom(fake, fake.length, rand);
  list.length = 0;
  for (const f of fake) list.push(f.price);
  return stolen.map((f) => f.price);
}

/**
 * The bear's share of a store: half of the fish (rounded up), never more than `maxLoss` in sale value.
 * Only the first `takeable` entries are eligible (the rest are still landing). Removes them from `list`.
 */
export function stealFrom(list: FishItem[], takeable: number, rand: () => number): FishItem[] {
  const want = Math.ceil(takeable * T.bear.stealShare);
  const out: FishItem[] = [];
  let value = 0;
  let pool = takeable;
  for (let tries = 0; out.length < want && pool > 0 && tries < 40; tries++) {
    const i = Math.floor(rand() * pool);
    const item = list[i] as FishItem;
    if (value + item.price > T.bear.maxLoss) {
      if (out.length > 0) break;
      continue;
    }
    list.splice(i, 1);
    pool--;
    out.push(item);
    value += item.price;
  }
  return out;
}

/** Reward for scaring a bear away. */
export function scareReward(rand: () => number): { coins: number; fur: boolean } {
  const r = T.bear.reward;
  return { coins: r.coinsMin + Math.floor(rand() * (r.coinsMax - r.coinsMin + 1)), fur: rand() < r.furChance };
}

/** Coins in the buried chest of an avalanche, or null when this one has none. */
export function rollChest(rand: () => number): number | null {
  const a = T.avalanche;
  if (rand() >= a.chestChance) return null;
  return a.chestCoinsMin + Math.floor(rand() * (a.chestCoinsMax - a.chestCoinsMin + 1));
}
