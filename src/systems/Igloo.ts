import * as THREE from 'three';
import { t, tf } from '../content/strings';
import { IceShore } from '../content/zones';
import { HapticsSettings, SleepFeel } from '../settings';
import type { GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import { createFlatRingGeometry } from '../models/createFishingProps';
import { createBedProps, createIglooLevel, iglooTunnelStart, type BedModel, type IglooModel } from '../models/createIgloo';
import { blobTexture } from '../render/BlobShadow';
import type { CameraRig } from '../render/CameraRig';
import type { Effects } from '../render/Effects';
import type { FlameRenderer } from '../render/FlameRenderer';
import { createLightPool, NightLights } from '../render/NightLights';
import { Palette } from '../render/Palette';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';
import type { WorldMap } from '../world/Map';
import type { Appear } from './Appear';
import type { Collider } from './Collision';
import { canSleepAt, iglooDef, peaceScore } from './Rest';

const I = IceShore.igloo;
const B = IceShore.bed;

/**
 * The igloo and its bed ring (GDD §14). Four levels, each with its own look and collider; upgrading swaps the model
 * with a bounce, snow dust and a strong buzz. The bed lies outside the door: standing in its ring for
 * `SleepFeel.holdTime` at night asks the game to sleep. There is no interior.
 */
export class Igloo {
  private level = 0;
  private model: IglooModel | null = null;
  private bed: BedModel | null = null;
  private colliders: Collider[] = [];
  private readonly group = new THREE.Group();
  private readonly doorPool: THREE.Mesh;
  private readonly doorGlow: THREE.Mesh;
  private readonly stovePool: THREE.Mesh;
  private readonly hearthMat: THREE.MeshBasicMaterial;
  private readonly hearthPool: THREE.Mesh;
  private readonly glassMat: THREE.MeshStandardMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly label: WorldLabel;
  private readonly textEl: HTMLElement;
  private readonly peaceEl: HTMLElement;
  private lastText = '';
  private stand = 0;
  private blockedShown = false;
  private smokeTimer = 0;
  private readonly aurora = new THREE.Color(Palette.auroraGreen);
  private readonly auroraB = new THREE.Color(Palette.auroraPurple);

  constructor(
    scene: THREE.Scene,
    private readonly state: GameState,
    private readonly player: Player,
    private readonly world: WorldMap,
    private readonly fx: Effects,
    private readonly rig: CameraRig,
    private readonly labels: WorldLabels,
    private readonly appear: Appear,
  ) {
    scene.add(this.group);
    // Warm light at the door; it grows with the level.
    this.doorGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 8, 1, false, -Math.PI / 2, Math.PI), NightLights.window);
    this.doorGlow.rotation.x = -Math.PI / 2;
    this.doorPool = createLightPool(2.6, 1.8);
    this.stovePool = createLightPool(2.4, 2.4);
    this.stovePool.position.set(B.stove.x, 0.045, B.stove.z + 0.4);
    // The fireplace (level 4) flickers on its own.
    this.hearthMat = new THREE.MeshBasicMaterial({
      color: Palette.nightGlow,
      map: blobTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.hearthPool = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), this.hearthMat);
    this.hearthPool.rotation.x = -Math.PI / 2;
    this.hearthPool.position.set(B.stove.x + 0.6, 0.05, B.stove.z + 0.5);
    this.glassMat = new THREE.MeshStandardMaterial({
      color: Palette.glassRoof,
      transparent: true,
      opacity: 0.45,
      roughness: 0.15,
      flatShading: true,
      emissive: Palette.auroraGreen,
      emissiveIntensity: 0,
    });
    this.group.add(this.doorGlow, this.doorPool, this.stovePool, this.hearthPool);

    // Bed ring
    this.ringMat = new THREE.MeshBasicMaterial({ color: Palette.bedRing, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(createFlatRingGeometry(B.radius, B.radius - 0.14, 32), this.ringMat);
    ring.position.set(B.x, 0.03, B.z);
    this.group.add(ring);
    this.label = labels.create('bed-label', '<div class="bed-text"></div><div class="bed-peace"></div>');
    this.label.anchor.set(B.x, 1.6, B.z);
    this.label.clampX = true;
    this.textEl = this.label.el.querySelector('.bed-text') as HTMLElement;
    this.peaceEl = this.label.el.querySelector('.bed-peace') as HTMLElement;
    this.build(state.iglooLevel, false);
  }

  /** Swaps to a new level (unlock frame). */
  upgrade(level: number): void {
    this.build(level, true);
  }

  /**
   * Bed ring and visuals. `sleepBlock` tells why sleeping is not possible right now (a threat), or null.
   * Returns true on the frame the player falls asleep.
   */
  update(dt: number, time: number, locked: boolean, sleepBlock: () => string | null): boolean {
    const night = NightLights.level;
    const lv = this.level;
    // Lights grow with the level; the fireplace flickers.
    const flicker = 0.8 + Math.sin(time * 11) * 0.1 + Math.sin(time * 23) * 0.07 + Math.random() * 0.05;
    this.stovePool.visible = night > 0.01 && lv >= 2 && lv < 4;
    this.hearthMat.opacity = lv >= 4 ? night * 0.7 * flicker : 0;
    this.hearthPool.visible = lv >= 4 && night > 0.01;
    if (this.model?.glass) {
      const k = 0.5 + 0.5 * Math.sin(time * 0.6);
      this.glassMat.emissive.copy(this.aurora).lerp(this.auroraB, k);
      this.glassMat.emissiveIntensity = night * 0.9;
      this.glassMat.opacity = 0.35 + night * 0.35;
    }
    this.smokeTimer -= dt;
    if (this.model?.chimneyTop && this.smokeTimer <= 0) {
      this.smokeTimer = SleepFeel.chimneyInterval * (0.7 + Math.random() * 0.6);
      const c = this.model.chimneyTop;
      this.fx.smoke(I.x + c.x, c.y, I.z + c.z, lv >= 4 ? 0.26 : 0.16);
    }

    // Bed ring
    const p = this.player.state;
    const d = Math.hypot(p.x - B.x, p.z - B.z);
    const inside = !locked && d <= B.radius;
    const canSleep = canSleepAt(this.state.clock.t);
    this.ringMat.opacity = canSleep ? 0.55 + Math.sin(time * 3) * 0.25 : 0.25;
    let asleep = false;
    let text = '';
    if (inside && canSleep) {
      const block = sleepBlock();
      if (block) {
        this.stand = 0;
        text = block;
        if (!this.blockedShown) {
          this.blockedShown = true;
          vibrate(HapticsSettings.lineBreak);
        }
      } else {
        this.stand += dt;
        text = t('sleepAction');
        if (this.stand >= SleepFeel.holdTime) {
          this.stand = 0;
          asleep = true;
        }
      }
    } else {
      this.stand = 0;
      if (!inside) this.blockedShown = false;
      text = canSleep ? t('sleepAction') : t('sleepNightOnly');
    }
    const showLabel = !locked && d <= SleepFeel.labelRange;
    this.labels.show(this.label, showLabel);
    if (showLabel) {
      if (text !== this.lastText) {
        this.textEl.textContent = text;
        this.lastText = text;
      }
      this.peaceEl.textContent = tf('peaceLabel', { n: peaceScore(this.state) });
      this.label.el.style.setProperty('--p', (this.stand / SleepFeel.holdTime).toFixed(3));
      this.label.el.classList.toggle('night', canSleep);
    }
    return asleep;
  }

  /** Stove (levels 2–3) and fireplace (level 4) flames. */
  addFlames(flames: FlameRenderer, time: number): void {
    const f = this.bed?.fire;
    if (!f) return;
    flames.add(B.x + f.x, f.y, B.z + f.z, this.level >= 4 ? 0.85 : 0.35, time, 21);
    if (this.level >= 4) flames.add(B.x + f.x + 0.18, f.y, B.z + f.z, 0.6, time, 24);
  }

  private build(level: number, animate: boolean): void {
    if (level === this.level) return;
    this.level = level;
    const def = iglooDef(level);
    if (this.model) this.group.remove(this.model.root);
    if (this.bed) this.group.remove(this.bed.root);
    this.model = createIglooLevel(level, def.radius, def.tunnelLength, def.tunnelWidth, this.glassMat, NightLights.window);
    this.model.root.position.set(I.x, 0, I.z);
    const local = (p: { x: number; z: number }) => ({ x: p.x - B.x, z: p.z - B.z });
    this.bed = createBedProps(level, local(B.stove), local(B.lamp), NightLights.window);
    this.bed.root.position.set(B.x, 0, B.z);
    this.group.add(this.model.root, this.bed.root);

    // Door light follows the tunnel; brighter and wider at higher levels.
    const doorZ = I.z + iglooTunnelStart(def.radius) + def.tunnelLength;
    this.doorGlow.position.set(I.x, 0, doorZ + 0.05);
    this.doorGlow.scale.setScalar(def.tunnelWidth / 1.5);
    this.doorPool.position.set(I.x, 0.04, doorZ + 0.9);
    const k = 1 + (level - 1) * 0.3;
    this.doorPool.scale.set(k, k, 1);

    // Colliders: dome, tunnel and (level 2+) the stove / fireplace. The player is pushed out by the normal
    // collision pass next frame; a fresh collider never traps anyone (circles push radially).
    for (const c of this.colliders) this.world.removeCollider(c);
    const tunnelStart = iglooTunnelStart(def.radius);
    this.colliders = [
      { kind: 'circle', x: I.x, z: I.z, r: def.radius * 0.97 },
      {
        kind: 'rect',
        minX: I.x - def.tunnelWidth / 2,
        maxX: I.x + def.tunnelWidth / 2,
        minZ: I.z + tunnelStart,
        maxZ: I.z + tunnelStart + def.tunnelLength + 0.05,
      },
    ];
    if (level >= 2) this.colliders.push({ kind: 'circle', x: B.stove.x, z: B.stove.z, r: level >= 4 ? 0.55 : 0.35 });
    for (const c of this.colliders) this.world.addCollider(c);

    if (animate) {
      this.appear.add(this.model.root);
      this.appear.add(this.bed.root, 0.15);
      for (let i = 0; i < SleepFeel.upgradePuffs; i++) {
        const a = (i / SleepFeel.upgradePuffs) * Math.PI * 2;
        this.fx.snowPuff(I.x + Math.cos(a) * def.radius, 0.3, I.z + Math.sin(a) * def.radius, 0.7, 0.2);
      }
      this.fx.splash(I.x, 2, I.z, 24, 3);
      this.rig.shake(SleepFeel.upgradeShake);
      vibrate(HapticsSettings.iglooUpgrade);
    }
  }
}
