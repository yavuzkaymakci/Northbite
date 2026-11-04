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
