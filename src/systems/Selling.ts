import * as THREE from 'three';
import { IceShore } from '../content/zones';
import { CarryFeel, StationFeel } from '../settings';
import { stationValue } from './StationUpgrades';
import type { FishItem, GameState } from '../core/GameState';
import type { Player } from '../entities/Player';
import { COUNTER_TOP_Y } from '../models/createCounter';
import type { Effects } from '../render/Effects';
import type { FishRenderer } from '../render/FishRenderer';
import type { CarryStack } from './CarryStack';
import { FlightList } from './Flights';

const C = IceShore.counter;
const COLS = 6;

/**
 * Sales counter (GDD §2 step 3): walking past it drops carried fish (raw or smoked) onto the table one by one.
 * Helpers drop fish here too. Fish in flight are not yet in `state.counter`; `pendingItems` exposes them for saving.
 */
export class Selling {
  private readonly flights = new FlightList<FishItem>();
  private timer = 0;
  private steamTimer = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();

  constructor(
    private readonly state: GameState,
    private readonly player: Player,
    private readonly stack: CarryStack,
    private readonly fx: Effects,
  ) {}

  get pendingItems(): FishItem[] {
    return this.flights.items.map((f) => f.payload);
  }

  /** Fish visible on the table (customers can only take these). */
  get available(): number {
    return this.state.counter.length;
  }

  /** Free places, counting fish already flying in. */
  room(): number {
    return stationValue(this.state, 'counterCapacity') - this.state.counter.length - this.flights.items.length;
  }

  /** Something else (a helper) puts a fish on the table. */
  receive(item: FishItem, from: THREE.Vector3): void {
    this.slotPosition(this.state.counter.length + this.flights.items.length, this.to);
    this.flights.add(from, this.to, CarryFeel.flightTime, CarryFeel.arcHeight, item);
  }

  slotPosition(index: number, out: THREE.Vector3): THREE.Vector3 {
    // Fish lie along X: 2 columns × 3 rows per layer, a second layer on top.
    const inLayer = index % COLS;
    const layer = Math.floor(index / COLS);
    const col = inLayer % 2;
    const row = Math.floor(inLayer / 2);
    const x = C.x + (col === 0 ? -0.62 : 0.62) + layer * 0.1;
    const z = C.z - 0.27 + row * 0.27;
    return out.set(x, COUNTER_TOP_Y + 0.06 + layer * 0.17, z);
  }

  /**
   * A customer takes a random fish from the table. The last fish moves into the freed slot so only one fish shifts.
   * Returns its world position via `out`.
   */
  take(out: THREE.Vector3): FishItem | null {
    const list = this.state.counter;
    if (list.length === 0) return null;
    const i = Math.floor(Math.random() * list.length);
    const item = list[i] as FishItem;
    list[i] = list[list.length - 1] as FishItem;
    list.pop();
    this.state.stats.sold++;
    this.state.today.sold++;
    this.slotPosition(i, out);
    return item;
  }

  update(dt: number): void {
    const p = this.player.state;
    const near = Math.hypot(p.x - C.dropPoint.x, p.z - C.dropPoint.z) <= CarryFeel.dropRadius;
    this.timer -= dt;
    if (near && this.room() > 0 && this.stack.hiddenTop === 0 && this.state.carried.length > 0 && this.timer <= 0) {
      this.timer = CarryFeel.dropInterval;
      this.stack.topPosition(this.from);
      this.receive(this.state.carried.pop() as FishItem, this.from);
    }
    this.flights.update(dt, (f) => this.state.counter.push(f.payload));

    // Smoked fish on the table steam a little.
    this.steamTimer -= dt;
    if (this.steamTimer <= 0) {
      this.steamTimer = StationFeel.steamInterval * (0.6 + Math.random() * 0.8);
      const smoked = this.state.counter.findIndex((f, i) => f.kind === 'smoked' && Math.random() < 0.5 + i * 0.02);
      if (smoked >= 0) {
        this.slotPosition(smoked, this.to);
        this.fx.steam(this.to.x, this.to.y + 0.12, this.to.z);
      }
    }
  }

  render(fish: FishRenderer): void {
    for (let i = 0; i < this.state.counter.length; i++) {
      const item = this.state.counter[i] as FishItem;
      this.slotPosition(i, this.to);
      this.e.set(Math.PI / 2, (i % 2 ? Math.PI : 0) + ((i * 1.7) % 0.3) - 0.15, 0);
      this.m.compose(this.to, this.q.setFromEuler(this.e), this.one);
      fish.add(item, this.m);
    }
    for (const f of this.flights.items) {
      this.e.set(Math.PI / 2, f.t * Math.PI * 2, 0);
      this.m.compose(f.pos, this.q.setFromEuler(this.e), this.one);
      fish.add(f.payload, this.m);
    }
  }
}
