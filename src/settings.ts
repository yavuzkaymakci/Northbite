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
} as const;

export const UnlockFeel = {
  fillTime: 1.4, // seconds to pour the full price while standing on the frame
  coinInterval: 0.06,
  bounceTime: 0.6,
} as const;

export const GuideFeel = {
  arrowHeight: 2.6,
  bobAmplitude: 0.25,
} as const;
