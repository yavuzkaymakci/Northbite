import * as THREE from 'three';
import { HeadwearColors, JacketColors, Palette, ScarfColors, SkinTones } from '../render/Palette';
import { flat, mesh } from './materials';

export interface CustomerModel {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
}

function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length) % list.length] as T;
}

/**
 * Simple townsperson in generic winter clothes (fictional northern town, no ethnic costume).
 * Fewer parts than the player to keep draw calls low. Faces +Z, origin at the feet.
 */
export function createCustomer(rand: () => number): CustomerModel {
  const root = new THREE.Group();
  root.name = 'customer';
  const body = new THREE.Group();
  root.add(body);

  const jacket = flat(pick(JacketColors, rand));
  const pants = flat(Palette.pants);
  const skin = flat(pick(SkinTones, rand));
  const hat = flat(rand() < 0.5 ? pick(HeadwearColors, rand) : pick(ScarfColors, rand));

  const makeLeg = (side: number) => {
    const leg = new THREE.Group();
    leg.position.set(0.14 * side, 0.48, 0);
    leg.add(mesh(new THREE.BoxGeometry(0.22, 0.48, 0.24), pants, 0, -0.24, 0));
    body.add(leg);
    return leg;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  body.add(mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.72, 7), jacket, 0, 0.84, 0));

  const makeArm = (side: number) => {
    const arm = new THREE.Group();
    arm.position.set(0.37 * side, 1.12, 0);
    arm.add(mesh(new THREE.BoxGeometry(0.15, 0.5, 0.17), jacket, 0, -0.24, 0));
    arm.rotation.z = 0.1 * side;
    body.add(arm);
    return arm;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  body.add(mesh(new THREE.IcosahedronGeometry(0.25, 1), skin, 0, 1.45, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.24, 7), hat, 0, 1.63, 0));

  const scale = 0.9 + rand() * 0.15;
  root.scale.setScalar(scale);
  return { root, body, legL, legR, armL, armR };
}

export function animateCustomer(m: CustomerModel, walk: number, phase: number): void {
  const swing = Math.sin(phase) * 0.6 * walk;
  m.legL.rotation.x = swing;
  m.legR.rotation.x = -swing;
  m.armL.rotation.x = -swing * 0.8;
  m.armR.rotation.x = swing * 0.8;
  m.body.position.y = Math.abs(Math.sin(phase)) * 0.05 * walk;
}
