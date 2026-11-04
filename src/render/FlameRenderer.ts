import * as THREE from 'three';
import { createFlameGeometry } from '../models/createThreatProps';
import { Palette } from './Palette';

const MAX_FLAMES = 24;

/**
 * Every flame (fire pits, torch stand, the hand torch) in one InstancedMesh, rebuilt each frame.
 * Unlit material so fires read as glowing at night. Each flame is an outer orange cone plus a yellow core.
 */
export class FlameRenderer {
  readonly mesh: THREE.InstancedMesh;
  private count = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly outer = new THREE.Color(Palette.flame);
  private readonly core = new THREE.Color(Palette.flameCore);

  constructor() {
    this.mesh = new THREE.InstancedMesh(
      createFlameGeometry(),
      new THREE.MeshBasicMaterial({ color: Palette.white, transparent: true, opacity: 0.92, depthWrite: false }),
      MAX_FLAMES,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, this.outer);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  begin(): void {
    this.count = 0;
  }

  /** A flickering flame with its base at (x, y, z). `seed` desyncs neighbours. */
  add(x: number, y: number, z: number, size: number, time: number, seed: number): void {
    if (this.count + 2 > MAX_FLAMES) return;
    const f = 1 + Math.sin(time * 13 + seed) * 0.12 + Math.sin(time * 29 + seed * 3) * 0.08;
    this.put(x, y, z, size, size * f, Math.sin(time * 7 + seed) * 0.12, this.outer);
    this.put(x, y, z, size * 0.55, size * 0.7 * f, Math.sin(time * 9 + seed) * 0.1, this.core);
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private put(x: number, y: number, z: number, w: number, h: number, sway: number, color: THREE.Color): void {
    this.q.setFromEuler(this.e.set(sway, 0, sway * 0.6));
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(w, h, w));
    this.mesh.setMatrixAt(this.count, this.m);
    this.mesh.setColorAt(this.count, color);
    this.count++;
  }
}
