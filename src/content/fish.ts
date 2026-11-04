// Fish species (GDD §2.1). All fishing balance numbers live here.
import type { PaletteKey } from '../render/Palette';

export type FishId = 'capelin' | 'cod' | 'char' | 'halibut';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

export interface FishSpecies {
  id: FishId;
  name: { tr: string; en: string };
  kgMin: number;
  kgMax: number;
  pricePerKg: number;
  /** Seconds of continuous green-zone holding to land the fish (before kg difficulty). */
  reelTime: number;
  tugIntervalMin: number;
  tugIntervalMax: number;
  /** Tension added by a tug while holding (0..1 scale). Above ~0.5 a held tug breaks the line. */
  tugStrength: number;
  /** 0..1 random spread of tug strength (irregular fighters). */
  tugIrregularity: number;
  /** Upper edge of the green tension zone (0..1). */
  greenZone: number;
  rarity: Rarity;
  rarityWeight: number;
  /** Not catchable yet (needs a rod upgrade). */
  locked: boolean;
  color: PaletteKey;
  bellyColor: PaletteKey;
  /** Model length in world units at kgMax. */
  length: number;
}

export const FishSpeciesList: readonly FishSpecies[] = [
  {
    id: 'capelin',
    name: { tr: 'Kapelin', en: 'Capelin' },
    kgMin: 0.05,
    kgMax: 0.2,
    pricePerKg: 15,
    reelTime: 1.25,
    tugIntervalMin: 2.5,
    tugIntervalMax: 4,
    tugStrength: 0.08,
    tugIrregularity: 0,
    greenZone: 0.75,
    rarity: 'common',
    rarityWeight: 65,
    locked: false,
    color: 'fishCapelin',
    bellyColor: 'fishBellyLight',
    length: 0.62,
  },
  {
    id: 'cod',
    name: { tr: 'Kutup morinası', en: 'Polar cod' },
    kgMin: 0.5,
    kgMax: 2,
    pricePerKg: 3,
    reelTime: 3,
    tugIntervalMin: 1.6,
    tugIntervalMax: 2.8,
    tugStrength: 0.38,
    tugIrregularity: 0.1,
    greenZone: 0.65,
    rarity: 'uncommon',
    rarityWeight: 28,
    locked: false,
    color: 'fishCod',
    bellyColor: 'fishBellyLight',
    length: 0.82,
  },
  {
    id: 'char',
    name: { tr: 'Kutup alabalığı', en: 'Arctic char' },
    kgMin: 2,
    kgMax: 6,
    pricePerKg: 2.5,
    reelTime: 5,
    tugIntervalMin: 1.1,
    tugIntervalMax: 2,
    tugStrength: 0.6,
    tugIrregularity: 0.15,
    greenZone: 0.55,
    rarity: 'rare',
    rarityWeight: 7,
    locked: false,
    color: 'fishChar',
    bellyColor: 'fishBellyWarm',
    length: 1.0,
  },
  {
    id: 'halibut',
    name: { tr: 'Grönland kalkanı', en: 'Greenland halibut' },
    kgMin: 8,
    kgMax: 20,
    pricePerKg: 2,
    reelTime: 8,
    tugIntervalMin: 0.6,
    tugIntervalMax: 1.6,
    tugStrength: 0.95,
    tugIrregularity: 0.5,
    greenZone: 0.45,
    rarity: 'epic',
    rarityWeight: 2,
    locked: true,
    color: 'fishHalibut',
    bellyColor: 'fishBellyLight',
    length: 1.3,
  },
];

export const FishById: Record<FishId, FishSpecies> = Object.fromEntries(
  FishSpeciesList.map((f) => [f.id, f]),
) as Record<FishId, FishSpecies>;

/** Bias toward small fish within a species: kg = min + (max - min) * r^kgSkew. */
export const KG_SKEW = 1.6;

export const RarityColor: Record<Rarity, PaletteKey> = {
  common: 'rarityCommon',
  uncommon: 'rarityUncommon',
  rare: 'rarityRare',
  epic: 'rarityEpic',
};
