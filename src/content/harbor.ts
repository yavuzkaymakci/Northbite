// Harbour Pier (GDD §25): the deed, the boat repair, the boat upgrades, the loot rack, seals and the lighthouse.
// Balance values only; positions live in zones.ts (HarborLayout), feel values in settings.ts (HarborFeel).
// Voyage destinations, loot tables and events are in voyages.ts.
import type { FishId } from './fish';

/** Prices of the deed (region wall) and the three boat repair frames. All go through priceScale. */
export const HarborCosts = {
  harbor: 230,
  boatHull: 180,
  boatSail: 220,
  boatCabin: 300,
} as const;

export type BoatUpgradeId = 'boatSpeed' | 'boatCargo' | 'boatCrew' | 'boatLantern';

export interface BoatUpgradeDef {
  id: BoatUpgradeId;
  name: { tr: string; en: string };
  label: { tr: string; en: string };
  /** How `values` read on the card. */
  format: 'percentTime' | 'count' | 'risk';
  baseCost: number;
  growth: number;
  /** Level 1..5 (index 0 = level 1, the repaired boat). */
  values: readonly number[];
}

/** "Boat" tab of the voyage panel: price = base × growth^(level − 1) × priceScale. No permanent loss anywhere. */
export const BoatUpgradeList: readonly BoatUpgradeDef[] = [
  {
    id: 'boatSpeed',
    name: { tr: 'Yeni yelken bezi', en: 'Fresh sailcloth' },
    label: { tr: 'Sefer süresi', en: 'Voyage time' },
    format: 'percentTime',
    baseCost: 390,
    growth: 1.6,
    // Duration multiplier: at most −35%.
    values: [1, 0.92, 0.84, 0.75, 0.65],
  },
  {
    id: 'boatCargo',
    name: { tr: 'Geniş ambar', en: 'Roomy hold' },
    label: { tr: 'Ganimet rafı', en: 'Loot rack' },
    format: 'count',
    baseCost: 330,
    growth: 1.6,
    values: [8, 10, 12, 15, 18],
  },
  {
    id: 'boatCrew',
    name: { tr: 'Ek ranza', en: 'Extra bunks' },
    label: { tr: 'Mürettebat yeri', en: 'Crew places' },
    format: 'count',
    baseCost: 480,
    growth: 1.6,
    values: [1, 1, 2, 2, 3],
  },
  {
    id: 'boatLantern',
    name: { tr: 'Gemi feneri', en: 'Ship lantern' },
    label: { tr: 'Gece gecikme riski', en: 'Night delay risk' },
    format: 'risk',
    baseCost: 280,
    growth: 1.6,
    // Chance that a voyage leaving at night is held up a little (no lantern → small risk; Sv2+ is safe enough).
    values: [0.4, 0, 0, 0, 0],
  },
];

export const BoatUpgradeById = Object.fromEntries(BoatUpgradeList.map((u) => [u.id, u])) as Record<BoatUpgradeId, BoatUpgradeDef>;

export const Boat = {
  /** Boat level = 1 + upgrade levels bought / `levelPerUpgrades` (GDD §25: "boat level 3" turns on auto voyages). */
  levelPerUpgrades: 2,
  /** Auto voyages (repeat the last destination) unlock at this boat level. */
  autoLevel: 3,
  /** A night departure without a lantern may be delayed by this share of the time. */
  nightDelay: 0.2,
} as const;

/** Loot that does not fit on the rack waits in crates on the pier; crates refill the rack, nothing is lost. */
export const LootRack = {
  /** Loot rack capacity comes from the cargo upgrade (BoatUpgradeList → boatCargo). */
  cratesShownMax: 6,
  /** Fish per drawn crate. */
  perCrate: 4,
} as const;

/** Giant fish sign after a return (GDD §25): fished with the normal mini-game, heavier fight; skipping costs nothing. */
export const GiantFish = {
  chance: 0.25,
  /** Seconds the sign stays. */
  stay: 180,
  /** Reel time and tug strength multiplier on top of the species' own. */
  difficulty: 1.45,
  /** Species and weights for the giant catch (kg skewed to the top of the range). */
  pool: { arcticMullet: 70, greenlandShark: 30 } as Partial<Record<FishId, number>>,
  /** Bonus coins on the harbour pile when it is landed. */
  bonusCoins: [30, 60] as const,
} as const;

// ---------- seals (crew, GDD §25 C4) ----------

export type SealRoleId = 'fisher' | 'explorer';

export interface SealRoleDef {
  id: SealRoleId;
  name: { tr: string; en: string };
  info: { tr: string; en: string };
  /** Fisher: more fish per voyage. Explorer: rare fish, treasure and lantern part chances. */
  fishBonus: number;
  rareBonus: number;
  price: number;
}

export const SealRoleList: readonly SealRoleDef[] = [
  { id: 'fisher', name: { tr: 'Balıkçı fok', en: 'Fisher seal' }, info: { tr: 'Ganimet miktarı +%25', en: 'Loot amount +25%' }, fishBonus: 0.25, rareBonus: 0, price: 240 },
  { id: 'explorer', name: { tr: 'Kaşif fok', en: 'Explorer seal' }, info: { tr: 'Nadir ve hazine şansı +%40', en: 'Rare and treasure chance +40%' }, fishBonus: 0, rareBonus: 0.4, price: 280 },
];

export const SealRoleById = Object.fromEntries(SealRoleList.map((r) => [r.id, r])) as Record<SealRoleId, SealRoleDef>;

/** 20 seal names, same index in both languages. */
export const SealNames: { tr: readonly string[]; en: readonly string[] } = {
  tr: ['Bıyık', 'Yosun', 'Lodos', 'Mercan', 'Şapşal', 'Köpükçük', 'Gümüş', 'Dümen', 'Pırıl', 'Midye', 'Zıpkın', 'Bulutçuk', 'Martı', 'Fener', 'Kıyı', 'Pusat', 'Çapa', 'Yelken', 'Damla', 'Uskur'],
  en: ['Whiskers', 'Kelp', 'Squall', 'Coral', 'Goofy', 'Bubbles', 'Silver', 'Rudder', 'Glint', 'Mussel', 'Harpoon', 'Puff', 'Gull', 'Beacon', 'Shore', 'Barnacle', 'Anchor', 'Sail', 'Drop', 'Propeller'],
};

export const SealMarket = {
  /** Seals appear in the Penguin Market's "Seal" tab once the boat is repaired. */
  requires: 'boatCabin',
  offersMin: 2,
  offersMax: 3,
  refreshCooldown: 180,
  /** Each seal after the first costs this much more. */
  growth: 1.35,
  /** Scarf colours: indices into Palette.ScarfColors. */
  scarves: 8,
} as const;

// ---------- lighthouse (season goal, GDD §25 C6) ----------

export const Lighthouse = {
  /** Repair stages; each needs one lantern part and coins (× priceScale). */
  stageCosts: [260, 440, 700, 1000, 1400],
  /** Full repair: permanent sale bonus and peace. */
  saleBonus: 0.03,
  peace: 10,
  /** Northern lights opacity multiplier once it shines (permanent). */
  auroraBoost: 1.6,
} as const;
