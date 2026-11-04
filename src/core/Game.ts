import * as THREE from 'three';
import { SaveSettings } from '../settings';
import { IceShore } from '../content/zones';
import { Player } from '../entities/Player';
import { defaultAppearance, type Appearance } from '../models/createPlayer';
import { CameraRig } from '../render/CameraRig';
import { CoinRenderer } from '../render/CoinRenderer';
import { Effects } from '../render/Effects';
import { FishRenderer } from '../render/FishRenderer';
import { addLighting, addSkyAndFog } from '../render/Lighting';
import { Renderer } from '../render/Renderer';
import { Snowfall } from '../render/Snowfall';
import { CarryStack } from '../systems/CarryStack';
import { CoinSystem } from '../systems/Coins';
import { Customers } from '../systems/Customers';
import { FishingSystem } from '../systems/Fishing';
import { Guide } from '../systems/Guide';
import { Selling } from '../systems/Selling';
import { Unlocks } from '../systems/Unlocks';
import { HUD } from '../ui/HUD';
import { Joystick } from '../ui/Joystick';
import { ReelGauge } from '../ui/ReelGauge';
import { WorldLabels } from '../ui/WorldLabels';
import { WorldMap } from '../world/Map';
import { createGameState, type GameState } from './GameState';
import { Input } from './Input';
import { LocalSaveStore, SAVE_VERSION, type SaveData, type SaveStore } from './SaveStore';
import { Time } from './Time';
import { TouchRouter } from './TouchRouter';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly renderer: Renderer;
  private readonly rig = new CameraRig();
  private readonly time = new Time();
  private readonly store: SaveStore = new LocalSaveStore();
  private readonly state: GameState;
  /** Null until the character creator exists (Demo 2); the default look is used meanwhile. */
  private readonly appearance: Appearance | null;

  private readonly world: WorldMap;
  private readonly player: Player;
  private readonly snow: Snowfall;
  private readonly fx = new Effects();
  private readonly fishRenderer = new FishRenderer();
  private readonly coinRenderer = new CoinRenderer();

  private readonly hud: HUD;
  private readonly labels: WorldLabels;
  private readonly joystick: Joystick;
  private readonly input: Input;
  private readonly router: TouchRouter;

  private readonly stack: CarryStack;
  private readonly fishing: FishingSystem;
  private readonly selling: Selling;
  private readonly coins: CoinSystem;
  private readonly customers: Customers;
  private readonly unlocks: Unlocks;
  private readonly guide: Guide;

  private running = false;
  private rafId = 0;
  private autosaveTimer = 0;

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);

    const overlay = document.createElement('div');
    overlay.className = 'ui-layer';
    container.appendChild(overlay);

    this.labels = new WorldLabels(overlay);
    this.hud = new HUD(overlay);
    this.joystick = new Joystick(overlay);
    this.input = new Input(this.joystick);

    addSkyAndFog(this.scene);
    addLighting(this.scene);

    const save = this.store.load();
    this.state = save?.game ?? createGameState();
    this.appearance = save?.appearance ?? null;

    this.world = new WorldMap(this.state.unlocked);
    this.scene.add(this.world.group);

    const spawn = save?.player ?? { ...IceShore.playerSpawn, heading: 0 };
    this.player = new Player(this.appearance ?? defaultAppearance, spawn.x, spawn.z, spawn.heading);
    this.scene.add(this.player.object);

    this.snow = new Snowfall();
    this.scene.add(this.snow.mesh, this.fx.group, this.fishRenderer.group, this.coinRenderer.mesh);

    // Gameplay systems
    this.stack = new CarryStack(this.state, this.player, this.labels);
    const gauge = new ReelGauge(this.labels);
    this.fishing = new FishingSystem(
      this.scene,
      () => this.world.openHoles,
      this.state,
      this.player,
      this.stack,
      this.fx,
      this.labels,
      gauge,
    );
    this.router = new TouchRouter(this.renderer.canvas, this.joystick, this.fishing);
    this.selling = new Selling(this.state, this.player, this.stack);
    this.coins = new CoinSystem(this.state, this.player);
    this.customers = new Customers(this.scene, this.selling, this.coins);
    this.unlocks = new Unlocks(this.scene, this.state, this.player, this.coins, this.labels, (id) => this.onUnlock(id));
    this.guide = new Guide(
      this.scene,
      this.state,
      this.stack,
      () => this.world.openHoles,
      () => this.fishing.active,
      () => this.unlocks.affordable(),
    );
    this.hud.setCoins(this.coins.walletDisplay);

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
    this.router.releaseAll();
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

    this.player.update(dt, elapsed, this.input.move, this.world, this.fishing.facing);
    this.fishing.update(dt, elapsed, this.input.active, this.input.reelKey);
    this.selling.update(dt);
    this.customers.update(dt);
    this.coins.update(dt);
    this.unlocks.update(dt);

    this.rig.update(dt, this.player.state.x, this.player.state.z);
    this.world.update(dt, elapsed);
    this.fx.update(dt);
    this.snow.update(dt, elapsed, this.rig.focusPoint);
    this.guide.update(elapsed);

    this.fishRenderer.begin();
    this.stack.render(this.fishRenderer, elapsed);
    this.selling.render(this.fishRenderer);
    this.customers.render(this.fishRenderer);
    this.fishing.render(this.fishRenderer, elapsed);
    this.fishRenderer.end();

    this.coinRenderer.begin();
    this.coins.render(this.coinRenderer, elapsed);
    this.coinRenderer.end();

    this.hud.setCoinTarget(this.coins.walletDisplay);
    this.hud.update(dt);
    this.labels.update(this.rig.camera, this.renderer.width, this.renderer.height);

    this.autosaveTimer += dt;
    if (this.autosaveTimer >= SaveSettings.autosaveIntervalSec) {
      this.autosaveTimer = 0;
      this.save();
    }
  }

  private onUnlock(zoneId: string): void {
    for (const h of IceShore.holes) {
      if (h.unlock === zoneId) this.world.openHole(h.id, true);
    }
    this.save();
  }

  private save(): void {
    const s = this.player.state;
    const data: SaveData = {
      saveVersion: SAVE_VERSION,
      savedAt: Date.now(),
      appearance: this.appearance,
      player: { x: s.x, z: s.z, heading: s.heading },
      // Fish still flying to the counter are saved as if they had landed.
      game: { ...this.state, counter: [...this.state.counter, ...this.selling.pendingItems] },
    };
    this.store.save(data);
  }
}
