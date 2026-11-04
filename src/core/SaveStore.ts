import { SaveSettings } from '../settings';
import type { Appearance } from '../models/createPlayer';

export const SAVE_VERSION = 1;

/** Pure JSON game state. No Three.js objects here. */
export interface SaveData {
  saveVersion: number;
  savedAt: number;
  appearance: Appearance | null;
  player: { x: number; z: number; heading: number };
}

export interface SaveStore {
  load(): SaveData | null;
  save(data: SaveData): void;
  clear(): void;
}

/** Brings older saves up to SAVE_VERSION. Add a case per version bump. */
export function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<SaveData>;
  if (typeof data.saveVersion !== 'number') return null;
  // No older versions exist yet. Future: if (data.saveVersion === 1) { ...; data.saveVersion = 2; }
  if (data.saveVersion !== SAVE_VERSION) return null;
  return data as SaveData;
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
