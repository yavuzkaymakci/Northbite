import { Pages, type PageId, type PageTrigger } from '../content/story';
import type { GameState } from '../core/GameState';

// Journal page rules (GDD §15), shared by the game and the balance sim.

/** Main-path pages whose condition is met in the state but which are not found yet. */
export function mainPagesDue(state: GameState): PageId[] {
  const met: Partial<Record<PageTrigger, boolean>> = {
    smokehouse: state.unlocked.includes('smokehouse'),
    firstCrystal: state.cave.mined > 0,
    firstPlatter: state.camp.served > 0,
  };
  return Pages.filter((p) => met[p.trigger] && !state.story.pages.includes(p.id)).map((p) => p.id);
}

/** The page found by an event (chest, bear, hidden spot), if it is still missing. */
export function pageFor(state: GameState, trigger: PageTrigger): PageId | null {
  const page = Pages.find((p) => p.trigger === trigger);
  return page && !state.story.pages.includes(page.id) ? page.id : null;
}

export function findPage(state: GameState, id: PageId): void {
  if (!state.story.pages.includes(id)) state.story.pages.push(id);
}
