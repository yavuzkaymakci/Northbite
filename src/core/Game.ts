import * as THREE from 'three';
import { CreatorFeel, DayFeel, QualitySettings, ReadabilityFeel, SaveSettings, TutorialFeel } from '../settings';
import { applyShading, View } from '../render/Quality';
import { QualityPrompt } from '../ui/QualityPrompt';
import { panels } from '../ui/PanelManager';
import { DebugBar, type DebugAction } from '../ui/DebugBar';
import { DebugTools } from '../settings';
import { Atmosphere } from '../render/Atmosphere';
import { DayCycle, type DayEvents } from '../systems/DayCycle';
import { Decorations } from '../systems/Decorations';
import { Igloo } from '../systems/Igloo';
import { applyComfortUnlock, canSleepAt, peaceScore, restedLeft, wakeRested } from '../systems/Rest';
import { SleepSequence } from '../systems/SleepSequence';
import { Banner } from '../ui/Banner';
import { DaySummary } from '../ui/DaySummary';
import { defaultAppearance, type Appearance } from '../content/appearance';
import { Sleep } from '../content/igloo';
import { getLang, setLang, t, tf } from '../content/strings';
import { setVibration } from './Haptics';
import { audio, sfx } from '../audio/AudioEngine';
import { AmbienceDirector, MusicDirector } from '../audio/Music';
import { CampLayout } from '../content/zones';
import { CaveLayout, IceShore, TeaserWalls, type Vec2 } from '../content/zones';
import { Cave } from '../systems/Cave';
import { Camp } from '../systems/Camp';
import { Story } from '../systems/Story';
import { GoodsRenderer } from '../render/GoodsRenderer';
import { Journal, PageCard } from '../ui/Journal';
import { OfflinePanel } from '../ui/OfflinePanel';
import { Codex } from '../ui/Codex';
import { OrderPanel } from '../ui/OrderPanel';
import { OrderBoard } from '../systems/OrderBoard';
import { grantReward, rewardsDue } from '../systems/CodexLogic';
import type { DecorationId } from '../content/decorations';
import type { StringKey } from '../content/strings';
import { Economy } from '../content/economy';
import { applyOffline } from '../systems/Offline';
import { offlineCapHours } from '../systems/StationUpgrades';
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
import { Threats } from '../systems/Threats';
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
  private readonly threats: Threats;
  private readonly igloo: Igloo;
  private readonly decorations: Decorations;
  private readonly sleep: SleepSequence;
  private readonly cave: Cave;
  private readonly camp: Camp;
  private readonly story: Story;
  private readonly journal: Journal;
  private readonly goods = new GoodsRenderer();
  private readonly music = new MusicDirector();
  private readonly ambience = new AmbienceDirector();
  private readonly offline: OfflinePanel;
  private readonly codex: Codex;
  private readonly orderPanel: OrderPanel;
  private readonly board: OrderBoard;

  private running = false;
  private rafId = 0;
  private autosaveTimer = 0;
  private readonly qualityPrompt: QualityPrompt;
  private readonly debugBar: DebugBar;
  /** Slow-device watch (GDD §22): frames in the current one-second window, seconds in a row below the limit. */
  private fpsFrames = 0;
  private fpsWindowStart = -1;
  private slowFor = 0;
  private fpsGraceUntil = 0;
  private shadingTimer = 0;
  private dimmed = false;

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);

    // The save comes first: its settings (language, vibration) apply before any UI is built.
    const save = this.store.load();
    this.state = save?.game ?? createGameState();
    // Saves from Demo 0–3 have no appearance: use the default look and go straight in.
    this.appearance = save?.appearance ?? { ...defaultAppearance };
    this.saveEnabled = save !== null;
    const s = this.state;
    if (s.prefs.lang) setLang(s.prefs.lang);
    setVibration(s.prefs.vibration);
    // Sound starts on the first touch (mobile browsers need a gesture), never while muted (GDD §21).
    audio.configure(s.prefs.audio);
    audio.attach();
    // Every panel opens and closes through one manager (GDD §23): Escape / Android back, outside taps.
    panels.attach();
    // Quality and "reduce motion" are read by the renderers while the world is built.
    View.quality = s.prefs.quality;
    this.applyMotion();

    const overlay = document.createElement('div');
    overlay.className = 'ui-layer';
    container.appendChild(overlay);
    this.overlay = overlay;

    this.labels = new WorldLabels(overlay);
    this.settings = new SettingsPanel(
      overlay,
      () => this.openCreator('edit'),
      (key) => this.applyPref(key),
      (final) => {
        audio.configure(this.state.prefs.audio);
        if (final) this.save();
      },
    );
    this.hud = new HUD(
      overlay,
      () => this.settings.open(this.appearance.name, peaceScore(this.state), this.state.prefs, getLang(), this.state.codex.title ? t('titleMaster') : ''),
      () => this.journal.open(this.state.story.pages),
      () => this.codex.open(this.state),
      () => this.board.openRemote(),
    );
    this.codex = new Codex(overlay);
    this.orderPanel = new OrderPanel(
      overlay,
      (id) => this.board.deliver(id),
      (id) => this.board.swap(id),
    );
    this.journal = new Journal(overlay);
    this.offline = new OfflinePanel(overlay);
    this.joystick = new Joystick(overlay);
    this.input = new Input(this.joystick);
    this.creator = new CharacterCreator(container, this.renderer.canvas);
    this.sleep = new SleepSequence(container);
    this.fader = document.createElement('div');
    this.fader.className = 'fader';
    this.fader.style.setProperty('--fade-ms', `${CreatorFeel.fadeMs}ms`);
    container.appendChild(this.fader);

    const sky = addSkyAndFog(this.scene);
    const lights = addLighting(this.scene);
    this.banner = new Banner(overlay);
    this.summary = new DaySummary(overlay);

    this.world = new WorldMap(s.unlocked, s.regions);
    this.scene.add(this.world.group);
    if (s.unlocked.includes('hut')) this.world.buildHut(null);

    const spawn = save?.player ?? { ...IceShore.playerSpawn, heading: 0 };
    this.player = new Player(this.appearance, spawn.x, spawn.z, spawn.heading);
    this.scene.add(this.player.object);
    this.igloo = new Igloo(this.scene, s, this.player, this.world, this.fx, this.rig, this.labels, this.appear);
    this.decorations = new Decorations(this.scene, s, this.world, this.fx, this.appear);

    this.snow = new Snowfall();
    this.intro = new IntroSequence(this.rig, this.snow, this.player, this.labels);
    // Day length comes from the settings; the clock is a fraction of the day, so changing it keeps the time of day.
    this.day = new DayCycle(s, () => DayFeel.dayLength[this.state.prefs.dayLength]);
    this.atmosphere = new Atmosphere(this.scene, this.rig.camera, lights, sky, this.world.waterMaterial, this.snow, this.day);
    this.wasNight = this.day.isNight;
    this.scene.add(this.snow.mesh, this.fx.group, this.fishRenderer.group, this.coinRenderer.mesh, this.goods.group);

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
    this.selling = new Selling(s, this.player, this.stack, this.fx);
    this.net = new NetStation(this.scene, s, this.player, this.stack, this.fx, this.labels, this.world, this.appear);
    if (s.unlocked.includes('net')) this.net.build(false);
    this.smoker = new Smokehouse(this.scene, s, this.player, this.stack, this.fx, this.world, this.appear);
    if (s.unlocked.includes('smokehouse')) this.smoker.build(false);
    this.workers = new Workers(this.scene, s, this.world, this.net, this.smoker, this.selling);
    this.coins = new CoinSystem(s, this.player);
    this.customers = new Customers(this.scene, this.selling, this.coins, s, () => this.day.customerRate);
    this.cave = new Cave(this.scene, s, this.player, this.stack, this.world, this.fx, this.labels, this.banner, this.coins, this.appear);
    this.camp = new Camp(this.scene, s, this.player, this.stack, this.world, this.fx, this.labels, this.coins, this.appear);
    // The fishing mini-game and mining on a crystal vein take touches before the joystick.
    this.router = new TouchRouter(this.renderer.canvas, this.joystick, [this.fishing, this.cave], (id) => panels.takesPointer(id));
    this.threats = new Threats({
      scene: this.scene,
      overlay,
      state: s,
      player: this.player,
      stack: this.stack,
      world: this.world,
      workers: this.workers,
      net: this.net,
      smoker: this.smoker,
      coins: this.coins,
      fx: this.fx,
      rig: this.rig,
      labels: this.labels,
      banner: this.banner,
      appear: this.appear,
      onBearScared: () => this.story.event('bearScared'),
      onChestOpened: () => this.story.event('avalancheChest'),
      campPlates: () => (this.state.unlocked.includes('kitchen') ? this.state.camp.plates.length : null),
    });
    this.unlocks = new Unlocks(this.scene, s, this.player, this.coins, this.labels, this.appear, (spot) => this.onUnlock(spot));
    this.regionOpening = new RegionOpening(this.world, this.rig, this.fx, this.player, this.unlocks, () => this.save());
    this.panel = new UpgradePanel(overlay, (kind, id) => this.bench.buy(kind, id));
    this.bench = new RodBench(s, this.player, this.coins, this.panel);
    this.guide = new Guide(
      this.scene,
      s,
      this.stack,
      () => this.world.openHoles,
      () => this.fishing.active,
      this.unlocks,
      this.bench,
      () => this.regionOpening.active || this.intro.active || this.sleep.active,
      () => (this.sleepHintActive ? IceShore.bed : null),
      () => this.landTarget(),
    );
    this.board = new OrderBoard(this.scene, s, this.player, this.stack, this.world, this.fx, this.labels, this.banner, this.appear, this.orderPanel);
    // Journal pages (GDD §15): a found page can open a new deed frame.
    this.story = new Story(this.scene, s, this.player, this.fx, new PageCard(overlay), () => {
      this.unlocks.refresh(true);
      this.save();
    });
    for (const tw of TeaserWalls) {
      const sign = this.labels.create('teaser-sign', t('comingSoon'));
      sign.anchor.set(tw.sign.x, 1.95, tw.sign.z);
      this.labels.show(sign, true);
    }
    this.hud.setCoins(this.coins.walletDisplay);
    this.hud.setFpsVisible(s.prefs.showFps);
    // The visual hints are for the first minutes only (GDD §22).
    if (s.stats.playTime >= TutorialFeel.seconds) this.hud.hideHint();
    this.qualityPrompt = new QualityPrompt(overlay);
    this.debugBar = new DebugBar(overlay, (a) => this.debugAction(a));
    this.debugBar.setVisible(s.prefs.debugTools);
    this.applyQuality();

    this.renderer.onResize((w, h) => {
      this.rig.setAspect(w / h);
      this.creator.resize(w, h);
      this.codex.resize(w, h);
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
    audio.setHidden(false);
    this.time.reset();
    this.fpsWindowStart = -1;
    this.slowFor = 0;
    this.fpsGraceUntil = performance.now() + QualitySettings.lowFpsGrace * 1000;
    this.checkOffline();
    this.rafId = requestAnimationFrame(this.frame);
  }

  private pause(): void {
    if (!this.running) return;
    this.running = false;
    audio.setHidden(true);
    cancelAnimationFrame(this.rafId);
    this.router.releaseAll();
    this.input.reset();
    this.save();
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    this.time.tick(now);
    this.watchFps(now);
    // While the creator is open the game world is neither updated nor drawn.
    if (this.creator.isOpen) {
      this.creator.update(this.time.delta, this.time.elapsed);
      this.renderer.render(this.creator.scene, this.creator.camera);
      return;
    }
    this.update(this.time.delta, this.time.elapsed);
    // The encyclopedia covers the screen: the world keeps running but only its little model scene is drawn.
    this.overlay.classList.toggle('codex-open', this.codex.isOpen);
    if (this.codex.isOpen) {
      this.codex.update(this.time.delta);
      this.renderer.render(this.codex.scene, this.codex.camera);
      return;
    }
    this.renderer.render(this.scene, this.rig.camera);
  };

  private update(dt: number, elapsed: number): void {
    // The region camera tour, the first-start intro and falling asleep lock the joystick.
    const locked = this.regionOpening.active || this.intro.active || this.sleep.active;
    // Panels first: a contextual panel closes when locked or out of its ring, and game touches are off while a modal
    // or contextual panel is open (turning them off lets go of every held pointer).
    panels.update(locked);
    this.router.enabled = !locked && !panels.blocking;
    this.input.update();
    const move = locked ? NO_MOVE : this.input.move;
    const moving = !locked && this.input.active;
    if (moving) this.hud.hideHint();

    const step0 = Math.floor(this.player.walkPhase / Math.PI);
    this.player.update(dt, elapsed, move, this.world, this.fishing.facing);
    audio.setListener(this.player.state.x, this.player.state.z);
    // Footsteps crunch in the snow.
    if (Math.floor(this.player.walkPhase / Math.PI) !== step0) sfx('snowStep', undefined, 0.9 + Math.random() * 0.2);
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
    this.state.stats.playTime += dt;
    this.threats.update(dt, elapsed, {
      locked,
      holding: !locked && (this.joystick.activePointer !== null || this.input.reelKey),
      night: this.day.isNight,
      fishing: this.fishing.active,
      quiet: this.story.reading || this.codex.isOpen,
    });
    if (this.igloo.update(dt, elapsed, locked, () => this.threats.sleepBlocker())) this.fallAsleep();
    this.cave.update(dt, moving, !locked && this.input.reelKey);
    if (this.cave.swinging) {
      const pose = this.player.pose;
      pose.armsForward = 1;
      pose.armRaise = 0.6 + Math.sin(elapsed * 9) * 0.6;
      pose.lean = 0.1 + Math.sin(elapsed * 9) * 0.1;
    }
    this.camp.update(dt, elapsed);
    this.story.update(dt, elapsed);
    this.board.update(dt, locked);
    this.updateCodex(dt);
    this.updateSound(dt);
    this.sleep.update(dt);

    this.updateDay(dt);
    this.intro.update(dt);
    if (this.regionOpening.active) this.regionOpening.update(dt);
    else this.rig.update(dt, this.player.state.x, this.player.state.z);
    this.atmosphere.update(dt, elapsed);
    this.updateLook(dt);
    this.world.update(dt, elapsed);
    this.fx.update(dt);
    this.snow.update(dt, elapsed, this.rig.focusPoint);
    this.guide.update(elapsed);

    this.goods.begin();
    this.fishRenderer.begin(elapsed);
    this.stack.render(this.fishRenderer, elapsed, this.goods);
    this.cave.render(this.goods, elapsed);
    this.camp.render(this.fishRenderer, this.goods);
    this.selling.render(this.fishRenderer);
    this.customers.render(this.fishRenderer);
    this.fishing.render(this.fishRenderer, elapsed);
    this.net.render(this.fishRenderer);
    this.smoker.render(this.fishRenderer);
    this.workers.render(this.fishRenderer);
    this.threats.render(this.fishRenderer, elapsed, (flames) => this.igloo.addFlames(flames, elapsed));
    this.fishRenderer.end();
    this.goods.end();

    this.coinRenderer.begin();
    this.coins.render(this.coinRenderer, elapsed);
    this.coinRenderer.end();

    this.hud.setCoinTarget(this.coins.walletDisplay);
    this.hud.setSideButtons(this.state.codex.fresh.length > 0, this.board.isBuilt, this.board.deliverable);
    this.hud.setTorches(this.threats.buildings.isBuilt('torchStand') ? this.state.threats.torches : -1);
    const left = restedLeft(this.state);
    this.hud.setRested(left > 0 ? (this.state.rested?.quality ?? 0) : 0, Math.ceil((left * DayFeel.dayLength[this.state.prefs.dayLength]) / 60));
    this.hud.update(dt);
    this.debugBar.update(dt);
    this.labels.update(this.rig.camera, this.renderer.width, this.renderer.height);
    this.threats.updateArrow(this.rig.camera, this.renderer.width, this.renderer.height);

    this.autosaveTimer += dt;
    if (this.autosaveTimer >= SaveSettings.autosaveIntervalSec) {
      this.autosaveTimer = 0;
      this.save();
    }
  }

  /** Clock, day summary at dawn, storm and nightfall notices (GDD §12), the one-time bed hint (GDD §14). */
  private updateDay(dt: number): void {
    // The clock stands still while the screen is dark (the jump happens in fallAsleep).
    if (!this.sleep.active) this.dayEvents(this.day.update(dt));
    const night = this.day.isNight;
    if (night && !this.wasNight) this.banner.show(t('nightFalls'), 'info');
    this.wasNight = night;
    const s = this.state.sleep;
    if (!s.hintDone && s.hintDay !== this.day.day && canSleepAt(this.day.t) && this.state.stats.sold > 0) {
      s.hintDay = this.day.day;
      this.banner.show(t('sleepHint'), 'info', 5);
    }
    this.hud.setDay(this.day.day, night);
    this.banner.update(dt);
    this.summary.update(dt);
    this.offline.update(dt);
  }

  private dayEvents(ev: DayEvents): void {
    if (ev.dayEnded) {
      // The summary's sleep line shows whether the night that just ended was slept through.
      const slept = this.state.sleep.lastDay === this.day.day && this.state.rested;
      this.summary.show(ev.dayEnded.day, ev.dayEnded.totals, slept ? tf('summaryRested', { n: slept.quality }) : null);
      this.save();
    }
    if (ev.stormWarning) this.banner.show(t('stormWarning'), 'warn', 6);
    if (ev.stormEnded) this.banner.show(t('stormOver'), 'info');
  }

  /**
   * Ice Cave chain for the guide arrow (GDD §15): the bench while carrying crystals; a ready vein when the bench is
   * idle and the player is on the yard side of the map.
   */
  private landTarget(): Vec2 | null {
    const s = this.state;
    if (!s.unlocked.includes('crystalBench')) return null;
    if (s.carriedCrystals > 0) return CaveLayout.bench.input;
    if (s.carried.length > 0 || s.cave.input > 0 || this.player.state.x > -11) return null;
    let best: Vec2 | null = null;
    let bestD = Infinity;
    CaveLayout.veins.forEach((v, i) => {
      const d = Math.hypot(v.x - this.player.state.x, v.z - this.player.state.z);
      if (this.cave.logic.veinReady(i) && d < bestD) {
        bestD = d;
        best = v;
      }
    });
    return best;
  }

  /**
   * Quality setting (GDD §22): pixel ratio, snow and steam amounts, one aurora curtain and cheaper shading on low.
   * Pixel ratio and snow change at once; the shading swap also reaches objects built later (`updateLook`).
   */
  private applyQuality(): void {
    View.quality = this.state.prefs.quality;
    const L = View.level;
    this.renderer.setPixelCap(L.pixelRatio);
    this.snow.setQuality(L.snow);
    this.atmosphere.setSimple(L.simple);
    applyShading(this.scene, L.simple);
  }

  /** "Reduce motion": smaller camera shakes and fewer sparkles (View), CSS loops stop (body class). */
  private applyMotion(): void {
    View.reduceMotion = this.state.prefs.reduceMotion;
    document.body.classList.toggle('reduce-motion', View.reduceMotion);
  }

  /** Darker HUD and label backgrounds at night and in storms; simple shading for newly built objects. */
  private updateLook(dt: number): void {
    const dim = this.atmosphere.nightLevel > ReadabilityFeel.nightLevel || this.atmosphere.stormLevel > 0.5;
    if (dim !== this.dimmed) {
      this.dimmed = dim;
      this.overlay.classList.toggle('dim', dim);
    }
    if (!View.level.simple) return;
    this.shadingTimer -= dt;
    if (this.shadingTimer <= 0) {
      this.shadingTimer = QualitySettings.shadingRecheck;
      applyShading(this.scene, true);
    }
  }

  /** A slow device (under 40 FPS for 5 s in a row) is offered low quality once (GDD §22). */
  private watchFps(now: number): void {
    const p = this.state.prefs;
    if (p.qualityAsked || p.quality === 'low' || !this.saveEnabled) return;
    if (this.fpsWindowStart < 0) this.fpsWindowStart = now;
    this.fpsFrames++;
    const span = now - this.fpsWindowStart;
    if (span < 1000) return;
    const fps = (this.fpsFrames * 1000) / span;
    this.fpsFrames = 0;
    this.fpsWindowStart = now;
    if (now < this.fpsGraceUntil || this.creator.isOpen || this.intro.active) return;
    this.slowFor = fps < QualitySettings.lowFps ? this.slowFor + span / 1000 : 0;
    if (this.slowFor < QualitySettings.lowFpsSeconds || this.qualityPrompt.isOpen) return;
    p.qualityAsked = true;
    this.save();
    this.qualityPrompt.show((yes) => {
      if (yes) {
        p.quality = 'low';
        this.applyQuality();
      }
      this.save();
    });
  }

  /** Debug tools (Settings → Debug → Tools). */
  private debugAction(a: DebugAction): void {
    const len = DayFeel.dayLength[this.state.prefs.dayLength];
    if (a === 'coins') this.state.coins += DebugTools.coins;
    else if (a === 'hour') this.dayEvents(this.day.update(len / 24));
    else if (a === 'day') this.dayEvents(this.day.update(len));
    else if (a === 'bear' || a === 'avalanche') this.threats.debugStart(a, this.day.isNight);
    this.save();
  }

  /** Music mood and ambience follow the time of day, the place and what happens (GDD §21). */
  private updateSound(dt: number): void {
    const p = this.player.state;
    const inside = (a: { minX: number; maxX: number; minZ: number; maxZ: number }) => p.x > a.minX && p.x < a.maxX && p.z > a.minZ && p.z < a.maxZ;
    const part = this.day.part;
    const place = inside(CaveLayout.area) ? 'cave' : inside(CampLayout.land) ? 'camp' : 'shore';
    this.music.setMood({
      time: part === 'night' ? 'night' : part === 'evening' ? 'evening' : 'day',
      aurora: this.day.auroraActive,
      place,
      tension: this.threats.sleepBlocker() !== null,
      sleeping: this.sleep.active,
    });
    this.music.update(dt);
    // Waves: distance to the open water (north and east of the shore, around the camp; none in the cave).
    const g = IceShore.ground;
    const c = CampLayout.land;
    const sea = place === 'cave' ? 99 : place === 'camp' ? Math.min(p.z - c.minZ, c.maxX - p.x, c.maxZ - p.z) : Math.min(p.z - g.minZ, g.maxX - p.x);
    this.ambience.update(dt, { storm: this.day.stormActive, night: this.day.isNight, seaDistance: sea });
  }

  /** Rare bait runs down while playing; collection rewards are handed out once (GDD §19). */
  private updateCodex(dt: number): void {
    const c = this.state.codex;
    c.rareBait = Math.max(c.rareBait - dt, 0);
    for (const id of rewardsDue(this.state)) {
      const r = grantReward(this.state, id);
      this.banner.show(tf(`reward_${id}` as StringKey, { c: r.coins }), 'good', 5);
      if (r.decoration) this.decorations.build(r.decoration as DecorationId, true);
      this.save();
    }
  }

  /** The bed hint points the guide arrow at the bed on its night, until the player has slept once. */
  private get sleepHintActive(): boolean {
    const s = this.state.sleep;
    return !s.hintDone && s.hintDay === this.day.day && canSleepAt(this.day.t);
  }

  /**
   * Sleep (GDD §14): fade out, then while dark: threats end, the clock jumps to morning (the day rolls over as
   * usual, so the summary card shows), the "well rested" buff starts. Stations do not work through the skipped night.
   */
  private fallAsleep(): void {
    this.input.reset();
    this.sleep.start(() => {
      this.threats.cancelForSleep();
      const ev = this.day.skipTo(Sleep.wakeAt);
      wakeRested(this.state);
      this.dayEvents(ev);
      this.wasNight = false;
      this.banner.show(tf('restedBanner', { q: this.state.rested?.quality ?? 1 }), 'good', 4);
      this.save();
    });
  }

  /**
   * Offline earnings (GDD §18), on start and when coming back from the background. The clock does not move while
   * away. A clock set back (last seen in the future) gives nothing and is corrected; long absences hit the cap.
   */
  private checkOffline(): void {
    const s = this.state;
    if (!this.saveEnabled) return;
    const now = Date.now();
    const away = (now - s.lastSeenAt) / 1000;
    if (s.lastSeenAt > 0 && away >= Economy.offline.minSeconds && !s.offlinePending) {
      const r = applyOffline(s, away);
      if (r.coins > 0) s.offlinePending = { coins: r.coins, seconds: r.seconds, capped: r.capped };
    }
    s.lastSeenAt = now;
    const p = s.offlinePending;
    if (p && !this.offline.isOpen) {
      this.offline.show(p.coins, p.seconds, p.capped, offlineCapHours(s), () => {
        // Straight into the wallet (the HUD counts up); the coin piles are not touched.
        s.coins += p.coins;
        s.offlinePending = null;
        this.save();
      });
    }
    this.save();
  }

  /** A setting changed in the settings panel (the prefs object is already updated). */
  private applyPref(key: keyof GameState['prefs']): void {
    const p = this.state.prefs;
    if (key === 'threats' && !p.threats) this.threats.stopAll();
    if (key === 'vibration') setVibration(p.vibration);
    if (key === 'quality') this.applyQuality();
    if (key === 'reduceMotion') this.applyMotion();
    if (key === 'showFps') this.hud.setFpsVisible(p.showFps);
    if (key === 'debugTools') this.debugBar.setVisible(p.debugTools);
    this.save();
    // UI text is built once; a new language needs a fresh start (the game is saved first).
    if (key === 'lang') window.location.reload();
  }

  private onUnlock(spot: UnlockSpot): void {
    for (const h of IceShore.holes) {
      if (h.unlock === spot.id) this.world.openHole(h.id, true);
    }
    for (const e of spot.zone?.effects ?? []) {
      if (e.kind === 'worker') this.workers.add();
      else if (e.kind === 'building') this.threats.build(e.building, true);
      else if (e.kind === 'igloo') {
        applyComfortUnlock(this.state, e);
        this.igloo.upgrade(e.level);
        this.banner.show(tf('iglooUpgraded', { n: e.level }), 'good');
      } else if (e.kind === 'land') {
        if (e.part === 'crystalBench') this.cave.buildBench(true);
        else this.camp.build(e.part, true);
      } else if (e.kind === 'decoration') {
        applyComfortUnlock(this.state, e);
        this.decorations.build(e.decoration, true);
      }
      else if (e.station === 'orderBoard') this.board.build(true);
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
    s.lastSeenAt = Date.now();
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
