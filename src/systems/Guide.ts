import * as THREE from 'three';
import { IceShore } from '../content/zones';
import { GuideFeel } from '../settings';
import type { GameState } from '../core/GameState';
import { createGuideArrow } from '../models/createMarkers';
import type { CarryStack } from './CarryStack';
import type { FishingHole } from './Fishing';

const C = IceShore.counter;

/**
 * Bouncing arrow that points at the next useful thing, so the loop is learnable without text
 * (Demo 1 acceptance: first sale within a minute without reading anything).
 */
export class Guide {
  private readonly arrow: THREE.Group;

  constructor(
    scene: THREE.Scene,
    private readonly state: GameState,
    private readonly stack: CarryStack,
    private readonly holes: () => readonly FishingHole[],
    private readonly fishingActive: () => boolean,
    private readonly affordableUnlock: () => { x: number; z: number } | null,
  ) {
    this.arrow = createGuideArrow();
    this.arrow.visible = false;
    scene.add(this.arrow);
  }

  update(time: number): void {
    const target = this.pickTarget();
    this.arrow.visible = !!target;
    if (!target) return;
    this.arrow.position.set(target.x, GuideFeel.arrowHeight + Math.abs(Math.sin(time * 3.2)) * GuideFeel.bobAmplitude, target.z);
    this.arrow.rotation.y = time * 1.5;
  }

  private pickTarget(): { x: number; z: number } | null {
    const s = this.state;
    const firstSaleDone = s.stats.sold > 0 || s.coins > 0 || s.pile > 0;
    if (this.stack.isFull) return C.dropPoint;
    if (this.fishingActive()) return null;
    if (s.pile > 0) return C.coinPile;
    const unlock = this.affordableUnlock();
    if (unlock) return unlock;
    if (!firstSaleDone) {
      if (s.carried.length > 0) return C.dropPoint;
      if (s.counter.length === 0) return this.holes()[0] ?? null;
    }
    return null;
  }
}
