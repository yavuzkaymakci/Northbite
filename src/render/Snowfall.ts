import * as THREE from 'three';
import { SnowSettings as S } from '../settings';
import { range, seededRandom } from '../core/Random';
import { Palette } from './Palette';

/** Light snowfall around the camera focus. One InstancedMesh, positions wrap around the focus point. */
export class Snowfall {
  readonly mesh: THREE.InstancedMesh;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly speed: Float32Array;
  private readonly phase: Float32Array;
  private readonly matrix = new THREE.Matrix4();

  constructor() {
    const geometry = new THREE.IcosahedronGeometry(S.size, 0);
    const material = new THREE.MeshBasicMaterial({ color: Palette.snow });
    this.mesh = new THREE.InstancedMesh(geometry, material, S.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    const rand = seededRandom(99);
    this.px = new Float32Array(S.count);
    this.py = new Float32Array(S.count);
    this.pz = new Float32Array(S.count);
    this.speed = new Float32Array(S.count);
    this.phase = new Float32Array(S.count);
    for (let i = 0; i < S.count; i++) {
      this.px[i] = range(rand, -S.areaHalfX, S.areaHalfX);
      this.py[i] = range(rand, 0, S.height);
      this.pz[i] = range(rand, -S.areaHalfZ, S.areaHalfZ);
      this.speed[i] = range(rand, S.fallSpeedMin, S.fallSpeedMax);
      this.phase[i] = rand() * Math.PI * 2;
    }
  }

  /** 0..1 share of flakes drawn (the intro thickens the snow a little). */
  setDensity(density: number): void {
    this.mesh.count = Math.round(S.count * Math.min(Math.max(density, 0), 1));
  }

  update(dt: number, time: number, focus: THREE.Vector3): void {
    const spanX = S.areaHalfX * 2;
    const spanZ = S.areaHalfZ * 2;
    for (let i = 0; i < S.count; i++) {
      let y = (this.py[i] as number) - (this.speed[i] as number) * dt;
      if (y < 0) y += S.height;
      this.py[i] = y;

      // Wrap horizontally around the focus so the snow volume follows the camera.
      let x = this.px[i] as number;
      let z = this.pz[i] as number;
      x -= Math.floor((x - focus.x + S.areaHalfX) / spanX) * spanX;
      z -= Math.floor((z - focus.z + S.areaHalfZ) / spanZ) * spanZ;
      this.px[i] = x;
      this.pz[i] = z;

      const drift = Math.sin(time * 0.8 + (this.phase[i] as number)) * 0.35;
      this.matrix.makeTranslation(x + drift, y, z);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
