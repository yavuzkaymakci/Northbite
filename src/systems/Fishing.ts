import * as THREE from 'three';
import { FishById, RarityColor } from '../content/fish';
import { getLang, t } from '../content/strings';
import { FishingFeel as F, HapticsSettings } from '../settings';
import type { GameState, FishItem } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import { damp } from '../core/Time';
import type { TouchClaimer } from '../core/TouchRouter';
import type { Player } from '../entities/Player';
import { createBobber } from '../models/createFishingProps';
import type { Effects } from '../render/Effects';
import { FishingLine } from '../render/FishingLine';
import type { FishRenderer } from '../render/FishRenderer';
import { toCss, Palette } from '../render/Palette';
import type { ReelGauge } from '../ui/ReelGauge';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import type { CarryStack } from './CarryStack';
import { rollFish, type HookedFish } from './FishRoll';
import { arcPoint } from './Flights';
import { ReelGame } from './ReelGame';
import { fishingMods } from './Upgrades';

export interface FishingHole {
  id: string;
  x: number;
  z: number;
}

type Phase = 'idle' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'escaped';

interface Landing {
  item: FishItem;
  stage: 'arc' | 'flop' | 'toStack';
  t: number;
  from: THREE.Vector3;
  spot: THREE.Vector3;
  yaw: number;
  pos: THREE.Vector3;
}

const WATER_Y = 0.08;

/**
 * Fishing at ice holes (GDD §2.1): auto-cast after standing still in the ring, bite → tap → reel mini-game.
 * Owns the rod pose, float, line and catch presentation. Claims touches during the bite and reel phases.
 */
export class FishingSystem implements TouchClaimer {
  private phase: Phase = 'idle';
  private hole: FishingHole | null = null;
  private dwell = 0;
  private timer = 0;
  private hooked: HookedFish | null = null;
  private reel: ReelGame | null = null;
  private landing: Landing | null = null;
  private readonly touches = new Map<number, { x: number; y: number }>();
  private keyWasDown = false;

  // Visual state
  private rodPitch = 0.4;
  private rodBend = 0;
  private armsForward = 0;
  private lean = 0;
  private splashTimer = 0;
  private lastWarn = 0;
  private readonly bobber: THREE.Group;
  private readonly line = new FishingLine();
  private readonly bobberPos = new THREE.Vector3();
  private readonly castFrom = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly snapEnd = new THREE.Vector3();
  private readonly tmpV = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly one = new THREE.Vector3(1, 1, 1);

  // Labels
  private readonly alert: WorldLabel;
  private readonly fullLabel: WorldLabel;
  private readonly toast: WorldLabel;
  private readonly card: WorldLabel;
  private toastTimer = 0;
  private cardTimer = 0;

  constructor(
    scene: THREE.Scene,
    private readonly holes: () => readonly FishingHole[],
    private readonly state: GameState,
    private readonly player: Player,
    private readonly stack: CarryStack,
    private readonly fx: Effects,
    private readonly labels: WorldLabels,
    private readonly gauge: ReelGauge,
  ) {
    this.bobber = createBobber();
    this.bobber.visible = false;
    scene.add(this.bobber, this.line.line);
    this.alert = labels.create('fish-alert', `<div class="alert-mark">!</div><div class="alert-tap">${t('tapNow')}</div>`);
    this.fullLabel = labels.create('fish-full', t('full'));
    this.toast = labels.create('fish-toast');
    this.card = labels.create('fish-card');
    this.card.offsetY = -10;
  }

  /** The hole the player should face, if fishing. */
  get facing(): FishingHole | null {
    return this.phase !== 'idle' && this.phase !== 'escaped' ? this.hole : null;
  }

  /** True while a session (cast..reel) is running; used by the guide arrow. */
  get active(): boolean {
    return this.phase !== 'idle';
  }

  // ---------- Touch claiming ----------

  wantsTouches(): boolean {
    return this.phase === 'bite' || this.phase === 'reeling';
  }

  touchDown(id: number, x: number, y: number): void {
    this.touches.set(id, { x, y });
    if (this.phase === 'bite') this.hook();
  }

  touchMove(id: number, x: number, y: number): 'keep' | 'release' {
    const start = this.touches.get(id);
    if (!start) return 'release';
    if (Math.hypot(x - start.x, y - start.y) <= F.cancelDragPx) return 'keep';
    this.touches.delete(id);
    if (this.phase === 'bite' || this.phase === 'reeling') this.cancel();
    return 'release';
  }

  touchUp(id: number): void {
    this.touches.delete(id);
  }

  // ---------- Update ----------

  update(dt: number, time: number, moveActive: boolean, reelKey: boolean): void {
    const p = this.player.state;
    const still = !moveActive && p.speed01 < F.stillSpeed;
    const keyPressed = reelKey && !this.keyWasDown;
    this.keyWasDown = reelKey;

    const near = this.nearestHole();
    const inRing = this.hole ? this.distTo(this.hole) <= F.interactRadius : false;

    // Moving or leaving the ring ends a session. Bite/reel touches never move the player, so only the keyboard or
    // a cancelled touch can trigger this mid-reel.
    if (this.phase !== 'idle' && this.phase !== 'escaped' && (!still || !inRing)) this.cancel();

    this.labels.show(this.fullLabel, this.phase === 'idle' && !!near && still && this.stack.isFull);

    switch (this.phase) {
      case 'idle':
        if (near && still && !this.stack.isFull) {
          this.dwell += dt;
          if (this.dwell >= F.dwellToCast) this.startCast(near);
        } else {
          this.dwell = 0;
        }
        break;
      case 'casting':
        this.updateCast(dt);
        break;
      case 'waiting':
        this.timer -= dt;
        if (this.timer <= 0) this.startBite();
        break;
      case 'bite':
        if (keyPressed) this.hook();
        else {
          this.timer -= dt;
          if (this.timer <= 0) this.miss();
        }
        break;
      case 'reeling':
        this.updateReel(dt, reelKey);
        break;
      case 'escaped':
        this.timer -= dt;
        if (this.timer <= 0) this.toIdle(-F.escapeRecastDelay);
        break;
    }

    this.updateLanding(dt, time);
    this.updateVisuals(dt, time);
    this.updateLabels(dt);
  }

  /** Fish being presented after a catch (drawn by the shared fish renderer). */
  render(fish: FishRenderer, time: number): void {
    const l = this.landing;
    if (!l) return;
    if (l.stage === 'arc') {
      this.e.set(0, l.yaw, l.t * Math.PI * 3);
    } else if (l.stage === 'flop') {
      this.e.set(Math.PI / 2 + Math.sin(time * 22) * 0.5, l.yaw + Math.sin(time * 13) * 0.25, 0);
    } else {
      this.e.set(Math.PI / 2, this.player.state.heading + Math.PI / 2, 0);
    }
    this.m.compose(l.pos, this.q.setFromEuler(this.e), this.one);
    fish.add(l.item, this.m);
  }

  // ---------- Phase transitions ----------

  private startCast(hole: FishingHole): void {
    this.hole = hole;
    this.phase = 'casting';
    this.timer = 0;
    this.dwell = 0;
    this.player.rod.root.visible = true;
    this.bobberPos.set(hole.x, WATER_Y, hole.z);
    // Drop the float slightly toward the player so the line reads well.
    const p = this.player.state;
    const dx = p.x - hole.x;
    const dz = p.z - hole.z;
    const d = Math.hypot(dx, dz) || 1;
    this.bobberPos.x += (dx / d) * 0.15;
    this.bobberPos.z += (dz / d) * 0.15;
  }

  private updateCast(dt: number): void {
    this.timer += dt;
    if (this.timer >= F.castSwingTime + F.castFlightTime) {
      this.phase = 'waiting';
      this.timer = F.biteDelayMin + Math.random() * (F.biteDelayMax - F.biteDelayMin);
      this.fx.ripple(this.bobberPos.x, WATER_Y + 0.01, this.bobberPos.z, 0.55);
      this.fx.splash(this.bobberPos.x, WATER_Y, this.bobberPos.z, 5, 1.0);
    }
  }

  private startBite(): void {
    this.phase = 'bite';
    this.timer = F.hookWindow;
    this.hooked = rollFish(Math.random, fishingMods(this.state));
    this.fx.splash(this.bobberPos.x, WATER_Y, this.bobberPos.z, 10, 1.7);
    this.fx.ripple(this.bobberPos.x, WATER_Y + 0.01, this.bobberPos.z, 0.7);
    this.labels.pop(this.alert);
    vibrate(HapticsSettings.bite);
  }

  private hook(): void {
    if (this.phase !== 'bite' || !this.hooked) return;
    this.labels.show(this.alert, false);
    this.phase = 'reeling';
    this.reel = new ReelGame(this.hooked, Math.random, fishingMods(this.state));
    this.state.stats.reels++;
    this.gauge.open(this.hooked.species.greenZone, this.state.stats.reels <= F.reelHintCatches);
  }

  private miss(): void {
    this.labels.show(this.alert, false);
    this.showToast(t('missed'));
    this.hooked = null;
    this.toIdle(-F.missRecastDelay);
  }

  private updateReel(dt: number, reelKey: boolean): void {
    const reel = this.reel;
    if (!reel) return;
    const holding = this.touches.size > 0 || reelKey;
    const result = reel.update(dt, holding);
    this.gauge.update(reel.progress, reel.tension, reel.zone, reel.warning > 0);
    this.player.rod.reel.rotation.x -= holding ? dt * 18 : 0;

    // Tug feedback: splashes during the warning, a burst when the pull starts.
    this.splashTimer -= dt;
    if (reel.phase === 'warn' && this.splashTimer <= 0) {
      this.fx.splash(this.bobberPos.x, WATER_Y, this.bobberPos.z, 3, 1.2);
      this.splashTimer = 0.08;
    }
    if (reel.phase === 'pull' && this.lastWarn > 0) {
      this.fx.splash(this.bobberPos.x, WATER_Y, this.bobberPos.z, 9, 1.9);
      this.fx.ripple(this.bobberPos.x, WATER_Y + 0.01, this.bobberPos.z, 0.8, 0.6);
    }
    this.lastWarn = reel.warning;

    if (result === 'caught') this.catchFish();
    else if (result === 'snapped') this.snap();
  }

  private catchFish(): void {
    const hooked = this.hooked;
    if (!hooked) return;
    this.gauge.close();
    this.reel = null;
    this.hooked = null;
    this.phase = 'idle';
    this.dwell = 0;

    // State changes now; the fish is hidden on the stack until its flight lands.
    this.state.carried.push(hooked.item);
    this.state.stats.caught++;
    this.stack.hiddenTop++;
    const firstOfKind = !this.state.seen.includes(hooked.item.species);
    if (firstOfKind) this.state.seen.push(hooked.item.species);
    vibrate(firstOfKind ? HapticsSettings.newSpecies : HapticsSettings.catch);

    const p = this.player.state;
    const fwdX = Math.sin(p.heading);
    const fwdZ = Math.cos(p.heading);
    this.landing = {
      item: hooked.item,
      stage: 'arc',
      t: 0,
      from: this.bobberPos.clone(),
      spot: new THREE.Vector3(p.x + fwdX * 0.85, 0.12, p.z + fwdZ * 0.85),
      yaw: p.heading + Math.PI / 2,
      pos: this.bobberPos.clone(),
    };
    this.fx.splash(this.bobberPos.x, WATER_Y, this.bobberPos.z, 14, 2.2);
    this.fx.ripple(this.bobberPos.x, WATER_Y + 0.01, this.bobberPos.z, 0.9);
    this.showCard(hooked.item, firstOfKind);
  }

  private snap(): void {
    this.gauge.close();
    this.reel = null;
    this.hooked = null;
    this.phase = 'escaped';
    this.timer = 0.4;
    this.snapEnd.copy(this.bobberPos);
    this.bobber.visible = false;
    this.fx.splash(this.bobberPos.x, WATER_Y, this.bobberPos.z, 12, 2);
    this.showToast(t('escaped'));
    vibrate(HapticsSettings.lineBreak);
  }

  /** Stops the session right away (moved, left the ring, or dragged the finger). No penalty. */
  private cancel(): void {
    if (this.phase === 'bite') this.labels.show(this.alert, false);
    if (this.phase === 'reeling') this.gauge.close();
    this.reel = null;
    this.hooked = null;
    this.touches.clear();
    this.toIdle(0);
  }

  private toIdle(dwell: number): void {
    this.phase = 'idle';
    this.dwell = dwell;
    this.hole = null;
    this.bobber.visible = false;
    this.line.hide();
  }

  // ---------- Catch presentation ----------

  private updateLanding(dt: number, time: number): void {
    const l = this.landing;
    if (!l) return;
    const dur = l.stage === 'arc' ? F.landArcTime : l.stage === 'flop' ? F.landFlopTime : F.toStackTime;
    l.t = Math.min(l.t + dt / dur, 1);
    if (l.stage === 'arc') {
      arcPoint(l.pos, l.from, l.spot, l.t, 1.4);
    } else if (l.stage === 'flop') {
      l.pos.copy(l.spot);
      l.pos.y = 0.12 + Math.abs(Math.sin(time * 11)) * 0.14 * (1 - l.t * 0.6);
    } else {
      this.stack.topPosition(this.tmpV);
      arcPoint(l.pos, l.spot, this.tmpV, l.t, 0.8);
    }
    if (l.t < 1) return;
    if (l.stage === 'arc') {
      l.stage = 'flop';
      l.t = 0;
    } else if (l.stage === 'flop') {
      l.stage = 'toStack';
      l.t = 0;
    } else {
      this.landing = null;
      this.stack.hiddenTop = Math.max(this.stack.hiddenTop - 1, 0);
      vibrate(HapticsSettings.fishAdded);
    }
  }

  /** Catch card; the first fish of a species gets the bigger "New species!" version and stays longer. */
  private showCard(item: FishItem, firstOfKind: boolean): void {
    const s = FishById[item.species];
    const rarity = s.rarity;
    this.card.el.innerHTML = `${firstOfKind ? `<div class="card-new">${t('newSpecies')}</div>` : ''}
      <div class="card-name">${s.name[getLang()]}</div>
      <div class="card-kg">${item.kg.toFixed(2)} ${t('kg')} · <span class="card-price">${item.price}</span></div>
      <div class="card-rarity">${t(`rarity_${rarity}`)}</div>`;
    this.card.el.style.setProperty('--rarity', toCss(Palette[RarityColor[rarity]]));
    this.card.el.classList.toggle('new-species', firstOfKind);
    this.cardTimer = F.landArcTime + F.landFlopTime + (firstOfKind ? 1.6 : 0.2);
    this.labels.pop(this.card);
  }

  private showToast(text: string): void {
    this.toast.el.textContent = text;
    this.toastTimer = 1.1;
    this.labels.pop(this.toast);
  }

  private updateLabels(dt: number): void {
    const p = this.player.state;
    const head = 2.35;
    this.alert.anchor.set(p.x, head, p.z);
    this.fullLabel.anchor.set(p.x, head + 0.55, p.z);
    this.toast.anchor.set(p.x, head + 0.2, p.z);
    this.gauge.label.anchor.set(p.x, 1.5, p.z);
    this.gauge.label.offsetX = 105;

    if (this.landing) this.card.anchor.set(this.landing.spot.x, 1.2, this.landing.spot.z);
    if (this.cardTimer > 0) {
      this.cardTimer -= dt;
      if (this.cardTimer <= 0) this.labels.show(this.card, false);
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.labels.show(this.toast, false);
    }
  }

  // ---------- Rod, float and line ----------

  private updateVisuals(dt: number, time: number): void {
    const rod = this.player.rod;
    const k = damp(12, dt);
    let pitchTarget = 0.35;
    let bendTarget = 0;
    let armsTarget = 0;
    let leanTarget = 0;
    let armRaise = 0;
    const showRod = this.phase !== 'idle' || this.landing !== null || this.dwell < 0;

    switch (this.phase) {
      case 'casting': {
        armsTarget = 1;
        const swing = this.timer / F.castSwingTime;
        if (swing < 1) {
          // Wind back over the shoulder, then whip forward.
          this.rodPitch = swing < 0.5 ? 0.6 - swing * 2 * 1.1 : -0.5 + (swing - 0.5) * 2 * 1.8;
          armRaise = Math.sin(swing * Math.PI) * 0.9;
        }
        pitchTarget = 1.05;
        break;
      }
      case 'waiting':
        armsTarget = 1;
        pitchTarget = 1.0 + Math.sin(time * 1.6) * 0.03;
        bendTarget = 0.05;
        break;
      case 'bite':
        armsTarget = 1;
        pitchTarget = 1.2;
        bendTarget = 0.35 + Math.sin(time * 30) * 0.1;
        break;
      case 'reeling': {
        const r = this.reel;
        armsTarget = 1;
        const tension = r ? r.tension : 0;
        leanTarget = -0.1 - 0.18 * tension;
        pitchTarget = 0.85 - 0.25 * tension;
        bendTarget = tension * F.rodBendMax + (r && r.warning > 0 ? Math.sin(time * 45) * 0.12 : 0);
        break;
      }
      case 'escaped':
        armsTarget = 1;
        pitchTarget = 0.4;
        break;
      case 'idle':
        armsTarget = this.landing || this.dwell < 0 ? 1 : 0;
        pitchTarget = 0.3;
        break;
    }

    if (!(this.phase === 'casting' && this.timer < F.castSwingTime)) this.rodPitch += (pitchTarget - this.rodPitch) * k;
    this.rodBend += (bendTarget - this.rodBend) * damp(this.phase === 'reeling' ? 20 : 10, dt);
    this.armsForward += (armsTarget - this.armsForward) * k;
    this.lean += (leanTarget - this.lean) * k;

    rod.root.visible = showRod;
    rod.root.rotation.x = this.rodPitch;
    for (const seg of rod.segments) seg.rotation.x = this.rodBend / rod.segments.length;
    this.player.pose.armsForward = this.armsForward;
    this.player.pose.armRaise = armRaise;
    this.player.pose.lean = this.lean;

    this.updateFloatAndLine(time);
  }

  private updateFloatAndLine(time: number): void {
    if (this.phase === 'idle') {
      this.bobber.visible = false;
      this.line.hide();
      return;
    }
    this.player.object.updateMatrixWorld(true);
    this.player.rod.tip.getWorldPosition(this.tip);

    const b = this.bobber;
    const target = this.bobberPos;
    let sag = 0.3;
    let tremble = 0;

    switch (this.phase) {
      case 'casting': {
        const flight = (this.timer - F.castSwingTime) / F.castFlightTime;
        if (flight <= 0) {
          this.castFrom.copy(this.tip);
          b.position.copy(this.tip);
          sag = 0.02;
        } else {
          arcPoint(b.position, this.castFrom, target, Math.min(flight, 1), 1.0);
          sag = 0.1;
        }
        b.visible = true;
        break;
      }
      case 'waiting':
        b.visible = true;
        b.position.set(target.x, WATER_Y + Math.sin(time * 2.4) * 0.02, target.z);
        b.rotation.z = Math.sin(time * 1.7) * 0.12;
        break;
      case 'bite':
        b.visible = true;
        b.position.set(target.x + Math.sin(time * 40) * 0.02, WATER_Y - 0.1, target.z);
        sag = 0.12;
        break;
      case 'reeling': {
        const r = this.reel;
        const tension = r ? r.tension : 0;
        const pulling = r ? r.force : 0;
        const pull = (r ? r.progress : 0) * 0.3;
        this.tmpV.set(this.player.state.x - target.x, 0, this.player.state.z - target.z).normalize();
        b.visible = true;
        b.position.set(
          target.x + this.tmpV.x * pull + Math.sin(time * 35) * 0.03 * pulling,
          WATER_Y - 0.06 - pulling * 0.05,
          target.z + this.tmpV.z * pull + Math.cos(time * 31) * 0.03 * pulling,
        );
        sag = 0.3 * (1 - tension) + 0.01;
        tremble = tension > 0.55 ? (tension - 0.55) * 0.08 : 0;
        break;
      }
      case 'escaped': {
        // Broken line whips back toward the rod tip.
        const s = 1 - this.timer / 0.4;
        this.tmpV.lerpVectors(this.snapEnd, this.tip, Math.min(s * 1.2, 1));
        this.tmpV.y += Math.sin(s * Math.PI) * 0.8;
        this.line.set(this.tip, this.tmpV, 0.15 * (1 - s), 0.05 * (1 - s), time);
        return;
      }
    }
    this.line.set(this.tip, b.position, sag, tremble, time);
  }

  // ---------- Helpers ----------

  private distTo(h: FishingHole): number {
    return Math.hypot(this.player.state.x - h.x, this.player.state.z - h.z);
  }

  private nearestHole(): FishingHole | null {
    let best: FishingHole | null = null;
    let bestD: number = F.interactRadius;
    for (const h of this.holes()) {
      const d = this.distTo(h);
      if (d <= bestD) {
        best = h;
        bestD = d;
      }
    }
    return best;
  }
}
