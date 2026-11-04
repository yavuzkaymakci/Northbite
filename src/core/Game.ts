import * as THREE from 'three';
import { SaveSettings } from '../settings';
import { t } from '../content/strings';
import { IceShore, TeaserWalls } from '../content/zones';
import { Player } from '../entities/Player';
import { defaultAppearance, type Appearance } from '../models/createPlayer';
import { CameraRig } from '../render/CameraRig';
import { CoinRenderer } from '../render/CoinRenderer';
import { Effects } from '../render/Effects';
import { FishRenderer } from '../render/FishRenderer';
import { addLighting, addSkyAndFog } from '../render/Lighting';
import { Renderer } from '../render/Renderer';
import { Snowfall } from '../render/Snowfall';
import { Appear } from '../systems/Appear';
import { CarryStack } from '../systems/CarryStack';
import { CoinSystem } from '../systems/Coins';
import { Customers } from '../systems/Customers';
import { FishingSystem } from '../systems/Fishing';
import { Guide } from '../systems/Guide';
import { NetStation } from '../systems/NetStation';
import { RegionOpening } from '../systems/RegionOpening';
import { RodBench } from '../systems/RodBench';
import { Selling } from '../systems/Selling';
import { Smokehouse } from '../systems/Smokehouse';
import { Unlocks, type UnlockSpot } from '../systems/Unlocks';
import { Workers } from '../systems/Workers';
import { HUD } from '../ui/HUD';
import { Joystick } from '../ui/Joystick';
import { ReelGauge } from '../ui/ReelGauge';
import { UpgradePanel } from '../ui/UpgradePanel';
import { WorldLabels } from '../ui/WorldLabels';
import { WorldMap } from '../world/Map';
import { createGameState, type GameState } from './GameState';
import { Input, type MoveInput } from './Input';
import { LocalSaveStore, SAVE_VERSION, type SaveData, type SaveStore } from './SaveStore';
import { Time } from './Time';
import { TouchRouter } from './TouchRouter';

const NO_MOVE: MoveInput = { x: 0, y: 0 };

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
  private readonly appear = new Appear();

  private readonly hud: HUD;
  private readonly labels: WorldLabels;
  private readonly joystick: Joystick;
  private readonly input: Input;
  private readonly router: TouchRouter;
  private readonly panel: UpgradePanel;

  private readonly stack: CarryStack;
  private readonly fishing: FishingSystem;
  private readonly selling: Selling;
  private readonly net: NetStation;
  private readonly smoker: Smokehouse;
  private readonly workers: Workers;
  private readonly coins: CoinSystem;
  private readonly customers: Customers;
  private readonly unlocks: Unlocks;
  private readonly regionOpening: RegionOpening;
  private readonly bench: RodBench;
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
    const s = this.state;

    this.world = new WorldMap(s.unlocked, s.regions);
    this.scene.add(this.world.group);
    if (s.unlocked.includes('hut')) this.world.buildHut(null);

    const spawn = save?.player ?? { ...IceShore.playerSpawn, heading: 0 };
    this.player = new Player(this.appearance ?? defaultAppearance, spawn.x, spawn.z, spawn.heading);
    this.scene.add(this.player.object);

    this.snow = new Snowfall();
    this.scene.add(this.snow.mesh, this.fx.group, this.fishRenderer.group, this.coinRenderer.mesh);

    // Gameplay systems
    this.stack = new CarryStack(s, this.player, this.labels);
    const gauge = new ReelGauge(this.labels);
    this.fishing = new FishingSystem(this.scene, () => this.world.openHoles, s, this.player, this.stack, this.fx, this.labels, gauge);
    this.router = new TouchRouter(this.renderer.canvas, this.joystick, this.fishing);
    this.selling = new Selling(s, this.player, this.stack, this.fx);
    this.net = new NetStation(this.scene, s, this.player, this.stack, this.fx, this.labels, this.world, this.appear);
    if (s.unlocked.includes('net')) this.net.build(false);
    this.smoker = new Smokehouse(this.scene, s, this.player, this.stack, this.fx, this.world, this.appear);
    if (s.unlocked.includes('smokehouse')) this.smoker.build(false);
    this.workers = new Workers(this.scene, s, this.world, this.net, this.smoker, this.selling);
    this.coins = new CoinSystem(s, this.player);
    this.customers = new Customers(this.scene, this.selling, this.coins);
    this.unlocks = new Unlocks(this.scene, s, this.player, this.coins, this.labels, this.appear, (spot) => this.onUnlock(spot));
    this.regionOpening = new RegionOpening(this.world, this.rig, this.fx, this.player, this.unlocks, () => this.save());
    this.panel = new UpgradePanel(overlay, (id) => this.bench.buy(id));
    this.bench = new RodBench(s, this.player, this.coins, this.panel);
    this.guide = new Guide(
      this.scene,
      s,
      this.stack,
      () => this.world.openHoles,
      () => this.fishing.active,
      this.unlocks,
      this.bench,
      () => this.regionOpening.active,
    );
    for (const tw of TeaserWalls) {
      const sign = this.labels.create('teaser-sign', t('comingSoon'));
      sign.anchor.set(tw.sign.x, 1.95, tw.sign.z);
      this.labels.show(sign, true);
    }
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
    // The camera tour of a newly opened region locks the joystick.
    const locked = this.regionOpening.active;
    this.router.enabled = !locked;
    this.input.update();
    const move = locked ? NO_MOVE : this.input.move;
    const moving = !locked && this.input.active;
    if (moving) this.hud.hideHint();

    this.player.update(dt, elapsed, move, this.world, this.fishing.facing);
    this.fishing.update(dt, elapsed, moving, !locked && this.input.reelKey);
    this.stack.update(dt);
    this.net.update(dt, elapsed);
    this.smoker.update(dt, elapsed);
    this.selling.update(dt);
    this.workers.update(dt, elapsed);
    this.customers.update(dt);
    this.coins.update(dt);
    this.unlocks.update(dt);
    this.bench.update(dt);
    this.appear.update(dt);

    if (locked) this.regionOpening.update(dt);
    else this.rig.update(dt, this.player.state.x, this.player.state.z);
    this.world.update(dt, elapsed);
    this.fx.update(dt);
    this.snow.update(dt, elapsed, this.rig.focusPoint);
    this.guide.update(elapsed);

    this.fishRenderer.begin();
    this.stack.render(this.fishRenderer, elapsed);
    this.selling.render(this.fishRenderer);
    this.customers.render(this.fishRenderer);
    this.fishing.render(this.fishRenderer, elapsed);
    this.net.render(this.fishRenderer);
    this.smoker.render(this.fishRenderer);
    this.workers.render(this.fishRenderer);
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

  private onUnlock(spot: UnlockSpot): void {
    for (const h of IceShore.holes) {
      if (h.unlock === spot.id) this.world.openHole(h.id, true);
    }
    for (const e of spot.zone?.effects ?? []) {
      if (e.kind === 'worker') this.workers.add();
      else if (e.station === 'net') this.net.build(true);
      else if (e.station === 'hut') this.world.buildHut(this.appear);
      else if (e.station === 'smokehouse') this.smoker.build(true);
    }
    if (spot.region) this.regionOpening.start(spot.region);
    this.save();
  }

  private save(): void {
    const p = this.player.state;
    const s = this.state;
    const data: SaveData = {
      saveVersion: SAVE_VERSION,
      savedAt: Date.now(),
      appearance: this.appearance,
      player: { x: p.x, z: p.z, heading: p.heading },
      // Fish still flying to the counter or the smokehouse rack are saved as if they had landed.
      game: {
        ...s,
        counter: [...s.counter, ...this.selling.pendingItems],
        smoker: { ...s.smoker, input: [...s.smoker.input, ...this.smoker.pendingInput] },
      },
    };
    this.store.save(data);
  }
}
