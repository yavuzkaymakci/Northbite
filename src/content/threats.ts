// Threat balance (GDD §13): how often polar bears and avalanches come, what they cost and what stops them.
// Positions live in zones.ts (ThreatLayout); animation and screen feel in settings.ts (ThreatFeel).
// Frequencies are scaled by Tuning.threatScale (0 = no threats at all).

export const Threats = {
  /** No threat before this much total play time (seconds)... */
  minPlayTime: 15 * 60,
  /** ...and before this unlock is done. */
  requires: 'smokehouse',
  /** Quiet seconds after the game screen opens: a fresh session never starts with a threat. */
  sessionGrace: 90,
  /** Quiet seconds after a threat ends before the next one may start. */
  minGap: 60,

  bear: {
    /** Mean seconds between bears (random arrivals). */
    intervalDay: 12 * 60,
    intervalNight: 7 * 60,
    /** Warning lead time in seconds: normal, at night, and for the very first bear (tutorial). */
    warning: 12,
    warningNight: 8,
    warningFirst: 20,
    walkSpeed: 1.5, // heavy walk (the player walks 4.0)
    fleeSpeed: 3.4,
    sniffTime: 2,
    /** Share of a store the bear runs off with, capped in sale value (a full basket costs at most ~40). */
    stealShare: 0.5,
    maxLoss: 40,
    /** A penguin the bear goes for hides in the hut this long; it keeps the fish it carries. */
    penguinHide: 45,
    penguinScareRange: 2.6,
    penguinFleeSpeed: 1.6, // × penguin walk speed
    /** "Scare": stand this close and hold the screen this long. */
    scareRange: 3,
    scareTime: 1.5,
    reward: { coinsMin: 6, coinsMax: 12, furChance: 0.25 },
  },

  /** Torch stand: free torches; with one, just walking up to the bear scares it fast. */
  torch: { uses: 3, scareTime: 0.5 },
  /** Fire pits (up to 3): each one within `radius` of the bear's target cuts the bear chance; any pit adds warning time. */
  firePit: { radius: 12, chanceMul: 0.6, warningBonus: 5 },
  watchtower: { warningBonus: 10, range: 24 },
  /** A raw fish left in the bait trap keeps the bear busy this long. */
  bait: { delay: 8 },

  avalanche: {
    /** Mean seconds between avalanches. */
    interval: 15 * 60,
    warning: 6,
    /** Seconds next to a pile to shovel it away (player or penguin). */
    digTime: 2,
    /** Piles left alone melt after this long. */
    meltTime: 90,
    chestChance: 0.5,
    chestCoinsMin: 20,
    chestCoinsMax: 40,
  },
} as const;
