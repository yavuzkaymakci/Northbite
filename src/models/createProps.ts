import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { instanced, type InstanceTransform } from './instancing';
import { flat, mesh } from './materials';

/** Wooden crate with dark straps. Origin at the bottom center. */
export function createCrate(size: number): THREE.Group {
  const group = new THREE.Group();
  group.add(mesh(new THREE.BoxGeometry(size, size, size), flat(Palette.wood), 0, size / 2, 0));
  const strap = new THREE.BoxGeometry(size * 1.02, size * 0.14, size * 1.02);
  group.add(mesh(strap, flat(Palette.woodDark), 0, size * 0.2, 0));
  group.add(mesh(strap, flat(Palette.woodDark), 0, size * 0.8, 0));
  return group;
}

/** Rocks: flattened icosahedrons. */
export function createRocks(transforms: readonly InstanceTransform[]): THREE.InstancedMesh {
  return instanced(new THREE.IcosahedronGeometry(1, 0), flat(Palette.rock), transforms);
}

/** Snow mounds: very flat icosahedrons. */
export function createSnowMounds(transforms: readonly InstanceTransform[]): THREE.InstancedMesh {
  return instanced(new THREE.IcosahedronGeometry(1, 0), flat(Palette.snow), transforms);
}

/** Floating ice floes. Returned as InstancedMesh so the caller can animate bobbing. */
export function createFloes(transforms: readonly InstanceTransform[]): THREE.InstancedMesh {
  const im = instanced(new THREE.IcosahedronGeometry(1, 0), flat(Palette.ice, { roughness: 0.5 }), transforms);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return im;
}
