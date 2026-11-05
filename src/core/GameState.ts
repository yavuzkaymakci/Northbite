import { AudioMix } from '../content/audio';
import type { VariantId } from '../content/codex';
import type { FishId } from '../content/fish';
import type { OrderExtra, OrderKind } from '../content/orders';
import { TimeOfDay } from '../content/time';
import type { UpgradeId } from '../content/upgrades';
import type { StationUpgradeId } from '../content/stationUpgrades';

export type ItemKind = 'raw' | 'smoked';

/** One fish as plain data (raw or smoked). `price` is its current sale value, fixed when it was made. */
export interface FishItem {
  species: FishId;
  kg: number;
  kind: ItemKind;
  price: number;
  /** Rare colour variant (GDD §19): only the look and the value differ. */
  variant?: VariantId;
}

export interface SmokerState {
  input: FishItem[];
  output: FishItem[];
  /** 0..1 progress of the fish being smoked (the first one in `input`). */
  progress: number;
}

/** A helper's saved data. Positions are not saved; helpers start at their hut. */
export interface WorkerData {
  carried: FishItem[];
}

/**
 * Everything about progress that gets saved. Pure JSON, no Three.js objects.
 * Station contents are plain lists so offline earnings (Demo 4) can be computed from rates in content/.
 */
export interface GameState {
  coins: number;
  /** Coins lying on the pile next to the counter, not yet picked up. */
  pile: number;
  carried: FishItem[];
  counter: FishItem[];
  unlocked: string[];
  /** Opened regions (their ice walls are broken). */
  regions: string[];
  /** Coins already poured into unlock zones that are not finished yet. */
  unlockPaid: Record<string, number>;
  /** Fish waiting in the net's basket. */
  basket: FishItem[];
  smoker: SmokerState;
  workers: WorkerData[];
  /** Upgrade levels, 1..5. */
  upgrades: Record<UpgradeId, number>;
  /** Station and time upgrade levels, 1..5 (GDD §18). */
  stationUpgrades: Record<StationUpgradeId, number>;
  /** Species caught at least once (drives the "New species!" card). */
  seen: FishId[];
  /** `playTime` = seconds on the game screen (threats wait for it); `bears` / `avalanches` met so far. */
  stats: { caught: number; sold: number; reels: number; playTime: number; bears: number; avalanches: number };
  /** In-game clock: day number (from 1) and time of day 0..1 (0 = dawn). Only runs while the game is open. */
  clock: { day: number; t: number };
  /** Running totals for the day summary card; reset every morning. */
  today: DayTotals;
  /** Seconds left on timed buffs. */
  buffs: { aurora: number };
  /** What threat buildings hold (GDD §13). A bear or avalanche in progress is never saved. */
  threats: ThreatGear;
  /** Igloo level 1..4 (GDD §14). */
  iglooLevel: number;
  /** Decorations bought (ids from content/decorations.ts). */
  decorations: string[];
  /** "Well rested" buff: sleep quality and when it ends, in game days (`day - 1 + t`); null = none. */
  rested: { quality: number; until: number } | null;
  /** Last day the player woke up rested, the night the bed hint was last shown, and whether it is retired. */
  sleep: { lastDay: number; hintDay: number; hintDone: boolean };
  /** Ice Cave (GDD §15). */
  cave: CaveState;
  /** Hot Spring Camp (GDD §15). Guests in the camp are not saved. */
  camp: CampState;
  /** Crystals on the player's back (they share the carry capacity with fish). */
  carriedCrystals: number;
  /** Journal pages found (ids from content/story.ts). */
  story: { pages: string[] };
  /** Player settings (settings panel). */
  prefs: Prefs;
  /** Wall-clock time (ms) of the last save while playing; offline earnings count from here (GDD §18). */
  lastSeenAt: number;
  /** Offline coins worked out but not collected yet (the window shows again until "Collect"). */
  offlinePending: { coins: number; seconds: number; capped: boolean } | null;
  /** Fish encyclopedia (GDD §19). Discovered species are `seen`. */
  codex: CodexState;
  /** Order board (GDD §20). */
  orders: OrdersState;
}

export interface SpeciesRecord {
  count: number;
  /** Heaviest catch in kg (0 = unknown, e.g. caught before the encyclopedia existed). */
  bestKg: number;
  /** In-game day of the first catch (0 = unknown). */
  firstDay: number;
}

export interface CodexState {
  species: Partial<Record<FishId, SpeciesRecord>>;
  /** Species caught in each colour variant. */
  variants: Record<VariantId, FishId[]>;
  /** Collection rewards already given. */
  rewards: string[];
  /** "Master angler" title (5 species). */
  title: boolean;
  /** Seconds of rare bait left (counts only while playing). */
  rareBait: number;
  /** Species discovered since the encyclopedia was last opened (red dot on the HUD icon). */
  fresh: FishId[];
}

export interface Order {
  id: number;
  kind: OrderKind;
  /** Pieces, or kg for a 'kg' order. */
  amount: number;
  /** For 'species' orders. */
  species?: FishId;
  /** Real seconds left (only counted while playing). */
  timeLeft: number;
  /** Coins on delivery (priceScale already applied). */
  reward: number;
  extra: OrderExtra | null;
}

export interface OrdersState {
  active: Order[];
  /** Seconds until each empty slot gets an order. */
  refill: number[];
  /** Seconds until the "swap" button works again. */
  rerollIn: number;
  nextId: number;
  /** The easy first order was handed out. */
  firstGiven: boolean;
  /** Orders delivered (stats). */
  done: number;
}

export function createCodexState(): CodexState {
  return { species: {}, variants: { gold: [], rainbow: [] }, rewards: [], title: false, rareBait: 0, fresh: [] };
}

export function createOrdersState(): OrdersState {
  return { active: [], refill: [], rerollIn: 0, nextId: 1, firstGiven: false, done: 0 };
}

export type DayLengthId = 'short' | 'medium' | 'long';

export interface Prefs {
  /** Threats on/off; off behaves like threatScale 0. */
  threats: boolean;
  dayLength: DayLengthId;
  vibration: boolean;
  /** '' = follow the device language. */
  lang: '' | 'tr' | 'en';
  /** Volumes 0..1 and mute (GDD §21). */
  audio: { master: number; music: number; sfx: number; ambience: number; mute: boolean };
  /** Graphics quality (GDD §22). */
  quality: QualityId;
  reduceMotion: boolean;
  /** FPS readout in the HUD (debug). */
  showFps: boolean;
  /** The one-time "switch to low quality?" offer was made. */
  qualityAsked: boolean;
  /** Debug tools bar (give coins, skip time, threats, panel view). */
  debugTools: boolean;
}

export type QualityId = 'low' | 'medium' | 'high';

export interface CaveState {
  /** Seconds until each vein (CaveLayout.veins order) has grown back; 0 = ready. */
  veins: number[];
  /** Crystals on the bench input rack, statuettes on its output rack, carving progress 0..1. */
  input: number;
  output: number;
  progress: number;
  /** Seconds until the collector's next visit. */
  collectorIn: number;
  /** Coins on the cave pile. */
  pile: number;
  /** Crystals mined so far (the first one finds a journal page). */
  mined: number;
}

export interface CampState {
  /** Smoked fish on the kitchen input rack. */
  input: FishItem[];
  /** Platter values on the output rack. */
  plates: number[];
  progress: number;
  pile: number;
  /** Platters served so far (the first one finds a journal page). */
  served: number;
}

export function createCaveState(): CaveState {
  return { veins: [0, 0, 0, 0, 0, 0], input: 0, output: 0, progress: 0, collectorIn: 0, pile: 0, mined: 0 };
}

export function createCampState(): CampState {
  return { input: [], plates: [], progress: 0, pile: 0, served: 0 };
}

export interface ThreatGear {
  /** Torches the player carries (from the torch stand). */
  torches: number;
  /** Raw fish lying in the bait trap. */
  bait: FishItem | null;
  /** Bear fur dropped by scared bears (used by decorations later). */
  fur: number;
}

export interface DayTotals {
  coins: number;
  caught: number;
  sold: number;
}

export function createGameState(): GameState {
  return {
    coins: 0,
    pile: 0,
    carried: [],
    counter: [],
    unlocked: [],
    regions: [],
    unlockPaid: {},
    basket: [],
    smoker: { input: [], output: [], progress: 0 },
    workers: [],
    upgrades: { line: 1, reel: 1, bait: 1, backpack: 1 },
    stationUpgrades: {
      netSpeed: 1,
      basket: 1,
      penguinSpeed: 1,
      penguinCarry: 1,
      smokeSpeed: 1,
      counter: 1,
      kitchenSpeed: 1,
      tentRent: 1,
      statuette: 1,
      offlineCap: 1,
      offlineRate: 1,
    },
    seen: [],
    stats: { caught: 0, sold: 0, reels: 0, playTime: 0, bears: 0, avalanches: 0 },
    clock: { day: 1, t: TimeOfDay.startAt },
    today: { coins: 0, caught: 0, sold: 0 },
    buffs: { aurora: 0 },
    threats: { torches: 0, bait: null, fur: 0 },
    iglooLevel: 1,
    decorations: [],
    rested: null,
    sleep: { lastDay: 0, hintDay: 0, hintDone: false },
    cave: createCaveState(),
    camp: createCampState(),
    carriedCrystals: 0,
    story: { pages: [] },
    prefs: { threats: true, dayLength: 'medium', vibration: true, lang: '', audio: { ...AudioMix.defaults, mute: false }, quality: 'medium', reduceMotion: false, showFps: false, qualityAsked: false, debugTools: false },
    lastSeenAt: 0,
    offlinePending: null,
    codex: createCodexState(),
    orders: createOrdersState(),
  };
}

/** True once an unlock zone or a region with this id is done, or a journal page with this id is found. */
export function isDone(state: GameState, id: string): boolean {
  return state.unlocked.includes(id) || state.regions.includes(id) || state.story.pages.includes(id);
}
