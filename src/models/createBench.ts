import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { bake } from './bake';
import { flat, mesh } from './materials';

/** Rod bench: a work table with rods on a rack, a tackle box and a hook sign. Long side along X. One draw call. */
export function createRodBench(width: number, depth: number): THREE.Mesh {
  const g = new THREE.Group();
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);
  const topY = 0.82;
  g.add(mesh(new THREE.BoxGeometry(width, 0.1, depth), flat(Palette.woodLight), 0, topY, 0));
  const legGeo = new THREE.BoxGeometry(0.1, topY, 0.1);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(mesh(legGeo, dark, sx * (width / 2 - 0.1), topY / 2, sz * (depth / 2 - 0.08)));
  }
  g.add(mesh(new THREE.BoxGeometry(width - 0.2, 0.06, depth - 0.2), wood, 0, 0.25, 0));

  // Rack on the back edge with three rods leaning on it
  const rackY = 1.55;
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.08, rackY, 0.08), dark, sx * (width / 2 - 0.15), rackY / 2, -depth / 2 + 0.05));
  g.add(mesh(new THREE.BoxGeometry(width - 0.2, 0.08, 0.08), dark, 0, rackY - 0.05, -depth / 2 + 0.05));
  const rodGeo = new THREE.CylinderGeometry(0.018, 0.03, 1.7, 5);
  const rodMat = flat(Palette.rod);
  [-0.45, 0, 0.45].forEach((x, i) => {
    const rod = mesh(rodGeo, rodMat, x, 0.95, -depth / 2 + 0.12);
    rod.rotation.z = (i - 1) * 0.08;
    rod.rotation.x = -0.12;
    g.add(rod);
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 6), flat(Palette.reel), x + 0.02, 0.55, -depth / 2 + 0.18));
  });

  // Tackle box and a spool on the table
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.2, 0.28), flat(Palette.bobberRed), 0.45, topY + 0.15, 0.08));
  g.add(mesh(new THREE.BoxGeometry(0.44, 0.04, 0.3), flat(Palette.snow), 0.45, topY + 0.27, 0.08));
  const spool = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 8), flat(Palette.fishingLine), -0.35, topY + 0.12, 0.1);
  spool.rotation.z = Math.PI / 2;
  g.add(spool);

  // Sign with a hook shape
  const sign = mesh(new THREE.BoxGeometry(0.7, 0.36, 0.05), flat(Palette.benchPad), 0, rackY + 0.28, -depth / 2 + 0.05);
  g.add(sign);
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.2, 0.03), flat(Palette.snow), 0.05, rackY + 0.32, -depth / 2 + 0.09));
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.05, 0.03), flat(Palette.snow), 0, rackY + 0.2, -depth / 2 + 0.09));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.09, 0.03), flat(Palette.snow), -0.05, rackY + 0.24, -depth / 2 + 0.09));
  return bake(g);
}
