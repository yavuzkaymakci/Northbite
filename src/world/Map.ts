import * as THREE from 'three';
import { FishingFeel, UnlockFeel, WaterSettings } from '../settings';
import { CampLayout, CaveLayout, HarborLayout, Regions, TeaserWalls, ThreatLayout, IceShore as Z, type RectArea } from '../content/zones';
import { easeOutBack } from '../core/Ease';
import { range, seededRandom } from '../core/Random';
import { bake } from '../models/bake';
import { createRodBench } from '../models/createBench';
import { createCounter } from '../models/createCounter';
import { createFlatRingGeometry, createIceHole } from '../models/createFishingProps';
import { createHut, createMarketStall, hutScale, hutWindows } from '../models/createHut';
import { createPierSilhouette, createSignPost } from '../models/createTeaser';
import { createSlope } from '../models/createThreatProps';
import { createLightPool, NightLights } from '../render/NightLights';
import { Palette } from '../render/Palette';
import type { Appear } from '../systems/Appear';
import type { FishingHole } from '../systems/Fishing';
import { createPines } from '../models/createPines';
import { createCrate, createFloes, createRocks, createSnowMounds } from '../models/createProps';
import { createGround, createIcePatches, createShoreBlocks, createWater, type Water } from '../models/createTerrain';
import { composeInstance, type InstanceTransform } from '../models/instancing';
import type { Collider } from '../systems/Collision';
import type { Walkable } from '../systems/Movement';
import { IceWall } from './IceWall';

const SHORE_INSET = 0.9; // bare-ice band width along the water edge

function inside(area: RectArea, x: number, z: number, margin = 0): boolean {
  return x > area.minX - margin && x < area.maxX + margin && z > area.minZ - margin && z < area.maxZ + margin;
}

function scatter(rand: () => number, area: RectArea, count: number, accept: (x: number, z: number) => boolean): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  for (let tries = 0; out.length < count && tries < count * 30; tries++) {
    const x = range(rand, area.minX, area.maxX);
    const z = range(rand, area.minZ, area.maxZ);
    if (accept(x, z)) out.push({ x, z });
  }
  return out;
}

interface Floe {
  t: InstanceTransform;
  phase: number;
}

interface HoleVisual {
  hole: FishingHole;
  group: THREE.Group;
  ring: THREE.Mesh;
  /** 0..1 bounce-in progress; 1 = settled. */
  appear: number;
}

/** Ice Shore scene (zone 1) plus the Smokehouse yard behind its ice wall, the slope west of it, and the walkable area. */
export class WorldMap implements Walkable {
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  /** Walking limit: the original walk area plus the Harbour Pier strip (its colliders close the rest). */
  readonly bounds: RectArea = Z.moveBounds;
  private readonly walls = new Map<string, IceWall>();
  private hutBuilt = false;
  private hutLevel = 0;
  private hutMesh: THREE.Object3D | null = null;
  private hutCollider: Collider | null = null;
  private readonly padMaterial = new THREE.MeshBasicMaterial({
    color: Palette.benchPad,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  private readonly water: Water;
  private readonly floes: Floe[] = [];
  private readonly floeMesh: THREE.InstancedMesh;
  private readonly tmp = new THREE.Matrix4();
  private readonly holeVisuals: HoleVisual[] = [];
  private readonly holeList: FishingHole[] = [];
  private readonly ringMaterial = new THREE.MeshBasicMaterial({
    color: Palette.shadowBlue,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  constructor(unlocked: readonly string[], regions: readonly string[]) {
    this.group.name = 'world';
    const g = Z.ground;

    // Sales counter
    const c = Z.counter;
    const counter = bake(createCounter(c.width, c.depth));
    counter.position.set(c.x, 0, c.z);
    this.group.add(counter);
    this.colliders.push({
      kind: 'rect',
      minX: c.x - c.width / 2 - 0.06,
      maxX: c.x + c.width / 2 + 0.06,
      minZ: c.z - c.depth / 2 - 0.1,
      maxZ: c.z + c.depth / 2 + 0.06,
    });

    // Fishing holes that are already open
    for (const h of Z.holes) {
      if (h.unlock === null || unlocked.includes(h.unlock)) this.openHole(h.id, false);
    }

    // Ground, shore and water
    this.group.add(createGround(g, SHORE_INSET));
    // Patches go on the main slab or the camp land, never on the water between them.
    const onLand = (x: number, z: number) => (inside(g, x, z) && x <= g.maxX - 0.4) || inside(CampLayout.land, x, z, -0.4);
    this.water = createWater(170, 56, WaterSettings.waveHeight, WaterSettings.waveSpeed);
    this.water.mesh.position.set(0, Z.waterLevel, 0);
    this.group.add(this.water.mesh);
    this.group.add(createShoreBlocks(this.buildShoreBlocks()));

    // The igloo (its level, door light and collider) is built by systems/Igloo.ts.

    // Crates (rect colliders use the AABB of the slightly rotated box)
    for (const c of Z.crates) {
      for (let level = 0; level < c.stack; level++) {
        const crate = createCrate(c.size);
        crate.position.set(c.x, level * c.size, c.z);
        crate.rotation.y = c.rotation + level * 0.25;
        this.group.add(crate);
      }
      const angle = Math.abs(c.rotation) + (c.stack > 1 ? 0.25 : 0);
      const half = (c.size / 2) * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
      this.colliders.push({ kind: 'rect', minX: c.x - half, maxX: c.x + half, minZ: c.z - half, maxZ: c.z + half });
    }

    // Trees: a few inside (with colliders), solid belts inside the bounds, decorative belts outside
    const rand = seededRandom(Z.borderTrees.seed);
    const pines: InstanceTransform[] = Z.trees.map((t) => ({ x: t.x, z: t.z, scale: t.scale, rotY: rand() * 6 }));
    for (const t of Z.trees) {
      this.colliders.push({ kind: 'circle', x: t.x, z: t.z, r: Z.treeColliderRadius * t.scale });
    }
    const inGap = (x: number, z: number) => Z.borderTrees.gaps.some((a) => inside(a, x, z));
    const outsideWalk = (x: number, z: number) => !inside(Z.walkBounds, x, z, 0.6) && !inGap(x, z);
    for (const belt of Z.borderTrees.belts) {
      for (const p of scatter(rand, belt.area, belt.count, outsideWalk)) {
        pines.push({ x: p.x, z: p.z, scale: range(rand, 0.8, 1.5), rotY: rand() * 6 });
      }
    }
    for (const w of Z.treeWalls) {
      this.colliders.push({ kind: 'rect', minX: w.minX, maxX: w.maxX, minZ: w.minZ, maxZ: w.maxZ });
      const area = { minX: w.minX + 0.5, maxX: w.maxX - 0.5, minZ: w.minZ + 0.5, maxZ: w.maxZ - 0.5 };
      for (const p of scatter(rand, area, w.count, () => true)) {
        pines.push({ x: p.x, z: p.z, scale: range(rand, 0.95, 1.4), rotY: rand() * 6 });
      }
    }
    this.group.add(createPines(pines));
    // Snowy slope west of the smokehouse yard; avalanches come down its chute (GDD §13).
    this.group.add(createSlope(ThreatLayout.slope, ThreatLayout.avalanche.pileZ, CaveLayout.area));

    // Hot Spring Camp land east of the shore (GDD §15): its own slab, with open water and ice ridges around it.
    this.group.add(createGround(CampLayout.land, SHORE_INSET));
    for (const b of CampLayout.blockers) {
      this.colliders.push({ kind: 'rect', minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, water: b.water });
    }

    // Ice walls: one per region still locked, plus the teaser walls that never open in this demo.
    for (const r of Regions) {
      if (regions.includes(r.id)) continue;
      const wall = new IceWall(r.wall, r.wall.height, 31);
      this.walls.set(r.id, wall);
      this.group.add(wall.root);
      this.colliders.push(wall.collider);
    }
    for (const tw of TeaserWalls) {
      const wall = new IceWall(tw.wall, tw.wall.height, 57);
      this.group.add(wall.root);
      this.colliders.push(wall.collider);
      const sign = createSignPost();
      sign.position.set(tw.sign.x, 0, tw.sign.z);
      sign.rotation.y = 0.2;
      const pier = createPierSilhouette();
      pier.position.set(tw.silhouette.x, 0, tw.silhouette.z);
      this.group.add(sign, pier);
    }

    // Rod bench next to the igloo, with the pad you stand on
    const b = Z.bench;
    const bench = createRodBench(b.width, b.depth);
    bench.position.set(b.x, 0, b.z);
    this.group.add(bench);
    this.colliders.push({ kind: 'rect', minX: b.x - b.width / 2, maxX: b.x + b.width / 2, minZ: b.z - b.depth / 2, maxZ: b.z + b.depth / 2 });
    const pad = new THREE.Mesh(createFlatRingGeometry(b.pad.radius, b.pad.radius - 0.16, 32), this.padMaterial);
    pad.position.set(b.pad.x, 0.025, b.pad.z);
    const padFill = new THREE.Mesh(
      new THREE.CylinderGeometry(b.pad.radius - 0.16, b.pad.radius - 0.16, 0.01, 24),
      new THREE.MeshBasicMaterial({ color: Palette.benchPad, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    padFill.position.set(b.pad.x, 0.02, b.pad.z);
    this.group.add(pad, padFill);

    // Rocks
    const rockRand = seededRandom(21);
    this.group.add(
      createRocks(
        Z.rocks.map((r) => ({ x: r.x, y: 0.05, z: r.z, scale: r.radius, sy: 0.65, rotY: rockRand() * 6 })),
      ),
    );
    for (const r of Z.rocks) this.colliders.push({ kind: 'circle', x: r.x, z: r.z, r: r.radius * 0.9 });

    // Decoration: snow mounds outside the walk area, ice patches inside it
    const moundRand = seededRandom(Z.snowMounds.seed);
    const moundArea: RectArea = { minX: g.minX + 2, maxX: g.maxX - 2, minZ: g.minZ + 2, maxZ: 26 };
    this.group.add(
      createSnowMounds(
        scatter(moundRand, moundArea, Z.snowMounds.count, outsideWalk).map((p) => {
          const s = range(moundRand, 0.6, 1.6);
          return { x: p.x, z: p.z, scale: s, sy: 0.32, rotY: moundRand() * 6 };
        }),
      ),
    );
    const patchRand = seededRandom(Z.icePatches.seed);
    const ig2 = Z.igloo;
    const stations = [Z.bench, Z.hut, Z.smokehouse, Z.net.basket];
    const clearOfStations = (x: number, z: number) =>
      Math.hypot(x - ig2.x, z - ig2.z) > ig2.radius + 2 &&
      Z.holes.every((h) => Math.hypot(x - h.x, z - h.z) > 2.6) &&
      Math.hypot(x - c.x, z - c.z) > 3 &&
      stations.every((s) => Math.hypot(x - s.x, z - s.z) > 2.8) &&
      !Z.treeWalls.some((w) => inside(w, x, z, 0.8)) &&
      !inside(CaveLayout.area, x, z, 0.5) &&
      Math.hypot(x - CampLayout.pool.x, z - CampLayout.pool.z) > CampLayout.pool.radius + 1 &&
      onLand(x, z);
    this.group.add(
      createIcePatches(
        scatter(patchRand, Z.walkBounds, Z.icePatches.count, clearOfStations).map(
          (p) => ({ x: p.x, y: 0.005, z: p.z, scale: range(patchRand, 0.4, 1.0), sx: range(patchRand, 1, 1.6), sy: 1, rotY: patchRand() * 6 }),
        ),
      ),
    );

    // Floating ice floes
    this.floeMesh = createFloes(this.buildFloes());
    this.group.add(this.floeMesh);
  }

  /** Fishing holes the player can use right now. */
  get openHoles(): readonly FishingHole[] {
    return this.holeList;
  }

  /** Water material (the atmosphere tints it by time of day). */
  get waterMaterial(): THREE.MeshStandardMaterial {
    return this.water.mesh.material as THREE.MeshStandardMaterial;
  }

  addCollider(c: Collider): void {
    this.colliders.push(c);
  }

  removeCollider(c: Collider): void {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  /** The ice wall in front of a locked region. */
  wallFor(regionId: string): IceWall | undefined {
    return this.walls.get(regionId);
  }

  /** The way into a region is free: its wall stops blocking (the break animation is played by the wall). */
  openRegion(regionId: string): void {
    const wall = this.walls.get(regionId);
    if (wall) this.removeCollider(wall.collider);
  }

  /** Penguin Market stall (GDD §24) with the pad you stand on (same look as the rod bench pad). */
  buildMarket(appear: Appear | null): void {
    const m = Z.market;
    const stall = createMarketStall(m.width, m.depth);
    stall.position.set(m.x, 0, m.z);
    const pad = new THREE.Mesh(createFlatRingGeometry(m.pad.radius, m.pad.radius - 0.16, 32), this.padMaterial);
    pad.position.set(m.pad.x, 0.025, m.pad.z);
    this.group.add(stall, pad);
    this.colliders.push({ kind: 'rect', minX: m.x - m.width / 2, maxX: m.x + m.width / 2, minZ: m.z - m.depth / 2, maxZ: m.z + m.depth / 2 });
    appear?.add(stall);
  }

  /** Penguin hut (from the "hut" unlock). A higher level (GDD §24) rebuilds it bigger, with more windows. */
  buildHut(appear: Appear | null, level = 1): void {
    if (this.hutBuilt && this.hutLevel === level) return;
    if (this.hutMesh) {
      this.group.remove(this.hutMesh);
      if (this.hutCollider) this.removeCollider(this.hutCollider);
    }
    this.hutBuilt = true;
    this.hutLevel = level;
    const h = Z.hut;
    const hut = createHut(h.width, h.depth, level);
    hut.position.set(h.x, 0, h.z);
    for (const w of hutWindows(h.width, h.depth, level)) {
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, 0.04), NightLights.window);
      glass.position.set(w.x, w.y, w.z);
      hut.add(glass);
    }
    const pool = createLightPool(2.2, 1.4);
    pool.position.set(0, 0.04, h.depth / 2 + 0.8);
    hut.add(pool);
    this.group.add(hut);
    this.hutMesh = hut;
    const k = hutScale(level);
    // The lean-to (level 2+) adds room behind the hut.
    const back = level >= 2 ? 0.7 : 0;
    this.hutCollider = {
      kind: 'rect',
      minX: h.x - (h.width / 2) * k - 0.1,
      maxX: h.x + (h.width / 2) * k + 0.1,
      minZ: h.z - (h.depth / 2 + back) * k - 0.1,
      maxZ: h.z + (h.depth / 2) * k + 0.1,
    };
    this.colliders.push(this.hutCollider);
    appear?.add(hut);
  }

  /** Adds a fishing hole (and its collider). `animate` plays the unlock bounce. */
  openHole(id: string, animate: boolean): void {
    const def = Z.holes.find((h) => h.id === id);
    if (!def || this.holeList.some((h) => h.id === id)) return;
    const hole: FishingHole = { id, x: def.x, z: def.z };
    const group = createIceHole(FishingFeel.holeColliderRadius - 0.1);
    group.position.set(def.x, 0, def.z);
    const ring = new THREE.Mesh(
      createFlatRingGeometry(FishingFeel.interactRadius, FishingFeel.interactRadius - 0.12, 40),
      this.ringMaterial,
    );
    ring.position.set(def.x, 0.02, def.z);
    this.group.add(group, ring);
    this.holeList.push(hole);
    this.holeVisuals.push({ hole, group, ring, appear: animate ? 0 : 1 });
    if (animate) group.scale.setScalar(0.001);
    this.colliders.push({ kind: 'circle', x: def.x, z: def.z, r: FishingFeel.holeColliderRadius });
  }

  update(dt: number, time: number): void {
    this.water.update(time);
    this.ringMaterial.opacity = 0.4 + Math.sin(time * 3) * 0.15;
    this.padMaterial.opacity = 0.55 + Math.sin(time * 3 + 1) * 0.2;
    for (const [id, wall] of this.walls) {
      wall.update(dt);
      if (wall.phase === 'gone') this.walls.delete(id);
    }
    for (const v of this.holeVisuals) {
      if (v.appear >= 1) continue;
      v.appear = Math.min(v.appear + dt / UnlockFeel.bounceTime, 1);
      const s = Math.max(easeOutBack(v.appear), 0.001);
      v.group.scale.set(s, s, s);
      v.ring.scale.set(s, 1, s);
    }
    // Floes bob and rock gently on the waves.
    for (let i = 0; i < this.floes.length; i++) {
      const f = this.floes[i] as Floe;
      const base = f.t;
      const bob = Math.sin(time * 1.1 + f.phase) * 0.06;
      composeInstance({ ...base, y: (base.y ?? 0) + bob }, this.tmp, Math.sin(time * 0.9 + f.phase) * 0.04, Math.cos(time * 0.7 + f.phase) * 0.04);
      this.floeMesh.setMatrixAt(i, this.tmp);
    }
    this.floeMesh.instanceMatrix.needsUpdate = true;
  }

  private buildShoreBlocks(): InstanceTransform[] {
    const g = Z.ground;
    const rand = seededRandom(17);
    const blocks: InstanceTransform[] = [];
    const add = (x: number, z: number) => {
      const s = range(rand, 0.55, 1.0);
      blocks.push({ x, y: range(rand, -0.32, -0.12), z, sx: s * range(rand, 0.9, 1.4), sy: 0.5, sz: s, scale: 1, rotY: range(rand, -0.4, 0.4) });
    };
    // North edge (z = minZ), then east edge (x = maxX); the camp land joins the east edge between its ends.
    const camp = CampLayout.land;
    for (let x = -26; x < g.maxX; x += range(rand, 0.8, 1.3)) add(x, g.minZ - 0.3 + range(rand, -0.1, 0.15));
    const deck = HarborLayout.deck;
    for (let z = g.minZ; z < 30; z += range(rand, 0.8, 1.3)) {
      if (z > camp.minZ - 0.4 && z < camp.maxZ + 0.4) continue;
      if (z > deck.minZ - 0.5 && z < deck.maxZ + 0.5) continue; // the pier runs out to sea here
      add(g.maxX + 0.3 + range(rand, -0.15, 0.1), z);
    }
    // Camp shores: north, east and south.
    for (let x = camp.minX; x < camp.maxX; x += range(rand, 0.8, 1.3)) {
      add(x, camp.minZ - 0.3 + range(rand, -0.1, 0.15));
      add(x, camp.maxZ + 0.3 + range(rand, -0.15, 0.1));
    }
    for (let z = camp.minZ; z < camp.maxZ; z += range(rand, 0.8, 1.3)) add(camp.maxX + 0.3 + range(rand, -0.15, 0.1), z);
    // Ice ridges beside the bridge (the camp blockers that are not water).
    for (const b of CampLayout.blockers) {
      if (b.water) continue;
      for (let z = b.minZ + 0.3; z < b.maxZ; z += 0.7) blocks.push({ x: (b.minX + b.maxX) / 2, y: 0.1, z, sx: 0.9, sy: 0.9, sz: 0.8, scale: 1, rotY: range(rand, -0.3, 0.3) });
    }
    return blocks;
  }

  private buildFloes(): InstanceTransform[] {
    const g = Z.ground;
    const f = Z.floes;
    const rand = seededRandom(f.seed);
    const out: InstanceTransform[] = [];
    for (let i = 0; i < f.count; i++) {
      const dist = range(rand, f.minDistFromShore, f.maxDistFromShore);
      const north = rand() < 0.55;
      const x = north ? range(rand, -24, g.maxX + 18) : g.maxX + dist;
      const z = north ? g.minZ - dist : range(rand, g.minZ - 10, 28);
      const s = range(rand, 0.5, 1.6);
      const t: InstanceTransform = { x, y: Z.waterLevel, z, scale: s, sy: 0.28, sx: range(rand, 0.8, 1.3), rotY: rand() * 6 };
      if (inside(CampLayout.land, x, z, 1.5 + s)) continue; // no floes on the camp land
      // Keep the pier, the boat's way out and the island clear.
      if (inside({ minX: 10, maxX: 42, minZ: 13, maxZ: 27 }, x, z, s)) continue;
      if (Math.hypot(x - HarborLayout.island.x, z - HarborLayout.island.z) < HarborLayout.island.radius + 2 + s) continue;
      out.push(t);
      this.floes.push({ t, phase: rand() * Math.PI * 2 });
    }
    return out;
  }
}
