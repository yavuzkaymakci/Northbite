import * as THREE from 'three';
import { defaultAppearance, type Appearance, type BeardStyle, type Headwear } from '../content/appearance';
import { BeardColors, HeadwearColors, JacketColors, Palette, ScarfColors, SkinTones } from '../render/Palette';
import { flat, mesh, uniqueFlat } from './materials';
import { createBeanie, createCollar, createFurHat, createHood, createLongBeard, createScarf, createShortBeard } from './createPlayerParts';

export type { Appearance } from '../content/appearance';
export { defaultAppearance } from '../content/appearance';

export interface PlayerModel {
  root: THREE.Group;
  /** Rotates with the walk bob; everything visible hangs from here. */
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Group;
  materials: {
    skin: THREE.MeshStandardMaterial;
    jacket: THREE.MeshStandardMaterial;
    scarf: THREE.MeshStandardMaterial;
    headwear: THREE.MeshStandardMaterial;
    beard: THREE.MeshStandardMaterial;
  };
  /** Every swappable part, built once; `applyAppearance` toggles visibility. */
  parts: {
    headwear: Record<Exclude<Headwear, 'none'>, THREE.Group>;
    beard: Record<Exclude<BeardStyle, 'none'>, THREE.Group>;
    scarf: THREE.Group;
    collar: THREE.Group;
  };
}

function pick<T>(list: readonly T[], index: number): T {
  return list[((index % list.length) + list.length) % list.length] as T;
}

/** Low-poly segmented fisher. Faces +Z. Origin at the feet. */
export function createPlayer(appearance: Appearance = defaultAppearance): PlayerModel {
  const materials = {
    skin: uniqueFlat(SkinTones[0]),
    jacket: uniqueFlat(JacketColors[0]),
    scarf: uniqueFlat(ScarfColors[0]),
    headwear: uniqueFlat(HeadwearColors[0]),
    beard: uniqueFlat(BeardColors[0]),
  };
  const pants = flat(Palette.pants);
  const boots = flat(Palette.boots);
  const eye = flat(Palette.eye);
  // Mittens used to share the scarf color; with "no scarf" possible they get a fixed knit color.
  const mittens = flat(Palette.woodDark);

  const root = new THREE.Group();
  root.name = 'player';
  const body = new THREE.Group();
  root.add(body);

  // Legs pivot at the hip so they can swing.
  const makeLeg = (side: number): THREE.Group => {
    const leg = new THREE.Group();
    leg.position.set(0.15 * side, 0.52, 0);
    leg.add(mesh(new THREE.BoxGeometry(0.22, 0.42, 0.24), pants, 0, -0.22, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.26, 0.14, 0.34), boots, 0, -0.45, 0.04));
    body.add(leg);
    return leg;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // Torso: slightly tapered puffy jacket.
  body.add(mesh(new THREE.CylinderGeometry(0.31, 0.4, 0.66, 7), materials.jacket, 0, 0.84, 0));
  // Jacket hem
  body.add(mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.08, 7), materials.jacket, 0, 0.53, 0));
  const scarf = createScarf(materials.scarf);
  const collar = createCollar(materials.jacket);
  body.add(scarf, collar);

  // Arms pivot at the shoulder.
  const makeArm = (side: number): THREE.Group => {
    const arm = new THREE.Group();
    arm.position.set(0.4 * side, 1.08, 0);
    const sleeve = mesh(new THREE.BoxGeometry(0.17, 0.5, 0.19), materials.jacket, 0, -0.24, 0);
    arm.add(sleeve);
    arm.add(mesh(new THREE.IcosahedronGeometry(0.11, 0), mittens, 0, -0.52, 0));
    arm.rotation.z = 0.12 * side;
    body.add(arm);
    return arm;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // Head
  const head = new THREE.Group();
  head.position.set(0, 1.47, 0);
  body.add(head);
  head.add(mesh(new THREE.IcosahedronGeometry(0.27, 1), materials.skin));
  head.add(mesh(new THREE.BoxGeometry(0.05, 0.07, 0.04), eye, -0.09, 0.03, 0.245));
  head.add(mesh(new THREE.BoxGeometry(0.05, 0.07, 0.04), eye, 0.09, 0.03, 0.245));
  const nose = mesh(new THREE.ConeGeometry(0.045, 0.1, 4), materials.skin, 0, -0.03, 0.29);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);

  const parts: PlayerModel['parts'] = {
    headwear: { beanie: createBeanie(materials.headwear), furHat: createFurHat(materials.headwear), hood: createHood(materials.jacket) },
    beard: { short: createShortBeard(materials.beard), long: createLongBeard(materials.beard) },
    scarf,
    collar,
  };
  for (const g of Object.values(parts.headwear)) head.add(g);
  for (const g of Object.values(parts.beard)) head.add(g);

  const model: PlayerModel = { root, body, legL, legR, armL, armR, head, materials, parts };
  applyAppearance(model, appearance);
  return model;
}

/** Recolors and swaps parts in place (no new meshes or materials). */
export function applyAppearance(model: PlayerModel, a: Appearance): void {
  const m = model.materials;
  m.skin.color.set(pick(SkinTones, a.skinTone));
  m.jacket.color.set(pick(JacketColors, a.jacketColor));
  m.headwear.color.set(pick(HeadwearColors, a.headwearColor));
  m.beard.color.set(pick(BeardColors, a.beardColor));
  const hasScarf = a.scarfColor >= 0;
  if (hasScarf) m.scarf.color.set(pick(ScarfColors, a.scarfColor));
  model.parts.scarf.visible = hasScarf;
  model.parts.collar.visible = !hasScarf;
  for (const [id, g] of Object.entries(model.parts.headwear)) g.visible = id === a.headwear;
  for (const [id, g] of Object.entries(model.parts.beard)) g.visible = id === a.beard;
}

/** Upper-body overrides used while fishing. */
export interface PlayerPose {
  /** 0 = arms swing freely, 1 = both arms held forward on the rod. */
  armsForward: number;
  /** Extra arm raise (radians) for the cast swing. */
  armRaise: number;
  /** Body lean in radians; negative leans back (reeling). */
  lean: number;
}

export const neutralPose: PlayerPose = { armsForward: 0, armRaise: 0, lean: 0 };

/** Where the right mitten sits in body space; the rod is attached here. */
export const HAND_POSITION = { x: 0.36, y: 0.84, z: 0.42 } as const;

/**
 * Walk/idle animation. `walk` is 0..1 (how fast relative to max), `phase` advances with distance walked.
 */
export function animatePlayer(model: PlayerModel, walk: number, phase: number, time: number, pose: PlayerPose = neutralPose): void {
  const swing = Math.sin(phase) * 0.7 * walk;
  const hold = pose.armsForward;
  const forward = -1.05 - pose.armRaise;
  model.legL.rotation.x = swing;
  model.legR.rotation.x = -swing;
  model.armL.rotation.x = -swing * 0.8 * (1 - hold) + (forward + 0.2) * hold;
  model.armR.rotation.x = swing * 0.8 * (1 - hold) + forward * hold;
  model.armL.rotation.z = -0.12 + 0.35 * hold; // bring the left hand toward the rod
  model.armR.rotation.z = 0.12 - 0.1 * hold;

  const bob = Math.abs(Math.sin(phase)) * 0.06 * walk;
  const breathe = Math.sin(time * 2.2) * 0.012 * (1 - walk);
  model.body.position.y = bob + breathe;
  model.body.rotation.x = 0.08 * walk + pose.lean; // lean into the walk / back while reeling
  model.head.rotation.z = Math.sin(phase) * 0.04 * walk;
}
