import { FirstPenguin, Hut, Market, PenguinLevels, PenguinLooks, PenguinNames, TraitById, TraitList, type TraitId } from '../content/penguins';
import { GuardEffect, RoleById, RoleList, type RoleId } from '../content/roles';
import { scaledPrice } from '../content/tuning';
import { isDone, type GameState, type PenguinLook, type PenguinOffer, type WorkerData } from '../core/GameState';
import { stationValue } from './StationUpgrades';

// Penguin Market, traits, levels and the hut's capacity (GDD §24). Visual-free: the game, the save migration and the
// balance sim share these rules.

const pick = <T>(list: readonly T[], rand: () => number): T => list[Math.floor(rand() * list.length) % list.length] as T;

export function randomLook(rand: () => number): PenguinLook {
  return {
    hat: rand() < PenguinLooks.noHatChance ? -1 : Math.floor(rand() * PenguinLooks.hats),
    scarf: Math.floor(rand() * PenguinLooks.scarves),
  };
}

/** A name index not used by any penguin or offer yet (any one when all 40 are taken). */
function freshName(state: GameState, rand: () => number): number {
  const used = new Set([...state.workers.map((w) => w.name), ...state.market.offers.map((o) => o.name)]);
  const free = PenguinNames.tr.map((_, i) => i).filter((i) => !used.has(i));
  return free.length > 0 ? pick(free, rand) : Math.floor(rand() * PenguinNames.tr.length);
}

export function penguinName(w: { name: number }, lang: 'tr' | 'en'): string {
  return PenguinNames[lang][w.name] ?? PenguinNames[lang][0] ?? '';
}

/** A new penguin's data (not added to the state). */
export function makePenguin(state: GameState, rand: () => number, role: RoleId, trait?: TraitId, price = 0): WorkerData {
  return {
    id: state.market.nextPenguin++,
    name: freshName(state, rand),
    role,
    trait: trait ?? pick(TraitList, rand).id,
    level: 1,
    xp: 0,
    look: randomLook(rand),
    price,
    carried: [],
  };
}

/** The hut's free penguin (GDD §24). */
export function firstPenguin(state: GameState, rand: () => number): WorkerData {
  return makePenguin(state, rand, FirstPenguin.role);
}

// ---------- abilities ----------

/** Carry capacity: the station upgrade plus the trait (never below the minimum). */
export function penguinCarry(state: GameState, w: WorkerData): number {
  return Math.max(stationValue(state, 'penguinCarry') + TraitById[w.trait].carry, PenguinLevels.minCarry);
}

/** Walk speed: the station upgrade × the trait × the level bonus. */
export function penguinSpeed(state: GameState, w: WorkerData): number {
  return stationValue(state, 'penguinSpeed') * TraitById[w.trait].speed * (1 + (w.level - 1) * PenguinLevels.speedPerLevel);
}

export function levelForXp(xp: number): number {
  let lv = 1;
  PenguinLevels.xpFor.forEach((need, i) => {
    if (xp >= need) lv = i + 1;
  });
  return Math.min(lv, PenguinLevels.max);
}

/** 0..1 progress inside the current level (1 at the top level). */
export function levelProgress(w: WorkerData): number {
  const now = PenguinLevels.xpFor[w.level - 1] ?? 0;
  const next = PenguinLevels.xpFor[w.level];
  if (next === undefined) return 1;
  return Math.min(Math.max((w.xp - now) / (next - now), 0), 1);
}

/** Adds experience (× the trait). Returns true when the penguin reached a new level. */
export function addXp(w: WorkerData, amount: number): boolean {
  w.xp += amount * TraitById[w.trait].xp;
  const lv = levelForXp(w.xp);
  if (lv <= w.level) return false;
  w.level = lv;
  return true;
}

// ---------- roles, hut, guards ----------

export function roleAvailable(state: GameState, role: RoleId): boolean {
  return isDone(state, RoleById[role].requires);
}

export function availableRoles(state: GameState): RoleId[] {
  return RoleList.filter((r) => isDone(state, r.requires)).map((r) => r.id);
}

export function countRole(state: GameState, role: RoleId): number {
  return state.workers.filter((w) => w.role === role).length;
}

export function hutCapacity(state: GameState): number {
  return Hut.capacity[Math.min(Math.max(state.hutLevel, 1), Hut.capacity.length) - 1] as number;
}

/** Price of the next hut level, or null at the top. */
export function hutUpgradeCost(state: GameState): number | null {
  const c = Hut.upgradeCost[state.hutLevel];
  return c === undefined ? null : scaledPrice(c);
}

export function upgradeHut(state: GameState): boolean {
  const cost = hutUpgradeCost(state);
  if (cost === null || state.coins < cost) return false;
  state.coins -= cost;
  state.hutLevel++;
  return true;
}

/** Bear warning bonus from guards (each up to `maxGuards`). */
export function guardWarningBonus(state: GameState): number {
  return Math.min(countRole(state, 'guard'), GuardEffect.maxGuards) * GuardEffect.warningBonus;
}

/** Peace points from cute penguins (GDD §14). */
export function penguinPeace(state: GameState): number {
  let p = 0;
  for (const w of state.workers) p += TraitById[w.trait]?.peace ?? 0;
  return p;
}

// ---------- market ----------

/** Price of an offer right now: role × trait × count multiplier (more penguins, higher prices) × priceScale. */
export function offerPrice(state: GameState, o: { role: RoleId; trait: TraitId }): number {
  const owned = state.workers.length;
  const count = owned < Market.cheapCount ? 1 : Math.pow(Market.growth, owned - Market.cheapCount + 1);
  return scaledPrice(RoleById[o.role].price * TraitById[o.trait].price * count);
}

/** A new catalog: 3–4 candidates, different roles while there are enough, only roles that can work now. */
export function refreshOffers(state: GameState, rand: () => number): void {
  const m = state.market;
  m.offers = [];
  const roles = availableRoles(state);
  if (roles.length === 0) return;
  const n = Market.offersMin + Math.floor(rand() * (Market.offersMax - Market.offersMin + 1));
  const bag = [...roles];
  for (let i = 0; i < n; i++) {
    if (bag.length === 0) bag.push(...roles);
    const role = bag.splice(Math.floor(rand() * bag.length), 1)[0] as RoleId;
    m.offers.push({ id: m.nextId++, name: freshName(state, rand), role, trait: pick(TraitList, rand).id, look: randomLook(rand) });
  }
}

/** Timers; a new game day (or a catalog made before a role opened up) brings fresh candidates. */
export function updateMarket(state: GameState, dt: number, rand: () => number): void {
  const m = state.market;
  m.refreshIn = Math.max(m.refreshIn - dt, 0);
  if (m.day !== state.clock.day) {
    m.day = state.clock.day;
    refreshOffers(state, rand);
  }
}

/** Free "Refresh" (then a cooldown). */
export function rerollOffers(state: GameState, rand: () => number): boolean {
  if (state.market.refreshIn > 0) return false;
  refreshOffers(state, rand);
  state.market.refreshIn = Market.refreshCooldown;
  return true;
}

export type BuyResult = { ok: true; penguin: WorkerData } | { ok: false; reason: 'full' | 'coins' | 'gone' | 'role' };

/** Buys an offer: pays, takes it off the catalog and returns the new penguin (the caller adds it to the world). */
export function buyOffer(state: GameState, offerId: number): BuyResult {
  const m = state.market;
  const o = m.offers.find((x) => x.id === offerId);
  if (!o) return { ok: false, reason: 'gone' };
  if (!roleAvailable(state, o.role)) return { ok: false, reason: 'role' };
  if (state.workers.length >= hutCapacity(state)) return { ok: false, reason: 'full' };
  const price = offerPrice(state, o);
  if (state.coins < price) return { ok: false, reason: 'coins' };
  state.coins -= price;
  m.offers.splice(m.offers.indexOf(o), 1);
  const penguin: WorkerData = { id: m.nextPenguin++, name: o.name, role: o.role, trait: o.trait, level: 1, xp: 0, look: { ...o.look }, price, carried: [] };
  state.workers.push(penguin);
  return { ok: true, penguin };
}

export function roleChangeFee(): number {
  return scaledPrice(Market.roleChangeFee);
}

/** Gives a penguin another role for a small fee. Returns false when not possible. */
export function changeRole(state: GameState, w: WorkerData, role: RoleId): boolean {
  const fee = roleChangeFee();
  if (w.role === role || !roleAvailable(state, role) || state.coins < fee) return false;
  state.coins -= fee;
  w.role = role;
  return true;
}

export type { PenguinOffer };
