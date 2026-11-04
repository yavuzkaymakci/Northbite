import * as THREE from 'three';

export interface InstanceTransform {
  x: number;
  y?: number;
  z: number;
  rotY?: number;
  scale?: number;
  /** Optional non-uniform scale, multiplied with `scale`. */
  sx?: number;
  sy?: number;
  sz?: number;
}

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpEuler = new THREE.Euler();
const tmpMatrix = new THREE.Matrix4();

export function composeInstance(t: InstanceTransform, out: THREE.Matrix4, rotX = 0, rotZ = 0): THREE.Matrix4 {
  const s = t.scale ?? 1;
  tmpPos.set(t.x, t.y ?? 0, t.z);
  tmpQuat.setFromEuler(tmpEuler.set(rotX, t.rotY ?? 0, rotZ));
  tmpScale.set(s * (t.sx ?? 1), s * (t.sy ?? 1), s * (t.sz ?? 1));
  return out.compose(tmpPos, tmpQuat, tmpScale);
}

/** One InstancedMesh for a list of transforms. `local` positions the geometry relative to each instance origin. */
export function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: readonly InstanceTransform[],
  local?: THREE.Matrix4,
): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geometry, material, transforms.length);
  transforms.forEach((t, i) => {
    composeInstance(t, tmpMatrix);
    if (local) tmpMatrix.multiply(local);
    im.setMatrixAt(i, tmpMatrix);
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}
