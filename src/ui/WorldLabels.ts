import * as THREE from 'three';

export interface WorldLabel {
  el: HTMLDivElement;
  /** World anchor; mutate it each frame to follow things. */
  anchor: THREE.Vector3;
  /** Extra screen offset in px (applied after projection). */
  offsetX: number;
  offsetY: number;
  visible: boolean;
  /** Keep the label inside the screen horizontally. */
  clampX: boolean;
}

/** HTML labels pinned to 3D positions (stack count, "!", fish card, prices...). */
export class WorldLabels {
  private readonly root: HTMLDivElement;
  private readonly labels: WorldLabel[] = [];
  private readonly v = new THREE.Vector3();

  constructor(overlay: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'world-labels';
    overlay.appendChild(this.root);
  }

  create(className: string, html = ''): WorldLabel {
    const el = document.createElement('div');
    el.className = `world-label ${className}`;
    el.innerHTML = html;
    el.style.display = 'none';
    this.root.appendChild(el);
    const label: WorldLabel = { el, anchor: new THREE.Vector3(), offsetX: 0, offsetY: 0, visible: false, clampX: false };
    this.labels.push(label);
    return label;
  }

  show(label: WorldLabel, on: boolean): void {
    if (label.visible === on) return;
    label.visible = on;
    label.el.style.display = on ? '' : 'none';
  }

  /** Re-triggers the CSS pop-in animation. */
  pop(label: WorldLabel): void {
    this.show(label, true);
    label.el.classList.remove('pop');
    void label.el.offsetWidth;
    label.el.classList.add('pop');
  }

  update(camera: THREE.Camera, width: number, height: number): void {
    for (const l of this.labels) {
      if (!l.visible) continue;
      this.v.copy(l.anchor).project(camera);
      if (this.v.z > 1) {
        l.el.style.transform = 'translate(-9999px, 0)';
        continue;
      }
      let x = (this.v.x * 0.5 + 0.5) * width + l.offsetX;
      const y = (-this.v.y * 0.5 + 0.5) * height + l.offsetY;
      if (l.clampX) {
        const half = l.el.offsetWidth / 2 + 8;
        x = Math.min(Math.max(x, half), width - half);
      }
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
}
