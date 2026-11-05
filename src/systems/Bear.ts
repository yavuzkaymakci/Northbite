import * as THREE from 'three';
import { Stations } from '../content/stations';
import { t, tf } from '../content/strings';
import { Threats as T } from '../content/threats';
import { Camp } from '../content/land';
import { CampLayout, IceShore, ThreatBuildingSpots, ThreatLayout, type Vec2 } from '../content/zones';
import { HapticsSettings, PlayerFeel, ThreatFeel as F } from '../settings';
import { damp } from '../core/Time';
import type { FishItem, GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import { animateBear, createBear, type BearModel } from '../models/createBear';
import { COUNTER_TOP_Y } from '../models/createCounter';
import { RACK_TOP_Y } from '../models/createSmokehouse';
import { blobTexture, createBlobShadow } from '../render/BlobShadow';
import type { Effects } from '../render/Effects';
import type { FishRenderer } from '../render/FishRenderer';
import type { Footprints } from '../render/Footprints';
import { Palette } from '../render/Palette';
import type { Banner } from '../ui/Banner';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import { pushOutOfCircle, pushOutOfRect, type Collider } from './Collision';
import type { CoinSystem } from './Coins';
import { FlightList } from './Flights';
import { sfx } from '../audio/AudioEngine';
import type { NetStation } from './NetStation';
import type { Smokehouse } from './Smokehouse';
import type { ThreatBuildings } from './ThreatBuildings';
import { stationValue } from './StationUpgrades';
import { bearApproach, bearRoute, scareReward, stealFrom, stealPlates, type BearTargetId } from './ThreatLogic';
import type { WorkerBrain } from './WorkerBrain';
import type { Workers } from './Workers';

type Phase = 'off' | 'warning' | 'approach' | 'bait' | 'sniff' | 'grab' | 'retreat' | 'flee';

const G = IceShore.ground;
const inCamp = (x: number, z: number) => {
  const c = CampLayout.land;
  return x > c.minX && x < c.maxX + 0.2 && z > c.minZ - 0.2 && z < c.maxZ + 0.2;
};
const BAIT_STAND: Vec2 = { x: ThreatBuildingSpots.baitTrap.at.x, z: ThreatBuildingSpots.baitTrap.at.z - 1.1 };

interface Loot {
  item: FishItem;
  from: BearTargetId;
}

export interface BearDeps {
  scene: THREE.Scene;
  state: GameState;
  player: Player;
  workers: Workers;
  net: NetStation;
  smoker: Smokehouse;
  coins: CoinSystem;
  fx: Effects;
  labels: WorldLabels;
  footprints: Footprints;
  banner: Banner;
  buildings: ThreatBuildings;
  /** Static colliders the bear walks around (snow piles excluded: it wades through them). */
  colliders: () => readonly Collider[];
  isPile: (c: Collider) => boolean;
  /** A bear was scared away (journal page, GDD §15). */
  onScared: () => void;
}

/**
 * Polar bear raid (GDD §13). Warning (prints on the ice, edge arrow) → walks in from the water → sniffs its target →
 * runs off to the sea with half of the fish. Walking up to it and holding the screen (or carrying a torch) scares it
 * away first; a bear scared while running off drops what it took. It never touches the fish on the player's back.
 */
export class Bear {
  private phase: Phase = 'off';
  private timer = 0;
  private warnTotal = 0;
  private target: BearTargetId = 'counter';
  private penguin: WorkerBrain | null = null;
  private from: Vec2 = { x: 0, z: 0 };
  private path: Vec2[] = [];
  private fullPath: Vec2[] = [];
  private loot: Loot[] = [];
  /** Platters taken from the camp rack (they vanish into the bear; scaring it brings them back). */
  private plateLoot: number[] = [];
  private scare = 0;
  private usedTorch = false;
  private printStep = 0;
  private printDist = 0;
  private warnPrinted = 0;
  private walkPhase = 0;
  private rippleTimer = 0;
  private readonly model: BearModel;
  private readonly object = new THREE.Group();
  private readonly glow: THREE.Mesh;
  readonly body = { x: 0, z: 0, heading: 0, y: 0 };
  private speed01 = 0;
  private readonly toMouth = new FlightList<Loot>();
  private readonly toStore = new FlightList<Loot>();
  private readonly hint: WorldLabel;
  private readonly ring: WorldLabel;
  private readonly mark: WorldLabel;
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(private readonly d: BearDeps) {
    this.model = createBear();
    this.model.root.scale.setScalar(F.bearScale);
    this.object.add(this.model.root, createBlobShadow(2.6, 0.32));
    // Watchtower spotlight: a warm pool under a marked bear.
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ color: Palette.flameCore, map: blobTexture(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.05;
    this.object.add(this.glow);
    this.object.visible = false;
    d.scene.add(this.object);
    this.hint = d.labels.create('bear-hint');
    this.ring = d.labels.create('scare-ring', '<div class="ring-fill"></div>');
    this.mark = d.labels.create('bear-mark', '!');
    this.hint.clampX = true;
  }

  get active(): boolean {
    return this.phase !== 'off';
  }

  /** True from the warning until it has taken its share (sleeping is blocked meanwhile). */
  get threatening(): boolean {
    return this.phase === 'warning' || this.phase === 'approach' || this.phase === 'bait' || this.phase === 'sniff' || this.phase === 'grab';
  }

  /** True while the warning runs (nothing on the map yet). */
  get warning(): boolean {
    return this.phase === 'warning';
  }

  /** Where the edge arrow points: the bear, or its shore point during the warning. */
  arrowTarget(out: THREE.Vector3): THREE.Vector3 | null {
    if (this.phase === 'off' || this.phase === 'flee') return null;
    if (this.phase === 'warning') return out.set(this.fullPath[0]?.x ?? this.from.x, 0.5, this.fullPath[0]?.z ?? this.from.z);
    return out.set(this.body.x, 1, this.body.z);
  }

  /** Starts a raid: `warning` seconds of warning, then the bear walks in. */
  start(target: BearTargetId, penguin: WorkerBrain | null, warning: number): void {
    this.target = target;
    this.penguin = penguin;
    const a = bearApproach(target, penguin ? { x: penguin.x, z: penguin.z } : null);
    this.from = a.from;
    const stops: Vec2[] = [a.from];
    if (this.d.state.threats.bait && this.d.buildings.isBuilt('baitTrap')) stops.push(BAIT_STAND);
    stops.push(a.stand);
    this.fullPath = bearRoute(stops);
    this.path = this.fullPath.slice(1);
    this.body.x = a.from.x;
    this.body.z = a.from.z;
    this.body.y = -F.swimDepth;
    this.body.heading = Math.atan2((this.path[0]?.x ?? 0) - a.from.x, (this.path[0]?.z ?? 0) - a.from.z);
    this.loot = [];
    this.plateLoot = [];
    this.scare = 0;
    this.usedTorch = false;
    this.warnTotal = warning;
    this.warnPrinted = 0;
    this.printDist = 0;
    this.d.state.stats.bears++;
    this.setPhase('warning', warning);
    this.d.banner.show(t('bearWarning'), 'warn', Math.min(warning, 6));
    vibrate(HapticsSettings.bearWarning);
    sfx('bearWarning');
  }

  /** Ends at once (the game screen closes, debug). */
  stop(): void {
    this.phase = 'off';
    this.object.visible = false;
    this.d.labels.show(this.hint, false);
    this.d.labels.show(this.ring, false);
    this.d.labels.show(this.mark, false);
  }

  update(dt: number, time: number, holding: boolean): void {
    this.updateFlights(dt);
    if (this.phase === 'off') return;
    this.timer -= dt;
    switch (this.phase) {
      case 'warning':
        this.revealPrints();
        if (this.timer <= 0) {
          this.object.visible = true;
          this.setPhase('approach', 0);
        }
        break;
      case 'approach':
        if (this.target === 'penguin') this.chasePenguin();
        if (this.d.state.threats.bait && this.d.buildings.isBuilt('baitTrap') && this.atBait()) this.eatBait();
        else if (this.scare <= 0 && this.walk(dt, T.bear.walkSpeed)) this.setPhase('sniff', this.target === 'penguin' ? 1 : T.bear.sniffTime);
        break;
      case 'bait':
        if (this.timer <= 0) this.setPhase('approach', 0);
        break;
      case 'sniff':
        if (this.timer <= 0 && this.scare <= 0) this.grab();
        break;
      case 'grab':
        if (this.timer <= 0) this.goBack('retreat');
        break;
      case 'retreat':
        if (this.walk(dt, T.bear.walkSpeed * 1.3)) this.stop();
        break;
      case 'flee':
        // Stands up roaring for a moment, then runs for the sea.
        if (this.timer < -0.5 && this.walk(dt, T.bear.fleeSpeed)) this.stop();
        break;
    }
    if (!this.active) return; // stop() may have ended it above
    this.scarePenguins();
    this.updateScare(dt, holding);
    this.updateVisuals(dt, time);
  }

  render(fish: FishRenderer): void {
    if (this.phase !== 'off' && this.object.visible && this.loot.length > 0 && this.toMouth.items.length === 0) {
      this.mouthPoint(this.v);
      this.e.set(0, this.body.heading + Math.PI / 2, 0.3);
      this.m.compose(this.v, this.q.setFromEuler(this.e), this.one);
      fish.add((this.loot[0] as Loot).item, this.m);
    }
    for (const list of [this.toMouth, this.toStore]) {
      for (const f of list.items) {
        this.e.set(Math.PI / 2, f.t * 6, 0);
        this.m.compose(f.pos, this.q.setFromEuler(this.e), this.one);
        fish.add(f.payload.item, this.m);
      }
    }
  }

  // ---------- behaviour ----------

  private setPhase(p: Phase, timer: number): void {
    this.phase = p;
    this.timer = timer;
  }

  private atBait(): boolean {
    return Math.hypot(this.body.x - BAIT_STAND.x, this.body.z - BAIT_STAND.z) < 0.6;
  }

  private eatBait(): void {
    if (!this.d.state.threats.bait) return;
    this.d.state.threats.bait = null;
    this.d.banner.show(t('bearBait'), 'info');
    this.setPhase('bait', T.bait.delay);
  }

  /** The last waypoint follows the penguin; close enough, the penguin bolts for the hut. */
  private chasePenguin(): void {
    const p = this.penguin;
    if (!p || p.hiding) {
      if (this.path.length > 0) this.path = [];
      return;
    }
    const last = this.path[this.path.length - 1];
    if (last) {
      last.x = p.x;
      last.z = p.z;
    }
  }

  private scarePenguins(): void {
    if (this.phase === 'warning' || this.phase === 'flee' || this.body.y < -0.2) return;
    for (const b of this.d.workers.brains) {
      if (b.hiding || Math.hypot(b.x - this.body.x, b.z - this.body.z) > T.bear.penguinScareRange) continue;
      this.d.workers.scare(b, T.bear.penguinHide);
      this.d.banner.show(t('bearPenguin'), 'info');
    }
  }

  /** Takes half of the target's fish (value-capped); they fly into the bear's mouth. */
  private grab(): void {
    const s = this.d.state;
    let list: FishItem[] = [];
    let takeable = 0;
    if (this.target === 'basket' && this.d.net.isBuilt) {
      list = s.basket;
      takeable = this.d.net.takeable();
    } else if (this.target === 'counter') {
      list = s.counter;
      takeable = s.counter.length;
    } else if (this.target === 'smokeOut' && this.d.smoker.isBuilt) {
      list = s.smoker.output;
      takeable = this.d.smoker.takeable();
    }
    if (this.target === 'plates') {
      this.plateLoot = stealPlates(s.camp.plates, Math.random);
      if (this.plateLoot.length > 0) {
        this.d.banner.show(t('bearStole'), 'warn');
        this.d.fx.splash(CampLayout.kitchen.output.x, 0.6, CampLayout.kitchen.output.z, 10, 2);
      }
      this.setPhase('grab', F.grabTime);
      return;
    }
    const stolen = takeable > 0 ? stealFrom(list, takeable, Math.random) : [];
    this.storePoint(this.target, this.w);
    this.mouthPoint(this.v);
    stolen.forEach((item, i) => {
      const f = this.toMouth.add(this.w, this.v, 0.4 + i * 0.05, 0.6, { item, from: this.target });
      f.t = -i * 0.12;
    });
    this.loot = stolen.map((item) => ({ item, from: this.target }));
    if (stolen.length > 0) this.d.banner.show(t('bearStole'), 'warn');
    this.setPhase('grab', F.grabTime);
  }

  private goBack(phase: 'retreat' | 'flee'): void {
    this.path = [{ x: this.from.x, z: this.from.z }];
    if (this.body.x < -11 && this.from.x > -11) this.path = bearRoute([this.body, this.from]).slice(1);
    this.setPhase(phase, 0);
  }

  /** Holding the screen within reach fills the scare bar; a torch does it on its own and faster. */
  private updateScare(dt: number, holding: boolean): void {
    const scareable = this.phase !== 'warning' && this.phase !== 'flee' && this.body.y > -0.3;
    const p = this.d.player.state;
    const dist = Math.hypot(p.x - this.body.x, p.z - this.body.z) - PlayerFeel.radius;
    const torch = this.d.state.threats.torches > 0;
    const inReach = scareable && dist <= T.bear.scareRange;
    if (inReach && (torch || holding)) {
      this.usedTorch = torch;
      this.scare += dt / (torch ? T.torch.scareTime : T.bear.scareTime);
      if (this.scare >= 1) this.scared();
    } else {
      this.scare = 0;
    }
  }

  private scared(): void {
    const s = this.d.state;
    this.scare = 0;
    if (this.usedTorch) s.threats.torches = Math.max(s.threats.torches - 1, 0);
    vibrate(HapticsSettings.bearScared);
    sfx('bearScared', this.body);
    this.d.fx.splash(this.body.x, 0.2, this.body.z, 14, 2.4);
    // Anything already taken falls back where it came from.
    this.mouthPoint(this.v);
    for (const l of this.loot) {
      this.storePoint(l.from, this.w);
      this.toStore.add(this.v, this.w, 0.55, 1.2, l);
    }
    for (const f of this.toMouth.items) {
      this.storePoint(f.payload.from, this.w);
      this.toStore.add(f.pos, this.w, 0.5, 1.0, f.payload);
    }
    this.toMouth.items.length = 0;
    this.loot = [];
    for (const v of this.plateLoot) if (s.camp.plates.length < Camp.kitchen.outputCapacity) s.camp.plates.push(v);
    this.plateLoot = [];
    this.d.onScared();
    const r = scareReward(Math.random);
    this.d.coins.rewardFrom(this.v.set(this.body.x, 0.8, this.body.z), r.coins);
    let text = tf('bearScared', { n: r.coins });
    if (r.fur) {
      s.threats.fur++;
      text += ` · ${t('bearFur')}`;
    }
    this.d.banner.show(text, 'good');
    this.goBack('flee');
  }

  private updateFlights(dt: number): void {
    this.toMouth.update(dt, () => {});
    this.toStore.update(dt, (f) => this.restore(f.payload));
  }

  /** A dropped fish goes back into its store if there is room. */
  private restore(l: Loot): void {
    const s = this.d.state;
    if (l.from === 'basket' && s.basket.length < stationValue(s, 'basketCapacity')) s.basket.push(l.item);
    else if (l.from === 'smokeOut' && s.smoker.output.length < Stations.smokehouse.outputCapacity) s.smoker.output.push(l.item);
    else s.counter.push(l.item);
  }

  /** Follows `path`; returns true on arrival at its last point. */
  private walk(dt: number, speed: number): boolean {
    let step = speed * dt;
    const b = this.body;
    while (step > 0 && this.path.length > 0) {
      const target = this.path[0] as Vec2;
      const dx = target.x - b.x;
      const dz = target.z - b.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 0.1) {
        this.path.shift();
        continue;
      }
      const s = Math.min(step, dist);
      b.x += (dx / dist) * s;
      b.z += (dz / dist) * s;
      step -= s;
      const want = Math.atan2(dx, dz);
      const diff = Math.atan2(Math.sin(want - b.heading), Math.cos(want - b.heading));
      b.heading += diff * damp(F.bearTurnSharpness, dt);
    }
    const r = ThreatLayout.bear.radius;
    for (const c of this.d.colliders()) {
      // It wades through snow piles and swims through open water.
      if (this.d.isPile(c) || (c.kind === 'rect' && c.water)) continue;
      if (c.kind === 'circle') pushOutOfCircle(b, r, c);
      else pushOutOfRect(b, r, c);
    }
    // Prints on the ice behind it.
    this.printDist += speed * dt;
    if (this.printDist >= F.printStep && b.y > -0.3) {
      this.printDist = 0;
      this.d.footprints.addPair(b.x, b.z, b.heading, this.printStep++);
    }
    return this.path.length === 0;
  }

  /** During the warning, prints appear one by one along the first part of the route. */
  private revealPrints(): void {
    const k = 1 - Math.max(this.timer, 0) / this.warnTotal;
    const total = this.pathLength();
    const want = Math.floor((total * F.warningPrintReach * k) / F.printStep);
    while (this.warnPrinted < want) {
      this.warnPrinted++;
      const p = this.pointAlong(this.warnPrinted * F.printStep, this.v);
      this.d.footprints.addPair(p.x, p.z, p.y, this.warnPrinted);
    }
  }

  private pathLength(): number {
    let len = 0;
    for (let i = 1; i < this.fullPath.length; i++) {
      const a = this.fullPath[i - 1] as Vec2;
      const b = this.fullPath[i] as Vec2;
      len += Math.hypot(b.x - a.x, b.z - a.z);
    }
    return len;
  }

  /** Point at a distance along the route; `out.y` holds the heading there. */
  private pointAlong(dist: number, out: THREE.Vector3): THREE.Vector3 {
    for (let i = 1; i < this.fullPath.length; i++) {
      const a = this.fullPath[i - 1] as Vec2;
      const b = this.fullPath[i] as Vec2;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (dist <= len || i === this.fullPath.length - 1) {
        const k = Math.min(dist / Math.max(len, 1e-6), 1);
        return out.set(a.x + (b.x - a.x) * k, Math.atan2(b.x - a.x, b.z - a.z), a.z + (b.z - a.z) * k);
      }
      dist -= len;
    }
    return out.set(this.from.x, 0, this.from.z);
  }

  // ---------- visuals ----------

  private updateVisuals(dt: number, time: number): void {
    if (!this.object.visible) return;
    const b = this.body;
    const onIce = (b.x < G.maxX + 0.2 && b.z > G.minZ - 0.2) || inCamp(b.x, b.z);
    b.y += ((onIce ? 0 : -F.swimDepth) - b.y) * damp(4, dt);
    const moving = this.phase === 'approach' || this.phase === 'retreat' || (this.phase === 'flee' && this.timer < -0.5);
    const target = moving && this.scare <= 0 ? (this.phase === 'flee' ? 1.4 : 1) : 0;
    this.speed01 += (target - this.speed01) * damp(6, dt);
    this.walkPhase += this.speed01 * dt * (this.phase === 'flee' ? 9 : 5.5);
    const sniff = this.phase === 'sniff' || this.phase === 'bait' ? 1 : 0;
    const rear = Math.max(this.scare, this.phase === 'flee' && this.timer > -0.6 ? 0.8 : 0);
    animateBear(this.model, this.speed01, this.walkPhase, time, sniff, rear, F.rearAngle);
    this.object.position.set(b.x, b.y, b.z);
    this.model.root.rotation.y = b.heading;

    if (!onIce) {
      this.rippleTimer -= dt;
      if (this.rippleTimer <= 0) {
        this.rippleTimer = 0.45;
        this.d.fx.ripple(b.x, IceShore.waterLevel + 0.06, b.z, 1.6, 1.2);
      }
    }

    // Labels: hint when close (always on the first bear), scare ring while filling, tower mark.
    const p = this.d.player.state;
    const near = Math.hypot(p.x - b.x, p.z - b.z) <= F.hintRange;
    const scareable = this.phase !== 'flee' && onIce;
    const showHint = scareable && this.scare <= 0 && (near || this.d.state.stats.bears <= 1);
    if (showHint) {
      this.hint.el.textContent = this.d.state.threats.torches > 0 ? t('bearHintTorch') : t('bearHint');
      this.hint.anchor.set(b.x, 3.1, b.z);
    }
    this.d.labels.show(this.hint, showHint);
    this.d.labels.show(this.ring, this.scare > 0);
    if (this.scare > 0) {
      this.ring.anchor.set(b.x, 3.0, b.z);
      this.ring.el.style.setProperty('--p', this.scare.toFixed(3));
    }
    const tower = ThreatBuildingSpots.watchtower.at;
    const marked =
      this.d.buildings.isBuilt('watchtower') && this.phase !== 'flee' && Math.hypot(b.x - tower.x, b.z - tower.z) <= T.watchtower.range;
    this.glow.visible = marked;
    this.d.labels.show(this.mark, marked && !showHint && this.scare <= 0);
    if (marked) this.mark.anchor.set(b.x, 3.2, b.z);
  }

  private mouthPoint(out: THREE.Vector3): THREE.Vector3 {
    this.model.root.updateMatrixWorld(true);
    return this.model.head.localToWorld(out.copy(this.model.mouth));
  }

  private storePoint(id: BearTargetId, out: THREE.Vector3): THREE.Vector3 {
    const c = IceShore.counter;
    if (id === 'basket') return out.set(IceShore.net.basket.x, 0.4, IceShore.net.basket.z);
    if (id === 'smokeOut') return out.set(IceShore.smokehouse.output.x, RACK_TOP_Y + 0.1, IceShore.smokehouse.output.z);
    if (id === 'plates') return out.set(CampLayout.kitchen.output.x, 0.5, CampLayout.kitchen.output.z);
    return out.set(c.x, COUNTER_TOP_Y + 0.1, c.z);
  }
}
