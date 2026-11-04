import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { flat, mesh } from './materials';

// Swappable character parts (GDD §3). Each returns a group positioned in head (or body) space.
// The player model builds every variant once and only toggles visibility, so changing looks creates no garbage.

/** Knit beanie with a fold and a pompom. `color` is the headwear material. */
export function createBeanie(color: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'beanie';
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.29, 0.22, 8), color, 0, 0.18, -0.01));
  g.add(mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.08, 8), color, 0, 0.09, -0.01));
  g.add(mesh(new THREE.IcosahedronGeometry(0.08, 0), flat(Palette.snow), 0, 0.33, -0.01));
  return g;
}

/** Fur-trimmed hat with ear flaps; the crown takes the headwear color. */
export function createFurHat(color: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'fur-hat';
  const fur = flat(Palette.fur);
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.3, 8), fur, 0, 0.2, -0.01));
  g.add(mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.08, 8), color, 0, 0.36, -0.01));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.24, 0.2), fur, -0.29, 0.0, -0.02));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.24, 0.2), fur, 0.29, 0.0, -0.02));
  return g;
}

/** Jacket hood with a fur trim around the face. `jacket` is the jacket material. */
export function createHood(jacket: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'hood';
  g.add(mesh(new THREE.IcosahedronGeometry(0.34, 1), jacket, 0, 0.03, -0.09));
  const trim = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10, 1, true), flat(Palette.fur), 0, 0.02, 0.17);
  trim.rotation.x = Math.PI / 2;
  g.add(trim);
  return g;
}

export function createShortBeard(color: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'beard-short';
  g.add(mesh(new THREE.BoxGeometry(0.36, 0.14, 0.18), color, 0, -0.17, 0.13));
  return g;
}

export function createLongBeard(color: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'beard-long';
  g.add(mesh(new THREE.BoxGeometry(0.36, 0.12, 0.18), color, 0, -0.15, 0.13));
  const point = mesh(new THREE.ConeGeometry(0.17, 0.36, 5), color, 0, -0.33, 0.17);
  point.rotation.x = Math.PI;
  g.add(point);
  return g;
}

/** Scarf ring around the neck plus a tail on the back. Positioned in body space. */
export function createScarf(color: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'scarf';
  g.add(mesh(new THREE.CylinderGeometry(0.27, 0.32, 0.14, 8), color, 0, 1.2, 0));
  const tail = mesh(new THREE.BoxGeometry(0.12, 0.34, 0.06), color, 0.12, 1.02, -0.3);
  tail.rotation.z = 0.15;
  g.add(tail);
  return g;
}

/** Plain collar shown when there is no scarf, so the neck seam stays covered. */
export function createCollar(jacket: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'collar';
  g.add(mesh(new THREE.CylinderGeometry(0.25, 0.31, 0.1, 8), jacket, 0, 1.18, 0));
  return g;
}
