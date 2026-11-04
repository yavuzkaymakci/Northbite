import * as THREE from 'three';
import { Stations } from '../content/stations';
import { IceShore } from '../content/zones';
import { HapticsSettings, StationFeel } from '../settings';
import { clamp01 } from '../core/Ease';
import type { FishItem, GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import { createSmokehouse, RACK_TOP_Y, type SmokehouseModel } from '../models/createSmokehouse';
import type { Effects } from '../render/Effects';
import type { FishRenderer } from '../render/FishRenderer';
import { NightLights } from '../render/NightLights';
import type { WorldMap } from '../world/Map';
import type { Appear } from './Appear';
import type { CarryStack } from './CarryStack';
import { FlightList } from './Flights';
import { SmokerLogic } from './StationLogic';

const S = IceShore.smokehouse;
const CFG = Stations.smokehouse;
const PER_LAYER = 4;

/**
 * Smokehouse (GDD §6 zone 2): raw fish dropped on the input rack go inside one by one and come out smoked on the
 * output rack. Walking past the input rack hands over raw fish; walking past the output rack picks up smoked fish.
 */
export class Smokehouse {
  private built = false;
  private readonly logic: SmokerLogic;
  private model: SmokehouseModel | null = null;
  private readonly group = new THREE.Group();
  /** Raw fish flying onto the input rack (not yet in state). */
  private readonly toInput = new FlightList<FishItem>();
  /** Smoked fish hopping from the door to the output rack (already in state, drawn on landing). */
  private readonly toOutput = new FlightList<FishItem>();
  private inTimer = 0;
  private outTimer = 0;
  private puffTimer = 0;
  private steamTimer = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly doorWorld = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly state: GameState,
    private readonly player: Player,
    private readonly stack: CarryStack,
    private readonly fx: Effects,
    private readonly world: WorldMap,
    private readonly appear: Appear,
  ) {
    this.logic = new SmokerLogic(state);
    scene.add(this.group);
  }

  get isBuilt(): boolean {
    return this.built;
  }

  /** Raw fish flying onto the input rack (saved as if they had landed). */
  get pendingInput(): FishItem[] {
    return this.toInput.items.map((f) => f.payload);
  }

  build(animate: boolean): void {
    if (this.built) return;
    this.built = true;
    const local = (p: { x: number; z: number }) => ({ x: p.x - S.x, z: p.z - S.z });
    this.model = createSmokehouse(S.width, S.depth, { ...S.rack, input: local(S.input), output: local(S.output) });
    this.model.root.position.set(S.x, 0, S.z);
    this.group.add(this.model.root);
    this.doorWorld.set(S.x + this.model.door.x, 0.6, S.z + this.model.door.z);
    this.world.addCollider({ kind: 'rect', minX: S.x - S.width / 2 - 0.1, maxX: S.x + S.width / 2 + 0.1, minZ: S.z - S.depth / 2 - 0.1, maxZ: S.z + S.depth / 2 + 0.1 });
    for (const r of [S.input, S.output]) {
      this.world.addCollider({ kind: 'rect', minX: r.x - S.rack.width / 2, maxX: r.x + S.rack.width / 2, minZ: r.z - S.rack.length / 2, maxZ: r.z + S.rack.length / 2 });
    }
    if (animate) this.appear.add(this.model.root);
  }

  /** Free input places, counting fish flying in. */
  room(): number {
    return this.built ? CFG.inputCapacity - this.state.smoker.input.length - this.toInput.items.length : 0;
  }

  receive(item: FishItem, from: THREE.Vector3): void {
    this.inputSlot(this.state.smoker.input.length + this.toInput.items.length, this.to);
    this.toInput.add(from, this.to, StationFeel.flightTime, StationFeel.arcHeight, item);
  }

  /** Smoked fish a helper or the player may take (ones still hopping out excluded). */
  takeable(): number {
    return this.built ? Math.max(this.state.smoker.output.length - this.toOutput.items.length, 0) : 0;
  }

  takeItem(out: THREE.Vector3): FishItem | null {
    const n = this.takeable();
    if (n <= 0) return null;
    this.outputSlot(n - 1, out);
    return this.state.smoker.output.splice(n - 1, 1)[0] ?? null;
  }

  update(dt: number, time: number): void {
    if (!this.built || !this.model) return;
    const done = this.logic.update(dt);
    if (done) {
      this.outputSlot(this.state.smoker.output.length - 1, this.to);
      this.toOutput.add(this.doorWorld, this.to, 0.45, 0.7, done);
      this.fx.smoke(this.doorWorld.x, 1.2, this.doorWorld.z + 0.2, 0.22);
    }
    this.toInput.update(dt, (f) => this.state.smoker.input.push(f.payload));
    this.toOutput.update(dt, () => {});

    // Fire glow flickers while smoking; chimney smokes more.
    const working = this.logic.working;
    const flicker = working ? 0.85 + Math.sin(time * 17) * 0.12 + Math.sin(time * 41) * 0.08 + Math.random() * 0.1 : 0.35;
    this.model.glowMaterial.emissiveIntensity = flicker * (1 + NightLights.level * 0.7);
    (this.model.groundGlow.material as THREE.MeshBasicMaterial).opacity = working ? 0.35 + flicker * 0.15 : 0.15;
    this.puffTimer -= dt;
    if (this.puffTimer <= 0) {
      this.puffTimer = StationFeel.smokePuffInterval * (working ? 1 : 3) * (0.7 + Math.random() * 0.6);
      const c = this.model.chimneyTop;
      this.fx.smoke(S.x + c.x + (Math.random() - 0.5) * 0.15, c.y, S.z + c.z, working ? 0.34 : 0.24);
    }
    this.steamTimer -= dt;
    if (this.steamTimer <= 0 && this.takeable() > 0) {
      this.steamTimer = StationFeel.steamInterval * (0.6 + Math.random() * 0.8);
      this.outputSlot(Math.floor(Math.random() * this.takeable()), this.to);
      this.fx.steam(this.to.x, this.to.y + 0.1, this.to.z);
    }

    // The player hands over raw fish at the input and picks up smoked fish at the output.
    const p = this.player.state;
    const nearIn = Math.hypot(p.x - S.input.x, p.z - S.input.z) <= StationFeel.pickupRadius;
    const nearOut = Math.hypot(p.x - S.output.x, p.z - S.output.z) <= StationFeel.pickupRadius;
    this.inTimer -= dt;
    this.outTimer -= dt;
    if (nearIn && this.inTimer <= 0 && this.room() > 0 && this.stack.hasRaw()) {
      this.inTimer = StationFeel.transferInterval;
      const item = this.stack.takeRaw(this.from);
      if (item) this.receive(item, this.from);
    }
    if (nearOut && this.outTimer <= 0 && !this.stack.isFull && this.takeable() > 0) {
      this.outTimer = StationFeel.transferInterval;
      const item = this.takeItem(this.from);
      if (item) {
        this.stack.receive(item, this.from);
        vibrate(HapticsSettings.fishAdded);
      }
    }
  }

  render(fish: FishRenderer): void {
    if (!this.built) return;
    const s = this.state.smoker;
    for (let i = 0; i < s.input.length; i++) {
      this.inputSlot(i, this.to);
      // The first fish slides toward the door while it is being smoked.
      if (i === 0 && s.progress > 0) {
        const k = clamp01(s.progress * 2.5);
        if (k >= 1) continue;
        this.to.lerp(this.doorWorld, k);
      }
      this.place(this.to, i, fish, s.input[i] as FishItem);
    }
    for (const f of this.toInput.items) this.place(f.pos, f.t * 6, fish, f.payload);
    const shown = s.output.length - this.toOutput.items.length;
    for (let i = 0; i < shown; i++) {
      this.outputSlot(i, this.to);
      this.place(this.to, i, fish, s.output[i] as FishItem);
    }
    for (const f of this.toOutput.items) this.place(f.pos, f.t * 6, fish, f.payload);
  }

  private place(pos: THREE.Vector3, spin: number, fish: FishRenderer, item: FishItem): void {
    this.e.set(Math.PI / 2, Math.floor(spin) % 2 ? Math.PI + 0.08 : -0.08, 0);
    this.m.compose(pos, this.q.setFromEuler(this.e), this.one);
    fish.add(item, this.m, 0.85);
  }

  /** Rack slots: 4 along the rack, a second layer on top. Fish lie across the rack (along X). */
  private rackSlot(rack: { x: number; z: number }, index: number, out: THREE.Vector3): THREE.Vector3 {
    const layer = Math.floor(index / PER_LAYER);
    const i = index % PER_LAYER;
    const z = rack.z - S.rack.length / 2 + 0.22 + (i * (S.rack.length - 0.44)) / (PER_LAYER - 1);
    return out.set(rack.x + layer * 0.06, RACK_TOP_Y + 0.07 + layer * 0.15, z + layer * 0.08);
  }

  private inputSlot(index: number, out: THREE.Vector3): THREE.Vector3 {
    return this.rackSlot(S.input, index, out);
  }

  private outputSlot(index: number, out: THREE.Vector3): THREE.Vector3 {
    return this.rackSlot(S.output, index, out);
  }
}
