import { DecorationList } from '../content/decorations';
import { FishById, type FishId } from '../content/fish';
import { UpgradeList, UpgradeMaxLevel } from '../content/upgrades';
import { StationUpgradeList } from '../content/stationUpgrades';
import { SaveSettings } from '../settings';
import { sanitizeAppearance, type Appearance } from '../content/appearance';
import { Pages } from '../content/story';
import { OrderTemplates } from '../content/orders';
import { AudioMix } from '../content/audio';
import { Hut, PenguinLooks, PenguinNames, TraitById, TraitList, type TraitId } from '../content/penguins';
import { RoleById, type RoleId } from '../content/roles';
import { levelForXp, randomLook } from '../systems/PenguinLogic';
import { BoatUpgradeList, Lighthouse, SealMarket, SealNames, SealRoleById, type SealRoleId } from '../content/harbor';
import { DestinationById, VoyageEvents, type DestinationId, type VoyageEventId } from '../content/voyages';
import { seededRandom } from './Random';
import {
  createMarketState,
  createHarborState,
  type HarborState,
  type OfflinePending,
  createCampState,
  createCaveState,
  createCodexState,
  createGameState,
  createOrdersState,
  type CodexState,
  type FishItem,
  type GameState,
  type Order,
  type OrdersState,
  type GoodItem,
  type MarketState,
  type PenguinLook,
  type WorkerData,
  type WorkerItem,
} from './GameState';

export const SAVE_VERSION = 7;

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
  // v5 (Demo 5–7A): penguins had no identity (GDD §24). They are kept: the 1st becomes a carrier, the 2nd a smoker
  // (carrier while there is no smokehouse); names, traits and looks come from a fixed seed. The old "2nd penguin"
  // frame is gone: a save that bought it gets the market stall instead; coins half-poured into it come back.
  5: (s) => {
    const g = { ...((s.game ?? {}) as Obj) };
    const unlocked = stringList(g.unlocked);
    const smokehouse = unlocked.includes('smokehouse');
    const rand = seededRandom(SaveSettings.penguinSeed);
    const used = new Set<number>();
    const old = Array.isArray(g.workers) ? (g.workers as unknown[]) : [];
    g.workers = old.map((w, i) => {
      let name = Math.floor(rand() * PenguinNames.tr.length);
      while (used.has(name)) name = (name + 1) % PenguinNames.tr.length;
      used.add(name);
      return {
        id: i + 1,
        name,
        role: i === 0 || !smokehouse ? 'carrier' : 'smoker',
        trait: TraitList[Math.floor(rand() * TraitList.length)]?.id ?? 'balanced',
        level: 1,
        xp: 0,
        look: randomLook(rand),
        price: 0,
        carried: (w as Partial<WorkerData> | null)?.carried ?? [],
      };
    });
    if (unlocked.includes('penguin2') && !unlocked.includes('market')) unlocked.push('market');
    const paid = { ...((g.unlockPaid ?? {}) as Record<string, number>) };
    const refund = n0(paid.penguin2);
    delete paid.penguin2;
    g.unlocked = unlocked;
    g.unlockPaid = paid;
    g.coins = n0(g.coins) + refund;
    g.market = { offers: [], day: 0, refreshIn: 0, nextId: 1, nextPenguin: old.length + 1 };
    return { ...s, saveVersion: 6, game: g };
  },
  // v6 (Demo 7B): no Harbour Pier (GDD §25). sanitizeGame gives the default harbour (no boat, no voyage, no seals,
  // lighthouse at 0, auto voyages on). Nothing else changes: the old "coming soon" wall is now the harbour's deed wall.
  6: (s) => ({ ...s, saveVersion: 7 }),
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
    typeof f.price === 'number' &&
    (f.variant === undefined || f.variant === 'gold' || f.variant === 'rainbow')
  );
}

const isFishId = (v: unknown): v is FishId => typeof v === 'string' && v in FishById;
const fishIds = (v: unknown): FishId[] => (Array.isArray(v) ? v.filter(isFishId) : []);
const n0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** Volumes 0..1 (defaults for missing or broken values) and mute. */
function sanitizeAudio(raw: unknown): GameState['prefs']['audio'] {
  const a = (raw ?? {}) as Partial<Record<string, unknown>>;
  const vol = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);
  const d = AudioMix.defaults;
  return { master: vol(a.master, d.master), music: vol(a.music, d.music), sfx: vol(a.sfx, d.sfx), ambience: vol(a.ambience, d.ambience), mute: a.mute === true };
}

/** Encyclopedia: older saves have only `seen`; those species count as discovered with unknown records. */
function sanitizeCodex(raw: unknown, seen: FishId[]): CodexState {
  const c = createCodexState();
  const g = (raw ?? {}) as Partial<Record<string, unknown>>;
  const species = (g.species ?? {}) as Record<string, Partial<Record<string, unknown>> | undefined>;
  for (const id of seen) {
    const r = species[id] ?? {};
    c.species[id] = { count: Math.floor(n0(r.count)), bestKg: n0(r.bestKg), firstDay: Math.floor(n0(r.firstDay)) };
  }
  const variants = (g.variants ?? {}) as Partial<Record<string, unknown>>;
  c.variants = { gold: fishIds(variants.gold), rainbow: fishIds(variants.rainbow) };
  c.rewards = stringList(g.rewards);
  c.title = g.title === true;
  c.rareBait = n0(g.rareBait);
  c.fresh = fishIds(g.fresh).filter((id) => seen.includes(id));
  return c;
}

function sanitizeOrders(raw: unknown): OrdersState {
  const o = createOrdersState();
  const g = (raw ?? {}) as Partial<Record<string, unknown>>;
  const kinds = OrderTemplates.map((t) => t.kind as string);
  if (Array.isArray(g.active)) {
    for (const a of g.active as Array<Partial<Order> | null>) {
      if (!a || !kinds.includes(a.kind as string) || typeof a.amount !== 'number' || a.amount <= 0) continue;
      if (a.kind === 'species' && !isFishId(a.species)) continue;
      o.active.push({
        id: Math.floor(n0(a.id)),
        kind: a.kind as Order['kind'],
        amount: a.amount,
        ...(a.species ? { species: a.species } : {}),
        timeLeft: n0(a.timeLeft),
        reward: Math.floor(n0(a.reward)),
        extra: a.extra === 'rareBait' || a.extra === 'fur' || a.extra === 'decorPiece' || a.extra === 'pageHint' ? a.extra : null,
      });
    }
  }
  o.active = o.active.slice(0, 3);
  o.refill = Array.isArray(g.refill) ? g.refill.map(n0).slice(0, 3) : [];
  o.rerollIn = n0(g.rerollIn);
  o.nextId = Math.max(Math.floor(n0(g.nextId)), ...o.active.map((a) => a.id + 1), 1);
  o.firstGiven = g.firstGiven === true;
  o.done = Math.floor(n0(g.done));
  return o;
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
  const pending = (g.offlinePending ?? null) as Partial<Record<string, unknown>> | null;
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
  const seen = stringList(g.seen).filter((id): id is FishId => id in FishById);
  const stationUpgrades = { ...base.stationUpgrades };
  const rawSt = (g.stationUpgrades ?? {}) as Partial<Record<string, unknown>>;
  for (const u of StationUpgradeList) {
    stationUpgrades[u.id] = Math.min(Math.max(Math.floor(num(rawSt[u.id], 1)), 1), UpgradeMaxLevel);
  }
  const workers = sanitizeWorkers(g.workers);
  const market = sanitizeMarket(g.market, workers);
  // The hut always has room for the penguins it holds.
  let hutLevel = Math.min(Math.max(Math.floor(num(g.hutLevel, 1)), 1), Hut.capacity.length);
  while (hutLevel < Hut.capacity.length && (Hut.capacity[hutLevel - 1] as number) < workers.length) hutLevel++;

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
    stationUpgrades,
    seen,
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
      audio: sanitizeAudio(prefs.audio),
      quality: prefs.quality === 'low' || prefs.quality === 'high' ? prefs.quality : 'medium',
      reduceMotion: prefs.reduceMotion === true,
      showFps: prefs.showFps === true,
      qualityAsked: prefs.qualityAsked === true,
      debugTools: prefs.debugTools === true,
    },
    lastSeenAt: num(g.lastSeenAt, 0),
    offlinePending: sanitizePending(pending),
    codex: sanitizeCodex(g.codex, seen),
    orders: sanitizeOrders(g.orders),
    hutLevel,
    market,
    harbor: sanitizeHarbor(g.harbor),
  };
}

/** "While you were away": coins and / or the boat's returns; anything else (or nothing to show) is dropped. */
function sanitizePending(p: Partial<Record<string, unknown>> | null): OfflinePending | null {
  if (!p) return null;
  const coins = Math.floor(n0(p.coins));
  const b = (p.boat ?? null) as Partial<Record<string, unknown>> | null;
  const boat = b && n0(b.voyages) > 0 ? { voyages: Math.floor(n0(b.voyages)), fish: Math.floor(n0(b.fish)), coins: Math.floor(n0(b.coins)), parts: Math.floor(n0(b.parts)) } : undefined;
  if (coins <= 0 && !boat) return null;
  return { coins, seconds: n0(p.seconds), capped: p.capped === true, ...(boat ? { boat } : {}) };
}

const isDest = (v: unknown): v is DestinationId => typeof v === 'string' && v in DestinationById;
const isEvent = (v: unknown): v is VoyageEventId => typeof v === 'string' && v in VoyageEvents;
const isSealRole = (v: unknown): v is SealRoleId => typeof v === 'string' && v in SealRoleById;
const deepOk = (list: FishItem[]) => list.filter((f) => f.variant === undefined || !FishById[f.species].deep);

/**
 * Harbour Pier (GDD §25). The boat animation is never saved: the game rebuilds the boat from the repair stages and
 * the voyage. Broken fields fall back one by one; loot is never dropped (fish that fail the check are the only loss).
 */
function sanitizeHarbor(raw: unknown): HarborState {
  const h = createHarborState();
  const g = (raw ?? {}) as Partial<Record<string, unknown>>;
  const up = (g.upgrades ?? {}) as Partial<Record<string, unknown>>;
  for (const u of BoatUpgradeList) h.upgrades[u.id] = Math.min(Math.max(Math.floor(n0(up[u.id]) || 1), 1), UpgradeMaxLevel);
  const v = (g.voyage ?? null) as Partial<Record<string, unknown>> | null;
  if (v && isDest(v.dest)) {
    const total = n0(v.total) || DestinationById[v.dest].duration;
    h.voyage = {
      dest: v.dest,
      left: Math.min(n0(v.left), total),
      total,
      crew: Array.isArray(v.crew) ? v.crew.filter((x): x is number => typeof x === 'number') : [],
      event: isEvent(v.event) ? v.event : null,
      nightDelay: v.nightDelay === true,
    };
  }
  h.lastDest = isDest(g.lastDest) ? g.lastDest : null;
  const r = (g.returned ?? null) as Partial<Record<string, unknown>> | null;
  if (r && isDest(r.dest)) {
    h.returned = {
      dest: r.dest,
      fish: Math.floor(n0(r.fish)),
      coins: Math.floor(n0(r.coins)),
      parts: Math.floor(n0(r.parts)),
      bait: r.bait === true,
      decor: r.decor === true,
      page: r.page === true,
      event: isEvent(r.event) ? r.event : null,
      value: Math.floor(n0(r.value)),
    };
  }
  h.rack = deepOk(fishList(g.rack));
  h.crates = deepOk(fishList(g.crates));
  h.pile = n0(g.pile);
  const ids = new Set<number>();
  if (Array.isArray(g.seals)) {
    (g.seals as Array<Partial<Record<string, unknown>> | null>).forEach((s, i) => {
      if (!s) return;
      let id = Math.floor(n0(s.id));
      if (id <= 0 || ids.has(id)) id = 1000 + i;
      ids.add(id);
      h.seals.push({
        id,
        name: Math.floor(n0(s.name)) % SealNames.tr.length,
        role: isSealRole(s.role) ? s.role : 'fisher',
        scarf: Math.floor(n0(s.scarf)) % SealMarket.scarves,
        price: Math.floor(n0(s.price)),
      });
    });
  }
  h.crew = Array.isArray(g.crew) ? g.crew.filter((x): x is number => typeof x === 'number' && ids.has(x)) : h.seals.map((s) => s.id);
  const m = (g.sealMarket ?? {}) as Partial<Record<string, unknown>>;
  if (Array.isArray(m.offers)) {
    for (const o of m.offers as Array<Partial<Record<string, unknown>> | null>) {
      if (!o || !isSealRole(o.role)) continue;
      h.sealMarket.offers.push({ id: Math.floor(n0(o.id)), name: Math.floor(n0(o.name)) % SealNames.tr.length, role: o.role, scarf: Math.floor(n0(o.scarf)) % SealMarket.scarves });
    }
  }
  h.sealMarket.offers = h.sealMarket.offers.slice(0, SealMarket.offersMax);
  h.sealMarket.day = Math.floor(n0(m.day));
  h.sealMarket.refreshIn = n0(m.refreshIn);
  h.sealMarket.nextId = Math.max(Math.floor(n0(m.nextId)), ...h.sealMarket.offers.map((o) => o.id + 1), 1);
  h.sealMarket.nextSeal = Math.max(Math.floor(n0(m.nextSeal)), ...h.seals.map((s) => s.id + 1), 1);
  h.lighthouse = Math.min(Math.floor(n0(g.lighthouse)), Lighthouse.stageCosts.length);
  h.parts = Math.floor(n0(g.parts));
  h.auto = g.auto !== false;
  h.voyages = Math.floor(n0(g.voyages));
  h.wreckPage = g.wreckPage === true;
  h.giant = n0(g.giant);
  h.seasonShown = g.seasonShown === true;
  return h;
}

const isRole = (v: unknown): v is RoleId => typeof v === 'string' && v in RoleById;
const isTrait = (v: unknown): v is TraitId => typeof v === 'string' && v in TraitById;

function sanitizeLook(raw: unknown): PenguinLook {
  const l = (raw ?? {}) as Partial<Record<string, unknown>>;
  const hat = typeof l.hat === 'number' && Number.isInteger(l.hat) && l.hat >= -1 && l.hat < PenguinLooks.hats ? l.hat : -1;
  const scarf = typeof l.scarf === 'number' && Number.isInteger(l.scarf) && l.scarf >= 0 && l.scarf < PenguinLooks.scarves ? l.scarf : 0;
  return { hat, scarf };
}

function isWorkerItem(v: unknown): v is WorkerItem {
  if (isFishItem(v)) return true;
  const g = v as GoodItem;
  return !!g && typeof g === 'object' && (g.kind === 'crystal' || g.kind === 'plate') && typeof g.price === 'number' && g.price >= 0;
}

/** Penguins (GDD §24): broken fields fall back one by one; a penguin is never dropped. */
function sanitizeWorkers(raw: unknown): WorkerData[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<number>();
  return raw.map((r, i) => {
    const w = (r ?? {}) as Partial<Record<string, unknown>>;
    let id = Math.floor(n0(w.id));
    if (id <= 0 || ids.has(id)) id = 1000 + i;
    ids.add(id);
    const xp = n0(w.xp);
    return {
      id,
      name: typeof w.name === 'number' && Number.isInteger(w.name) && w.name >= 0 && w.name < PenguinNames.tr.length ? w.name : i % PenguinNames.tr.length,
      role: isRole(w.role) ? w.role : 'carrier',
      trait: isTrait(w.trait) ? w.trait : 'balanced',
      level: levelForXp(xp),
      xp,
      look: sanitizeLook(w.look),
      price: Math.floor(n0(w.price)),
      carried: Array.isArray(w.carried) ? w.carried.filter(isWorkerItem) : [],
    };
  });
}

function sanitizeMarket(raw: unknown, workers: WorkerData[]): MarketState {
  const m = createMarketState();
  const g = (raw ?? {}) as Partial<Record<string, unknown>>;
  if (Array.isArray(g.offers)) {
    for (const o of g.offers as Array<Partial<Record<string, unknown>> | null>) {
      if (!o || !isRole(o.role) || !isTrait(o.trait) || typeof o.name !== 'number') continue;
      m.offers.push({ id: Math.floor(n0(o.id)), name: Math.floor(n0(o.name)) % PenguinNames.tr.length, role: o.role, trait: o.trait, look: sanitizeLook(o.look) });
    }
  }
  m.offers = m.offers.slice(0, 4);
  m.day = Math.floor(n0(g.day));
  m.refreshIn = n0(g.refreshIn);
  m.nextId = Math.max(Math.floor(n0(g.nextId)), ...m.offers.map((o) => o.id + 1), 1);
  m.nextPenguin = Math.max(Math.floor(n0(g.nextPenguin)), ...workers.map((w) => w.id + 1), 1);
  return m;
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
