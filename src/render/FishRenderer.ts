import * as THREE from 'three';
import { FishById, type FishId } from '../content/fish';
import type { FishItem } from '../core/GameState';
import { createFishGeometry } from '../models/createFish';
import { Palette } from './Palette';

const MAX_FISH = 160;

/**
 * Draws every visible fish (stack, counter, flights, landing) with two InstancedMeshes.
 * Systems call `add()` each frame between `begin()` and `end()`.
 */
export class FishRenderer {
  readonly group = new THREE.Group();
  private readonly main: THREE.InstancedMesh;
  private readonly belly: THREE.InstancedMesh;
  private count = 0;
  private readonly colors = new Map<FishId, { main: THREE.Color; belly: THREE.Color }>();
  /** Smoked fish: dark orange-brown, keeping a hint of the species color. */
  private readonly smokedColors = new Map<FishId, { main: THREE.Color; belly: THREE.Color }>();
  private readonly scaleM = new THREE.Matrix4();
  private readonly tmp = new THREE.Matrix4();

  constructor() {
    const geo = createFishGeometry();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.1 });
    const bellyMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.6 });
    this.main = new THREE.InstancedMesh(geo.main, mat, MAX_FISH);
    this.belly = new THREE.InstancedMesh(geo.belly, bellyMat, MAX_FISH);
    for (const m of [this.main, this.belly]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color(Palette.white)); // allocate instanceColor up front (stable shader)
      m.count = 0;
      this.group.add(m);
    }
    for (const f of Object.values(FishById)) {
      const main = new THREE.Color(Palette[f.color]);
      this.colors.set(f.id, { main, belly: new THREE.Color(Palette[f.bellyColor]) });
      this.smokedColors.set(f.id, {
        main: new THREE.Color(Palette.smokedFish).lerp(main, 0.15),
        belly: new THREE.Color(Palette.smokedBelly),
      });
    }
  }

  /** Model length for an item, in world units. Scales gently with kg inside the species range. */
  static lengthOf(item: FishItem): number {
    const s = FishById[item.species];
    const t = (item.kg - s.kgMin) / Math.max(s.kgMax - s.kgMin, 1e-6);
    return s.length * (0.8 + 0.2 * Math.min(Math.max(t, 0), 1));
  }

  /** Thickness when lying on its side (used for stacking). */
  static thicknessOf(item: FishItem): number {
    return FishRenderer.lengthOf(item) * 0.26;
  }

  begin(): void {
    this.count = 0;
  }

  /** `matrix` places a unit fish; the item's length (× `scale`) is applied here. */
  add(item: FishItem, matrix: THREE.Matrix4, scale = 1): void {
    if (this.count >= MAX_FISH) return;
    const len = FishRenderer.lengthOf(item) * scale;
    this.tmp.multiplyMatrices(matrix, this.scaleM.makeScale(len, len, len));
    const c = (item.kind === 'smoked' ? this.smokedColors : this.colors).get(item.species);
    this.main.setMatrixAt(this.count, this.tmp);
    this.belly.setMatrixAt(this.count, this.tmp);
    if (c) {
      this.main.setColorAt(this.count, c.main);
      this.belly.setColorAt(this.count, c.belly);
    }
    this.count++;
  }

  end(): void {
    for (const m of [this.main, this.belly]) {
      m.count = this.count;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
