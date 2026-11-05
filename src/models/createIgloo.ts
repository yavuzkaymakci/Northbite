import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { bake } from './bake';
import { flat, mesh } from './materials';

/** Local Z where the entrance tunnel begins (shared with the collider setup). */
export function iglooTunnelStart(radius: number): number {
  return radius * 0.82 - 0.2;
}

/** Low-poly igloo with an entrance tunnel facing +Z. Origin at ground center of the dome. */
export function createIgloo(radius: number, tunnelLength: number, tunnelWidth: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'igloo';

  // Dome: icosahedron with the lower half flattened onto the ground.
  const domeGeo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = domeGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0) pos.setY(i, 0);
  }
  pos.needsUpdate = true;
  domeGeo.scale(1, 0.82, 1);
  domeGeo.computeVertexNormals();
  group.add(mesh(domeGeo, flat(Palette.snow)));

  // Ring of ice blocks around the base.
  const ringGeo = new THREE.CylinderGeometry(radius * 1.02, radius * 1.06, 0.28, 12, 1, true);
  group.add(mesh(ringGeo, flat(Palette.ice), 0, 0.14, 0));

  // Tunnel: half cylinder (theta -90°..90° covers +Z), rotated so its axis runs along Z and the arch faces up.
  const tunnelR = tunnelWidth / 2;
  const tunnelStart = iglooTunnelStart(radius);
  const tunnelGeo = new THREE.CylinderGeometry(tunnelR, tunnelR, tunnelLength, 8, 1, false, -Math.PI / 2, Math.PI);
  const tunnel = mesh(tunnelGeo, flat(Palette.snow), 0, 0, tunnelStart + tunnelLength / 2);
  tunnel.rotation.x = -Math.PI / 2;
  group.add(tunnel);

  // Dark doorway just in front of the tunnel cap.
  const doorGeo = new THREE.CylinderGeometry(tunnelR * 0.72, tunnelR * 0.72, 0.04, 8, 1, false, -Math.PI / 2, Math.PI);
  const door = mesh(doorGeo, flat(Palette.doorway), 0, 0, tunnelStart + tunnelLength + 0.02);
  door.rotation.x = -Math.PI / 2;
  group.add(door);

  return group;
}

export interface IglooModel {
  root: THREE.Group;
  /** Chimney top in igloo space (level 2+: thin smoke), or null. */
  chimneyTop: THREE.Vector3 | null;
  /** Glass roof (level 4): its material is tinted by the aurora at night. */
  glass: THREE.Mesh | null;
}

/**
 * Igloo for a level (GDD §14). 1: plain. 2: wooden door frame and a stove pipe. 3: wider dome, ice-block trim and
 * glowing windows. 4: mansion: glass roof over the top, stone chimney, side lanterns. Static parts are baked into one
 * mesh; windows use the shared night-glow material and the glass roof its own material.
 */
export function createIglooLevel(level: number, radius: number, tunnelLength: number, tunnelWidth: number, glassMaterial: THREE.Material, windowMaterial: THREE.Material): IglooModel {
  const g = createIgloo(radius, tunnelLength, tunnelWidth);
  const doorZ = iglooTunnelStart(radius) + tunnelLength;
  const tunnelR = tunnelWidth / 2;
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);
  const height = radius * 0.82;
  let chimneyTop: THREE.Vector3 | null = null;

  if (level >= 2) {
    // Wooden frame around the doorway.
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.16, tunnelR + 0.2, 0.16), wood, s * (tunnelR + 0.02), (tunnelR + 0.2) / 2, doorZ + 0.04));
    g.add(mesh(new THREE.BoxGeometry(tunnelWidth + 0.3, 0.16, 0.18), wood, 0, tunnelR + 0.22, doorZ + 0.04));
    // Stove pipe through the dome.
    const px = radius * 0.38;
    const py = height * 0.86;
    g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.75, 6), flat(Palette.reel), px, py + 0.2, -radius * 0.2));
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.1, 6), dark, px, py + 0.6, -radius * 0.2));
    chimneyTop = new THREE.Vector3(px, py + 0.7, -radius * 0.2);
  }
  if (level >= 3) {
    // Ice-block trim, a second ring of blocks, and planks on the tunnel.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.35) continue; // keep the tunnel clear
      const b = mesh(new THREE.BoxGeometry(0.55, 0.35, 0.3), flat(Palette.iceDark, { roughness: 0.5 }), Math.cos(a) * radius * 1.03, 0.18, Math.sin(a) * radius * 1.03);
      b.rotation.y = -a;
      g.add(b);
    }
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(tunnelWidth + 0.06, 0.06, 0.12), wood, 0, tunnelR + 0.02, iglooTunnelStart(radius) + 0.3 + i * 0.5));
  }
  if (level >= 4) {
    // Stone chimney for the fireplace and two lanterns at the door.
    const stone = flat(Palette.stone);
    g.add(mesh(new THREE.BoxGeometry(0.6, height + 0.9, 0.6), stone, -radius * 0.72, (height + 0.9) / 2, -radius * 0.35));
    g.add(mesh(new THREE.BoxGeometry(0.75, 0.14, 0.75), dark, -radius * 0.72, height + 0.95, -radius * 0.35));
    for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 5), dark, s * (tunnelR + 0.35), 0.65, doorZ));
    chimneyTop = new THREE.Vector3(-radius * 0.72, height + 1.05, -radius * 0.35);
  }

  const root = new THREE.Group();
  root.name = `igloo-${level}`;
  root.add(bake(g));

  if (level >= 3) {
    // Windows: small panes on the dome facing the camera side.
    for (const a of [0.55, -0.55, 2.4, -2.4].slice(0, level >= 4 ? 4 : 2)) {
      const w = mesh(new THREE.BoxGeometry(0.42, 0.34, 0.06), windowMaterial, Math.sin(a) * radius * 0.86, height * 0.42, Math.cos(a) * radius * 0.86);
      w.rotation.y = a;
      w.rotation.x = -0.35;
      root.add(w);
    }
  }
  if (level >= 4) {
    for (const s of [-1, 1]) root.add(mesh(new THREE.BoxGeometry(0.2, 0.22, 0.2), windowMaterial, s * (tunnelR + 0.35), 1.4, doorZ));
  }
  let glass: THREE.Mesh | null = null;
  if (level >= 4) {
    // Glass cap on top of the dome: the aurora shows through it at night.
    const capGeo = new THREE.IcosahedronGeometry(radius * 0.62, 1);
    const p = capGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, 0);
    capGeo.scale(1, 0.55, 1);
    capGeo.computeVertexNormals();
    glass = new THREE.Mesh(capGeo, glassMaterial);
    glass.position.y = height * 0.8;
    root.add(glass);
  }
  return { root, chimneyTop, glass };
}

export interface BedModel {
  root: THREE.Group;
  /** Where the stove / fireplace fire is (bed space), or null at level 1. */
  fire: THREE.Vector3 | null;
}

/**
 * The bed in front of the igloo door, seen from outside (no interior): a fur bed at level 1, a stove beside it from
 * level 2, a rug and a lamp from level 3, a stone fireplace instead of the stove at level 4. Origin at the bed center;
 * `stove` and `lamp` are offsets from it.
 */
export function createBedProps(level: number, stove: { x: number; z: number }, lamp: { x: number; z: number }, lampGlass: THREE.Material): BedModel {
  const g = new THREE.Group();
  const fur = flat(Palette.fur);
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);
  if (level >= 3) g.add(mesh(new THREE.BoxGeometry(1.9, 0.03, 1.4), flat(Palette.rug), 0, 0.015, 0));
  // Fur bed: low wooden frame, fur blanket, pillow.
  g.add(mesh(new THREE.BoxGeometry(1.0, 0.12, 1.3), level >= 2 ? wood : flat(Palette.iceDark), 0, 0.06, 0));
  const blanket = mesh(new THREE.BoxGeometry(0.95, 0.1, 1.0), fur, 0, 0.16, 0.12);
  g.add(blanket);
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.12, 0.28), flat(Palette.snow), 0, 0.17, -0.45));
  let fire: THREE.Vector3 | null = null;
  if (level === 2 || level === 3) {
    // Little iron stove with a pipe.
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.5, 0.5), flat(Palette.doorway), stove.x, 0.25, stove.z));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 0.04), flat(Palette.emberDeep), stove.x, 0.22, stove.z + 0.26));
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6), flat(Palette.reel), stove.x - 0.12, 0.9, stove.z - 0.1));
    fire = new THREE.Vector3(stove.x, 0.2, stove.z + 0.32);
  }
  if (level >= 4) {
    // Stone fireplace with a mantel.
    const stone = flat(Palette.stone);
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.9, 0.5), stone, stove.x, 0.45, stove.z - 0.1));
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.45, 0.1), flat(Palette.doorway), stove.x, 0.25, stove.z + 0.16));
    g.add(mesh(new THREE.BoxGeometry(1.15, 0.1, 0.62), dark, stove.x, 0.95, stove.z - 0.1));
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.6, 0.35), stone, stove.x, 1.3, stove.z - 0.15));
    fire = new THREE.Vector3(stove.x, 0.06, stove.z + 0.12);
  }
  if (level >= 3) {
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 5), dark, lamp.x, 0.75, lamp.z));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), dark, lamp.x, 1.53, lamp.z));
  }
  const root = new THREE.Group();
  root.add(bake(g));
  if (level >= 3) root.add(mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), lampGlass, lamp.x, 1.38, lamp.z));
  return { root, fire };
}
