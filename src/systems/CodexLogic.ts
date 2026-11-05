import { CodexRewards, Variants, type CodexRewardId, type VariantId } from '../content/codex';
import { FishSpeciesList } from '../content/fish';
import { scaledPrice } from '../content/tuning';
import type { FishItem, GameState } from '../core/GameState';

// Fish encyclopedia rules (GDD §19), shared by the game and the balance sim. No Three.js or DOM here.

/** Rolls a colour variant for a rod catch (rainbow only at night under the aurora). One random number. */
export function rollVariant(rand: () => number, env: { night: boolean; aurora: boolean }): VariantId | undefined {
  const r = rand();
  let acc = 0;
  for (const id of ['rainbow', 'gold'] as const) {
    const v = Variants[id];
    if (v.nightAuroraOnly && !(env.night && env.aurora)) continue;
    acc += v.chance;
    if (r < acc) return id;
  }
  return undefined;
}

export interface CatchRecord {
  /** First catch of the species. */
  isNew: boolean;
  /** A heavier fish than the species record (never on the first catch). */
  record: boolean;
  /** First fish of this variant ever (any species). */
  firstVariant: VariantId | null;
}

/** Counts a catch in the encyclopedia: discovery, count, kg record, first day, variants. */
export function recordCatch(state: GameState, item: FishItem): CatchRecord {
  const c = state.codex;
  const id = item.species;
  const isNew = !state.seen.includes(id);
  if (isNew) {
    state.seen.push(id);
    if (!c.fresh.includes(id)) c.fresh.push(id);
  }
  const rec = c.species[id] ?? { count: 0, bestKg: 0, firstDay: 0 };
  const record = rec.count > 0 && item.kg > rec.bestKg;
  rec.count++;
  rec.bestKg = Math.max(rec.bestKg, item.kg);
  if (!rec.firstDay) rec.firstDay = state.clock.day;
  c.species[id] = rec;
  let firstVariant: VariantId | null = null;
  if (item.variant) {
    const list = c.variants[item.variant];
    if (list.length === 0) firstVariant = item.variant;
    if (!list.includes(id)) list.push(id);
  }
  return { isNew, record, firstVariant };
}

/** Collection rewards whose condition is met and that were not given yet. */
export function rewardsDue(state: GameState): CodexRewardId[] {
  const c = state.codex;
  return (Object.keys(CodexRewards) as CodexRewardId[]).filter((id) => {
    if (c.rewards.includes(id)) return false;
    const r = CodexRewards[id];
    if (r.species !== undefined) return state.seen.length >= Math.min(r.species, FishSpeciesList.length);
    if (r.variant) return c.variants[r.variant].length > 0;
    return false;
  });
}

/** Gives a collection reward once. Returns the coins paid and the decoration to build, for the visuals. */
export function grantReward(state: GameState, id: CodexRewardId): { coins: number; decoration: string | null } {
  const c = state.codex;
  if (c.rewards.includes(id)) return { coins: 0, decoration: null };
  c.rewards.push(id);
  const r = CodexRewards[id];
  const coins = r.coins ? scaledPrice(r.coins) : 0;
  state.coins += coins;
  if (r.title) c.title = true;
  if (r.rareBait) c.rareBait += r.rareBait;
  let decoration: string | null = null;
  if (r.decoration && !state.unlocked.includes(r.decoration)) {
    decoration = r.decoration;
    state.unlocked.push(decoration);
    state.decorations.push(decoration);
  }
  return { coins, decoration };
}
