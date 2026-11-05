import * as THREE from 'three';
import type { RectArea } from '../content/zones';
import { range, seededRandom } from '../core/Random';
import { GuestColors, Palette, SkinTones } from '../render/Palette';
import { bake } from './bake';
import { createGableRoof } from './createHut';
import { flat, mesh } from './materials';

// Ice Cave and Hot Spring Camp models (GDD §15). Static parts are baked into one mesh each.

/**
 * Ice Cave: dark blue-violet floor, rock walls with icicles along the north, west and south sides, and a rocky arch
 * over the mouth (east side). Open to the sky so the top-down camera sees inside. One draw call.
 */
export function createCave(area: RectArea): THREE.Mesh {
  const g = new THREE.Group();
  const rand = seededRandom(61);
  const w = area.maxX - area.minX;
  const d = area.maxZ - area.minZ;
  const floor = mesh(new THREE.BoxGeometry(w + 0.4, 0.06, d + 0.4), flat(Palette.caveFloor), area.minX + w / 2, 0.0, area.minZ + d / 2);
  g.add(floor);
  const rock = flat(Palette.caveRock);
  const ice = flat(Palette.caveIce, { roughness: 0.4 });
  const wallAt = (x: number, z: number, h: number, r: number) => {
    const b = mesh(new THREE.IcosahedronGeometry(r, 0), rand() < 0.25 ? ice : rock, x, h * 0.45, z);
    b.scale.set(1, h / r, 1);
    b.rotation.y = rand() * 6;
    g.add(b);
  };
  // North and south walls (rocks along X), west wall (along Z).
  for (let x = area.minX - 0.4; x <= area.maxX + 0.2; x += 1.1) {
    wallAt(x + range(rand, -0.2, 0.2), area.minZ - 0.6, range(rand, 2.4, 3.6), range(rand, 0.8, 1.1));
    // The south wall faces the camera: kept low so the bench and the veins stay in view.
    wallAt(x + range(rand, -0.2, 0.2), area.maxZ + 0.7, range(rand, 0.6, 0.95), range(rand, 0.6, 0.85));
  }
  for (let z = area.minZ; z <= area.maxZ; z += 1.1) wallAt(area.minX - 0.6, z + range(rand, -0.2, 0.2), range(rand, 3, 4), range(rand, 0.9, 1.2));
  // Icicles hanging from the north wall's lip.
  for (let x = area.minX; x <= area.maxX; x += 0.55) {
    const len = range(rand, 0.4, 0.9);
    const c = mesh(new THREE.ConeGeometry(0.08, len, 4), ice, x, 2.4 - len / 2, area.minZ - 0.15);
    c.rotation.x = Math.PI;
    g.add(c);
  }
  // Arch over the mouth.
  const archX = area.maxX + 0.1;
  for (const z of [area.minZ - 0.3, 1.6]) g.add(mesh(new THREE.BoxGeometry(0.9, 3.0, 0.9), rock, archX, 1.5, z));
  const lintel = mesh(new THREE.BoxGeometry(1.0, 0.8, 1.6 - area.minZ + 1.2), rock, archX, 3.1, (area.minZ - 0.3 + 1.6) / 2);
  g.add(lintel);
  for (let z = area.minZ; z <= 1.4; z += 0.5) {
    const c = mesh(new THREE.ConeGeometry(0.07, 0.5, 4), ice, archX - 0.2, 2.5, z);
    c.rotation.x = Math.PI;
    g.add(c);
  }
  return bake(g);
}

/** Crystal bench: a stone work table with tools, and two low racks (crystals in, statuettes out). One draw call. */
export function createCrystalBench(width: number, depth: number, input: { x: number; z: number }, output: { x: number; z: number }): THREE.Mesh {
  const g = new THREE.Group();
  const stone = flat(Palette.stone);
  const wood = flat(Palette.wood);
  g.add(mesh(new THREE.BoxGeometry(width, 0.8, depth), stone, 0, 0.4, 0));
  g.add(mesh(new THREE.BoxGeometry(width + 0.1, 0.08, depth + 0.1), flat(Palette.caveIce), 0, 0.84, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), wood, 0.5, 1.0, 0));
  g.add(mesh(new THREE.BoxGeometry(0.25, 0.1, 0.1), flat(Palette.reel), 0.5, 1.2, 0));
  for (const r of [input, output]) {
    g.add(mesh(new THREE.BoxGeometry(0.75, 0.35, 0.55), wood, r.x, 0.18, r.z));
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.05, 0.6), flat(Palette.woodDark), r.x, 0.37, r.z));
  }
  return bake(g);
}

/** Top of the land racks (crystal bench, kitchen). */
export const LAND_RACK_Y = 0.4;

/** Steaming hot spring: a stone rim around a pool; the water surface is a separate mesh (it shimmers). */
export function createHotSpring(radius: number): { rim: THREE.Mesh; water: THREE.Mesh } {
  const g = new THREE.Group();
  const rand = seededRandom(73);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const s = mesh(new THREE.IcosahedronGeometry(range(rand, 0.32, 0.48), 0), flat(i % 3 ? Palette.stone : Palette.rock), Math.cos(a) * radius, 0.12, Math.sin(a) * radius);
    s.scale.y = 0.7;
    g.add(s);
  }
  g.add(mesh(new THREE.CylinderGeometry(radius, radius, 0.06, 16), flat(Palette.doorway), 0, 0.02, 0));
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.95, radius * 0.95, 0.04, 16),
    new THREE.MeshStandardMaterial({ color: Palette.poolWater, emissive: Palette.poolWater, emissiveIntensity: 0.25, roughness: 0.2, flatShading: true }),
  );
  water.position.y = 0.09;
  return { rim: bake(g), water };
}

/** Kitchen counter with a little stove and two racks (smoked fish in, platters out). One draw call. */
export function createKitchen(width: number, depth: number, input: { x: number; z: number }, output: { x: number; z: number }): THREE.Mesh {
  const g = new THREE.Group();
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);
  g.add(mesh(new THREE.BoxGeometry(width, 0.85, depth), wood, 0, 0.42, 0));
  g.add(mesh(new THREE.BoxGeometry(width + 0.1, 0.07, depth + 0.1), flat(Palette.snow), 0, 0.88, 0));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.3, 0.45), flat(Palette.doorway), -0.5, 1.05, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), flat(Palette.reel), -0.62, 1.6, -0.1));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.2, 8), flat(Palette.reel), 0.4, 1.0, 0));
  // Awning
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.08, 1.9, 0.08), dark, s * (width / 2 - 0.05), 0.95, -depth / 2));
  // A narrow awning at the back, so the top-down camera still sees the counter.
  const roof = mesh(new THREE.BoxGeometry(width + 0.2, 0.08, 0.5), flat(Palette.auroraPurple), 0, 1.95, -depth / 2 - 0.05);
  roof.rotation.x = -0.35;
  g.add(roof);
  for (const r of [input, output]) {
    g.add(mesh(new THREE.BoxGeometry(0.75, 0.35, 0.55), wood, r.x, 0.18, r.z));
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.05, 0.6), dark, r.x, 0.37, r.z));
  }
  return bake(g);
}

/** A-frame canvas tent with a dark doorway facing +Z and a lantern glass (night glow) beside the door. */
export function createTent(color: number, lantern: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const roof = createGableRoof(2.0, 2.1, 1.7, flat(color));
  roof.rotation.y = Math.PI / 2;
  g.add(roof);
  const door = mesh(new THREE.ConeGeometry(0.45, 1.1, 3), flat(Palette.doorway), 0, 0.45, 1.0);
  door.rotation.y = Math.PI;
  g.add(door);
  g.add(mesh(new THREE.BoxGeometry(2.3, 0.05, 2.3), flat(Palette.rug), 0, 0.02, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4), flat(Palette.woodDark), 0.75, 0.55, 1.15));
  const out = new THREE.Group();
  out.add(bake(g));
  out.add(mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), lantern, 0.75, 1.15, 1.15));
  return out;
}

/** Lamp post for the camp (glass glows at night). */
export function createLampPost(lantern: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), flat(Palette.woodDark), 0, 1.1, 0));
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.06, 0.34), flat(Palette.woodDark), 0, 2.25, 0));
  const out = new THREE.Group();
  out.add(bake(g));
  out.add(mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), lantern, 0, 2.05, 0));
  return out;
}

export type GuestKind = 'tourist' | 'collector' | 'attendant';

export interface GuestModel {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
}

function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length) % list.length] as T;
}

/**
 * People of the lands: colourful tourists with backpacks, the collector in a long dark coat and tall hat, the camp
 * attendant in an apron. Torso, head and hat are baked into one mesh; legs and arms swing (5 draw calls).
 */
export function createGuest(kind: GuestKind, rand: () => number): GuestModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const coat =
    kind === 'collector' ? flat(Palette.collectorCoat) : kind === 'attendant' ? flat(Palette.attendantCoat) : flat(pick(GuestColors, rand));
  const pants = flat(kind === 'collector' ? Palette.collectorCoat : Palette.pants);
  const skin = flat(pick(SkinTones, rand));
  const torso = new THREE.Group();
  torso.add(mesh(new THREE.CylinderGeometry(0.3, kind === 'collector' ? 0.45 : 0.38, kind === 'collector' ? 0.95 : 0.72, 7), coat, 0, kind === 'collector' ? 0.75 : 0.84, 0));
  torso.add(mesh(new THREE.IcosahedronGeometry(0.25, 1), skin, 0, 1.45, 0));
  if (kind === 'tourist') {
    torso.add(mesh(new THREE.BoxGeometry(0.42, 0.5, 0.25), flat(pick(GuestColors, rand)), 0, 0.95, -0.32));
    const roll = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.44, 6), flat(Palette.snow), 0, 1.24, -0.32);
    roll.rotation.z = Math.PI / 2;
    torso.add(roll);
    torso.add(mesh(new THREE.IcosahedronGeometry(0.22, 1), flat(pick(GuestColors, rand)), 0, 1.62, 0));
  } else if (kind === 'collector') {
    torso.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 8), flat(Palette.eye), 0, 1.82, 0));
    torso.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 10), flat(Palette.eye), 0, 1.62, 0));
    torso.add(mesh(new THREE.TorusGeometry(0.06, 0.015, 4, 8), flat(Palette.coin), 0.1, 1.5, 0.23));
  } else {
    torso.add(mesh(new THREE.BoxGeometry(0.5, 0.55, 0.05), flat(Palette.snow), 0, 0.75, 0.33));
    torso.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.2, 7), flat(Palette.snow), 0, 1.64, 0));
  }
  body.add(bake(torso));
  const limb = (geo: THREE.BoxGeometry, mat: THREE.Material, x: number, y: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(mesh(geo, mat, 0, -geo.parameters.height / 2, 0));
    body.add(pivot);
    return pivot;
  };
  const legGeo = new THREE.BoxGeometry(0.22, 0.48, 0.24);
  const armGeo = new THREE.BoxGeometry(0.15, 0.5, 0.17);
  const legL = limb(legGeo, pants, -0.14, 0.48);
  const legR = limb(legGeo, pants, 0.14, 0.48);
  const armL = limb(armGeo, coat, -0.37, 1.12);
  const armR = limb(armGeo, coat, 0.37, 1.12);
  return { root, body, legL, legR, armL, armR };
}

export function animateGuest(m: GuestModel, walk: number, phase: number, wave = 0): void {
  const swing = Math.sin(phase) * 0.6 * walk;
  m.legL.rotation.x = swing;
  m.legR.rotation.x = -swing;
  m.armL.rotation.x = -swing * 0.8;
  m.armR.rotation.x = swing * 0.8 - wave * (1.6 + Math.sin(phase * 3) * 0.3);
  m.body.position.y = Math.abs(Math.sin(phase)) * 0.05 * walk;
}

// ---------- goods ----------

export function createCrystalGeometry(): THREE.BufferGeometry {
  const geo = new THREE.OctahedronGeometry(0.16, 0);
  geo.scale(0.8, 1.6, 0.8);
  return geo;
}

/** Ice statuette (a small leaping fish on a block), baked with vertex colors. */
export function createStatuette(): THREE.Mesh {
  const g = new THREE.Group();
  const ice = flat(Palette.wallIce, { roughness: 0.3 });
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), flat(Palette.caveIce), 0, 0.04, 0));
  const body = mesh(new THREE.IcosahedronGeometry(0.11, 0), ice, 0, 0.2, 0);
  body.scale.set(0.5, 1.3, 1);
  g.add(body);
  const tail = mesh(new THREE.ConeGeometry(0.07, 0.12, 4), ice, 0, 0.36, -0.03);
  g.add(tail);
  return bake(g);
}

/** Fish platter: white plate, a smoked fish, a green sprig. Baked with vertex colors. */
export function createPlatter(): THREE.Mesh {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.04, 10), flat(Palette.plate), 0, 0.02, 0));
  const fish = mesh(new THREE.ConeGeometry(0.06, 0.26, 5), flat(Palette.smokedFish), 0, 0.07, 0);
  fish.rotation.z = Math.PI / 2;
  g.add(fish);
  g.add(mesh(new THREE.IcosahedronGeometry(0.04, 0), flat(Palette.garnish), 0.06, 0.07, 0.08));
  return bake(g);
}
