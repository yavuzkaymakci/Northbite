import * as THREE from 'three';
import { getLang, tf } from '../content/strings';
import { RoleById, type RoleId } from '../content/roles';
import { IceShore } from '../content/zones';
import { FishingFeel, HapticsSettings, MarketFeel } from '../settings';
import type { GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import type { Effects } from '../render/Effects';
import type { Banner } from '../ui/Banner';
import type { MarketPanel } from '../ui/MarketPanel';
import type { WorldMap } from '../world/Map';
import { sfx } from '../audio/AudioEngine';
import type { Appear } from './Appear';
import type { CoinSystem } from './Coins';
import { buyOffer, changeRole, penguinName, rerollOffers, updateMarket, upgradeHut } from './PenguinLogic';
import type { Workers } from './Workers';

const PAD = IceShore.market.pad;

/**
 * Penguin Market (GDD §24): the stall next to the hut. Standing still on its pad opens the market panel (contextual,
 * through the panel manager); walking off closes it. Buying, the free refresh, role changes and hut upgrades happen
 * here; the rules live in PenguinLogic.
 */
export class Market {
  private built = false;
  private stand = 0;
  /** Closed by the player while still on the pad: it stays shut until they step off. */
  private dismissed = false;
  private readonly target = new THREE.Vector3(IceShore.market.x, 1, IceShore.market.z);
  private readonly hutTarget = new THREE.Vector3(IceShore.hut.x, 1.4, IceShore.hut.z);

  constructor(
    private readonly state: GameState,
    private readonly player: Player,
    private readonly world: WorldMap,
    private readonly coins: CoinSystem,
    private readonly fx: Effects,
    private readonly banner: Banner,
    private readonly appear: Appear,
    private readonly workers: Workers,
    private readonly panel: MarketPanel,
  ) {
    panel.onClosed = (reason) => {
      this.dismissed = reason !== 'left';
    };
    panel.actions = {
      buy: (id) => this.buy(id),
      reroll: () => this.reroll(),
      role: (penguin, role) => this.setRole(penguin, role),
      hut: () => this.upgradeHut(),
    };
    if (state.unlocked.includes('market')) this.build(false);
  }

  get isBuilt(): boolean {
    return this.built;
  }

  get playerOnPad(): boolean {
    const p = this.player.state;
    return this.built && Math.hypot(p.x - PAD.x, p.z - PAD.z) <= PAD.radius;
  }

  build(animate: boolean): void {
    if (this.built) return;
    this.built = true;
    this.world.buildMarket(animate ? this.appear : null);
  }

  update(dt: number): void {
    // The catalog keeps its day and refresh timer even before the stall exists (it fills once the stall is built).
    if (!this.built) return;
    updateMarket(this.state, dt, Math.random);
    const still = this.player.state.speed01 < FishingFeel.stillSpeed;
    if (this.playerOnPad) {
      if (still) this.stand += dt;
      if (this.stand >= MarketFeel.openDelay && !this.dismissed) this.panel.open(this.state, () => this.playerOnPad);
    } else {
      this.stand = 0;
      this.dismissed = false;
    }
    if (this.panel.opened) this.panel.refresh(this.state);
  }

  private buy(offerId: number): void {
    const r = buyOffer(this.state, offerId);
    if (!r.ok) {
      this.panel.deny(offerId);
      sfx('deny');
      return;
    }
    for (let i = 0; i < 6; i++) this.coins.spendTo(this.target);
    this.workers.add(r.penguin, true);
    vibrate(HapticsSettings.upgrade);
    sfx('buy');
    this.banner.show(tf('penguinJoined', { name: penguinName(r.penguin, getLang()), role: RoleById[r.penguin.role].name[getLang()] }), 'good');
    this.panel.refresh(this.state, true);
  }

  private reroll(): void {
    if (!rerollOffers(this.state, Math.random)) {
      sfx('deny');
      return;
    }
    sfx('tap');
    this.panel.refresh(this.state, true);
  }

  private setRole(penguinId: number, role: RoleId): void {
    const w = this.state.workers.find((p) => p.id === penguinId);
    if (!w || !changeRole(this.state, w, role)) {
      sfx('deny');
      return;
    }
    this.workers.roleChanged(w);
    sfx('buy');
    this.banner.show(tf('roleChanged', { name: penguinName(w, getLang()), role: RoleById[role].name[getLang()] }), 'good');
    this.panel.refresh(this.state, true);
  }

  private upgradeHut(): void {
    if (!upgradeHut(this.state)) {
      this.panel.denyHut();
      sfx('deny');
      return;
    }
    for (let i = 0; i < 6; i++) this.coins.spendTo(this.hutTarget);
    this.world.buildHut(this.appear, this.state.hutLevel);
    this.fx.sparkle(IceShore.hut.x, 2.0, IceShore.hut.z);
    vibrate(HapticsSettings.unlock);
    sfx('unlock');
    this.banner.show(tf('hutUpgraded', { n: this.state.hutLevel }), 'good');
    this.panel.refresh(this.state, true);
  }
}
