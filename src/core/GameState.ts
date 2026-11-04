import type { FishId } from '../content/fish';

/** One fish as plain data. Price is fixed at catch time. */
export interface FishItem {
  species: FishId;
  kg: number;
  price: number;
}

/** Everything about progress that gets saved. Pure JSON, no Three.js objects. */
export interface GameState {
  coins: number;
  /** Coins lying on the pile next to the counter, not yet picked up. */
  pile: number;
  carried: FishItem[];
  counter: FishItem[];
  unlocked: string[];
  /** Coins already poured into unlock zones that are not finished yet. */
  unlockPaid: Record<string, number>;
  stats: { caught: number; sold: number; reels: number };
}

export function createGameState(): GameState {
  return {
    coins: 0,
    pile: 0,
    carried: [],
    counter: [],
    unlocked: [],
    unlockPaid: {},
    stats: { caught: 0, sold: 0, reels: 0 },
  };
}
