// Feel / technical tuning values (not economy). Kept out of code so they can be tweaked in one place.

export const CameraSettings = {
  fov: 35,
  pitchDeg: 50,
  distance: 26,
  /** Minimum world width visible across the screen; distance grows on narrow screens to keep it. */
  minVisibleWidth: 8,
  followSharpness: 6, // higher = snappier follow (exponential smoothing rate)
  lookAheadY: 0.8, // look at a point slightly above the feet
  near: 1,
  far: 120,
} as const;

export const FogSettings = {
  near: 36,
  far: 72,
} as const;

export const JoystickSettings = {
  outerDiameter: 120, // px
  knobDiameter: 52, // px
  maxDrag: 60, // px radius
  deadZone: 0.12, // fraction of maxDrag
  activeAreaFromTop: 0.3, // touches below this fraction of screen height spawn the joystick (bottom 70%)
  fadeOutMs: 150,
  appearMs: 120,
} as const;

export const PlayerFeel = {
  radius: 0.45, // collision circle
  turnSharpness: 12, // rotation smoothing rate
  accelSharpness: 14, // velocity smoothing rate
  walkCycleSpeed: 2.6, // leg swing cycles per unit of speed
} as const;

export const SnowSettings = {
  count: 260,
  areaHalfX: 12,
  areaHalfZ: 16,
  height: 14,
  fallSpeedMin: 0.8,
  fallSpeedMax: 1.6,
  size: 0.06,
} as const;

export const WaterSettings = {
  waveHeight: 0.12,
  waveSpeed: 0.9,
} as const;

export const SaveSettings = {
  autosaveIntervalSec: 10,
  storageKey: 'northbite-save',
  /** Keys used by earlier builds; read once and migrated to `storageKey`. */
  legacyStorageKeys: ['polar-harbor-save'],
} as const;

export const TimeSettings = {
  maxDelta: 0.1,
} as const;

/** Fishing mini-game feel (GDD §2.1). Species data lives in content/fish.ts. */
export const FishingFeel = {
  interactRadius: 1.75, // player center within this distance of the hole = in the ring
  holeColliderRadius: 0.65,
  dwellToCast: 0.3, // seconds standing still in the ring before casting
  stillSpeed: 0.1, // speed01 below this counts as standing still

  castSwingTime: 0.25,
  castFlightTime: 0.45,
  biteDelayMin: 1.5,
  biteDelayMax: 4,
  hookWindow: 0.8, // seconds to tap after the bite
  missRecastDelay: 0.8,
  escapeRecastDelay: 1.2,

  // Reeling. Tension is 0..1; the line breaks at breakTension.
  holdTension: 0.5, // where tension settles while holding in calm water
  releaseTugShare: 0.3, // share of a tug's force still felt after letting go
  tensionRiseSharpness: 3,
  tensionFallSharpness: 6,
  tugImpulse: 0.15, // instant tension jump at tug start, × tug strength
  redZoneStart: 0.82,
  breakTension: 1.0,
  progressDecayPerSec: 0.08, // progress lost per second while released
  progressYellowMul: 0.6,
  progressRedMul: 0.25,
  tugWarnTime: 0.32, // rod twitch + splash before the force arrives
  tugRampTime: 0.12,
  tugHoldTime: 0.55,
  /** Bigger kg within a species increases reel time and tug strength by up to this fraction. */
  kgDifficulty: 0.35,
  cancelDragPx: 40,
  reelHintCatches: 3, // show "hold / let go on tugs" hint for the first N reels

  // Catch presentation
  landArcTime: 0.5,
  landFlopTime: 0.75,
  toStackTime: 0.35,
  rodLength: 1.35,
  rodBendMax: 0.85,
} as const;

export const HapticsSettings = {
  bite: 30,
  fishAdded: 15,
  catch: [40, 40, 90] as number[],
  lineBreak: 60,
  unlock: [60, 50, 140] as number[],
  newSpecies: [50, 40, 50, 40, 160] as number[],
  wallCrack: 40,
  wallBreak: [120, 60, 220] as number[],
  upgrade: [30, 30, 70] as number[],
  bearWarning: [90, 70, 90] as number[],
  bearScared: [40, 40, 120] as number[],
  avalancheRumble: [180, 80, 260] as number[],
  dig: 12,
  chest: [40, 40, 140] as number[],
  iglooUpgrade: [90, 60, 90, 60, 260] as number[],
  sleep: [30, 80, 30] as number[],
  decoration: [40, 40, 100] as number[],
  mineTick: 14,
  crystal: [30, 30, 80] as number[],
  page: [30, 60, 30, 60, 120] as number[],
} as const;

export const CarryFeel = {
  stackSway: 0.035, // sideways sway per stack level while walking
  dropInterval: 0.12, // seconds between fish flying to the counter
  dropRadius: 1.4, // distance from the counter's drop point
  flightTime: 0.3,
  arcHeight: 0.9,
} as const;

export const CustomerFeel = {
  walkSpeed: 2.2,
  takeInterval: 0.3,
  flightTime: 0.3,
  maxCoinsVisual: 8, // flying coins per payment (value is split between them)
} as const;

export const CoinFeel = {
  pickupRadius: 1.1,
  pickupInterval: 0.045,
  flightTime: 0.35,
  arcHeight: 1.2,
  pileVisualMax: 40,
  hudCountSpeed: 8, // HUD counter catch-up rate
  hudBumpGapMs: 240, // the coin pill bumps at most this often (its animation is 220 ms)
} as const;

export const UnlockFeel = {
  fillTime: 1.4, // seconds to pour the full price while standing on the frame
  startDelay: 0.3, // stand this long before coins start pouring (walking across a frame costs nothing)
  coinInterval: 0.06,
  bounceTime: 0.6,
} as const;

export const GuideFeel = {
  arrowHeight: 2.6,
  bobAmplitude: 0.25,
} as const;

/** Player ↔ station transfers (basket, smokehouse racks). */
export const StationFeel = {
  pickupRadius: 1.4, // player distance from a basket / rack center
  transferInterval: 0.12,
  flightTime: 0.3,
  arcHeight: 0.8,
  netSplashMin: 2.5, // random splash/flutter at the net every few seconds
  netSplashMax: 5,
  smokePuffInterval: 0.35, // chimney puffs while working (idle chimney puffs 3× slower)
  steamInterval: 0.7, // steam wisps over smoked fish
} as const;

export const WorkerFeel = {
  radius: 0.3,
  transferInterval: 0.2,
  arriveDistance: 0.12,
  turnSharpness: 10,
  jobCheckInterval: 0.3,
  homeSpacing: 0.8, // idle spots line up beside the hut door
  waddleSpeed: 3.2, // steps per second at full speed
  waddleRoll: 0.16,
  stackScale: 0.7, // fish on a penguin's back are drawn smaller
  hopInTime: 0.6, // new penguin hops out of the hut
} as const;

/** Ice wall break + camera tour when a region opens (GDD §5, §6). */
export const RegionFeel = {
  crackTime: 0.5,
  shardCount: 9, // per wall block
  shardLife: 1.9,
  pause: 0.65, // after the shatter, before the camera moves
  panTime: 0.7,
  holdTime: 0.9,
  returnTime: 0.6,
  shake: 0.25,
} as const;

/** Day/night cycle and weather visuals (GDD §12). Balance effects live in content/time.ts. */
export const DayFeel = {
  /** Real seconds per in-game day, per "day length" setting (the choice is saved in state.prefs). */
  dayLength: { short: 300, medium: 480, long: 720 },
  /** Light intensities at the day/dusk/night keys (dawn uses the dusk values). */
  hemi: { day: 1.5, dusk: 1.2, night: 0.75 },
  sun: { day: 2.1, dusk: 1.5, night: 0.55 },
  /** Sun direction swings from east to west over the day; the moon sits high in the south-west. */
  sunHeight: 12,
  fogNear: { clear: 36, storm: 9 },
  fogFar: { clear: 72, storm: 30 },
  stormFadeTime: 6, // seconds for the fog to thicken / clear
  stormSnowWind: 3.2, // sideways snow speed during a storm
  stormSnowFall: 1.8, // fall speed multiplier during a storm
  auroraOpacity: 0.55,
  summaryTime: 4, // seconds the day summary card stays
  bannerTime: 3.5,
} as const;

/** Character creator stage (GDD §3). */
export const CreatorFeel = {
  fov: 28,
  distance: 12.5,
  pitchDeg: 12,
  lookAtY: 0.95,
  /** Where the model's center sits on screen (0 = top, 1 = bottom). */
  screenY: 0.35,
  autoSpin: 0.55, // rad/s
  dragSpeed: 0.011, // rad per px
  spinReturn: 2.2, // how fast it eases back to the auto spin after a drag
  popTime: 0.28,
  popScale: 0.09,
  fadeMs: 400,
} as const;

/** "Start" intro: wide camera easing in, more snow, greeting bubble. */
export const IntroFeel = {
  startZoom: 2.1,
  zoomTime: 1.5,
  startSnow: 0.55,
  greetAt: 1.3,
  greetTime: 2.0,
} as const;

export const BenchFeel = {
  openDelay: 0.2, // stand on the pad this long before the panel opens
  celebrateMs: 700,
} as const;

/** Polar bear and avalanche feel (GDD §13). Balance values live in content/threats.ts. */
export const ThreatFeel = {
  bearScale: 1.15,
  bearTurnSharpness: 5,
  /** The bear swims (sinks this much) while off the ice. */
  swimDepth: 0.62,
  rearAngle: 1.05, // rad the body tilts back when standing on its hind legs
  grabTime: 0.9,
  /** Footprints: spacing in world units and how long one lasts. */
  printStep: 0.75,
  printLife: 26,
  /** Share of the bear's path that footprints reveal during the warning. */
  warningPrintReach: 0.45,
  arrowMargin: 46, // px from the screen edge
  /** Show the "get close and hold" hint when the player is this near the bear. */
  hintRange: 7,
  pileRiseTime: 0.45,
  pileStagger: 0.11, // seconds between piles, west to east
  meltShrinkTime: 6, // piles shrink over their last seconds
  pushTime: 0.35,
  shakeWarning: 0.06,
  shakeFall: 0.35,
  stripePulse: 5,
  digShake: 0.04,
  chestOpenRadius: 1.1,
  rewardDelay: 0.35,
} as const;

/** Igloo upgrade, bed ring and sleep feel (GDD §14). Balance values live in content/igloo.ts. */
export const SleepFeel = {
  /** Stand in the bed ring this long to fall asleep. */
  holdTime: 1.5,
  fadeOut: 1.0,
  /** Dark screen with "Zzz" while the clock jumps. */
  darkTime: 1.2,
  fadeIn: 1.0,
  /** The bed label (peace, "night only") shows within this distance. */
  labelRange: 3.2,
  chimneyInterval: 0.9,
  upgradeShake: 0.3,
  upgradePuffs: 14,
} as const;

/** Ice Cave and Hot Spring Camp feel (GDD §15). Balance values live in content/land.ts and guests.ts. */
export const LandFeel = {
  /** Stand within this distance of a vein's center (plus its size) to mine it. */
  veinReach: 0.35,
  veinRadius: [0.55, 0.75, 0.95],
  /** Seconds between statuettes the collector picks up while visiting. */
  collectorBuyInterval: 0.5,
  /** Player ↔ rack transfers in the lands. */
  rackRadius: 1.5,
  transferInterval: 0.15,
  serveRadius: 1.6,
  plateFlightTime: 0.55,
  crystalScale: 0.9,
  guestScale: 0.95,
  steamCount: 36,
  steamRise: 0.55,
  /** Journal: hidden page glows when the player is near. */
  pageBob: 0.15,
  cardMinTime: 0.6,
} as const;

/** "While you were away" window (GDD §18). Balance values live in content/economy.ts → offline. */
export const OfflineFeel = {
  countUpTime: 1.4,
  /** Placeholder for a future rewarded ad ("x2"); hidden until ads exist. */
  showOfflineBoost: false,
} as const;

/** Fish encyclopedia's model view (GDD §19). */
export const CodexFeel = {
  fov: 30,
  distance: 3.4,
  /** The camera looks this far below the fish, so the model sits in the upper part of the screen. */
  lookBelow: 0.6,
  spin: 0.9,
  fishSize: 1.7,
  /** Share of the screen width the model may take. */
  widthShare: 0.7,
} as const;

/** Order board (GDD §20). Balance values live in content/orders.ts. */
export const OrderFeel = {
  /** Stand within the board radius this long for the panel to open. */
  openDelay: 0.25,
} as const;

/**
 * Graphics quality (GDD §22), chosen in the settings (default medium). `pixelRatio` caps devicePixelRatio; `snow` and
 * `steam` scale particle counts; `simple` = one aurora curtain and Lambert instead of PBR shading.
 */
export const QualitySettings = {
  levels: {
    low: { pixelRatio: 1, snow: 0.45, steam: 0.4, simple: true },
    medium: { pixelRatio: 1.5, snow: 0.8, steam: 0.75, simple: false },
    high: { pixelRatio: 2, snow: 1, steam: 1, simple: false },
  },
  /** Below this FPS for `lowFpsSeconds` in a row, the game offers low quality once. */
  lowFps: 40,
  lowFpsSeconds: 5,
  /** Seconds after start / coming back before FPS is judged (loading hitches). */
  lowFpsGrace: 8,
  /** Simple shading also reaches objects built later: the scene is checked this often (s). */
  shadingRecheck: 2,
} as const;

/** "Reduce motion" setting (GDD §22): camera shakes and sparkles are scaled down, CSS loops stop. */
export const MotionSettings = {
  shakeScale: 0.2,
  sparkleScale: 0.35,
} as const;

/** Splash screen before the game (GDD §22). */
export const SplashFeel = {
  minMs: 1500,
  fadeMs: 400,
  flakes: 14,
} as const;

/** First-minutes visual hints (GDD §22): shown while play time is below this, or until the action is done. */
export const TutorialFeel = {
  seconds: 120,
  /** The bite alert shows a tapping hand for the first catches. */
  tapCatches: 3,
} as const;

/** HUD and labels get darker backgrounds above this night level (0..1) or in a storm. */
export const ReadabilityFeel = {
  nightLevel: 0.55,
} as const;

/**
 * Temporary test switch: 'bear' or 'avalanche' starts that threat a few seconds after loading (and again after each
 * one ends), ignoring play time, the smokehouse requirement and threatScale. Keep it 'off' in commits.
 */
export const DebugSettings = {
  debugForceThreat: 'off' as 'off' | 'bear' | 'avalanche',
};
