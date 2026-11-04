import * as THREE from 'three';
import { Palette } from '../render/Palette';
import { blobTexture } from '../render/BlobShadow';
import { bake } from './bake';
import { createSnowyRoof } from './createHut';
import { flat, mesh } from './materials';

export interface SmokehouseModel {
  /** Building + racks, baked into one mesh. */
  root: THREE.Group;
  /** Windows and door gap; emissive intensity flickers while smoking. */
  glowMaterial: THREE.MeshStandardMaterial;
  /** Warm light pool on the snow in front of the door. */
  groundGlow: THREE.Mesh;
  /** Local position of the chimney top (smoke puffs start here). */
  chimneyTop: THREE.Vector3;
  /** Local position of the door, where fish go in and come out. */
  door: THREE.Vector3;
}

/** Top surface height of a fish rack. */
export const RACK_TOP_Y = 0.62;

/** Low wooden rack with slats; long side along Z. Added to `g` at (x, z) in local space. */
function addRack(g: THREE.Group, x: number, z: number, width: number, length: number): void {
  const dark = flat(Palette.woodDark);
  g.add(mesh(new THREE.BoxGeometry(width, 0.06, length), flat(Palette.woodLight), x, RACK_TOP_Y - 0.03, z));
  for (let i = 0; i < 4; i++) {
    g.add(mesh(new THREE.BoxGeometry(width + 0.04, 0.03, 0.05), dark, x, RACK_TOP_Y + 0.005, z - length / 2 + 0.2 + (i * (length - 0.4)) / 3));
  }
  const legGeo = new THREE.BoxGeometry(0.07, RACK_TOP_Y, 0.07);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(mesh(legGeo, dark, x + sx * (width / 2 - 0.06), RACK_TOP_Y / 2, z + sz * (length / 2 - 0.06)));
  }
}

/**
 * Wooden smokehouse with a stone chimney. Door and windows face +Z (toward the camera) and glow orange inside.
 * Racks are positioned in the building's local space (origin at the ground center of the building).
 */
export function createSmokehouse(
  width: number,
  depth: number,
  racks: { width: number; length: number; input: { x: number; z: number }; output: { x: number; z: number } },
): SmokehouseModel {
  const root = new THREE.Group();
  root.name = 'smokehouse';
  const g = new THREE.Group();
  const wallH = 1.7;
  const wood = flat(Palette.wood);
  const dark = flat(Palette.woodDark);

  g.add(mesh(new THREE.BoxGeometry(width, wallH, depth), wood, 0, wallH / 2, 0));
  // Vertical boards on the front and the east side
  for (let i = 0; i < 6; i++) {
    const x = -width / 2 + 0.25 + (i * (width - 0.5)) / 5;
    g.add(mesh(new THREE.BoxGeometry(0.05, wallH, 0.04), dark, x, wallH / 2, depth / 2 + 0.01));
  }
  for (let i = 0; i < 4; i++) {
    const z = -depth / 2 + 0.3 + (i * (depth - 0.6)) / 3;
    g.add(mesh(new THREE.BoxGeometry(0.04, wallH, 0.05), dark, width / 2 + 0.01, wallH / 2, z));
  }
  g.add(mesh(new THREE.BoxGeometry(width + 0.1, 0.2, depth + 0.1), flat(Palette.rock), 0, 0.1, 0));

  const roof = createSnowyRoof(width + 0.5, depth + 0.6, 1.35, 0.55);
  roof.position.y = wallH;
  g.add(roof);

  // Stone chimney on the west half
  const chimneyTop = new THREE.Vector3(-width * 0.25, wallH + 1.85, -depth * 0.1);
  g.add(mesh(new THREE.BoxGeometry(0.5, 1.9, 0.5), flat(Palette.rock), chimneyTop.x, wallH + 0.95, chimneyTop.z));
  g.add(mesh(new THREE.BoxGeometry(0.62, 0.14, 0.62), flat(Palette.shadowBlue), chimneyTop.x, chimneyTop.y - 0.05, chimneyTop.z));

  // Door frame, window frames, smoked fish hanging under the eave
  const door = new THREE.Vector3(width * 0.18, 0, depth / 2 + 0.05);
  g.add(mesh(new THREE.BoxGeometry(0.95, 1.35, 0.06), dark, door.x, 0.68, depth / 2 + 0.02));
  for (const wx of [-width * 0.3]) g.add(mesh(new THREE.BoxGeometry(0.72, 0.6, 0.06), dark, wx, 1.05, depth / 2 + 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.55, 0.62), dark, width / 2 + 0.02, 1.05, -depth * 0.15));
  for (let i = 0; i < 4; i++) {
    const f = mesh(new THREE.ConeGeometry(0.06, 0.32, 4), flat(Palette.smokedFish), -width * 0.42 + i * 0.16, wallH - 0.15, depth / 2 + 0.22);
    f.rotation.x = Math.PI;
    g.add(f);
  }

  addRack(g, racks.input.x, racks.input.z, racks.width, racks.length);
  addRack(g, racks.output.x, racks.output.z, racks.width, racks.length);
  // Little barrels between the racks
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.5, 8), dark, racks.input.x - 0.2, 0.25, (racks.input.z + racks.output.z) / 2));
  root.add(bake(g));

  // Glowing openings: the fire inside shows through the door and windows.
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: Palette.emberDeep,
    emissive: Palette.emberGlow,
    emissiveIntensity: 1,
    flatShading: true,
  });
  const openings = new THREE.Group();
  openings.add(mesh(new THREE.BoxGeometry(0.75, 1.2, 0.04), glowMaterial, door.x, 0.62, depth / 2 + 0.04));
  openings.add(mesh(new THREE.BoxGeometry(0.56, 0.44, 0.04), glowMaterial, -width * 0.3, 1.05, depth / 2 + 0.04));
  openings.add(mesh(new THREE.BoxGeometry(0.04, 0.4, 0.46), glowMaterial, width / 2 + 0.04, 1.05, -depth * 0.15));
  root.add(bake(openings, { material: glowMaterial }));

  const groundGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 2.2),
    new THREE.MeshBasicMaterial({
      color: Palette.emberGlow,
      map: blobTexture(),
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.set(door.x - 0.3, 0.035, depth / 2 + 0.9);
  root.add(groundGlow);
  return { root, glowMaterial, groundGlow, chimneyTop, door };
}
