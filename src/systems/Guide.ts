import * as THREE from 'three';
import { UpgradeList } from '../content/upgrades';
import { IceShore } from '../content/zones';
import { GuideFeel } from '../settings';
import type { GameState } from '../core/GameState';
import { createGuideArrow } from '../models/createMarkers';
import type { CarryStack } from './CarryStack';
import type { FishingHole } from './Fishing';
import type { RodBench } from './RodBench';
import type { UnlockSpot, Unlocks } from './Unlocks';
import { upgradeCost } from './Upgrades';

const C = IceShore.counter;

/**
 * Bouncing arrow that points at the next useful thing, so the loop is learnable without text.
 * Unlock goals: the cheapest frame the player can pay right now; if none, the cheapest frame overall.
 */
export class Guide {
  readonly arrow: THREE.Group;

  constructor(
    scene: THREE.Scene,
    private readonly state: GameState,
    private readonly stack: CarryStack,
    private readonly holes: () => readonly FishingHole[],
    private readonly fishingActive: () => boolean,
    private readonly unlocks: Unlocks,
    private readonly bench: RodBench,
    private readonly paused: () => boolean,
  ) {
    this.arrow = createGuideArrow();
    this.arrow.visible = false;
    scene.add(this.arrow);
  }

  update(time: number): void {
    const target = this.paused() ? null : this.pickTarget();
    this.arrow.visible = !!target;
    if (!target) return;
    this.arrow.position.set(target.x, GuideFeel.arrowHeight + Math.abs(Math.sin(time * 3.2)) * GuideFeel.bobAmplitude, target.z);
    this.arrow.rotation.y = time * 1.5;
  }

  private pickTarget(): { x: number; z: number } | null {
    const s = this.state;
    if (this.stack.isFull) return C.dropPoint;
    if (this.fishingActive()) return null;

    // Threat buildings are optional extras: the arrow never sends the player to them.
    const spots = [...this.unlocks.visible].filter((sp) => !sp.zone?.optional).sort((a, b) => this.unlocks.remaining(a) - this.unlocks.remaining(b));
    const cheapest: UnlockSpot | undefined = spots[0];
    const affordable = spots.find((sp) => this.unlocks.remaining(sp) <= s.coins);
    if (affordable) return affordable;
    if (cheapest && s.pile > 0 && s.coins + s.pile >= this.unlocks.remaining(cheapest)) return C.coinPile;

    // First minute: walk the player through fish → counter → coins once.
    const firstSaleDone = s.stats.sold > 0 || s.coins > 0 || s.pile > 0;
    if (!firstSaleDone) {
      if (s.carried.length > 0) return C.dropPoint;
      if (s.counter.length === 0) return this.holes()[0] ?? null;
      return null;
    }
    if (s.pile > 0 && s.coins === 0) return C.coinPile;

    // Point at the rod bench until the first upgrade is bought (after a couple of unlocks, so it never delays them).
    const anyBought = UpgradeList.some((u) => s.upgrades[u.id] > 1) || s.unlocked.length < 2;
    const canBuy = UpgradeList.some((u) => {
      const cost = upgradeCost(u.id, s.upgrades[u.id]);
      return cost !== null && cost <= s.coins;
    });
    if (!anyBought && canBuy && !this.bench.playerOnPad) return IceShore.bench.pad;

    return cheapest ?? null;
  }
}
