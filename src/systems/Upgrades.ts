import { scaledPrice } from '../content/tuning';
import { UpgradeById, UpgradeCostGrowth, UpgradeMaxLevel, type UpgradeId } from '../content/upgrades';
import type { GameState } from '../core/GameState';
import { restedBuff, saleBonuses } from './Rest';
import { RareBait } from '../content/codex';

/** Effect value of an upgrade at a level (1..5). */
export function upgradeValue(id: UpgradeId, level: number): number {
  const values = UpgradeById[id].values;
  return values[Math.min(Math.max(level, 1), values.length) - 1] as number;
}

/** Price of the next level, or null at max level. */
export function upgradeCost(id: UpgradeId, level: number): number | null {
  if (level >= UpgradeMaxLevel) return null;
  return scaledPrice(UpgradeById[id].baseCost * Math.pow(UpgradeCostGrowth, level - 1));
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
  /** Night fish can bite. */
  night: boolean;
  /** Aurora-only fish can bite. */
  aurora: boolean;
}

/** Time and weather the fishing roll depends on (GDD §12). */
export interface FishingEnv {
  night: boolean;
  aurora: boolean;
  /** Extra weight multiplier for non-common species (storm). */
  rareBonus: number;
}

export const DAY_ENV: FishingEnv = { night: false, aurora: false, rareBonus: 1 };

export const NO_MODS: FishingMods = { lineStrength: 1, reelSpeed: 1, bigFishWeight: 1, baitLevel: 1, night: false, aurora: false };

export function fishingMods(state: GameState, env: FishingEnv = DAY_ENV): FishingMods {
  const u = state.upgrades;
  const rested = restedBuff(state);
  return {
    lineStrength: upgradeValue('line', u.line),
    reelSpeed: upgradeValue('reel', u.reel) * (1 + rested.reel),
    // Rare bait (encyclopedia / order reward) adds to the big fish chance while it lasts.
    bigFishWeight: upgradeValue('bait', u.bait) * env.rareBonus * (1 + rested.rare) * (state.codex.rareBait > 0 ? 1 + RareBait.bigFishBonus : 1),
    baitLevel: u.bait,
    night: env.night,
    aurora: env.aurora,
  };
}

/** Sale value multiplier from timed buffs (aurora, well rested), capped; peace tips come on top (Rest.payout). */
export function saleMultiplier(state: GameState): number {
  return 1 + saleBonuses(state).buff;
}

/** Backpack level plus the "well rested" bonus. */
export function carryCapacity(state: GameState): number {
  return upgradeValue('backpack', state.upgrades.backpack) + restedBuff(state).carry;
}
