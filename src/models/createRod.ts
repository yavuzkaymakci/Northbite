import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { flat, mesh } from './materials';

export interface RodModel {
  /** Pivot at the hand. The rod points along local +Y; rotate X to pitch it forward. */
  root: THREE.Group;
  /** Chained segments; rotating each a little on X bends the rod. */
  segments: THREE.Group[];
  tip: THREE.Object3D;
  reel: THREE.Group;
}

export function createRod(length: number, segmentCount = 3): RodModel {
  const root = new THREE.Group();
  root.name = 'rod';
  const rodMat = flat(Palette.rod);

  // Handle below the hand + reel on the side.
  root.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.3, 5), flat(Palette.woodDark), 0, -0.05, 0));
  const reel = new THREE.Group();
  reel.position.set(0.07, 0.05, 0);
  const drum = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 7), flat(Palette.reel));
  drum.rotation.z = Math.PI / 2;
  reel.add(drum);
  reel.add(mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), flat(Palette.reel), 0.03, 0.04, 0));
  root.add(reel);

  const segments: THREE.Group[] = [];
  const segLen = length / segmentCount;
  let parent: THREE.Object3D = root;
  for (let i = 0; i < segmentCount; i++) {
    const seg = new THREE.Group();
    seg.position.y = i === 0 ? 0.1 : segLen;
    const r0 = 0.03 * (1 - i / segmentCount) + 0.008;
    const r1 = 0.03 * (1 - (i + 1) / segmentCount) + 0.008;
    seg.add(mesh(new THREE.CylinderGeometry(r1, r0, segLen, 4), rodMat, 0, segLen / 2, 0));
    parent.add(seg);
    segments.push(seg);
    parent = seg;
  }
  const tip = new THREE.Object3D();
  tip.position.y = segLen;
  parent.add(tip);

  return { root, segments, tip, reel };
}
