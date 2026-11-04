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

interface Puff {
  x: number;
  y: number;
  z: number;
  rise: number;
  drift: number;
  size: number;
  age: number;
  life: number;
  color: THREE.Color;
}

const MAX_DROPS = 220;
const MAX_PUFFS = 48;

/** Water ripples (pooled flat rings), splash droplets and smoke/steam puffs (one InstancedMesh each). */
export class Effects {
  readonly group = new THREE.Group();
  private readonly ripples: Ripple[] = [];
  private readonly drops: Drop[] = [];
  private readonly puffs: Puff[] = [];
  private readonly dropMesh: THREE.InstancedMesh;
  private readonly puffMesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly smokeColor = new THREE.Color(Palette.smoke);
  private readonly steamColor = new THREE.Color(Palette.steam);

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

    this.puffMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: Palette.white, flatShading: true, roughness: 1, transparent: true, opacity: 0.72, depthWrite: false }),
      MAX_PUFFS,
    );
    this.puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.puffMesh.setColorAt(0, this.smokeColor);
    this.puffMesh.frustumCulled = false;
    this.puffMesh.count = 0;
    this.group.add(this.puffMesh);
  }

  /** Chimney smoke: a grey ball that rises, grows and drifts. */
  smoke(x: number, y: number, z: number, size = 0.32): void {
    this.addPuff(x, y, z, size, 0.9, 1.9, this.smokeColor);
  }

  /** Faint steam wisp over smoked fish. */
  steam(x: number, y: number, z: number): void {
    this.addPuff(x, y, z, 0.08, 0.35, 1.1, this.steamColor);
  }

  private addPuff(x: number, y: number, z: number, size: number, rise: number, life: number, color: THREE.Color): void {
    if (this.puffs.length >= MAX_PUFFS) this.puffs.shift();
    this.puffs.push({ x, y, z, rise, drift: 0.25 + Math.random() * 0.25, size, age: 0, life, color });
  }

  ripple(x: number, y: number, z: number, size = 0.7, life = 0.9): void {
    const r = this.ripples.find((p) => !p.mesh.visible) ?? this.ripples.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    r.mesh.position.set(x, y, z);
    r.age = 0;
    r.life = life;
    r.size = size;
    r.mesh.visible = true;
  }

  /** Droplets/snow bits thrown up from a point. They vanish below `floor` (default: just under the start). */
  splash(x: number, y: number, z: number, count = 8, speed = 1.6, floor = y - 0.05): void {
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
        life: floor < y - 0.1 ? 1.4 : 0.9,
        floor,
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

    let p = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const f = this.puffs[i] as Puff;
      f.age += dt;
      if (f.age >= f.life) {
        this.puffs.splice(i, 1);
        continue;
      }
      const t = f.age / f.life;
      // Grow quickly, then shrink away (instanced puffs cannot fade individually).
      const s = f.size * (0.5 + 1.4 * Math.sqrt(t)) * (t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
      this.m.makeScale(s, s * 0.85, s).setPosition(f.x + f.drift * t, f.y + f.rise * f.age, f.z - f.drift * 0.4 * t);
      this.puffMesh.setMatrixAt(p, this.m);
      this.puffMesh.setColorAt(p, f.color);
      p++;
    }
    this.puffMesh.count = p;
    this.puffMesh.instanceMatrix.needsUpdate = true;
    if (this.puffMesh.instanceColor) this.puffMesh.instanceColor.needsUpdate = true;
  }
}
