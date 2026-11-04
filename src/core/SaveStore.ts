import { FishById, type FishId } from '../content/fish';
import { UpgradeList, UpgradeMaxLevel } from '../content/upgrades';
import { SaveSettings } from '../settings';
import { sanitizeAppearance, type Appearance } from '../content/appearance';
import { createGameState, type FishItem, type GameState, type WorkerData } from './GameState';

export const SAVE_VERSION = 3;

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
    unlocked: stringList(g.unlocked),
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
