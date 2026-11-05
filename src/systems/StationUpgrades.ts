import { Economy } from '../content/economy';
import { Camp, Cave } from '../content/land';
import { Stations } from '../content/stations';
import {
  StationUpgradeById,
  StationUpgradeList,
  type StationUpgradeDef,
  type StationUpgradeId,
  type StationUpgradeTarget,
} from '../content/stationUpgrades';
import { scaledPrice } from '../content/tuning';
import { UpgradeMaxLevel } from '../content/upgrades';
import { Workers } from '../content/workers';
import { isDone, type GameState } from '../core/GameState';

// Station values the game, the offline formula and the sim all read from one place (GDD §18): the content default,
// or the value of the station upgrade's current level.

export type StationValueId = Exclude<StationUpgradeTarget, 'offlineCapHours' | 'offlineRate'>;

const BASE: Record<StationUpgradeTarget, number> = {
  netInterval: Stations.net.interval,
  basketCapacity: Stations.net.basketCapacity,
  penguinSpeed: Workers.penguin.walkSpeed,
  penguinCarry: Workers.penguin.carryCapacity,
  smokeTime: Stations.smokehouse.smokeTime,
  counterCapacity: Economy.counter.capacity,
  plateTime: Camp.kitchen.plateTime,
  tentRent: Camp.tent.rentPerMin,
  statuetteValue: Cave.statuetteValue,
  offlineCapHours: Economy.offline.capHours,
  offlineRate: Economy.offline.rate,
};

const BY_TARGET = new Map(StationUpgradeList.map((u) => [u.target, u]));

function value(state: GameState, target: StationUpgradeTarget): number {
  const def = BY_TARGET.get(target);
  if (!def) return BASE[target];
  return stationUpgradeValue(def.id, state.stationUpgrades[def.id] ?? 1);
}

/** A station value right now. */
export function stationValue(state: GameState, id: StationValueId): number {
  return value(state, id);
}

/** Hours of offline time that count. */
export function offlineCapHours(state: GameState): number {
  return value(state, 'offlineCapHours');
}

/** Share of the automated chain's income paid for offline time. */
export function offlineRate(state: GameState): number {
  return value(state, 'offlineRate');
}

export function stationUpgradeValue(id: StationUpgradeId, level: number): number {
  const v = StationUpgradeById[id].values;
  return v[Math.min(Math.max(level, 1), v.length) - 1] as number;
}

/** Price of the next level, or null at max level. */
export function stationUpgradeCost(id: StationUpgradeId, level: number): number | null {
  if (level >= UpgradeMaxLevel) return null;
  const def = StationUpgradeById[id];
  return scaledPrice(def.baseCost * Math.pow(def.growth, level - 1));
}

/** Cards for locked stations (camp, cave...) stay hidden until those exist. */
export function stationUpgradeVisible(state: GameState, def: StationUpgradeDef): boolean {
  return def.requires === null || isDone(state, def.requires);
}
