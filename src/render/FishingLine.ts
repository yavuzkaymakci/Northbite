import * as THREE from 'three';
import { Palette } from './Palette';

const POINTS = 20;

/** Fishing line as a sagging quadratic curve between the rod tip and the float. */
export class FishingLine {
  readonly line: THREE.Line;
  private readonly positions: Float32Array;
  private readonly attr: THREE.BufferAttribute;
  private readonly ctrl = new THREE.Vector3();

  constructor() {
    this.positions = new Float32Array(POINTS * 3);
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.positions, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: Palette.fishingLine }));
    this.line.frustumCulled = false;
    this.line.visible = false;
  }

  /**
   * @param sag how far the middle droops (world units)
   * @param tremble amplitude of a fast side-to-side shake (tension feedback)
   */
  set(from: THREE.Vector3, to: THREE.Vector3, sag: number, tremble = 0, time = 0): void {
    this.ctrl.copy(from).add(to).multiplyScalar(0.5);
    this.ctrl.y -= sag;
    if (tremble > 0) {
      this.ctrl.x += Math.sin(time * 71) * tremble;
      this.ctrl.z += Math.cos(time * 57) * tremble;
    }
    const p = this.positions;
    for (let i = 0; i < POINTS; i++) {
      const t = i / (POINTS - 1);
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      p[i * 3] = a * from.x + b * this.ctrl.x + c * to.x;
      p[i * 3 + 1] = a * from.y + b * this.ctrl.y + c * to.y;
      p[i * 3 + 2] = a * from.z + b * this.ctrl.z + c * to.z;
    }
    this.attr.needsUpdate = true;
    this.line.visible = true;
  }

  hide(): void {
    this.line.visible = false;
  }
}
