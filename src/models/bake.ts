import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { swappableMaterials } from './materials';

const bakedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
swappableMaterials.add(bakedMaterial);
const tmpColor = new THREE.Color();
const tintColor = new THREE.Color();

export interface BakeOptions {
  /** Material for the merged mesh (defaults to a shared vertex-colored flat material). */
  material?: THREE.Material;
  /** Mix every color toward this one (e.g. haze for far silhouettes). */
  tint?: number;
  tintAmount?: number;
}

/**
 * Merges every mesh under `root` into one vertex-colored mesh, so a static prop costs one draw call.
 * Each part keeps its material color as vertex color. `root` itself is treated as the origin.
 */
export function bake(root: THREE.Object3D, opts: BakeOptions = {}): THREE.Mesh {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const rel = new THREE.Matrix4();
  if (opts.tint !== undefined) tintColor.set(opts.tint);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.attributes.position as THREE.BufferAttribute);
    g.setAttribute('normal', src.attributes.normal as THREE.BufferAttribute);
    g.applyMatrix4(rel.multiplyMatrices(toRoot, m.matrixWorld));
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    if (mat.color) tmpColor.copy(mat.color);
    else tmpColor.set(0xffffff);
    if (opts.tint !== undefined) tmpColor.lerp(tintColor, opts.tintAmount ?? 0.5);
    const count = g.attributes.position!.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  });
  const merged = mergeGeometries(parts) ?? new THREE.BufferGeometry();
  merged.computeBoundingSphere();
  return new THREE.Mesh(merged, opts.material ?? bakedMaterial);
}
