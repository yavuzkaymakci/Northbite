import * as THREE from 'three';
import { blobTexture } from './BlobShadow';
import { Palette } from './Palette';

/**
 * Shared materials for windows and doors that glow at night (igloo, hut...). The atmosphere sets their
 * intensity once per frame, so any number of windows costs no extra material updates.
 */
export const NightLights = {
  window: new THREE.MeshStandardMaterial({
    color: Palette.woodDark,
    emissive: Palette.nightGlow,
    emissiveIntensity: 0,
    flatShading: true,
  }),
  pool: new THREE.MeshBasicMaterial({
    color: Palette.nightGlow,
    map: blobTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }),
  /** 0 = day, 1 = full night. */
  level: 0,
  set(level: number): void {
    this.level = level;
    this.window.emissiveIntensity = level * 1.4;
    this.pool.opacity = level * 0.55;
    this.pool.visible = level > 0.01;
  },
};

/** A warm light pool on the snow (flat, additive). */
export function createLightPool(w: number, d: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), NightLights.pool);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  return m;
}
