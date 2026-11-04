import * as THREE from 'three';
import { CameraSettings as S } from '../settings';
import { damp } from '../core/Time';

/** Tilted, near-isometric follow camera with no yaw. Smoothly lerps toward the target. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly focus = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();

  constructor() {
    this.camera = new THREE.PerspectiveCamera(S.fov, 1, S.near, S.far);
    this.setAspect(1);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    // On narrow (tall) screens pull back so at least `minVisibleWidth` stays visible.
    const halfV = THREE.MathUtils.degToRad(S.fov / 2);
    const neededDist = S.minVisibleWidth / 2 / (Math.tan(halfV) * aspect);
    const dist = Math.max(S.distance, neededDist);
    const pitch = THREE.MathUtils.degToRad(S.pitchDeg);
    this.offset.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    this.apply();
  }

  snapTo(x: number, z: number): void {
    this.focus.set(x, 0, z);
    this.apply();
  }

  update(dt: number, x: number, z: number): void {
    const k = damp(S.followSharpness, dt);
    this.focus.x += (x - this.focus.x) * k;
    this.focus.z += (z - this.focus.z) * k;
    this.apply();
  }

  get focusPoint(): THREE.Vector3 {
    return this.focus;
  }

  private apply(): void {
    this.camera.position.copy(this.focus).add(this.offset);
    this.lookAt.set(this.focus.x, S.lookAheadY, this.focus.z);
    this.camera.lookAt(this.lookAt);
  }
}
