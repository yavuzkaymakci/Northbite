// Voyages (GDD §25 C3): destinations, loot tables and events. Data only; systems/VoyageLogic.ts reads it (game,
// offline formula and balance sim). Durations are real seconds; they also run while the game is closed.
import type { FishId } from './fish';

export type DestinationId = 'reef' | 'iceberg' | 'wreck' | 'farIsland';

export interface DestinationDef {
  id: DestinationId;
  name: { tr: string; en: string };
  /** One line on the card. */
  info: { tr: string; en: string };
  /** Real seconds out at sea (before the speed upgrade and events). */
  duration: number;
  /** Supplies paid when leaving (× priceScale). */
  cost: number;
  /** Voyages already completed before this destination opens (null = locked teaser in this demo). */
  unlockAfter: number | null;
  /** Fish brought back: a whole number between these (before seals and events). */
  fish: readonly [number, number];
  /** Species weights for the catch. */
  pool: Partial<Record<FishId, number>>;
  /** Treasure chest chance (0..1, the wreck always has one) and its coins. */
  treasure: number;
  treasureCoins: readonly [number, number];
  /** Lantern part chance (1 = guaranteed). */
  part: number;
  /** Rare bait chance (seconds of rare bait, GDD §19). */
  bait: number;
  /** Treasure may hold a decoration piece (pays half of the cheapest open decoration frame). */
  decorChance: number;
  /** The wreck's treasure holds a journal page once. */
  page?: boolean;
}

export const Destinations: readonly DestinationDef[] = [
  {
    id: 'reef',
    name: { tr: 'Sığ Resif', en: 'Shallow Reef' },
    info: { tr: 'Orta ve nadir balık, Atlantik ringası', en: 'Medium and rare fish, Atlantic herring' },
    duration: 240,
    cost: 20,
    unlockAfter: 0,
    fish: [8, 11],
    pool: { atlanticHerring: 48, cod: 30, char: 20, halibut: 2 },
    treasure: 0.6,
    treasureCoins: [60, 90],
    part: 0.1,
    bait: 0.15,
    decorChance: 0,
  },
  {
    id: 'iceberg',
    name: { tr: 'Buzdağı Kenarı', en: 'Iceberg Edge' },
    info: { tr: 'Büyük balıklar, kalkan şansı, Kutup kefali', en: 'Big fish, halibut chance, Arctic mullet' },
    duration: 360,
    cost: 35,
    unlockAfter: 1,
    fish: [9, 12],
    pool: { arcticMullet: 46, char: 30, halibut: 18, atlanticHerring: 4, greenlandShark: 2 },
    treasure: 0.7,
    treasureCoins: [90, 140],
    part: 0.15,
    bait: 0.1,
    decorChance: 0,
  },
  {
    id: 'wreck',
    name: { tr: 'Batık Gemi', en: 'Sunken Ship' },
    info: { tr: 'Hazine kasası ve fener parçası', en: 'A treasure chest and a lantern part' },
    duration: 480,
    cost: 50,
    unlockAfter: 2,
    fish: [6, 8],
    pool: { atlanticHerring: 40, arcticMullet: 40, greenlandShark: 5, halibut: 15 },
    treasure: 1,
    treasureCoins: [160, 240],
    part: 1,
    bait: 0.2,
    decorChance: 0.3,
    page: true,
  },
  {
    id: 'farIsland',
    name: { tr: 'Uzak Ada', en: 'Far Island' },
    info: { tr: 'Fener onarılınca… Yakında', en: 'Once the lighthouse shines… Coming soon' },
    duration: 600,
    cost: 80,
    unlockAfter: null,
    fish: [6, 8],
    pool: { arcticMullet: 50, greenlandShark: 10, halibut: 40 },
    treasure: 0.5,
    treasureCoins: [80, 140],
    part: 0,
    bait: 0.3,
    decorChance: 0,
  },
];

export const DestinationById = Object.fromEntries(Destinations.map((d) => [d.id, d])) as Record<DestinationId, DestinationDef>;

export type VoyageEventId = 'storm' | 'scrape' | 'current' | 'gulls';

/** Things that happen at sea. Never a permanent loss: the boat always comes back. */
export const VoyageEvents: Record<VoyageEventId, { weight: number; timeMul: number; lootMul: number; extraFish: number }> = {
  storm: { weight: 30, timeMul: 1.25, lootMul: 1, extraFish: 0 },
  scrape: { weight: 25, timeMul: 1, lootMul: 0.85, extraFish: 0 },
  current: { weight: 25, timeMul: 0.8, lootMul: 1, extraFish: 0 },
  gulls: { weight: 20, timeMul: 1, lootMul: 1, extraFish: 2 },
};

export const VoyageRules = {
  /** Chance that a voyage meets an event. */
  eventChance: 0.35,
  /** Rare bait found at sea (seconds, GDD §19). */
  baitSeconds: 120,
  /**
   * While the game is closed the active voyage still finishes. Auto voyages may start again from the time left,
   * at most this many more times (keeps the offline share in check, GDD §25 C11).
   */
  offlineAutoVoyages: 1,
  /** Kg within a species leans to the heavy end on deep-sea catches (0..1 bonus to the size roll). */
  deepSizeBonus: 0.15,
} as const;
