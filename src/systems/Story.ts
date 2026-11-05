import * as THREE from 'three';
import type { PageId, PageTrigger } from '../content/story';
import { StoryLayout } from '../content/zones';
import { HapticsSettings, LandFeel } from '../settings';
import type { GameState } from '../core/GameState';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import { flat, mesh } from '../models/materials';
import { bake } from '../models/bake';
import { blobTexture } from '../render/BlobShadow';
import type { Effects } from '../render/Effects';
import { Palette } from '../render/Palette';
import type { PageCard } from '../ui/Journal';
import { findPage, mainPagesDue, pageFor } from './StoryLogic';
import { sfx } from '../audio/AudioEngine';

const H = StoryLayout.hidden;

/**
 * The captain's journal (GDD §15). Main pages come with progress (smokehouse, first crystal, first platter); the
 * others come from events (first avalanche chest, first scared bear) and a hidden marker behind the rocks. A page is
 * saved the moment it is found, then shown on the paper card; several wait in line.
 */
export class Story {
  private readonly queue: PageId[] = [];
  private readonly marker: THREE.Group;
  private readonly glowMat: THREE.MeshBasicMaterial;

  constructor(
    scene: THREE.Scene,
    private readonly state: GameState,
    private readonly player: Player,
    private readonly fx: Effects,
    private readonly card: PageCard,
    /** A page was found (the game reshows unlock frames that needed it and saves). */
    private readonly onFound: (id: PageId) => void,
  ) {
    // Hidden page: a rolled-up letter tucked against the rocks, glowing faintly when the player is near.
    const g = new THREE.Group();
    const roll = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6), flat(Palette.journalPaper), 0, 0.12, 0);
    roll.rotation.z = Math.PI / 2;
    g.add(roll, mesh(new THREE.BoxGeometry(0.06, 0.2, 0.2), flat(Palette.awning), 0, 0.12, 0));
    this.glowMat = new THREE.MeshBasicMaterial({ color: Palette.flameCore, map: blobTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), this.glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.04;
    this.marker = new THREE.Group();
    this.marker.add(bake(g), glow);
    this.marker.position.set(H.x, 0, H.z);
    this.marker.rotation.y = 0.6;
    this.marker.visible = !state.story.pages.includes('page6');
    scene.add(this.marker);
  }

  /** True while a page card is on screen (threats do not start meanwhile). */
  get reading(): boolean {
    return this.card.isOpen || this.queue.length > 0;
  }

  /** An event that may find a page (chest, bear). */
  event(trigger: PageTrigger): void {
    const id = pageFor(this.state, trigger);
    if (id) this.find(id);
  }

  update(dt: number, time: number): void {
    for (const id of mainPagesDue(this.state)) this.find(id);
    if (this.marker.visible) {
      const p = this.player.state;
      const d = Math.hypot(p.x - H.x, p.z - H.z);
      this.glowMat.opacity = d < H.glowRange ? (1 - d / H.glowRange) * (0.6 + Math.sin(time * 4) * 0.2) : 0;
      this.marker.position.y = Math.abs(Math.sin(time * 2)) * LandFeel.pageBob * (d < H.glowRange ? 1 : 0);
      if (d <= H.radius + 0.45) {
        this.marker.visible = false;
        this.fx.splash(H.x, 0.3, H.z, 10, 1.8);
        this.event('hiddenSpot');
      }
    }
    this.card.update(dt);
    if (!this.card.isOpen && this.queue.length > 0) {
      const next = this.queue[0] as PageId;
      vibrate(HapticsSettings.page);
      sfx('page');
      this.card.show(next, () => this.queue.shift());
    }
  }

  private find(id: PageId): void {
    if (this.state.story.pages.includes(id)) return;
    findPage(this.state, id);
    this.queue.push(id);
    this.onFound(id);
  }
}
