import * as THREE from 'three';
import { CarryFeel, StationFeel } from '../settings';
import type { FishItem, GameState } from '../core/GameState';
import type { Player } from '../entities/Player';
import { FishRenderer } from '../render/FishRenderer';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import { FlightList } from './Flights';
import { carryCapacity } from './Upgrades';

const BACK_Z = -0.4;
const BASE_Y = 0.78;
const GAP = 0.025;

/**
 * Fish carried on the player's back (GDD §2), raw and smoked mixed. State lives in `GameState.carried`;
 * `hiddenTop` hides items that are already owned but still flying in (catch animation, basket/rack pickups).
 */
export class CarryStack {
  hiddenTop = 0;
  private readonly label: WorldLabel;
  private readonly incoming = new FlightList<FishItem>();
  private readonly world = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly lie = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  private readonly tmp = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private lastText = '';

  constructor(
    private readonly state: GameState,
    private readonly player: Player,
    private readonly labels: WorldLabels,
  ) {
    this.label = labels.create('stack-count');
  }

  /** Carry capacity (backpack upgrade). */
  get capacity(): number {
    return carryCapacity(this.state);
  }

  get isFull(): boolean {
    return this.state.carried.length >= this.capacity;
  }

  /** Visible fish count (excludes ones still flying in). */
  get visibleCount(): number {
    return Math.max(this.state.carried.length - this.hiddenTop, 0);
  }

  /** A station hands the player a fish: owned now, drawn once its flight lands on the stack. */
  receive(item: FishItem, from: THREE.Vector3): void {
    this.state.carried.push(item);
    this.hiddenTop++;
    this.incoming.add(from, this.topPosition(this.v), StationFeel.flightTime, StationFeel.arcHeight, item);
  }

  /** True if there is a raw fish the player can hand over (not one still landing). */
  hasRaw(): boolean {
    for (let i = 0; i < this.visibleCount; i++) if (this.state.carried[i]?.kind === 'raw') return true;
    return false;
  }

  /** Removes the topmost visible raw fish (for the smokehouse rack). `out` gets the stack top position. */
  takeRaw(out: THREE.Vector3): FishItem | null {
    if (this.hiddenTop > 0) return null;
    for (let i = this.state.carried.length - 1; i >= 0; i--) {
      if (this.state.carried[i]?.kind !== 'raw') continue;
      const item = this.state.carried.splice(i, 1)[0] as FishItem;
      this.topPosition(out);
      return item;
    }
    return null;
  }

  /** Height of the stack top above the base, counting `count` items. */
  private heightOf(count: number): number {
    let h = 0;
    for (let i = 0; i < count; i++) {
      const item = this.state.carried[i];
      if (item) h += FishRenderer.thicknessOf(item) + GAP;
    }
    return h;
  }

  /** World position where the next fish lands (top of the visible stack). */
  topPosition(out: THREE.Vector3): THREE.Vector3 {
    const s = this.player.state;
    const h = BASE_Y + this.heightOf(this.visibleCount);
    out.set(0, h, BACK_Z).applyAxisAngle(this.up, s.heading);
    return out.set(out.x + s.x, out.y, out.z + s.z);
  }

  /** Moves station-to-back flights (they chase the walking player). */
  update(dt: number): void {
    for (const f of this.incoming.items) this.topPosition(f.to);
    this.incoming.update(dt, () => (this.hiddenTop = Math.max(this.hiddenTop - 1, 0)));
  }

  render(fish: FishRenderer, time: number): void {
    const s = this.player.state;
    this.world.compose(this.v.set(s.x, 0, s.z), this.q.setFromAxisAngle(this.up, s.heading), this.one);
    const n = this.visibleCount;
    let h = BASE_Y;
    for (let i = 0; i < n; i++) {
      const item = this.state.carried[i];
      if (!item) continue;
      const th = FishRenderer.thicknessOf(item);
      const sway = Math.sin(this.player.walkPhase + i * 0.35) * s.speed01 * CarryFeel.stackSway * i;
      const idle = Math.sin(time * 1.7 + i) * 0.006 * i;
      this.local.makeRotationY((i % 2 ? 0.08 : -0.08) + sway * 0.6).setPosition(sway + idle, h + th / 2, BACK_Z);
      this.tmp.multiplyMatrices(this.world, this.local).multiply(this.lie);
      fish.add(item, this.tmp);
      h += th + GAP;
    }
    for (const f of this.incoming.items) {
      this.e.set(Math.PI / 2, f.t * Math.PI * 2, 0);
      this.tmp.compose(f.pos, this.q.setFromEuler(this.e), this.one);
      fish.add(f.payload, this.tmp);
    }
    this.updateLabel(h);
  }

  private updateLabel(topY: number): void {
    const count = this.state.carried.length;
    this.labels.show(this.label, count > 0);
    if (count === 0) return;
    const s = this.player.state;
    this.label.anchor.set(0, Math.max(topY, 1.9) + 0.45, BACK_Z).applyAxisAngle(this.up, s.heading);
    this.label.anchor.x += s.x;
    this.label.anchor.z += s.z;
    const text = `${count}/${this.capacity}`;
    if (text !== this.lastText) {
      this.label.el.textContent = text;
      this.label.el.classList.toggle('full', count >= this.capacity);
      this.lastText = text;
    }
  }
}
