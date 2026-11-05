// Igloo levels, sleep and the "Well rested" buff, and the peace score (GDD §14).
// Positions live in zones.ts (IceShore.igloo / IceShore.bed); fade and hold times in settings.ts (SleepFeel).

export interface IglooLevelDef {
  level: number;
  radius: number;
  tunnelLength: number;
  tunnelWidth: number;
  /** Sleep quality the bed gives at this level (1..4). */
  quality: number;
  /** Peace points the igloo itself gives. */
  peace: number;
}

export const IglooLevels: readonly IglooLevelDef[] = [
  { level: 1, radius: 2.3, tunnelLength: 1.6, tunnelWidth: 1.5, quality: 1, peace: 0 },
  { level: 2, radius: 2.4, tunnelLength: 1.6, tunnelWidth: 1.5, quality: 2, peace: 2 },
  { level: 3, radius: 2.6, tunnelLength: 1.7, tunnelWidth: 1.6, quality: 3, peace: 4 },
  { level: 4, radius: 2.75, tunnelLength: 1.7, tunnelWidth: 1.6, quality: 4, peace: 6 },
];

/** Upgrade prices (unlock frame next to the igloo). Targets: level 2 ~8 min, 3 ~18 min, 4 ~32 min. */
export const IglooCosts = {
  igloo2: 60,
  igloo3: 150,
  igloo4: 500,
} as const;

/** "Well rested" buff per sleep quality (index 0 = quality 1). Bonuses add up with other buffs. */
export const RestedBuffs = [
  { sale: 0.03, reel: 0, carry: 0, rare: 0 },
  { sale: 0.06, reel: 0.05, carry: 0, rare: 0 },
  { sale: 0.09, reel: 0.08, carry: 1, rare: 0 },
  { sale: 0.12, reel: 0.12, carry: 2, rare: 0.1 },
] as const;

export const Sleep = {
  /** Sleeping is possible from this time of day (late evening) until dawn. */
  from: 0.64,
  /** Time of day the player wakes up at. */
  wakeAt: 0.03,
};

/** Peace (GDD §14): each point adds a small tip to every sale, up to `maxTip`. */
export const Peace = {
  tipPerPoint: 0.0025,
  maxTip: 0.05,
};
