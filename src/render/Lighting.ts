import * as THREE from 'three';
import { FogSettings } from '../settings';
import { Palette } from './Palette';

export interface Lights {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
}

/** 1 hemisphere + 1 directional light, no real shadows (blob shadows instead). */
export function addLighting(scene: THREE.Scene): Lights {
  const hemi = new THREE.HemisphereLight(Palette.hemiSky, Palette.hemiGround, 1.5);
  const sun = new THREE.DirectionalLight(Palette.sun, 2.1);
  sun.position.set(6, 12, 5);
  scene.add(hemi, sun);
  return { hemi, sun };
}

export interface Sky {
  texture: THREE.CanvasTexture;
  /** Repaints the gradient (cheap: a 2×256 canvas). */
  paint(top: THREE.Color, horizon: THREE.Color, bottom: THREE.Color): void;
}

/** Vertical sky gradient as background + matching distance fog. */
export function addSkyAndFog(scene: THREE.Scene): Sky {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const paint = (top: THREE.Color, horizon: THREE.Color, bottom: THREE.Color) => {
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, `#${top.getHexString()}`);
    g.addColorStop(0.55, `#${horizon.getHexString()}`);
    g.addColorStop(1, `#${bottom.getHexString()}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    texture.needsUpdate = true;
  };
  paint(new THREE.Color(Palette.skyTop), new THREE.Color(Palette.skyHorizon), new THREE.Color(Palette.fog));
  scene.background = texture;
  scene.fog = new THREE.Fog(Palette.fog, FogSettings.near, FogSettings.far);
  return { texture, paint };
}
