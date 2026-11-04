import { UpgradeById, UpgradeCostGrowth, UpgradeMaxLevel, type UpgradeId } from '../content/upgrades';
import type { GameState } from '../core/GameState';

/** Effect value of an upgrade at a level (1..5). */
export function upgradeValue(id: UpgradeId, level: number): number {
  const values = UpgradeById[id].values;
  return values[Math.min(Math.max(level, 1), values.length) - 1] as number;
}

/** Price of the next level, or null at max level. */
export function upgradeCost(id: UpgradeId, level: number): number | null {
  if (level >= UpgradeMaxLevel) return null;
  return Math.round(UpgradeById[id].baseCost * Math.pow(UpgradeCostGrowth, level - 1));
}

/** Modifiers the fishing mini-game reads from the upgrade levels. */
export interface FishingMods {
  /** Tug force is divided by this (strong line). */
  lineStrength: number;
  /** Reel progress multiplier (fast reel). */
  reelSpeed: number;
  /** Bite weight multiplier for non-common species (special bait). */
  bigFishWeight: number;
  /** Current bait level; species with a higher `baitLevel` never bite. */
  baitLevel: number;
}

export const NO_MODS: FishingMods = { lineStrength: 1, reelSpeed: 1, bigFishWeight: 1, baitLevel: 1 };

export function fishingMods(state: GameState): FishingMods {
  const u = state.upgrades;
  return {
    lineStrength: upgradeValue('line', u.line),
    reelSpeed: upgradeValue('reel', u.reel),
    bigFishWeight: upgradeValue('bait', u.bait),
    baitLevel: u.bait,
  };
}

export function carryCapacity(state: GameState): number {
  return upgradeValue('backpack', state.upgrades.backpack);
}
