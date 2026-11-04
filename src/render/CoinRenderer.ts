import * as THREE from 'three';
import { createCoinGeometry } from '../models/createMarkers';
import { flat } from '../models/materials';
import { Palette } from './Palette';

const MAX_COINS = 160;

/** All coins (piles and flights) in one InstancedMesh, rebuilt each frame. */
export class CoinRenderer {
  readonly mesh: THREE.InstancedMesh;
  private count = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);

  constructor() {
    this.mesh = new THREE.InstancedMesh(createCoinGeometry(), flat(Palette.coin, { roughness: 0.35, metalness: 0.4 }), MAX_COINS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  begin(): void {
    this.count = 0;
  }

  add(x: number, y: number, z: number, rotX = 0, rotY = 0, scale = 1): void {
    if (this.count >= MAX_COINS) return;
    this.q.setFromEuler(this.e.set(rotX, rotY, 0));
    this.s.setScalar(scale);
    this.m.compose(this.p.set(x, y, z), this.q, this.s);
    this.mesh.setMatrixAt(this.count++, this.m);
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
