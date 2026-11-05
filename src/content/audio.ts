// Sound and music (GDD §21). Everything is synthesised with WebAudio: no audio files. Effects are recipes of short
// layers (a tone or filtered noise with a pitch / filter sweep and a soft envelope). Kept gentle: no harsh highs.

export type SfxId =
  | 'cast'
  | 'plop'
  | 'bite'
  | 'reelTick'
  | 'lineBreak'
  | 'catch'
  | 'rareCatch'
  | 'newSpecies'
  | 'stackAdd'
  | 'counterDrop'
  | 'coin'
  | 'coinSpend'
  | 'buy'
  | 'deny'
  | 'unlock'
  | 'iceCrack'
  | 'iceBreak'
  | 'penguinStep'
  | 'penguinFlap'
  | 'smokeCrackle'
  | 'netSplash'
  | 'crystalChime'
  | 'mine'
  | 'steam'
  | 'bearWarning'
  | 'bearScared'
  | 'avalancheWarning'
  | 'avalancheFall'
  | 'sleep'
  | 'tap'
  | 'panelOpen'
  | 'panelClose'
  | 'banner'
  | 'page'
  | 'snowStep';

export interface SfxLayer {
  kind: 'tone' | 'noise';
  /** Oscillator shape for tones. */
  wave?: 'sine' | 'triangle' | 'square' | 'sawtooth';
  /** Start → end frequency in Hz: the pitch of a tone, the filter of a noise. */
  freq: readonly [number, number];
  /** Filter for noise layers. */
  filter?: 'lowpass' | 'highpass' | 'bandpass';
  q?: number;
  /** Start offset in seconds. */
  at?: number;
  dur: number;
  gain: number;
  attack?: number;
}

export interface SfxDef {
  layers: readonly SfxLayer[];
  /** Seconds before the same sound may play again. */
  minGap: number;
  /** Fades with the distance to the player (world sounds). */
  world?: boolean;
}

const T = (freq: [number, number], dur: number, gain: number, more: Partial<SfxLayer> = {}): SfxLayer => ({ kind: 'tone', wave: 'sine', freq, dur, gain, ...more });
const N = (freq: [number, number], dur: number, gain: number, filter: SfxLayer['filter'], more: Partial<SfxLayer> = {}): SfxLayer => ({
  kind: 'noise',
  freq,
  dur,
  gain,
  filter,
  q: 1,
  ...more,
});

export const Sfx: Record<SfxId, SfxDef> = {
  // Fishing
  cast: { layers: [N([1600, 500], 0.28, 0.18, 'bandpass', { q: 0.9, attack: 0.03 })], minGap: 0.2 },
  plop: { layers: [T([600, 180], 0.16, 0.3), N([1500, 300], 0.1, 0.1, 'lowpass')], minGap: 0.1, world: true },
  bite: { layers: [T([1400, 1000], 0.05, 0.16, { wave: 'triangle' }), N([2500, 1200], 0.15, 0.1, 'bandpass', { at: 0.02 })], minGap: 0.2, world: true },
  reelTick: { layers: [T([900, 860], 0.025, 0.07, { wave: 'triangle', attack: 0.002 })], minGap: 0.05 },
  lineBreak: { layers: [T([700, 150], 0.25, 0.15, { wave: 'triangle' }), N([4000, 2000], 0.12, 0.06, 'highpass')], minGap: 0.3 },
  catch: {
    layers: [523, 659, 784, 1046].map((f, i) => T([f, f], 0.28, 0.14, { at: i * 0.07 })),
    minGap: 0.3,
  },
  rareCatch: {
    layers: [T([1568, 1568], 0.9, 0.09), T([2093, 2093], 0.9, 0.06, { at: 0.05 }), T([2637, 2637], 0.8, 0.045, { at: 0.1 })],
    minGap: 0.5,
  },
  newSpecies: { layers: [784, 988, 1175, 1568].map((f, i) => T([f, f], 0.42, 0.12, { at: i * 0.1 })), minGap: 0.5 },
  // Carrying, selling, coins
  stackAdd: { layers: [T([380, 430], 0.06, 0.1)], minGap: 0.04 },
  counterDrop: { layers: [T([300, 260], 0.07, 0.1, { wave: 'triangle' }), N([800, 500], 0.04, 0.04, 'lowpass')], minGap: 0.05, world: true },
  coin: { layers: [T([1318, 1318], 0.09, 0.08), T([1975, 1975], 0.08, 0.04, { at: 0.02 })], minGap: 0.03 },
  coinSpend: { layers: [T([1100, 1050], 0.05, 0.05)], minGap: 0.06 },
  buy: { layers: [660, 880, 1320].map((f, i) => T([f, f], 0.22, 0.12, { at: i * 0.06 })), minGap: 0.15 },
  deny: { layers: [T([220, 180], 0.15, 0.1, { wave: 'triangle' })], minGap: 0.15 },
  unlock: {
    layers: [T([300, 600], 0.12, 0.13), ...[392, 494, 587].map((f) => T([f, f], 0.9, 0.07, { at: 0.1, attack: 0.02 }))],
    minGap: 0.3,
  },
  iceCrack: { layers: [N([3000, 1500], 0.12, 0.13, 'highpass'), T([1800, 900], 0.06, 0.05, { wave: 'triangle' })], minGap: 0.1 },
  iceBreak: { layers: [N([2500, 400], 0.7, 0.2, 'bandpass', { q: 0.8 }), N([900, 200], 1.0, 0.14, 'lowpass', { at: 0.2, attack: 0.05 })], minGap: 0.5 },
  // Town life (quiet, world)
  penguinStep: { layers: [N([900, 500], 0.04, 0.035, 'lowpass')], minGap: 0.12, world: true },
  penguinFlap: { layers: [N([1200, 900], 0.08, 0.03, 'bandpass')], minGap: 0.3, world: true },
  smokeCrackle: { layers: [N([3000, 2800], 0.03, 0.045, 'highpass')], minGap: 0.08, world: true },
  netSplash: { layers: [N([2000, 500], 0.25, 0.09, 'lowpass'), T([500, 200], 0.12, 0.05)], minGap: 0.3, world: true },
  crystalChime: { layers: [T([2093, 2093], 1.2, 0.045), T([3136, 3136], 1.0, 0.025, { at: 0.03 })], minGap: 0.4, world: true },
  mine: { layers: [N([3500, 1800], 0.07, 0.11, 'bandpass'), T([1760, 1760], 0.3, 0.045, { wave: 'triangle' })], minGap: 0.15, world: true },
  steam: { layers: [N([2500, 4000], 0.6, 0.045, 'highpass', { attack: 0.15 })], minGap: 0.5, world: true },
  // Threats and sleep
  bearWarning: { layers: [N([400, 150], 1.2, 0.22, 'lowpass', { attack: 0.2 }), T([80, 60], 1.4, 0.18, { attack: 0.3 })], minGap: 2 },
  bearScared: { layers: [T([220, 90], 0.6, 0.14, { wave: 'triangle' }), N([600, 300], 0.5, 0.1, 'lowpass')], minGap: 1 },
  avalancheWarning: { layers: [T([55, 45], 2.2, 0.28, { attack: 0.5 }), N([250, 180], 2.0, 0.18, 'lowpass', { attack: 0.4 })], minGap: 2 },
  avalancheFall: { layers: [N([900, 200], 2.2, 0.3, 'lowpass', { attack: 0.05 }), T([60, 40], 1.5, 0.22)], minGap: 2 },
  sleep: { layers: [523, 440, 392].map((f, i) => T([f, f], i === 2 ? 1.1 : 0.6, 0.07, { at: i * 0.35, attack: 0.05 })), minGap: 2 },
  // UI
  tap: { layers: [T([900, 860], 0.03, 0.05)], minGap: 0.04 },
  panelOpen: { layers: [N([600, 1800], 0.18, 0.045, 'bandpass', { attack: 0.04 })], minGap: 0.15 },
  panelClose: { layers: [N([1800, 600], 0.16, 0.04, 'bandpass', { attack: 0.03 })], minGap: 0.15 },
  banner: { layers: [T([1046, 1046], 0.35, 0.05), T([1568, 1568], 0.3, 0.03, { at: 0.05 })], minGap: 0.6 },
  page: { layers: [N([2500, 1500], 0.35, 0.07, 'bandpass', { attack: 0.05 }), N([2200, 1300], 0.3, 0.05, 'bandpass', { at: 0.18, attack: 0.04 })], minGap: 0.5 },
  snowStep: { layers: [N([1800, 800], 0.06, 0.03, 'lowpass')], minGap: 0.22 },
};

/** Default volumes (0..1) and engine limits. */
export const AudioMix = {
  defaults: { master: 0.8, music: 0.55, sfx: 0.8, ambience: 0.6 },
  maxVoices: 24,
  /** World sounds: full volume within `near`, silent beyond `far` (units from the player). */
  near: 4,
  far: 22,
  /** Rising pitch for coin chains: a step per coin within `chainWindow` seconds, up to `chainMax`. */
  chainWindow: 0.5,
  chainStep: 0.05,
  chainMax: 1.6,
};

// ---------- music (GDD §21) ----------

export type TimeMood = 'day' | 'evening' | 'night';
export type PlaceMood = 'shore' | 'cave' | 'camp';

/**
 * Generative music, no tempo: a soft pad slowly gliding between chords, sparse pentatonic bells on top, a light echo.
 * Notes are MIDI numbers (60 = middle C).
 */
export const Music = {
  /** Pad chords per time of day; one follows the other every `chordSeconds`. */
  chords: {
    day: [
      [48, 55, 60, 64],
      [45, 52, 57, 60],
      [41, 48, 53, 57],
      [43, 50, 55, 59],
    ],
    evening: [
      [45, 52, 57, 60],
      [41, 48, 53, 57],
      [48, 55, 60, 64],
      [43, 50, 57, 62],
    ],
    night: [
      [50, 57, 62, 65],
      [46, 53, 58, 62],
      [43, 50, 55, 58],
      [45, 52, 57, 61],
    ],
  } satisfies Record<TimeMood, number[][]>,
  /** Bell notes (pentatonic, so any two sound fine together). */
  scales: {
    day: [72, 74, 76, 79, 81, 84],
    evening: [69, 72, 74, 76, 79, 81],
    night: [74, 77, 79, 81, 84, 86],
  } satisfies Record<TimeMood, number[]>,
  chordSeconds: [16, 26],
  /** Time constant (s) of the glide between chords and of mood changes. */
  glide: 3.5,
  padGain: 0.11,
  /** Pad brightness (low-pass cutoff in Hz) per time of day, and in the cave / camp. */
  padCutoff: { day: 1500, evening: 950, night: 750 } satisfies Record<TimeMood, number>,
  placeCutoff: { shore: 1, cave: 0.8, camp: 1.15 } satisfies Record<PlaceMood, number>,
  /** Seconds between bell notes (random in range); the cave rings more often, the night less. */
  bellEvery: [2.5, 7],
  bellGain: 0.055,
  bellDecay: 2.2,
  /** Echo: delay time, feedback and wet level (the cave echoes longer). */
  echo: { delay: 0.42, feedback: 0.36, wet: 0.35 },
  caveEcho: { delay: 0.56, feedback: 0.55, wet: 0.55 },
  /** Northern lights: a thin glassy layer of two high, slowly wavering tones. */
  glassGain: 0.022,
  glassNotes: [88, 95],
  /** Bear warning / avalanche: music dips, a low beating drone comes in. */
  tensionDuck: 0.35,
  tensionGain: 0.07,
  tensionNotes: [33, 34],
  /** Sleep fades the music out. */
  sleepDuck: 0.1,
} as const;

/** Ambience channel: wind always (stronger in a storm, softer at night), waves near the sea. */
export const Ambience = {
  wind: { gain: 0.07, storm: 0.2, night: 0.045, cutoff: [350, 900] as const, sway: 0.08 },
  waves: { gain: 0.08, cutoff: 520, rate: 0.13, near: 3, far: 14 },
};
