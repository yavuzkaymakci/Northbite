// Fish encyclopedia (GDD §19): rare colour variants and the one-time collection rewards.
// Species texts are in strings.ts (codex_{id}); species data stays in fish.ts.

export type VariantId = 'gold' | 'rainbow';

/** Variants change only the look and the value, never the mini-game. Rolled on rod catches. */
export const Variants: Record<VariantId, { chance: number; valueMul: number; nightAuroraOnly: boolean }> = {
  gold: { chance: 0.005, valueMul: 5, nightAuroraOnly: false },
  rainbow: { chance: 0.003, valueMul: 8, nightAuroraOnly: true },
};

export type CodexRewardId = 'species3' | 'species5' | 'speciesAll' | 'firstGold' | 'firstRainbow';

/** Collection rewards, each given once. Coins go through priceScale. */
export const CodexRewards: Record<CodexRewardId, { species?: number; variant?: VariantId; coins?: number; title?: boolean; rareBait?: number; decoration?: string }> = {
  species3: { species: 3, coins: 10 },
  species5: { species: 5, title: true, rareBait: 120 },
  speciesAll: { species: 7, decoration: 'fishWeight' },
  firstGold: { variant: 'gold', coins: 50 },
  firstRainbow: { variant: 'rainbow', coins: 75 },
};

/** Rare bait (codex reward, orders): while it lasts, non-common species bite this much more often. */
export const RareBait = {
  bigFishBonus: 0.25,
};
