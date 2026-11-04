import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface FishGeometry {
  /** Body + tail + fins, with per-vertex shade in the color attribute (tinted per instance by species color). */
  main: THREE.BufferGeometry;
  /** Lower belly piece, tinted per instance by species belly color. */
  belly: THREE.BufferGeometry;
}

function shaded(geo: THREE.BufferGeometry, shade: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const count = g.attributes.position!.count;
  const colors = new Float32Array(count * 3).fill(shade);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * Low-poly fish of unit length lying along +X (head at +X), height along Y, thin along Z.
 * The same geometry is used for fish on the stack, on the counter and while landing; species differ by tint and scale.
 */
export function createFishGeometry(): FishGeometry {
  const body = new THREE.IcosahedronGeometry(0.5, 0);
  body.scale(1, 0.42, 0.26);

  const tail = new THREE.ConeGeometry(0.2, 0.3, 4);
  tail.rotateZ(-Math.PI / 2); // apex toward +X (the body)
  tail.scale(1, 1, 0.22);
  tail.translate(-0.56, 0, 0);

  const dorsal = new THREE.ConeGeometry(0.1, 0.16, 3);
  dorsal.scale(1.6, 1, 0.2);
  dorsal.translate(-0.02, 0.22, 0);

  const head = new THREE.ConeGeometry(0.12, 0.18, 4);
  head.rotateZ(-Math.PI / 2);
  head.scale(1, 0.9, 0.9);
  head.translate(0.5, 0.01, 0);

  const main = mergeGeometries([shaded(body, 1), shaded(tail, 0.78), shaded(dorsal, 0.7), shaded(head, 0.9)]);
  const bellyGeo = new THREE.IcosahedronGeometry(0.5, 0);
  bellyGeo.scale(0.74, 0.2, 0.22);
  bellyGeo.translate(0.04, -0.09, 0);

  return { main: main ?? body, belly: bellyGeo };
}
