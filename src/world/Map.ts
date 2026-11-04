import * as THREE from 'three';
import { FishingFeel, UnlockFeel, WaterSettings } from '../settings';
import { IceShore as Z, type RectArea } from '../content/zones';
import { range, seededRandom } from '../core/Random';
import { createCounter } from '../models/createCounter';
import { createFlatRingGeometry, createIceHole } from '../models/createFishingProps';
import { createIgloo, iglooTunnelStart } from '../models/createIgloo';
import { Palette } from '../render/Palette';
import type { FishingHole } from '../systems/Fishing';
import { createPines } from '../models/createPines';
import { createCrate, createFloes, createRocks, createSnowMounds } from '../models/createProps';
import { createGround, createIcePatches, createShoreBlocks, createWater, type Water } from '../models/createTerrain';
import { composeInstance, type InstanceTransform } from '../models/instancing';
import type { Collider } from '../systems/Collision';
import type { Walkable } from '../systems/Movement';

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

/** Overshooting ease for the unlock bounce. */
function easeOutBack(t: number): number {
  const c = 2.2;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

/** Zone 1 "Ice Shore" scene and its walkable area. */
export class WorldMap implements Walkable {
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly bounds: RectArea = Z.walkBounds;

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

  constructor(unlocked: readonly string[]) {
    this.group.name = 'world';
    const g = Z.ground;

    // Sales counter
    const c = Z.counter;
    const counter = createCounter(c.width, c.depth);
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
    this.water = createWater(170, 56, WaterSettings.waveHeight, WaterSettings.waveSpeed);
    this.water.mesh.position.set(0, Z.waterLevel, 0);
    this.group.add(this.water.mesh);
    this.group.add(createShoreBlocks(this.buildShoreBlocks()));

    // Igloo
    const ig = Z.igloo;
    const igloo = createIgloo(ig.radius, ig.tunnelLength, ig.tunnelWidth);
    igloo.position.set(ig.x, 0, ig.z);
    this.group.add(igloo);
    this.colliders.push({ kind: 'circle', x: ig.x, z: ig.z, r: ig.radius * 0.97 });
    const tunnelStart = iglooTunnelStart(ig.radius);
    this.colliders.push({
      kind: 'rect',
      minX: ig.x - ig.tunnelWidth / 2,
      maxX: ig.x + ig.tunnelWidth / 2,
      minZ: ig.z + tunnelStart,
      maxZ: ig.z + tunnelStart + ig.tunnelLength + 0.05,
    });

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

    // Trees: a few inside (with colliders) plus decorative belts outside
    const rand = seededRandom(Z.borderTrees.seed);
    const pines: InstanceTransform[] = Z.trees.map((t) => ({ x: t.x, z: t.z, scale: t.scale, rotY: rand() * 6 }));
    for (const t of Z.trees) {
      this.colliders.push({ kind: 'circle', x: t.x, z: t.z, r: Z.treeColliderRadius * t.scale });
    }
    const outsideWalk = (x: number, z: number) => !inside(Z.walkBounds, x, z, 0.6);
    for (const belt of [Z.borderTrees.west, Z.borderTrees.south]) {
      for (const p of scatter(rand, belt.area, belt.count, outsideWalk)) {
        pines.push({ x: p.x, z: p.z, scale: range(rand, 0.8, 1.5), rotY: rand() * 6 });
      }
    }
    this.group.add(createPines(pines));

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
    const clearOfStations = (x: number, z: number) =>
      Math.hypot(x - ig2.x, z - ig2.z) > ig2.radius + 2 &&
      Z.holes.every((h) => Math.hypot(x - h.x, z - h.z) > 2.6) &&
      Math.hypot(x - c.x, z - c.z) > 3;
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
    // North edge (z = minZ), then east edge (x = maxX)
    for (let x = -26; x < g.maxX; x += range(rand, 0.8, 1.3)) add(x, g.minZ - 0.3 + range(rand, -0.1, 0.15));
    for (let z = g.minZ; z < 30; z += range(rand, 0.8, 1.3)) add(g.maxX + 0.3 + range(rand, -0.15, 0.1), z);
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
      out.push(t);
      this.floes.push({ t, phase: rand() * Math.PI * 2 });
    }
    return out;
  }
}
