import { Boat, BoatUpgradeById, BoatUpgradeList, GiantFish, Lighthouse, SealMarket, SealNames, SealRoleById, SealRoleList, type BoatUpgradeId, type SealRoleId } from '../content/harbor';
import { DestinationById, Destinations, VoyageEvents, VoyageRules, type DestinationDef, type DestinationId, type VoyageEventId } from '../content/voyages';
import { scaledPrice } from '../content/tuning';
import { UpgradeMaxLevel } from '../content/upgrades';
import type { FishItem, GameState, SealData, Voyage, VoyageReturn } from '../core/GameState';
import { recordCatch } from './CodexLogic';
import { rollWeighted, type HookedFish } from './FishRoll';
import { payDecorPiece } from './OrderLogic';

// Harbour Pier rules (GDD §25): boat repair and upgrades, the voyage state machine (ready → at sea → back with loot →
// collected), loot, seals and the lighthouse. No Three.js, no DOM: the game, the offline formula and the balance sim
// share every rule here. Voyage time is real time: it runs on while the game is closed.

const pickInt = (range: readonly [number, number], rand: () => number) => range[0] + Math.floor(rand() * (range[1] - range[0] + 1));

// ---------- boat ----------

/** Boat repair stages done (0 = rotten hull … 3 = cabin, seaworthy). */
export function boatStage(state: GameState): number {
  return (['boatHull', 'boatSail', 'boatCabin'] as const).filter((id) => state.unlocked.includes(id)).length;
}

export function boatReady(state: GameState): boolean {
  return state.regions.includes('harbor') && state.unlocked.includes('boatCabin');
}

export function boatUpgradeValue(id: BoatUpgradeId, level: number): number {
  const v = BoatUpgradeById[id].values;
  return v[Math.min(Math.max(level, 1), v.length) - 1] as number;
}

export function boatValue(state: GameState, id: BoatUpgradeId): number {
  return boatUpgradeValue(id, state.harbor.upgrades[id]);
}

/** Price of the next level, or null at the top. */
export function boatUpgradeCost(id: BoatUpgradeId, level: number): number | null {
  if (level >= UpgradeMaxLevel) return null;
  const u = BoatUpgradeById[id];
  return scaledPrice(u.baseCost * Math.pow(u.growth, level - 1));
}

export function buyBoatUpgrade(state: GameState, id: BoatUpgradeId): boolean {
  const cost = boatUpgradeCost(id, state.harbor.upgrades[id]);
  if (cost === null || state.coins < cost || !boatReady(state)) return false;
  state.coins -= cost;
  state.harbor.upgrades[id]++;
  return true;
}

/** Boat level: 1 for the repaired boat, +1 for every `levelPerUpgrades` upgrade levels bought. */
export function boatLevel(state: GameState): number {
  const bought = BoatUpgradeList.reduce((n, u) => n + state.harbor.upgrades[u.id] - 1, 0);
  return 1 + Math.floor(bought / Boat.levelPerUpgrades);
}

export function autoVoyageUnlocked(state: GameState): boolean {
  return boatReady(state) && boatLevel(state) >= Boat.autoLevel;
}

export function rackCapacity(state: GameState): number {
  return boatValue(state, 'boatCargo');
}

export function crewSlots(state: GameState): number {
  return boatValue(state, 'boatCrew');
}

// ---------- voyages ----------

export type VoyagePhase = 'locked' | 'ready' | 'out' | 'returned';

export function voyagePhase(state: GameState): VoyagePhase {
  const h = state.harbor;
  if (!boatReady(state)) return 'locked';
  if (h.voyage) return 'out';
  return h.returned ? 'returned' : 'ready';
}

export function destinationOpen(state: GameState, d: DestinationDef): boolean {
  return d.unlockAfter !== null && state.harbor.voyages >= d.unlockAfter;
}

export function voyageCost(d: DestinationDef): number {
  return scaledPrice(d.cost);
}

/** Seals going on the next voyage: picked ones that still exist, no more than the crew places. */
export function crewAboard(state: GameState): SealData[] {
  const h = state.harbor;
  return h.crew
    .map((id) => h.seals.find((s) => s.id === id))
    .filter((s): s is SealData => !!s)
    .slice(0, crewSlots(state));
}

/** Seconds a voyage takes right now (before its event): base × the speed upgrade × the debug multiplier. */
export function voyageDuration(state: GameState, d: DestinationDef, debugMul = 1): number {
  return d.duration * boatValue(state, 'boatSpeed') * debugMul;
}

function rollEvent(rand: () => number): VoyageEventId | null {
  if (rand() >= VoyageRules.eventChance) return null;
  const ids = Object.keys(VoyageEvents) as VoyageEventId[];
  const total = ids.reduce((n, id) => n + VoyageEvents[id].weight, 0);
  let r = rand() * total;
  for (const id of ids) {
    r -= VoyageEvents[id].weight;
    if (r <= 0) return id;
  }
  return ids[ids.length - 1] as VoyageEventId;
}

export type DepartResult = { ok: true; voyage: Voyage } | { ok: false; reason: 'boat' | 'busy' | 'locked' | 'coins' };

/**
 * Sets sail: pays the supplies, takes the picked crew, rolls the sea's event (known at once, shown on the panel).
 * Leaving at night without a lantern may add a small delay. Collecting the last return happens here too.
 */
export function departVoyage(state: GameState, id: DestinationId, night: boolean, rand: () => number, debugMul = 1): DepartResult {
  const h = state.harbor;
  const d = DestinationById[id];
  if (!boatReady(state)) return { ok: false, reason: 'boat' };
  if (h.voyage) return { ok: false, reason: 'busy' };
  if (!destinationOpen(state, d)) return { ok: false, reason: 'locked' };
  const cost = voyageCost(d);
  if (state.coins < cost) return { ok: false, reason: 'coins' };
  state.coins -= cost;
  h.returned = null;
  const event = rollEvent(rand);
  const nightDelay = night && rand() < boatValue(state, 'boatLantern');
  const total = voyageDuration(state, d, debugMul) * (event ? VoyageEvents[event].timeMul : 1) * (nightDelay ? 1 + Boat.nightDelay : 1);
  const voyage: Voyage = { dest: id, left: total, total, crew: crewAboard(state).map((s) => s.id), event, nightDelay };
  h.voyage = voyage;
  h.lastDest = id;
  return { ok: true, voyage };
}

/** Loot of one voyage (fish and treasure), before it is stored. */
export interface Loot {
  fish: FishItem[];
  coins: number;
  parts: number;
  bait: boolean;
  decor: boolean;
  page: boolean;
}

/** Fisher and explorer seals aboard (each adds its role's bonus). */
function crewBonus(state: GameState, crew: readonly number[]): { fish: number; rare: number } {
  let fish = 0;
  let rare = 0;
  for (const id of crew) {
    const s = state.harbor.seals.find((x) => x.id === id);
    if (!s) continue;
    fish += SealRoleById[s.role].fishBonus;
    rare += SealRoleById[s.role].rareBonus;
  }
  return { fish, rare };
}

/** What the sea gives for this voyage (fish count × seals × event; treasure, part and bait chances × explorers). */
export function rollLoot(state: GameState, d: DestinationDef, crew: readonly number[], event: VoyageEventId | null, rand: () => number): Loot {
  const bonus = crewBonus(state, crew);
  const ev = event ? VoyageEvents[event] : null;
  const count = Math.max(1, Math.round(pickInt(d.fish, rand) * (1 + bonus.fish) * (ev?.lootMul ?? 1)) + (ev?.extraFish ?? 0));
  const fish: FishItem[] = [];
  for (let i = 0; i < count; i++) fish.push({ ...rollWeighted(d.pool, rand, bonus.rare, VoyageRules.deepSizeBonus).item, fromSea: true });
  const chance = (p: number) => p >= 1 || rand() < Math.min(p * (1 + bonus.rare), 1);
  const treasure = chance(d.treasure);
  const coins = treasure ? Math.round(pickInt(d.treasureCoins, rand) * (ev?.lootMul ?? 1)) : 0;
  return {
    fish,
    coins,
    parts: chance(d.part) ? 1 : 0,
    bait: chance(d.bait),
    decor: treasure && d.decorChance > 0 && rand() < d.decorChance,
    page: treasure && !!d.page && !state.harbor.wreckPage,
  };
}

/** Puts fish on the loot rack; what does not fit goes into crates on the pier (never lost). */
export function storeLoot(state: GameState, fish: readonly FishItem[]): void {
  const h = state.harbor;
  const cap = rackCapacity(state);
  for (const f of fish) (h.rack.length < cap ? h.rack : h.crates).push(f);
}

/** Crates refill the rack whenever it has room. */
export function refillRack(state: GameState): number {
  const h = state.harbor;
  const cap = rackCapacity(state);
  let n = 0;
  while (h.rack.length < cap && h.crates.length > 0) {
    h.rack.push(h.crates.shift() as FishItem);
    n++;
  }
  return n;
}

/** All loot waiting at the pier (rack + crates). */
export function lootWaiting(state: GameState): number {
  return state.harbor.rack.length + state.harbor.crates.length;
}

/**
 * The boat is back: loot is rolled and stored (rack, crates, the harbour pile, parts, bait, a decoration piece, the
 * wreck's page flag), the encyclopedia records the new fish. Runs exactly once per voyage (the voyage is cleared
 * here), so nothing can be counted twice — online, offline or in the sim.
 */
export function finishVoyage(state: GameState, rand: () => number): VoyageReturn | null {
  const h = state.harbor;
  const v = h.voyage;
  if (!v) return null;
  const d = DestinationById[v.dest];
  const loot = rollLoot(state, d, v.crew, v.event, rand);
  h.voyage = null;
  storeLoot(state, loot.fish);
  for (const f of loot.fish) recordCatch(state, f);
  h.pile += loot.coins;
  h.parts += loot.parts;
  if (loot.bait) state.codex.rareBait += VoyageRules.baitSeconds;
  if (loot.decor) payDecorPiece(state);
  if (loot.page) h.wreckPage = true;
  h.voyages++;
  if (v.dest === 'wreck') h.wrecks++;
  const ret: VoyageReturn = {
    dest: v.dest,
    fish: loot.fish.length,
    coins: loot.coins,
    parts: loot.parts,
    bait: loot.bait,
    decor: loot.decor,
    page: loot.page,
    event: v.event,
    value: loot.fish.reduce((n, f) => n + f.price, 0) + loot.coins,
  };
  h.returned = ret;
  return ret;
}

/** Advances the voyage at sea by `dt` real seconds. Returns the loot summary when it came back. */
export function tickVoyage(state: GameState, dt: number, rand: () => number): VoyageReturn | null {
  const v = state.harbor.voyage;
  if (!v) return null;
  v.left = Math.max(v.left - dt, 0);
  return v.left <= 0 ? finishVoyage(state, rand) : null;
}

/** The player saw the return (opened the panel or took loot): "returned" → "collected" (ready). */
export function collectReturn(state: GameState): void {
  state.harbor.returned = null;
}

/** Auto voyage wanted now: on, unlocked, boat idle, a last destination that is still open and affordable. */
export function autoVoyageDue(state: GameState): DestinationId | null {
  const h = state.harbor;
  if (!h.auto || !autoVoyageUnlocked(state) || h.voyage || !h.lastDest) return null;
  const d = DestinationById[h.lastDest];
  return destinationOpen(state, d) && state.coins >= voyageCost(d) ? d.id : null;
}

/**
 * While the game was closed (GDD §25): the voyage at sea runs on and comes back; auto voyages may leave again from
 * the time left, at most `VoyageRules.offlineAutoVoyages` more times. Returns what came back.
 */
export function advanceVoyagesOffline(state: GameState, seconds: number, rand: () => number): VoyageReturn[] {
  const out: VoyageReturn[] = [];
  let left = seconds;
  let autos = 0;
  for (;;) {
    const v = state.harbor.voyage;
    if (v) {
      if (left < v.left) {
        v.left -= left;
        break;
      }
      left -= v.left;
      const r = finishVoyage(state, rand);
      if (r) out.push(r);
    }
    const next = autoVoyageDue(state);
    if (!next || autos >= VoyageRules.offlineAutoVoyages || left <= 0) break;
    // The clock does not move while away: no night delay.
    if (!departVoyage(state, next, false, rand).ok) break;
    autos++;
  }
  return out;
}

// ---------- giant fish ----------

/** A giant deep-sea fish for the sign at the pier end: heavy end of the range, a harder fight (GDD §25). */
export function rollGiant(rand: () => number): HookedFish {
  const f = rollWeighted(GiantFish.pool, rand, 0, 0.5);
  return { ...f, difficulty: f.difficulty * GiantFish.difficulty };
}

export function giantBonus(rand: () => number): number {
  return pickInt(GiantFish.bonusCoins, rand);
}

// ---------- seals (crew) ----------

export function sealsOpen(state: GameState): boolean {
  return state.regions.includes('harbor') && state.unlocked.includes(SealMarket.requires);
}

export function sealName(s: { name: number }, lang: 'tr' | 'en'): string {
  return SealNames[lang][s.name] ?? SealNames[lang][0] ?? '';
}

/** Seals are limited by the boat's crew places (they do not live in the penguin hut). */
export function sealRoom(state: GameState): number {
  return crewSlots(state) - state.harbor.seals.length;
}

export function sealPrice(state: GameState, role: SealRoleId): number {
  return scaledPrice(SealRoleById[role].price * Math.pow(SealMarket.growth, state.harbor.seals.length));
}

function freshSealName(state: GameState, rand: () => number): number {
  const m = state.harbor;
  const used = new Set([...m.seals.map((s) => s.name), ...m.sealMarket.offers.map((o) => o.name)]);
  const free = SealNames.tr.map((_, i) => i).filter((i) => !used.has(i));
  const list = free.length > 0 ? free : SealNames.tr.map((_, i) => i);
  return list[Math.floor(rand() * list.length) % list.length] as number;
}

export function refreshSeals(state: GameState, rand: () => number): void {
  const m = state.harbor.sealMarket;
  m.offers = [];
  const n = SealMarket.offersMin + Math.floor(rand() * (SealMarket.offersMax - SealMarket.offersMin + 1));
  for (let i = 0; i < n; i++) {
    const role = (SealRoleList[i % SealRoleList.length] ?? SealRoleList[0])!.id;
    m.offers.push({ id: m.nextId++, name: freshSealName(state, rand), role, scarf: Math.floor(rand() * SealMarket.scarves) });
  }
}

/** Timers; a new game day brings new seals (only once the boat is repaired). */
export function updateSealMarket(state: GameState, dt: number, rand: () => number): void {
  const m = state.harbor.sealMarket;
  m.refreshIn = Math.max(m.refreshIn - dt, 0);
  if (!sealsOpen(state)) return;
  if (m.day !== state.clock.day) {
    m.day = state.clock.day;
    refreshSeals(state, rand);
  }
}

export function rerollSeals(state: GameState, rand: () => number): boolean {
  const m = state.harbor.sealMarket;
  if (m.refreshIn > 0 || !sealsOpen(state)) return false;
  refreshSeals(state, rand);
  m.refreshIn = SealMarket.refreshCooldown;
  return true;
}

export type SealBuyResult = { ok: true; seal: SealData } | { ok: false; reason: 'full' | 'coins' | 'gone' | 'closed' };

/** Buys a seal; it joins the crew picked for the next voyage at once. */
export function buySeal(state: GameState, offerId: number): SealBuyResult {
  const h = state.harbor;
  const o = h.sealMarket.offers.find((x) => x.id === offerId);
  if (!o) return { ok: false, reason: 'gone' };
  if (!sealsOpen(state)) return { ok: false, reason: 'closed' };
  if (sealRoom(state) <= 0) return { ok: false, reason: 'full' };
  const price = sealPrice(state, o.role);
  if (state.coins < price) return { ok: false, reason: 'coins' };
  state.coins -= price;
  h.sealMarket.offers.splice(h.sealMarket.offers.indexOf(o), 1);
  const seal: SealData = { id: h.sealMarket.nextSeal++, name: o.name, role: o.role, scarf: o.scarf, price };
  h.seals.push(seal);
  if (!h.crew.includes(seal.id)) h.crew.push(seal.id);
  return { ok: true, seal };
}

/** Picks or drops a seal for the next voyage (no more than the crew places). */
export function toggleCrew(state: GameState, sealId: number): boolean {
  const h = state.harbor;
  const i = h.crew.indexOf(sealId);
  if (i >= 0) {
    h.crew.splice(i, 1);
    return true;
  }
  if (!h.seals.some((s) => s.id === sealId) || crewAboard(state).length >= crewSlots(state)) return false;
  h.crew.push(sealId);
  return true;
}

// ---------- lighthouse (season goal) ----------

export function lighthouseDone(state: GameState): boolean {
  return state.harbor.lighthouse >= Lighthouse.stageCosts.length;
}

/** Coins for the next lighthouse stage, or null when it is finished. */
export function lighthouseCost(state: GameState): number | null {
  const c = Lighthouse.stageCosts[state.harbor.lighthouse];
  return c === undefined ? null : scaledPrice(c);
}

export type LighthouseResult = { ok: true; stage: number } | { ok: false; reason: 'done' | 'part' | 'coins' | 'closed' };

/** Repairs the next stage: one lantern part and coins. */
export function repairLighthouse(state: GameState): LighthouseResult {
  const h = state.harbor;
  const cost = lighthouseCost(state);
  if (!state.regions.includes('harbor')) return { ok: false, reason: 'closed' };
  if (cost === null) return { ok: false, reason: 'done' };
  if (h.parts <= 0) return { ok: false, reason: 'part' };
  if (state.coins < cost) return { ok: false, reason: 'coins' };
  state.coins -= cost;
  h.parts--;
  h.lighthouse++;
  return { ok: true, stage: h.lighthouse };
}

/** Permanent sale bonus and peace once the lighthouse shines. */
export function lighthouseSaleBonus(state: GameState): number {
  return lighthouseDone(state) ? Lighthouse.saleBonus : 0;
}

export function lighthousePeace(state: GameState): number {
  return lighthouseDone(state) ? Lighthouse.peace : 0;
}

export { Destinations, DestinationById };
