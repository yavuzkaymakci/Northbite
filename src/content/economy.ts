import { DecorationCosts } from './decorations';
import { IglooCosts } from './igloo';
import { LandCosts } from './land';

// Balance values (GDD §8). Fish prices live in content/fish.ts, stations in stations.ts, workers in workers.ts,
// rod upgrades in upgrades.ts. Numbers are tuned with `npm run sim` (tools/balance-sim.ts).

export const Economy = {
  player: {
    walkSpeed: 4.0, // units / second
    carryCapacity: 5, // base; the backpack upgrade raises it (upgrades.ts)
  },
  counter: {
    capacity: 12,
  },
  customers: {
    spawnIntervalMin: 3,
    spawnIntervalMax: 5,
    buyMin: 1,
    buyMax: 3,
    maxQueue: 4,
  },
  /** Prices of unlock zones and region walls (zones.ts refers to these keys). */
  unlocks: {
    secondHole: 25,
    net: 35,
    hut: 65,
    smokeRegion: 125,
    smokehouse: 150,
    thirdHole: 160,
    secondPenguin: 220,
    // Threat buildings (GDD §13); optional, shown once the smokehouse is open.
    torchStand: 40,
    baitTrap: 70,
    firePit1: 90,
    firePit2: 150,
    firePit3: 220,
    snowFence: 120,
    watchtower: 450,
    // Igloo levels and decorations (GDD §14); the numbers live in igloo.ts / decorations.ts.
    ...IglooCosts,
    ...DecorationCosts,
    // Lands (GDD §15); the numbers live in land.ts.
    ...LandCosts,
  },
} as const;

export type UnlockCostKey = keyof typeof Economy.unlocks;
