import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { bake } from './bake';
import { flat, mesh } from './materials';

/** Top of the basket's floor, where the first fish lie. */
export const BASKET_FLOOR_Y = 0.12;

/** Woven basket (open top). Origin at the ground center. One draw call. */
export function createBasket(radius: number): THREE.Mesh {
  const g = new THREE.Group();
  const h = 0.46;
  const wicker = flat(Palette.wicker);
  const dark = flat(Palette.woodDark);
  g.add(mesh(new THREE.CylinderGeometry(radius, radius * 0.82, h, 10, 1, true), wicker, 0, h / 2, 0));
  g.add(mesh(new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, 0.06, 10), dark, 0, 0.06, 0));
  for (const y of [0.12, 0.3]) {
    g.add(mesh(new THREE.CylinderGeometry(radius * (0.86 + y * 0.35) + 0.015, radius * (0.86 + y * 0.35) + 0.015, 0.05, 10, 1, true), dark, 0, y, 0));
  }
  g.add(mesh(new THREE.CylinderGeometry(radius + 0.04, radius + 0.04, 0.07, 10, 1, true), dark, 0, h, 0));
  // Open-topped, so the inside wall must be drawn too.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
  return bake(g, { material });
}

export interface NetModel {
  root: THREE.Group;
  /** Hanging net; wobbled when a fish gets in. */
  mesh: THREE.Group;
}

/** Net frame over the far side of a hole with a mesh bag hanging into the water. Origin at the hole center. */
export function createNet(holeRadius: number): NetModel {
  const root = new THREE.Group();
  root.name = 'net';
  const frame = new THREE.Group();
  const wood = flat(Palette.woodDark);
  const z = -holeRadius * 0.55;
  const span = holeRadius + 0.3;
  const postGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.95, 5);
  for (const sx of [-1, 1]) {
    const post = mesh(postGeo, wood, sx * span, 0.47, z);
    post.rotation.z = -sx * 0.12;
    frame.add(post);
  }
  const bar = mesh(new THREE.CylinderGeometry(0.035, 0.035, span * 2 + 0.1, 5), wood, 0, 0.88, z);
  bar.rotation.z = Math.PI / 2;
  frame.add(bar);
  // Cords from the bar down to the bag
  const cordGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.62, 3);
  for (const sx of [-0.6, 0, 0.6]) frame.add(mesh(cordGeo, flat(Palette.netCord), sx * holeRadius * 0.6, 0.58, z + 0.05));
  root.add(bake(frame));

  const bag = new THREE.Group();
  bag.position.set(0, 0.3, z + 0.12);
  const netMat = new THREE.MeshBasicMaterial({ color: Palette.netCord, wireframe: true });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(holeRadius * 0.62, 0.6, 8, 3, true), netMat);
  cone.rotation.x = Math.PI; // apex down into the water
  cone.position.y = -0.18;
  bag.add(cone);
  root.add(bag);
  return { root, mesh: bag };
}
