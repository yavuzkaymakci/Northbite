// Balance values (GDD §8). Starting numbers, to be tuned. Fish prices live in content/fish.ts.

export const Economy = {
  player: {
    walkSpeed: 4.0, // units / second
    carryCapacity: 5,
  },
  counter: {
    capacity: 12,
  },
  fish: {
    smokedPrice: 8,
    smokeTime: 4,
  },
  customers: {
    spawnIntervalMin: 3,
    spawnIntervalMax: 5,
    buyMin: 1,
    buyMax: 3,
    maxQueue: 4,
  },
  unlocks: {
    secondHole: 30,
    counterCapacity: 50,
    firstPenguin: 75,
    smokehouse: 200,
  },
  upgradeGrowth: 1.15,
} as const;
