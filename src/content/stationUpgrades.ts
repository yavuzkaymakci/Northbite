// Station and time upgrades bought at the rod bench (GDD §18). Like the rod upgrades: 5 levels, level 1 is the
// starting value; the next level costs baseCost × growth^(level − 1) × priceScale. A card shows once `requires`
// (an unlock or region id) is done.

export type StationUpgradeId =
  | 'netSpeed'
  | 'basket'
  | 'penguinSpeed'
  | 'penguinCarry'
  | 'smokeSpeed'
  | 'counter'
  | 'kitchenSpeed'
  | 'tentRent'
  | 'statuette'
  | 'offlineCap'
  | 'offlineRate';

/** Which value an upgrade sets (systems/StationUpgrades.ts reads these). */
export type StationUpgradeTarget =
  | 'netInterval'
  | 'basketCapacity'
  | 'penguinSpeed'
  | 'penguinCarry'
  | 'smokeTime'
  | 'counterCapacity'
  | 'plateTime'
  | 'tentRent'
  | 'statuetteValue'
  | 'offlineCapHours'
  | 'offlineRate';

/** How a value is written on the card. */
export type UpgradeFormat = 'seconds' | 'count' | 'percentOfBase' | 'coinsPerMin' | 'coins' | 'hours' | 'percent';

export interface StationUpgradeDef {
  id: StationUpgradeId;
  tab: 'stations' | 'time';
  name: { tr: string; en: string };
  /** What the numbers mean ("Net interval", ...). */
  label: { tr: string; en: string };
  target: StationUpgradeTarget;
  format: UpgradeFormat;
  baseCost: number;
  growth: number;
  /** Value at levels 1..5 (index 0 = level 1 = the content default). */
  values: readonly number[];
  requires: string | null;
}

export const StationUpgradeList: readonly StationUpgradeDef[] = [
  {
    id: 'netSpeed',
    tab: 'stations',
    name: { tr: 'Hızlı ağ', en: 'Quick net' },
    label: { tr: 'Ağ aralığı', en: 'Net interval' },
    target: 'netInterval',
    format: 'seconds',
    baseCost: 50,
    growth: 1.6,
    values: [6, 5.4, 4.8, 4.2, 3.6],
    requires: 'net',
  },
  {
    id: 'basket',
    tab: 'stations',
    name: { tr: 'Büyük sepet', en: 'Big basket' },
    label: { tr: 'Sepet', en: 'Basket' },
    target: 'basketCapacity',
    format: 'count',
    baseCost: 40,
    growth: 1.6,
    values: [8, 10, 12, 15, 20],
    requires: 'net',
  },
  {
    id: 'penguinSpeed',
    tab: 'stations',
    name: { tr: 'Çevik penguen', en: 'Nimble penguins' },
    label: { tr: 'Penguen hızı', en: 'Penguin speed' },
    target: 'penguinSpeed',
    format: 'percentOfBase',
    baseCost: 70,
    growth: 1.6,
    values: [2.6, 2.9, 3.2, 3.5, 3.9],
    requires: 'hut',
  },
  {
    id: 'penguinCarry',
    tab: 'stations',
    name: { tr: 'Güçlü penguen', en: 'Strong penguins' },
    label: { tr: 'Penguen taşıma', en: 'Penguin carry' },
    target: 'penguinCarry',
    format: 'count',
    baseCost: 90,
    growth: 1.6,
    values: [3, 4, 5, 6, 7],
    requires: 'hut',
  },
  {
    id: 'smokeSpeed',
    tab: 'stations',
    name: { tr: 'Sıcak ocak', en: 'Hot hearth' },
    label: { tr: 'Tütsüleme', en: 'Smoking' },
    target: 'smokeTime',
    format: 'seconds',
    baseCost: 80,
    growth: 1.6,
    values: [4, 3.75, 3.5, 3.25, 3],
    requires: 'smokehouse',
  },
  {
    id: 'counter',
    tab: 'stations',
    name: { tr: 'Geniş tezgâh', en: 'Wide counter' },
    label: { tr: 'Tezgâh', en: 'Counter' },
    target: 'counterCapacity',
    format: 'count',
    baseCost: 45,
    growth: 1.6,
    values: [12, 16, 20, 25, 30],
    requires: null,
  },
  {
    id: 'kitchenSpeed',
    tab: 'stations',
    name: { tr: 'Usta aşçı', en: 'Master cook' },
    label: { tr: 'Tabak süresi', en: 'Platter time' },
    target: 'plateTime',
    format: 'seconds',
    baseCost: 120,
    growth: 1.6,
    values: [5, 4.5, 4, 3.5, 3],
    requires: 'kitchen',
  },
  {
    id: 'tentRent',
    tab: 'stations',
    name: { tr: 'Konforlu çadır', en: 'Cosy tents' },
    label: { tr: 'Çadır kirası', en: 'Tent rent' },
    target: 'tentRent',
    format: 'coinsPerMin',
    baseCost: 150,
    growth: 1.6,
    values: [14, 16, 18, 21, 24],
    requires: 'tent1',
  },
  {
    id: 'statuette',
    tab: 'stations',
    name: { tr: 'İnce oyma', en: 'Fine carving' },
    label: { tr: 'Heykelcik', en: 'Statuette' },
    target: 'statuetteValue',
    format: 'coins',
    baseCost: 140,
    growth: 1.6,
    values: [16, 18, 20, 23, 26],
    requires: 'crystalBench',
  },
  {
    id: 'offlineCap',
    tab: 'time',
    name: { tr: 'Uzun mola', en: 'Long break' },
    label: { tr: 'Çevrimdışı süre', en: 'Offline time' },
    target: 'offlineCapHours',
    format: 'hours',
    baseCost: 100,
    growth: 1.6,
    values: [2, 3, 4, 6, 8],
    requires: 'hut',
  },
  {
    id: 'offlineRate',
    tab: 'time',
    name: { tr: 'Güvenilir kasaba', en: 'Trusty town' },
    label: { tr: 'Çevrimdışı verim', en: 'Offline yield' },
    target: 'offlineRate',
    format: 'percent',
    baseCost: 120,
    growth: 1.6,
    values: [0.5, 0.53, 0.55, 0.58, 0.6],
    requires: 'hut',
  },
];

export const StationUpgradeById = Object.fromEntries(StationUpgradeList.map((u) => [u.id, u])) as Record<StationUpgradeId, StationUpgradeDef>;
