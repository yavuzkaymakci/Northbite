import { FishById } from '../content/fish';
import { SaveSettings } from '../settings';
import type { Appearance } from '../models/createPlayer';
import { createGameState, type FishItem, type GameState } from './GameState';

export const SAVE_VERSION = 2;

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

/** Each step upgrades a save by exactly one version. */
const migrations: Record<number, (s: AnySave) => AnySave> = {
  // v1 (Demo 0) only had the player position.
  1: (s) => ({ ...s, saveVersion: 2, game: createGameState() }),
};

function isFishItem(v: unknown): v is FishItem {
  const f = v as FishItem;
  return !!f && typeof f === 'object' && f.species in FishById && typeof f.kg === 'number' && typeof f.price === 'number';
}

/** Fills missing fields and drops corrupted entries so a damaged save never crashes the game. */
function sanitizeGame(raw: unknown): GameState {
  const base = createGameState();
  if (!raw || typeof raw !== 'object') return base;
  const g = raw as Partial<GameState>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  return {
    coins: num(g.coins, 0),
    pile: num(g.pile, 0),
    carried: Array.isArray(g.carried) ? g.carried.filter(isFishItem) : [],
    counter: Array.isArray(g.counter) ? g.counter.filter(isFishItem) : [],
    unlocked: Array.isArray(g.unlocked) ? g.unlocked.filter((u): u is string => typeof u === 'string') : [],
    unlockPaid: g.unlockPaid && typeof g.unlockPaid === 'object' ? { ...g.unlockPaid } : {},
    stats: { ...base.stats, ...(g.stats ?? {}) },
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
