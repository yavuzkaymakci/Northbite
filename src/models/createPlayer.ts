import * as THREE from 'three';
import { BeardColors, HeadwearColors, JacketColors, Palette, ScarfColors, SkinTones } from '../render/Palette';
import { flat, mesh, uniqueFlat } from './materials';

export type Headwear = 'beanie' | 'furHat' | 'hood';
export type BeardStyle = 'none' | 'short' | 'long';

/** Saved as plain JSON. Colors are indices into the Palette option lists. */
export interface Appearance {
  name: string;
  skinTone: number;
  jacketColor: number;
  headwear: Headwear;
  headwearColor: number;
  beard: BeardStyle;
  beardColor: number;
  scarfColor: number;
}

export const defaultAppearance: Appearance = {
  name: '',
  skinTone: 1,
  jacketColor: 0,
  headwear: 'beanie',
  headwearColor: 0,
  beard: 'short',
  beardColor: 0,
  scarfColor: 1,
};

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
}

function pick<T>(list: readonly T[], index: number): T {
  return list[((index % list.length) + list.length) % list.length] as T;
}

/** Low-poly segmented fisher. Faces +Z. Origin at the feet. */
export function createPlayer(appearance: Appearance = defaultAppearance): PlayerModel {
  const materials = {
    skin: uniqueFlat(pick(SkinTones, appearance.skinTone)),
    jacket: uniqueFlat(pick(JacketColors, appearance.jacketColor)),
    scarf: uniqueFlat(pick(ScarfColors, appearance.scarfColor)),
    headwear: uniqueFlat(pick(HeadwearColors, appearance.headwearColor)),
    beard: uniqueFlat(pick(BeardColors, appearance.beardColor)),
  };
  const pants = flat(Palette.pants);
  const boots = flat(Palette.boots);
  const eye = flat(Palette.eye);

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
  // Scarf ring + tail
  body.add(mesh(new THREE.CylinderGeometry(0.27, 0.32, 0.14, 8), materials.scarf, 0, 1.2, 0));
  const tail = mesh(new THREE.BoxGeometry(0.12, 0.34, 0.06), materials.scarf, 0.12, 1.02, -0.3);
  tail.rotation.z = 0.15;
  body.add(tail);

  // Arms pivot at the shoulder.
  const makeArm = (side: number): THREE.Group => {
    const arm = new THREE.Group();
    arm.position.set(0.4 * side, 1.08, 0);
    const sleeve = mesh(new THREE.BoxGeometry(0.17, 0.5, 0.19), materials.jacket, 0, -0.24, 0);
    arm.add(sleeve);
    arm.add(mesh(new THREE.IcosahedronGeometry(0.11, 0), materials.scarf, 0, -0.52, 0));
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

  if (appearance.beard === 'short') {
    head.add(mesh(new THREE.BoxGeometry(0.36, 0.14, 0.18), materials.beard, 0, -0.17, 0.13));
  } else if (appearance.beard === 'long') {
    head.add(mesh(new THREE.BoxGeometry(0.36, 0.12, 0.18), materials.beard, 0, -0.15, 0.13));
    const point = mesh(new THREE.ConeGeometry(0.17, 0.36, 5), materials.beard, 0, -0.33, 0.17);
    point.rotation.x = Math.PI;
    head.add(point);
  }

  switch (appearance.headwear) {
    case 'beanie': {
      head.add(mesh(new THREE.CylinderGeometry(0.22, 0.29, 0.22, 8), materials.headwear, 0, 0.18, -0.01));
      head.add(mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.08, 8), materials.headwear, 0, 0.09, -0.01));
      head.add(mesh(new THREE.IcosahedronGeometry(0.08, 0), flat(Palette.snow), 0, 0.33, -0.01));
      break;
    }
    case 'furHat': {
      const fur = flat(Palette.fur);
      head.add(mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.3, 8), fur, 0, 0.2, -0.01));
      head.add(mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.08, 8), materials.headwear, 0, 0.36, -0.01));
      const flapL = mesh(new THREE.BoxGeometry(0.08, 0.24, 0.2), fur, -0.29, 0.0, -0.02);
      const flapR = mesh(new THREE.BoxGeometry(0.08, 0.24, 0.2), fur, 0.29, 0.0, -0.02);
      head.add(flapL, flapR);
      break;
    }
    case 'hood': {
      const hood = mesh(new THREE.IcosahedronGeometry(0.34, 1), materials.jacket, 0, 0.03, -0.09);
      head.add(hood);
      const trim = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10, 1, true), flat(Palette.fur), 0, 0.02, 0.17);
      trim.rotation.x = Math.PI / 2;
      head.add(trim);
      break;
    }
  }

  return { root, body, legL, legR, armL, armR, head, materials };
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
