import * as THREE from 'three';
import { CreatorFeel, DayFeel, SaveSettings } from '../settings';
import { Atmosphere } from '../render/Atmosphere';
import { DayCycle } from '../systems/DayCycle';
import { Banner } from '../ui/Banner';
import { DaySummary } from '../ui/DaySummary';
import { defaultAppearance, type Appearance } from '../content/appearance';
import { t } from '../content/strings';
import { IceShore, TeaserWalls } from '../content/zones';
import { Player } from '../entities/Player';
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
import { IntroSequence } from '../systems/IntroSequence';
import { NetStation } from '../systems/NetStation';
import { RegionOpening } from '../systems/RegionOpening';
import { RodBench } from '../systems/RodBench';
import { Selling } from '../systems/Selling';
import { Smokehouse } from '../systems/Smokehouse';
import { Unlocks, type UnlockSpot } from '../systems/Unlocks';
import { Workers } from '../systems/Workers';
import { CharacterCreator, type CreatorMode } from '../ui/CharacterCreator';
import { HUD } from '../ui/HUD';
import { SettingsPanel } from '../ui/SettingsPanel';
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
  private appearance: Appearance;
  /** False on a first start until "Start" is pressed: nothing is saved before that. */
  private saveEnabled: boolean;

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
  private readonly overlay: HTMLDivElement;
  private readonly fader: HTMLDivElement;
  private readonly creator: CharacterCreator;
  private readonly settings: SettingsPanel;
  private readonly intro: IntroSequence;
  private readonly day: DayCycle;
  private readonly atmosphere: Atmosphere;
  private readonly banner: Banner;
  private readonly summary: DaySummary;
  private wasNight: boolean;

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
    this.overlay = overlay;

    this.labels = new WorldLabels(overlay);
    this.settings = new SettingsPanel(overlay, () => this.openCreator('edit'));
    this.hud = new HUD(overlay, () => this.settings.open(this.appearance.name));
    this.joystick = new Joystick(overlay);
    this.input = new Input(this.joystick);
    this.creator = new CharacterCreator(container, this.renderer.canvas);
    this.fader = document.createElement('div');
    this.fader.className = 'fader';
    this.fader.style.setProperty('--fade-ms', `${CreatorFeel.fadeMs}ms`);
    container.appendChild(this.fader);

    const sky = addSkyAndFog(this.scene);
    const lights = addLighting(this.scene);
    this.banner = new Banner(overlay);
    this.summary = new DaySummary(overlay);

    const save = this.store.load();
    this.state = save?.game ?? createGameState();
    // Saves from Demo 0–3 have no appearance: use the default look and go straight in.
    this.appearance = save?.appearance ?? { ...defaultAppearance };
    this.saveEnabled = save !== null;
    const s = this.state;

    this.world = new WorldMap(s.unlocked, s.regions);
    this.scene.add(this.world.group);
    if (s.unlocked.includes('hut')) this.world.buildHut(null);

    const spawn = save?.player ?? { ...IceShore.playerSpawn, heading: 0 };
    this.player = new Player(this.appearance, spawn.x, spawn.z, spawn.heading);
    this.scene.add(this.player.object);

    this.snow = new Snowfall();
    this.intro = new IntroSequence(this.rig, this.snow, this.player, this.labels);
    this.day = new DayCycle(s, () => DayFeel.dayLength[DayFeel.defaultLength]);
    this.atmosphere = new Atmosphere(this.scene, this.rig.camera, lights, sky, this.world.waterMaterial, this.snow, this.day);
    this.wasNight = this.day.isNight;
    this.scene.add(this.snow.mesh, this.fx.group, this.fishRenderer.group, this.coinRenderer.mesh);

    // Gameplay systems
    this.stack = new CarryStack(s, this.player, this.labels);
    const gauge = new ReelGauge(this.labels);
    this.fishing = new FishingSystem(
      this.scene,
      () => this.world.openHoles,
      s,
      this.player,
      this.stack,
      this.fx,
      this.labels,
      gauge,
      () => ({ night: this.day.isNight, aurora: this.day.auroraActive, rareBonus: this.day.rareFishBonus }),
      () => this.banner.show(t('auroraBuff'), 'good'),
    );
    this.router = new TouchRouter(this.renderer.canvas, this.joystick, this.fishing);
    this.selling = new Selling(s, this.player, this.stack, this.fx);
    this.net = new NetStation(this.scene, s, this.player, this.stack, this.fx, this.labels, this.world, this.appear);
    if (s.unlocked.includes('net')) this.net.build(false);
    this.smoker = new Smokehouse(this.scene, s, this.player, this.stack, this.fx, this.world, this.appear);
    if (s.unlocked.includes('smokehouse')) this.smoker.build(false);
    this.workers = new Workers(this.scene, s, this.world, this.net, this.smoker, this.selling);
    this.coins = new CoinSystem(s, this.player);
    this.customers = new Customers(this.scene, this.selling, this.coins, s, () => this.day.customerRate);
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
      () => this.regionOpening.active || this.intro.active,
    );
    for (const tw of TeaserWalls) {
      const sign = this.labels.create('teaser-sign', t('comingSoon'));
      sign.anchor.set(tw.sign.x, 1.95, tw.sign.z);
      this.labels.show(sign, true);
    }
    this.hud.setCoins(this.coins.walletDisplay);

    this.renderer.onResize((w, h) => {
      this.rig.setAspect(w / h);
      this.creator.resize(w, h);
    });
    this.rig.snapTo(this.player.state.x, this.player.state.z);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
      else this.resume();
    });
    window.addEventListener('pagehide', () => this.save());
  }

  start(): void {
    // First start (no save): the character creator comes before anything else.
    if (!this.saveEnabled) this.showCreator('new');
    this.resume();
  }

  /** Character creator from the settings panel ("Edit character"). */
  private openCreator(mode: CreatorMode): void {
    this.fade(() => this.showCreator(mode));
  }

  private showCreator(mode: CreatorMode): void {
    this.router.enabled = false;
    this.input.reset();
    this.overlay.classList.add('hidden');
    this.creator.show(mode, this.appearance, (result) => this.fade(() => this.closeCreator(mode, result)));
  }

  private closeCreator(mode: CreatorMode, result: Appearance | null): void {
    this.creator.hide();
    this.overlay.classList.remove('hidden');
    this.time.reset();
    if (!result) return;
    this.appearance = result;
    this.player.setAppearance(result);
    if (mode === 'new') {
      this.saveEnabled = true;
      this.rig.snapTo(this.player.state.x, this.player.state.z);
      this.intro.start(result.name);
    }
    this.save();
  }

  /** Fades to snow white, runs `midway`, then fades back in. */
  private fade(midway: () => void): void {
    this.fader.classList.add('on');
    window.setTimeout(() => {
      midway();
      this.fader.classList.remove('on');
    }, CreatorFeel.fadeMs / 2);
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
    // While the creator is open the game world is neither updated nor drawn.
    if (this.creator.isOpen) {
      this.creator.update(this.time.delta, this.time.elapsed);
      this.renderer.render(this.creator.scene, this.creator.camera);
      return;
    }
    this.update(this.time.delta, this.time.elapsed);
    this.renderer.render(this.scene, this.rig.camera);
  };

  private update(dt: number, elapsed: number): void {
    // The region camera tour and the first-start intro lock the joystick.
    const locked = this.regionOpening.active || this.intro.active;
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

    this.updateDay(dt);
    this.intro.update(dt);
    if (this.regionOpening.active) this.regionOpening.update(dt);
    else this.rig.update(dt, this.player.state.x, this.player.state.z);
    this.atmosphere.update(dt, elapsed);
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

  /** Clock, day summary at dawn, storm and nightfall notices (GDD §12). */
  private updateDay(dt: number): void {
    const ev = this.day.update(dt);
    if (ev.dayEnded) {
      this.summary.show(ev.dayEnded.day, ev.dayEnded.totals, null);
      this.save();
    }
    if (ev.stormWarning) this.banner.show(t('stormWarning'), 'warn', 6);
    if (ev.stormEnded) this.banner.show(t('stormOver'), 'info');
    const night = this.day.isNight;
    if (night && !this.wasNight) this.banner.show(t('nightFalls'), 'info');
    this.wasNight = night;
    this.hud.setDay(this.day.day, night);
    this.banner.update(dt);
    this.summary.update(dt);
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
    if (!this.saveEnabled) return;
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
