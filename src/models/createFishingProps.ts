import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { flat, mesh } from './materials';

/** Red/white float. Origin at the waterline. */
export function createBobber(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bobber';
  g.add(mesh(new THREE.ConeGeometry(0.09, 0.11, 6), flat(Palette.bobberRed), 0, 0.055, 0));
  const bottom = mesh(new THREE.ConeGeometry(0.09, 0.11, 6), flat(Palette.snow), 0, -0.055, 0);
  bottom.rotation.x = Math.PI;
  g.add(bottom);
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4), flat(Palette.snow), 0, 0.16, 0));
  return g;
}

/** Ice fishing hole: dark water disc inside a raised ice rim with a few chunks. Origin at ground center. */
export function createIceHole(radius: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'ice-hole';
  g.add(mesh(new THREE.CylinderGeometry(radius + 0.2, radius + 0.32, 0.14, 10), flat(Palette.ice, { roughness: 0.5 }), 0, 0.0, 0));
  g.add(mesh(new THREE.CylinderGeometry(radius, radius, 0.02, 10), flat(Palette.holeWater, { roughness: 0.25 }), 0, 0.07, 0));
  const chunkGeo = new THREE.IcosahedronGeometry(0.16, 0);
  const chunkMat = flat(Palette.iceDark, { roughness: 0.5 });
  const chunks = [
    [0.9, 0.3, 1.1],
    [-0.7, 0.2, 0.8],
  ] as const;
  for (const [angle, y, s] of chunks) {
    const c = mesh(chunkGeo, chunkMat, Math.cos(angle) * (radius + 0.3), 0.05 + y * 0.2, Math.sin(angle) * (radius + 0.3));
    c.scale.set(s, s * 0.7, s);
    c.rotation.y = angle * 3;
    g.add(c);
  }
  return g;
}

/**
 * Flat annulus lying on the ground: a zero-height open cylinder whose top and bottom radii differ.
 * Used for interaction rings and water ripples. Material is supplied by the caller.
 */
export function createFlatRingGeometry(outer: number, inner: number, segments = 32): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(inner, outer, 0, segments, 1, true);
  // Zero height makes the generated side normals NaN; a flat ring simply faces up.
  const normals = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
  return geo;
}
