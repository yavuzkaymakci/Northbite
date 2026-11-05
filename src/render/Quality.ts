import * as THREE from 'three';
import type { QualityId } from '../core/GameState';
import { MotionSettings, QualitySettings } from '../settings';
import { swappableMaterials } from '../models/materials';

/**
 * Graphics quality and "reduce motion" (GDD §22), read by the renderers that scale their effects. Only the settings
 * panel (through Game) changes them.
 */
export const View = {
  quality: 'medium' as QualityId,
  reduceMotion: false,
  get level() {
    return QualitySettings.levels[this.quality];
  },
  /** Camera shake multiplier. */
  get shakeScale(): number {
    return this.reduceMotion ? MotionSettings.shakeScale : 1;
  },
  /** Sparkle count multiplier. */
  get sparkleScale(): number {
    return this.reduceMotion ? MotionSettings.sparkleScale : 1;
  },
};

const lambert = new Map<THREE.Material, THREE.MeshLambertMaterial>();
const standard = new Map<THREE.Material, THREE.Material>();

function twin(m: THREE.Material): THREE.MeshLambertMaterial {
  let t = lambert.get(m);
  if (!t) {
    const s = m as THREE.MeshStandardMaterial;
    t = new THREE.MeshLambertMaterial({
      color: s.color,
      vertexColors: s.vertexColors,
      flatShading: true,
      transparent: s.transparent,
      opacity: s.opacity,
      side: s.side,
      emissive: s.emissive,
      emissiveIntensity: s.emissiveIntensity,
    });
    lambert.set(m, t);
    standard.set(t, m);
  }
  return t;
}

/**
 * Low quality: the shared flat materials (and the baked one) are swapped for cheaper Lambert twins on every mesh
 * under `root`; back to the PBR originals otherwise. Materials whose colors change at runtime are not shared, so
 * they keep their PBR look.
 */
export function applyShading(root: THREE.Object3D, simple: boolean): void {
  const swap = (m: THREE.Material): THREE.Material => {
    if (simple) return swappableMaterials.has(m) ? twin(m) : m;
    return standard.get(m) ?? m;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(swap);
    else mesh.material = swap(mesh.material);
  });
}
