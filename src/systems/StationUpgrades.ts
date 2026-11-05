import { Economy } from '../content/economy';
import { Camp, Cave } from '../content/land';
import { Stations } from '../content/stations';
import { Workers } from '../content/workers';
import type { GameState } from '../core/GameState';

// Station values the game, the offline formula and the sim all read from one place (GDD §18).

export type StationValueId =
  | 'netInterval'
  | 'basketCapacity'
  | 'penguinSpeed'
  | 'penguinCarry'
  | 'smokeTime'
  | 'counterCapacity'
  | 'plateTime'
  | 'tentRent'
  | 'statuetteValue';

const BASE: Record<StationValueId, number> = {
  netInterval: Stations.net.interval,
  basketCapacity: Stations.net.basketCapacity,
  penguinSpeed: Workers.penguin.walkSpeed,
  penguinCarry: Workers.penguin.carryCapacity,
  smokeTime: Stations.smokehouse.smokeTime,
  counterCapacity: Economy.counter.capacity,
  plateTime: Camp.kitchen.plateTime,
  tentRent: Camp.tent.rentPerMin,
  statuetteValue: Cave.statuetteValue,
};

/** A station value right now. */
export function stationValue(_state: GameState, id: StationValueId): number {
  return BASE[id];
}

/** Hours of offline time that count. */
export function offlineCapHours(_state: GameState): number {
  return Economy.offline.capHours;
}

/** Share of the automated chain's income paid for offline time. */
export function offlineRate(_state: GameState): number {
  return Economy.offline.rate;
}
