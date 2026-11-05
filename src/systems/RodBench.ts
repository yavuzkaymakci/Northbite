import * as THREE from 'three';
import type { StationUpgradeId } from '../content/stationUpgrades';
import type { UpgradeId } from '../content/upgrades';
import { IceShore } from '../content/zones';
import { BenchFeel, FishingFeel, HapticsSettings } from '../settings';
import type { GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import type { UpgradeKind, UpgradePanel } from '../ui/UpgradePanel';
import type { CoinSystem } from './Coins';
import { stationUpgradeCost } from './StationUpgrades';
import { sfx } from '../audio/AudioEngine';
import { upgradeCost } from './Upgrades';

const PAD = IceShore.bench.pad;

/** Rod bench: standing still on its pad opens the upgrade panel (rod, station and time upgrades); walking off closes it. */
export class RodBench {
  private stand = 0;
  /** Closed by the player (×, outside tap, back) while still on the pad: it stays shut until they step off. */
  private dismissed = false;
  private readonly target = new THREE.Vector3(IceShore.bench.x, 1, IceShore.bench.z);

  constructor(
    private readonly state: GameState,
    private readonly player: Player,
    private readonly coins: CoinSystem,
    private readonly panel: UpgradePanel,
  ) {
    panel.onClosed = (reason) => {
      this.dismissed = reason !== 'left';
    };
  }

  /** True while the player is on the pad (the guide stops pointing at it). */
  get playerOnPad(): boolean {
    const p = this.player.state;
    return Math.hypot(p.x - PAD.x, p.z - PAD.z) <= PAD.radius;
  }

  update(dt: number): void {
    const still = this.player.state.speed01 < FishingFeel.stillSpeed;
    // Walking off the pad closes the panel (the panel manager checks the pad every frame).
    if (this.playerOnPad) {
      if (still) this.stand += dt;
      if (this.stand >= BenchFeel.openDelay && !this.dismissed) this.panel.open(this.state, () => this.playerOnPad);
    } else {
      this.stand = 0;
      this.dismissed = false;
    }
    if (this.panel.opened) this.panel.refresh(this.state);
  }

  buy(kind: UpgradeKind, id: string): void {
    const s = this.state;
    const cost = kind === 'rod' ? upgradeCost(id as UpgradeId, s.upgrades[id as UpgradeId]) : stationUpgradeCost(id as StationUpgradeId, s.stationUpgrades[id as StationUpgradeId]);
    if (cost === null || s.coins < cost) {
      this.panel.deny(kind, id);
      sfx('deny');
      return;
    }
    s.coins -= cost;
    if (kind === 'rod') s.upgrades[id as UpgradeId]++;
    else s.stationUpgrades[id as StationUpgradeId]++;
    for (let i = 0; i < 6; i++) this.coins.spendTo(this.target);
    vibrate(HapticsSettings.upgrade);
    sfx('buy');
    this.panel.refresh(s);
    this.panel.celebrate(kind, id);
  }
}
