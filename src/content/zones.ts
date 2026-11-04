// World layout data. Units are world units (~1 m). XZ plane, -Z is "north" (top of the screen).
// North and east are sea; the Smokehouse yard lies west behind a tree belt, reached through an ice-walled pass.
// West of the yard a snowy slope rises; avalanches come down it (GDD §13).
import type { UnlockCostKey } from './economy';

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

export type StationId = 'net' | 'hut' | 'smokehouse';

/** Threat buildings (GDD §13); their positions are in `ThreatBuildingSpots`. */
export type BuildingId = 'torchStand' | 'baitTrap' | 'firePit1' | 'firePit2' | 'firePit3' | 'snowFence' | 'watchtower';

/** What an unlock does besides being marked as unlocked. Holes are listed in `IceShore.holes` instead. */
export type UnlockEffect = { kind: 'station'; station: StationId } | { kind: 'worker' } | { kind: 'building'; building: BuildingId };

export interface UnlockZoneDef {
  id: string;
  x: number;
  z: number;
  size: number;
  cost: UnlockCostKey;
  /** Unlock or region ids that must be done before this frame shows up. */
  requires: readonly string[];
  effects: readonly UnlockEffect[];
  /** Optional extras (threat buildings): the guide arrow and the sim bot skip them. */
  optional?: boolean;
}

export interface RegionDef {
  id: string;
  name: { tr: string; en: string };
  cost: UnlockCostKey;
  requires: readonly string[];
  /** Ice wall blocking the way in. It is a collider until the region opens. */
  wall: RectArea & { height: number };
  /** Unlock frame in front of the wall. */
  gate: { x: number; z: number; size: number };
  /** Unlock zones inside the region; they appear (with a bounce) once it opens. */
  unlockZones: readonly string[];
  /** Point the camera visits during the reveal. */
  tour: Vec2;
}

export const IceShore = {
  /** Visible snow/ice slab. Water lies beyond maxX (east) and minZ (north). */
  ground: { minX: -40, maxX: 11, minZ: -12, maxZ: 40 } satisfies RectArea,
  /** Outer limit for walking (includes locked regions; tree belts and walls are colliders inside it). */
  walkBounds: { minX: -25.4, maxX: 10.3, minZ: -11.3, maxZ: 12 } satisfies RectArea,
  waterLevel: -0.45,
  /** In front of the igloo door (the first-start intro begins here). */
  playerSpawn: { x: -4, z: 0.9 } satisfies Vec2,

  igloo: { x: -4, z: -4, radius: 2.3, tunnelLength: 1.6, tunnelWidth: 1.5 },

  /** Ice fishing holes. `unlock` names the unlock zone that reveals it (none = open from the start). */
  holes: [
    { id: 'hole1', x: 2, z: -5, unlock: null },
    { id: 'hole2', x: 6, z: -5.5, unlock: 'hole2' },
    { id: 'hole3', x: -17, z: -8.2, unlock: 'hole3' },
  ],

  /** Sales counter. Player drops fish on the north side, customers queue on the south side. */
  counter: {
    x: 2,
    z: 3.2,
    width: 2.8,
    depth: 0.9,
    dropPoint: { x: 2, z: 2.0 },
    servePoint: { x: 2, z: 4.6 },
    queueSpacing: 1.1,
    coinPile: { x: 4.4, z: 3.2 },
  },

  /** Net on hole 1 and its basket (built by the "net" unlock). */
  net: { hole: 'hole1', basket: { x: -0.5, z: -2.8, radius: 0.45 } },

  /** Rod bench next to the igloo; standing on the pad opens the upgrade panel. */
  bench: { x: -7.6, z: -3.4, width: 1.8, depth: 0.8, pad: { x: -7.6, z: -2.0, radius: 0.9 } },

  /** Penguin hut. Penguins wait at `idle` (door side) when there is nothing to carry. */
  hut: { x: -5.8, z: 7.2, width: 2.4, depth: 2.0, idle: { x: -4.4, z: 9.0 } },

  /** Smokehouse with an input rack (raw) and an output rack (smoked) on its east side. */
  smokehouse: {
    x: -17.4,
    z: -1.5,
    width: 3.4,
    depth: 3.0,
    rack: { width: 0.8, length: 1.6 },
    input: { x: -14.6, z: -2.9 },
    output: { x: -14.6, z: -0.1 },
  },

  customers: {
    spawn: { x: 9.5, z: 13.5 },
    exit: { x: -6, z: 14 },
    seed: 41,
  },

  crates: [
    { x: 8.2, z: 0.8, size: 1.1, stack: 2, rotation: 0.15 },
    { x: 9.3, z: 1.6, size: 1.0, stack: 1, rotation: -0.1 },
    // Slope nook west of the smokehouse yard
    { x: -24.3, z: 0.5, size: 1.0, stack: 2, rotation: 0.2 },
    { x: -24.5, z: -0.6, size: 0.9, stack: 1, rotation: -0.3 },
  ],

  /** Trees inside the walkable area (they get colliders). */
  trees: [
    { x: -8.3, z: -9.2, scale: 1.1 },
    { x: 8.6, z: 8.2, scale: 1.0 },
    { x: -9.0, z: 3.0, scale: 0.9 },
    { x: 7.4, z: -2.5, scale: 0.8 },
    { x: -20.2, z: -9.6, scale: 1.0 },
    { x: -13.4, z: -10.3, scale: 0.85 },
  ],
  treeColliderRadius: 0.55,

  rocks: [
    { x: 7.8, z: -8.6, radius: 0.75 },
    { x: -8.8, z: 10.6, radius: 0.9 },
    { x: 1.5, z: -9.5, radius: 0.55 },
    { x: -20.6, z: -7.4, radius: 0.7 },
    { x: -20.1, z: 3.6, radius: 0.6 },
    { x: -13.6, z: 3.9, radius: 0.5 },
  ],

  /** Dense tree belts inside the walk bounds: solid colliders, filled with decorative pines. */
  treeWalls: [
    { minX: -12.6, maxX: -10.6, minZ: -12, maxZ: -3.0, count: 9 },
    { minX: -12.6, maxX: -10.6, minZ: 0.6, maxZ: 13, count: 11 },
    { minX: -21.6, maxX: -12.6, minZ: 5, maxZ: 13, count: 20 },
    // Around the slope nook (the yard's west edge is open only between these two)
    { minX: -25.8, maxX: -21.0, minZ: -12, maxZ: -9.0, count: 6 },
    { minX: -25.8, maxX: -21.0, minZ: 1.4, maxZ: 13, count: 16 },
  ],

  /** Decorative tree belts outside the walk bounds. `gaps` keep sightlines open (the "coming soon" pass). */
  borderTrees: {
    seed: 7,
    belts: [
      { area: { minX: -29, maxX: -21.6, minZ: -11, maxZ: 24 }, count: 34 },
      { area: { minX: -21.6, maxX: 10.5, minZ: 12.8, maxZ: 24 }, count: 42 },
    ],
    gaps: [
      { minX: 2.4, maxX: 12, minZ: 12, maxZ: 21.5 },
      { minX: -40, maxX: -21, minZ: -12, maxZ: 3.5 }, // the slope
    ] satisfies RectArea[],
  },

  /** Floating ice chunks in the water. */
  floes: { seed: 11, count: 18, minDistFromShore: 1.5, maxDistFromShore: 22 },

  /** Flat ice patches and snow mounds on the ground for texture. */
  icePatches: { seed: 3, count: 14 },
  snowMounds: { seed: 5, count: 22 },
} as const;

/**
 * Threat layout (GDD §13). Bears walk out of the water (`from`) to a spot next to what they raid (`stand`).
 * Avalanches come down the western slope and bury `corridor`, which cuts the yard's north part (hole 3) off.
 */
export const ThreatLayout = {
  bear: {
    approaches: {
      basket: { from: { x: -0.8, z: -17 }, stand: { x: -0.5, z: -4.0 } },
      counter: { from: { x: 16, z: 5.5 }, stand: { x: 4.2, z: 2.2 } },
      smokeOut: { from: { x: -15.6, z: -17 }, stand: { x: -13.4, z: -0.2 } },
    },
    /** Collision radius (smaller than the model so it fits the lane east of the smokehouse racks). */
    radius: 0.6,
    /** Walking between the shore and the yard goes through the pass. */
    pass: [
      { x: -9.4, z: -1.2 },
      { x: -13.6, z: -1.4 },
    ],
  },
  avalanche: {
    corridor: { minX: -25.4, maxX: -12.6, minZ: -5.9, maxZ: -3.9 } satisfies RectArea,
    pileZ: -4.9,
    pileXs: [-24.6, -23.0, -21.4, -19.8, -18.2, -16.6, -15.0, -13.4],
    pileRadius: 1.0,
    /** Helpers shovel the pile nearest to this graph node. */
    digNode: 'smokeIn' as PathNodeId,
    /** The player is pushed to the nearer of these lines; the south one is blocked along the smokehouse and racks. */
    safeNorthZ: -6.6,
    safeSouthZ: -3.2,
    southBlocked: { minX: -19.6, maxX: -13.8 },
    /** Snow fence along the corridor's mouth at the slope foot (outside the walk area). */
    fence: { x: -25.9, minZ: -6.5, maxZ: -3.3 },
  },
  /** Visual slope west of the walk area. */
  slope: { minX: -38, maxX: -25.9, minZ: -12, maxZ: 4 } satisfies RectArea,
} as const;

/** Where each threat building stands (`at`) and where its unlock frame is (`frame`). */
export const ThreatBuildingSpots: Record<BuildingId, { at: Vec2; frame: Vec2 }> = {
  torchStand: { at: { x: 4.8, z: -1.2 }, frame: { x: 4.8, z: -1.2 } },
  baitTrap: { at: { x: -2.4, z: -9.4 }, frame: { x: -2.4, z: -9.4 } },
  firePit1: { at: { x: 5.6, z: 4.6 }, frame: { x: 5.6, z: 4.6 } },
  firePit2: { at: { x: -15.8, z: 3.0 }, frame: { x: -15.8, z: 3.0 } },
  firePit3: { at: { x: -0.6, z: 10.2 }, frame: { x: -0.6, z: 10.2 } },
  snowFence: { at: { x: -25.9, z: -4.9 }, frame: { x: -22.6, z: -2.0 } },
  watchtower: { at: { x: 9.0, z: -4.6 }, frame: { x: 9.0, z: -4.6 } },
};

/** Dashed frames you stand on to pay. Zones listed in a region also need that region open. */
export const UnlockZones: readonly UnlockZoneDef[] = [
  { id: 'hole2', x: 6, z: -5.5, size: 2.2, cost: 'secondHole', requires: [], effects: [] },
  { id: 'net', x: -0.5, z: -2.8, size: 1.8, cost: 'net', requires: ['hole2'], effects: [{ kind: 'station', station: 'net' }] },
  {
    id: 'hut',
    x: -5.8,
    z: 7.2,
    size: 2.2,
    cost: 'hut',
    requires: ['net'],
    effects: [{ kind: 'station', station: 'hut' }, { kind: 'worker' }],
  },
  {
    id: 'smokehouse',
    x: -17,
    z: 1.6,
    size: 2.2,
    cost: 'smokehouse',
    requires: [],
    effects: [{ kind: 'station', station: 'smokehouse' }],
  },
  { id: 'hole3', x: -17, z: -8.2, size: 2.2, cost: 'thirdHole', requires: [], effects: [] },
  { id: 'penguin2', x: -8.4, z: 7.6, size: 1.8, cost: 'secondPenguin', requires: ['smokehouse'], effects: [{ kind: 'worker' }] },
  // Threat buildings (GDD §13): optional, they show up once the smokehouse is open.
  ...(
    [
      ['torchStand', 1.6, ['smokehouse']],
      ['baitTrap', 1.6, ['torchStand']],
      ['firePit1', 1.6, ['torchStand']],
      ['firePit2', 1.6, ['firePit1']],
      ['firePit3', 1.6, ['firePit2']],
      ['snowFence', 1.8, ['smokehouse']],
      ['watchtower', 2.0, ['firePit1']],
    ] as const
  ).map(
    ([id, size, requires]): UnlockZoneDef => ({
      id,
      ...ThreatBuildingSpots[id].frame,
      size,
      cost: id,
      requires,
      effects: [{ kind: 'building', building: id }],
      optional: true,
    }),
  ),
];

export const Regions: readonly RegionDef[] = [
  {
    id: 'smokeYard',
    name: { tr: 'Tütsühane bölgesi', en: 'Smokehouse yard' },
    cost: 'smokeRegion',
    requires: ['hut'],
    wall: { minX: -12.2, maxX: -11.0, minZ: -3.0, maxZ: 0.6, height: 2.6 },
    gate: { x: -9.2, z: -1.2, size: 2.0 },
    unlockZones: ['smokehouse', 'hole3'],
    tour: { x: -15.5, z: -3.2 },
  },
];

/** Walls that do not open in this demo: a teaser for the pier zone behind the southern tree belt. */
export const TeaserWalls = [
  {
    id: 'pier',
    wall: { minX: 3.2, maxX: 7.2, minZ: 12.4, maxZ: 13.4, height: 2.6 },
    sign: { x: 2.4, z: 11.3 },
    silhouette: { x: 4.6, z: 17.2 },
  },
] as const;

/**
 * Waypoint graph for helpers (A*). Edges are straight lines kept clear of colliders; an edge with `gate`
 * is only usable once that region is open.
 */
export const PathGraph = {
  nodes: {
    hut: { x: -4.4, z: 9.0 },
    plaza: { x: -2.6, z: 5.0 },
    mid: { x: -1.5, z: 0.2 },
    counter: { x: 1.0, z: 1.6 },
    basket: { x: -0.5, z: -1.7 },
    west: { x: -7.4, z: 0.0 },
    pass: { x: -9.8, z: -1.2 },
    smokeIn: { x: -13.5, z: -2.8 },
    smokeOut: { x: -13.5, z: -0.2 },
  },
  edges: [
    { a: 'hut', b: 'plaza' },
    { a: 'plaza', b: 'mid' },
    { a: 'mid', b: 'counter' },
    { a: 'mid', b: 'basket' },
    { a: 'basket', b: 'counter' },
    { a: 'mid', b: 'west' },
    { a: 'west', b: 'pass' },
    { a: 'pass', b: 'smokeIn', gate: 'smokeYard' },
    { a: 'pass', b: 'smokeOut', gate: 'smokeYard' },
    { a: 'smokeIn', b: 'smokeOut' },
  ],
} as const;

export type PathNodeId = keyof typeof PathGraph.nodes;
