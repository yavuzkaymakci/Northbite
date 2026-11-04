// Rod upgrades bought at the rod bench (GDD §8). Each has 5 levels; level 1 is the starting state.
// Price of the next level = baseCost × costGrowth^(current level - 1).

export type UpgradeId = 'line' | 'reel' | 'bait' | 'backpack';

export interface UpgradeDef {
  id: UpgradeId;
  name: { tr: string; en: string };
  baseCost: number;
  /** Effect value at levels 1..5 (index 0 = level 1). */
  values: readonly number[];
}

export const UpgradeList: readonly UpgradeDef[] = [
  {
    // Tension ceiling: tug force on the line is divided by this.
    id: 'line',
    name: { tr: 'Sağlam misina', en: 'Strong line' },
    baseCost: 20,
    values: [1, 1.2, 1.4, 1.6, 1.8],
  },
  {
    // Reel progress speed multiplier.
    id: 'reel',
    name: { tr: 'Hızlı makara', en: 'Fast reel' },
    baseCost: 20,
    values: [1, 1.25, 1.5, 1.75, 2],
  },
  {
    // Bite weight multiplier for every species rarer than "common". Halibut needs level 3 (fish.ts baitLevel).
    id: 'bait',
    name: { tr: 'Özel yem', en: 'Special bait' },
    baseCost: 30,
    values: [1, 1.5, 2, 2.5, 3],
  },
  {
    // Player carry capacity.
    id: 'backpack',
    name: { tr: 'Sırt çantası', en: 'Backpack' },
    baseCost: 25,
    values: [5, 6, 7, 8, 10],
  },
];

export const UpgradeCostGrowth = 1.6;
export const UpgradeMaxLevel = 5;

export const UpgradeById: Record<UpgradeId, UpgradeDef> = Object.fromEntries(
  UpgradeList.map((u) => [u.id, u]),
) as Record<UpgradeId, UpgradeDef>;
