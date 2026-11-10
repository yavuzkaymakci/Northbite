// Fish species (GDD §2.1). All fishing balance numbers live here.
import type { PaletteKey } from '../render/Palette';

export type FishId = 'capelin' | 'cod' | 'char' | 'halibut' | 'moonCod' | 'nightChar' | 'glowfish' | 'atlanticHerring' | 'arcticMullet' | 'greenlandShark';
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
  /** Lowest "bait" upgrade level (1 = start) at which this species can bite. */
  baitLevel: number;
  color: PaletteKey;
  bellyColor: PaletteKey;
  /** Model length in world units at kgMax. */
  length: number;
  /** Only bites at night, or only while the aurora shines (GDD §12). Absent = any time. */
  when?: 'night' | 'aurora';
  /** Catching one starts the aurora buff (sales +10% for a minute). */
  auroraBuff?: boolean;
  /**
   * Deep-sea species (GDD §25): brought back by voyages (and the giant fish sign at the pier), never on an ice-hole
   * rod or in the net. No gold or rainbow variants.
   */
  deep?: boolean;
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
    baitLevel: 1,
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
    baitLevel: 1,
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
    baitLevel: 1,
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
    reelTime: 6,
    tugIntervalMin: 1.3,
    tugIntervalMax: 2.3,
    tugStrength: 0.9,
    tugIrregularity: 0.35,
    greenZone: 0.45,
    rarity: 'epic',
    rarityWeight: 2,
    baitLevel: 3,
    color: 'fishHalibut',
    bellyColor: 'fishBellyLight',
    length: 1.3,
  },
  // Night fish: fight like cod / char, worth ~1.5× (GDD §12).
  {
    id: 'moonCod',
    name: { tr: 'Ay morinası', en: 'Moon cod' },
    kgMin: 0.5,
    kgMax: 2,
    pricePerKg: 4.5,
    reelTime: 3,
    tugIntervalMin: 1.6,
    tugIntervalMax: 2.8,
    tugStrength: 0.38,
    tugIrregularity: 0.1,
    greenZone: 0.65,
    rarity: 'uncommon',
    rarityWeight: 18,
    baitLevel: 1,
    color: 'fishMoonCod',
    bellyColor: 'fishBellyLight',
    length: 0.82,
    when: 'night',
  },
  {
    id: 'nightChar',
    name: { tr: 'Gece alabalığı', en: 'Night char' },
    kgMin: 2,
    kgMax: 6,
    pricePerKg: 3.75,
    reelTime: 5,
    tugIntervalMin: 1.1,
    tugIntervalMax: 2,
    tugStrength: 0.6,
    tugIrregularity: 0.15,
    greenZone: 0.55,
    rarity: 'rare',
    rarityWeight: 5,
    baitLevel: 1,
    color: 'fishNightChar',
    bellyColor: 'fishBellyWarm',
    length: 1.0,
    when: 'night',
  },
  {
    id: 'glowfish',
    name: { tr: 'Işık balığı', en: 'Glowfish' },
    kgMin: 0.2,
    kgMax: 0.6,
    pricePerKg: 20,
    reelTime: 1.6,
    tugIntervalMin: 2,
    tugIntervalMax: 3.2,
    tugStrength: 0.2,
    tugIrregularity: 0.2,
    greenZone: 0.7,
    rarity: 'epic',
    rarityWeight: 3,
    baitLevel: 1,
    color: 'fishGlow',
    bellyColor: 'fishBellyLight',
    length: 0.7,
    when: 'aurora',
    auroraBuff: true,
  },
  // Deep-sea species (GDD §25): voyage loot. The fight values are used by the giant fish sign at the pier end.
  {
    id: 'atlanticHerring',
    name: { tr: 'Atlantik ringası', en: 'Atlantic herring' },
    kgMin: 0.4,
    kgMax: 1.4,
    pricePerKg: 10,
    reelTime: 2.4,
    tugIntervalMin: 2,
    tugIntervalMax: 3.2,
    tugStrength: 0.22,
    tugIrregularity: 0.1,
    greenZone: 0.66,
    rarity: 'uncommon',
    rarityWeight: 0,
    baitLevel: 1,
    color: 'fishHerring',
    bellyColor: 'fishBellyLight',
    length: 0.8,
    deep: true,
  },
  {
    id: 'arcticMullet',
    name: { tr: 'Kutup kefali', en: 'Arctic mullet' },
    kgMin: 2,
    kgMax: 6,
    pricePerKg: 3,
    reelTime: 4.5,
    tugIntervalMin: 1.3,
    tugIntervalMax: 2.3,
    tugStrength: 0.48,
    tugIrregularity: 0.2,
    greenZone: 0.58,
    rarity: 'rare',
    rarityWeight: 0,
    baitLevel: 1,
    color: 'fishMullet',
    bellyColor: 'fishBellyWarm',
    length: 1.15,
    deep: true,
  },
  {
    id: 'greenlandShark',
    name: { tr: 'Grönland köpekbalığı', en: 'Greenland shark' },
    kgMin: 40,
    kgMax: 110,
    pricePerKg: 1.1,
    reelTime: 7,
    tugIntervalMin: 1.2,
    tugIntervalMax: 2.4,
    tugStrength: 0.58,
    tugIrregularity: 0.45,
    greenZone: 0.52,
    rarity: 'epic',
    rarityWeight: 0,
    baitLevel: 1,
    color: 'fishShark',
    bellyColor: 'fishBellyLight',
    length: 1.9,
    deep: true,
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
