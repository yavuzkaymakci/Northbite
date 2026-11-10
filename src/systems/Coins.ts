import * as THREE from 'three';
import { CampLayout, CaveLayout, HarborLayout, IceShore, type Vec2 } from '../content/zones';
import { CoinFeel, CustomerFeel } from '../settings';
import type { GameState } from '../core/GameState';
import type { Player } from '../entities/Player';
import type { CoinRenderer } from '../render/CoinRenderer';
import { COIN_THICKNESS } from '../models/createMarkers';
import { FlightList } from './Flights';
import { audio, sfx } from '../audio/AudioEngine';

const COLUMN_OFFSETS = [
  [-0.17, -0.17],
  [0.17, -0.17],
  [-0.17, 0.17],
  [0.17, 0.17],
] as const;

/** Coin piles: next to the counter, at the camp entrance, outside the Ice Cave (GDD §15). */
export type PileId = 'counter' | 'camp' | 'cave' | 'harbor';

/** One coin pile: its value lives in the game state, the flights and the mint tip coins on top are visual. */
class Pile {
  readonly toPile = new FlightList<number>();
  /** Peace tips flying to the pile (drawn mint). */
  readonly tipsToPile = new FlightList<number>();
  /** Tip coins sitting on top of the pile (drawn mint until picked up). */
  tipsOnPile = 0;

  constructor(
    readonly at: Vec2,
    readonly get: () => number,
    readonly set: (v: number) => void,
  ) {}

  /** Coins on the pile that have landed (value still flying in is not drawn yet). */
  get visual(): number {
    return Math.max(this.get() - this.pending, 0);
  }

  get pending(): number {
    let v = 0;
    for (const f of this.toPile.items) v += f.payload;
    for (const f of this.tipsToPile.items) v += f.payload;
    return v;
  }

  top(out: THREE.Vector3, index: number): THREE.Vector3 {
    const col = COLUMN_OFFSETS[index % 4] as readonly [number, number];
    const level = Math.floor(index / 4);
    return out.set(this.at.x + col[0], COIN_THICKNESS / 2 + level * COIN_THICKNESS, this.at.z + col[1]);
  }
}

/**
 * Coin piles, pickup by walking over them, and coin flights (GDD §2 step 5).
 * State values change immediately; flights are visual. The HUD shows `walletDisplay` so it counts up on arrival.
 */
export class CoinSystem {
  private readonly piles: Record<PileId, Pile>;
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
  ) {
    const s = state;
    this.piles = {
      counter: new Pile(IceShore.counter.coinPile, () => s.pile, (v) => (s.pile = v)),
      camp: new Pile(CampLayout.pile, () => s.camp.pile, (v) => (s.camp.pile = v)),
      cave: new Pile(CaveLayout.pile, () => s.cave.pile, (v) => (s.cave.pile = v)),
      harbor: new Pile(HarborLayout.pile, () => s.harbor.pile, (v) => (s.harbor.pile = v)),
    };
  }

  get walletDisplay(): number {
    return this.state.coins - this.incoming;
  }

  /** A customer pays: value (and the peace tip) goes on the counter pile now, coins hop over visually. */
  payFrom(from: THREE.Vector3, value: number, tip = 0): void {
    const pile = this.piles.counter;
    pile.set(pile.get() + value + tip);
    this.showPayment(from, value, tip, 'counter');
  }

  /**
   * Coin flights for a payment that is already in a pile's value (the lands' logic adds it itself).
   * Tips fly after the payment and stay mint on top of the pile.
   */
  showPayment(from: THREE.Vector3, value: number, tip: number, id: PileId): void {
    const pile = this.piles[id];
    // The value is already in the pile but its flights are not registered yet: they land on top of what is there.
    const base = Math.max(pile.visual - value - tip, 0);
    if (tip > 0) {
      const n = Math.min(tip, 4);
      const each = Math.floor(tip / n);
      for (let i = 0; i < n; i++) {
        const share = i === n - 1 ? tip - each * (n - 1) : each;
        const slot = Math.min(base + value + i, CoinFeel.pileVisualMax - 1);
        const f = pile.tipsToPile.add(from, pile.top(this.to, slot), CoinFeel.flightTime * 1.3, CoinFeel.arcHeight * 1.5, share);
        f.t = -0.25 - i * 0.1; // lands after the payment
      }
    }
    if (value <= 0) return;
    const n = Math.min(CustomerFeel.maxCoinsVisual, value);
    let left = value;
    for (let i = 0; i < n; i++) {
      const share = i === n - 1 ? left : Math.floor(value / n);
      left -= share;
      pile.top(this.to, Math.min(base + i * share, CoinFeel.pileVisualMax - 1));
      const f = pile.toPile.add(from, this.to, CoinFeel.flightTime + i * 0.04, CoinFeel.arcHeight, share);
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
    sfx('coinSpend');
    this.chest(this.from);
    this.toTarget.add(this.from, target, CoinFeel.flightTime, CoinFeel.arcHeight * 0.7, 0);
  }

  update(dt: number): void {
    const p = this.player.state;
    this.pickupTimer -= dt;
    for (const pile of Object.values(this.piles)) {
      const onPile = Math.hypot(p.x - pile.at.x, p.z - pile.at.z) <= CoinFeel.pickupRadius;
      const available = pile.get() - pile.pending;
      if (onPile && available > 0 && this.pickupTimer <= 0) {
        this.pickupTimer = CoinFeel.pickupInterval;
        const chunk = Math.min(available, Math.max(1, Math.ceil(available / 15)));
        const tipChunk = pile.tipsOnPile > 0;
        pile.tipsOnPile = Math.max(pile.tipsOnPile - chunk, 0);
        pile.set(pile.get() - chunk);
        this.state.coins += chunk;
        this.incoming += chunk;
        pile.top(this.from, pile.visual);
        this.chest(this.to);
        this.toPlayer.add(this.from, this.to, CoinFeel.flightTime, CoinFeel.arcHeight, chunk).tip = tipChunk;
      }
      pile.toPile.update(dt, () => {});
      pile.tipsToPile.update(dt, (f) => (pile.tipsOnPile += f.payload));
      pile.tipsOnPile = Math.min(pile.tipsOnPile, pile.visual);
    }

    // Chase the moving player.
    for (const f of this.toPlayer.items) this.chest(f.to);
    this.toPlayer.update(dt, (f) => {
      this.incoming -= f.payload;
      // Coins landing on the player ring higher and higher in a row.
      audio.play('coin', { chain: true });
    });
    this.toTarget.update(dt, () => {});
  }

  render(coins: CoinRenderer, time: number): void {
    for (const pile of Object.values(this.piles)) {
      const n = Math.min(pile.visual, CoinFeel.pileVisualMax);
      const tipsFrom = n - Math.min(pile.tipsOnPile, n);
      for (let i = 0; i < n; i++) {
        pile.top(this.to, i);
        // Tips sit on top and twinkle a little.
        const tip = i >= tipsFrom;
        coins.add(this.to.x, this.to.y, this.to.z, 0, i * 0.7 + (tip ? time * 2 : 0), tip ? 1.12 : 1, tip);
      }
      for (const list of [pile.toPile, pile.tipsToPile]) {
        for (const f of list.items) {
          if (f.t < 0) continue;
          coins.add(f.pos.x, f.pos.y, f.pos.z, Math.PI / 2, time * 12 + f.t * 6, 1, list === pile.tipsToPile);
        }
      }
    }
    for (const list of [this.toPlayer, this.toTarget]) {
      for (const f of list.items) {
        if (f.t < 0) continue;
        coins.add(f.pos.x, f.pos.y, f.pos.z, Math.PI / 2, time * 12 + f.t * 6, 1, f.tip === true);
      }
    }
  }

  private chest(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.player.state.x, 1.1, this.player.state.z);
  }
}
