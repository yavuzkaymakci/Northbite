import * as THREE from 'three';
import { Camp as CFG } from '../content/land';
import { CampLayout as L } from '../content/zones';
import { LandFeel, StationFeel } from '../settings';
import type { FishItem, GameState } from '../core/GameState';
import { seededRandom } from '../core/Random';
import type { Player } from '../entities/Player';
import { animateGuest, createGuest, createHotSpring, createKitchen, createLampPost, createTent, LAND_RACK_Y, type GuestModel } from '../models/createLand';
import { createBlobShadow } from '../render/BlobShadow';
import type { Effects } from '../render/Effects';
import type { FishRenderer } from '../render/FishRenderer';
import type { GoodsRenderer } from '../render/GoodsRenderer';
import { createLightPool, NightLights } from '../render/NightLights';
import { Palette } from '../render/Palette';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import type { WorldMap } from '../world/Map';
import type { Appear } from './Appear';
import type { CarryStack } from './CarryStack';
import type { CoinSystem } from './Coins';
import { FlightList } from './Flights';
import { GuestLogic, KitchenLogic, type Guest } from './LandLogic';
import { peaceScore } from './Rest';

const PER_ROW = 3;
const TENT_COLORS = [Palette.tentRed, Palette.tentBlue, Palette.tentYellow];

interface GuestView {
  model: GuestModel;
  object: THREE.Group;
  phase: number;
}

interface Steam {
  x: number;
  z: number;
  age: number;
  life: number;
  size: number;
}

/**
 * Hot Spring Camp (GDD §15): smoked fish go into the kitchen and come out as platters; guests queue for a platter,
 * stay in a tent and pay rent. Walking past the platter rack serves the queue one by one; the camp attendant does it
 * on their own once hired. Guests are drawn from GuestLogic and never saved.
 */
export class Camp {
  readonly kitchen: KitchenLogic;
  readonly guests: GuestLogic;
  private kitchenBuilt = false;
  private tents = 0;
  private attendant: GuestModel | null = null;
  private attendantWave = 0;
  private readonly group = new THREE.Group();
  private readonly views = new Map<number, GuestView>();
  private readonly toKitchen = new FlightList<FishItem>();
  private readonly toGuest = new FlightList<{ guest: Guest; value: number }>();
  private transferTimer = 0;
  private serveTimer = 0;
  private readonly water: THREE.Mesh;
  private readonly steamMesh: THREE.InstancedMesh;
  private readonly steam: Steam[] = [];
  private readonly inLabel: WorldLabel;
  private readonly outLabel: WorldLabel;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly state: GameState,
    private readonly player: Player,
    private readonly stack: CarryStack,
    private readonly world: WorldMap,
    private readonly fx: Effects,
    private readonly labels: WorldLabels,
    private readonly coins: CoinSystem,
    private readonly appear: Appear,
  ) {
    this.kitchen = new KitchenLogic(state);
    this.guests = new GuestLogic(state);
    scene.add(this.group);
    const spring = createHotSpring(L.pool.radius);
    this.water = spring.water;
    const pool = new THREE.Group();
    pool.add(spring.rim, spring.water);
    pool.position.set(L.pool.x, 0, L.pool.z);
    this.group.add(pool);
    world.addCollider({ kind: 'circle', x: L.pool.x, z: L.pool.z, r: L.pool.radius + 0.2 });
    for (const p of L.lamps) {
      const lamp = createLampPost(NightLights.window);
      const pool2 = createLightPool(2.6, 2.6);
      lamp.add(pool2);
      lamp.position.set(p.x, 0, p.z);
      this.group.add(lamp);
      world.addCollider({ kind: 'circle', x: p.x, z: p.z, r: 0.15 });
    }
    this.steamMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: Palette.steam, transparent: true, opacity: 0.55, depthWrite: false, flatShading: true }),
      LandFeel.steamCount,
    );
    this.steamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.steamMesh.frustumCulled = false;
    this.steamMesh.count = 0;
    this.group.add(this.steamMesh);
    this.inLabel = labels.create('rack-count');
    this.inLabel.anchor.set(L.kitchen.input.x, 1.2, L.kitchen.input.z);
    this.outLabel = labels.create('rack-count');
    this.outLabel.anchor.set(L.kitchen.output.x, 1.2, L.kitchen.output.z);

    if (state.unlocked.includes('kitchen')) this.build('kitchen', false);
    for (const id of ['tent1', 'tent2', 'tent3'] as const) if (state.unlocked.includes(id)) this.build(id, false);
    if (state.unlocked.includes('attendant')) this.build('attendant', false);
  }

  private get open(): boolean {
    return this.state.regions.includes('hotSpring');
  }

  build(part: 'kitchen' | 'tent1' | 'tent2' | 'tent3' | 'attendant', animate: boolean): void {
    let obj: THREE.Object3D;
    if (part === 'kitchen') {
      if (this.kitchenBuilt) return;
      this.kitchenBuilt = true;
      const k = L.kitchen;
      const local = (p: { x: number; z: number }) => ({ x: p.x - k.x, z: p.z - k.z });
      obj = createKitchen(k.width, k.depth, local(k.input), local(k.output));
      obj.position.set(k.x, 0, k.z);
      this.world.addCollider({ kind: 'rect', minX: k.x - k.width / 2, maxX: k.x + k.width / 2, minZ: k.z - k.depth / 2, maxZ: k.z + k.depth / 2 });
      for (const r of [k.input, k.output]) this.world.addCollider({ kind: 'rect', minX: r.x - 0.38, maxX: r.x + 0.38, minZ: r.z - 0.28, maxZ: r.z + 0.28 });
    } else if (part === 'attendant') {
      if (this.attendant) return;
      this.attendant = createGuest('attendant', seededRandom(5));
      obj = new THREE.Group().add(this.attendant.root, createBlobShadow(1.1, 0.25));
      obj.position.set(L.attendant.x, 0, L.attendant.z);
      this.attendant.root.rotation.y = 0.6;
    } else {
      const i = Number(part.slice(4)) - 1;
      if (i < this.tents) return;
      this.tents = i + 1;
      const tent = L.tents[i] as (typeof L.tents)[number];
      obj = createTent(TENT_COLORS[i] ?? Palette.tentRed, NightLights.window);
      obj.position.set(tent.x, 0, tent.z);
      this.world.addCollider({ kind: 'rect', minX: tent.x - 1.05, maxX: tent.x + 1.05, minZ: tent.z - 1.05, maxZ: tent.z + 0.9 });
    }
    this.group.add(obj);
    if (animate) this.appear.add(obj);
  }

  update(dt: number, time: number): void {
    this.updateSteam(dt, time);
    (this.water.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + NightLights.level * 0.45 + Math.sin(time * 1.7) * 0.05;
    if (!this.open) return;

    const plate = this.kitchenBuilt ? this.kitchen.update(dt) : null;
    if (plate !== null) this.fx.steam(L.kitchen.output.x, LAND_RACK_Y + 0.3, L.kitchen.output.z);
    for (const pay of this.guests.update(dt, this.tents, this.kitchenBuilt, peaceScore(this.state))) {
      this.coins.showPayment(this.v.set(pay.x, 1.2, pay.z), pay.value, pay.tip, 'camp');
    }
    this.updateTransfers(dt);
    this.toKitchen.update(dt, (f) => this.state.camp.input.push(f.payload));
    this.toGuest.update(dt, (f) => {
      const pay = this.guests.serve(f.payload.guest, f.payload.value, this.tents);
      this.coins.showPayment(this.v.set(f.payload.guest.x, 1.3, f.payload.guest.z), pay.value, pay.tip, 'camp');
    });
    this.updateViews(dt);
    this.updateLabels();
  }

  /** Smoked fish in at the kitchen; platters out to the queue (player nearby, or the attendant). */
  private updateTransfers(dt: number): void {
    if (!this.kitchenBuilt) return;
    const p = this.player.state;
    const k = L.kitchen;
    this.transferTimer -= dt;
    const room = CFG.kitchen.inputCapacity - this.state.camp.input.length - this.toKitchen.items.length;
    if (room > 0 && this.transferTimer <= 0 && Math.hypot(p.x - k.input.x, p.z - k.input.z) <= LandFeel.rackRadius && this.stack.hasSmoked()) {
      const item = this.stack.takeSmoked(this.v);
      if (item) {
        this.transferTimer = LandFeel.transferInterval;
        this.toKitchen.add(this.v, this.rackSlot(k.input, this.state.camp.input.length + this.toKitchen.items.length, this.w), StationFeel.flightTime, StationFeel.arcHeight, item);
      }
    }
    this.serveTimer -= dt;
    const playerServes = Math.hypot(p.x - k.output.x, p.z - k.output.z) <= LandFeel.serveRadius;
    if (this.serveTimer > 0 || (!playerServes && !this.attendant) || this.state.camp.plates.length === 0) return;
    const guest = this.guests.nextToServe();
    if (!guest) return;
    this.serveTimer = playerServes ? LandFeel.transferInterval * 2 : CFG.attendantServeInterval;
    const value = this.state.camp.plates.pop() as number;
    guest.serving = true;
    this.rackSlot(k.output, this.state.camp.plates.length, this.v);
    this.toGuest.add(this.v, this.w.set(guest.x, 1.2, guest.z), LandFeel.plateFlightTime, 0.9, { guest, value });
    if (!playerServes) this.attendantWave = 0.6;
  }

  private updateViews(dt: number): void {
    const alive = new Set<number>();
    for (const g of this.guests.guests) {
      alive.add(g.id);
      let view = this.views.get(g.id);
      if (!view) {
        const model = createGuest('tourist', seededRandom(g.seed));
        model.root.scale.setScalar(LandFeel.guestScale);
        const object = new THREE.Group();
        object.add(model.root, createBlobShadow(1.0, 0.25));
        this.scene.add(object);
        view = { model, object, phase: 0 };
        this.views.set(g.id, view);
      }
      view.object.visible = g.phase !== 'stay';
      view.phase += g.walk01 * dt * 2.2 * Math.PI * 2;
      view.object.position.set(g.x, 0, g.z);
      // Queued guests face the platter rack.
      view.model.root.rotation.y = g.phase === 'queue' && g.walk01 === 0 ? -Math.PI / 2 : g.heading;
      animateGuest(view.model, g.walk01, view.phase, g.serving ? 0.5 : 0);
    }
    for (const [id, view] of this.views) {
      if (alive.has(id)) continue;
      this.scene.remove(view.object);
      this.views.delete(id);
    }
    if (this.attendant) {
      this.attendantWave = Math.max(this.attendantWave - dt, 0);
      animateGuest(this.attendant, 0, performance.now() / 300, this.attendantWave > 0 ? 1 : 0);
    }
  }

  private updateLabels(): void {
    const near = this.kitchenBuilt && Math.hypot(this.player.state.x - L.kitchen.x, this.player.state.z - L.kitchen.z) < 7;
    this.labels.show(this.inLabel, near);
    this.labels.show(this.outLabel, near);
    if (!near) return;
    const c = this.state.camp;
    this.inLabel.el.innerHTML = `<span class="fish-icon"></span>${c.input.length}/${CFG.kitchen.inputCapacity}`;
    this.outLabel.el.innerHTML = `<span class="plate-icon"></span>${c.plates.length}/${CFG.kitchen.outputCapacity}`;
  }

  /** Steam over the pool: soft balls that rise, grow and fade by shrinking. */
  private updateSteam(dt: number, time: number): void {
    if (this.steam.length < LandFeel.steamCount && Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * L.pool.radius * 0.8;
      this.steam.push({ x: L.pool.x + Math.cos(a) * r, z: L.pool.z + Math.sin(a) * r, age: 0, life: 2.2 + Math.random(), size: 0.25 + Math.random() * 0.2 });
    }
    let n = 0;
    for (let i = this.steam.length - 1; i >= 0; i--) {
      const s = this.steam[i] as Steam;
      s.age += dt;
      if (s.age >= s.life) {
        this.steam.splice(i, 1);
        continue;
      }
      const k = s.age / s.life;
      const size = s.size * (0.6 + k * 1.4) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      this.m.compose(this.v.set(s.x + Math.sin(time + i) * 0.15 * k, 0.2 + s.age * LandFeel.steamRise, s.z), this.q.identity(), this.w.setScalar(size));
      this.steamMesh.setMatrixAt(n++, this.m);
    }
    this.steamMesh.count = n;
    this.steamMesh.instanceMatrix.needsUpdate = true;
  }

  render(fish: FishRenderer, goods: GoodsRenderer): void {
    const c = this.state.camp;
    if (!this.kitchenBuilt) return;
    for (let i = 0; i < c.input.length; i++) {
      this.rackSlot(L.kitchen.input, i, this.v);
      this.e.set(Math.PI / 2, i % 2 ? Math.PI : 0, 0);
      this.m.compose(this.v, this.q.setFromEuler(this.e), this.one);
      fish.add(c.input[i] as FishItem, this.m, 0.7);
    }
    for (const f of this.toKitchen.items) {
      this.e.set(Math.PI / 2, f.t * 6, 0);
      this.m.compose(f.pos, this.q.setFromEuler(this.e), this.one);
      fish.add(f.payload, this.m, 0.7);
    }
    for (let i = 0; i < c.plates.length; i++) {
      this.rackSlot(L.kitchen.output, i, this.v);
      goods.add('plate', this.v.x, this.v.y, this.v.z, i * 0.5, 1.1);
    }
    for (const f of this.toGuest.items) goods.add('plate', f.pos.x, f.pos.y, f.pos.z, f.t * 4, 1.1);
    // The platter being made sits on the counter.
    if (this.kitchen.working) goods.add('plate', L.kitchen.x + 0.4, 1.12, L.kitchen.z, 0, 0.5 + c.progress * 0.6);
  }

  private rackSlot(rack: { x: number; z: number }, index: number, out: THREE.Vector3): THREE.Vector3 {
    const layer = Math.floor(index / PER_ROW);
    const i = index % PER_ROW;
    return out.set(rack.x - 0.24 + i * 0.24, LAND_RACK_Y + 0.05 + layer * 0.12, rack.z + (layer % 2 ? 0.1 : -0.1));
  }
}
