import * as THREE from 'three';
import type { DecorationId } from '../content/decorations';
import { Palette } from '../render/Palette';
import { bake } from './bake';
import { flat, mesh } from './materials';

// Decorations (GDD §14). Each piece is baked into one mesh; lit pieces add a glass part that uses the shared
// night-glow material. Origin at the ground center, facing +Z.

export interface DecorationModel {
  root: THREE.Group;
  /** Lamp positions (local) for warm light pools at night. */
  lights: THREE.Vector3[];
}

export function createDecoration(id: DecorationId, glass: THREE.Material): DecorationModel {
  const g = new THREE.Group();
  const lights: THREE.Vector3[] = [];
  const glassParts: THREE.Mesh[] = [];
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);
  switch (id) {
    case 'flagpole': {
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 6), flat(Palette.reel), 0, 1.8, 0));
      g.add(mesh(new THREE.IcosahedronGeometry(0.1, 0), flat(Palette.coin), 0, 3.65, 0));
      const flag = mesh(new THREE.BoxGeometry(0.03, 0.7, 1.1), flat(Palette.jacket), 0, 3.15, 0.58);
      flag.rotation.y = 0.12;
      g.add(flag);
      g.add(mesh(new THREE.BoxGeometry(0.035, 0.18, 1.1), flat(Palette.snow), 0.01, 3.15, 0.58));
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.25, 8), flat(Palette.stone), 0, 0.12, 0));
      break;
    }
    case 'doormat': {
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.03, 0.8), flat(Palette.rug), 0, 0.02, 0));
      for (const z of [-0.25, 0, 0.25]) g.add(mesh(new THREE.BoxGeometry(1.1, 0.035, 0.07), flat(Palette.wicker), 0, 0.025, z));
      break;
    }
    case 'snowman': {
      const snow = flat(Palette.snow);
      g.add(mesh(new THREE.IcosahedronGeometry(0.55, 1), snow, 0, 0.45, 0));
      g.add(mesh(new THREE.IcosahedronGeometry(0.4, 1), snow, 0, 1.15, 0));
      g.add(mesh(new THREE.IcosahedronGeometry(0.28, 1), snow, 0, 1.68, 0));
      const nose = mesh(new THREE.ConeGeometry(0.06, 0.3, 5), flat(Palette.jacket), 0, 1.68, 0.36);
      nose.rotation.x = Math.PI / 2;
      g.add(nose);
      for (const s of [-1, 1]) g.add(mesh(new THREE.IcosahedronGeometry(0.04, 0), flat(Palette.eye), s * 0.1, 1.76, 0.24));
      for (const y of [1.0, 1.2, 1.4]) g.add(mesh(new THREE.IcosahedronGeometry(0.045, 0), flat(Palette.eye), 0, y, 0.39 - (y - 1.2) * 0.1));
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 8), dark, 0, 1.92, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), dark, 0, 2.08, 0));
      const scarf = mesh(new THREE.TorusGeometry(0.3, 0.07, 4, 10), flat(Palette.awning), 0, 1.45, 0);
      scarf.rotation.x = Math.PI / 2;
      g.add(scarf);
      for (const s of [-1, 1]) {
        const arm = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 4), dark, s * 0.6, 1.25, 0);
        arm.rotation.z = s * 1.0;
        g.add(arm);
      }
      break;
    }
    case 'sled': {
      for (const s of [-1, 1]) {
        g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 1.5), dark, s * 0.32, 0.05, 0));
        const tip = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.35), dark, s * 0.32, 0.17, 0.8);
        tip.rotation.x = -0.9;
        g.add(tip);
        for (const z of [-0.45, 0.4]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), dark, s * 0.32, 0.17, z));
      }
      g.add(mesh(new THREE.BoxGeometry(0.78, 0.06, 1.3), wood, 0, 0.3, 0));
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.28, 0.5), flat(Palette.fur), 0, 0.47, -0.25));
      break;
    }
    case 'lanterns': {
      // One post; the second post is a copy placed by the decoration system.
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.0, 6), dark, 0, 1.0, 0));
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), dark, 0.2, 1.95, 0));
      g.add(mesh(new THREE.BoxGeometry(0.32, 0.06, 0.32), dark, 0.4, 1.86, 0));
      const cap = mesh(new THREE.ConeGeometry(0.24, 0.2, 4), dark, 0.4, 1.98, 0);
      cap.rotation.y = Math.PI / 4;
      g.add(cap);
      glassParts.push(mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), glass, 0.4, 1.68, 0));
      lights.push(new THREE.Vector3(0.4, 0, 0));
      break;
    }
    case 'dryingRack': {
      for (const s of [-1, 1]) {
        const leg = mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), dark, s * 0.8, 0.8, 0);
        g.add(leg);
      }
      g.add(mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), wood, 0, 1.55, 0));
      for (let i = 0; i < 5; i++) {
        const x = -0.6 + i * 0.3;
        g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.25, 3), dark, x, 1.42, 0));
        const fish = mesh(new THREE.ConeGeometry(0.08, 0.45, 4), flat(i % 2 ? Palette.smokedFish : Palette.fishCod), x, 1.08, 0);
        fish.rotation.z = Math.PI;
        g.add(fish);
      }
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.25, 0.06), dark, 0.8, 1.72, 0));
      glassParts.push(mesh(new THREE.BoxGeometry(0.18, 0.22, 0.18), glass, 0.8, 1.48, 0.12));
      lights.push(new THREE.Vector3(0.8, 0, 0.3));
      break;
    }
    case 'iceSculpture': {
      const ice = flat(Palette.wallIce, { roughness: 0.3 });
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.35, 0.9), flat(Palette.iceDark, { roughness: 0.4 }), 0, 0.17, 0));
      // A leaping fish carved from ice.
      const body = mesh(new THREE.IcosahedronGeometry(0.42, 1), ice, 0, 1.0, 0);
      body.scale.set(0.45, 1.0, 0.7);
      body.rotation.x = 0.5;
      g.add(body);
      const tail = mesh(new THREE.ConeGeometry(0.25, 0.4, 4), ice, 0, 0.5, -0.2);
      tail.rotation.x = 2.6;
      g.add(tail);
      g.add(mesh(new THREE.ConeGeometry(0.08, 0.25, 4), ice, 0, 1.5, 0.25));
      break;
    }
  }
  const root = new THREE.Group();
  root.add(bake(g));
  for (const p of glassParts) root.add(p);
  return { root, lights };
}
