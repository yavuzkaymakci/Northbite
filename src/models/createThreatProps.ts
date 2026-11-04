import * as THREE from 'three';
import type { RectArea } from '../content/zones';
import { range, seededRandom } from '../core/Random';
import { Palette } from '../render/Palette';
import { bake } from './bake';
import { createSnowyRoof } from './createHut';
import { flat, mesh } from './materials';

// Threat-related props (GDD §13). Static ones are baked into one mesh each.

/**
 * Snowy slope rising west of the walk area: piled boulders that grow taller away from the yard, rocky outcrops,
 * and a pale chute where avalanches come down (`chuteZ`). One draw call.
 */
export function createSlope(area: RectArea, chuteZ: number): THREE.Mesh {
  const g = new THREE.Group();
  const rand = seededRandom(23);
  const snow = flat(Palette.snow);
  const ice = flat(Palette.ice, { roughness: 0.6 });
  const rock = flat(Palette.slopeRock);
  const w = area.maxX - area.minX;
  for (let i = 0; i < 26; i++) {
    const x = range(rand, area.minX, area.maxX);
    const z = range(rand, area.minZ, area.maxZ);
    const k = (area.maxX - x) / w; // 0 at the foot, 1 far up
    const r = range(rand, 2.4, 3.6);
    const b = mesh(new THREE.IcosahedronGeometry(r, 1), rand() < 0.15 ? ice : snow, x, -r * 0.35 + k * 6.5, z);
    b.scale.set(1, range(rand, 0.55, 0.9), range(rand, 0.9, 1.3));
    b.rotation.y = rand() * 6;
    g.add(b);
  }
  for (let i = 0; i < 9; i++) {
    const x = range(rand, area.minX + 2, area.maxX - 1);
    const z = range(rand, area.minZ, area.maxZ);
    if (Math.abs(z - chuteZ) < 2.4) continue;
    const k = (area.maxX - x) / w;
    const r = range(rand, 0.7, 1.3);
    const o = mesh(new THREE.IcosahedronGeometry(r, 0), rock, x, k * 6.5 + r * 0.4, z);
    o.scale.y = 1.4;
    g.add(o);
  }
  // Avalanche chute: a long icy groove from the ridge down to the foot of the slope.
  const len = w + 2;
  const chute = mesh(new THREE.BoxGeometry(len, 0.3, 2.2), ice, area.maxX - len / 2 + 0.6, 0, chuteZ);
  chute.rotation.z = -Math.atan2(6.5, w);
  chute.position.y = 3.2;
  g.add(chute);
  return bake(g);
}

/** Wooden snow fence along Z (slats between posts). Origin at its middle. One draw call. */
export function createSnowFence(length: number): THREE.Mesh {
  const g = new THREE.Group();
  const wood = flat(Palette.fenceWood);
  const dark = flat(Palette.woodDark);
  const posts = Math.max(2, Math.round(length / 1.1) + 1);
  for (let i = 0; i < posts; i++) {
    const z = -length / 2 + (i * length) / (posts - 1);
    g.add(mesh(new THREE.BoxGeometry(0.14, 1.5, 0.14), dark, 0, 0.75, z));
  }
  for (let i = 0; i < Math.round(length / 0.22); i++) {
    const z = -length / 2 + 0.1 + i * 0.22;
    const slat = mesh(new THREE.BoxGeometry(0.05, 1.2, 0.12), wood, 0.09, 0.7, z);
    slat.rotation.x = (i % 2 ? 1 : -1) * 0.04;
    g.add(slat);
  }
  for (const y of [0.35, 1.1]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.08, length), dark, 0.13, y, 0));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.12, length), flat(Palette.snow), -0.2, 0.06, 0));
  return bake(g);
}

/** Ring of stones with crossed logs; the flame is drawn separately (animated). One draw call. */
export function createFirePit(): THREE.Mesh {
  const g = new THREE.Group();
  const stone = flat(Palette.stone);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = mesh(new THREE.IcosahedronGeometry(0.17 + (i % 3) * 0.03, 0), stone, Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5);
    s.scale.y = 0.8;
    g.add(s);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 9), flat(Palette.doorway), 0, 0.02, 0));
  for (const r of [0.5, -0.6]) {
    const log = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.75, 6), flat(Palette.woodDark), 0, 0.12, 0);
    log.rotation.set(Math.PI / 2, r, 0.25);
    g.add(log);
  }
  g.add(mesh(new THREE.IcosahedronGeometry(0.14, 0), flat(Palette.emberDeep), 0, 0.1, 0));
  return bake(g);
}

/** Flame shape for the shared flame InstancedMesh (pits, torch stand, hand torch). Origin at its base. */
export function createFlameGeometry(): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(0.22, 0.6, 5);
  geo.translate(0, 0.3, 0);
  return geo;
}

/** Wooden lookout tower with a snowy roof; the lantern glass is the second mesh (night glow). */
export function createWatchtower(lantern: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);
  const h = 3.2;
  for (const [x, z] of [
    [-0.6, -0.6],
    [0.6, -0.6],
    [-0.6, 0.6],
    [0.6, 0.6],
  ] as const) {
    const leg = mesh(new THREE.BoxGeometry(0.16, h, 0.16), dark, x, h / 2, z);
    leg.rotation.set(z * 0.05, 0, -x * 0.05);
    g.add(leg);
  }
  for (const y of [0.9, 2.0]) {
    g.add(mesh(new THREE.BoxGeometry(1.25, 0.08, 0.08), dark, 0, y, 0.6));
    g.add(mesh(new THREE.BoxGeometry(1.25, 0.08, 0.08), dark, 0, y, -0.6));
  }
  g.add(mesh(new THREE.BoxGeometry(1.7, 0.14, 1.7), wood, 0, h, 0));
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(1.7, 0.5, 0.08), wood, 0, h + 0.3, s * 0.82));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.5, 1.7), wood, s * 0.82, h + 0.3, 0));
  }
  for (const [x, z] of [
    [-0.78, -0.78],
    [0.78, -0.78],
    [-0.78, 0.78],
    [0.78, 0.78],
  ] as const) {
    g.add(mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), dark, x, h + 0.6, z));
  }
  const roof = createSnowyRoof(1.9, 1.9, 0.8, 0.55);
  roof.position.y = h + 1.2;
  g.add(roof);
  // Ladder on the south side
  for (const s of [-1, 1]) {
    const rail = mesh(new THREE.BoxGeometry(0.07, h + 0.2, 0.07), dark, s * 0.22, h / 2, 0.95);
    rail.rotation.x = -0.12;
    g.add(rail);
  }
  for (let i = 0; i < 7; i++) g.add(mesh(new THREE.BoxGeometry(0.44, 0.05, 0.06), wood, 0, 0.35 + i * 0.42, 0.95 - (0.35 + i * 0.42) * 0.12));
  const out = new THREE.Group();
  out.add(bake(g));
  const glass = mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), lantern, 0.55, h + 0.95, 0.55);
  out.add(glass);
  return out;
}

/** Small rack holding torches, with a flame sign. The flames on top are drawn separately. One draw call. */
export function createTorchStand(): THREE.Mesh {
  const g = new THREE.Group();
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);
  g.add(mesh(new THREE.BoxGeometry(1.0, 0.12, 0.42), dark, 0, 0.5, 0));
  g.add(mesh(new THREE.BoxGeometry(1.0, 0.12, 0.42), dark, 0, 0.06, 0));
  for (const x of [-0.45, 0.45]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.62, 0.36), wood, x, 0.31, 0));
  for (const x of TORCH_STAND_SLOTS) {
    g.add(mesh(new THREE.CylinderGeometry(0.045, 0.04, 1.0, 5), wood, x, 0.5, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.16, 6), dark, x, 1.02, 0));
  }
  return bake(g);
}

/** X offsets of the torches in the stand (flames sit at y = 1.1). */
export const TORCH_STAND_SLOTS = [-0.25, 0, 0.25] as const;

/** Bait trap: a low wooden plank on a stake with a rope ring. The bait fish is drawn on top. One draw call. */
export function createBaitTrap(): THREE.Mesh {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.12, 0.6), flat(Palette.wood), 0, 0.22, 0));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.2, 0.12), flat(Palette.woodDark), -0.32, 0.08, -0.2));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.2, 0.12), flat(Palette.woodDark), 0.32, 0.08, 0.2));
  const stake = mesh(new THREE.CylinderGeometry(0.05, 0.04, 1.0, 5), flat(Palette.woodDark), 0.52, 0.5, -0.3);
  g.add(stake);
  const ring = mesh(new THREE.TorusGeometry(0.12, 0.025, 4, 8), flat(Palette.wicker), 0.52, 0.85, -0.3);
  g.add(ring);
  return bake(g);
}

/** Top of the bait plank (where the fish lies). */
export const BAIT_Y = 0.34;

export interface ChestModel {
  root: THREE.Group;
  lid: THREE.Mesh;
}

/** Small wooden chest with metal bands; the lid hinges at the back. */
export function createChest(): ChestModel {
  const root = new THREE.Group();
  const wood = flat(Palette.wood);
  const band = flat(Palette.chestBand);
  const base = new THREE.Group();
  base.add(mesh(new THREE.BoxGeometry(0.7, 0.4, 0.5), wood, 0, 0.2, 0));
  for (const x of [-0.24, 0.24]) base.add(mesh(new THREE.BoxGeometry(0.06, 0.42, 0.52), band, x, 0.2, 0));
  base.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), flat(Palette.coin), 0, 0.33, 0.26));
  root.add(bake(base));
  const lidParts = new THREE.Group();
  lidParts.add(mesh(new THREE.BoxGeometry(0.72, 0.16, 0.52), wood, 0, 0.08, 0.26));
  for (const x of [-0.24, 0.24]) lidParts.add(mesh(new THREE.BoxGeometry(0.06, 0.18, 0.54), band, x, 0.08, 0.26));
  const lid = bake(lidParts);
  lid.position.set(0, 0.4, -0.26);
  root.add(lid);
  return { root, lid };
}

/** Shovel held in the right hand (along -Y from the grip, blade at the end). */
export function createShovel(): THREE.Mesh {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), flat(Palette.wood), 0, 0.15, 0));
  g.add(mesh(new THREE.BoxGeometry(0.26, 0.3, 0.04), flat(Palette.reel), 0, -0.45, 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), flat(Palette.woodDark), 0, 0.64, 0));
  return bake(g);
}

/** Hand torch: a stick with a wrapped head; the flame comes from the shared flame mesh. */
export function createHandTorch(): THREE.Mesh {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.7, 5), flat(Palette.wood), 0, 0.15, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.14, 6), flat(Palette.woodDark), 0, 0.5, 0));
  return bake(g);
}

/** Top of the hand torch in its own space (flame base). */
export const HAND_TORCH_TIP = 0.57;
