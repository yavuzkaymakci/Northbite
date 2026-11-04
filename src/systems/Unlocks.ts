import * as THREE from 'three';
import { Economy } from '../content/economy';
import { unlockName } from '../content/strings';
import { scaledPrice } from '../content/tuning';
import { Regions, UnlockZones, type RegionDef, type UnlockZoneDef } from '../content/zones';
import { HapticsSettings, UnlockFeel } from '../settings';
import { isDone, type GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import { createUnlockFrame, type UnlockFrameModel } from '../models/createMarkers';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import type { Appear } from './Appear';
import type { CoinSystem } from './Coins';

/** One payable frame: an unlock zone or a region's gate in front of its ice wall. */
export interface UnlockSpot {
  id: string;
  x: number;
  z: number;
  size: number;
  cost: number;
  requires: readonly string[];
  zone: UnlockZoneDef | null;
  region: RegionDef | null;
}

interface Shown {
  spot: UnlockSpot;
  frame: UnlockFrameModel;
  label: WorldLabel;
  costEl: HTMLElement;
  lastShown: number;
  stand: number;
}

/** Every unlock in the game as a spot list (zones inside a region also require that region). */
function allSpots(): UnlockSpot[] {
  const spots: UnlockSpot[] = [];
  for (const r of Regions) {
    spots.push({ id: r.id, ...r.gate, cost: scaledPrice(Economy.unlocks[r.cost]), requires: r.requires, zone: null, region: r });
  }
  for (const z of UnlockZones) {
    const inRegion = Regions.find((r) => r.unlockZones.includes(z.id));
    const requires = inRegion ? [...z.requires, inRegion.id] : z.requires;
    spots.push({ id: z.id, x: z.x, z: z.z, size: z.size, cost: scaledPrice(Economy.unlocks[z.cost]), requires, zone: z, region: null });
  }
  return spots;
}

/**
 * Dashed unlock frames (GDD §2 step 6): stand on one and coins pour in until it is paid, then it opens.
 * A frame only shows up once its requirements are done; new frames bounce in.
 */
export class Unlocks {
  private readonly pending: UnlockSpot[];
  private readonly shown: Shown[] = [];
  private pour = 0;
  private coinTimer = 0;
  private readonly target = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly state: GameState,
    private readonly player: Player,
    private readonly coins: CoinSystem,
    private readonly labels: WorldLabels,
    private readonly appear: Appear,
    private readonly onUnlock: (spot: UnlockSpot) => void,
  ) {
    this.pending = allSpots().filter((s) => !isDone(state, s.id));
    this.refresh(false);
  }

  /** Frames on the ground right now. */
  get visible(): readonly UnlockSpot[] {
    return this.shown.map((s) => s.spot);
  }

  /** Coins still needed for a spot. */
  remaining(spot: UnlockSpot): number {
    return spot.cost - (this.state.unlockPaid[spot.id] ?? 0);
  }

  /** Shows frames whose requirements are now met. `delay` holds the bounce (e.g. until the camera arrives). */
  refresh(animate = true, delay = 0): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const spot = this.pending[i] as UnlockSpot;
      if (!spot.requires.every((r) => isDone(this.state, r))) continue;
      this.pending.splice(i, 1);
      this.show(spot, animate, delay);
    }
  }

  private show(spot: UnlockSpot, animate: boolean, delay: number): void {
    const frame = createUnlockFrame(spot.size);
    frame.root.position.set(spot.x, 0, spot.z);
    this.scene.add(frame.root);
    const name = spot.region ? unlockName('region') : unlockName(spot.id);
    const label = this.labels.create(
      'unlock-price',
      `${name ? `<div class="unlock-name">${name}</div>` : ''}<div class="unlock-cost"><span class="coin-icon small"></span><span class="unlock-value"></span></div>`,
    );
    label.anchor.set(spot.x, 0.2, spot.z + spot.size / 2 + 0.1);
    const costEl = label.el.querySelector('.unlock-value') as HTMLElement;
    if (animate) {
      this.appear.add(frame.root, delay, true);
      window.setTimeout(() => this.labels.pop(label), (delay + 0.25) * 1000);
    } else {
      this.labels.show(label, true);
    }
    this.shown.push({ spot, frame, label, costEl, lastShown: -1, stand: 0 });
  }

  update(dt: number): void {
    const p = this.player.state;
    for (let i = this.shown.length - 1; i >= 0; i--) {
      const z = this.shown[i] as Shown;
      const spot = z.spot;
      const half = spot.size / 2;
      const inside = Math.abs(p.x - spot.x) < half && Math.abs(p.z - spot.z) < half;
      let paid = this.state.unlockPaid[spot.id] ?? 0;
      z.stand = inside ? z.stand + dt : 0;

      if (inside && z.stand >= UnlockFeel.startDelay && this.state.coins > 0 && paid < spot.cost) {
        this.pour += (spot.cost / UnlockFeel.fillTime) * dt;
        const amount = Math.min(Math.floor(this.pour), this.state.coins, spot.cost - paid);
        if (amount > 0) {
          this.pour -= amount;
          this.state.coins -= amount;
          paid += amount;
          this.state.unlockPaid[spot.id] = paid;
        }
        this.coinTimer -= dt;
        if (this.coinTimer <= 0) {
          this.coinTimer = UnlockFeel.coinInterval;
          this.coins.spendTo(this.target.set(spot.x, 0.1, spot.z));
        }
      } else if (!inside) {
        this.pour = Math.min(this.pour, 1);
      }

      z.frame.fill.scale.z = Math.max(paid / spot.cost, 0.0001);
      const remaining = spot.cost - paid;
      if (remaining !== z.lastShown) {
        z.costEl.textContent = String(remaining);
        z.lastShown = remaining;
      }

      if (paid >= spot.cost) {
        this.scene.remove(z.frame.root);
        this.labels.show(z.label, false);
        this.shown.splice(i, 1);
        delete this.state.unlockPaid[spot.id];
        if (spot.region) this.state.regions.push(spot.id);
        else this.state.unlocked.push(spot.id);
        vibrate(HapticsSettings.unlock);
        this.onUnlock(spot);
        if (!spot.region) this.refresh(true, 0.2);
      }
    }
  }
}
