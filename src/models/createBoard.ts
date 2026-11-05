import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { bake } from './bake';
import { createSnowyRoof } from './createHut';
import { flat, mesh } from './materials';

/** Wooden order board with a little snowy roof and paper notes pinned on it, facing +Z. One draw call. */
export function createOrderBoard(): THREE.Mesh {
  const g = new THREE.Group();
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);
  for (const x of [-0.7, 0.7]) g.add(mesh(new THREE.BoxGeometry(0.14, 2.0, 0.14), dark, x, 1.0, 0));
  g.add(mesh(new THREE.BoxGeometry(1.5, 0.95, 0.08), wood, 0, 1.35, 0.02));
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.08, 0.12), dark, 0, 0.86, 0.03));
  const roof = createSnowyRoof(1.8, 0.5, 0.35, 0.6);
  roof.position.y = 1.95;
  g.add(roof);
  const notes: Array<[number, number, number]> = [
    [-0.42, 1.45, 0.05],
    [0.05, 1.5, -0.08],
    [0.45, 1.3, 0.1],
    [-0.15, 1.15, 0.12],
  ];
  for (const [x, y, r] of notes) {
    const note = mesh(new THREE.BoxGeometry(0.3, 0.34, 0.02), flat(Palette.boardPaper), x, y, 0.08);
    note.rotation.z = r;
    g.add(note);
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), flat(Palette.awning), x, y + 0.13, 0.1));
  }
  return bake(g);
}
