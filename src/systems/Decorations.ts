import * as THREE from 'three';
import { DecorationList, type DecorationDef, type DecorationId } from '../content/decorations';
import { HapticsSettings } from '../settings';
import type { GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import { createDecoration } from '../models/createDecorations';
import type { Effects } from '../render/Effects';
import { createLightPool, NightLights } from '../render/NightLights';
import type { WorldMap } from '../world/Map';
import type { Appear } from './Appear';
import type { Collider } from './Collision';

/** Collision shape per piece (the doormat is flat and has none). */
const SHAPES: Record<DecorationId, { r: number } | { hx: number; hz: number } | null> = {
  flagpole: { r: 0.35 },
  doormat: null,
  snowman: { r: 0.55 },
  sled: { r: 0.7 },
  lanterns: { r: 0.15 },
  dryingRack: { hx: 0.9, hz: 0.15 },
  iceSculpture: { r: 0.55 },
  fishWeight: { r: 0.5 },
};

/** Decorations at their fixed spots (GDD §14). Lit ones (lanterns, drying-rack lamp) glow at night. */
export class Decorations {
  private readonly built = new Set<DecorationId>();
  private readonly group = new THREE.Group();

  constructor(
    scene: THREE.Scene,
    state: GameState,
    private readonly world: WorldMap,
    private readonly fx: Effects,
    private readonly appear: Appear,
  ) {
    scene.add(this.group);
    for (const d of DecorationList) if (state.decorations.includes(d.id)) this.build(d.id, false);
  }

  build(id: DecorationId, animate: boolean): void {
    const def = DecorationList.find((d) => d.id === id);
    if (!def || this.built.has(id)) return;
    this.built.add(id);
    for (const spot of def.extra ? [def.at, def.extra] : [def.at]) this.place(def, spot, animate);
    if (animate) vibrate(HapticsSettings.decoration);
  }

  private place(def: DecorationDef, at: { x: number; z: number; rot: number }, animate: boolean): void {
    const model = createDecoration(def.id, NightLights.window);
    model.root.position.set(at.x, 0, at.z);
    model.root.rotation.y = at.rot;
    for (const l of model.lights) {
      const pool = createLightPool(2.6, 2.6);
      pool.position.set(l.x, 0.045, l.z);
      model.root.add(pool);
    }
    this.group.add(model.root);
    const shape = SHAPES[def.id];
    if (shape) {
      const c: Collider =
        'r' in shape
          ? { kind: 'circle', x: at.x, z: at.z, r: shape.r }
          : { kind: 'rect', minX: at.x - shape.hx, maxX: at.x + shape.hx, minZ: at.z - shape.hz, maxZ: at.z + shape.hz };
      this.world.addCollider(c);
    }
    if (animate) {
      this.appear.add(model.root);
      this.fx.snowPuff(at.x, 0.3, at.z, 0.6, 0.2);
      this.fx.splash(at.x, 0.4, at.z, 10, 2);
    }
  }
}
