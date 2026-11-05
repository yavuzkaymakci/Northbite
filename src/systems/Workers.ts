import * as THREE from 'three';
import { IceShore } from '../content/zones';
import { StationFeel, WorkerFeel } from '../settings';
import type { FishItem, GameState } from '../core/GameState';
import { animatePenguin, createPenguin, PENGUIN_BACK, type PenguinModel } from '../models/createPenguin';
import { createBlobShadow } from '../render/BlobShadow';
import { FishRenderer } from '../render/FishRenderer';
import type { WorldMap } from '../world/Map';
import { FlightList } from './Flights';
import { sfx } from '../audio/AudioEngine';
import type { NetStation } from './NetStation';
import { PathGraphNav } from './Pathfinding';
import type { Selling } from './Selling';
import type { Smokehouse } from './Smokehouse';
import { stationValue } from './StationUpgrades';
import { WorkerBrain, type DigSite, type StoreId, type WorkContext, type WorkStore } from './WorkerBrain';

interface Penguin {
  brain: WorkerBrain;
  model: PenguinModel;
  object: THREE.Group;
  /** Carried fish still flying onto the back. */
  hidden: number;
  walkPhase: number;
  flap: number;
  look: number;
  lookTarget: number;
  nextIdleAct: number;
  /** 0..1 hop-in when a new penguin arrives. */
  arrive: number;
}

const HOME = IceShore.hut.idle;

/**
 * Penguin carriers (GDD §7). Brains (`WorkerBrain`) decide and move; this class draws them and turns their
 * take/give calls into flights between stations and backs.
 */
export class Workers {
  private readonly penguins: Penguin[] = [];
  private readonly ctx: WorkContext;
  private readonly toBack = new FlightList<{ item: FishItem; penguin: Penguin }>();
  private readonly v = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly lie = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly state: GameState,
    world: WorldMap,
    net: NetStation,
    smoker: Smokehouse,
    selling: Selling,
  ) {
    const byBrain = (w: WorkerBrain) => this.penguins.find((p) => p.brain === w) as Penguin;
    const takeTo = (w: WorkerBrain, item: FishItem | null, from: THREE.Vector3) => {
      if (!item) return null;
      const p = byBrain(w);
      p.hidden++;
      this.toBack.add(from, this.backTop(p, this.v), StationFeel.flightTime, StationFeel.arcHeight, { item, penguin: p });
      return item;
    };
    const from = new THREE.Vector3();
    const stores: Record<StoreId, WorkStore> = {
      basket: {
        node: 'basket',
        enabled: () => net.isBuilt,
        takeable: () => net.takeable(),
        take: (w) => takeTo(w, net.takeItem(from), from),
        room: () => 0,
        give: () => {},
      },
      smokerIn: {
        node: 'smokeIn',
        enabled: () => smoker.isBuilt,
        takeable: () => 0,
        take: () => null,
        room: () => smoker.room(),
        give: (item, w) => smoker.receive(item, this.backTop(byBrain(w), from)),
      },
      smokerOut: {
        node: 'smokeOut',
        enabled: () => smoker.isBuilt,
        takeable: () => smoker.takeable(),
        take: (w) => takeTo(w, smoker.takeItem(from), from),
        room: () => 0,
        give: () => {},
      },
      counter: {
        node: 'counter',
        enabled: () => true,
        takeable: () => 0,
        take: () => null,
        room: () => selling.room(),
        give: (item, w) => selling.receive(item, this.backTop(byBrain(w), from)),
      },
    };
    this.ctx = {
      stores,
      nav: new PathGraphNav((id) => state.regions.includes(id)),
      homeNode: 'hut',
      walkable: world,
      carry: () => stationValue(state, 'penguinCarry'),
      speed: () => stationValue(state, 'penguinSpeed'),
    };
    for (let i = 0; i < state.workers.length; i++) this.spawn(i, false);
  }

  get count(): number {
    return this.penguins.length;
  }

  /** Helper brains (the bear reads positions and loads). */
  get brains(): readonly WorkerBrain[] {
    return this.penguins.map((p) => p.brain);
  }

  /** A bear is close: the helper runs into the hut and hides (GDD §13). */
  scare(brain: WorkerBrain, seconds: number): void {
    brain.scare(seconds, this.ctx);
    const p = this.penguins.find((q) => q.brain === brain);
    if (p) p.flap = 1.2;
  }

  /** Snow piles helpers may shovel when idle (avalanche). */
  setDigging(site: () => DigSite | null, alive: (id: number) => boolean): void {
    this.ctx.digSite = site;
    this.ctx.digAlive = alive;
  }

  /** A new penguin joins (unlock). */
  add(): void {
    this.state.workers.push({ carried: [] });
    this.spawn(this.state.workers.length - 1, true);
  }

  private spawn(index: number, animate: boolean): void {
    const data = this.state.workers[index];
    if (!data) return;
    const brain = new WorkerBrain(data, index, HOME.x + index * WorkerFeel.homeSpacing, HOME.z + index * 0.3);
    const model = createPenguin();
    const object = new THREE.Group();
    object.add(model.root, createBlobShadow(0.8, 0.28));
    this.scene.add(object);
    this.penguins.push({
      brain,
      model,
      object,
      hidden: 0,
      walkPhase: 0,
      flap: 0,
      look: 0,
      lookTarget: 0,
      nextIdleAct: 1 + Math.random() * 2,
      arrive: animate ? 0 : 1,
    });
  }

  update(dt: number, time: number): void {
    const brains = this.penguins.map((p) => p.brain);
    for (const p of this.penguins) {
      const b = p.brain;
      const busy = b.phase !== 'idle' || b.idleTime === 0;
      b.update(dt, this.ctx, brains);
      const step0 = Math.floor(p.walkPhase / Math.PI);
      p.walkPhase += b.speed01 * WorkerFeel.waddleSpeed * Math.PI * 2 * dt;
      if (Math.floor(p.walkPhase / Math.PI) !== step0 && !b.inside) sfx('penguinStep', b);

      // Idle life: a flap or a look around now and then.
      if (busy) {
        p.lookTarget = 0;
        p.nextIdleAct = 1.5 + Math.random() * 2;
      } else {
        p.nextIdleAct -= dt;
        if (p.nextIdleAct <= 0) {
          p.nextIdleAct = 1.8 + Math.random() * 3;
          if (Math.random() < 0.45) {
            p.flap = 0.8;
            sfx('penguinFlap', b);
          }
          else p.lookTarget = (Math.random() - 0.5) * 1.6;
        }
      }
      if (b.phase === 'picking' || b.phase === 'dropping') p.flap = Math.max(p.flap, 0.25);
      if (b.phase === 'digging' || b.phase === 'hiding') p.flap = Math.max(p.flap, 0.6);
      p.object.visible = !b.inside;
      p.flap = Math.max(p.flap - dt * 1.4, 0);
      p.look += (p.lookTarget - p.look) * Math.min(1, dt * 4);

      p.arrive = Math.min(p.arrive + dt / WorkerFeel.hopInTime, 1);
      const hop = p.arrive < 1 ? Math.sin(p.arrive * Math.PI) * 0.6 : 0;
      p.object.position.set(b.x, hop, b.z);
      p.object.scale.setScalar(0.3 + 0.7 * Math.min(p.arrive * 1.5, 1));
      p.model.root.rotation.y = b.heading;
      animatePenguin(p.model, b.speed01, p.walkPhase, time, p.flap, p.look);
    }
    for (const f of this.toBack.items) this.backTop(f.payload.penguin, f.to);
    this.toBack.update(dt, (f) => (f.payload.penguin.hidden = Math.max(f.payload.penguin.hidden - 1, 0)));
  }

  render(fish: FishRenderer): void {
    const k = WorkerFeel.stackScale;
    for (const p of this.penguins) {
      const b = p.brain;
      if (b.inside) continue;
      const n = Math.max(b.carried.length - p.hidden, 0);
      this.m.compose(this.v.set(b.x, p.object.position.y, b.z), this.q.setFromAxisAngle(this.up, b.heading), this.one);
      let h = PENGUIN_BACK.y;
      const roll = p.model.body.rotation.z;
      for (let i = 0; i < n; i++) {
        const item = b.carried[i] as FishItem;
        const th = FishRenderer.thicknessOf(item) * k;
        this.local.makeRotationY(i % 2 ? 0.1 : -0.1).setPosition(roll * -h * 0.8, h + th / 2, PENGUIN_BACK.z);
        this.local.multiply(this.lie);
        fish.add(item, this.local.premultiply(this.m), k);
        h += th + 0.02;
      }
    }
    for (const f of this.toBack.items) {
      this.e.set(Math.PI / 2, f.t * Math.PI * 2, 0);
      this.local.compose(f.pos, this.q.setFromEuler(this.e), this.one);
      fish.add(f.payload.item, this.local, k);
    }
  }

  /** World position of the top of a penguin's back stack. */
  private backTop(p: Penguin, out: THREE.Vector3): THREE.Vector3 {
    const b = p.brain;
    let h = PENGUIN_BACK.y;
    const n = Math.max(b.carried.length - p.hidden, 0);
    for (let i = 0; i < n; i++) h += FishRenderer.thicknessOf(b.carried[i] as FishItem) * WorkerFeel.stackScale + 0.02;
    out.set(0, h, PENGUIN_BACK.z).applyAxisAngle(this.up, b.heading);
    return out.set(out.x + b.x, out.y, out.z + b.z);
  }
}
