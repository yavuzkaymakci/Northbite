import * as THREE from 'three';
import type { UpgradeId } from '../content/upgrades';
import { IceShore } from '../content/zones';
import { BenchFeel, FishingFeel, HapticsSettings } from '../settings';
import type { GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import type { UpgradePanel } from '../ui/UpgradePanel';
import type { CoinSystem } from './Coins';
import { upgradeCost } from './Upgrades';

const PAD = IceShore.bench.pad;

/** Rod bench: standing still on its pad opens the upgrade panel; walking off closes it. */
export class RodBench {
  private stand = 0;
  private readonly target = new THREE.Vector3(IceShore.bench.x, 1, IceShore.bench.z);

  constructor(
    private readonly state: GameState,
    private readonly player: Player,
    private readonly coins: CoinSystem,
    private readonly panel: UpgradePanel,
  ) {}

  /** True while the player is on the pad (the guide stops pointing at it). */
  get playerOnPad(): boolean {
    const p = this.player.state;
    return Math.hypot(p.x - PAD.x, p.z - PAD.z) <= PAD.radius;
  }

  update(dt: number): void {
    const still = this.player.state.speed01 < FishingFeel.stillSpeed;
    if (this.playerOnPad) {
      if (still) this.stand += dt;
      if (this.stand >= BenchFeel.openDelay) this.panel.open(this.state);
    } else {
      this.stand = 0;
      this.panel.close();
    }
    if (this.panel.opened) this.panel.refresh(this.state);
  }

  buy(id: UpgradeId): void {
    const cost = upgradeCost(id, this.state.upgrades[id]);
    if (cost === null || this.state.coins < cost) {
      this.panel.deny(id);
      return;
    }
    this.state.coins -= cost;
    this.state.upgrades[id]++;
    for (let i = 0; i < 6; i++) this.coins.spendTo(this.target);
    vibrate(HapticsSettings.upgrade);
    this.panel.refresh(this.state);
    this.panel.celebrate(id);
  }
}
