import * as THREE from 'three';

const cache = new Map<string, THREE.MeshStandardMaterial>();
/** Shared materials that never change at runtime: low quality may swap them for cheaper twins (render/Quality.ts). */
export const swappableMaterials = new Set<THREE.Material>();

/** Shared flat-shaded material per color. Do not mutate the returned material; use `uniqueFlat` for that. */
export function flat(color: number, opts: { roughness?: number; metalness?: number } = {}): THREE.MeshStandardMaterial {
  const roughness = opts.roughness ?? 0.9;
  const metalness = opts.metalness ?? 0;
  const key = `${color}-${roughness}-${metalness}`;
  let mat = cache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
    cache.set(key, mat);
    swappableMaterials.add(mat);
  }
  return mat;
}

/** Non-shared flat material, for parts whose color changes at runtime (e.g. character customization). */
export function uniqueFlat(color: number, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true });
}

export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}
