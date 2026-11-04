import type { FishId } from '../content/fish';
import { TimeOfDay } from '../content/time';
import type { UpgradeId } from '../content/upgrades';

export type ItemKind = 'raw' | 'smoked';

/** One fish as plain data (raw or smoked). `price` is its current sale value, fixed when it was made. */
export interface FishItem {
  species: FishId;
  kg: number;
  kind: ItemKind;
  price: number;
}

export interface SmokerState {
  input: FishItem[];
  output: FishItem[];
  /** 0..1 progress of the fish being smoked (the first one in `input`). */
  progress: number;
}

/** A helper's saved data. Positions are not saved; helpers start at their hut. */
export interface WorkerData {
  carried: FishItem[];
}

/**
 * Everything about progress that gets saved. Pure JSON, no Three.js objects.
 * Station contents are plain lists so offline earnings (Demo 4) can be computed from rates in content/.
 */
export interface GameState {
  coins: number;
  /** Coins lying on the pile next to the counter, not yet picked up. */
  pile: number;
  carried: FishItem[];
  counter: FishItem[];
  unlocked: string[];
  /** Opened regions (their ice walls are broken). */
  regions: string[];
  /** Coins already poured into unlock zones that are not finished yet. */
  unlockPaid: Record<string, number>;
  /** Fish waiting in the net's basket. */
  basket: FishItem[];
  smoker: SmokerState;
  workers: WorkerData[];
  /** Upgrade levels, 1..5. */
  upgrades: Record<UpgradeId, number>;
  /** Species caught at least once (drives the "New species!" card). */
  seen: FishId[];
  stats: { caught: number; sold: number; reels: number };
  /** In-game clock: day number (from 1) and time of day 0..1 (0 = dawn). Only runs while the game is open. */
  clock: { day: number; t: number };
  /** Running totals for the day summary card; reset every morning. */
  today: DayTotals;
  /** Seconds left on timed buffs. */
  buffs: { aurora: number };
}

export interface DayTotals {
  coins: number;
  caught: number;
  sold: number;
}

export function createGameState(): GameState {
  return {
    coins: 0,
    pile: 0,
    carried: [],
    counter: [],
    unlocked: [],
    regions: [],
    unlockPaid: {},
    basket: [],
    smoker: { input: [], output: [], progress: 0 },
    workers: [],
    upgrades: { line: 1, reel: 1, bait: 1, backpack: 1 },
    seen: [],
    stats: { caught: 0, sold: 0, reels: 0 },
    clock: { day: 1, t: TimeOfDay.startAt },
    today: { coins: 0, caught: 0, sold: 0 },
    buffs: { aurora: 0 },
  };
}

/** True once an unlock zone or a region with this id is done. */
export function isDone(state: GameState, id: string): boolean {
  return state.unlocked.includes(id) || state.regions.includes(id);
}
