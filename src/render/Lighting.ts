import * as THREE from 'three';
import { FogSettings } from '../settings';
import { Palette, toCss } from './Palette';

/** 1 hemisphere + 1 directional light, no real shadows (blob shadows instead). */
export function addLighting(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(Palette.hemiSky, Palette.hemiGround, 1.5));
  const sun = new THREE.DirectionalLight(Palette.sun, 2.1);
  sun.position.set(6, 12, 5);
  scene.add(sun);
}

/** Vertical sky gradient as background + matching distance fog. */
export function addSkyAndFog(scene: THREE.Scene): void {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, toCss(Palette.skyTop));
    g.addColorStop(0.55, toCss(Palette.skyHorizon));
    g.addColorStop(1, toCss(Palette.fog));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  scene.background = texture;
  scene.fog = new THREE.Fog(Palette.fog, FogSettings.near, FogSettings.far);
}
