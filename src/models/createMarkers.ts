import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { flat, mesh } from './materials';

export const COIN_THICKNESS = 0.055;

/** Flat round coin. Origin at its center. */
export function createCoinGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.16, 0.16, COIN_THICKNESS, 10);
}

/** Bouncing guide arrow pointing down. Origin at the tip. */
export function createGuideArrow(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'guide-arrow';
  const m = flat(Palette.guideArrow, { roughness: 0.5 });
  const head = mesh(new THREE.ConeGeometry(0.32, 0.5, 4), m, 0, 0.25, 0);
  head.rotation.x = Math.PI;
  g.add(head);
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.45, 0.2), m, 0, 0.7, 0));
  return g;
}

export interface UnlockFrameModel {
  root: THREE.Group;
  /** Scaled on Z from 0..1 to show payment progress (grows from the south edge). */
  fill: THREE.Mesh;
}

/** Dashed square frame on the ground with a fill that grows as coins are poured in. */
export function createUnlockFrame(size: number): UnlockFrameModel {
  const root = new THREE.Group();
  root.name = 'unlock-frame';

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(size, 0.02, size),
    new THREE.MeshBasicMaterial({ color: Palette.shadowBlue, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  base.position.y = 0.015;
  root.add(base);

  // Fill pivots on the south edge so scaling Z grows it northward.
  const fillPivot = new THREE.Group();
  fillPivot.position.set(0, 0.03, size / 2);
  const fillGeo = new THREE.BoxGeometry(size * 0.9, 0.02, size * 0.9);
  fillGeo.translate(0, 0, -size * 0.45);
  const fill = new THREE.Mesh(fillGeo, flat(Palette.unlockFill, { roughness: 0.5 }));
  fill.position.z = -size * 0.05;
  fill.scale.z = 0.0001;
  fillPivot.add(fill);
  root.add(fillPivot);

  // Dashes along the perimeter (one InstancedMesh).
  const dashLen = 0.26;
  const gap = 0.14;
  const perSide = Math.max(1, Math.floor(size / (dashLen + gap)));
  const step = size / perSide;
  const dashGeo = new THREE.BoxGeometry(dashLen, 0.04, 0.08);
  const dashes = new THREE.InstancedMesh(dashGeo, flat(Palette.unlockDash), perSide * 4);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const half = size / 2;
  let i = 0;
  for (let side = 0; side < 4; side++) {
    for (let k = 0; k < perSide; k++) {
      const along = -half + step * (k + 0.5);
      const rot = side % 2 === 0 ? 0 : Math.PI / 2;
      const x = side === 0 ? along : side === 1 ? half : side === 2 ? -along : -half;
      const z = side === 0 ? -half : side === 1 ? along : side === 2 ? half : -along;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      m.compose(new THREE.Vector3(x, 0.04, z), q, new THREE.Vector3(1, 1, 1));
      dashes.setMatrixAt(i++, m);
    }
  }
  dashes.instanceMatrix.needsUpdate = true;
  root.add(dashes);

  return { root, fill };
}
