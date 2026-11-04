import * as THREE from 'three';
import { SaveSettings } from '../settings';
import { IceShore } from '../content/zones';
import { Player } from '../entities/Player';
import { defaultAppearance, type Appearance } from '../models/createPlayer';
import { CameraRig } from '../render/CameraRig';
import { addLighting, addSkyAndFog } from '../render/Lighting';
import { Renderer } from '../render/Renderer';
import { Snowfall } from '../render/Snowfall';
import { HUD } from '../ui/HUD';
import { Joystick } from '../ui/Joystick';
import { WorldMap } from '../world/Map';
import { Input } from './Input';
import { LocalSaveStore, SAVE_VERSION, type SaveData, type SaveStore } from './SaveStore';
import { Time } from './Time';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly renderer: Renderer;
  private readonly rig = new CameraRig();
  private readonly time = new Time();
  private readonly world: WorldMap;
  private readonly player: Player;
  private readonly snow: Snowfall;
  private readonly hud: HUD;
  private readonly joystick: Joystick;
  private readonly input: Input;
  private readonly store: SaveStore = new LocalSaveStore();
  /** Null until the character creator exists (Demo 2); the default look is used meanwhile. */
  private readonly appearance: Appearance | null;

  private running = false;
  private rafId = 0;
  private autosaveTimer = 0;

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);

    const overlay = document.createElement('div');
    overlay.className = 'ui-layer';
    container.appendChild(overlay);

    this.hud = new HUD(overlay);
    // The canvas receives touches; the overlay ignores pointer events except for its buttons.
    this.joystick = new Joystick(this.renderer.canvas, overlay);
    this.input = new Input(this.joystick);

    addSkyAndFog(this.scene);
    addLighting(this.scene);

    this.world = new WorldMap();
    this.scene.add(this.world.group);

    const save = this.store.load();
    this.appearance = save?.appearance ?? null;
    const spawn = save?.player ?? { ...IceShore.playerSpawn, heading: 0 };
    this.player = new Player(this.appearance ?? defaultAppearance, spawn.x, spawn.z, spawn.heading);
    this.scene.add(this.player.object);

    this.snow = new Snowfall();
    this.scene.add(this.snow.mesh);

    this.renderer.onResize((w, h) => this.rig.setAspect(w / h));
    this.rig.snapTo(this.player.state.x, this.player.state.z);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
      else this.resume();
    });
    window.addEventListener('pagehide', () => this.save());
  }

  start(): void {
    this.resume();
  }

  private resume(): void {
    if (this.running) return;
    this.running = true;
    this.time.reset();
    this.rafId = requestAnimationFrame(this.frame);
  }

  private pause(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.input.reset();
    this.save();
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    this.time.tick(now);
    this.update(this.time.delta, this.time.elapsed);
    this.renderer.render(this.scene, this.rig.camera);
  };

  private update(dt: number, elapsed: number): void {
    this.input.update();
    if (this.input.active) this.hud.hideHint();

    this.player.update(dt, elapsed, this.input.move, this.world);
    this.rig.update(dt, this.player.state.x, this.player.state.z);
    this.world.update(dt, elapsed);
    this.snow.update(dt, elapsed, this.rig.focusPoint);
    this.hud.update(dt);

    this.autosaveTimer += dt;
    if (this.autosaveTimer >= SaveSettings.autosaveIntervalSec) {
      this.autosaveTimer = 0;
      this.save();
    }
  }

  private save(): void {
    const s = this.player.state;
    const data: SaveData = {
      saveVersion: SAVE_VERSION,
      savedAt: Date.now(),
      appearance: this.appearance,
      player: { x: s.x, z: s.z, heading: s.heading },
    };
    this.store.save(data);
  }
}
