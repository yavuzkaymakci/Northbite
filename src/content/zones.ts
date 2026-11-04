// World layout data. Units are world units (~1 m). XZ plane, -Z is "north" (top of the screen).

export interface Vec2 {
  x: number;
  z: number;
}

export interface RectArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const IceShore = {
  /** Visible snow/ice slab. Water lies beyond maxX (east) and minZ (north). */
  ground: { minX: -40, maxX: 11, minZ: -12, maxZ: 40 } satisfies RectArea,
  /** Where the player may walk. East/north edges stop at the water; west/south at the tree line. */
  walkBounds: { minX: -10.5, maxX: 10.3, minZ: -11.3, maxZ: 12 } satisfies RectArea,
  waterLevel: -0.45,
  playerSpawn: { x: 0, z: 2 } satisfies Vec2,

  igloo: { x: -4, z: -4, radius: 2.3, tunnelLength: 1.6, tunnelWidth: 1.5 },

  crates: [
    { x: 4.2, z: 3.2, size: 1.1, stack: 2, rotation: 0.15 },
    { x: 5.5, z: 3.0, size: 1.0, stack: 1, rotation: -0.1 },
  ],

  /** Trees inside the walkable area (they get colliders). */
  trees: [
    { x: -8.3, z: -9.2, scale: 1.1 },
    { x: 8.2, z: 9.4, scale: 1.0 },
    { x: -9.0, z: 3.0, scale: 0.9 },
    { x: 7.4, z: -2.5, scale: 0.8 },
  ],
  treeColliderRadius: 0.55,

  rocks: [
    { x: 7.8, z: -8.6, radius: 0.75 },
    { x: -7.6, z: 9.0, radius: 0.9 },
    { x: 1.5, z: -9.5, radius: 0.55 },
  ],

  /** Decorative tree belts outside the walk bounds (west and south). */
  borderTrees: {
    seed: 7,
    west: { area: { minX: -18, maxX: -11.3, minZ: -11, maxZ: 24 }, count: 34 },
    south: { area: { minX: -11, maxX: 10.5, minZ: 12.8, maxZ: 24 }, count: 30 },
  },

  /** Floating ice chunks in the water. */
  floes: { seed: 11, count: 18, minDistFromShore: 1.5, maxDistFromShore: 22 },

  /** Flat ice patches and snow mounds on the ground for texture. */
  icePatches: { seed: 3, count: 10 },
  snowMounds: { seed: 5, count: 22 },
} as const;
