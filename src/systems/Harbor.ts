import * as THREE from 'three';
import { GiantFish, LootRack } from '../content/harbor';
import { DestinationById, type DestinationId } from '../content/voyages';
import { getLang, t, tf } from '../content/strings';
import { HarborLayout as L, type BoatPart } from '../content/zones';
import { FishingFeel, HapticsSettings, HarborFeel } from '../settings';
import type { FishItem, GameState, VoyageReturn } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import { createFlatRingGeometry } from '../models/createFishingProps';
import { createBoat, createBuoy, createGullGeometry, createIsland, createLighthouse, createLootRack, createPierScene, createSeal, HARBOR_DECK_Y, type BoatModel, type LighthouseModel, type SealModel } from '../models/createHarbor';
import { createLampPost } from '../models/createLand';
import { flat } from '../models/materials';
import type { CameraRig } from '../render/CameraRig';
import type { Effects } from '../render/Effects';
import type { FishRenderer } from '../render/FishRenderer';
import { createLightPool, NightLights } from '../render/NightLights';
import { Palette } from '../render/Palette';
import type { Banner } from '../ui/Banner';
import type { VoyagePanel } from '../ui/VoyagePanel';
import type { LighthousePanel, SeasonCard } from '../ui/LighthousePanel';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import type { WorldMap } from '../world/Map';
import { sfx } from '../audio/AudioEngine';
import type { Appear } from './Appear';
import type { CarryStack } from './CarryStack';
import type { CoinSystem } from './Coins';
import type { FishingHole } from './Fishing';
import {
  autoVoyageDue,
  boatStage,
  buyBoatUpgrade,
  collectReturn,
  departVoyage,
  giantBonus,
  lighthouseDone,
  repairLighthouse,
  refillRack,
  rollGiant,
  tickVoyage,
  toggleCrew,
  voyagePhase,
} from './VoyageLogic';

const PER_ROW = 4;
const RACK_Y = 0.62;

interface SealView {
  model: SealModel;
  phase: number;
}

/**
 * Harbour Pier (GDD §25): the pier scene, the boat (rebuilt from its repair stage and the voyage: nothing about its
 * animation is saved), the voyage point ring that opens the voyage panel (panel manager, contextual), the loot rack
 * and its crates, the harbour coin pile's treasure, the giant fish sign, seals and gulls. Rules live in VoyageLogic.
 */
export class Harbor {
  private readonly group = new THREE.Group();
  private readonly boatGroup = new THREE.Group();
  private boat: BoatModel | null = null;
  private stage = -1;
  private lighthouse: LighthouseModel | null = null;
  private lhStage = -1;
  private readonly lampMat = new THREE.MeshStandardMaterial({ color: Palette.lighthouseLamp, emissive: Palette.lighthouseLamp, emissiveIntensity: 0.4, flatShading: true });
  private readonly beamMat = new THREE.MeshBasicMaterial({ color: Palette.beam, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  private readonly sealViews = new Map<number, SealView>();
  private readonly gulls: THREE.InstancedMesh;
  private readonly crateMesh: THREE.InstancedMesh;
  private readonly buoy: THREE.Mesh;
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: Palette.benchPad, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  private readonly voyageRing: THREE.Mesh;
  private readonly lighthouseRing: THREE.Mesh;
  private lhStand = 0;
  private lhDismissed = false;
  /** The lighthouse shines (the game strengthens the northern lights). */
  onLit: (() => void) | null = null;
  private readonly rackLabel: WorldLabel;
  private readonly pointLabel: WorldLabel;
  private readonly lhLabel: WorldLabel;
  private stand = 0;
  private dismissed = false;
  private rackTimer = 0;
  private autoTimer = 0;
  private followTimer = 0;
  private gullTimer = 3;
  private creakTimer = 4;
  private lastPhase = '';
  /** Debug "voyage time ×" (GDD §25). */
  debugMul = 1;
  /** The giant fish spot while its sign is up (fished with the normal mini-game). */
  readonly holes: FishingHole[] = [];
  private readonly giantHole: FishingHole;
  /** The game's reaction to a return (banner, story, save). */
  onReturned: ((ret: VoyageReturn, online: boolean) => void) | null = null;
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly s = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly state: GameState,
    private readonly player: Player,
    private readonly stack: CarryStack,
    world: WorldMap,
    private readonly fx: Effects,
    private readonly labels: WorldLabels,
    private readonly coins: CoinSystem,
    private readonly appear: Appear,
    private readonly banner: Banner,
    private readonly rig: CameraRig,
    private readonly panel: VoyagePanel,
    private readonly lhPanel: LighthousePanel,
    private readonly season: SeasonCard,
  ) {
    scene.add(this.group);
    this.group.add(createPierScene(), this.boatGroup);
    for (const b of L.blockers) world.addCollider({ kind: 'rect', minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, water: b.water });
    const d = L.depot;
    world.addCollider({ kind: 'rect', minX: d.x - d.width / 2, maxX: d.x + d.width / 2, minZ: d.z - d.depth / 2, maxZ: d.z + d.depth / 2 });
    world.addCollider({ kind: 'circle', x: L.wreck.x, z: L.wreck.z, r: 0.9 });
    const r = L.rack;
    const rack = createLootRack(r.width, r.depth);
    rack.position.set(r.x, 0, r.z);
    this.group.add(rack);
    world.addCollider({ kind: 'rect', minX: r.x - r.width / 2, maxX: r.x + r.width / 2, minZ: r.z - r.depth / 2, maxZ: r.z + r.depth / 2 });
    for (const p of L.lamps) {
      const lamp = createLampPost(NightLights.window);
      lamp.add(createLightPool(2.6, 2.6));
      lamp.position.set(p.x, 0, p.z);
      this.group.add(lamp);
      world.addCollider({ kind: 'circle', x: p.x, z: p.z, r: 0.15 });
    }
    const island = createIsland(L.island.radius);
    island.position.set(L.island.x, -0.2, L.island.z);
    this.group.add(island);
    // Voyage point ring at the pier end.
    const vp = L.voyagePoint;
    this.voyageRing = new THREE.Mesh(createFlatRingGeometry(vp.radius, vp.radius - 0.16, 32), this.ringMat);
    this.voyageRing.position.set(vp.x, HARBOR_DECK_Y + 0.03, vp.z);
    const lp = L.lighthousePoint;
    this.lighthouseRing = new THREE.Mesh(createFlatRingGeometry(lp.radius, lp.radius - 0.16, 32), this.ringMat);
    this.lighthouseRing.position.set(lp.x, HARBOR_DECK_Y + 0.03, lp.z);
    this.group.add(this.voyageRing, this.lighthouseRing);
    // Gulls circling, crates for the overflow, the giant fish buoy.
    this.gulls = new THREE.InstancedMesh(createGullGeometry(), flat(Palette.gull), HarborFeel.gulls);
    this.gulls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gulls.frustumCulled = false;
    this.crateMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), flat(Palette.wood), LootRack.cratesShownMax);
    this.crateMesh.count = 0;
    this.buoy = createBuoy();
    this.buoy.position.set(L.giant.x, -0.45, L.giant.z);
    this.group.add(this.gulls, this.crateMesh, this.buoy);
    this.giantHole = { id: 'giant', x: L.giant.x, z: L.giant.z, roll: () => rollGiant(Math.random), onCatch: (item) => this.giantCaught(item) };

    this.rackLabel = labels.create('rack-count');
    this.rackLabel.anchor.set(r.x, 1.3, r.z);
    this.pointLabel = labels.create('harbor-point');
    this.pointLabel.anchor.set(vp.x, 1.7, vp.z);
    this.lhLabel = labels.create('harbor-point', t('lighthousePoint'));
    this.lhLabel.anchor.set(lp.x, 1.7, lp.z);
    lhPanel.onClosed = (reason) => {
      this.lhDismissed = reason !== 'left';
    };
    lhPanel.onRepair = () => this.repairLighthouse();

    panel.onClosed = (reason) => {
      this.dismissed = reason !== 'left';
    };
    panel.actions = {
      depart: (id) => this.depart(id, false),
      crew: (id) => {
        if (toggleCrew(state, id)) sfx('tap');
        else sfx('deny');
        panel.refresh(state, true);
      },
      auto: () => {
        state.harbor.auto = !state.harbor.auto;
        sfx('tap');
        panel.refresh(state, true);
      },
      upgrade: (id) => {
        if (!buyBoatUpgrade(state, id)) {
          panel.deny(id);
          sfx('deny');
          return;
        }
        for (let i = 0; i < 5; i++) this.coins.spendTo(this.v.set(L.boat.x, 1, L.boat.z));
        this.fx.sparkle(L.boat.x, 1.4, L.boat.z);
        vibrate(HapticsSettings.upgrade);
        sfx('buy');
        panel.refresh(state, true);
      },
    };
    this.syncBoat(false);
    this.syncLighthouse(false);
  }

  private get open(): boolean {
    return this.state.regions.includes('harbor');
  }

  /** Camera target while following the boat out to sea (null = follow the player). */
  get cameraFocus(): THREE.Vector3 | null {
    return this.followTimer > 0 && this.boatGroup.visible ? this.boatGroup.position : null;
  }

  /** The player is on the pier strip (music, waves). */
  get playerNear(): boolean {
    const p = this.player.state;
    return p.z > L.land.minZ - 0.5 && p.x > L.land.minX - 1;
  }

  /** A repair stage was paid: the boat changes in front of the player (bounce, sawdust and snow, sound). */
  repaired(part: BoatPart): void {
    this.syncBoat(true);
    const b = L.boat;
    for (let i = 0; i < 4; i++) this.fx.snowPuff(b.x - 1.5 + i, 0.6, b.z + (i % 2 ? 0.4 : -0.4), 0.6, 0.5);
    this.fx.sparkle(b.x, 1.6, b.z);
    this.rig.shake(0.12);
    sfx('hammer', b);
    this.banner.show(t(part === 'boatCabin' ? 'boatSeaworthy' : part === 'boatSail' ? 'boatSailDone' : 'boatHullDone'), 'good');
  }

  /** Rebuilds the boat model when its repair stage changed. */
  private syncBoat(animate: boolean): void {
    const stage = boatStage(this.state);
    if (stage === this.stage) return;
    this.stage = stage;
    if (this.boat) this.boatGroup.remove(this.boat.root);
    this.boat = createBoat(stage, NightLights.window);
    this.boatGroup.add(this.boat.root);
    if (animate) this.appear.add(this.boat.root);
  }

  /** Rebuilds the lighthouse when a stage was repaired (C-II adds the panel that does it). */
  syncLighthouse(animate: boolean): void {
    const stage = this.state.harbor.lighthouse;
    if (stage === this.lhStage) return;
    this.lhStage = stage;
    if (this.lighthouse) this.group.remove(this.lighthouse.root);
    this.lighthouse = createLighthouse(stage, this.lampMat, this.beamMat);
    this.lighthouse.root.position.set(L.island.x, 0.4, L.island.z);
    this.group.add(this.lighthouse.root);
    if (animate) this.appear.add(this.lighthouse.root);
  }

  /** Sets sail (from the panel, or an auto voyage). */
  depart(id: DestinationId, auto: boolean): void {
    const r = departVoyage(this.state, id, NightLights.level > 0.5, Math.random, this.debugMul);
    if (!r.ok) {
      if (!auto) {
        this.panel.denyDest(id);
        sfx('deny');
      }
      return;
    }
    const name = DestinationById[id].name[getLang()];
    this.followTimer = HarborFeel.followTime;
    this.autoTimer = 0;
    vibrate(HapticsSettings.upgrade);
    sfx('boatDepart', L.boat);
    for (let i = 0; i < 4; i++) this.coins.spendTo(this.v.set(L.boat.x, 0.8, L.boat.z));
    this.banner.show(tf(auto ? 'voyageAuto' : 'voyageDepart', { d: name }), 'info');
    if (r.voyage.event) window.setTimeout(() => this.banner.show(t(`voyageEvent_${r.voyage.event}` as 'voyageEvent_storm'), 'info', 4), 2600);
    if (r.voyage.nightDelay) window.setTimeout(() => this.banner.show(t('voyageNightDelay'), 'info', 4), 4200);
    if (!auto) this.panel.refresh(this.state, true);
  }

  /** The boat came back while playing: loot is already on the rack (VoyageLogic); this is the show. */
  private returned(ret: VoyageReturn): void {
    const b = L.boat;
    vibrate(HapticsSettings.unlock);
    sfx('boatReturn', b);
    this.fx.splash(b.x + 1.5, 0.1, b.z, 14, 2);
    if (ret.coins > 0) this.coins.showPayment(this.v.set(b.x, 1.2, b.z), ret.coins, 0, 'harbor');
    this.banner.show(tf('boatBack', { n: ret.fish, c: ret.coins }), 'good', 5);
    if (Math.random() < GiantFish.chance) {
      this.state.harbor.giant = GiantFish.stay;
      window.setTimeout(() => this.banner.show(t('giantSign'), 'good', 5), 2400);
    }
    this.onReturned?.(ret, true);
  }

  private giantCaught(item: FishItem): void {
    const h = this.state.harbor;
    h.giant = 0;
    const bonus = giantBonus(Math.random);
    h.pile += bonus;
    this.coins.showPayment(this.v.set(L.giant.x, 1, L.giant.z), bonus, 0, 'harbor');
    this.banner.show(tf('giantCaught', { c: bonus }), 'good', 4);
    void item;
  }

  update(dt: number, time: number, locked: boolean): void {
    const h = this.state.harbor;
    const ret = tickVoyage(this.state, dt, Math.random);
    if (ret) this.returned(ret);
    this.followTimer = Math.max(this.followTimer - dt, 0);
    // Giant fish sign.
    h.giant = Math.max(h.giant - dt, 0);
    const giant = h.giant > 0 && this.open;
    if (giant !== this.holes.length > 0) this.holes.splice(0, this.holes.length, ...(giant ? [this.giantHole] : []));
    this.buoy.visible = giant;
    if (giant) {
      this.buoy.position.y = -0.5 + Math.sin(time * 2.2) * 0.06;
      if (Math.random() < dt * 1.2) this.fx.ripple(L.giant.x, -0.4, L.giant.z, 0.9, 1.2);
    }
    // Auto voyage (boat level 3): repeats the last destination a little after the boat is back.
    if (autoVoyageDue(this.state) && !locked) {
      this.autoTimer += dt;
      if (this.autoTimer >= HarborFeel.autoDelay) this.depart(h.lastDest as DestinationId, true);
    } else this.autoTimer = 0;

    if (this.open) {
      this.updateRack(dt);
      this.updatePoint(dt);
      this.updateLighthousePoint(dt);
    }
    // Season goal reached (also after loading a finished save): the card shows once.
    if (lighthouseDone(this.state) && !h.seasonShown) {
      h.seasonShown = true;
      this.season.show();
    }
    if (this.lhPanel.opened) this.lhPanel.refresh(this.state);
    this.updateBoat(dt, time);
    this.updateSeals(dt, time);
    this.updateGulls(dt, time);
    this.updateScenery(time);
    this.updateLabels();
    if (this.panel.opened) this.panel.refresh(this.state);
  }

  // ---------- loot rack ----------

  /** A dockhand takes a fish off the rack (crates refill it). `out` is where its hop starts. */
  takeLoot(out: THREE.Vector3): FishItem | null {
    const h = this.state.harbor;
    const item = h.rack.pop() ?? null;
    if (!item) return null;
    this.rackSlot(h.rack.length, out);
    refillRack(this.state);
    return item;
  }

  /** Standing next to the rack: loot flies onto the back one by one (crates refill the rack). */
  private updateRack(dt: number): void {
    const h = this.state.harbor;
    refillRack(this.state);
    const p = this.player.state;
    this.rackTimer -= dt;
    if (this.rackTimer > 0 || h.rack.length === 0 || this.stack.room <= 0) return;
    if (Math.hypot(p.x - L.rack.x, p.z - L.rack.z) > HarborFeel.rackRadius) return;
    this.rackTimer = HarborFeel.transferInterval;
    const item = h.rack.pop() as FishItem;
    this.rackSlot(h.rack.length, this.v);
    this.stack.receive(item, this.v);
    collectReturn(this.state);
    sfx('stackAdd');
  }

  // ---------- voyage point ----------

  private get onPoint(): boolean {
    const p = this.player.state;
    const vp = L.voyagePoint;
    return Math.hypot(p.x - vp.x, p.z - vp.z) <= vp.radius;
  }

  private updatePoint(dt: number): void {
    const still = this.player.state.speed01 < FishingFeel.stillSpeed;
    if (this.onPoint) {
      if (still) this.stand += dt;
      if (this.stand >= HarborFeel.openDelay && !this.dismissed && !this.panel.opened) {
        if (this.panel.open(this.state, () => this.onPoint)) collectReturn(this.state);
      }
    } else {
      this.stand = 0;
      this.dismissed = false;
    }
  }

  // ---------- lighthouse (season goal, GDD §25 C6) ----------

  private get onLighthousePoint(): boolean {
    const p = this.player.state;
    const lp = L.lighthousePoint;
    return Math.hypot(p.x - lp.x, p.z - lp.z) <= lp.radius;
  }

  private updateLighthousePoint(dt: number): void {
    const still = this.player.state.speed01 < FishingFeel.stillSpeed;
    if (this.onLighthousePoint) {
      if (still) this.lhStand += dt;
      if (this.lhStand >= HarborFeel.openDelay && !this.lhDismissed && !this.lhPanel.opened) this.lhPanel.open(this.state, () => this.onLighthousePoint);
    } else {
      this.lhStand = 0;
      this.lhDismissed = false;
    }
  }

  private repairLighthouse(): void {
    const r = repairLighthouse(this.state);
    if (!r.ok) {
      this.lhPanel.deny();
      sfx('deny');
      return;
    }
    const i = L.island;
    for (let k = 0; k < 5; k++) this.coins.spendTo(this.v.set(L.lighthousePoint.x, 1, L.lighthousePoint.z));
    this.syncLighthouse(true);
    this.fx.sparkle(i.x, 3, i.z);
    for (let k = 0; k < 3; k++) this.fx.snowPuff(i.x - 1 + k, 1, i.z, 0.8, 0.5);
    vibrate(HapticsSettings.unlock);
    sfx('lighthouseBell');
    sfx('hammer', i);
    if (r.stage >= 5) {
      this.banner.show(t('lighthouseLit'), 'good', 6);
      this.rig.shake(0.15);
      this.onLit?.();
    } else this.banner.show(tf('lighthouseStageDone', { n: r.stage }), 'good');
    this.lhPanel.refresh(this.state, true);
  }

  // ---------- visuals ----------

  /** Boat position from the voyage: at the pier, sailing out (first `sailTime` s), away, sailing in (last `sailTime` s). */
  private updateBoat(dt: number, time: number): void {
    this.syncBoat(false);
    const boat = this.boat;
    if (!boat) return;
    const v = this.state.harbor.voyage;
    const g = this.boatGroup;
    let k = 0;
    let away = false;
    let back = false;
    if (v) {
      const sail = Math.min(HarborFeel.sailTime, v.total / 2);
      const out = v.total - v.left;
      if (out < sail) k = out / sail;
      else if (v.left < sail) {
        k = v.left / sail;
        back = true;
      } else away = true;
    }
    g.visible = !away;
    if (away) return;
    this.routePoint(k, this.v);
    this.routePoint(Math.min(k + 0.02, 1), this.w);
    const dir = Math.atan2(this.w.z - this.v.z, this.w.x - this.v.x);
    // Faces out to sea when leaving; when coming back it turns toward the pier, and settles facing east at the pier.
    const heading = back ? dir + Math.PI * Math.min(k / 0.12, 1) : dir;
    const bob = Math.sin(time * 1.4) * HarborFeel.bob * (this.stage === 0 ? 0.4 : 1);
    g.position.set(this.v.x, -0.42 + bob, this.v.z);
    g.rotation.set(0, -heading, this.stage === 0 ? 0.12 : Math.sin(time * 1.1) * 0.03);
    const fade = k > HarborFeel.fadeFrom ? 1 - (k - HarborFeel.fadeFrom) / (1 - HarborFeel.fadeFrom) : 1;
    boat.material.opacity = fade;
    boat.material.depthWrite = fade > 0.98;
    if (boat.sail) {
      boat.sail.scale.x = 1 + Math.sin(time * 3.1) * 0.05;
      boat.sail.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (mat) mat.opacity = fade;
      });
    }
    if (v && !back && k > 0 && k < 0.5 && Math.random() < dt * 6) this.fx.splash(this.v.x - Math.cos(dir) * 1.6, 0.05 - 0.4, this.v.z - Math.sin(dir) * 1.6, 3, 1.1);
    // Creaks and rope sounds while moored.
    this.creakTimer -= dt;
    if (!v && this.creakTimer <= 0 && this.playerNear) {
      this.creakTimer = 5 + Math.random() * 6;
      sfx(this.stage >= 2 && Math.random() < 0.4 ? 'sailFlap' : Math.random() < 0.5 ? 'rope' : 'creak', L.boat);
    }
  }

  /** Point along the route (0 = at the pier, 1 = gone into the fog). */
  private routePoint(k: number, out: THREE.Vector3): THREE.Vector3 {
    const r = L.route;
    let total = 0;
    for (let i = 1; i < r.length; i++) total += Math.hypot(r[i]!.x - r[i - 1]!.x, r[i]!.z - r[i - 1]!.z);
    let d = k * total;
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1]!;
      const b = r[i]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (d <= len || i === r.length - 1) {
        const f = Math.min(d / len, 1);
        return out.set(a.x + (b.x - a.x) * f, 0, a.z + (b.z - a.z) * f);
      }
      d -= len;
    }
    return out.set(r[0]!.x, 0, r[0]!.z);
  }

  /** Seals: at sea they ride the boat; otherwise they bob up by the pier and look at the player. */
  private updateSeals(dt: number, time: number): void {
    const h = this.state.harbor;
    const alive = new Set<number>();
    const p = this.player.state;
    h.seals.forEach((seal, i) => {
      alive.add(seal.id);
      let view = this.sealViews.get(seal.id);
      if (!view) {
        view = { model: createSeal(seal.scarf), phase: i * 1.7 };
        this.sealViews.set(seal.id, view);
        this.group.add(view.model.root);
        const spot = L.sealSpots[i % L.sealSpots.length]!;
        this.fx.splash(spot.x, -0.3, spot.z, 8, 1.4);
      }
      const root = view.model.root;
      const aboard = h.voyage?.crew.includes(seal.id) ?? false;
      if (aboard && this.boat) {
        root.visible = this.boatGroup.visible;
        if (!root.visible) return;
        const seat = this.boat.seats[h.voyage!.crew.indexOf(seal.id) % this.boat.seats.length]!;
        this.boatGroup.updateMatrixWorld(true);
        root.position.copy(seat).applyMatrix4(this.boatGroup.matrixWorld);
        root.rotation.set(0, this.boatGroup.rotation.y + Math.PI / 2, 0);
        root.scale.setScalar(0.85 * this.boat.material.opacity + 0.001);
        return;
      }
      root.visible = true;
      root.scale.setScalar(1);
      const spot = L.sealSpots[i % L.sealSpots.length]!;
      view.phase += dt;
      const cycle = (view.phase % HarborFeel.sealPeek) / HarborFeel.sealPeek;
      // Peek out of the water: rise, look around, dip back under.
      const up = cycle < 0.7 ? Math.min(cycle / 0.15, 1) : Math.max(1 - (cycle - 0.7) / 0.15, 0);
      root.position.set(spot.x, -1.05 + up * 0.75, spot.z);
      root.rotation.set(-0.5, Math.atan2(p.x - spot.x, p.z - spot.z), 0);
      view.model.head.rotation.y = Math.sin(time * 1.3 + i) * 0.4;
      if (cycle > 0.69 && cycle < 0.69 + dt / HarborFeel.sealPeek) this.fx.splash(spot.x, -0.35, spot.z, 4, 1);
    });
    for (const [id, view] of this.sealViews) {
      if (alive.has(id)) continue;
      this.group.remove(view.model.root);
      this.sealViews.delete(id);
    }
  }

  private updateGulls(dt: number, time: number): void {
    const c = L.gulls;
    for (let i = 0; i < HarborFeel.gulls; i++) {
      const a = time * HarborFeel.gullSpeed * (i % 2 ? 1 : -0.8) + i * 1.3;
      const r = c.radius * (0.6 + (i % 3) * 0.2);
      this.e.set(Math.sin(time * 7 + i) * 0.35, -a + (i % 2 ? 0 : Math.PI), 0);
      this.m.compose(this.v.set(c.x + Math.cos(a) * r, 4.5 + (i % 3) * 0.8 + Math.sin(time + i) * 0.3, c.z + Math.sin(a) * r * 0.7), this.q.setFromEuler(this.e), this.s.set(1, 1, 1));
      this.gulls.setMatrixAt(i, this.m);
    }
    this.gulls.instanceMatrix.needsUpdate = true;
    this.gullTimer -= dt;
    if (this.gullTimer <= 0) {
      const [a, b] = HarborFeel.gullCry as [number, number];
      this.gullTimer = a + Math.random() * (b - a);
      if (this.playerNear) sfx('gull', { x: c.x + (Math.random() - 0.5) * 6, z: c.z });
    }
  }

  /** Voyage ring pulse, crates for the overflow, the lighthouse lamp. */
  private updateScenery(time: number): void {
    this.ringMat.opacity = this.open ? 0.55 + Math.sin(time * 3 + 2) * 0.2 : 0;
    const crates = Math.min(Math.ceil(this.state.harbor.crates.length / LootRack.perCrate), LootRack.cratesShownMax);
    this.crateMesh.count = crates;
    for (let i = 0; i < crates; i++) {
      const layer = Math.floor(i / 3);
      const j = i % 3;
      this.e.set(0, (j - 1) * 0.15 + layer * 0.3, 0);
      this.m.compose(this.v.set(L.crates.x - 0.9 + j * 0.9, 0.4 + layer * 0.8, L.crates.z + (layer % 2) * 0.1), this.q.setFromEuler(this.e), this.one);
      this.crateMesh.setMatrixAt(i, this.m);
    }
    this.crateMesh.instanceMatrix.needsUpdate = true;
    const lh = this.lighthouse;
    if (lh?.lamp) this.lampMat.emissiveIntensity = 0.3 + NightLights.level * (lh.beam ? 1.6 : 0.6);
    if (lh?.beam) {
      lh.beam.rotation.y = time * 0.6;
      this.beamMat.opacity = 0.05 + NightLights.level * 0.2;
    }
  }

  private updateLabels(): void {
    const p = this.player.state;
    const h = this.state.harbor;
    const nearRack = this.open && Math.hypot(p.x - L.rack.x, p.z - L.rack.z) < 7 && (h.rack.length > 0 || h.crates.length > 0);
    this.labels.show(this.rackLabel, nearRack);
    if (nearRack) this.rackLabel.el.innerHTML = `<span class="fish-icon"></span>${h.rack.length}${h.crates.length > 0 ? ` +${h.crates.length}` : ''}`;
    this.labels.show(this.lhLabel, this.open && Math.hypot(p.x - L.lighthousePoint.x, p.z - L.lighthousePoint.z) < 6 && !this.lhPanel.opened);
    const vp = L.voyagePoint;
    const nearPoint = this.open && this.stage >= 0 && Math.hypot(p.x - vp.x, p.z - vp.z) < 9;
    this.labels.show(this.pointLabel, nearPoint);
    if (!nearPoint) return;
    const phase = voyagePhase(this.state);
    const v = h.voyage;
    const text =
      phase === 'locked' ? t('voyagePointLocked') : phase === 'out' && v ? tf('voyagePointOut', { t: mmss(v.left) }) : phase === 'returned' ? t('voyagePointBack') : t('voyagePointReady');
    const key = `${phase}|${text}`;
    if (key !== this.lastPhase) {
      this.lastPhase = key;
      this.pointLabel.el.textContent = text;
    }
  }

  render(fish: FishRenderer): void {
    const h = this.state.harbor;
    for (let i = 0; i < h.rack.length; i++) {
      this.rackSlot(i, this.v);
      this.e.set(Math.PI / 2, i % 2 ? Math.PI : 0, 0);
      this.m.compose(this.v, this.q.setFromEuler(this.e), this.one);
      fish.add(h.rack[i] as FishItem, this.m, 0.6);
    }
  }

  private rackSlot(index: number, out: THREE.Vector3): THREE.Vector3 {
    const layer = Math.floor(index / PER_ROW);
    const i = index % PER_ROW;
    return out.set(L.rack.x - 0.55 + i * 0.37, RACK_Y + 0.05 + layer * 0.13, L.rack.z + (layer % 2 ? 0.1 : -0.1));
  }

  /** Debug line (GDD §25): boat stage, level, voyage and loot. */
  debugLine(): string {
    const h = this.state.harbor;
    const v = h.voyage;
    return `boat st${boatStage(this.state)} ${voyagePhase(this.state)}${v ? ` ${v.dest} ${Math.ceil(v.left)}s/${Math.ceil(v.total)}s${v.event ? ` ${v.event}` : ''}` : ''} rack ${h.rack.length}+${h.crates.length} parts ${h.parts} lh ${h.lighthouse} ×${this.debugMul}`;
  }
}

function mmss(sec: number): string {
  const s = Math.max(Math.ceil(sec), 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
