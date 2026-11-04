import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { bake } from './bake';
import { flat, mesh } from './materials';

/** Gable roof prism along X: a 3-sided cylinder lying on its side with one edge up. */
export function createGableRoof(width: number, depth: number, height: number, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(1, 1, width, 3, 1);
  geo.rotateZ(Math.PI / 2); // axis along X
  geo.rotateX(-Math.PI / 2); // one edge up, flat face down (base at y = -0.5, ridge at y = 1)
  geo.scale(1, height / 1.5, depth / Math.sqrt(3));
  geo.translate(0, height / 3, 0);
  return new THREE.Mesh(geo, material);
}

/**
 * Wooden gable roof with a snow cap over the top `snowShare` of both slopes (same slope, so it sits flush).
 * Origin at the eave line.
 */
export function createSnowyRoof(width: number, depth: number, height: number, snowShare: number): THREE.Group {
  const g = new THREE.Group();
  g.add(createGableRoof(width, depth, height, flat(Palette.woodDark)));
  const cap = createGableRoof(width + 0.08, depth, height, flat(Palette.snow));
  cap.scale.set(1, snowShare, snowShare);
  cap.position.y = height * (1 - snowShare) + 0.04;
  g.add(cap);
  return g;
}

/** Small wooden penguin shed with a snowy roof and a round door facing +Z. One draw call. */
export function createHut(width: number, depth: number): THREE.Mesh {
  const g = new THREE.Group();
  const wallH = 1.25;
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);
  g.add(mesh(new THREE.BoxGeometry(width, wallH, depth), wood, 0, wallH / 2, 0));
  // Plank lines on the front
  for (let i = 1; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(width + 0.02, 0.04, 0.04), dark, 0, (wallH / 4) * i, depth / 2 + 0.01));
  const roof = createSnowyRoof(width + 0.3, depth + 0.4, 1.3, 0.6);
  roof.position.y = wallH;
  g.add(roof);
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), flat(Palette.rock), -width * 0.28, wallH + 1.05, -depth * 0.15));
  // Round-ish door (octagon) and a little fish sign above it
  const door = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 8), flat(Palette.doorway), 0.35, 0.42, depth / 2 + 0.02);
  door.rotation.x = Math.PI / 2;
  door.scale.set(1, 1, 1.35);
  g.add(door);
  g.add(mesh(new THREE.BoxGeometry(0.76, 0.06, 0.08), flat(Palette.snow), 0.35, 0.02, depth / 2 + 0.06));
  const sign = mesh(new THREE.BoxGeometry(0.5, 0.26, 0.05), flat(Palette.woodLight), -0.55, 0.85, depth / 2 + 0.03);
  g.add(sign);
  const fish = mesh(new THREE.ConeGeometry(0.08, 0.26, 4), flat(Palette.penguinBack), -0.55, 0.85, depth / 2 + 0.07);
  fish.rotation.z = Math.PI / 2;
  g.add(fish);
  return bake(g);
}
