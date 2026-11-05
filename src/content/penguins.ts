// Penguins as characters (GDD §24): names, traits, levels, looks, prices, the hut's capacity and the Penguin
// Market. Balance values only; roles live in roles.ts, feel values in settings.ts (MarketFeel). Colours are indices
// into Palette.ScarfColors / Palette.HeadwearColors (the player's scarf and hat colours).
import type { RoleId } from './roles';

/** 40 names, same index in both languages (a penguin keeps its name when the language changes). */
export const PenguinNames: { tr: readonly string[]; en: readonly string[] } = {
  tr: [
    'Paytak', 'Pırpır', 'Fındık', 'Kartopu', 'Mısır', 'Boncuk', 'Tombik', 'Çakıl', 'Pamuk', 'Zıpzıp',
    'Minnoş', 'Lokum', 'Kuzgun', 'Bulut', 'Poyraz', 'Kaşif', 'Leylek', 'Fıstık', 'Köpük', 'Çıtır',
    'Badem', 'Sincap', 'Tarçın', 'Buzik', 'Yıldız', 'Pofuduk', 'Sakız', 'Patik', 'Mavi', 'Dalga',
    'Kestane', 'Gofret', 'Çörek', 'Pusula', 'Zeytin', 'Kayık', 'Ponpon', 'Hamsi', 'Rüzgâr', 'Tosun',
  ],
  en: [
    'Waddle', 'Flapjack', 'Hazel', 'Snowball', 'Popcorn', 'Bead', 'Chubby', 'Pebble', 'Cotton', 'Hopper',
    'Minnow', 'Fudge', 'Raven', 'Cloud', 'Gale', 'Scout', 'Stilts', 'Peanut', 'Foam', 'Crispy',
    'Almond', 'Squirrel', 'Cinnamon', 'Icicle', 'Star', 'Fluffy', 'Gumdrop', 'Slipper', 'Blue', 'Wave',
    'Chestnut', 'Wafer', 'Biscuit', 'Compass', 'Olive', 'Dinghy', 'Pompom', 'Sprat', 'Breeze', 'Bruno',
  ],
};

export type TraitId = 'fast' | 'strong' | 'diligent' | 'balanced' | 'cute';

export interface TraitDef {
  id: TraitId;
  name: { tr: string; en: string };
  /** What it does, for the market card. */
  info: { tr: string; en: string };
  /** Walk speed multiplier, carry change, experience multiplier, peace points (GDD §14). */
  speed: number;
  carry: number;
  xp: number;
  peace: number;
  /** Market price multiplier. */
  price: number;
}

export const TraitList: readonly TraitDef[] = [
  { id: 'fast', name: { tr: 'Hızlı', en: 'Quick' }, info: { tr: '+%20 hız, −1 taşıma', en: '+20% speed, −1 carry' }, speed: 1.2, carry: -1, xp: 1, peace: 0, price: 1.1 },
  { id: 'strong', name: { tr: 'Güçlü', en: 'Strong' }, info: { tr: '+1 taşıma, −%15 hız', en: '+1 carry, −15% speed' }, speed: 0.85, carry: 1, xp: 1, peace: 0, price: 1.1 },
  { id: 'diligent', name: { tr: 'Çalışkan', en: 'Diligent' }, info: { tr: 'Deneyim +%50', en: 'Experience +50%' }, speed: 1, carry: 0, xp: 1.5, peace: 0, price: 1.05 },
  { id: 'balanced', name: { tr: 'Dengeli', en: 'Steady' }, info: { tr: 'Artısı da eksisi de yok', en: 'No ups, no downs' }, speed: 1, carry: 0, xp: 1, peace: 0, price: 1 },
  { id: 'cute', name: { tr: 'Sevimli', en: 'Cute' }, info: { tr: 'Huzur +1', en: 'Peace +1' }, speed: 1, carry: 0, xp: 1, peace: 1, price: 1 },
];

export const TraitById = Object.fromEntries(TraitList.map((t) => [t.id, t])) as Record<TraitId, TraitDef>;

export const PenguinLevels = {
  max: 5,
  /** Total experience needed for levels 1..5 (index 0 = level 1). */
  xpFor: [0, 40, 110, 220, 380],
  /** Walk speed bonus per level above 1 (+4%). */
  speedPerLevel: 0.04,
  /** Experience per piece delivered (fish, platter, crystal, bait), per snow pile cleared. */
  xpPerItem: 1,
  xpPerPile: 4,
  /** Lowest carry after traits (a quick penguin still carries something). */
  minCarry: 1,
} as const;

/** Looks: hat colour (-1 = no hat) and scarf colour, as indices into the Palette lists. */
export const PenguinLooks = {
  hats: 6, // Palette.HeadwearColors
  scarves: 8, // Palette.ScarfColors
  /** Chance of no hat at all. */
  noHatChance: 0.3,
} as const;

/** Hut capacity per hut level (GDD §24) and the price of each upgrade (index 0 = level 1, free with the hut). */
export const Hut = {
  capacity: [2, 3, 4, 5],
  upgradeCost: [0, 300, 380, 560],
} as const;

export const Market = {
  /** Unlock frame for the stall next to the hut. */
  stallCost: 40,
  /** Offers in the catalog (3 or 4, distinct roles while there are enough of them). */
  offersMin: 3,
  offersMax: 4,
  /** Free "Refresh" button cooldown (real seconds while playing). The catalog also refreshes every game day. */
  refreshCooldown: 180,
  /** Changing a penguin's role. */
  roleChangeFee: 25,
  /**
   * Price = role price × trait multiplier × count multiplier × priceScale. The first `cheapCount` penguins (the
   * free one from the hut included) cost the base; after that each one costs `growth` times more.
   */
  cheapCount: 3,
  growth: 1.45,
} as const;

/** The free penguin that comes with the hut. */
export const FirstPenguin: { role: RoleId } = { role: 'carrier' };
