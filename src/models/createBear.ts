import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { bake } from './bake';
import { flat, mesh } from './materials';

export interface BearModel {
  root: THREE.Group;
  /** Pivot at the hips: tilts back when the bear stands up. */
  body: THREE.Group;
  head: THREE.Group;
  /** Front left, front right, hind left, hind right. Pivots at the top of each leg. */
  legs: THREE.Mesh[];
  /** Where a stolen fish hangs from the mouth (head space). */
  mouth: THREE.Vector3;
}

const HIP = { y: 0.8, z: -0.55 };

/**
 * Big low-poly cream polar bear, ~1.4 tall at the shoulder and ~2.3 long (the player is ~1.8 tall).
 * Faces +Z, origin at the feet. Torso, head and legs are separate so it can walk, sniff and rear up.
 */
export function createBear(): BearModel {
  const root = new THREE.Group();
  root.name = 'bear';
  const fur = flat(Palette.bearFur);
  const shade = flat(Palette.bearShade);
  const dark = flat(Palette.bearNose);

  const body = new THREE.Group();
  body.position.set(0, HIP.y, HIP.z);
  root.add(body);
  const torsoParts = new THREE.Group();
  const torso = mesh(new THREE.IcosahedronGeometry(0.62, 1), fur, 0, 0.18, 0.6);
  torso.scale.set(0.95, 0.85, 1.5);
  const hump = mesh(new THREE.IcosahedronGeometry(0.46, 1), fur, 0, 0.42, 0.95);
  const belly = mesh(new THREE.IcosahedronGeometry(0.5, 1), shade, 0, -0.08, 0.55);
  belly.scale.set(0.9, 0.6, 1.3);
  const tail = mesh(new THREE.IcosahedronGeometry(0.12, 0), shade, 0, 0.2, -0.38);
  torsoParts.add(torso, hump, belly, tail);
  body.add(bake(torsoParts));

  const head = new THREE.Group();
  head.position.set(0, 0.48, 1.42);
  const headParts = new THREE.Group();
  const skull = mesh(new THREE.IcosahedronGeometry(0.32, 1), fur, 0, 0, 0);
  skull.scale.set(0.9, 0.85, 1.1);
  const snout = mesh(new THREE.IcosahedronGeometry(0.17, 1), shade, 0, -0.08, 0.3);
  snout.scale.set(1, 0.8, 1.2);
  const nose = mesh(new THREE.IcosahedronGeometry(0.06, 0), dark, 0, -0.03, 0.49);
  headParts.add(skull, snout, nose);
  for (const side of [-1, 1]) {
    headParts.add(mesh(new THREE.IcosahedronGeometry(0.08, 0), fur, 0.19 * side, 0.24, -0.06));
    headParts.add(mesh(new THREE.IcosahedronGeometry(0.035, 0), dark, 0.12 * side, 0.09, 0.24));
  }
  head.add(bake(headParts));
  body.add(head);

  const legGeo = new THREE.CylinderGeometry(0.17, 0.15, 0.82, 6);
  legGeo.translate(0, -0.41, 0);
  const pawGeo = new THREE.BoxGeometry(0.3, 0.1, 0.36);
  pawGeo.translate(0, -0.8, 0.05);
  const leg = bake(new THREE.Group().add(new THREE.Mesh(legGeo, fur), new THREE.Mesh(pawGeo, shade)));
  const legs: THREE.Mesh[] = [];
  // Front legs hang from the body (they lift when it rears up); hind legs stay on the ground.
  for (const [x, front] of [
    [-0.34, true],
    [0.34, true],
    [-0.34, false],
    [0.34, false],
  ] as const) {
    const l = new THREE.Mesh(leg.geometry, leg.material);
    if (front) {
      l.position.set(x, 0.02, 1.1);
      body.add(l);
    } else {
      l.position.set(x, HIP.y + 0.02, HIP.z);
      root.add(l);
    }
    legs.push(l);
  }
  return { root, body, head, legs, mouth: new THREE.Vector3(0, -0.14, 0.5) };
}

/** Walk cycle, sniffing (head down, bobbing) and rearing up (`rear` 0..1, front paws swiping). */
export function animateBear(m: BearModel, walk: number, phase: number, time: number, sniff: number, rear: number, rearAngle: number): void {
  const swing = Math.sin(phase) * 0.5 * walk;
  const [fl, fr, hl, hr] = m.legs as [THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh];
  m.body.rotation.x = -rear * rearAngle + Math.sin(phase * 2) * 0.03 * walk;
  m.body.rotation.z = Math.sin(phase) * 0.04 * walk;
  const swipe = rear * (0.9 + Math.sin(time * 9) * 0.35);
  fl.rotation.x = swing - swipe;
  fr.rotation.x = -swing - swipe * 0.8;
  hl.rotation.x = -swing * (1 - rear);
  hr.rotation.x = swing * (1 - rear);
  m.head.rotation.x = sniff * (0.5 + Math.sin(time * 10) * 0.1) - rear * 0.35 + Math.sin(time * 1.4) * 0.03;
  m.head.rotation.y = sniff * Math.sin(time * 2.3) * 0.35;
}
