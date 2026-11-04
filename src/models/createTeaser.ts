import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { bake } from './bake';
import { flat, mesh } from './materials';

/**
 * Hazy silhouette of the future pier zone: a plank deck reaching east into the water, posts, a shed and a boat.
 * Colors are washed toward the haze color and the mesh is half transparent. Origin at the shore end of the deck.
 */
export function createPierSilhouette(): THREE.Mesh {
  const g = new THREE.Group();
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);
  g.add(mesh(new THREE.BoxGeometry(12, 0.18, 2.2), wood, 4, 0.25, 0));
  for (let x = -1.5; x <= 10; x += 1.4) {
    for (const z of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 5), dark, x, -0.4, z));
  }
  g.add(mesh(new THREE.BoxGeometry(2, 1.5, 1.6), wood, -0.6, 1.1, -0.2));
  const roof = mesh(new THREE.BoxGeometry(2.3, 0.15, 1.9), flat(Palette.snow), -0.6, 1.9, -0.2);
  roof.rotation.z = 0.12;
  g.add(roof);
  const hull = mesh(new THREE.CylinderGeometry(0.75, 0.4, 3.2, 6), flat(Palette.bobberRed), 9, -0.25, 2.2);
  hull.rotation.z = Math.PI / 2;
  hull.scale.set(1, 1, 0.5);
  g.add(hull);
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4), dark, 9, 1.1, 2.2));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), flat(Palette.wood), 1.5, 0.55, 0.6));
  g.add(mesh(new THREE.BoxGeometry(0.35, 0.5, 0.35), flat(Palette.wood), 2.0, 0.6, 0.5));
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    transparent: true,
    opacity: 0.55,
  });
  return bake(g, { material, tint: Palette.haze, tintAmount: 0.6 });
}

/** Wooden post with a blank board (text is an HTML label above it). Origin at the post base. */
export function createSignPost(): THREE.Mesh {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), flat(Palette.woodDark), 0, 0.7, 0));
  const board = mesh(new THREE.BoxGeometry(1.2, 0.5, 0.08), flat(Palette.woodLight), 0, 1.25, 0.06);
  board.rotation.z = -0.05;
  g.add(board);
  g.add(mesh(new THREE.BoxGeometry(1.24, 0.06, 0.1), flat(Palette.snow), 0, 1.52, 0.06));
  return bake(g);
}
