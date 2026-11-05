import * as THREE from 'three';
import { createCrystalGeometry, createPlatter, createStatuette } from '../models/createLand';
import { blobTexture } from './BlobShadow';
import { Palette } from './Palette';

const MAX = 96;

type Kind = 'crystal' | 'statuette' | 'plate' | 'glow';

/**
 * Goods of the lands (GDD §15), one InstancedMesh each, rebuilt every frame: crystals (veins, backs, racks, flights),
 * ice statuettes, fish platters, and the additive glow under crystal veins.
 */
export class GoodsRenderer {
  readonly group = new THREE.Group();
  private readonly meshes: Record<Kind, THREE.InstancedMesh>;
  private readonly counts: Record<Kind, number> = { crystal: 0, statuette: 0, plate: 0, glow: 0 };
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  /** The crystal material's glow is pulsed by the cave (`pulse`). */
  readonly crystalMaterial = new THREE.MeshStandardMaterial({
    color: Palette.crystal,
    emissive: Palette.crystalGlow,
    emissiveIntensity: 0.7,
    roughness: 0.25,
    flatShading: true,
  });

  constructor() {
    const statuette = createStatuette();
    const plate = createPlatter();
    const glowGeo = new THREE.PlaneGeometry(1, 1);
    glowGeo.rotateX(-Math.PI / 2);
    this.meshes = {
      crystal: new THREE.InstancedMesh(createCrystalGeometry(), this.crystalMaterial, MAX),
      statuette: new THREE.InstancedMesh(statuette.geometry, statuette.material, MAX),
      plate: new THREE.InstancedMesh(plate.geometry, plate.material, MAX),
      glow: new THREE.InstancedMesh(
        glowGeo,
        new THREE.MeshBasicMaterial({
          color: Palette.crystalGlow,
          map: blobTexture(),
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
        16,
      ),
    };
    for (const im of Object.values(this.meshes)) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
      this.group.add(im);
    }
  }

  begin(): void {
    for (const k of Object.keys(this.counts) as Kind[]) this.counts[k] = 0;
  }

  add(kind: Kind, x: number, y: number, z: number, rotY = 0, scale = 1, tilt = 0): void {
    const im = this.meshes[kind];
    const n = this.counts[kind];
    if (n >= im.instanceMatrix.count) return;
    this.q.setFromEuler(this.e.set(tilt, rotY, tilt * 0.5));
    this.m.compose(this.p.set(x, y, z), this.q, this.s.setScalar(scale));
    im.setMatrixAt(n, this.m);
    this.counts[kind] = n + 1;
  }

  /** The crystals' glow breathes a little (veins, carried crystals). */
  pulse(time: number): void {
    this.crystalMaterial.emissiveIntensity = 0.55 + Math.sin(time * 2.4) * 0.2;
  }

  end(): void {
    for (const k of Object.keys(this.counts) as Kind[]) {
      const im = this.meshes[k];
      im.count = this.counts[k];
      im.visible = im.count > 0;
      im.instanceMatrix.needsUpdate = true;
    }
  }
}
