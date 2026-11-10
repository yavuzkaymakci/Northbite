import { DecorationList } from '../content/decorations';
import { boatReady, destinationOpen } from './VoyageLogic';
import { DestinationById } from '../content/voyages';
import { Economy } from '../content/economy';
import { FishById, FishSpeciesList, type FishId } from '../content/fish';
import { Camp } from '../content/land';
import { Orders, OrderTemplates, type OrderExtra, type OrderTemplate } from '../content/orders';
import { Stations } from '../content/stations';
import { scaledPrice } from '../content/tuning';
import { isDone, type FishItem, type GameState, type Order } from '../core/GameState';
import { seededRandom } from '../core/Random';
import { rollFish } from './FishRoll';
import { stationValue } from './StationUpgrades';
import { fishingMods } from './Upgrades';

// Order board rules (GDD §20), shared by the game and the balance sim. No Three.js or DOM here.

const NIGHT_FISH: FishId[] = FishSpeciesList.filter((f) => f.when === 'night').map((f) => f.id);

/** Average raw value of a rod catch and its value per kg at the current bait level (sampled once per level). */
const rawAvgCache = new Map<number, { value: number; perKg: number }>();
function rawAverage(state: GameState): { value: number; perKg: number } {
  const lv = state.upgrades.bait;
  let v = rawAvgCache.get(lv);
  if (v === undefined) {
    const rand = seededRandom(91 + lv);
    const mods = { ...fishingMods(state), night: false, aurora: false };
    let sum = 0;
    let kg = 0;
    for (let i = 0; i < 1500; i++) {
      const f = rollFish(rand, mods).item;
      sum += f.price / (f.variant ? 5 : 1);
      kg += f.kg;
    }
    v = { value: sum / 1500, perKg: sum / kg };
    rawAvgCache.set(lv, v);
  }
  return v;
}

/** Average raw value of one fish of a species (kg skew included). */
function speciesValue(id: FishId): number {
  const s = FishById[id];
  return (s.kgMin + (s.kgMax - s.kgMin) / 2.6) * s.pricePerKg;
}

/** Species a 'species' order may ask for: discovered, biting with the current bait, not aurora-only or legendary. */
export function orderableSpecies(state: GameState): FishId[] {
  return FishSpeciesList.filter((f) => state.seen.includes(f.id) && f.baitLevel <= state.upgrades.bait && f.when !== 'aurora' && f.rarity !== 'epic').map(
    (f) => f.id,
  );
}

function feasible(state: GameState, t: OrderTemplate): boolean {
  if (!t.requires.every((r) => isDone(state, r))) return false;
  if (t.kind === 'species') return orderableSpecies(state).length > 0;
  if (t.kind === 'plates') return state.regions.includes('hotSpring');
  if (t.kind === 'statuettes') return state.regions.includes('iceCave');
  if (t.kind === 'deep' || t.kind === 'voyage') return boatReady(state);
  // The sunken ship opens after two voyages (voyages.ts → wreck.unlockAfter).
  if (t.kind === 'treasure') return boatReady(state) && destinationOpen(state, DestinationById.wreck);
  return true;
}

const randInt = (rand: () => number, min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

/** Expected sale value of what an order asks for. */
function expectedValue(state: GameState, o: Pick<Order, 'kind' | 'amount' | 'species'>): number {
  const avg = rawAverage(state);
  const raw = avg.value;
  const smoked = raw * Stations.smokehouse.valueMultiplier;
  switch (o.kind) {
    case 'raw':
      return o.amount * raw;
    case 'smoked':
      return o.amount * smoked;
    case 'kg':
      return o.amount * avg.perKg;
    case 'species':
      return o.amount * speciesValue(o.species ?? 'capelin');
    case 'plates':
      return o.amount * smoked * Camp.kitchen.plateMultiplier;
    case 'statuettes':
      return o.amount * stationValue(state, 'statuetteValue');
    case 'golden':
      return raw * 5;
    case 'night':
      return speciesValue('moonCod');
    case 'deep':
      return o.amount * speciesValue('atlanticHerring') * 1.5;
    case 'voyage':
      return o.amount * Orders.voyageValue;
    case 'treasure':
      return Orders.voyageValue * 2;
  }
}

function pickExtra(rand: () => number): OrderExtra {
  const total = Orders.extras.reduce((s, e) => s + e.weight, 0);
  let r = rand() * total;
  for (const e of Orders.extras) {
    r -= e.weight;
    if (r <= 0) return e.id;
  }
  return 'fur';
}

/** A new order the player can fulfil with what they have unlocked; kinds already on the board are avoided. */
export function makeOrder(state: GameState, rand: () => number, first = false): Order | null {
  const o = state.orders;
  let t: OrderTemplate | undefined;
  let amount: number;
  if (first) {
    t = OrderTemplates.find((x) => x.kind === Orders.first.kind);
    amount = Orders.first.amount;
  } else {
    const onBoard = o.active.map((a) => a.kind);
    let pool = OrderTemplates.filter((x) => feasible(state, x) && !onBoard.includes(x.kind));
    if (pool.length === 0) pool = OrderTemplates.filter((x) => feasible(state, x));
    const total = pool.reduce((s, x) => s + x.weight, 0);
    let r = rand() * total;
    t = pool.find((x) => (r -= x.weight) <= 0) ?? pool[pool.length - 1];
    amount = t ? randInt(rand, t.min, t.max) : 0;
  }
  if (!t) return null;
  const species = t.kind === 'species' ? (orderableSpecies(state)[Math.floor(rand() * orderableSpecies(state).length)] as FishId) : undefined;
  const counter = t.kind === 'voyage' ? state.harbor.voyages : t.kind === 'treasure' ? state.harbor.wrecks : undefined;
  const base = { kind: t.kind, amount, ...(species ? { species } : {}), ...(counter !== undefined ? { base: counter } : {}) };
  return {
    id: o.nextId++,
    ...base,
    timeLeft: first ? t.durationMax : t.durationMin + rand() * (t.durationMax - t.durationMin),
    reward: scaledPrice(Math.round(expectedValue(state, base) * t.rewardMul)),
    extra: !first && rand() < t.extraChance ? pickExtra(rand) : null,
  };
}

/** Ticks order and refill timers (only while playing). Returns the orders that appeared. */
export function updateOrders(state: GameState, dt: number, rand: () => number): Order[] {
  const o = state.orders;
  const added: Order[] = [];
  if (!o.firstGiven) {
    const first = makeOrder(state, rand, true);
    if (first) {
      o.active.push(first);
      added.push(first);
    }
    o.firstGiven = true;
  }
  o.rerollIn = Math.max(o.rerollIn - dt, 0);
  for (let i = o.active.length - 1; i >= 0; i--) {
    const a = o.active[i] as Order;
    a.timeLeft -= dt;
    // Running out costs nothing: the order just leaves.
    if (a.timeLeft <= 0) o.active.splice(i, 1);
  }
  while (o.active.length + o.refill.length < Orders.slots) o.refill.push(Orders.refillMin + rand() * (Orders.refillMax - Orders.refillMin));
  for (let i = o.refill.length - 1; i >= 0; i--) {
    o.refill[i] = (o.refill[i] as number) - dt;
    if ((o.refill[i] as number) > 0) continue;
    const next = makeOrder(state, rand);
    if (next) {
      o.refill.splice(i, 1);
      o.active.push(next);
      added.push(next);
    } else {
      o.refill[i] = 30;
    }
  }
  return added;
}

/** Matching fish on the player's back (landed ones; `visible` = how many of `carried` have landed). */
function matching(state: GameState, order: Order, visible: number): FishItem[] {
  const list = state.carried.slice(0, visible);
  switch (order.kind) {
    case 'raw':
      return list.filter((f) => f.kind === 'raw');
    case 'smoked':
      return list.filter((f) => f.kind === 'smoked');
    case 'kg':
      return list;
    case 'species':
      return list.filter((f) => f.species === order.species);
    case 'golden':
      return list.filter((f) => f.variant === 'gold');
    case 'night':
      return list.filter((f) => NIGHT_FISH.includes(f.species));
    case 'deep':
      return list.filter((f) => FishById[f.species].deep);
    default:
      return [];
  }
}

/** What the player has toward an order right now, and what it needs (kg for 'kg' orders). */
export function orderProgress(state: GameState, order: Order, visible = state.carried.length): { have: number; need: number } {
  if (order.kind === 'plates') return { have: state.camp.plates.length, need: order.amount };
  if (order.kind === 'statuettes') return { have: state.cave.output, need: order.amount };
  if (order.kind === 'voyage') return { have: Math.min(state.harbor.voyages - (order.base ?? state.harbor.voyages), order.amount), need: order.amount };
  if (order.kind === 'treasure') return { have: Math.min(state.harbor.wrecks - (order.base ?? state.harbor.wrecks), order.amount), need: order.amount };
  const items = matching(state, order, visible);
  const have = order.kind === 'kg' ? Math.round(items.reduce((s, f) => s + f.kg, 0) * 10) / 10 : items.length;
  return { have, need: order.amount };
}

export interface Delivery {
  coins: number;
  extra: OrderExtra | null;
  /** Sale value of what was handed over (what the counter would have paid). */
  givenValue: number;
  /** Decoration frame that got a piece paid, if any. */
  decorPiece: string | null;
}

/**
 * Hands an order over: the items leave the back or the rack (cheapest fitting ones first, the heaviest for kg
 * orders), coins go straight to the wallet, extras apply. Returns null when there is not enough.
 */
export function deliverOrder(state: GameState, orderId: number, visible = state.carried.length): Delivery | null {
  const o = state.orders;
  const order = o.active.find((a) => a.id === orderId);
  if (!order) return null;
  const p = orderProgress(state, order, visible);
  if (p.have < p.need) return null;
  let givenValue = 0;
  if (order.kind === 'plates') {
    for (const v of state.camp.plates.splice(0, order.amount)) givenValue += v;
  } else if (order.kind === 'statuettes') {
    state.cave.output -= order.amount;
    givenValue = order.amount * stationValue(state, 'statuetteValue');
  } else if (order.kind === 'voyage' || order.kind === 'treasure') {
    // Nothing to hand over: the trips themselves were the job.
  } else {
    const items = matching(state, order, visible);
    items.sort((a, b) => (order.kind === 'kg' ? b.kg - a.kg : a.price - b.price));
    let need = order.amount;
    for (const f of items) {
      if (need <= 0) break;
      state.carried.splice(state.carried.indexOf(f), 1);
      givenValue += f.price;
      need -= order.kind === 'kg' ? f.kg : 1;
    }
  }
  state.coins += order.reward;
  o.active.splice(o.active.indexOf(order), 1);
  o.done++;
  let decorPiece: string | null = null;
  if (order.extra === 'rareBait') state.codex.rareBait += Orders.extras.find((e) => e.id === 'rareBait')?.rareBaitSeconds ?? 0;
  else if (order.extra === 'fur') state.threats.fur++;
  else if (order.extra === 'decorPiece') decorPiece = payDecorPiece(state);
  return { coins: order.reward, extra: order.extra, givenValue, decorPiece };
}

/**
 * A decoration piece (order extra, voyage treasure): pays half of the cheapest decoration frame that is showing and
 * not bought yet. Returns that frame's id, or null when there is none.
 */
export function payDecorPiece(state: GameState): string | null {
  const open = DecorationList.filter((d) => !d.reward && !state.unlocked.includes(d.id) && d.requires.every((r) => isDone(state, r))).sort(
    (a, b) => a.cost - b.cost,
  )[0];
  if (!open) return null;
  const cost = scaledPrice(Economy.unlocks[open.id]);
  state.unlockPaid[open.id] = Math.min((state.unlockPaid[open.id] ?? 0) + Math.round(cost * Orders.decorPieceShare), cost - 1);
  return open.id;
}

/** Swaps one order for a new one (free, then a cooldown). */
export function rerollOrder(state: GameState, orderId: number, rand: () => number): boolean {
  const o = state.orders;
  const i = o.active.findIndex((a) => a.id === orderId);
  if (i < 0 || o.rerollIn > 0) return false;
  const old = o.active.splice(i, 1)[0] as Order;
  const next = makeOrder(state, rand);
  o.active.splice(i, 0, next ?? old);
  o.rerollIn = Orders.rerollCooldown;
  return true;
}
