import * as THREE from 'three';
import type { RectArea } from '../content/zones';
import { range, seededRandom } from '../core/Random';
import { Palette } from '../render/Palette';
import type { InstanceTransform } from './instancing';
import { instanced } from './instancing';

export interface IceWallModel {
  root: THREE.Group;
  blocks: THREE.InstancedMesh;
  cracks: THREE.InstancedMesh;
  /** Block placements (world space), reused to spawn shards when the wall breaks. */
  blockTransforms: InstanceTransform[];
  material: THREE.MeshStandardMaterial;
}

/**
 * Thick, half-transparent wall of stacked ice blocks filling `rect`, with dark crack lines on both long faces.
 * Built in world space (the root stays at the origin).
 */
export function createIceWall(rect: RectArea, height: number, seed: number): IceWallModel {
  const rand = seededRandom(seed);
  const alongX = rect.maxX - rect.minX >= rect.maxZ - rect.minZ;
  const length = alongX ? rect.maxX - rect.minX : rect.maxZ - rect.minZ;
  const thick = alongX ? rect.maxZ - rect.minZ : rect.maxX - rect.minX;
  const cx = (rect.minX + rect.maxX) / 2;
  const cz = (rect.minZ + rect.maxZ) / 2;
  const n = Math.max(2, Math.round(length / 0.95));
  const step = length / n;

  const blocks: InstanceTransform[] = [];
  const place = (along: number, across: number, y: number, w: number, h: number, d: number) => {
    const x = alongX ? cx + along : cx + across;
    const z = alongX ? cz + across : cz + along;
    blocks.push({
      x,
      y,
      z,
      sx: alongX ? w : d,
      sy: h,
      sz: alongX ? d : w,
      rotY: range(rand, -0.08, 0.08),
    });
  };
  for (let i = 0; i < n; i++) {
    const along = -length / 2 + step * (i + 0.5);
    const h = range(rand, height * 0.72, height * 0.95);
    place(along, range(rand, -0.06, 0.06), h / 2, step * 1.04, h, thick * range(rand, 0.9, 1.05));
    if (rand() < 0.65) {
      const h2 = range(rand, 0.35, 0.6);
      place(along + range(rand, -0.15, 0.15), range(rand, -0.1, 0.1), h + h2 / 2 - 0.05, step * range(rand, 0.55, 0.8), h2, thick * 0.7);
    }
  }

  const material = new THREE.MeshStandardMaterial({
    color: Palette.wallIce,
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.8,
    flatShading: true,
  });
  const root = new THREE.Group();
  root.name = 'ice-wall';
  const blockMesh = instanced(new THREE.BoxGeometry(1, 1, 1), material, blocks);
  root.add(blockMesh);

  // Zig-zag cracks: thin dark slivers climbing both long faces.
  const crackMats: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const face of [-1, 1]) {
    for (let c = 0; c < Math.max(2, Math.round(length / 1.3)); c++) {
      let along = range(rand, -length / 2 + 0.3, length / 2 - 0.3);
      let y = range(rand, 0.3, height * 0.45);
      let angle = range(rand, 0.6, 1.2) * (rand() < 0.5 ? -1 : 1); // from the horizontal, along the face
      for (let s = 0; s < 4; s++) {
        const segLen = range(rand, 0.25, 0.45);
        const da = Math.cos(angle) * segLen;
        const dy = Math.abs(Math.sin(angle)) * segLen;
        const across = face * (thick / 2 + 0.02);
        const midA = along + da / 2;
        const tilt = Math.atan2(dy, da);
        // Sliver lies along the wall's long axis, tilted within the face plane.
        if (alongX) e.set(0, 0, tilt);
        else e.set(-tilt, 0, 0);
        const pos = new THREE.Vector3(alongX ? cx + midA : cx + across, y + dy / 2, alongX ? cz + across : cz + midA);
        const scale = alongX ? new THREE.Vector3(segLen, 0.045, 0.03) : new THREE.Vector3(0.03, 0.045, segLen);
        crackMats.push(new THREE.Matrix4().compose(pos, q.setFromEuler(e), scale));
        along += da;
        y += dy;
        angle = -angle * range(rand, 0.75, 1.15);
      }
    }
  }
  const crackMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: Palette.wallCrack }),
    crackMats.length,
  );
  crackMats.forEach((m, i) => crackMesh.setMatrixAt(i, m));
  crackMesh.instanceMatrix.needsUpdate = true;
  crackMesh.computeBoundingSphere();
  root.add(crackMesh);
  return { root, blocks: blockMesh, cracks: crackMesh, blockTransforms: blocks, material };
}
