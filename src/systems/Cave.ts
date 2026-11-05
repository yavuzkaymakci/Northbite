import * as THREE from 'three';
import { Cave as CFG } from '../content/land';
import { t } from '../content/strings';
import { CaveLayout as L } from '../content/zones';
import { FishingFeel, HapticsSettings, LandFeel } from '../settings';
import type { GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { TouchClaimer } from '../core/TouchRouter';
import type { Player } from '../entities/Player';
import { animateGuest, createCave, createCrystalBench, createGuest, LAND_RACK_Y, type GuestModel } from '../models/createLand';
import { createPickaxe } from '../models/createThreatProps';
import { createBlobShadow } from '../render/BlobShadow';
import type { Effects } from '../render/Effects';
import type { GoodsRenderer } from '../render/GoodsRenderer';
import type { Banner } from '../ui/Banner';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import type { WorldMap } from '../world/Map';
import type { Appear } from './Appear';
import type { CarryStack } from './CarryStack';
import type { CoinSystem } from './Coins';
import { FlightList } from './Flights';
import { sfx } from '../audio/AudioEngine';
import { CaveLogic } from './LandLogic';

const PER_ROW = 3;

/**
 * Ice Cave (GDD §15): mining crystals (stand on a glowing vein and hold), carving them into ice statuettes at the
 * crystal bench, and the collector who comes by now and then and buys the statuettes off the output rack.
 * Safe ground: no threat ever reaches it. While the player stands on a vein it claims touches, so holding there
 * never opens the joystick (a drag still walks away).
 */
export class Cave implements TouchClaimer {
  readonly logic: CaveLogic;
  private benchBuilt = false;
  private readonly group = new THREE.Group();
  private readonly pickaxe: THREE.Mesh;
  private readonly collector: GuestModel;
  private readonly collectorObj = new THREE.Group();
  private collectorShow = 0;
  private walkPhase = 0;
  private vein = -1;
  private mining = 0;
  /** Mining just happened (the game shows the pickaxe pose). */
  swinging = false;
  private readonly touches = new Map<number, { x: number; y: number }>();
  private keyHeld = false;
  private transferTimer = 0;
  private chimeTimer = 2;
  private readonly toBench = new FlightList<number>();
  private readonly toCollector = new FlightList<number>();
  private readonly mineLabel: WorldLabel;
  private readonly inLabel: WorldLabel;
  private readonly outLabel: WorldLabel;
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly state: GameState,
    private readonly player: Player,
    private readonly stack: CarryStack,
    private readonly world: WorldMap,
    private readonly fx: Effects,
    private readonly labels: WorldLabels,
    private readonly banner: Banner,
    private readonly coins: CoinSystem,
    private readonly appear: Appear,
  ) {
    this.logic = new CaveLogic(state);
    scene.add(this.group);
    this.group.add(createCave(L.area));
    for (const r of L.walls) world.addCollider({ kind: 'rect', ...r });
    this.pickaxe = createPickaxe();
    this.pickaxe.visible = false;
    player.attachToHand(this.pickaxe);
    this.collector = createGuest('collector', () => 0.4);
    this.collectorObj.add(this.collector.root, createBlobShadow(1.1, 0.25));
    this.collectorObj.position.set(L.collector.x, 0, L.collector.z);
    this.collectorObj.visible = false;
    this.collector.root.rotation.y = -Math.PI / 2 - 0.4; // faces the cave mouth
    scene.add(this.collectorObj);
    this.mineLabel = labels.create('scare-ring dig-ring mine-ring', '<div class="ring-fill"></div>');
    this.inLabel = labels.create('rack-count');
    this.inLabel.anchor.set(L.bench.input.x, 1.2, L.bench.input.z);
    this.outLabel = labels.create('rack-count');
    this.outLabel.anchor.set(L.bench.output.x, 1.2, L.bench.output.z);
    if (state.unlocked.includes('crystalBench')) this.buildBench(false);
  }

  private get open(): boolean {
    return this.state.regions.includes('iceCave');
  }

  /** The crystal bench (unlock frame inside the cave). */
  buildBench(animate: boolean): void {
    if (this.benchBuilt) return;
    this.benchBuilt = true;
    const b = L.bench;
    const local = (p: { x: number; z: number }) => ({ x: p.x - b.x, z: p.z - b.z });
    const bench = createCrystalBench(b.width, b.depth, local(b.input), local(b.output));
    bench.position.set(b.x, 0, b.z);
    this.group.add(bench);
    this.world.addCollider({ kind: 'rect', minX: b.x - b.width / 2, maxX: b.x + b.width / 2, minZ: b.z - b.depth / 2, maxZ: b.z + b.depth / 2 });
    for (const r of [b.input, b.output]) this.world.addCollider({ kind: 'rect', minX: r.x - 0.38, maxX: r.x + 0.38, minZ: r.z - 0.28, maxZ: r.z + 0.28 });
    if (animate) {
      this.appear.add(bench);
      this.logic.benchBuilt();
    }
  }

  // ---------- touches (mining) ----------

  wantsTouches(): boolean {
    return this.vein >= 0 && this.player.state.speed01 < FishingFeel.stillSpeed;
  }

  touchDown(id: number, x: number, y: number): void {
    this.touches.set(id, { x, y });
  }

  touchMove(id: number, x: number, y: number): 'keep' | 'release' {
    const start = this.touches.get(id);
    if (!start) return 'release';
    if (Math.hypot(x - start.x, y - start.y) <= FishingFeel.cancelDragPx) return 'keep';
    this.touches.delete(id); // a drag walks away instead
    return 'release';
  }

  touchUp(id: number): void {
    this.touches.delete(id);
  }

  // ---------- update ----------

  update(dt: number, moving: boolean, spaceHeld: boolean): void {
    this.keyHeld = spaceHeld;
    const ev = this.logic.update(dt, this.benchBuilt);
    if (ev.arrived) {
      this.banner.show(t('collectorArrived'), 'good');
      this.appear.add(this.collector.root);
      this.fx.snowPuff(L.collector.x, 0.4, L.collector.z, 0.6, 0.2);
    }
    if (ev.left) this.fx.snowPuff(L.collector.x, 0.4, L.collector.z, 0.6, 0.2);
    if (ev.sold) {
      // The statuette hops from the rack to the collector; his coins land on the cave pile.
      this.rackSlot(L.bench.output, this.state.cave.output, this.v);
      this.toCollector.add(this.v, this.w.set(L.collector.x, 1.2, L.collector.z), 0.45, 0.8, 0);
      this.coins.showPayment(this.w, ev.sold.value, ev.sold.tip, 'cave');
    }
    this.collectorShow = this.logic.present > 0 ? Math.min(this.collectorShow + dt * 3, 1) : Math.max(this.collectorShow - dt * 3, 0);
    this.collectorObj.visible = this.collectorShow > 0;
    this.collectorObj.scale.setScalar(Math.max(this.collectorShow, 0.01));
    this.walkPhase += dt * 4;
    animateGuest(this.collector, 0, this.walkPhase, this.toCollector.items.length > 0 ? 1 : 0);
    this.toBench.update(dt, () => this.state.cave.input++);
    this.toCollector.update(dt, () => {});

    this.updateMining(dt, moving);
    // The veins ring softly now and then (only heard near the cave).
    this.chimeTimer -= dt;
    if (this.chimeTimer <= 0) {
      this.chimeTimer = 2.5 + Math.random() * 3;
      const v = L.veins[Math.floor(Math.random() * L.veins.length)];
      if (v) sfx('crystalChime', v, 0.9 + Math.random() * 0.3);
    }
    this.updateRack(dt);
    this.updateLabels();
  }

  private updateMining(dt: number, moving: boolean): void {
    const p = this.player.state;
    this.vein = -1;
    if (this.open && !this.stack.isFull) {
      L.veins.forEach((v, i) => {
        const r = (LandFeel.veinRadius[v.size - 1] ?? 0.7) + LandFeel.veinReach;
        if (this.logic.veinReady(i) && Math.hypot(p.x - v.x, p.z - v.z) <= r) this.vein = i;
      });
    }
    const holding = this.touches.size > 0 || this.keyHeld;
    const working = this.vein >= 0 && holding && !moving;
    this.swinging = working;
    this.pickaxe.visible = working;
    if (!working) {
      this.mining = 0;
      return;
    }
    const v = L.veins[this.vein] as (typeof L.veins)[number];
    this.player.faceToward(v.x, v.z, dt);
    const before = this.mining;
    this.mining += dt / CFG.mineTime;
    if (Math.floor(before * 6) !== Math.floor(this.mining * 6)) {
      this.fx.splash(v.x, 0.4, v.z, 6, 1.8);
      vibrate(HapticsSettings.mineTick);
      sfx('mine', v);
    }
    if (this.mining >= 1) {
      this.mining = 0;
      const n = Math.min(this.logic.mine(this.vein), this.stack.room);
      this.stack.receiveCrystals(n, this.v.set(v.x, 0.5, v.z));
      this.fx.ripple(v.x, 0.05, v.z, 1.6, 1.1);
      this.fx.splash(v.x, 0.5, v.z, 16, 2.6);
      vibrate(HapticsSettings.crystal);
      sfx('crystalChime', v, 1.2);
    }
  }

  /** Walking past the bench's input rack hands over crystals one by one. */
  private updateRack(dt: number): void {
    if (!this.benchBuilt) return;
    const p = this.player.state;
    const r = L.bench.input;
    this.transferTimer -= dt;
    const room = CFG.bench.inputCapacity - this.state.cave.input - this.toBench.items.length;
    if (room > 0 && this.transferTimer <= 0 && Math.hypot(p.x - r.x, p.z - r.z) <= LandFeel.rackRadius && this.stack.takeCrystal(this.v)) {
      this.transferTimer = LandFeel.transferInterval;
      this.toBench.add(this.v, this.rackSlot(r, this.state.cave.input + this.toBench.items.length, this.w), 0.3, 0.8, 0);
    }
  }

  private updateLabels(): void {
    const c = this.state.cave;
    const v = L.veins[this.vein];
    this.labels.show(this.mineLabel, !!v);
    if (v) {
      this.mineLabel.anchor.set(v.x, 1.9, v.z);
      this.mineLabel.el.style.setProperty('--p', this.mining.toFixed(3));
      this.mineLabel.el.classList.toggle('idle', this.mining <= 0);
    }
    const near = this.benchBuilt && Math.hypot(this.player.state.x - L.bench.x, this.player.state.z - L.bench.z) < 7;
    this.labels.show(this.inLabel, near);
    this.labels.show(this.outLabel, near);
    if (near) {
      this.inLabel.el.innerHTML = `<span class="crystal-icon"></span>${c.input}/${CFG.bench.inputCapacity}`;
      this.outLabel.el.innerHTML = `<span class="statuette-icon"></span>${c.output}/${CFG.bench.outputCapacity}`;
    }
  }

  render(goods: GoodsRenderer, time: number): void {
    goods.pulse(time);
    const c = this.state.cave;
    // Veins: clusters that shrink when mined and grow back while refilling.
    L.veins.forEach((v, i) => {
      const grown = 1 - (c.veins[i] ?? 0) / CFG.refill;
      const k = 0.25 + 0.75 * grown;
      const count = v.size + 2;
      for (let j = 0; j < count; j++) {
        const a = (j / count) * Math.PI * 2 + i;
        const rr = j === 0 ? 0 : (LandFeel.veinRadius[v.size - 1] ?? 0.7) * 0.6;
        const s = (1.4 + v.size * 0.45) * (j === 0 ? 1.3 : 0.85) * k;
        goods.add('crystal', v.x + Math.cos(a) * rr, 0.12 * s, v.z + Math.sin(a) * rr, a, s, (j % 3) * 0.25 - 0.25);
      }
      const glow = (2.2 + v.size * 0.8) * (0.35 + 0.65 * grown) * (1 + Math.sin(time * 2 + i) * 0.06);
      goods.add('glow', v.x, 0.05, v.z, 0, glow);
    });
    if (this.benchBuilt) {
      for (let i = 0; i < c.input; i++) {
        this.rackSlot(L.bench.input, i, this.v);
        goods.add('crystal', this.v.x, this.v.y + 0.1, this.v.z, i, LandFeel.crystalScale);
      }
      for (const f of this.toBench.items) goods.add('crystal', f.pos.x, f.pos.y, f.pos.z, f.t * 8, LandFeel.crystalScale);
      for (let i = 0; i < c.output; i++) {
        this.rackSlot(L.bench.output, i, this.v);
        goods.add('statuette', this.v.x, this.v.y, this.v.z, i * 0.7, 1.2);
      }
      // The statuette being carved sits on the bench.
      if (this.logic.benchWorking) goods.add('statuette', L.bench.x, 0.9, L.bench.z, time, 0.4 + c.progress * 0.8);
    }
    for (const f of this.toCollector.items) goods.add('statuette', f.pos.x, f.pos.y, f.pos.z, f.t * 6, 1.2);
  }

  private rackSlot(rack: { x: number; z: number }, index: number, out: THREE.Vector3): THREE.Vector3 {
    const layer = Math.floor(index / PER_ROW);
    const i = index % PER_ROW;
    return out.set(rack.x - 0.24 + i * 0.24, LAND_RACK_Y + 0.02 + layer * 0.2, rack.z + (layer % 2 ? 0.1 : -0.1));
  }
}
