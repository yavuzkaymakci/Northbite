import { AudioMix } from '../content/audio';
import type { VariantId } from '../content/codex';
import type { FishId } from '../content/fish';
import type { OrderExtra, OrderKind } from '../content/orders';
import { TimeOfDay } from '../content/time';
import type { UpgradeId } from '../content/upgrades';
import type { StationUpgradeId } from '../content/stationUpgrades';
import type { RoleId } from '../content/roles';
import type { TraitId } from '../content/penguins';
import type { BoatUpgradeId, SealRoleId } from '../content/harbor';
import type { DestinationId, VoyageEventId } from '../content/voyages';

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

/** Goods penguins carry besides fish: crystals (miner) and platters (cook). `price` is the platter value (0 for a crystal). */
export interface GoodItem {
  kind: 'crystal' | 'plate';
  price: number;
}

/** Anything on a penguin's back. */
export type WorkerItem = FishItem | GoodItem;

export function isFish(item: WorkerItem): item is FishItem {
  return item.kind === 'raw' || item.kind === 'smoked';
}

/** Hat (-1 = none) and scarf colours, indices into Palette.HeadwearColors / ScarfColors. */
export interface PenguinLook {
  hat: number;
  scarf: number;
}

/**
 * A penguin's saved data (GDD §24). Positions are not saved; penguins start at their hut. `name` is an index into
 * content/penguins.ts → PenguinNames (both languages), `xp` the total experience.
 */
export interface WorkerData {
  id: number;
  name: number;
  role: RoleId;
  trait: TraitId;
  level: number;
  xp: number;
  look: PenguinLook;
  /** What was paid for it (0 for the hut's free penguin). */
  price: number;
  carried: WorkerItem[];
}

/** A penguin waiting in the market catalog; its price is worked out when shown (it depends on how many you own). */
export interface PenguinOffer {
  id: number;
  name: number;
  role: RoleId;
  trait: TraitId;
  look: PenguinLook;
}

/** Penguin Market (GDD §24). */
export interface MarketState {
  offers: PenguinOffer[];
  /** Game day the catalog was made for (a new day brings a new catalog). */
  day: number;
  /** Seconds until the free "Refresh" works again. */
  refreshIn: number;
  nextId: number;
  /** Penguin ids so far (WorkerData.id). */
  nextPenguin: number;
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
  offlinePending: OfflinePending | null;
  /** Fish encyclopedia (GDD §19). Discovered species are `seen`. */
  codex: CodexState;
  /** Order board (GDD §20). */
  orders: OrdersState;
  /** Penguin hut level 1..4: how many penguins live there (GDD §24). */
  hutLevel: number;
  /** Penguin Market catalog (GDD §24). */
  market: MarketState;
  /** Harbour Pier: boat, voyages, loot, seals, lighthouse (GDD §25). The boat repair stages are unlock ids. */
  harbor: HarborState;
}

export function createMarketState(): MarketState {
  return { offers: [], day: 0, refreshIn: 0, nextId: 1, nextPenguin: 1 };
}

/** A seal of the boat's crew (GDD §25). `name` indexes content/harbor.ts → SealNames, `scarf` Palette.ScarfColors. */
export interface SealData {
  id: number;
  name: number;
  role: SealRoleId;
  scarf: number;
  price: number;
}

export type SealOffer = Omit<SealData, 'price'>;

/** The voyage at sea. Times are real seconds; they run on while the game is closed. */
export interface Voyage {
  dest: DestinationId;
  left: number;
  /** Full length after the speed upgrade and the event. */
  total: number;
  /** Seal ids aboard. */
  crew: number[];
  event: VoyageEventId | null;
  /** Left at night without a lantern and got held up. */
  nightDelay: boolean;
}

/** What the last voyage brought back (shown on the panel, the banner and the "while away" window). */
export interface VoyageReturn {
  dest: DestinationId;
  fish: number;
  coins: number;
  parts: number;
  bait: boolean;
  decor: boolean;
  page: boolean;
  event: VoyageEventId | null;
  /** Sale value of the fish (raw) plus the treasure coins. */
  value: number;
}

export interface HarborState {
  /** Boat upgrade levels 1..5. */
  upgrades: Record<BoatUpgradeId, number>;
  voyage: Voyage | null;
  /** Auto voyages repeat this one. */
  lastDest: DestinationId | null;
  /** The boat came back and the player has not collected yet ("returned"); null = ready or at sea. */
  returned: VoyageReturn | null;
  /** Loot rack (deep-sea fish) and the crates for what does not fit; nothing is ever dropped. */
  rack: FishItem[];
  crates: FishItem[];
  /** Coins on the harbour pile (treasure). */
  pile: number;
  seals: SealData[];
  /** Seals picked for the next voyage. */
  crew: number[];
  sealMarket: { offers: SealOffer[]; day: number; refreshIn: number; nextId: number; nextSeal: number };
  /** Lighthouse repair stages done (0..5) and lantern parts in hand. */
  lighthouse: number;
  parts: number;
  /** Auto voyages on/off (settings; they need boat level 3). */
  auto: boolean;
  /** Voyages completed. */
  voyages: number;
  /** The sunken ship's journal page was found (page 9). */
  wreckPage: boolean;
  /** Seconds left on the giant fish sign at the pier end (0 = none). */
  giant: number;
  /** "Season 1 complete" card shown. */
  seasonShown: boolean;
}

export function createHarborState(): HarborState {
  return {
    upgrades: { boatSpeed: 1, boatCargo: 1, boatCrew: 1, boatLantern: 1 },
    voyage: null,
    lastDest: null,
    returned: null,
    rack: [],
    crates: [],
    pile: 0,
    seals: [],
    crew: [],
    sealMarket: { offers: [], day: 0, refreshIn: 0, nextId: 1, nextSeal: 1 },
    lighthouse: 0,
    parts: 0,
    auto: true,
    voyages: 0,
    wreckPage: false,
    giant: 0,
    seasonShown: false,
  };
}

/** "While you were away" (GDD §18): coins to collect, and the boat's return(s) while away (GDD §25). */
export interface OfflinePending {
  coins: number;
  seconds: number;
  capped: boolean;
  /** Voyages that came back while away: fish on the rack / in crates and treasure coins on the harbour pile. */
  boat?: { voyages: number; fish: number; coins: number; parts: number };
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
    hutLevel: 1,
    market: createMarketState(),
    harbor: createHarborState(),
  };
}

/** True once an unlock zone or a region with this id is done, or a journal page with this id is found. */
export function isDone(state: GameState, id: string): boolean {
  return state.unlocked.includes(id) || state.regions.includes(id) || state.story.pages.includes(id);
}
