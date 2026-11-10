import { Economy } from '../content/economy';
import { Guests } from '../content/guests';
import { Camp, Cave } from '../content/land';
import { Jobs, type JobDef, type RoleId } from '../content/roles';
import { Stations } from '../content/stations';
import { TimeOfDay } from '../content/time';
import { CaveLayout, PathGraph } from '../content/zones';
import { WorkerFeel } from '../settings';
import type { FishItem, GameState, WorkerData } from '../core/GameState';
import { seededRandom } from '../core/Random';
import { rollFrom } from './FishRoll';
import { smoke } from './Items';
import { guestRateBonus } from './LandLogic';
import { PathGraphNav } from './Pathfinding';
import { penguinCarry, penguinSpeed } from './PenguinLogic';
import { peaceScore } from './Rest';
import { offlineCapHours, offlineRate, stationValue } from './StationUpgrades';

// Offline earnings (GDD §18, §24): a formula, not a simulation. Only the automated chain counts, and every step is a
// bottleneck: net → carriers (→ smokehouse → smokers / cooks) → counter / kitchen → customers / guests; miners →
// crystal bench → collector; tent rent from guests. The penguins' rates come from their roles (content/roles.ts:
// each job's legs on the path graph), carry, speed, trait and level; no separate numbers.
// The clock does not move while away, so no threats, buffs or day changes happen.

export interface OfflineResult {
  /** Seconds counted (after the cap). */
  seconds: number;
  /** True when the time away was longer than the cap. */
  capped: boolean;
  /** Coins earned (already × the offline rate). */
  coins: number;
  /** Before the rate, by line. */
  fish: number;
  camp: number;
  cave: number;
}

const NONE: OfflineResult = { seconds: 0, capped: false, coins: 0, fish: 0, camp: 0, cave: 0 };

/** Offline income needs the first automation loop: the net and at least one penguin. */
export function offlineUnlocked(state: GameState): boolean {
  return state.unlocked.includes('net') && state.workers.length > 0;
}

/** Average sale value of a net fish, from the net's species pool (sampled once, same every run). */
const NET_FISH_VALUE = (() => {
  const rand = seededRandom(77);
  let sum = 0;
  for (let i = 0; i < 4000; i++) sum += rollFrom(Stations.net.pool, rand).price;
  return sum / 4000;
})();

/** Customers' average buying speed (items per second), day and night mixed. */
export function customerDemand(): number {
  const c = Economy.customers;
  const nightShare = 1 - (TimeOfDay.parts.find((p) => p.id === 'night')?.start ?? 1);
  const rate = 1 - nightShare + nightShare * TimeOfDay.night.customerRate;
  return (((c.buyMin + c.buyMax) / 2) / ((c.spawnIntervalMin + c.spawnIntervalMax) / 2)) * rate;
}

const nav = new PathGraphNav(() => true);
type Node = keyof typeof PathGraph.nodes;
const leg = (a: Node, b: Node) => nav.routeLength(PathGraph.nodes[a], b);
const legOf = (job: JobDef) => leg(job.legs[0] as Node, job.legs[1] as Node);

/** Seconds of one round trip on a job for one penguin: there and back, handling each piece, work at the source. */
function tripTime(state: GameState, w: WorkerData, job: JobDef, carry: number): number {
  return (2 * legOf(job)) / penguinSpeed(state, w) + carry * WorkerFeel.transferInterval * 2 + (job.workTime ?? 0);
}

/**
 * Pieces per second the penguins with `role` move when one piece needs every job in `jobs` once (a cook hauls smoked
 * fish to the kitchen and serves the platter). `perTrip` = pieces one trip brings when that is not the carry (veins).
 */
export function roleRate(state: GameState, role: RoleId, jobs: readonly JobDef[], perTrip?: number): number {
  let r = 0;
  for (const w of state.workers) {
    if (w.role !== role) continue;
    const carry = Math.min(penguinCarry(state, w), ...jobs.map((j) => j.max ?? Infinity));
    const trip = jobs.reduce((t, j) => t + tripTime(state, w, j, carry), 0);
    r += (perTrip ?? carry) / trip;
  }
  return r;
}

const hasRole = (state: GameState, r: RoleId) => state.workers.some((w) => w.role === r);

/** Fish per second the penguins bring to the counter (sim report and the idle check). */
export function penguinRate(state: GameState, smokehouse: boolean): number {
  if (!smokehouse) return roleRate(state, 'carrier', [Jobs.rawToCounter]);
  if (!hasRole(state, 'smoker')) return roleRate(state, 'carrier', [Jobs.rawToSmoker, Jobs.smokedToCounter]);
  return Math.min(roleRate(state, 'carrier', [Jobs.rawToSmoker]), roleRate(state, 'smoker', [Jobs.smokedToCounter]));
}

/**
 * Works out what the town earned while away and leaves the stations as they would be: the basket refilled, racks
 * and the counter emptied by what was sold. Mutates `state` (stocks only, never coins); returns the coins to give.
 */
export function applyOffline(state: GameState, awaySeconds: number, rand: () => number = Math.random): OfflineResult {
  if (awaySeconds <= 0) return NONE;
  const capSec = offlineCapHours(state) * 3600;
  const T = Math.min(awaySeconds, capSec);
  const capped = awaySeconds > capSec;
  const netOn = state.unlocked.includes('net');
  const smoker = state.unlocked.includes('smokehouse');
  const basketCap = stationValue(state, 'basketCapacity');
  const netProduced = netOn ? T / stationValue(state, 'netInterval') : 0;

  if (!offlineUnlocked(state)) {
    // Without penguins the net only fills its basket; nothing is sold.
    while (netOn && state.basket.length < basketCap && state.basket.length < netProduced) state.basket.push(rollFrom(Stations.net.pool, rand));
    return { ...NONE, seconds: T, capped };
  }
  const has = (r: RoleId) => hasRole(state, r);

  // ---------- fish: net → carriers (→ smokehouse → smokers / cooks) → counter / kitchen ----------
  const s = state.smoker;
  const counterCap = stationValue(state, 'counterCapacity');
  const out0 = s.output;
  const in0 = s.input;
  const basket0 = state.basket;
  // Fish waiting to be carried, in the order penguins take them: smoked output first, then raw fish (smoked on the way).
  const stock: FishItem[] = smoker ? [...out0, ...in0.map(smoke), ...basket0.map(smoke)] : [...basket0];
  let flow: number;
  if (!smoker) flow = roleRate(state, 'carrier', [Jobs.rawToCounter]) * T;
  else {
    // Carriers fill the smokehouse (and bring the smoked fish out too while there is no smoker).
    const fill = has('smoker') ? roleRate(state, 'carrier', [Jobs.rawToSmoker]) : roleRate(state, 'carrier', [Jobs.rawToSmoker, Jobs.smokedToCounter]);
    flow = Math.min(out0.length + in0.length + fill * T, out0.length + T / stationValue(state, 'smokeTime'));
  }
  flow = Math.min(flow, stock.length + netProduced);

  // Kitchen: cooks (or smokers while there is no cook) fill it; platters sell only when a cook or the attendant serves.
  const campOpen = state.regions.includes('hotSpring');
  const kitchenOn = smoker && campOpen && state.unlocked.includes('kitchen');
  const arrivals = campOpen ? (T / Guests.interval) * (1 + guestRateBonus(peaceScore(state))) : 0;
  const server = has('cook') || state.unlocked.includes('attendant');
  let toKitchen = 0;
  let smokerKitchenTime = 0;
  if (kitchenOn && server && (has('cook') || has('smoker'))) {
    const haul = has('cook') ? roleRate(state, 'cook', [Jobs.smokedToKitchen, Jobs.platesToGuests]) : roleRate(state, 'smoker', [Jobs.smokedToKitchen]);
    const wanted = Math.max(arrivals - state.camp.plates.length, 0);
    toKitchen = Math.max(Math.floor(Math.min(flow, haul * T, T / stationValue(state, 'plateTime'), wanted)), 0);
    // Smokers share their time between the kitchen and the counter.
    if (!has('cook')) smokerKitchenTime = toKitchen / Math.max(haul, 1e-9);
  }
  let toCounter = flow - toKitchen;
  if (smoker && has('smoker')) toCounter = Math.min(toCounter, roleRate(state, 'smoker', [Jobs.smokedToCounter]) * Math.max(T - smokerKitchenTime, 0));
  const demand = customerDemand() * T;
  const c0 = state.counter.length;
  // Penguins stop when the counter is full: deliveries never exceed what was sold plus the free places.
  const delivered = Math.max(Math.floor(Math.min(toCounter, demand + counterCap - c0)), 0);
  const sold = Math.max(Math.floor(Math.min(c0 + delivered, demand)), 0);

  const freshValue = smoker ? NET_FISH_VALUE * Stations.smokehouse.valueMultiplier : NET_FISH_VALUE;
  const pieceValue = (i: number) => (i < stock.length ? (stock[i] as FishItem).price : freshValue);

  // The kitchen gets the first pieces (it takes from the output rack first), the counter the ones after.
  let camp = 0;
  const plates = [...state.camp.plates];
  for (let i = 0; i < toKitchen; i++) plates.push(Math.round(pieceValue(i) * Camp.kitchen.plateMultiplier));
  if (kitchenOn && server) for (const v of plates.splice(0, Math.min(plates.length, Math.floor(arrivals)))) camp += v;
  state.camp.plates = plates.slice(0, Camp.kitchen.outputCapacity);

  // Value: counter stock first, then deliveries in order (stock items, then fresh net fish at the average value).
  let fish = 0;
  const fromCounter = Math.min(c0, sold);
  for (const item of state.counter.splice(0, fromCounter)) fish += item.price;
  const fromDeliveries = sold - fromCounter;
  for (let i = 0; i < fromDeliveries; i++) fish += pieceValue(toKitchen + i);

  // Deliveries that were not sold wait on the counter.
  for (let i = fromDeliveries; i < delivered; i++) {
    const k = toKitchen + i;
    const item = k < stock.length ? (stock[k] as FishItem) : rollFrom(Stations.net.pool, rand);
    state.counter.push(smoker && item.kind === 'raw' ? smoke(item) : item);
  }
  // What was not carried stays where it was: output rack, input rack, basket (in that order of taking).
  const taken = toKitchen + delivered;
  if (smoker) {
    s.output = out0.slice(Math.min(taken, out0.length));
    const d2 = Math.max(taken - out0.length, 0);
    s.input = in0.slice(Math.min(d2, in0.length));
    state.basket = basket0.slice(Math.min(Math.max(d2 - in0.length, 0), basket0.length));
  } else {
    state.basket = basket0.slice(Math.min(taken, basket0.length));
  }
  s.progress = 0;
  // The net kept filling whatever room the basket had with the fish nobody carried.
  const freshLeft = Math.max(Math.floor(netProduced) - Math.max(taken - stock.length, 0), 0);
  for (let i = 0; i < freshLeft && state.basket.length < basketCap; i++) state.basket.push(rollFrom(Stations.net.pool, rand));

  // ---------- camp: tent rent from guests (platters are counted above) ----------
  const tents = ['tent1', 'tent2', 'tent3'].filter((id) => state.unlocked.includes(id)).length;
  if (campOpen && tents > 0) {
    const stays = Math.min(arrivals, (T * tents) / Camp.tent.stay);
    camp += Math.floor(stays) * Math.round((stationValue(state, 'tentRent') * Camp.tent.stay) / 60);
  }

  // ---------- cave: miners bring crystals (up to the rack), the bench carves, the collector buys from stock ----------
  let cave = 0;
  const c = state.cave;
  if (state.unlocked.includes('crystalBench')) {
    // Miners: one vein per trip (average yield), never faster than the veins grow back.
    const yields = CaveLayout.veins.map((v) => Cave.yieldBySize[v.size - 1] ?? 1);
    const total = yields.reduce((a, b) => a + b, 0);
    const mined = Math.floor(Math.min(roleRate(state, 'miner', [Jobs.crystalsToBench], total / yields.length), total / Cave.refill) * T);
    const carved = Math.min(c.input + mined, Math.floor(T / Cave.bench.processTime));
    const ready = c.output + carved;
    const cycle = Cave.collector.interval + Cave.collector.stay;
    const visits = T >= c.collectorIn ? 1 + Math.floor((T - c.collectorIn) / cycle) : 0;
    const bought = Math.min(ready, visits * Cave.bench.outputCapacity);
    cave += bought * stationValue(state, 'statuetteValue');
    c.output = Math.min(ready - bought, Cave.bench.outputCapacity);
    // Crystals that could not be carved wait on the input rack (up to its size).
    c.input = Math.min(c.input + mined - carved, Cave.bench.inputCapacity);
    c.progress = 0;
    c.collectorIn = visits > 0 ? Cave.collector.interval : c.collectorIn - T;
  }
  for (let i = 0; i < c.veins.length; i++) c.veins[i] = Math.max((c.veins[i] as number) - T, 0);

  const rate = offlineRate(state);
  return { seconds: T, capped, coins: Math.floor((fish + camp + cave) * rate), fish, camp, cave };
}
