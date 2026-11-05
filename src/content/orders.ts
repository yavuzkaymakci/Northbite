// Order board (GDD §20). Orders reward 1.5–2× the normal sale value, never punish, and only ask for what the
// player can make right now. Coin rewards go through priceScale.

export type OrderKind = 'raw' | 'smoked' | 'kg' | 'species' | 'plates' | 'statuettes' | 'golden' | 'night';
export type OrderExtra = 'rareBait' | 'fur' | 'decorPiece' | 'pageHint';

export interface OrderTemplate {
  kind: OrderKind;
  /** Pick weight in the pool. */
  weight: number;
  /** Amount range (pieces, or kg for 'kg'). */
  min: number;
  max: number;
  /** Unlock / region ids needed before this kind can appear. */
  requires: readonly string[];
  /** Reward = expected sale value × this. */
  rewardMul: number;
  /** Chance of a bonus item on top of the coins. */
  extraChance: number;
  /** Real seconds the order stays (range). */
  durationMin: number;
  durationMax: number;
}

export const OrderTemplates: readonly OrderTemplate[] = [
  { kind: 'raw', weight: 4, min: 3, max: 6, requires: [], rewardMul: 1.5, extraChance: 0.05, durationMin: 600, durationMax: 1200 },
  { kind: 'kg', weight: 3, min: 2, max: 5, requires: [], rewardMul: 1.6, extraChance: 0.08, durationMin: 600, durationMax: 1200 },
  { kind: 'species', weight: 3, min: 1, max: 3, requires: [], rewardMul: 1.8, extraChance: 0.15, durationMin: 600, durationMax: 1200 },
  { kind: 'smoked', weight: 3, min: 3, max: 6, requires: ['smokehouse'], rewardMul: 1.6, extraChance: 0.1, durationMin: 600, durationMax: 1200 },
  { kind: 'plates', weight: 2, min: 2, max: 4, requires: ['kitchen'], rewardMul: 1.7, extraChance: 0.15, durationMin: 600, durationMax: 1200 },
  { kind: 'statuettes', weight: 2, min: 2, max: 3, requires: ['crystalBench'], rewardMul: 1.8, extraChance: 0.2, durationMin: 600, durationMax: 1200 },
  { kind: 'night', weight: 1, min: 1, max: 1, requires: ['smokehouse'], rewardMul: 2, extraChance: 0.4, durationMin: 1500, durationMax: 1800 },
  { kind: 'golden', weight: 0.5, min: 1, max: 1, requires: ['hole3'], rewardMul: 2, extraChance: 0.6, durationMin: 1800, durationMax: 2400 },
];

export const Orders = {
  slots: 3,
  /** Seconds until an empty slot gets a new order. */
  refillMin: 60,
  refillMax: 120,
  /** "Swap one order" button: free, then this many seconds to wait. */
  rerollCooldown: 180,
  /** The very first order teaches the board: an easy one. */
  first: { kind: 'raw' as OrderKind, amount: 2 },
  /** Bonus items, picked by weight when an order rolls an extra. */
  extras: [
    { id: 'rareBait' as OrderExtra, weight: 3, rareBaitSeconds: 120 },
    { id: 'fur' as OrderExtra, weight: 2, rareBaitSeconds: 0 },
    { id: 'decorPiece' as OrderExtra, weight: 2, rareBaitSeconds: 0 },
    { id: 'pageHint' as OrderExtra, weight: 1, rareBaitSeconds: 0 },
  ],
  /** Share of the decoration frame paid by a decoration piece. */
  decorPieceShare: 0.5,
  /** Price of the board's unlock frame. */
  boardCost: 30,
} as const;
