import * as THREE from 'three';
import { IceShore } from '../content/zones';
import { CoinFeel, CustomerFeel } from '../settings';
import type { GameState } from '../core/GameState';
import type { Player } from '../entities/Player';
import type { CoinRenderer } from '../render/CoinRenderer';
import { COIN_THICKNESS } from '../models/createMarkers';
import { FlightList } from './Flights';

const PILE = IceShore.counter.coinPile;
const COLUMN_OFFSETS = [
  [-0.17, -0.17],
  [0.17, -0.17],
  [-0.17, 0.17],
  [0.17, 0.17],
] as const;

/**
 * Coin pile next to the counter, pickup by walking over it, and coin flights (GDD §2 step 5).
 * State values change immediately; flights are visual. The HUD shows `walletDisplay` so it counts up on arrival.
 */
export class CoinSystem {
  private readonly toPile = new FlightList<number>();
  /** Peace tips flying to the pile (drawn mint). */
  private readonly tipsToPile = new FlightList<number>();
  /** Tip coins sitting on top of the pile (drawn mint until picked up). */
  private tipsOnPile = 0;
  private readonly toPlayer = new FlightList<number>();
  private readonly toTarget = new FlightList<number>();
  private pickupTimer = 0;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  /** Coins already in state.coins but still flying toward the player. */
  private incoming = 0;

  constructor(
    private readonly state: GameState,
    private readonly player: Player,
  ) {}

  get walletDisplay(): number {
    return this.state.coins - this.incoming;
  }

  /** A customer pays: value (and the peace tip) goes on the pile now, coins hop over visually. */
  payFrom(from: THREE.Vector3, value: number, tip = 0): void {
    if (tip > 0) {
      this.state.pile += tip;
      const n = Math.min(tip, 4);
      const each = Math.floor(tip / n);
      for (let i = 0; i < n; i++) {
        const share = i === n - 1 ? tip - each * (n - 1) : each;
        const slot = Math.min(this.pileVisual + value + i, CoinFeel.pileVisualMax - 1);
        const f = this.tipsToPile.add(from, this.pileTop(this.to, slot), CoinFeel.flightTime * 1.3, CoinFeel.arcHeight * 1.5, share);
        f.t = -0.25 - i * 0.1; // lands after the payment
      }
    }
    if (value <= 0) return;
    const base = this.pileVisual + this.pendingToPile;
    this.state.pile += value;
    const n = Math.min(CustomerFeel.maxCoinsVisual, value);
    let left = value;
    for (let i = 0; i < n; i++) {
      const share = i === n - 1 ? left : Math.floor(value / n);
      left -= share;
      this.pileTop(this.to, Math.min(base + i * share, CoinFeel.pileVisualMax - 1));
      const f = this.toPile.add(from, this.to, CoinFeel.flightTime + i * 0.04, CoinFeel.arcHeight, share);
      f.t = -i * 0.12; // stagger
    }
  }

  /** A reward (scared bear, chest): the value is the player's now, coins hop over from `from` to them. */
  rewardFrom(from: THREE.Vector3, value: number): void {
    if (value <= 0) return;
    this.state.coins += value;
    this.state.today.coins += value;
    this.incoming += value;
    const n = Math.min(CustomerFeel.maxCoinsVisual, value);
    let left = value;
    for (let i = 0; i < n; i++) {
      const share = i === n - 1 ? left : Math.floor(value / n);
      left -= share;
      const f = this.toPlayer.add(from, this.chest(this.to), CoinFeel.flightTime * 1.6, CoinFeel.arcHeight * 1.4, share);
      f.t = -i * 0.08;
    }
  }

  /** Visual coins flying from the player to a point (unlock payments). */
  spendTo(target: THREE.Vector3): void {
    this.chest(this.from);
    this.toTarget.add(this.from, target, CoinFeel.flightTime, CoinFeel.arcHeight * 0.7, 0);
  }

  update(dt: number): void {
    const p = this.player.state;
    this.pickupTimer -= dt;
    const onPile = Math.hypot(p.x - PILE.x, p.z - PILE.z) <= CoinFeel.pickupRadius;
    const available = this.state.pile - this.pendingToPile;
    if (onPile && available > 0 && this.pickupTimer <= 0) {
      this.pickupTimer = CoinFeel.pickupInterval;
      const chunk = Math.min(available, Math.max(1, Math.ceil(available / 15)));
      const tipChunk = this.tipsOnPile > 0;
      this.tipsOnPile = Math.max(this.tipsOnPile - chunk, 0);
      this.state.pile -= chunk;
      this.state.coins += chunk;
      this.incoming += chunk;
      this.pileTop(this.from, this.pileVisual);
      this.chest(this.to);
      this.toPlayer.add(this.from, this.to, CoinFeel.flightTime, CoinFeel.arcHeight, chunk).tip = tipChunk;
    }

    // Chase the moving player.
    for (const f of this.toPlayer.items) this.chest(f.to);
    this.toPile.update(dt, () => {});
    this.tipsToPile.update(dt, (f) => (this.tipsOnPile += f.payload));
    this.tipsOnPile = Math.min(this.tipsOnPile, this.pileVisual);
    this.toPlayer.update(dt, (f) => (this.incoming -= f.payload));
    this.toTarget.update(dt, () => {});
  }

  render(coins: CoinRenderer, time: number): void {
    const n = Math.min(this.pileVisual, CoinFeel.pileVisualMax);
    const tipsFrom = n - Math.min(this.tipsOnPile, n);
    for (let i = 0; i < n; i++) {
      this.pileTop(this.to, i);
      // Tips sit on top and twinkle a little.
      const tip = i >= tipsFrom;
      coins.add(this.to.x, this.to.y, this.to.z, 0, i * 0.7 + (tip ? time * 2 : 0), tip ? 1.12 : 1, tip);
    }
    for (const list of [this.toPile, this.toPlayer, this.toTarget, this.tipsToPile]) {
      for (const f of list.items) {
        if (f.t < 0) continue;
        coins.add(f.pos.x, f.pos.y, f.pos.z, Math.PI / 2, time * 12 + f.t * 6, 1, list === this.tipsToPile || f.tip === true);
      }
    }
  }

  /** Coins on the pile that have landed (value still flying in is not drawn yet). */
  private get pileVisual(): number {
    return Math.max(this.state.pile - this.pendingToPile, 0);
  }

  private get pendingToPile(): number {
    let v = 0;
    for (const f of this.toPile.items) v += f.payload;
    for (const f of this.tipsToPile.items) v += f.payload;
    return v;
  }

  private pileTop(out: THREE.Vector3, index: number): THREE.Vector3 {
    const col = COLUMN_OFFSETS[index % 4] as readonly [number, number];
    const level = Math.floor(index / 4);
    return out.set(PILE.x + col[0], COIN_THICKNESS / 2 + level * COIN_THICKNESS, PILE.z + col[1]);
  }

  private chest(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.player.state.x, 1.1, this.player.state.z);
  }
}
