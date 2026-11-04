import * as THREE from 'three';

/** Point on a parabolic hop from `from` to `to`, peaking `height` above the straight line. */
export function arcPoint(out: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3, t: number, height: number): THREE.Vector3 {
  out.lerpVectors(from, to, t);
  out.y += 4 * height * t * (1 - t);
  return out;
}

export interface Flight<T> {
  from: THREE.Vector3;
  /** Owners may update `to` every frame to chase a moving target. */
  to: THREE.Vector3;
  t: number;
  duration: number;
  height: number;
  payload: T;
  /** Current position (filled by update). */
  pos: THREE.Vector3;
}

/** A list of arcing flights (fish to counter, coins to player...). Visual only; game state changes elsewhere. */
export class FlightList<T> {
  readonly items: Flight<T>[] = [];

  add(from: THREE.Vector3, to: THREE.Vector3, duration: number, height: number, payload: T): Flight<T> {
    const f: Flight<T> = { from: from.clone(), to: to.clone(), t: 0, duration, height, payload, pos: from.clone() };
    this.items.push(f);
    return f;
  }

  update(dt: number, onArrive: (f: Flight<T>) => void): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i] as Flight<T>;
      f.t = Math.min(f.t + dt / f.duration, 1);
      arcPoint(f.pos, f.from, f.to, f.t, f.height);
      if (f.t >= 1) {
        this.items.splice(i, 1);
        onArrive(f);
      }
    }
  }
}
