import * as THREE from 'three';
import { createFlatRingGeometry } from '../models/createFishingProps';
import { Palette } from './Palette';

interface Ripple {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  size: number;
}

interface Drop {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  floor: number;
}

const MAX_DROPS = 90;

/** Water ripples (pooled flat rings) and splash droplets (one InstancedMesh). */
export class Effects {
  readonly group = new THREE.Group();
  private readonly ripples: Ripple[] = [];
  private readonly drops: Drop[] = [];
  private readonly dropMesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();

  constructor() {
    const ringGeo = createFlatRingGeometry(1, 0.86, 28);
    for (let i = 0; i < 8; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: Palette.snow,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ringGeo, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.ripples.push({ mesh, material, age: 0, life: 0, size: 1 });
    }
    this.dropMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.045, 0),
      new THREE.MeshBasicMaterial({ color: Palette.ice }),
      MAX_DROPS,
    );
    this.dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dropMesh.frustumCulled = false;
    this.dropMesh.count = 0;
    this.group.add(this.dropMesh);
  }

  ripple(x: number, y: number, z: number, size = 0.7, life = 0.9): void {
    const r = this.ripples.find((p) => !p.mesh.visible) ?? this.ripples.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    r.mesh.position.set(x, y, z);
    r.age = 0;
    r.life = life;
    r.size = size;
    r.mesh.visible = true;
  }

  splash(x: number, y: number, z: number, count = 8, speed = 1.6): void {
    for (let i = 0; i < count && this.drops.length < MAX_DROPS; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = speed * (0.4 + Math.random() * 0.6);
      this.drops.push({
        x,
        y,
        z,
        vx: Math.cos(a) * h * 0.6,
        vy: speed * (0.8 + Math.random() * 0.8),
        vz: Math.sin(a) * h * 0.6,
        age: 0,
        life: 0.9,
        floor: y - 0.05,
      });
    }
  }

  update(dt: number): void {
    for (const r of this.ripples) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const s = r.size * (0.25 + 0.75 * Math.sqrt(t));
      r.mesh.scale.set(s, 1, s);
      r.material.opacity = 0.8 * (1 - t);
    }

    let n = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i] as Drop;
      d.age += dt;
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      if (d.age >= d.life || d.y < d.floor) {
        this.drops.splice(i, 1);
        continue;
      }
      const s = 1 - d.age / d.life;
      this.m.makeScale(s, s, s).setPosition(d.x, d.y, d.z);
      this.dropMesh.setMatrixAt(n++, this.m);
    }
    this.dropMesh.count = n;
    this.dropMesh.instanceMatrix.needsUpdate = true;
  }
}
