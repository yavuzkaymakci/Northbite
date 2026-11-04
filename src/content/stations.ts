// Production stations (GDD §2, §6). Positions live in zones.ts; transfer feel (radii, intervals) in settings.ts.
import type { FishId } from './fish';

export const Stations = {
  /** Fishing net on hole 1: drops a fish into the basket every `interval` seconds until the basket is full. */
  net: {
    interval: 6,
    /** Species the net can catch; picked by their rarityWeight from fish.ts. */
    pool: ['capelin', 'cod'] as readonly FishId[],
    basketCapacity: 8,
  },
  /** Smokehouse: turns raw fish into smoked fish one at a time. */
  smokehouse: {
    smokeTime: 4,
    inputCapacity: 8,
    outputCapacity: 8,
    /** Smoked value = raw value × this. */
    valueMultiplier: 2.5,
  },
} as const;
