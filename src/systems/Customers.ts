import * as THREE from 'three';
import { Economy } from '../content/economy';
import { IceShore } from '../content/zones';
import { CustomerFeel } from '../settings';
import type { FishItem } from '../core/GameState';
import { seededRandom } from '../core/Random';
import { animateCustomer, createCustomer, type CustomerModel } from '../models/createCustomer';
import type { FishRenderer } from '../render/FishRenderer';
import { createBlobShadow } from '../render/BlobShadow';
import type { CoinSystem } from './Coins';
import { FlightList } from './Flights';
import type { Selling } from './Selling';

const C = IceShore.counter;
const SPAWN = IceShore.customers.spawn;
const EXIT = IceShore.customers.exit;

interface Customer {
  model: CustomerModel;
  object: THREE.Group;
  x: number;
  z: number;
  heading: number;
  phase: 'queue' | 'leaving';
  want: number;
  got: number;
  bill: number;
  takeTimer: number;
  walkPhase: number;
  /** Remaining waypoints while leaving. */
  path: Array<{ x: number; z: number }>;
}

/**
 * Townsfolk who queue at the counter, take 1–3 fish, drop coins on the pile and walk away (GDD §2 step 4).
 * Customers are visuals plus transient data; they are not saved.
 */
export class Customers {
  private readonly list: Customer[] = [];
  private readonly queue: Customer[] = [];
  private readonly fishFlights = new FlightList<{ item: FishItem; customer: Customer }>();
  private spawnTimer = 0.5;
  private readonly rand = seededRandom(IceShore.customers.seed);
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly selling: Selling,
    private readonly coins: CoinSystem,
  ) {}

  update(dt: number): void {
    const cfg = Economy.customers;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = cfg.spawnIntervalMin + Math.random() * (cfg.spawnIntervalMax - cfg.spawnIntervalMin);
      if (this.queue.length < cfg.maxQueue) this.spawn();
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i] as Customer;
      let walking = false;
      if (c.phase === 'queue') {
        const slot = this.queue.indexOf(c);
        walking = this.walkTo(c, C.servePoint.x, C.servePoint.z + slot * C.queueSpacing, dt);
        if (!walking) {
          c.heading = this.turn(c.heading, Math.PI, dt); // face the counter (north)
          if (slot === 0) this.serve(c, dt);
        }
      } else {
        const wp = c.path[0];
        if (wp) {
          walking = this.walkTo(c, wp.x, wp.z, dt);
          if (!walking) c.path.shift();
        } else {
          this.scene.remove(c.object);
          this.list.splice(i, 1);
          continue;
        }
      }
      c.walkPhase += walking ? dt * CustomerFeel.walkSpeed * 2.6 * Math.PI : 0;
      animateCustomer(c.model, walking ? 1 : 0, c.walkPhase);
      c.object.position.set(c.x, 0, c.z);
      c.model.root.rotation.y = c.heading;
    }

    this.fishFlights.update(dt, (f) => {
      f.payload.customer.got++;
      f.payload.customer.bill += f.payload.item.price;
    });
  }

  render(fish: FishRenderer): void {
    for (const f of this.fishFlights.items) {
      this.e.set(Math.PI / 2, f.t * 5, 0);
      this.m.compose(f.pos, this.q.setFromEuler(this.e), this.one);
      fish.add(f.payload.item, this.m);
    }
  }

  private spawn(): void {
    const model = createCustomer(this.rand);
    const object = new THREE.Group();
    object.add(model.root, createBlobShadow(1.1, 0.25));
    this.scene.add(object);
    const cfg = Economy.customers;
    const c: Customer = {
      model,
      object,
      x: SPAWN.x,
      z: SPAWN.z,
      heading: Math.PI,
      phase: 'queue',
      want: cfg.buyMin + Math.floor(Math.random() * (cfg.buyMax - cfg.buyMin + 1)),
      got: 0,
      bill: 0,
      takeTimer: 0,
      walkPhase: 0,
      path: [],
    };
    this.list.push(c);
    this.queue.push(c);
  }

  private serve(c: Customer, dt: number): void {
    const inFlight = this.fishFlights.items.filter((f) => f.payload.customer === c).length;
    if (c.got >= c.want) {
      this.pay(c);
      return;
    }
    c.takeTimer -= dt;
    if (c.got + inFlight >= c.want || c.takeTimer > 0) return;
    const item = this.selling.take(this.from);
    if (!item) return;
    c.takeTimer = CustomerFeel.takeInterval;
    this.to.set(c.x, 1.1, c.z);
    this.fishFlights.add(this.from, this.to, CustomerFeel.flightTime, 0.6, { item, customer: c });
  }

  private pay(c: Customer): void {
    this.coins.payFrom(this.from.set(c.x, 1.1, c.z), c.bill);
    c.phase = 'leaving';
    this.queue.splice(this.queue.indexOf(c), 1);
    // Step aside first so the line behind is not walked through.
    c.path = [
      { x: C.servePoint.x - 1.6, z: C.servePoint.z + 0.4 },
      { x: EXIT.x, z: EXIT.z },
    ];
  }

  /** Moves toward a point. Returns true while still walking. */
  private walkTo(c: Customer, x: number, z: number, dt: number): boolean {
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return false;
    const step = Math.min(CustomerFeel.walkSpeed * dt, d);
    c.x += (dx / d) * step;
    c.z += (dz / d) * step;
    c.heading = this.turn(c.heading, Math.atan2(dx, dz), dt);
    return true;
  }

  private turn(from: number, to: number, dt: number): number {
    const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + diff * Math.min(1, dt * 10);
  }
}
