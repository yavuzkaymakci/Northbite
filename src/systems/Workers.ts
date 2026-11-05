import * as THREE from 'three';
import { PenguinLevels } from '../content/penguins';
import { getLang, tf } from '../content/strings';
import { IceShore } from '../content/zones';
import { StationFeel, WorkerFeel } from '../settings';
import { isFish, type FishItem, type GameState, type WorkerData, type WorkerItem } from '../core/GameState';
import { animatePenguin, createPenguin, PENGUIN_BACK, type PenguinModel } from '../models/createPenguin';
import { createBlobShadow } from '../render/BlobShadow';
import type { Effects } from '../render/Effects';
import { FishRenderer } from '../render/FishRenderer';
import type { GoodsRenderer } from '../render/GoodsRenderer';
import type { Banner } from '../ui/Banner';
import type { WorldMap } from '../world/Map';
import { FlightList } from './Flights';
import { sfx } from '../audio/AudioEngine';
import { JobBoard, type Stores, type WorkStore } from './JobBoard';
import { veinStore } from './LandLogic';
import type { NetStation } from './NetStation';
import { addXp, penguinCarry, penguinName, penguinSpeed } from './PenguinLogic';
import { PathGraphNav } from './Pathfinding';
import type { Selling } from './Selling';
import type { Smokehouse } from './Smokehouse';
import type { Camp } from './Camp';
import type { Cave } from './Cave';
import type { ThreatBuildings } from './ThreatBuildings';
import { WorkerBrain, type DigSite, type WorkContext } from './WorkerBrain';

interface Penguin {
  brain: WorkerBrain;
  model: PenguinModel;
  object: THREE.Group;
  /** Carried items still flying onto the back. */
  hidden: number;
  walkPhase: number;
  flap: number;
  look: number;
  lookTarget: number;
  nextIdleAct: number;
  /** 0..1 hop-in when a new penguin arrives (`fromDoor`: jumps out of the hut door). */
  arrive: number;
  fromDoor: boolean;
}

const HUT = IceShore.hut;
const CRYSTAL_H = 0.2;
const PLATE_H = 0.1;

/** The stations penguins work at in the lands and at the bait trap (built after the workers). */
export interface WorkerLinks {
  camp: Camp;
  cave: Cave;
  buildings: ThreatBuildings;
}

/**
 * Penguins (GDD §7, §24). Brains (`WorkerBrain`) pick jobs off the job board and move; this class plugs the real
 * stations in as job-board stores, draws the penguins (each with its own hat and scarf) and turns their take/give
 * calls into flights between stations and backs. Experience and level-ups happen here.
 */
export class Workers {
  private readonly penguins: Penguin[] = [];
  readonly ctx: WorkContext;
  private links: WorkerLinks | null = null;
  private readonly toBack = new FlightList<{ item: WorkerItem; penguin: Penguin }>();
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
    private readonly fx: Effects,
    private readonly banner: Banner,
  ) {
    const byBrain = (w: unknown) => this.penguins.find((p) => p.brain === w) as Penguin;
    const takeTo = (w: unknown, item: WorkerItem | null, from: THREE.Vector3) => {
      if (!item) return null;
      const p = byBrain(w);
      p.hidden++;
      this.toBack.add(from, this.backTop(p, this.v), StationFeel.flightTime, StationFeel.arcHeight, { item, penguin: p });
      return item;
    };
    const from = new THREE.Vector3();
    const top = (w: unknown) => this.backTop(byBrain(w), from);
    const none: Omit<WorkStore, 'node' | 'enabled'> = { takeable: () => 0, take: () => null, room: () => 0, give: () => {}, accepts: () => false };
    const L = () => this.links;
    // Veins need the cave (built after the workers): a stand-in until `link`.
    let veins: WorkStore = { ...none, node: 'caveMid', enabled: () => false };
    const stores: Stores = {
      basket: { ...none, node: 'basket', enabled: () => net.isBuilt, takeable: () => net.takeable(), take: (w) => takeTo(w, net.takeItem(from), from) },
      smokerIn: {
        ...none,
        node: 'smokeIn',
        enabled: () => smoker.isBuilt,
        room: () => smoker.room(),
        give: (item, w) => isFish(item) && smoker.receive(item, top(w)),
        accepts: (item) => item.kind === 'raw',
      },
      smokerOut: { ...none, node: 'smokeOut', enabled: () => smoker.isBuilt, takeable: () => smoker.takeable(), take: (w) => takeTo(w, smoker.takeItem(from), from) },
      counter: {
        ...none,
        node: 'counter',
        enabled: () => true,
        room: () => selling.room(),
        give: (item, w) => isFish(item) && selling.receive(item, top(w)),
        accepts: (item) => isFish(item),
      },
      kitchenIn: {
        ...none,
        node: 'kitchenIn',
        enabled: () => !!L()?.camp.kitchenReady,
        room: () => L()?.camp.kitchenRoom() ?? 0,
        give: (item, w) => isFish(item) && L()?.camp.receiveSmoked(item, top(w)),
        accepts: (item) => item.kind === 'smoked',
      },
      plates: {
        ...none,
        node: 'plates',
        enabled: () => !!L()?.camp.kitchenReady,
        takeable: () => this.state.camp.plates.length,
        take: (w) => takeTo(w, L()?.camp.takePlate(from) ?? null, from),
      },
      serve: {
        ...none,
        node: 'serve',
        enabled: () => !!L()?.camp.kitchenReady,
        room: () => L()?.camp.waitingGuests() ?? 0,
        give: (item, w) => {
          // Nobody left in line after all: the platter goes back on the rack.
          if (!L()?.camp.servePlate(item.price, top(w))) this.state.camp.plates.push(item.price);
        },
        accepts: (item) => item.kind === 'plate',
      },
      // Replaced by the real vein store once the cave is linked.
      get vein() {
        return veins;
      },
      crystalIn: {
        ...none,
        node: 'crystalIn',
        enabled: () => !!L()?.cave.benchReady,
        room: () => L()?.cave.benchRoom() ?? 0,
        give: (_item, w) => L()?.cave.receiveCrystal(top(w)),
        accepts: (item) => item.kind === 'crystal',
      },
      bait: {
        ...none,
        node: 'bait',
        enabled: () => !!L()?.buildings.isBuilt('baitTrap'),
        room: () => L()?.buildings.baitRoom() ?? 0,
        give: (item, w) => isFish(item) && L()?.buildings.setBait(item, top(w)),
        accepts: (item) => item.kind === 'raw',
      },
    };
    this.linkVeins = (cave) => {
      const store = veinStore(cave.logic, () => cave.benchReady, (i) => cave.minedByPenguin(i));
      veins = { ...store, take: (w) => takeTo(w, store.take(w), from.set(w.x, 0.5, w.z)) };
    };
    this.ctx = {
      board: new JobBoard(stores),
      nav: new PathGraphNav((id) => state.regions.includes(id)),
      homeNode: 'hut',
      homeSpot: (i) => HUT.slots[i % HUT.slots.length] as { x: number; z: number },
      walkable: world,
      carry: (w) => penguinCarry(state, w),
      speed: (w) => penguinSpeed(state, w),
      onDeliver: (w) => this.gainXp(w, PenguinLevels.xpPerItem),
      onDug: (w) => this.gainXp(w, PenguinLevels.xpPerPile),
    };
    for (let i = 0; i < state.workers.length; i++) this.spawn(i, false);
  }

  private readonly linkVeins: (cave: Cave) => void;

  /** Camp, cave and bait trap come after the workers (they are built later in Game). */
  link(links: WorkerLinks): void {
    this.links = links;
    this.linkVeins(links.cave);
  }

  get count(): number {
    return this.penguins.length;
  }

  /** Penguin brains (the bear reads positions and loads). */
  get brains(): readonly WorkerBrain[] {
    return this.penguins.map((p) => p.brain);
  }

  /** A bear is close: the penguin runs into the hut and hides (GDD §13). */
  scare(brain: WorkerBrain, seconds: number): void {
    brain.scare(seconds, this.ctx);
    const p = this.penguins.find((q) => q.brain === brain);
    if (p) p.flap = 1.2;
  }

  /** Snow piles penguins may shovel (avalanche). */
  setDigging(site: () => DigSite | null, alive: (id: number) => boolean): void {
    this.ctx.digSite = site;
    this.ctx.digAlive = alive;
  }

  /** A penguin joins (the hut's free one, or bought in the market): `data` is already in `state.workers`. */
  add(data: WorkerData, fromDoor: boolean): void {
    const i = this.state.workers.indexOf(data);
    if (i < 0) return;
    this.spawn(i, true, fromDoor);
    if (fromDoor) {
      this.fx.sparkle(HUT.door.x, 1.0, HUT.door.z);
      this.fx.snowPuff(HUT.door.x, 0.3, HUT.door.z, 0.6, 0.3);
    }
  }

  /** The role changed: the penguin drops its job and rethinks (it keeps what it carries). */
  roleChanged(data: WorkerData): void {
    const p = this.penguins.find((q) => q.brain.data === data);
    if (!p) return;
    p.brain.reset(this.ctx);
    p.flap = 0.8;
  }

  private gainXp(brain: WorkerBrain, amount: number): void {
    if (!addXp(brain.data, amount)) return;
    // Level up: a little celebration (flaps, sparkle, chime, banner).
    const p = this.penguins.find((q) => q.brain === brain);
    if (p) p.flap = WorkerFeel.levelUpFlap;
    this.fx.sparkle(brain.x, 1.3, brain.z);
    sfx('levelUp', brain);
    this.banner.show(tf('penguinLevelUp', { name: penguinName(brain.data, getLang()), n: brain.data.level }), 'good');
  }

  private spawn(index: number, animate: boolean, fromDoor = false): void {
    const data = this.state.workers[index];
    if (!data) return;
    const home = fromDoor ? HUT.door : (HUT.slots[index % HUT.slots.length] as { x: number; z: number });
    const brain = new WorkerBrain(data, index, home.x, home.z);
    const model = createPenguin(data.look);
    const object = new THREE.Group();
    object.add(model.root, createBlobShadow(0.8, 0.28));
    this.scene.add(object);
    this.penguins.push({
      brain,
      model,
      object,
      hidden: 0,
      walkPhase: 0,
      flap: fromDoor ? 1 : 0,
      look: 0,
      lookTarget: 0,
      nextIdleAct: 1 + Math.random() * 2,
      arrive: animate ? 0 : 1,
      fromDoor,
    });
  }

  update(dt: number, time: number): void {
    const brains = this.penguins.map((p) => p.brain);
    for (const p of this.penguins) {
      const b = p.brain;
      const busy = b.phase !== 'idle' || b.idleTime === 0;
      // A bought penguin finishes its jump out of the door before it starts working.
      if (p.arrive >= 1 || !p.fromDoor) b.update(dt, this.ctx, brains);
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
          } else p.lookTarget = (Math.random() - 0.5) * 1.6;
        }
      }
      if (b.phase === 'picking' || b.phase === 'dropping') p.flap = Math.max(p.flap, 0.25);
      if (b.phase === 'digging' || b.phase === 'hiding' || b.working) p.flap = Math.max(p.flap, 0.6);
      p.object.visible = !b.inside;
      p.flap = Math.max(p.flap - dt * 1.4, 0);
      p.look += (p.lookTarget - p.look) * Math.min(1, dt * 4);

      p.arrive = Math.min(p.arrive + dt / (p.fromDoor ? WorkerFeel.hopOutTime : WorkerFeel.hopInTime), 1);
      const hop = p.arrive < 1 ? Math.sin(p.arrive * Math.PI) * (p.fromDoor ? 1.1 : 0.6) : 0;
      if (p.fromDoor && p.arrive < 1) {
        // Out of the door and down to the first waiting spot.
        const to = HUT.slots[b.index % HUT.slots.length] as { x: number; z: number };
        b.x = HUT.door.x + (to.x - HUT.door.x) * p.arrive;
        b.z = HUT.door.z + (to.z - HUT.door.z) * p.arrive;
        b.heading = Math.atan2(to.x - HUT.door.x, to.z - HUT.door.z);
      }
      p.object.position.set(b.x, hop, b.z);
      p.object.scale.setScalar(0.3 + 0.7 * Math.min(p.arrive * 1.5, 1));
      p.model.root.rotation.y = b.heading;
      animatePenguin(p.model, Math.min(b.speed01, 1), p.walkPhase, time, p.flap, p.look);
    }
    for (const f of this.toBack.items) this.backTop(f.payload.penguin, f.to);
    this.toBack.update(dt, (f) => (f.payload.penguin.hidden = Math.max(f.payload.penguin.hidden - 1, 0)));
  }

  render(fish: FishRenderer, goods: GoodsRenderer): void {
    const k = WorkerFeel.stackScale;
    for (const p of this.penguins) {
      const b = p.brain;
      if (b.inside) continue;
      const n = Math.max(b.carried.length - p.hidden, 0);
      this.m.compose(this.v.set(b.x, p.object.position.y, b.z), this.q.setFromAxisAngle(this.up, b.heading), this.one);
      let h = PENGUIN_BACK.y;
      const roll = p.model.body.rotation.z;
      for (let i = 0; i < n; i++) {
        const item = b.carried[i] as WorkerItem;
        const th = thickness(item);
        this.local.makeRotationY(i % 2 ? 0.1 : -0.1).setPosition(roll * -h * 0.8, h + th / 2, PENGUIN_BACK.z);
        if (isFish(item)) {
          this.local.multiply(this.lie);
          fish.add(item, this.local.premultiply(this.m), k);
        } else {
          this.v.setFromMatrixPosition(this.local.premultiply(this.m));
          goods.add(item.kind, this.v.x, this.v.y - th / 2, this.v.z, b.heading + i, item.kind === 'crystal' ? 1.1 : 0.9);
        }
        h += th + 0.02;
      }
    }
    for (const f of this.toBack.items) {
      const item = f.payload.item;
      if (isFish(item)) {
        this.e.set(Math.PI / 2, f.t * Math.PI * 2, 0);
        this.local.compose(f.pos, this.q.setFromEuler(this.e), this.one);
        fish.add(item, this.local, k);
      } else {
        goods.add(item.kind, f.pos.x, f.pos.y, f.pos.z, f.t * 6, item.kind === 'crystal' ? 1.1 : 0.9);
      }
    }
  }

  /** World position of the top of a penguin's back stack. */
  private backTop(p: Penguin, out: THREE.Vector3): THREE.Vector3 {
    const b = p.brain;
    let h = PENGUIN_BACK.y;
    const n = Math.max(b.carried.length - p.hidden, 0);
    for (let i = 0; i < n; i++) h += thickness(b.carried[i] as WorkerItem) + 0.02;
    out.set(0, h, PENGUIN_BACK.z).applyAxisAngle(this.up, b.heading);
    return out.set(out.x + b.x, out.y, out.z + b.z);
  }
}

function thickness(item: WorkerItem): number {
  if (isFish(item)) return FishRenderer.thicknessOf(item as FishItem) * WorkerFeel.stackScale;
  return item.kind === 'crystal' ? CRYSTAL_H : PLATE_H;
}

