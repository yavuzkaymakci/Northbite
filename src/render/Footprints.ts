import * as THREE from 'three';
import { IceShore } from '../content/zones';
import { ThreatFeel } from '../settings';
import { Palette } from './Palette';

interface Print {
  x: number;
  z: number;
  rot: number;
  age: number;
}

const MAX_PRINTS = 140;
const G = IceShore.ground;

/** Paw prints on the snow (one InstancedMesh). They shrink away at the end of their life. */
export class Footprints {
  readonly mesh: THREE.InstancedMesh;
  private readonly prints: Print[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor() {
    const geo = new THREE.CircleGeometry(0.13, 7);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ color: Palette.footprint, transparent: true, opacity: 0.75, depthWrite: false }),
      MAX_PRINTS,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
  }

  /** A left/right pair of paw prints at a point, facing `heading`. Off the ice (in the water) nothing is left. */
  addPair(x: number, z: number, heading: number, step: number): void {
    if (x > G.maxX - 0.3 || z < G.minZ + 0.3) return;
    const side = step % 2 ? 1 : -1;
    const ox = Math.cos(heading) * 0.24 * side;
    const oz = -Math.sin(heading) * 0.24 * side;
    if (this.prints.length >= MAX_PRINTS) this.prints.shift();
    this.prints.push({ x: x + ox, z: z + oz, rot: heading, age: 0 });
  }

  update(dt: number): void {
    const life = ThreatFeel.printLife;
    let n = 0;
    for (let i = this.prints.length - 1; i >= 0; i--) {
      const f = this.prints[i] as Print;
      f.age += dt;
      if (f.age >= life) {
        this.prints.splice(i, 1);
        continue;
      }
      const k = f.age > life - 4 ? (life - f.age) / 4 : Math.min(f.age * 6, 1);
      this.q.setFromEuler(this.e.set(0, f.rot, 0));
      this.m.compose(this.p.set(f.x, 0.02, f.z), this.q, this.s.set(k, 1, k * 1.35));
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
