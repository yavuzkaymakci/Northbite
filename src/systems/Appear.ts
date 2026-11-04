import type * as THREE from 'three';
import { UnlockFeel } from '../settings';
import { easeOutBack } from '../core/Ease';

interface Entry {
  obj: THREE.Object3D;
  t: number;
  delay: number;
  flat: boolean;
}

/** Plays the unlock bounce (GDD §9): objects pop from tiny to full size with an overshoot. */
export class Appear {
  private readonly list: Entry[] = [];

  /** `flat` keeps Y at full scale (ground frames and rings). */
  add(obj: THREE.Object3D, delay = 0, flat = false): void {
    obj.scale.set(0.001, flat ? 1 : 0.001, 0.001);
    this.list.push({ obj, t: 0, delay, flat });
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i] as Entry;
      if (e.delay > 0) {
        e.delay -= dt;
        continue;
      }
      e.t = Math.min(e.t + dt / UnlockFeel.bounceTime, 1);
      const s = Math.max(easeOutBack(e.t), 0.001);
      e.obj.scale.set(s, e.flat ? 1 : s, s);
      if (e.t >= 1) this.list.splice(i, 1);
    }
  }
}
