import { Stations } from '../content/stations';
import type { FishItem, GameState } from '../core/GameState';
import { rollFrom } from './FishRoll';
import { smoke } from './Items';
import { stationValue } from './StationUpgrades';

// Visual-free station rules, shared by the game and the balance sim (tools/balance-sim.ts).

/** Net on hole 1: adds a fish to the basket every interval while the basket has room. */
export class NetLogic {
  private timer = 0;

  constructor(
    private readonly state: GameState,
    private readonly rand: () => number = Math.random,
  ) {}

  get full(): boolean {
    return this.state.basket.length >= stationValue(this.state, 'basketCapacity');
  }

  /** Returns the new fish when one is caught this step. */
  update(dt: number): FishItem | null {
    if (this.full) {
      this.timer = 0;
      return null;
    }
    this.timer += dt;
    const interval = stationValue(this.state, 'netInterval');
    if (this.timer < interval) return null;
    this.timer -= interval;
    const item = rollFrom(Stations.net.pool, this.rand);
    this.state.basket.push(item);
    return item;
  }
}

/** Smokehouse: smokes the first raw fish of the input rack, then moves it to the output rack. */
export class SmokerLogic {
  constructor(private readonly state: GameState) {}

  get working(): boolean {
    const s = this.state.smoker;
    return s.input.length > 0 && s.output.length < Stations.smokehouse.outputCapacity;
  }

  /** Returns the finished smoked fish when one is done this step. */
  update(dt: number): FishItem | null {
    const s = this.state.smoker;
    if (!this.working) return null;
    s.progress += dt / stationValue(this.state, 'smokeTime');
    if (s.progress < 1) return null;
    s.progress = 0;
    const raw = s.input.shift() as FishItem;
    const done = smoke(raw);
    s.output.push(done);
    return done;
  }
}
