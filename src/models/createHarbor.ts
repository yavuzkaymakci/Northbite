import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HarborLayout as H } from '../content/zones';
import { seededRandom } from '../core/Random';
import { Palette, ScarfColors } from '../render/Palette';
import { bake } from './bake';
import { flat, mesh } from './materials';

// Harbour Pier models (GDD §25): pier, warehouse, the boat in its repair stages, the island lighthouse in its repair
// stages, seals, gulls and the loot rack. Low-poly, flat-shaded; static parts are baked into one mesh each.

const DECK_Y = 0.06;

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, rotY = 0): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(w, h, d), flat(color), x, y, z);
  m.rotation.y = rotY;
  return m;
}

function cyl(rt: number, rb: number, h: number, color: number, x: number, y: number, z: number, seg = 6): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), flat(color), x, y, z);
}

/** The pier deck, posts, bollards and rope rail, the warehouse, barrels, nets and a rotten hull on the beach. */
export function createPierScene(): THREE.Mesh {
  const g = new THREE.Group();
  const d = H.deck;
  const rand = seededRandom(91);
  // Planks across the deck (slightly uneven, a few darker ones).
  for (let x = d.minX; x < d.maxX - 0.01; x += 0.42) {
    const c = rand() < 0.2 ? Palette.pierWoodDark : rand() < 0.5 ? Palette.pierWoodLight : Palette.pierWood;
    g.add(box(0.4, 0.1, d.maxZ - d.minZ + 0.1, c, x + 0.21, DECK_Y - 0.03 + rand() * 0.02, (d.minZ + d.maxZ) / 2, (rand() - 0.5) * 0.02));
  }
  // Posts into the water and bollards with rope along both edges.
  for (let x = d.minX + 0.6; x < d.maxX; x += 2.2) {
    for (const z of [d.minZ, d.maxZ]) {
      g.add(cyl(0.13, 0.15, 1.5, Palette.pierWoodDark, x, -0.6, z));
      g.add(cyl(0.11, 0.12, 0.5, Palette.pierWood, x, 0.3, z));
    }
  }
  for (const z of [d.minZ + 0.02, d.maxZ - 0.02]) {
    const rope = mesh(new THREE.CylinderGeometry(0.025, 0.025, d.maxX - d.minX - 1.2, 4), flat(Palette.rope), (d.minX + d.maxX) / 2 + 0.3, 0.46, z);
    rope.rotation.z = Math.PI / 2;
    g.add(rope);
  }
  // A coil of rope and a few barrels on the deck end.
  g.add(cyl(0.32, 0.32, 0.12, Palette.rope, d.maxX - 0.6, DECK_Y + 0.08, d.maxZ - 0.45, 10));
  g.add(cyl(0.22, 0.22, 0.55, Palette.pierWoodDark, d.minX + 1.2, 0.33, d.maxZ - 0.35, 8));
  g.add(cyl(0.22, 0.22, 0.55, Palette.pierWood, d.minX + 1.65, 0.33, d.maxZ - 0.4, 8));
  // Warehouse: plank walls, a dark door, a pitched roof.
  const w = H.depot;
  g.add(box(w.width, 1.9, w.depth, Palette.pierWood, w.x, 0.95, w.z));
  g.add(box(0.9, 1.3, 0.05, Palette.pierWoodDark, w.x + 0.5, 0.65, w.z - w.depth / 2 - 0.02));
  for (const s of [-1, 1]) {
    const roof = box(w.width + 0.3, 0.12, w.depth * 0.62, Palette.cabinRoof, w.x, 2.2, w.z + s * w.depth * 0.26);
    roof.rotation.x = s * 0.55;
    g.add(roof);
  }
  g.add(box(0.5, 0.5, 0.05, Palette.lighthouseLamp, w.x - 0.8, 1.2, w.z - w.depth / 2 - 0.02));
  // Fishing nets hung on poles by the warehouse.
  for (const x of [w.x + 2.2, w.x + 3.2]) g.add(cyl(0.05, 0.06, 1.6, Palette.pierWoodDark, x, 0.8, w.z - 1.6));
  g.add(box(1.0, 0.9, 0.04, Palette.rope, w.x + 2.7, 0.95, w.z - 1.6));
  // Rotten hull lying on the beach.
  const hull = new THREE.Group();
  const ribs = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const rib = mesh(new THREE.TorusGeometry(0.55, 0.06, 4, 8, Math.PI), flat(Palette.hullRot), -0.9 + i * 0.45, 0.05, 0);
    rib.rotation.y = Math.PI / 2;
    rib.rotation.x = Math.PI;
    ribs.add(rib);
  }
  hull.add(ribs, box(2.2, 0.08, 0.14, Palette.hullRot, 0, -0.45, 0));
  hull.position.set(H.wreck.x, 0.5, H.wreck.z);
  hull.rotation.set(0.25, 0.6, 0.15);
  g.add(hull);
  return bake(g);
}

/** Loot rack: a low wooden shelf at the pier root. */
export function createLootRack(width: number, depth: number): THREE.Mesh {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.08, 0.6, 0.08, Palette.pierWoodDark, (sx * width) / 2.2, 0.3, (sz * depth) / 2.4));
  g.add(box(width, 0.06, depth, Palette.pierWood, 0, 0.58, 0));
  g.add(box(width, 0.05, depth, Palette.pierWoodLight, 0, 0.22, 0));
  return bake(g);
}

export interface BoatModel {
  root: THREE.Group;
  /** Sail (stage 2+), flutters a little. */
  sail: THREE.Object3D | null;
  /** Its own material so the boat can fade into the fog. */
  material: THREE.MeshStandardMaterial;
  /** Seats for seals aboard (local positions). */
  seats: THREE.Vector3[];
}

/**
 * The boat in its repair stage (GDD §25): 0 rotten hull (tilted, holes), 1 repaired and painted hull, 2 mast and
 * sail, 3 cabin with a red roof and a warm window. Faces +X (east, out to sea).
 */
export function createBoat(stage: number, windowMat: THREE.Material): BoatModel {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, transparent: true });
  const g = new THREE.Group();
  const hullColor = stage >= 1 ? Palette.hullPaint : Palette.hullRot;
  // Hull: a stretched, cut cylinder (half) with a pointed bow.
  const hull = mesh(new THREE.CylinderGeometry(0.85, 0.85, 3.2, 8, 1, false, 0, Math.PI), flat(hullColor), 0, 0.45, 0);
  hull.rotation.set(Math.PI, 0, Math.PI / 2);
  const bow = mesh(new THREE.ConeGeometry(0.85, 1.0, 8, 1, false, 0, Math.PI), flat(hullColor), 2.05, 0.45, 0);
  bow.rotation.set(Math.PI, 0, -Math.PI / 2);
  g.add(hull, bow);
  g.add(box(3.6, 0.08, 1.5, stage >= 1 ? Palette.pierWoodLight : Palette.pierWoodDark, 0.15, 0.48, 0));
  if (stage >= 1) {
    g.add(box(4.0, 0.1, 0.08, Palette.hullTrim, 0.2, 0.5, 0.8));
    g.add(box(4.0, 0.1, 0.08, Palette.hullTrim, 0.2, 0.5, -0.8));
  } else {
    // Holes and broken planks.
    g.add(box(0.5, 0.3, 0.05, Palette.deepSea, -0.6, 0.15, 0.84));
    g.add(box(0.35, 0.25, 0.05, Palette.deepSea, 0.8, 0.2, -0.84));
    g.add(box(0.9, 0.06, 0.18, Palette.pierWoodDark, -0.3, 0.6, 0.3, 0.6));
  }
  let sail: THREE.Object3D | null = null;
  if (stage >= 2) {
    g.add(cyl(0.06, 0.07, 3.0, Palette.pierWoodDark, 0.4, 1.95, 0));
    const boom = cyl(0.04, 0.04, 1.8, Palette.pierWoodDark, -0.35, 0.95, 0);
    boom.rotation.z = Math.PI / 2;
    g.add(boom);
  }
  if (stage >= 3) {
    g.add(box(1.2, 0.75, 1.1, Palette.pierWood, -0.95, 0.88, 0));
    const roof = box(1.4, 0.1, 1.3, Palette.cabinRoof, -0.95, 1.3, 0);
    roof.rotation.z = 0.08;
    g.add(roof, cyl(0.06, 0.06, 0.4, Palette.stone, -1.3, 1.5, 0.3));
  }
  const root = new THREE.Group();
  root.add(bake(g, { material }));
  if (stage >= 2) {
    // Triangular sail (with a patch) between the mast and the boom.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(-1.6, 0);
    shape.lineTo(0, 2.6);
    shape.closePath();
    const sg = new THREE.Group();
    const cloth = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: Palette.sail, side: THREE.DoubleSide, flatShading: true, transparent: true }));
    const patch = mesh(new THREE.PlaneGeometry(0.35, 0.3), new THREE.MeshStandardMaterial({ color: Palette.sailPatch, side: THREE.DoubleSide, transparent: true }), -0.45, 0.7, 0.01);
    sg.add(cloth, patch);
    sg.position.set(0.36, 1.0, 0);
    root.add(sg);
    sail = sg;
  }
  if (stage >= 3) {
    const win = mesh(new THREE.BoxGeometry(0.3, 0.25, 0.04), windowMat, -0.95, 0.95, 0.56);
    root.add(win);
  }
  if (stage === 0) root.rotation.z = 0.12;
  return { root, sail, material, seats: [new THREE.Vector3(1.4, 0.55, 0.3), new THREE.Vector3(1.0, 0.55, -0.35), new THREE.Vector3(-0.1, 0.55, 0.45)] };
}

/** Rocky island with a snow cap (the lighthouse stands on top of it). */
export function createIsland(radius: number): THREE.Mesh {
  const g = new THREE.Group();
  const rock = mesh(new THREE.IcosahedronGeometry(radius, 1), flat(Palette.islandRock), 0, -0.3, 0);
  rock.scale.set(1, 0.45, 0.8);
  const cap = mesh(new THREE.IcosahedronGeometry(radius * 0.7, 1), flat(Palette.islandSnow), 0, 0.45, 0);
  cap.scale.set(1, 0.3, 0.75);
  g.add(rock, cap);
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    const r = mesh(new THREE.IcosahedronGeometry(radius * 0.32, 0), flat(Palette.islandRock), Math.cos(a) * radius * 0.95, -0.1, Math.sin(a) * radius * 0.7);
    r.scale.y = 0.7;
    g.add(r);
  }
  return bake(g);
}

export interface LighthouseModel {
  root: THREE.Group;
  /** Lamp room glass (stage 4+) glows; the beam turns at stage 5. */
  lamp: THREE.Mesh | null;
  beam: THREE.Object3D | null;
}

/**
 * The captain's lighthouse by repair stage (GDD §25): 0 a broken stump, 1 the tower rebuilt, 2 red bands, 3 the
 * gallery and railing, 4 the lamp room, 5 the lamp lit with a turning beam. Each stage adds something you can see.
 */
export function createLighthouse(stage: number, lampMat: THREE.MeshStandardMaterial, beamMat: THREE.Material): LighthouseModel {
  const g = new THREE.Group();
  const towerH = stage >= 1 ? 4.2 : 1.8;
  g.add(cyl(0.75, 1.0, towerH, Palette.lighthouseWhite, 0, towerH / 2, 0, 10));
  if (stage === 0) {
    for (let i = 0; i < 5; i++) g.add(box(0.4, 0.3, 0.3, Palette.stone, Math.cos(i * 1.3) * 1.3, 0.15, Math.sin(i * 1.3) * 1.2, i));
  }
  if (stage >= 2) for (const y of [1.2, 2.6]) g.add(cyl(0.83, 0.88, 0.5, Palette.lighthouseRed, 0, y, 0, 10));
  if (stage >= 1) g.add(box(0.35, 0.6, 0.06, Palette.pierWoodDark, 0, 0.3, 0.98));
  if (stage >= 3) {
    g.add(cyl(1.0, 1.0, 0.12, Palette.stone, 0, towerH + 0.06, 0, 10));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.add(cyl(0.03, 0.03, 0.45, Palette.stone, Math.cos(a) * 0.95, towerH + 0.3, Math.sin(a) * 0.95, 4));
    }
  }
  if (stage >= 4) g.add(mesh(new THREE.ConeGeometry(0.75, 0.7, 10), flat(Palette.lighthouseRed), 0, towerH + 1.35, 0));
  const root = new THREE.Group();
  root.add(bake(g));
  let lamp: THREE.Mesh | null = null;
  let beam: THREE.Object3D | null = null;
  if (stage >= 4) {
    lamp = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.8, 10), lampMat, 0, towerH + 0.6, 0);
    root.add(lamp);
  }
  if (stage >= 5) {
    // Two long additive cones turning around the lamp.
    const b = new THREE.Group();
    for (const s of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.4, 16, 12, 1, true), beamMat);
      cone.rotation.z = (s * Math.PI) / 2;
      cone.position.x = s * 8;
      b.add(cone);
    }
    b.position.y = towerH + 0.6;
    root.add(b);
    beam = b;
  }
  return { root, lamp, beam };
}

export interface SealModel {
  root: THREE.Group;
  head: THREE.Object3D;
}

/** A round grey seal with a scarf (GDD §25 C4): body, head, whiskers, flippers. */
export function createSeal(scarf: number): SealModel {
  const body = new THREE.Group();
  const torso = mesh(new THREE.IcosahedronGeometry(0.42, 1), flat(Palette.seal), 0, 0.32, 0);
  torso.scale.set(0.85, 0.75, 1.35);
  const belly = mesh(new THREE.IcosahedronGeometry(0.34, 1), flat(Palette.sealBelly), 0, 0.22, 0.12);
  belly.scale.set(0.8, 0.6, 1.2);
  const tail = mesh(new THREE.ConeGeometry(0.2, 0.4, 5), flat(Palette.seal), 0, 0.18, -0.65);
  tail.rotation.x = -Math.PI / 2;
  for (const s of [-1, 1]) {
    const fl = box(0.28, 0.05, 0.14, Palette.seal, s * 0.36, 0.12, 0.18, s * 0.5);
    body.add(fl);
  }
  body.add(torso, belly, tail);
  const head = new THREE.Group();
  head.add(mesh(new THREE.IcosahedronGeometry(0.27, 1), flat(Palette.seal), 0, 0, 0));
  head.add(mesh(new THREE.IcosahedronGeometry(0.13, 0), flat(Palette.sealBelly), 0, -0.05, 0.2));
  head.add(mesh(new THREE.SphereGeometry(0.035, 5, 4), flat(Palette.bearNose), 0, -0.01, 0.31));
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.035, 5, 4), flat(Palette.bearNose), s * 0.1, 0.08, 0.21));
    const wh = box(0.16, 0.01, 0.01, Palette.sealBelly, s * 0.13, -0.05, 0.27, s * 0.2);
    head.add(wh);
  }
  const ring = mesh(new THREE.TorusGeometry(0.2, 0.06, 4, 10), flat(ScarfColors[scarf % ScarfColors.length] as number), 0, -0.2, 0);
  ring.rotation.x = Math.PI / 2;
  head.add(ring);
  head.position.set(0, 0.62, 0.38);
  const root = new THREE.Group();
  root.add(bake(body), head);
  return { root, head };
}

/** Gull: body and two wings in one geometry (for an InstancedMesh). */
export function createGullGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.IcosahedronGeometry(0.12, 0);
  body.scale(1, 0.8, 2);
  parts.push(body.index ? body.toNonIndexed() : body);
  for (const s of [-1, 1]) {
    const wing = new THREE.BoxGeometry(0.5, 0.02, 0.16);
    wing.rotateZ(s * 0.35);
    wing.translate(s * 0.26, 0.06, 0);
    parts.push(wing.index ? wing.toNonIndexed() : wing);
  }
  return mergeGeometries(parts) as THREE.BufferGeometry;
}

/** Giant fish sign: a red-and-white buoy bobbing off the pier end. */
export function createBuoy(): THREE.Mesh {
  const g = new THREE.Group();
  g.add(cyl(0.22, 0.3, 0.4, Palette.lighthouseWhite, 0, 0.2, 0, 8));
  g.add(cyl(0.23, 0.23, 0.14, Palette.lighthouseRed, 0, 0.3, 0, 8));
  g.add(cyl(0.03, 0.03, 0.5, Palette.stone, 0, 0.6, 0, 4));
  g.add(mesh(new THREE.ConeGeometry(0.12, 0.2, 4), flat(Palette.giantMarker), 0, 0.92, 0));
  return bake(g);
}

export const HARBOR_DECK_Y = DECK_Y;
