import { DecorationList } from '../content/decorations';
import { IglooLevels, Peace, RestedBuffs, Sleep } from '../content/igloo';
import { TimeOfDay } from '../content/time';
import { Tuning } from '../content/tuning';
import type { GameState } from '../core/GameState';
import { penguinPeace } from './PenguinLogic';

// Igloo, sleep and peace rules (GDD §14), shared by the game and the balance sim. No Three.js or DOM here.

const NO_BUFF = { sale: 0, reel: 0, carry: 0, rare: 0 } as const;

/** Game time in days since the start: `day - 1 + t`. */
export function gameTime(state: GameState): number {
  return state.clock.day - 1 + state.clock.t;
}

export function iglooDef(level: number) {
  return IglooLevels[Math.min(Math.max(level, 1), IglooLevels.length) - 1] as (typeof IglooLevels)[number];
}

/** The bed works from late evening until dawn. */
export function canSleepAt(t: number): boolean {
  return t >= Sleep.from;
}

/** "Well rested" buff in effect right now (all zeros when none). */
export function restedBuff(state: GameState): { sale: number; reel: number; carry: number; rare: number } {
  const r = state.rested;
  if (!r || gameTime(state) >= r.until) return NO_BUFF;
  return RestedBuffs[r.quality - 1] ?? NO_BUFF;
}

/** Days of buff left (0 = none). */
export function restedLeft(state: GameState): number {
  const r = state.rested;
  return r ? Math.max(r.until - gameTime(state), 0) : 0;
}

/**
 * Sleeping: the clock is moved to the next morning by the caller; this starts the buff for that whole day.
 * Call it after the clock jump.
 */
export function wakeRested(state: GameState): void {
  const quality = iglooDef(state.iglooLevel).quality;
  state.rested = { quality, until: state.clock.day }; // end of the day just started
  state.sleep.lastDay = state.clock.day;
  state.sleep.hintDone = true;
}

/** Peace score: the igloo level plus every decoration. Read by tips now, by the hot spring camp later (stage 4). */
export function peaceScore(state: GameState): number {
  let p = iglooDef(state.iglooLevel).peace;
  for (const d of DecorationList) if (state.decorations.includes(d.id)) p += d.peace;
  // Cute penguins add peace too (GDD §24).
  return p + penguinPeace(state);
}

/**
 * Sale bonuses added together and capped (`Tuning.saleBonusCap`): `buff` raises the price, `tip` comes as extra
 * tip coins. Tips fill whatever room the cap leaves.
 */
export function saleBonuses(state: GameState): { buff: number; tip: number } {
  const cap = Tuning.saleBonusCap;
  const aurora = state.buffs.aurora > 0 ? TimeOfDay.aurora.saleBonus : 0;
  const buff = Math.min(aurora + restedBuff(state).sale, cap);
  const tip = Math.min(peaceScore(state) * Peace.tipPerPoint, Peace.maxTip, cap - buff);
  return { buff, tip };
}

/** What a customer pays for `bill` worth of fish; `tipCarry` keeps the fractions of tips between sales. */
export function payout(state: GameState, bill: number, tipCarry: { value: number }): { value: number; tip: number } {
  const b = saleBonuses(state);
  tipCarry.value += bill * b.tip;
  const tip = Math.floor(tipCarry.value);
  tipCarry.value -= tip;
  return { value: Math.round(bill * (1 + b.buff)), tip };
}

/** Marks an igloo level or decoration as owned (game and sim). */
export function applyComfortUnlock(state: GameState, effect: { kind: string; level?: number; decoration?: string }): void {
  if (effect.kind === 'igloo' && effect.level) state.iglooLevel = Math.max(state.iglooLevel, effect.level);
  if (effect.kind === 'decoration' && effect.decoration && !state.decorations.includes(effect.decoration)) {
    state.decorations.push(effect.decoration);
  }
}
