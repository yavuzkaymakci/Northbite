import * as THREE from 'three';
import { Economy } from '../content/economy';
import { IceShore } from '../content/zones';
import { CarryFeel } from '../settings';
import type { FishItem, GameState } from '../core/GameState';
import type { Player } from '../entities/Player';
import { COUNTER_TOP_Y } from '../models/createCounter';
import type { FishRenderer } from '../render/FishRenderer';
import type { CarryStack } from './CarryStack';
import { FlightList } from './Flights';

const C = IceShore.counter;
const COLS = 6;

/**
 * Sales counter (GDD §2 step 3): walking past it drops carried fish onto the table one by one.
 * Fish in flight are not yet in `state.counter`; `pendingItems` exposes them for saving.
 */
export class Selling {
  private readonly flights = new FlightList<FishItem>();
  private timer = 0;
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
  ) {}

  get pendingItems(): FishItem[] {
    return this.flights.items.map((f) => f.payload);
  }

  /** Fish visible on the table (customers can only take these). */
  get available(): number {
    return this.state.counter.length;
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

  /** Customer takes the last fish on the table. Returns its world position via `out`. */
  take(out: THREE.Vector3): FishItem | null {
    const item = this.state.counter.pop();
    if (!item) return null;
    this.state.stats.sold++;
    this.slotPosition(this.state.counter.length, out);
    return item;
  }

  update(dt: number): void {
    const p = this.player.state;
    const near = Math.hypot(p.x - C.dropPoint.x, p.z - C.dropPoint.z) <= CarryFeel.dropRadius;
    const room = Economy.counter.capacity - this.state.counter.length - this.flights.items.length;
    this.timer -= dt;
    if (near && room > 0 && this.stack.hiddenTop === 0 && this.state.carried.length > 0 && this.timer <= 0) {
      this.timer = CarryFeel.dropInterval;
      this.stack.topPosition(this.from);
      const item = this.state.carried.pop() as FishItem;
      this.slotPosition(this.state.counter.length + this.flights.items.length, this.to);
      this.flights.add(this.from, this.to, CarryFeel.flightTime, CarryFeel.arcHeight, item);
    }
    this.flights.update(dt, (f) => this.state.counter.push(f.payload));
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
