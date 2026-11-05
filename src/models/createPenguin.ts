import * as THREE from 'three';
import { WorkerFeel } from '../settings';
import { HeadwearColors, Palette, ScarfColors } from '../render/Palette';
import { bake } from './bake';
import { flat, mesh } from './materials';

export interface PenguinModel {
  root: THREE.Group;
  /** Waddle pivot (rolls side to side, turns for look-arounds). */
  body: THREE.Group;
  flipperL: THREE.Mesh;
  flipperR: THREE.Mesh;
  footL: THREE.Mesh;
  footR: THREE.Mesh;
}

/** Height of the back where carried fish start. */
export const PENGUIN_BACK = { y: 0.5, z: -0.27 };

/** Hat (-1 = none) and scarf colours as indices into Palette.HeadwearColors / ScarfColors (GDD §24). */
export interface PenguinLookColors {
  hat: number;
  scarf: number;
}

/**
 * Low-poly penguin helper, ~0.95 tall (the player is ~1.8). Faces +Z, origin at the feet.
 * Torso, belly, head, eyes, beak, beanie and scarf are baked into one mesh; flippers and feet move.
 */
export function createPenguin(look: PenguinLookColors | null = null): PenguinModel {
  const root = new THREE.Group();
  root.name = 'penguin';
  const body = new THREE.Group();
  root.add(body);

  const parts = new THREE.Group();
  const back = flat(Palette.penguinBack);
  const white = flat(Palette.penguinBelly);
  const torso = mesh(new THREE.IcosahedronGeometry(0.32, 1), back, 0, 0.42, 0);
  torso.scale.set(1, 1.3, 0.92);
  const belly = mesh(new THREE.IcosahedronGeometry(0.27, 1), white, 0, 0.4, 0.1);
  belly.scale.set(0.88, 1.18, 0.75);
  const head = mesh(new THREE.IcosahedronGeometry(0.21, 1), back, 0, 0.84, 0.02);
  const face = mesh(new THREE.IcosahedronGeometry(0.15, 1), white, 0, 0.83, 0.1);
  face.scale.set(1, 0.85, 0.7);
  const beak = mesh(new THREE.ConeGeometry(0.055, 0.16, 4), flat(Palette.penguinBeak), 0, 0.81, 0.27);
  beak.rotation.x = Math.PI / 2;
  parts.add(torso, belly, head, face, beak);
  for (const side of [-1, 1]) {
    parts.add(mesh(new THREE.IcosahedronGeometry(0.035, 0), flat(Palette.eye), 0.08 * side, 0.9, 0.18));
  }
  if (look) {
    // Scarf: a ring at the neck with a tail hanging down the back.
    const scarf = flat(ScarfColors[look.scarf % ScarfColors.length] as number);
    parts.add(mesh(new THREE.CylinderGeometry(0.2, 0.235, 0.08, 8), scarf, 0, 0.67, 0.0));
    const tail = mesh(new THREE.BoxGeometry(0.09, 0.22, 0.04), scarf, 0.09, 0.56, -0.22);
    tail.rotation.x = 0.25;
    parts.add(tail);
    if (look.hat >= 0) {
      // Beanie with a pompom.
      const hat = flat(HeadwearColors[look.hat % HeadwearColors.length] as number);
      const cap = mesh(new THREE.IcosahedronGeometry(0.19, 1), hat, 0, 0.95, 0.0);
      cap.scale.set(1.04, 0.62, 1.04);
      parts.add(cap, mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), hat, 0, 0.92, 0.0));
      parts.add(mesh(new THREE.IcosahedronGeometry(0.055, 0), flat(Palette.snow), 0, 1.07, 0));
    }
  }
  body.add(bake(parts));

  const flipperGeo = new THREE.BoxGeometry(0.06, 0.34, 0.15);
  flipperGeo.translate(0, -0.15, 0); // pivot at the shoulder
  const flipperL = mesh(flipperGeo, back, -0.31, 0.6, 0);
  const flipperR = mesh(flipperGeo, back, 0.31, 0.6, 0);
  body.add(flipperL, flipperR);

  const footGeo = new THREE.BoxGeometry(0.13, 0.05, 0.18);
  const feet = flat(Palette.penguinBeak);
  const footL = mesh(footGeo, feet, -0.11, 0.025, 0.07);
  const footR = mesh(footGeo, feet, 0.11, 0.025, 0.07);
  root.add(footL, footR);
  return { root, body, flipperL, flipperR, footL, footR };
}

/**
 * Waddle: the body rolls side to side and bobs while the feet step; flippers flap when `flap` > 0.
 * `look` turns the body for idle look-arounds.
 */
export function animatePenguin(m: PenguinModel, walk: number, phase: number, time: number, flap: number, look: number): void {
  const roll = Math.sin(phase) * WorkerFeel.waddleRoll * walk + Math.sin(time * 1.3) * 0.02 * (1 - walk);
  m.body.rotation.set(0, look, roll);
  m.body.position.y = Math.abs(Math.cos(phase)) * 0.05 * walk;
  const step = Math.sin(phase) * 0.09 * walk;
  m.footL.position.z = 0.07 + step;
  m.footR.position.z = 0.07 - step;
  const flapAngle = flap * (0.5 + 0.5 * Math.sin(time * 26)) * 1.1;
  const swing = 0.12 + walk * 0.18 + flapAngle;
  m.flipperL.rotation.z = -swing;
  m.flipperR.rotation.z = swing;
}
