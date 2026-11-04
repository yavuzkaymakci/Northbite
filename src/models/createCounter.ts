import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { flat, mesh } from './materials';

export const COUNTER_TOP_Y = 0.9;

/**
 * Wooden fish stall. Long side along X. The sign board sits on the north (-Z) side so the table stays visible
 * from the camera. Origin at ground center.
 */
export function createCounter(width: number, depth: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'counter';
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);

  g.add(mesh(new THREE.BoxGeometry(width, COUNTER_TOP_Y - 0.08, depth), wood, 0, (COUNTER_TOP_Y - 0.08) / 2, 0));
  g.add(mesh(new THREE.BoxGeometry(width + 0.12, 0.08, depth + 0.12), flat(Palette.fur), 0, COUNTER_TOP_Y - 0.04, 0));
  // Front plank strip for detail
  g.add(mesh(new THREE.BoxGeometry(width * 0.96, 0.1, 0.04), dark, 0, 0.45, depth / 2 + 0.01));

  // Posts and sign on the back side
  const postGeo = new THREE.BoxGeometry(0.1, 2.0, 0.1);
  g.add(mesh(postGeo, dark, -width / 2 + 0.08, 1.0, -depth / 2 - 0.02));
  g.add(mesh(postGeo, dark, width / 2 - 0.08, 1.0, -depth / 2 - 0.02));
  const sign = mesh(new THREE.BoxGeometry(width + 0.2, 0.38, 0.08), flat(Palette.awning), 0, 1.95, -depth / 2 - 0.02);
  sign.rotation.x = -0.25;
  g.add(sign);
  return g;
}
