import { DecorationList } from '../content/decorations';
import { FishById, type FishId } from '../content/fish';
import { UpgradeList, UpgradeMaxLevel } from '../content/upgrades';
import { SaveSettings } from '../settings';
import { sanitizeAppearance, type Appearance } from '../content/appearance';
import { Pages } from '../content/story';
import { createCampState, createCaveState, createGameState, type FishItem, type GameState, type WorkerData } from './GameState';

export const SAVE_VERSION = 5;

/** Pure JSON game state. No Three.js objects here. */
export interface SaveData {
  saveVersion: number;
  savedAt: number;
  appearance: Appearance | null;
  player: { x: number; z: number; heading: number };
  game: GameState;
}

export interface SaveStore {
  load(): SaveData | null;
  save(data: SaveData): void;
  clear(): void;
}

type AnySave = Record<string, unknown> & { saveVersion: number };
type Obj = Record<string, unknown>;

/** v2 fish had no `kind`; every fish was raw. */
function addKind(list: unknown): unknown {
  return Array.isArray(list) ? list.map((f) => (f && typeof f === 'object' ? { kind: 'raw', ...(f as Obj) } : f)) : list;
}

/** Each step upgrades a save by exactly one version. */
const migrations: Record<number, (s: AnySave) => AnySave> = {
  // v1 (Demo 0) only had the player position.
  1: (s) => ({ ...s, saveVersion: 2, game: createGameState() }),
  // v2 (Demo 1): raw fish only, no stations, helpers, regions or upgrades. New fields get defaults in sanitizeGame.
  2: (s) => {
    const g = (s.game ?? {}) as Obj;
    return { ...s, saveVersion: 3, game: { ...g, carried: addKind(g.carried), counter: addKind(g.counter) } };
  },
  // v4 (Demo 4): no settings, offline data or station upgrades. sanitizeGame fills them with defaults.
  4: (s) => ({ ...s, saveVersion: 5 }),
  // v3 (Demo 2/3): no clock, day totals, buffs, threat gear, igloo level or sleep. sanitizeGame fills them
  // (day 1, mid-morning, igloo level 1, not rested, empty cave and camp, no journal pages). v4 saves from earlier
  // Demo 4 stages get the same defaults.
  3: (s) => ({ ...s, saveVersion: 4 }),
};

function isFishItem(v: unknown): v is FishItem {
  const f = v as FishItem;
  return (
    !!f &&
    typeof f === 'object' &&
    f.species in FishById &&
    (f.kind === 'raw' || f.kind === 'smoked') &&
    typeof f.kg === 'number' &&
    typeof f.price === 'number'
  );
}

const fishList = (v: unknown): FishItem[] => (Array.isArray(v) ? v.filter(isFishItem) : []);
const stringList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string') : []);

/** Fills missing fields and drops corrupted entries so a damaged save never crashes the game. */
function sanitizeGame(raw: unknown): GameState {
  const base = createGameState();
  if (!raw || typeof raw !== 'object') return base;
  const g = raw as Partial<Record<keyof GameState, unknown>>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);

  const smoker = (g.smoker ?? {}) as Partial<Record<string, unknown>>;
  const clock = (g.clock ?? {}) as Partial<Record<string, unknown>>;
  const today = (g.today ?? {}) as Partial<Record<string, unknown>>;
  const buffs = (g.buffs ?? {}) as Partial<Record<string, unknown>>;
  const threats = (g.threats ?? {}) as Partial<Record<string, unknown>>;
  const rested = (g.rested ?? null) as Partial<Record<string, unknown>> | null;
  const sleep = (g.sleep ?? {}) as Partial<Record<string, unknown>>;
  const cave = (g.cave ?? {}) as Partial<Record<string, unknown>>;
  const camp = (g.camp ?? {}) as Partial<Record<string, unknown>>;
  const story = (g.story ?? {}) as Partial<Record<string, unknown>>;
  const prefs = (g.prefs ?? {}) as Partial<Record<string, unknown>>;
  const caveBase = createCaveState();
  const campBase = createCampState();
  const veins = Array.isArray(cave.veins) ? cave.veins : [];
  const unlocked = stringList(g.unlocked);
  // The igloo level also follows from the upgrade frames already paid (older saves have no field).
  let igloo = Math.floor(num(g.iglooLevel, 1));
  for (const lv of [2, 3, 4]) if (unlocked.includes(`igloo${lv}`)) igloo = Math.max(igloo, lv);
  const upgrades = { ...base.upgrades };
  const rawUp = (g.upgrades ?? {}) as Partial<Record<string, unknown>>;
  for (const u of UpgradeList) {
    const lv = Math.floor(num(rawUp[u.id], 1));
    upgrades[u.id] = Math.min(Math.max(lv, 1), UpgradeMaxLevel);
  }
  const workers: WorkerData[] = Array.isArray(g.workers)
    ? g.workers.map((w) => ({ carried: fishList((w as Partial<WorkerData> | null)?.carried) }))
    : [];

  return {
    coins: num(g.coins, 0),
    pile: num(g.pile, 0),
    carried: fishList(g.carried),
    counter: fishList(g.counter),
    unlocked,
    regions: stringList(g.regions),
    unlockPaid: g.unlockPaid && typeof g.unlockPaid === 'object' ? { ...(g.unlockPaid as Record<string, number>) } : {},
    basket: fishList(g.basket),
    smoker: {
      input: fishList(smoker.input),
      output: fishList(smoker.output),
      progress: Math.min(num(smoker.progress, 0), 1),
    },
    workers,
    upgrades,
    seen: stringList(g.seen).filter((id): id is FishId => id in FishById),
    stats: { ...base.stats, ...((g.stats as object | undefined) ?? {}) },
    clock: {
      day: Math.max(1, Math.floor(num(clock.day, 1))),
      t: typeof clock.t === 'number' && clock.t >= 0 && clock.t < 1 ? clock.t : base.clock.t,
    },
    today: { coins: num(today.coins, 0), caught: num(today.caught, 0), sold: num(today.sold, 0) },
    buffs: { aurora: num(buffs.aurora, 0) },
    threats: {
      torches: Math.floor(num(threats.torches, 0)),
      bait: isFishItem(threats.bait) && threats.bait.kind === 'raw' ? threats.bait : null,
      fur: Math.floor(num(threats.fur, 0)),
    },
    iglooLevel: Math.min(Math.max(igloo, 1), 4),
    // Paid decoration frames are the source of truth (a missing list is rebuilt from them).
    decorations: DecorationList.map((d) => d.id as string).filter((id) => unlocked.includes(id)),
    rested:
      rested && typeof rested.quality === 'number' && typeof rested.until === 'number'
        ? { quality: Math.min(Math.max(Math.floor(rested.quality), 1), 4), until: rested.until }
        : null,
    sleep: { lastDay: num(sleep.lastDay, 0), hintDay: num(sleep.hintDay, 0), hintDone: sleep.hintDone === true },
    cave: {
      veins: caveBase.veins.map((d, i) => num(veins[i], d)),
      input: Math.floor(num(cave.input, 0)),
      output: Math.floor(num(cave.output, 0)),
      progress: Math.min(num(cave.progress, 0), 1),
      collectorIn: num(cave.collectorIn, caveBase.collectorIn),
      pile: num(cave.pile, 0),
      mined: num(cave.mined, 0),
    },
    camp: {
      input: fishList(camp.input).filter((f) => f.kind === 'smoked'),
      plates: Array.isArray(camp.plates) ? camp.plates.filter((v): v is number => typeof v === 'number' && v >= 0) : campBase.plates,
      progress: Math.min(num(camp.progress, 0), 1),
      pile: num(camp.pile, 0),
      served: num(camp.served, 0),
    },
    carriedCrystals: Math.floor(num(g.carriedCrystals, 0)),
    story: { pages: stringList(story.pages).filter((id) => Pages.some((p) => p.id === id)) },
    prefs: {
      threats: prefs.threats !== false,
      dayLength: prefs.dayLength === 'short' || prefs.dayLength === 'long' ? prefs.dayLength : 'medium',
      vibration: prefs.vibration !== false,
      lang: prefs.lang === 'tr' || prefs.lang === 'en' ? prefs.lang : '',
    },
  };
}

/** Brings older saves up to SAVE_VERSION. Returns null for unreadable or future saves. */
export function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  let s = raw as AnySave;
  if (typeof s.saveVersion !== 'number' || s.saveVersion > SAVE_VERSION) return null;
  while (s.saveVersion < SAVE_VERSION) {
    const step = migrations[s.saveVersion];
    if (!step) return null;
    s = step(s);
  }
  const data = s as unknown as SaveData;
  if (!data.player || typeof data.player.x !== 'number' || typeof data.player.z !== 'number') return null;
  data.game = sanitizeGame(data.game);
  // Demo 0–3 saves have no appearance (null); the game then uses the default look without asking.
  data.appearance = sanitizeAppearance(data.appearance);
  return data;
}

export class LocalSaveStore implements SaveStore {
  constructor(private readonly key: string = SaveSettings.storageKey) {}

  load(): SaveData | null {
    try {
      let text = localStorage.getItem(this.key);
      for (const legacy of SaveSettings.legacyStorageKeys) {
        if (text) break;
        text = localStorage.getItem(legacy);
      }
      return text ? migrate(JSON.parse(text)) : null;
    } catch {
      return null;
    }
  }

  save(data: SaveData): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch {
      // Storage full or blocked (private mode). The game keeps running without saving.
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch {
      // ignore
    }
  }
}
