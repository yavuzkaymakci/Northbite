import * as THREE from 'three';
import { Palette } from './Palette';

let sharedTexture: THREE.CanvasTexture | null = null;

/** Soft white radial mask (shared). Also used for glows. */
export function blobTexture(): THREE.CanvasTexture {
  if (sharedTexture) return sharedTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // White radial mask; the material color tints it.
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  sharedTexture = new THREE.CanvasTexture(canvas);
  return sharedTexture;
}

/** Semi-transparent ground circle used instead of real shadows. */
export function createBlobShadow(diameter: number, opacity = 0.3): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    color: Palette.blobShadow,
    map: blobTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(diameter, diameter), material);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.renderOrder = 1;
  return m;
}
