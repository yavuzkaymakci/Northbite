import { FishSpeciesList, KG_SKEW, type FishSpecies } from '../content/fish';
import { FishingFeel } from '../settings';
import type { FishItem } from '../core/GameState';

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

/** Picks a species by rarity weight (locked species excluded), then a kg skewed toward small fish. */
export function rollFish(rand: () => number = Math.random): HookedFish {
  const pool = FishSpeciesList.filter((f) => !f.locked);
  const total = pool.reduce((sum, f) => sum + f.rarityWeight, 0);
  let r = rand() * total;
  let species = pool[0] as FishSpecies;
  for (const f of pool) {
    r -= f.rarityWeight;
    if (r <= 0) {
      species = f;
      break;
    }
  }
  const size01 = Math.pow(rand(), KG_SKEW);
  const kg = Math.round((species.kgMin + (species.kgMax - species.kgMin) * size01) * 100) / 100;
  return {
    item: { species: species.id, kg, price: fishPrice(species, kg) },
    species,
    size01,
    difficulty: 1 + FishingFeel.kgDifficulty * size01,
  };
}
