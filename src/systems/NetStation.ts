import * as THREE from 'three';
import { IceShore } from '../content/zones';
import { t } from '../content/strings';
import { FishingFeel, HapticsSettings, StationFeel } from '../settings';
import type { FishItem, GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import { BASKET_FLOOR_Y, createBasket, createNet, type NetModel } from '../models/createNet';
import type { Effects } from '../render/Effects';
import { FishRenderer } from '../render/FishRenderer';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import type { WorldMap } from '../world/Map';
import type { Appear } from './Appear';
import type { CarryStack } from './CarryStack';
import { FlightList } from './Flights';
import { sfx } from '../audio/AudioEngine';
import { NetLogic } from './StationLogic';

const B = IceShore.net.basket;
const HOLE = IceShore.holes.find((h) => h.id === IceShore.net.hole) ?? IceShore.holes[0];

/**
 * Fishing net on hole 1 (first automation): every few seconds a fish hops from the hole into the basket.
 * Walking past the basket sends its fish onto the player's back; penguins empty it too.
 */
export class NetStation {
  private built = false;
  private readonly logic: NetLogic;
  private net: NetModel | null = null;
  private readonly group = new THREE.Group();
  private readonly fullLabel: WorldLabel;
  /** Fish hopping from the hole into the basket (already in state.basket, drawn when they land). */
  private readonly hops = new FlightList<FishItem>();
  private pickTimer = 0;
  private splashTimer = 3;
  private wobble = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly state: GameState,
    private readonly player: Player,
    private readonly stack: CarryStack,
    private readonly fx: Effects,
    private readonly labels: WorldLabels,
    private readonly world: WorldMap,
    private readonly appear: Appear,
  ) {
    this.logic = new NetLogic(state);
    scene.add(this.group);
    this.fullLabel = labels.create('basket-full', t('basketFull'));
    this.fullLabel.anchor.set(B.x, 1.2, B.z);
  }

  get isBuilt(): boolean {
    return this.built;
  }

  build(animate: boolean): void {
    if (this.built || !HOLE) return;
    this.built = true;
    const basket = createBasket(B.radius);
    basket.position.set(B.x, 0, B.z);
    this.net = createNet(FishingFeel.holeColliderRadius - 0.1);
    this.net.root.position.set(HOLE.x, 0, HOLE.z);
    this.group.add(basket, this.net.root);
    this.world.addCollider({ kind: 'circle', x: B.x, z: B.z, r: B.radius + 0.05 });
    if (animate) {
      this.appear.add(basket);
      this.appear.add(this.net.root, 0.15);
    }
  }

  /** Fish a helper or the player may take (ones still hopping in excluded). */
  takeable(): number {
    return this.built ? Math.max(this.state.basket.length - this.hops.items.length, 0) : 0;
  }

  /** Takes the topmost landed fish; `out` gets where it was. */
  takeItem(out: THREE.Vector3): FishItem | null {
    const n = this.takeable();
    if (n <= 0) return null;
    this.slot(n - 1, out);
    return this.state.basket.splice(n - 1, 1)[0] ?? null;
  }

  update(dt: number, time: number): void {
    if (!this.built || !this.net) return;
    const caught = this.logic.update(dt);
    if (caught) {
      this.state.today.caught++;
      this.from.set(HOLE!.x, 0.1, HOLE!.z);
      this.slot(this.state.basket.length - 1, this.to);
      this.hops.add(this.from, this.to, 0.55, 1.1, caught);
      this.fx.splash(HOLE!.x, 0.08, HOLE!.z, 9, 1.6);
      sfx('netSplash', HOLE!);
      this.fx.ripple(HOLE!.x, 0.09, HOLE!.z, 0.6);
      this.wobble = 1;
    }
    this.hops.update(dt, () => {});

    // A fish thrashes in the net now and then.
    this.splashTimer -= dt;
    if (this.splashTimer <= 0 && !this.logic.full) {
      this.splashTimer = StationFeel.netSplashMin + Math.random() * (StationFeel.netSplashMax - StationFeel.netSplashMin);
      this.fx.splash(HOLE!.x + (Math.random() - 0.5) * 0.4, 0.08, HOLE!.z - 0.2, 4, 1.1);
      this.wobble = Math.max(this.wobble, 0.5);
    }
    this.wobble = Math.max(this.wobble - dt * 1.6, 0);
    this.net.mesh.rotation.z = Math.sin(time * 19) * 0.18 * this.wobble;
    this.net.mesh.rotation.x = Math.sin(time * 1.3) * 0.04 + Math.cos(time * 15) * 0.1 * this.wobble;

    // Walking past the basket: fish fly onto the player's back.
    const p = this.player.state;
    const near = Math.hypot(p.x - B.x, p.z - B.z) <= StationFeel.pickupRadius;
    this.pickTimer -= dt;
    if (near && this.pickTimer <= 0 && !this.stack.isFull && this.takeable() > 0) {
      this.pickTimer = StationFeel.transferInterval;
      const item = this.takeItem(this.from);
      if (item) {
        this.stack.receive(item, this.from);
        vibrate(HapticsSettings.fishAdded);
      }
    }
    this.labels.show(this.fullLabel, this.logic.full);
  }

  render(fish: FishRenderer): void {
    if (!this.built) return;
    const shown = this.state.basket.length - this.hops.items.length;
    for (let i = 0; i < shown; i++) {
      const item = this.state.basket[i] as FishItem;
      this.slot(i, this.to);
      this.e.set(Math.PI / 2, (i % 2 ? Math.PI / 2 : 0) + i * 0.4, 0);
      this.m.compose(this.to, this.q.setFromEuler(this.e), this.one);
      fish.add(item, this.m, 0.8);
    }
    for (const f of this.hops.items) {
      this.e.set(0, f.t * 4, f.t * Math.PI * 3);
      this.m.compose(f.pos, this.q.setFromEuler(this.e), this.one);
      fish.add(f.payload, this.m, 0.8);
    }
  }

  /** Fish lie crossed in layers of two inside the basket. */
  private slot(index: number, out: THREE.Vector3): THREE.Vector3 {
    const layer = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    const item = this.state.basket[index];
    const th = item ? FishRenderer.thicknessOf(item) * 0.8 : 0.12;
    return out.set(B.x + side * 0.1, BASKET_FLOOR_Y + th / 2 + layer * th * 0.9, B.z + (layer % 2 ? 0.08 : -0.08));
  }
}
