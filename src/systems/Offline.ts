import { Economy } from '../content/economy';
import { Guests } from '../content/guests';
import { Camp, Cave } from '../content/land';
import { Stations } from '../content/stations';
import { TimeOfDay } from '../content/time';
import { PathGraph } from '../content/zones';
import { WorkerFeel } from '../settings';
import type { FishItem, GameState } from '../core/GameState';
import { seededRandom } from '../core/Random';
import { rollFrom } from './FishRoll';
import { smoke } from './Items';
import { guestRateBonus } from './LandLogic';
import { PathGraphNav } from './Pathfinding';
import { peaceScore } from './Rest';
import { offlineCapHours, offlineRate, stationValue } from './StationUpgrades';

// Offline earnings (GDD §18): a formula, not a simulation. Only the automated chain counts (net → penguins →
// smokehouse → counter → customers; camp rent and platters already on the rack with an attendant; statuettes the
// collector buys from stock). Every step is a bottleneck: the result is what the player's automation can do.
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
const leg = (a: keyof typeof PathGraph.nodes, b: keyof typeof PathGraph.nodes) => nav.routeLength(PathGraph.nodes[a], b);

/** Fish per second the penguins can bring to the counter (each smoked fish needs two trips). */
export function penguinRate(state: GameState, smokehouse: boolean): number {
  const n = state.workers.length;
  if (n === 0) return 0;
  const carry = stationValue(state, 'penguinCarry');
  const speed = stationValue(state, 'penguinSpeed');
  const handling = carry * WorkerFeel.transferInterval * 2;
  const trip = smokehouse
    ? (2 * leg('basket', 'smokeIn') + 2 * leg('smokeOut', 'counter')) / speed + handling * 2
    : (2 * leg('basket', 'counter')) / speed + handling;
  return (n * carry) / trip;
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

  // ---------- fish: net → penguins (→ smokehouse) → counter → customers ----------
  const s = state.smoker;
  const counterCap = stationValue(state, 'counterCapacity');
  const out0 = s.output;
  const in0 = s.input;
  const basket0 = state.basket;
  // Fish waiting to be carried, in the order penguins take them: smoked output first, then raw fish (smoked on the way).
  const stock: FishItem[] = smoker ? [...out0, ...in0.map(smoke), ...basket0.map(smoke)] : [...basket0];
  let carry = penguinRate(state, smoker) * T;
  if (smoker) carry = Math.min(carry, out0.length + T / stationValue(state, 'smokeTime'));
  const demand = customerDemand() * T;
  const c0 = state.counter.length;
  // Penguins stop when the counter is full: deliveries never exceed what was sold plus the free places.
  const delivered = Math.max(Math.floor(Math.min(stock.length + netProduced, carry, demand + counterCap - c0)), 0);
  const sold = Math.max(Math.floor(Math.min(c0 + delivered, demand)), 0);

  // Value: counter stock first, then deliveries in order (stock items, then fresh net fish at the average value).
  const freshValue = smoker ? NET_FISH_VALUE * Stations.smokehouse.valueMultiplier : NET_FISH_VALUE;
  let fish = 0;
  const fromCounter = Math.min(c0, sold);
  for (const item of state.counter.splice(0, fromCounter)) fish += item.price;
  const fromDeliveries = sold - fromCounter;
  const fromStock = Math.min(stock.length, delivered);
  for (let i = 0; i < Math.min(fromDeliveries, fromStock); i++) fish += (stock[i] as FishItem).price;
  fish += Math.max(fromDeliveries - fromStock, 0) * freshValue;

  // Deliveries that were not sold wait on the counter.
  for (let i = fromDeliveries; i < delivered; i++) {
    const item = i < stock.length ? (stock[i] as FishItem) : rollFrom(Stations.net.pool, rand);
    state.counter.push(smoker && item.kind === 'raw' ? smoke(item) : item);
  }
  // What was not carried stays where it was: output rack, input rack, basket (in that order of taking).
  if (smoker) {
    s.output = out0.slice(Math.min(delivered, out0.length));
    const d2 = Math.max(delivered - out0.length, 0);
    s.input = in0.slice(Math.min(d2, in0.length));
    state.basket = basket0.slice(Math.min(Math.max(d2 - in0.length, 0), basket0.length));
  } else {
    state.basket = basket0.slice(Math.min(delivered, basket0.length));
  }
  s.progress = 0;
  // The net kept filling whatever room the basket had with the fish nobody carried.
  const freshLeft = Math.max(Math.floor(netProduced) - Math.max(delivered - stock.length, 0), 0);
  for (let i = 0; i < freshLeft && state.basket.length < basketCap; i++) state.basket.push(rollFrom(Stations.net.pool, rand));

  // ---------- camp: tent rent from guests, platters on the rack (attendant only) ----------
  let camp = 0;
  const tents = ['tent1', 'tent2', 'tent3'].filter((id) => state.unlocked.includes(id)).length;
  if (state.regions.includes('hotSpring') && tents > 0) {
    const arrivals = (T / Guests.interval) * (1 + guestRateBonus(peaceScore(state)));
    const stays = Math.min(arrivals, (T * tents) / Camp.tent.stay);
    camp += Math.floor(stays) * Math.round((stationValue(state, 'tentRent') * Camp.tent.stay) / 60);
    if (state.unlocked.includes('attendant')) {
      const plates = Math.min(state.camp.plates.length, Math.floor(arrivals));
      for (const v of state.camp.plates.splice(0, plates)) camp += v;
    }
  }

  // ---------- cave: no new crystals; the bench carves what it has and the collector buys from stock ----------
  let cave = 0;
  const c = state.cave;
  if (state.unlocked.includes('crystalBench')) {
    const carved = Math.min(c.input, Math.floor(T / Cave.bench.processTime), Cave.bench.outputCapacity * 2);
    c.input -= carved;
    const ready = c.output + carved;
    const cycle = Cave.collector.interval + Cave.collector.stay;
    const visits = T >= c.collectorIn ? 1 + Math.floor((T - c.collectorIn) / cycle) : 0;
    const bought = Math.min(ready, visits * Cave.bench.outputCapacity);
    cave += bought * stationValue(state, 'statuetteValue');
    c.output = Math.min(ready - bought, Cave.bench.outputCapacity);
    c.progress = 0;
    c.collectorIn = visits > 0 ? Cave.collector.interval : c.collectorIn - T;
  }
  for (let i = 0; i < c.veins.length; i++) c.veins[i] = Math.max((c.veins[i] as number) - T, 0);

  const rate = offlineRate(state);
  return { seconds: T, capped, coins: Math.floor((fish + camp + cave) * rate), fish, camp, cave };
}
