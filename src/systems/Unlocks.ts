import * as THREE from 'three';
import { Economy } from '../content/economy';
import { IceShore } from '../content/zones';
import { HapticsSettings, UnlockFeel } from '../settings';
import type { GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import { createUnlockFrame, type UnlockFrameModel } from '../models/createMarkers';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import type { CoinSystem } from './Coins';

type ZoneDef = (typeof IceShore.unlockZones)[number];

interface Zone {
  def: ZoneDef;
  cost: number;
  frame: UnlockFrameModel;
  label: WorldLabel;
  lastShown: number;
}

/**
 * Dashed unlock frames (GDD §2 step 6): stand on one and coins pour in until it is paid, then it opens.
 */
export class Unlocks {
  private readonly zones: Zone[] = [];
  private pour = 0;
  private coinTimer = 0;
  private readonly target = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly state: GameState,
    private readonly player: Player,
    private readonly coins: CoinSystem,
    private readonly labels: WorldLabels,
    private readonly onUnlock: (id: string) => void,
  ) {
    for (const def of IceShore.unlockZones) {
      if (state.unlocked.includes(def.id)) continue;
      const frame = createUnlockFrame(def.size);
      frame.root.position.set(def.x, 0, def.z);
      scene.add(frame.root);
      const label = labels.create('unlock-price');
      label.anchor.set(def.x, 0.2, def.z + def.size / 2 + 0.1);
      labels.show(label, true);
      this.zones.push({ def, cost: Economy.unlocks[def.cost], frame, label, lastShown: -1 });
    }
  }

  /** Nearest locked zone the player can afford (for the guide arrow). */
  affordable(): { x: number; z: number } | null {
    for (const z of this.zones) {
      if (this.state.coins >= z.cost - (this.state.unlockPaid[z.def.id] ?? 0)) return z.def;
    }
    return null;
  }

  update(dt: number): void {
    const p = this.player.state;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i] as Zone;
      const half = z.def.size / 2;
      const inside = Math.abs(p.x - z.def.x) < half && Math.abs(p.z - z.def.z) < half;
      let paid = this.state.unlockPaid[z.def.id] ?? 0;

      if (inside && this.state.coins > 0 && paid < z.cost) {
        this.pour += (z.cost / UnlockFeel.fillTime) * dt;
        const amount = Math.min(Math.floor(this.pour), this.state.coins, z.cost - paid);
        if (amount > 0) {
          this.pour -= amount;
          this.state.coins -= amount;
          paid += amount;
          this.state.unlockPaid[z.def.id] = paid;
        }
        this.coinTimer -= dt;
        if (this.coinTimer <= 0) {
          this.coinTimer = UnlockFeel.coinInterval;
          this.coins.spendTo(this.target.set(z.def.x, 0.1, z.def.z));
        }
      } else if (!inside) {
        this.pour = 0;
      }

      z.frame.fill.scale.z = Math.max(paid / z.cost, 0.0001);
      const remaining = z.cost - paid;
      if (remaining !== z.lastShown) {
        z.label.el.innerHTML = `<span class="coin-icon small"></span>${remaining}`;
        z.lastShown = remaining;
      }

      if (paid >= z.cost) {
        this.scene.remove(z.frame.root);
        this.labels.show(z.label, false);
        this.zones.splice(i, 1);
        delete this.state.unlockPaid[z.def.id];
        this.state.unlocked.push(z.def.id);
        vibrate(HapticsSettings.unlock);
        this.onUnlock(z.def.id);
      }
    }
  }
}
