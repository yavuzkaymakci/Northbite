import * as THREE from 'three';
import { Threats } from '../content/threats';
import { t, tf } from '../content/strings';
import { ThreatBuildingSpots, ThreatLayout, type BuildingId } from '../content/zones';
import { HapticsSettings, StationFeel } from '../settings';
import type { FishItem, GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import {
  BAIT_Y,
  createBaitTrap,
  createFirePit,
  createSnowFence,
  createTorchStand,
  createWatchtower,
  TORCH_STAND_SLOTS,
} from '../models/createThreatProps';
import type { FishRenderer } from '../render/FishRenderer';
import type { FlameRenderer } from '../render/FlameRenderer';
import { createLightPool, NightLights } from '../render/NightLights';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import type { WorldMap } from '../world/Map';
import type { Appear } from './Appear';
import type { CarryStack } from './CarryStack';
import { FIRE_PITS } from './ThreatLogic';
import { FlightList } from './Flights';

const S = ThreatBuildingSpots;
const TORCH_FLAME_Y = 1.1;

/**
 * Threat buildings (GDD §13): torch stand (walk past it for free torches), bait trap (walk past it with a raw fish to
 * leave one), fire pits, watchtower and snow fence. Their effects on bears and avalanches are read by the threat
 * systems through `isBuilt`.
 */
export class ThreatBuildings {
  private readonly built = new Set<BuildingId>();
  private readonly group = new THREE.Group();
  private readonly toBait = new FlightList<FishItem>();
  private readonly toastLabel: WorldLabel;
  private toastTimer = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly state: GameState,
    private readonly player: Player,
    private readonly stack: CarryStack,
    private readonly world: WorldMap,
    private readonly labels: WorldLabels,
    private readonly appear: Appear,
  ) {
    scene.add(this.group);
    this.toastLabel = labels.create('threat-toast');
    for (const id of Object.keys(S) as BuildingId[]) if (state.unlocked.includes(id)) this.build(id, false);
  }

  isBuilt(id: BuildingId): boolean {
    return this.built.has(id);
  }

  build(id: BuildingId, animate: boolean): void {
    if (this.built.has(id)) return;
    this.built.add(id);
    const at = S[id].at;
    let obj: THREE.Object3D;
    switch (id) {
      case 'torchStand':
        obj = createTorchStand();
        this.world.addCollider({ kind: 'rect', minX: at.x - 0.55, maxX: at.x + 0.55, minZ: at.z - 0.25, maxZ: at.z + 0.25 });
        break;
      case 'baitTrap':
        obj = createBaitTrap();
        this.world.addCollider({ kind: 'circle', x: at.x, z: at.z, r: 0.5 });
        break;
      case 'watchtower':
        obj = createWatchtower(NightLights.window);
        this.world.addCollider({ kind: 'rect', minX: at.x - 0.75, maxX: at.x + 0.75, minZ: at.z - 0.75, maxZ: at.z + 1.0 });
        break;
      case 'snowFence': {
        const f = ThreatLayout.avalanche.fence;
        obj = createSnowFence(f.maxZ - f.minZ);
        break;
      }
      default: {
        // Fire pits glow on the snow at night.
        const pit = new THREE.Group();
        const pool = createLightPool(4.2, 4.2);
        pit.add(createFirePit(), pool);
        obj = pit;
        this.world.addCollider({ kind: 'circle', x: at.x, z: at.z, r: 0.6 });
      }
    }
    obj.position.set(at.x, 0, at.z);
    this.group.add(obj);
    if (animate) this.appear.add(obj);
  }

  /** Guard penguins (GDD §24): 1 when the trap is built and empty (and no fish is flying in). */
  baitRoom(): number {
    return this.built.has('baitTrap') && !this.state.threats.bait && this.toBait.items.length === 0 ? 1 : 0;
  }

  /** A guard sets the trap with a raw fish from the basket. */
  setBait(item: FishItem, from: THREE.Vector3): void {
    this.toBait.add(from, this.to.set(S.baitTrap.at.x, BAIT_Y + 0.05, S.baitTrap.at.z), StationFeel.flightTime, StationFeel.arcHeight, item);
  }

  update(dt: number): void {
    const p = this.player.state;
    const g = this.state.threats;
    const near = (id: BuildingId) => this.built.has(id) && Math.hypot(p.x - S[id].at.x, p.z - S[id].at.z) <= StationFeel.pickupRadius + 0.2;

    // Torch stand: torches are free, topped up to the full count.
    if (near('torchStand') && g.torches < Threats.torch.uses) {
      g.torches = Threats.torch.uses;
      vibrate(HapticsSettings.fishAdded);
      this.toast(tf('torchesTaken', { n: Threats.torch.uses }), S.torchStand.at.x, S.torchStand.at.z);
    }
    // Bait trap: an empty trap takes one raw fish off the player's back.
    if (near('baitTrap') && !g.bait && this.toBait.items.length === 0 && this.stack.hasRaw()) {
      const item = this.stack.takeRaw(this.from);
      if (item) {
        this.toBait.add(this.from, this.to.set(S.baitTrap.at.x, BAIT_Y + 0.05, S.baitTrap.at.z), StationFeel.flightTime, StationFeel.arcHeight, item);
      }
    }
    this.toBait.update(dt, (f) => {
      g.bait = f.payload;
      this.toast(t('baitSet'), S.baitTrap.at.x, S.baitTrap.at.z);
    });

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.labels.show(this.toastLabel, false);
    }
  }

  render(fish: FishRenderer, flames: FlameRenderer, time: number): void {
    const bait = this.state.threats.bait;
    if (bait && this.built.has('baitTrap')) {
      this.e.set(Math.PI / 2, 0.3, 0);
      this.m.compose(this.to.set(S.baitTrap.at.x, BAIT_Y + 0.05, S.baitTrap.at.z), this.q.setFromEuler(this.e), this.one);
      fish.add(bait, this.m);
    }
    for (const f of this.toBait.items) {
      this.e.set(Math.PI / 2, f.t * 6, 0);
      this.m.compose(f.pos, this.q.setFromEuler(this.e), this.one);
      fish.add(f.payload, this.m);
    }
    FIRE_PITS.forEach((id, i) => {
      if (this.built.has(id)) flames.add(S[id].at.x, 0.1, S[id].at.z, 1.25, time, i * 2.1);
    });
    if (this.built.has('torchStand')) {
      const a = S.torchStand.at;
      TORCH_STAND_SLOTS.forEach((x, i) => flames.add(a.x + x, TORCH_FLAME_Y, a.z, 0.38, time, 7 + i * 1.7));
    }
  }

  /** Short floating note over a building ("+3 torches", "Bait set"). */
  private toast(text: string, x: number, z: number): void {
    this.toastLabel.el.textContent = text;
    this.toastLabel.anchor.set(x, 2.0, z);
    this.labels.pop(this.toastLabel);
    this.toastTimer = 1.6;
  }
}
