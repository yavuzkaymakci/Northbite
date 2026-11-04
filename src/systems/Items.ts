import { Stations } from '../content/stations';
import type { FishItem } from '../core/GameState';

/** The smoked version of a raw fish: same species and kg, value × the smokehouse multiplier. */
export function smoke(item: FishItem): FishItem {
  return { ...item, kind: 'smoked', price: Math.round(item.price * Stations.smokehouse.valueMultiplier) };
}
