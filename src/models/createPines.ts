import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { instanced, type InstanceTransform } from './instancing';
import { flat } from './materials';

/** Snowy low-poly pine trees, all instances drawn with 4 InstancedMeshes. Origin at the trunk base. */
export function createPines(transforms: readonly InstanceTransform[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pines';
  const at = (y: number) => new THREE.Matrix4().makeTranslation(0, y, 0);

  group.add(instanced(new THREE.CylinderGeometry(0.12, 0.17, 0.7, 5), flat(Palette.woodDark), transforms, at(0.35)));
  group.add(instanced(new THREE.ConeGeometry(1.0, 1.4, 7), flat(Palette.pineDark), transforms, at(1.25)));
  group.add(instanced(new THREE.ConeGeometry(0.76, 1.2, 7), flat(Palette.pine), transforms, at(1.95)));
  group.add(instanced(new THREE.ConeGeometry(0.46, 0.9, 7), flat(Palette.snow), transforms, at(2.6)));
  return group;
}
