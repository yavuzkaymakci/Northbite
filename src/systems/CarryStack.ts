import * as THREE from 'three';
import { CarryFeel, StationFeel } from '../settings';
import type { FishItem, GameState } from '../core/GameState';
import type { Player } from '../entities/Player';
import { FishRenderer } from '../render/FishRenderer';
import type { GoodsRenderer } from '../render/GoodsRenderer';
import { LandFeel } from '../settings';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import { FlightList } from './Flights';
import { sfx } from '../audio/AudioEngine';
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
  /** Crystals already owned but still flying onto the back. */
  private hiddenCrystals = 0;
  private readonly crystalsIn = new FlightList<number>();
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

  /** Fish and crystals share the capacity (GDD §15). */
  get isFull(): boolean {
    return this.state.carried.length + this.state.carriedCrystals >= this.capacity;
  }

  /** Free places on the back. */
  get room(): number {
    return Math.max(this.capacity - this.state.carried.length - this.state.carriedCrystals, 0);
  }

  /** Crystals from a vein: owned now, drawn once they land on top of the stack. */
  receiveCrystals(n: number, from: THREE.Vector3): void {
    for (let i = 0; i < n; i++) {
      this.state.carriedCrystals++;
      this.hiddenCrystals++;
      const f = this.crystalsIn.add(from, this.crystalTop(this.v, this.state.carriedCrystals - 1), StationFeel.flightTime * 1.3, StationFeel.arcHeight * 1.3, 0);
      f.t = -i * 0.12;
    }
  }

  /** Takes one landed crystal off the top (crystal bench). `out` gets where it was. */
  takeCrystal(out: THREE.Vector3): boolean {
    if (this.state.carriedCrystals - this.hiddenCrystals <= 0) return false;
    this.state.carriedCrystals--;
    this.crystalTop(out, this.state.carriedCrystals);
    return true;
  }

  /** True if there is a landed smoked fish on the back (camp kitchen). */
  hasSmoked(): boolean {
    for (let i = 0; i < this.visibleCount; i++) if (this.state.carried[i]?.kind === 'smoked') return true;
    return false;
  }

  /** Removes the topmost visible smoked fish (camp kitchen). `out` gets the stack top position. */
  takeSmoked(out: THREE.Vector3): FishItem | null {
    if (this.hiddenTop > 0) return null;
    for (let i = this.state.carried.length - 1; i >= 0; i--) {
      if (this.state.carried[i]?.kind !== 'smoked') continue;
      const item = this.state.carried.splice(i, 1)[0] as FishItem;
      this.topPosition(out);
      return item;
    }
    return null;
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
    this.incoming.update(dt, () => {
      this.hiddenTop = Math.max(this.hiddenTop - 1, 0);
      sfx('stackAdd');
    });
    this.crystalsIn.items.forEach((f, i) => this.crystalTop(f.to, this.state.carriedCrystals - this.crystalsIn.items.length + i));
    this.crystalsIn.update(dt, () => (this.hiddenCrystals = Math.max(this.hiddenCrystals - 1, 0)));
  }

  /** Crystals ride on top of the fish, standing up. */
  private crystalTop(out: THREE.Vector3, index: number): THREE.Vector3 {
    const s = this.player.state;
    const h = BASE_Y + this.heightOf(this.visibleCount) + 0.18 + index * 0.24;
    out.set((index % 2 ? 0.07 : -0.07), h, BACK_Z).applyAxisAngle(this.up, s.heading);
    return out.set(out.x + s.x, out.y, out.z + s.z);
  }

  render(fish: FishRenderer, time: number, goods?: GoodsRenderer): void {
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
    const landed = this.state.carriedCrystals - this.hiddenCrystals;
    if (goods) {
      for (let i = 0; i < landed; i++) {
        this.crystalTop(this.v, i);
        goods.add('crystal', this.v.x, this.v.y, this.v.z, s.heading + i, LandFeel.crystalScale);
      }
      for (const f of this.crystalsIn.items) if (f.t >= 0) goods.add('crystal', f.pos.x, f.pos.y, f.pos.z, f.t * 8, LandFeel.crystalScale);
    }
    this.updateLabel(landed > 0 ? h + 0.18 + landed * 0.24 : h);
  }

  private updateLabel(topY: number): void {
    const count = this.state.carried.length + this.state.carriedCrystals;
    this.labels.show(this.label, count > 0);
    if (count === 0) return;
    const s = this.player.state;
    this.label.anchor.set(0, Math.max(topY, 1.9) + 0.45, BACK_Z).applyAxisAngle(this.up, s.heading);
    this.label.anchor.x += s.x;
    this.label.anchor.z += s.z;
    const crystals = this.state.carriedCrystals;
    const text = crystals > 0 ? `${count}/${this.capacity} <span class="crystal-icon"></span>${crystals}` : `${count}/${this.capacity}`;
    if (text !== this.lastText) {
      this.label.el.innerHTML = text;
      this.label.el.classList.toggle('full', count >= this.capacity);
      this.lastText = text;
    }
  }
}
