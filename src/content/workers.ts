// Helpers (GDD §7). Balance values only; waddle/animation feel lives in settings.ts.

export const Workers = {
  penguin: {
    walkSpeed: 2.6, // the player walks at 4.0
    carryCapacity: 3,
    /**
     * What penguins carry. Only fish in this demo; crystals, statuettes and platters stay with the player (GDD §15).
     * Hook for later: add 'crystal' / 'smoked→kitchen' jobs to WorkerBrain.pickJob and stores for the land racks.
     */
    goods: ['fish'] as const,
  },
} as const;
