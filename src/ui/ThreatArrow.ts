import * as THREE from 'three';
import { ThreatFeel } from '../settings';

/**
 * Red arrow on the screen edge pointing at an off-screen threat (GDD §13). Hidden while the point is on screen.
 */
export class ThreatArrow {
  private readonly el: HTMLDivElement;
  private readonly v = new THREE.Vector3();
  private shown = false;

  constructor(overlay: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'threat-arrow';
    this.el.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><path fill="currentColor" d="M38 20 8 36l7-16L8 4z"/></svg>';
    overlay.appendChild(this.el);
  }

  update(camera: THREE.Camera, width: number, height: number, target: THREE.Vector3 | null): void {
    let show = false;
    if (target) {
      this.v.copy(target).project(camera);
      // Behind the camera: mirror so the arrow still points the right way.
      if (this.v.z > 1) this.v.multiplyScalar(-1);
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      const margin = ThreatFeel.arrowMargin;
      const onScreen = x > margin && x < width - margin && y > margin * 2 && y < height - margin;
      if (!onScreen) {
        show = true;
        const cx = width / 2;
        const cy = height / 2;
        const dx = x - cx;
        const dy = y - cy;
        const sx = (cx - margin) / Math.max(Math.abs(dx), 1e-6);
        const sy = (cy - margin * 1.6) / Math.max(Math.abs(dy), 1e-6);
        const s = Math.min(sx, sy);
        const ax = cx + dx * s;
        const ay = cy + dy * s;
        const angle = Math.atan2(dy, dx);
        this.el.style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px) translate(-50%, -50%) rotate(${angle.toFixed(3)}rad)`;
      }
    }
    if (show !== this.shown) {
      this.shown = show;
      this.el.classList.toggle('show', show);
    }
  }
}
