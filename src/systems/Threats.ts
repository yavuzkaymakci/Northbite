import * as THREE from 'three';
import { t } from '../content/strings';
import { Threats as T } from '../content/threats';
import { ThreatLayout, type BuildingId } from '../content/zones';
import { DebugSettings } from '../settings';
import type { GameState } from '../core/GameState';
import type { Player } from '../entities/Player';
import { createHandTorch, HAND_TORCH_TIP } from '../models/createThreatProps';
import type { CameraRig } from '../render/CameraRig';
import type { Effects } from '../render/Effects';
import type { FishRenderer } from '../render/FishRenderer';
import { FlameRenderer } from '../render/FlameRenderer';
import { Footprints } from '../render/Footprints';
import type { Banner } from '../ui/Banner';
import { ThreatArrow } from '../ui/ThreatArrow';
import type { WorldLabels } from '../ui/WorldLabels';
import type { WorldMap } from '../world/Map';
import type { Appear } from './Appear';
import { Avalanche } from './Avalanche';
import { Bear } from './Bear';
import type { CarryStack } from './CarryStack';
import type { CoinSystem } from './Coins';
import type { NetStation } from './NetStation';
import type { Smokehouse } from './Smokehouse';
import { ThreatBuildings } from './ThreatBuildings';
import { bearApproach, bearDeterred, bearWarning, pickBearTarget, pitsNear, ThreatDirector, type ThreatKind } from './ThreatLogic';
import type { Workers } from './Workers';

export interface ThreatDeps {
  scene: THREE.Scene;
  overlay: HTMLElement;
  state: GameState;
  player: Player;
  stack: CarryStack;
  world: WorldMap;
  workers: Workers;
  net: NetStation;
  smoker: Smokehouse;
  coins: CoinSystem;
  fx: Effects;
  rig: CameraRig;
  labels: WorldLabels;
  banner: Banner;
  appear: Appear;
  /** Journal hooks (GDD §15): first scared bear, first avalanche chest. */
  onBearScared: () => void;
  onChestOpened: () => void;
  /** Platters on the camp rack, or null when the camp has no kitchen. */
  campPlates: () => number | null;
}

export interface ThreatInput {
  /** Camera tour or intro running: threats neither start nor move. */
  locked: boolean;
  /** A finger (or Space) is held down. */
  holding: boolean;
  night: boolean;
  fishing: boolean;
  /** No new threat may start (a journal page is on screen). */
  quiet: boolean;
}

/**
 * Threats (GDD §13): decides when a polar bear or an avalanche comes and runs it, plus the buildings that help
 * against them. Nothing here is saved except what the buildings hold (torches, bait, fur in `state.threats`).
 */
export class Threats {
  readonly buildings: ThreatBuildings;
  readonly footprints = new Footprints();
  readonly flames = new FlameRenderer();
  private readonly bear: Bear;
  private readonly avalanche: Avalanche;
  private readonly director = new ThreatDirector();
  private readonly arrow: ThreatArrow;
  private readonly torch: THREE.Mesh;
  private wasActive = false;
  private debugTimer = 3;
  private readonly v = new THREE.Vector3();

  constructor(private readonly d: ThreatDeps) {
    d.scene.add(this.footprints.mesh, this.flames.mesh);
    this.buildings = new ThreatBuildings(d.scene, d.state, d.player, d.stack, d.world, d.labels, d.appear);
    this.avalanche = new Avalanche(d.scene, d.state, d.player, d.world, d.workers, d.coins, d.fx, d.rig, d.labels, d.banner, this.buildings, d.onChestOpened);
    this.bear = new Bear({
      ...d,
      footprints: this.footprints,
      buildings: this.buildings,
      colliders: () => d.world.colliders,
      isPile: (c) => this.avalanche.isPile(c),
      onScared: d.onBearScared,
    });
    this.arrow = new ThreatArrow(d.overlay);
    this.torch = createHandTorch();
    this.torch.visible = false;
    d.player.attachToHand(this.torch);
  }

  get active(): boolean {
    return this.bear.active || this.avalanche.active;
  }

  /** Why the player cannot sleep right now (a bear on its way, an avalanche warning), or null. */
  sleepBlocker(): string | null {
    if (this.bear.threatening) return t('sleepBlockedBear');
    if (this.avalanche.warning) return t('sleepBlockedAvalanche');
    return null;
  }

  /** Sleeping ends whatever is left (a bear running off, snow piles) and the new day starts quiet. */
  cancelForSleep(): void {
    this.bear.stop();
    this.avalanche.stop();
    this.wasActive = false;
    this.director.rest(T.sessionGrace);
  }

  build(id: BuildingId, animate: boolean): void {
    this.buildings.build(id, animate);
  }

  update(dt: number, time: number, input: ThreatInput): void {
    this.buildings.update(dt);
    this.footprints.update(dt);
    if (!input.locked) {
      if (!this.active && !input.quiet) this.maybeStart(dt, input.night);
      this.bear.update(dt, time, input.holding);
      this.avalanche.update(dt, time);
    }
    const active = this.active;
    if (this.wasActive && !active) this.director.rest();
    this.wasActive = active;

    // Held tools: the shovel while digging, a torch while a bear is around.
    const pose = this.d.player.pose;
    if (this.avalanche.digging) {
      pose.armsForward = 1;
      pose.armRaise = 0.35 + Math.sin(time * 10) * 0.35;
      pose.lean = 0.12 + Math.sin(time * 10) * 0.08;
    }
    this.torch.visible = this.bear.active && this.d.state.threats.torches > 0 && !input.fishing && !this.avalanche.digging;
  }

  /** `extraFlames` lets other systems (the igloo fireplace) draw into the shared flame mesh. */
  render(fish: FishRenderer, time: number, extraFlames?: (flames: FlameRenderer) => void): void {
    this.flames.begin();
    this.buildings.render(fish, this.flames, time);
    extraFlames?.(this.flames);
    if (this.torch.visible) {
      this.torch.updateWorldMatrix(true, false);
      this.v.set(0, HAND_TORCH_TIP, 0).applyMatrix4(this.torch.matrixWorld);
      this.flames.add(this.v.x, this.v.y, this.v.z, 0.42, time, 13);
    }
    this.flames.end();
    this.bear.render(fish);
  }

  updateArrow(camera: THREE.Camera, width: number, height: number): void {
    this.arrow.update(camera, width, height, this.bear.arrowTarget(this.v) ?? this.avalanche.arrowTarget(this.v));
  }

  private maybeStart(dt: number, night: boolean): void {
    const debug = DebugSettings.debugForceThreat;
    if (debug !== 'off') {
      this.debugTimer -= dt;
      if (this.debugTimer <= 0) {
        this.debugTimer = 8;
        this.begin(debug, night, true);
      }
      return;
    }
    const kind = this.director.update(dt, this.d.state, night);
    if (kind) this.begin(kind, night, false);
  }

  private begin(kind: ThreatKind, night: boolean, forced: boolean): void {
    if (kind === 'avalanche') {
      this.avalanche.start();
      return;
    }
    const d = this.d;
    const out = d.workers.brains.filter((b) => !b.hiding);
    const target = pickBearTarget({
      basket: d.net.isBuilt ? d.net.takeable() : null,
      counter: d.state.counter.length,
      smokeOut: d.smoker.isBuilt ? d.smoker.takeable() : null,
      penguins: out.map((b) => b.carried.length),
      // The camp's platter rack counts only when no fire pit covers it.
      plates: d.campPlates() !== null && pitsNear(d.state, ThreatLayout.bear.approaches.plates.stand) === 0 ? d.campPlates() : null,
    });
    const penguin = out[target.penguin] ?? null;
    const stand = bearApproach(target.id, penguin ? { x: penguin.x, z: penguin.z } : null).stand;
    if (!forced && bearDeterred(d.state, stand, Math.random)) {
      // A fire pit kept it away; nothing happens this time.
      this.director.rest();
      return;
    }
    this.bear.start(target.id, penguin, bearWarning(d.state, night));
  }
}
