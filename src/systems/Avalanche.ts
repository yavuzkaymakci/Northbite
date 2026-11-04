import * as THREE from 'three';
import { t, tf } from '../content/strings';
import { Threats } from '../content/threats';
import { PathGraph, ThreatLayout } from '../content/zones';
import { HapticsSettings, PlayerFeel, ThreatFeel as F } from '../settings';
import { easeOutBack } from '../core/Ease';
import type { GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import { createChest, createShovel, type ChestModel } from '../models/createThreatProps';
import { flat } from '../models/materials';
import type { CameraRig } from '../render/CameraRig';
import type { Effects } from '../render/Effects';
import { Palette } from '../render/Palette';
import type { Banner } from '../ui/Banner';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import type { WorldMap } from '../world/Map';
import type { CircleCollider, Collider } from './Collision';
import type { CoinSystem } from './Coins';
import { rollChest } from './ThreatLogic';
import type { ThreatBuildings } from './ThreatBuildings';
import type { DigSite } from './WorkerBrain';
import type { Workers } from './Workers';

const A = ThreatLayout.avalanche;
const C = A.corridor;
const A_T = Threats.avalanche;
const DIG_NODE = PathGraph.nodes[A.digNode];

type Phase = 'off' | 'warning' | 'down';

interface Pile {
  id: number;
  x: number;
  z: number;
  collider: CircleCollider;
  /** 0..1 rise animation; the collider is in place from the start of the fall. */
  rise: number;
  delay: number;
  dig: number;
  age: number;
  rot: number;
  chest: boolean;
}

interface Chest {
  model: ChestModel;
  coins: number;
  open: number;
  appear: number;
}

/**
 * Avalanche (GDD §13). Warning: the ground shakes, snow streams off the slope, the corridor is striped red.
 * Then snow piles close the corridor (cutting the yard's north part off). Standing next to a pile shovels it away in
 * ~2 s; idle penguins help; left alone they melt. About half of the avalanches bury a chest. A snow fence keeps the
 * corridor open (the warning still comes). Never saved: a reload starts with a clear corridor.
 */
export class Avalanche {
  private phase: Phase = 'off';
  private timer = 0;
  private fenced = false;
  private readonly piles: Pile[] = [];
  private readonly pileMesh: THREE.InstancedMesh;
  private readonly stripes: THREE.Mesh;
  private readonly stripeMat: THREE.MeshBasicMaterial;
  private readonly shovel: THREE.Mesh;
  private readonly digLabel: WorldLabel;
  private readonly hintLabel: WorldLabel;
  private readonly owned = new Set<Collider>();
  private chest: Chest | null = null;
  private nextId = 1;
  private puffTimer = 0;
  private digFxTimer = 0;
  private push: { fromX: number; fromZ: number; toX: number; toZ: number; t: number } | null = null;
  /** True while the player is shoveling (the game shows the shovel pose). */
  digging = false;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly v = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly state: GameState,
    private readonly player: Player,
    private readonly world: WorldMap,
    private readonly workers: Workers,
    private readonly coins: CoinSystem,
    private readonly fx: Effects,
    private readonly rig: CameraRig,
    private readonly labels: WorldLabels,
    private readonly banner: Banner,
    private readonly buildings: ThreatBuildings,
  ) {
    this.pileMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), flat(Palette.snow), A.pileXs.length + 4);
    this.pileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pileMesh.frustumCulled = false;
    this.pileMesh.count = 0;
    scene.add(this.pileMesh);

    this.stripeMat = new THREE.MeshBasicMaterial({
      color: Palette.avalancheStripe,
      map: stripeTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const w = C.maxX - C.minX;
    const d = C.maxZ - C.minZ;
    (this.stripeMat.map as THREE.Texture).repeat.set(w / 2, d / 2);
    this.stripes = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.stripeMat);
    this.stripes.rotation.x = -Math.PI / 2;
    this.stripes.position.set((C.minX + C.maxX) / 2, 0.03, (C.minZ + C.maxZ) / 2);
    this.stripes.visible = false;
    this.stripes.renderOrder = 1;
    scene.add(this.stripes);

    this.shovel = createShovel();
    this.shovel.visible = false;
    player.attachToHand(this.shovel);

    this.digLabel = labels.create('scare-ring dig-ring', '<div class="ring-fill"></div>');
    this.hintLabel = labels.create('bear-hint');
    workers.setDigging(
      () => this.digSite(),
      (id) => this.piles.some((p) => p.id === id),
    );
  }

  get active(): boolean {
    return this.phase !== 'off';
  }

  get warning(): boolean {
    return this.phase === 'warning';
  }

  /** Edge arrow target during the warning: the middle of the corridor. */
  arrowTarget(out: THREE.Vector3): THREE.Vector3 | null {
    return this.phase === 'warning' ? out.set((C.minX + C.maxX) / 2, 0.5, (C.minZ + C.maxZ) / 2) : null;
  }

  isPile(c: Collider): boolean {
    return this.owned.has(c);
  }

  start(): void {
    this.fenced = this.buildings.isBuilt('snowFence');
    this.state.stats.avalanches++;
    this.phase = 'warning';
    this.timer = A_T.warning;
    this.stripes.visible = true;
    this.banner.show(t('avalancheWarning'), 'warn', A_T.warning);
    vibrate(HapticsSettings.avalancheRumble);
  }

  stop(): void {
    for (const p of this.piles) this.removePile(p);
    this.piles.length = 0;
    this.phase = 'off';
    this.stripes.visible = false;
    this.labels.show(this.digLabel, false);
    this.labels.show(this.hintLabel, false);
  }

  update(dt: number, time: number): void {
    this.updateChest(dt);
    this.updatePush(dt);
    this.digging = false;
    if (this.phase === 'off') {
      this.renderPiles(time);
      return;
    }
    this.timer -= dt;
    if (this.phase === 'warning') {
      this.rig.shake(F.shakeWarning);
      this.stripeMat.opacity = 0.32 + Math.sin(time * F.stripePulse * Math.PI) * 0.18;
      this.puffTimer -= dt;
      if (this.puffTimer <= 0) {
        // Snow streams off the slope foot.
        this.puffTimer = 0.12;
        const z = C.minZ + Math.random() * (C.maxZ - C.minZ);
        this.fx.snowPuff(C.minX - 0.6 - Math.random() * 1.5, 0.4 + Math.random() * 1.2, z, 0.45, 0.8);
      }
      if (this.timer <= 0) this.fall();
    } else {
      this.updatePiles(dt);
      if (this.piles.length === 0) this.stop();
    }
    this.renderPiles(time);
  }

  // ---------- fall ----------

  private fall(): void {
    this.phase = 'down';
    this.stripes.visible = false;
    this.rig.shake(F.shakeFall);
    vibrate(HapticsSettings.avalancheRumble);
    if (this.fenced) {
      // The fence holds: snow heaps up against it, the corridor stays open.
      const f = A.fence;
      for (let i = 0; i < 4; i++) {
        const z = f.minZ + ((i + 0.5) / 4) * (f.maxZ - f.minZ);
        this.fx.snowPuff(f.x - 0.8, 0.5, z, 0.8, 0.3);
        this.fx.splash(f.x - 0.4, 0.5, z, 10, 2.2);
      }
      this.banner.show(t('avalancheFenced'), 'good');
      this.phase = 'off';
      return;
    }
    const chestCoins = rollChest(Math.random);
    const chestAt = chestCoins === null ? -1 : Math.floor(Math.random() * A.pileXs.length);
    A.pileXs.forEach((x, i) => {
      const collider: CircleCollider = { kind: 'circle', x, z: A.pileZ, r: A.pileRadius };
      this.piles.push({
        id: this.nextId++,
        x,
        z: A.pileZ,
        collider,
        rise: 0,
        delay: i * F.pileStagger,
        dig: 0,
        age: 0,
        rot: Math.random() * 6,
        chest: i === chestAt,
      });
      this.world.addCollider(collider);
      this.owned.add(collider);
    });
    this.pendingChest = chestCoins ?? 0;
    this.pushPlayerOut();
    if (!this.state.stats.avalanches || this.state.stats.avalanches <= 1) {
      this.hintLabel.el.textContent = t('avalancheDig');
      this.hintLabel.anchor.set(-17, 2.2, A.pileZ);
      this.labels.pop(this.hintLabel);
    }
  }

  private pendingChest = 0;

  /** Anyone standing in the corridor is nudged to the nearest safe side. */
  private pushPlayerOut(): void {
    const p = this.player.state;
    const r = A.pileRadius + PlayerFeel.radius;
    if (p.x < C.minX - r || p.x > C.maxX + r || p.z < C.minZ - r || p.z > C.maxZ + r) return;
    const southOk = p.x < A.southBlocked.minX || p.x > A.southBlocked.maxX;
    const toNorth = !southOk || Math.abs(p.z - A.safeNorthZ) < Math.abs(p.z - A.safeSouthZ);
    this.push = { fromX: p.x, fromZ: p.z, toX: p.x, toZ: toNorth ? A.safeNorthZ : A.safeSouthZ, t: 0 };
  }

  private updatePush(dt: number): void {
    const push = this.push;
    if (!push) return;
    push.t = Math.min(push.t + dt / F.pushTime, 1);
    const k = 1 - Math.pow(1 - push.t, 2);
    const p = this.player.state;
    p.x = push.fromX + (push.toX - push.fromX) * k;
    p.z = push.fromZ + (push.toZ - push.fromZ) * k;
    if (push.t >= 1) this.push = null;
  }

  // ---------- piles ----------

  private updatePiles(dt: number): void {
    const p = this.player.state;
    const reach = A.pileRadius + PlayerFeel.radius + 0.35;
    let shown: Pile | null = null;
    for (let i = this.piles.length - 1; i >= 0; i--) {
      const pile = this.piles[i] as Pile;
      if (pile.delay > 0) {
        pile.delay -= dt;
        if (pile.delay <= 0) {
          this.fx.snowPuff(pile.x - 0.5, 0.6, pile.z, 0.9, 0.9);
          this.fx.splash(pile.x, 0.6, pile.z, 12, 2.6);
        }
        continue;
      }
      pile.rise = Math.min(pile.rise + dt / F.pileRiseTime, 1);
      pile.age += dt;

      // Shoveling: the player next to it, or a penguin assigned to it.
      const playerDigs = pile.rise >= 1 && Math.hypot(p.x - pile.x, p.z - pile.z) <= reach;
      const penguinDigs = this.workers.brains.some((b) => b.phase === 'digging' && b.digId === pile.id);
      if (playerDigs || penguinDigs) {
        pile.dig += dt / A_T.digTime;
        if (playerDigs) {
          this.digging = true;
          shown = pile;
          this.player.faceToward(pile.x, pile.z, dt);
        }
        this.digFxTimer -= dt;
        if (this.digFxTimer <= 0) {
          this.digFxTimer = 0.22;
          this.fx.splash(pile.x + (Math.random() - 0.5), 0.7, pile.z + (Math.random() - 0.5), 5, 1.8);
          if (playerDigs) vibrate(HapticsSettings.dig);
        }
      } else {
        pile.dig = Math.max(pile.dig - dt * 0.25, 0);
      }
      if (pile.dig >= 1) {
        this.fx.snowPuff(pile.x, 0.5, pile.z, 0.9, 0.4);
        this.fx.splash(pile.x, 0.5, pile.z, 16, 2.4);
        this.clearPile(i);
      } else if (pile.age >= A_T.meltTime) {
        this.clearPile(i);
      }
    }
    this.labels.show(this.digLabel, !!shown);
    if (shown) {
      this.digLabel.anchor.set(shown.x, 2.2, shown.z);
      this.digLabel.el.style.setProperty('--p', shown.dig.toFixed(3));
      this.labels.show(this.hintLabel, false);
    }
    this.shovel.visible = this.digging;
  }

  private clearPile(i: number): void {
    const pile = this.piles[i] as Pile;
    this.piles.splice(i, 1);
    this.removePile(pile);
    if (pile.chest && this.pendingChest > 0) this.spawnChest(pile.x, pile.z, this.pendingChest);
  }

  private removePile(pile: Pile): void {
    this.world.removeCollider(pile.collider);
    this.owned.delete(pile.collider);
  }

  /** Penguins shovel the pile next to the smokehouse racks (opening the corridor), from a spot facing their graph node. */
  private digSite(): DigSite | null {
    // Only once the whole line has landed, so the nearest pile really is the one on the smokehouse side.
    if (this.piles.some((p) => p.rise < 1)) return null;
    let best: Pile | null = null;
    let bestD = Infinity;
    for (const p of this.piles) {
      const d = Math.hypot(p.x - DIG_NODE.x, p.z - DIG_NODE.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    // Only the pile right next to the node: clearing it opens the way, the others sit behind the racks.
    if (!best || bestD > A.pileRadius + 1.4) return null;
    const k = (A.pileRadius + 0.45) / Math.max(bestD, 1e-6);
    return { id: best.id, node: A.digNode, x: best.x + (DIG_NODE.x - best.x) * k, z: best.z + (DIG_NODE.z - best.z) * k };
  }

  private renderPiles(time: number): void {
    let n = 0;
    for (const pile of this.piles) {
      if (pile.delay > 0) continue;
      const left = A_T.meltTime - pile.age;
      const melt = left < F.meltShrinkTime ? Math.max(left / F.meltShrinkTime, 0) : 1;
      const k = Math.max(easeOutBack(pile.rise), 0.01) * melt * (1 - pile.dig * 0.45);
      const wobble = pile.dig > 0 ? Math.sin(time * 30) * 0.03 : 0;
      const r = A.pileRadius * 1.08;
      this.q.setFromAxisAngle(this.up, pile.rot);
      this.m.compose(this.p.set(pile.x, -0.1, pile.z), this.q, this.s.set(r * (1 + wobble), r * 0.85 * k, r * 1.05));
      this.pileMesh.setMatrixAt(n++, this.m);
    }
    this.pileMesh.count = n;
    this.pileMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- chest ----------

  private spawnChest(x: number, z: number, coins: number): void {
    if (this.chest) this.scene.remove(this.chest.model.root);
    const model = createChest();
    model.root.position.set(x, 0, z);
    model.root.rotation.y = 0.3;
    this.scene.add(model.root);
    this.chest = { model, coins, open: 0, appear: 0 };
    this.fx.splash(x, 0.4, z, 14, 2.8);
    this.banner.show(t('chestFound'), 'good');
  }

  private updateChest(dt: number): void {
    const c = this.chest;
    if (!c) return;
    c.appear = Math.min(c.appear + dt / 0.5, 1);
    const root = c.model.root;
    const p = this.player.state;
    if (c.open === 0 && c.appear >= 1 && Math.hypot(p.x - root.position.x, p.z - root.position.z) <= F.chestOpenRadius + PlayerFeel.radius) {
      c.open = 0.001;
      this.coins.rewardFrom(this.v.set(root.position.x, 0.6, root.position.z), c.coins);
      vibrate(HapticsSettings.chest);
      this.banner.show(tf('chestCoins', { n: c.coins }), 'good');
      this.fx.splash(root.position.x, 0.6, root.position.z, 12, 2.4);
    }
    if (c.open > 0) c.open += dt;
    c.model.lid.rotation.x = -Math.min(c.open * 6, 1.9);
    const fade = c.open > 1.6 ? Math.max(1 - (c.open - 1.6) / 0.4, 0) : 1;
    root.scale.setScalar(Math.max(easeOutBack(c.appear), 0.01) * fade);
    if (c.open > 2.0) {
      this.scene.remove(root);
      this.chest = null;
    }
  }
}

/** Diagonal stripes (white on transparent); the material color tints them. */
function stripeTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(255,255,255,1)';
    for (let i = -1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 32, size);
      ctx.lineTo(i * 32 + 16, size);
      ctx.lineTo(i * 32 + 16 + size, 0);
      ctx.lineTo(i * 32 + size, 0);
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
