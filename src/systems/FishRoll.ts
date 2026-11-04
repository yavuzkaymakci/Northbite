import { FishById, FishSpeciesList, KG_SKEW, type FishId, type FishSpecies } from '../content/fish';
import { FishingFeel } from '../settings';
import type { FishItem } from '../core/GameState';
import { NO_MODS, type FishingMods } from './Upgrades';

export interface HookedFish {
  item: FishItem;
  species: FishSpecies;
  /** 0..1 position of kg inside the species' range. */
  size01: number;
  /** Multiplier (≥1) applied to reel time and tug strength. */
  difficulty: number;
}

export function fishPrice(species: FishSpecies, kg: number): number {
  return Math.max(1, Math.round(kg * species.pricePerKg));
}

function pickWeighted(pool: readonly FishSpecies[], weight: (f: FishSpecies) => number, rand: () => number): FishSpecies {
  const total = pool.reduce((sum, f) => sum + weight(f), 0);
  let r = rand() * total;
  for (const f of pool) {
    r -= weight(f);
    if (r <= 0) return f;
  }
  return pool[pool.length - 1] as FishSpecies;
}

/** A raw fish of a species with kg skewed toward small fish. */
export function makeFish(species: FishSpecies, rand: () => number = Math.random): HookedFish {
  const size01 = Math.pow(rand(), KG_SKEW);
  const kg = Math.round((species.kgMin + (species.kgMax - species.kgMin) * size01) * 100) / 100;
  return {
    item: { species: species.id, kg, kind: 'raw', price: fishPrice(species, kg) },
    species,
    size01,
    difficulty: 1 + FishingFeel.kgDifficulty * size01,
  };
}

/**
 * Picks a species for a rod bite by rarity weight, then its kg. Species whose `baitLevel` is above the current
 * bait level are never in the pool; the bait upgrade also multiplies the weight of every non-common species.
 */
export function rollFish(rand: () => number = Math.random, mods: FishingMods = NO_MODS): HookedFish {
  const pool = FishSpeciesList.filter((f) => f.baitLevel <= mods.baitLevel);
  const species = pickWeighted(pool, (f) => f.rarityWeight * (f.rarity === 'common' ? 1 : mods.bigFishWeight), rand);
  return makeFish(species, rand);
}

/** Fish for a net: only the given species, by their plain rarity weight. */
export function rollFrom(ids: readonly FishId[], rand: () => number = Math.random): FishItem {
  const pool = ids.map((id) => FishById[id]);
  return makeFish(pickWeighted(pool, (f) => f.rarityWeight, rand), rand).item;
}
