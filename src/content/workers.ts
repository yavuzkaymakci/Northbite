// Helpers (GDD §7). Balance values only; waddle/animation feel lives in settings.ts.

export const Workers = {
  penguin: {
    walkSpeed: 2.6, // the player walks at 4.0
    carryCapacity: 3,
    /** What penguins carry (GDD §24): fish, crystals (miners) and platters (cooks). Jobs live in roles.ts. */
    goods: ['fish', 'crystal', 'plate'] as const,
  },
} as const;
