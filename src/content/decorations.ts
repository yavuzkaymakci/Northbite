// Decorations (GDD §14): bought on unlock frames, each stands at a fixed spot and gives peace points.
// Prices go through Economy.unlocks (and so priceScale). Models are in models/createDecorations.ts.

export type DecorationId = 'flagpole' | 'doormat' | 'snowman' | 'sled' | 'lanterns' | 'dryingRack' | 'iceSculpture';

export interface DecorationDef {
  id: DecorationId;
  cost: number;
  peace: number;
  /** Unlock or region ids that must be done before its frame shows up. */
  requires: readonly string[];
  /** Where the piece stands (and its frame). `extra` = second part of a pair (lantern posts). */
  at: { x: number; z: number; rot: number };
  extra?: { x: number; z: number; rot: number };
  /** Size of the unlock frame. */
  frame: number;
  /** Glows at night. */
  light: boolean;
}

export const DecorationList: readonly DecorationDef[] = [
  { id: 'flagpole', cost: 20, peace: 1, requires: ['smokehouse'], at: { x: -7.4, z: 4.8, rot: 0 }, frame: 1.4, light: false },
  { id: 'doormat', cost: 15, peace: 1, requires: ['igloo3'], at: { x: -4, z: 0.2, rot: 0 }, frame: 1.2, light: false },
  { id: 'snowman', cost: 30, peace: 2, requires: ['smokehouse'], at: { x: 8.0, z: 4.4, rot: -0.5 }, frame: 1.4, light: false },
  { id: 'sled', cost: 40, peace: 2, requires: ['hole3'], at: { x: -9.4, z: -5.6, rot: 0.4 }, frame: 1.6, light: false },
  {
    id: 'lanterns',
    cost: 60,
    peace: 3,
    requires: ['hole3'],
    at: { x: -0.4, z: 3.8, rot: 0 },
    extra: { x: 0.9, z: -0.5, rot: 0 },
    frame: 1.4,
    light: true,
  },
  { id: 'dryingRack', cost: 80, peace: 3, requires: ['penguin2'], at: { x: -19.4, z: 1.9, rot: 0 }, frame: 1.8, light: true },
  { id: 'iceSculpture', cost: 100, peace: 4, requires: ['igloo4'], at: { x: -6.6, z: -7.4, rot: 0.3 }, frame: 1.6, light: false },
];

export const DecorationCosts = Object.fromEntries(DecorationList.map((d) => [d.id, d.cost])) as Record<DecorationId, number>;
