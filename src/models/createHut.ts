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

/** How much bigger the hut gets per level above 1 (GDD §24); Map uses it for the collider too. */
export function hutScale(level: number): number {
  return 1 + (Math.min(Math.max(level, 1), 4) - 1) * 0.08;
}

/**
 * Small wooden penguin shed with a snowy roof and a round door facing +Z. One draw call (the window glass is added
 * by the map so it can glow at night). Each level adds room (GDD §24): 2 a lean-to with a bunk at the back, 3 a
 * second front window with a flower box, 4 a loft window in the gable, a lantern and a flag.
 */
export function createHut(width: number, depth: number, level = 1): THREE.Mesh {
  const g = new THREE.Group();
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);
  const light = flat(Palette.woodLight);
  if (level >= 2) {
    // Lean-to on the back with a snowy slope and a peek at a bunk through its side opening.
    g.add(mesh(new THREE.BoxGeometry(width * 0.75, 0.9, 0.7), wood, -0.2, 0.45, -depth / 2 - 0.35));
    const lean = mesh(new THREE.BoxGeometry(width * 0.8, 0.08, 0.95), flat(Palette.snow), -0.2, 1.0, -depth / 2 - 0.35);
    lean.rotation.x = -0.35;
    g.add(lean);
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.4), flat(Palette.doorway), -0.2 - width * 0.375 - 0.01, 0.5, -depth / 2 - 0.35));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.42), light, -0.2 - width * 0.375 - 0.03, 0.4, -depth / 2 - 0.35));
  }
  if (level >= 3) {
    // Flower box under the (glowing) second window.
    g.add(mesh(new THREE.BoxGeometry(0.52, 0.1, 0.12), light, 0.55 - width / 2 + 0.35, 0.28, depth / 2 + 0.07));
    for (const x of [-0.14, 0, 0.14]) g.add(mesh(new THREE.IcosahedronGeometry(0.06, 0), flat(Palette.flower), 0.55 - width / 2 + 0.35 + x, 0.37, depth / 2 + 0.08));
  }
  if (level >= 4) {
    // Flag on the ridge and a little lantern by the door.
    g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 5), dark, width / 2 - 0.1, 2.5, 0));
    g.add(mesh(new THREE.BoxGeometry(0.34, 0.2, 0.03), flat(Palette.flag), width / 2 + 0.08, 2.75, 0));
    g.add(mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), flat(Palette.lantern), 0.85, 0.95, depth / 2 + 0.1));
  }
  g.add(...createHutBody(width, depth).children);
  const baked = bake(g);
  baked.scale.setScalar(hutScale(level));
  return baked;
}

/** Window glass spots (front, local units before scaling) that glow at night, per level. */
export function hutWindows(width: number, depth: number, level: number): Array<{ x: number; y: number; z: number; w: number; h: number }> {
  const out = [{ x: -0.55, y: 0.45, z: depth / 2 + 0.03, w: 0.42, h: 0.3 }];
  if (level >= 3) out.push({ x: 0.55 - width / 2 + 0.35, y: 0.55, z: depth / 2 + 0.03, w: 0.36, h: 0.26 });
  if (level >= 4) out.push({ x: 0, y: 1.75, z: depth / 2 + 0.17, w: 0.3, h: 0.24 });
  return out;
}

function createHutBody(width: number, depth: number): THREE.Group {
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
  return g;
}

/**
 * Penguin Market stall (GDD §24): a little wooden booth with a striped awning, a counter facing +Z and a penguin
 * sign on top. One draw call. Origin at the ground in the middle of the counter.
 */
export function createMarketStall(width: number, depth: number): THREE.Mesh {
  const g = new THREE.Group();
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);
  g.add(mesh(new THREE.BoxGeometry(width, 0.85, depth), wood, 0, 0.425, 0));
  g.add(mesh(new THREE.BoxGeometry(width + 0.12, 0.08, depth + 0.16), flat(Palette.woodLight), 0, 0.89, 0.04));
  for (const x of [-width / 2 + 0.06, width / 2 - 0.06]) {
    g.add(mesh(new THREE.BoxGeometry(0.09, 1.9, 0.09), dark, x, 0.95, -depth / 2 + 0.05));
    g.add(mesh(new THREE.BoxGeometry(0.09, 1.55, 0.09), dark, x, 0.78, depth / 2 - 0.05));
  }
  // Striped awning: alternating slats, sloping toward the front.
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const slat = mesh(
      new THREE.BoxGeometry(width / stripes + 0.01, 0.05, depth + 0.55),
      flat(i % 2 ? Palette.snow : Palette.awning),
      -width / 2 + (i + 0.5) * (width / stripes),
      1.78,
      0.2,
    );
    slat.rotation.x = 0.3;
    g.add(slat);
  }
  // Scalloped edge and the penguin sign.
  for (let i = 0; i < stripes; i++) {
    const tab = mesh(new THREE.ConeGeometry(0.11, 0.16, 3), flat(i % 2 ? Palette.snow : Palette.awning), -width / 2 + (i + 0.5) * (width / stripes), 1.56, depth / 2 + 0.47);
    tab.rotation.x = Math.PI;
    g.add(tab);
  }
  g.add(mesh(new THREE.BoxGeometry(0.62, 0.42, 0.06), flat(Palette.woodLight), 0, 2.2, -depth / 2 + 0.1));
  g.add(mesh(new THREE.IcosahedronGeometry(0.13, 0), flat(Palette.penguinBack), 0, 2.2, -depth / 2 + 0.17));
  g.add(mesh(new THREE.IcosahedronGeometry(0.08, 0), flat(Palette.penguinBelly), 0, 2.18, -depth / 2 + 0.24));
  // A crate of fish and a little bell on the counter.
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.22, 0.3), dark, -width / 2 + 0.35, 1.04, 0));
  g.add(mesh(new THREE.ConeGeometry(0.08, 0.12, 6), flat(Palette.coin), width / 2 - 0.3, 1.0, 0.1));
  return bake(g);
}
