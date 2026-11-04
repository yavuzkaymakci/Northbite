// Balance values (GDD §8). Starting numbers, to be tuned.

export const Economy = {
  player: {
    walkSpeed: 4.0, // units / second
    carryCapacity: 5,
    fishTime: 2.0, // seconds per fish, per hole
  },
  fish: {
    rawPrice: 3,
    smokedPrice: 8,
    smokeTime: 4,
  },
  customers: {
    spawnIntervalMin: 3,
    spawnIntervalMax: 5,
    buyMin: 1,
    buyMax: 3,
  },
  unlocks: {
    secondHole: 30,
    counterCapacity: 50,
    firstPenguin: 75,
    smokehouse: 200,
  },
  upgradeGrowth: 1.15,
} as const;
