// Balance simulation (Demo 3–4): a bot plays the economy with the real content numbers and the real
// mini-game / station / helper / threat logic, and reports when each unlock happens and what threats cost.
// Run: npm run sim            (add a number to change the run count, e.g. npm run sim -- 20)
import { Economy, type UnlockCostKey } from '../src/content/economy';
import { FishById, type FishId } from '../src/content/fish';
import { Stations } from '../src/content/stations';
import { UpgradeList, type UpgradeId } from '../src/content/upgrades';
import { IceShore, Regions, UnlockZones, type Vec2 } from '../src/content/zones';
import { createGameState, isDone, type FishItem, type GameState } from '../src/core/GameState';
import { seededRandom } from '../src/core/Random';
import { CustomerFeel, FishingFeel as F, RegionFeel, StationFeel, UnlockFeel } from '../src/settings';
import { rollFish } from '../src/systems/FishRoll';
import { smoke } from '../src/systems/Items';
import { PathGraphNav } from '../src/systems/Pathfinding';
import { ReelGame } from '../src/systems/ReelGame';
import { NetLogic, SmokerLogic } from '../src/systems/StationLogic';
import { carryCapacity, fishingMods, upgradeCost, type FishingMods } from '../src/systems/Upgrades';
import { Sleep } from '../src/content/igloo';
import { SleepFeel } from '../src/settings';
import { applyComfortUnlock, canSleepAt, payout, peaceScore, wakeRested } from '../src/systems/Rest';
import { DayCycle } from '../src/systems/DayCycle';
import { DayFeel } from '../src/settings';
import { scaledPrice, Tuning } from '../src/content/tuning';
import { Threats } from '../src/content/threats';
import {
  bearApproach,
  bearRoute,
  bearWarning,
  pickBearTarget,
  rollChest,
  scareReward,
  stealFrom,
  ThreatDirector,
  threatsUnlocked,
  type BearTargetId,
} from '../src/systems/ThreatLogic';
import { WorkerBrain, type StoreId, type WorkContext, type WorkStore } from '../src/systems/WorkerBrain';

declare const process: { argv: string[] };

const DT = 0.05;
const REACTION = 0.3; // seconds the bot needs to react to a tug or a bite
const DETOUR = 1.2; // real paths are longer than straight lines (obstacles, imperfect steering)
const DAWDLE = 1.0; // seconds lost per decision (looking around, small corrections)
const PASS: Vec2 = { x: -11.6, z: -1.2 };
const THREAT_REACTION = 1.0; // seconds before the bot drops what it does after a threat warning
const C = IceShore.counter;

// ---------- Mini-game bot ----------

type Bot = (g: ReelGame, t: number) => boolean;

/**
 * Holds; lets go `reaction` s after a tug is telegraphed (rod twitch + splash, or tension turning red) and re-grips
 * `reaction` s after it ends. With `onPull` it only reacts once the pull itself starts (a player ignoring the warning).
 */
function carefulBot(reaction: number, onPull = false): Bot {
  let dangerSince: number | null = null;
  let calmSince: number | null = null;
  return (g, t) => {
    const danger = (onPull ? g.phase === 'pull' : g.phase !== 'calm') || g.tension > F.redZoneStart;
    if (danger && dangerSince === null) dangerSince = t;
    if (!danger && dangerSince !== null) {
      dangerSince = null;
      calmSince = t;
    }
    if (dangerSince !== null && t - dangerSince >= reaction) return false;
    if (calmSince !== null && t - calmSince < reaction) return false;
    return true;
  };
}

const alwaysHold: Bot = () => true;

function reel(rand: () => number, mods: FishingMods, bot: Bot, species?: FishId): { caught: boolean; time: number; item: FishItem } {
  const fish = species ? forced(species, rand) : rollFish(rand, mods);
  const g = new ReelGame(fish, rand, mods);
  let t = 0;
  let r = 'reeling';
  while (r === 'reeling' && t < 60) {
    r = g.update(1 / 60, bot(g, t));
    t += 1 / 60;
  }
  return { caught: r === 'caught', time: t, item: fish.item };
}

function forced(id: FishId, rand: () => number) {
  const s = FishById[id];
  const size01 = Math.pow(rand(), 1.6);
  return { species: s, size01, difficulty: 1 + F.kgDifficulty * size01, item: { species: id, kg: 0, kind: 'raw' as const, price: 0 } };
}

/** One full fishing attempt at a hole: dwell, cast, wait, hook, reel. */
function fishSession(rand: () => number, mods: FishingMods): { time: number; item: FishItem | null } {
  let time = F.dwellToCast + F.castSwingTime + F.castFlightTime + F.biteDelayMin + rand() * (F.biteDelayMax - F.biteDelayMin);
  time += REACTION + 0.05; // tap after the bite (well inside the hook window)
  const r = reel(rand, mods, carefulBot(REACTION));
  time += r.time;
  if (r.caught) return { time, item: r.item };
  return { time: time + 0.4 + F.escapeRecastDelay, item: null };
}

// ---------- Economy simulation ----------

interface Customer {
  arriveAt: number;
  want: number;
  got: number;
  bill: number;
  takeTimer: number;
}

interface Options {
  seed: number;
  upgrades: boolean;
  /** Stop playing for `idleFor` seconds once this unlock is done, and measure what the town earns alone. */
  idleAfter?: string;
  idleFor?: number;
  endAt: number;
  /** How the bot treats bears and avalanches: 'active' answers every warning, 'ignore' never does, 'off' = no threats. */
  threats: 'active' | 'ignore' | 'off';
  /** 'on' sleeps every night (well rested buff), 'noBuff' sleeps but gets no buff (only skips nights), default off. */
  sleep?: 'on' | 'noBuff' | 'off';
}

interface ThreatStats {
  /** Seconds of play during which threats could come. */
  window: number;
  /** Coins earned (sales) during that window. */
  earned: number;
  bears: number;
  blocked: number;
  lostCoins: number;
  maxLoss: number;
  penguinHides: number;
  scareCoins: number;
  avalanches: number;
  chestCoins: number;
}

interface Result {
  unlocks: Record<string, number>;
  firstSale: number;
  upgradesBought: Array<{ id: UpgradeId; level: number; t: number }>;
  idle?: { pileGain: number; sold: number; smokedSold: number };
  earned: number;
  /** Peace tips paid (included in `earned`). */
  tips: number;
  nightsSlept: number;
  threat: ThreatStats;
}

/** A bear or avalanche in progress (sim view: just the times that matter). */
interface SimThreat {
  kind: 'bear' | 'avalanche';
  endAt: number;
  /** Bear: when it takes the fish (unless scared first). */
  grabAt?: number;
  target?: BearTargetId;
  penguin?: WorkerBrain | null;
  blocked?: boolean;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const inYard = (p: Vec2) => p.x < -11;

class Sim {
  t = 0;
  readonly state: GameState = createGameState();
  pos: Vec2 = { ...IceShore.playerSpawn };
  readonly rand: () => number;
  readonly result: Result = {
    unlocks: {},
    firstSale: -1,
    upgradesBought: [],
    earned: 0,
    tips: 0,
    nightsSlept: 0,
    threat: { window: 0, earned: 0, bears: 0, blocked: 0, lostCoins: 0, maxLoss: 0, penguinHides: 0, scareCoins: 0, avalanches: 0, chestCoins: 0 },
  };
  private readonly director: ThreatDirector;
  private threat: SimThreat | null = null;
  /** Seconds the bot owes for answering a threat; paid after its current action. */
  private debt = 0;
  private debtPos: Vec2 | null = null;
  private readonly tipCarry = { value: 0 };
  private readonly customers: Customer[] = [];
  private spawnTimer = 0.5;
  private net: NetLogic | null = null;
  private smoker: SmokerLogic | null = null;
  readonly workers: WorkerBrain[] = [];
  private readonly ctx: WorkContext;
  smokedSold = 0;

  readonly day: DayCycle;

  constructor(readonly opts: Options) {
    this.rand = seededRandom(opts.seed);
    const s = this.state;
    this.day = new DayCycle(s, () => DayFeel.dayLength.medium, this.rand);
    this.director = new ThreatDirector(this.rand);
    const store = (node: WorkStore['node'], o: Partial<WorkStore>): WorkStore => ({
      node,
      enabled: () => true,
      takeable: () => 0,
      take: () => null,
      room: () => 0,
      give: () => {},
      ...o,
    });
    const stores: Record<StoreId, WorkStore> = {
      basket: store('basket', { enabled: () => !!this.net, takeable: () => s.basket.length, take: () => s.basket.pop() ?? null }),
      smokerIn: store('smokeIn', {
        enabled: () => !!this.smoker,
        room: () => Stations.smokehouse.inputCapacity - s.smoker.input.length,
        give: (item) => s.smoker.input.push(item),
      }),
      smokerOut: store('smokeOut', {
        enabled: () => !!this.smoker,
        takeable: () => s.smoker.output.length,
        take: () => s.smoker.output.pop() ?? null,
      }),
      counter: store('counter', {
        room: () => Economy.counter.capacity - s.counter.length,
        give: (item) => s.counter.push(item),
      }),
    };
    this.ctx = { stores, nav: new PathGraphNav((id) => s.regions.includes(id)), homeNode: 'hut' };
  }

  get mods(): FishingMods {
    const d = this.day;
    return fishingMods(this.state, { night: d.isNight, aurora: d.auroraActive, rareBonus: d.rareFishBonus });
  }

  get capacity(): number {
    return carryCapacity(this.state);
  }

  /** Advances the town (customers, net, smokehouse, helpers) for `sec` seconds. */
  advance(sec: number): void {
    for (let left = sec; left > 1e-9; left -= DT) {
      const dt = Math.min(DT, left);
      this.t += dt;
      this.state.stats.playTime += dt;
      this.day.update(dt);
      if (threatsUnlocked(this.state)) this.result.threat.window += dt;
      this.updateThreats(dt);
      this.updateCustomers(dt);
      this.net?.update(dt);
      this.smoker?.update(dt);
      for (const w of this.workers) w.update(dt, this.ctx, this.workers);
    }
  }

  private updateCustomers(dt: number): void {
    const cfg = Economy.customers;
    this.spawnTimer -= dt * this.day.customerRate;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = cfg.spawnIntervalMin + this.rand() * (cfg.spawnIntervalMax - cfg.spawnIntervalMin);
      if (this.customers.length < cfg.maxQueue) {
        const slot = this.customers.length;
        const walk = dist(IceShore.customers.spawn, { x: C.servePoint.x, z: C.servePoint.z + slot * C.queueSpacing });
        this.customers.push({
          arriveAt: this.t + walk / CustomerFeel.walkSpeed,
          want: cfg.buyMin + Math.floor(this.rand() * (cfg.buyMax - cfg.buyMin + 1)),
          got: 0,
          bill: 0,
          takeTimer: 0,
        });
      }
    }
    const c = this.customers[0];
    if (!c || this.t < c.arriveAt) return;
    if (c.got >= c.want) {
      const pay = payout(this.state, c.bill, this.tipCarry);
      const value = pay.value + pay.tip;
      this.state.pile += value;
      this.result.earned += value;
      this.result.tips += pay.tip;
      if (threatsUnlocked(this.state)) this.result.threat.earned += value;
      this.customers.shift();
      for (const n of this.customers) n.arriveAt = Math.max(n.arriveAt, this.t + C.queueSpacing / CustomerFeel.walkSpeed);
      return;
    }
    c.takeTimer -= dt;
    const counter = this.state.counter;
    if (c.takeTimer > 0 || counter.length === 0) return;
    const i = Math.floor(this.rand() * counter.length);
    const item = counter[i] as FishItem;
    counter[i] = counter[counter.length - 1] as FishItem;
    counter.pop();
    c.takeTimer = CustomerFeel.takeInterval;
    c.got++;
    c.bill += item.price;
    this.state.stats.sold++;
    if (item.kind === 'smoked') this.smokedSold++;
    if (this.result.firstSale < 0) this.result.firstSale = this.t + CustomerFeel.flightTime;
  }

  // ---------- threats (GDD §13) ----------

  private updateThreats(dt: number): void {
    if (this.opts.threats === 'off') return;
    const th = this.threat;
    if (th) {
      if (th.kind === 'bear' && th.grabAt !== undefined && this.t >= th.grabAt) {
        th.grabAt = undefined;
        if (!th.blocked) this.bearGrabs(th);
      }
      if (this.t >= th.endAt) {
        this.threat = null;
        this.director.rest();
      }
      return;
    }
    const kind = this.director.update(dt, this.state, this.day.isNight);
    if (kind === 'bear') this.startBear();
    else if (kind === 'avalanche') this.startAvalanche();
  }

  private startBear(): void {
    const s = this.state;
    const out = this.workers.filter((w) => !w.hiding);
    const pick = pickBearTarget({
      basket: this.net ? s.basket.length : null,
      counter: s.counter.length,
      smokeOut: this.smoker ? s.smoker.output.length : null,
      penguins: out.map((w) => w.carried.length),
    });
    const penguin = out[pick.penguin] ?? null;
    const a = bearApproach(pick.id, penguin ? { x: penguin.x, z: penguin.z } : null);
    const warning = bearWarning(s, this.day.isNight);
    s.stats.bears++;
    const route = bearRoute([a.from, a.stand]);
    let len = 0;
    for (let i = 1; i < route.length; i++) len += dist(route[i - 1] as Vec2, route[i] as Vec2);
    const arrive = this.t + warning + len / Threats.bear.walkSpeed;
    const grabAt = arrive + Threats.bear.sniffTime;
    const th: SimThreat = { kind: 'bear', grabAt, endAt: grabAt + len / (Threats.bear.walkSpeed * 1.3), target: pick.id, penguin };
    this.result.threat.bears++;
    if (this.opts.threats === 'active') {
      // The bot drops what it does, walks over and holds: blocked if it gets there before the grab.
      const response = THREAT_REACTION + (dist(this.pos, a.stand) * DETOUR) / Economy.player.walkSpeed + Threats.bear.scareTime;
      if (this.t + response <= grabAt) {
        th.blocked = true;
        th.endAt = Math.max(this.t + response, arrive);
        this.result.threat.blocked++;
        const r = scareReward(this.rand);
        s.coins += r.coins;
        this.result.threat.scareCoins += r.coins;
        this.debt += response;
        this.debtPos = { ...a.stand };
      }
    }
    this.threat = th;
  }

  private bearGrabs(th: SimThreat): void {
    const s = this.state;
    if (th.target === 'penguin') {
      if (th.penguin && !th.penguin.hiding) {
        th.penguin.scare(Threats.bear.penguinHide, this.ctx);
        this.result.threat.penguinHides++;
      }
      return;
    }
    const list = th.target === 'basket' ? s.basket : th.target === 'counter' ? s.counter : s.smoker.output;
    const stolen = stealFrom(list, list.length, this.rand);
    const value = stolen.reduce((v, f) => v + f.price, 0);
    this.result.threat.lostCoins += value;
    this.result.threat.maxLoss = Math.max(this.result.threat.maxLoss, value);
  }

  private startAvalanche(): void {
    const A = Threats.avalanche;
    this.state.stats.avalanches++;
    this.result.threat.avalanches++;
    const chest = rollChest(this.rand);
    let endAt = this.t + A.warning + A.meltTime;
    if (this.opts.threats === 'active') {
      // The bot shovels its way to the pile with the chest (or one pile to open the way) and comes back.
      const corridor = { x: -18, z: -6.6 };
      const walk = (dist(this.pos, corridor) * DETOUR) / Economy.player.walkSpeed;
      const piles = chest === null ? 1 : 2;
      this.debt += THREAT_REACTION + A.warning + walk + piles * A.digTime;
      this.debtPos = corridor;
      endAt = this.t + A.warning + walk + piles * A.digTime;
      if (chest !== null) {
        this.state.coins += chest;
        this.result.threat.chestCoins += chest;
      }
    }
    this.threat = { kind: 'avalanche', endAt };
  }

  /** Time spent answering a threat is paid between actions (an approximation: actions are not interrupted). */
  payDebt(): void {
    if (this.debt <= 0) return;
    const d = this.debt;
    this.debt = 0;
    if (this.debtPos) this.pos = this.debtPos;
    this.debtPos = null;
    this.advance(d);
  }

  // ---------- sleep (GDD §14) ----------

  /** Walks to the bed, sleeps: threats end, the clock jumps to morning (the town does not run meanwhile). */
  goSleep(): void {
    this.walkTo(IceShore.bed);
    this.advance(SleepFeel.holdTime + SleepFeel.fadeOut);
    this.threat = null;
    this.director.rest(Threats.sessionGrace);
    this.day.skipTo(Sleep.wakeAt);
    if (this.opts.sleep === 'on') wakeRested(this.state);
    else this.state.sleep.lastDay = this.state.clock.day;
    this.result.nightsSlept++;
    this.advance(SleepFeel.darkTime + SleepFeel.fadeIn);
  }

  // ---------- player actions (each advances time) ----------

  walkTo(p: Vec2): void {
    let d = dist(this.pos, p);
    if (inYard(this.pos) !== inYard(p)) d = dist(this.pos, PASS) + dist(PASS, p);
    this.advance((d * DETOUR) / Economy.player.walkSpeed + DAWDLE);
    this.pos = { ...p };
  }

  /** Unlock frames and region gates that are visible now. */
  available(): Array<{ id: string; at: Vec2; cost: number; region: boolean }> {
    const s = this.state;
    const out: Array<{ id: string; at: Vec2; cost: number; region: boolean }> = [];
    for (const r of Regions) {
      if (!isDone(s, r.id) && r.requires.every((q) => isDone(s, q))) {
        out.push({ id: r.id, at: r.gate, cost: scaledPrice(Economy.unlocks[r.cost]), region: true });
      }
    }
    for (const z of UnlockZones) {
      if (isDone(s, z.id) || z.optional) continue;
      const region = Regions.find((r) => r.unlockZones.includes(z.id));
      if (region && !isDone(s, region.id)) continue;
      if (!z.requires.every((q) => isDone(s, q))) continue;
      out.push({ id: z.id, at: z, cost: scaledPrice(Economy.unlocks[z.cost as UnlockCostKey]), region: false });
    }
    return out.sort((a, b) => a.cost - b.cost);
  }

  unlock(u: { id: string; at: Vec2; cost: number; region: boolean }): void {
    this.walkTo(u.at);
    this.advance(UnlockFeel.startDelay + UnlockFeel.fillTime);
    this.state.coins -= u.cost;
    this.result.unlocks[u.id] = this.t;
    this.boughtSinceUnlock = 0;
    if (u.region) {
      this.state.regions.push(u.id);
      this.advance(RegionFeel.crackTime + RegionFeel.pause + RegionFeel.panTime + RegionFeel.holdTime + RegionFeel.returnTime);
      return;
    }
    this.state.unlocked.push(u.id);
    const zone = UnlockZones.find((z) => z.id === u.id);
    for (const e of zone?.effects ?? []) {
      if (e.kind === 'worker') {
        const home = IceShore.hut.idle;
        const data = { carried: [] };
        this.state.workers.push(data);
        this.workers.push(new WorkerBrain(data, this.workers.length, home.x, home.z));
      } else if (e.kind === 'igloo' || e.kind === 'decoration') applyComfortUnlock(this.state, e);
      else if (e.kind === 'station' && e.station === 'net') this.net = new NetLogic(this.state, this.rand);
      else if (e.kind === 'station' && e.station === 'smokehouse') this.smoker = new SmokerLogic(this.state);
    }
  }

  /** Upgrade levels bought since the last unlock (the bot buys one between unlocks, like an "optional" spend). */
  boughtSinceUnlock = 0;

  /** Cheapest upgrade worth buying now: affordable and small next to the next unlock goal. */
  upgradeToBuy(): UpgradeId | null {
    if (this.boughtSinceUnlock >= 1) return null;
    const next = this.available()[0];
    const goal = next ? next.cost : Infinity;
    let best: UpgradeId | null = null;
    let bestCost = Infinity;
    for (const u of UpgradeList) {
      const cost = upgradeCost(u.id, this.state.upgrades[u.id]);
      if (cost === null || cost > this.state.coins || cost > goal * 0.3) continue;
      if (cost < bestCost) {
        bestCost = cost;
        best = u.id;
      }
    }
    return best;
  }

  buyUpgrades(): void {
    this.walkTo(IceShore.bench.pad);
    for (let id = this.upgradeToBuy(); id; id = this.upgradeToBuy()) {
      const cost = upgradeCost(id, this.state.upgrades[id]) as number;
      this.state.coins -= cost;
      this.state.upgrades[id]++;
      this.result.upgradesBought.push({ id, level: this.state.upgrades[id], t: this.t });
      this.boughtSinceUnlock++;
      this.advance(0.6);
    }
  }

  fishUntilFull(): void {
    const holes = IceShore.holes.filter((h) => h.unlock === null || isDone(this.state, h.unlock));
    // Nearest open hole, standing on the ring edge facing the counter.
    const hole = holes.reduce((a, b) => (dist(this.pos, a) < dist(this.pos, b) ? a : b));
    this.walkTo({ x: hole.x, z: hole.z + 1.3 });
    while (this.state.carried.length < this.capacity) {
      const r = fishSession(this.rand, this.mods);
      this.advance(r.time);
      if (this.debt > 0) return; // a threat warning: go deal with it
      if (r.item) {
        this.state.carried.push(r.item);
        this.state.stats.caught++;
        if (FishById[r.item.species].auroraBuff) this.state.buffs.aurora = 60;
      }
    }
  }

  takeFrom(list: FishItem[], max: number): void {
    let n = 0;
    while (list.length > 0 && this.state.carried.length < this.capacity && n < max) {
      this.state.carried.push(list.pop() as FishItem);
      n++;
    }
    this.advance(n * StationFeel.transferInterval);
  }

  deliver(): void {
    const s = this.state;
    if (this.smoker) {
      const room = Stations.smokehouse.inputCapacity - s.smoker.input.length;
      if (room > 0 && s.carried.some((f) => f.kind === 'raw')) {
        this.walkTo({ x: -13.5, z: -2.8 });
        let moved = 0;
        for (let i = s.carried.length - 1; i >= 0 && moved < room; i--) {
          if (s.carried[i]?.kind !== 'raw') continue;
          s.smoker.input.push(s.carried.splice(i, 1)[0] as FishItem);
          moved++;
        }
        this.advance(moved * StationFeel.transferInterval);
      }
      if (s.smoker.output.length > 0) {
        this.walkTo({ x: -13.5, z: -0.2 });
        this.takeFrom(s.smoker.output, Infinity);
      }
    }
    if (s.carried.length > 0) {
      this.walkTo(C.dropPoint);
      const room = Economy.counter.capacity - s.counter.length;
      const n = Math.min(room, s.carried.length);
      for (let i = 0; i < n; i++) s.counter.push(s.carried.pop() as FishItem);
      this.advance(n * 0.12);
    }
    this.collectPile();
  }

  collectPile(): void {
    if (this.state.pile <= 0) return;
    this.walkTo(C.coinPile);
    this.advance(0.6);
    this.state.coins += this.state.pile;
    this.state.pile = 0;
  }

  run(): Result {
    const o = this.opts;
    let idleDone = false;
    while (this.t < o.endAt) {
      this.payDebt();
      if (o.sleep && o.sleep !== 'off' && canSleepAt(this.day.t)) {
        this.goSleep();
        continue;
      }
      if (o.idleAfter && !idleDone && isDone(this.state, o.idleAfter)) {
        idleDone = true;
        const pile0 = this.state.pile;
        const sold0 = this.state.stats.sold;
        const smoked0 = this.smokedSold;
        this.advance(o.idleFor ?? 180);
        this.result.idle = { pileGain: this.state.pile - pile0, sold: this.state.stats.sold - sold0, smokedSold: this.smokedSold - smoked0 };
        break;
      }
      const target = this.available().find((u) => u.cost <= this.state.coins);
      if (target) {
        this.unlock(target);
        continue;
      }
      if (o.upgrades && this.upgradeToBuy()) {
        this.buyUpgrades();
        continue;
      }
      const next = this.available()[0];
      if (next && this.state.pile > 0 && this.state.coins + this.state.pile >= next.cost) {
        this.collectPile();
        continue;
      }
      // Grab the basket on the way when no penguin does it.
      if (this.net && this.workers.length === 0 && this.state.basket.length > 0) {
        this.walkTo({ x: IceShore.net.basket.x, z: IceShore.net.basket.z + 1.1 });
        this.takeFrom(this.state.basket, Infinity);
      }
      if (this.state.carried.length < this.capacity) this.fishUntilFull();
      this.deliver();
    }
    return this.result;
  }
}

// ---------- Reports ----------

const fmt = (sec: number | undefined) => {
  if (sec === undefined) return '   —  ';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2)}:${String(s).padStart(2, '0')}`;
};
const median = (xs: number[]) => {
  const a = [...xs].sort((p, q) => p - q);
  return a.length ? (a[Math.floor((a.length - 1) / 2)] as number) : NaN;
};

const RUNS = Number(process.argv[2] ?? 12);
const ORDER = ['hole2', 'net', 'hut', 'smokeYard', 'smokehouse', 'hole3', 'penguin2', 'igloo2', 'igloo3', 'igloo4'];
const DECOR = ['flagpole', 'doormat', 'snowman', 'sled', 'lanterns', 'dryingRack', 'iceSculpture'];
const TARGET: Record<string, string> = {
  hole2: '~2 dk',
  net: '~4 dk',
  hut: '~6 dk',
  smokeYard: '~10 dk',
  smokehouse: '12–15 dk',
  hole3: '15+ dk',
  penguin2: '15+ dk',
  igloo2: '~8 dk',
  igloo3: '~18 dk',
  igloo4: '~32 dk',
};

function unlockTable(upgrades: boolean): void {
  const results: Result[] = [];
  for (let i = 0; i < RUNS; i++) results.push(new Sim({ seed: 1000 + i, upgrades, endAt: 45 * 60, threats: 'active' }).run());
  console.log(`\n## Açılış süreleri — ${upgrades ? 'yükseltme alan bot' : 'yükseltme almayan bot'} (${RUNS} koşu, medyan [min–maks], oyun içi süre)`);
  console.log('| Açılış | Hedef | Medyan | Aralık |');
  console.log('|---|---|---|---|');
  console.log(`| İlk satış | <1 dk | ${fmt(median(results.map((r) => r.firstSale)))} | |`);
  for (const id of ORDER) {
    const ts = results.map((r) => r.unlocks[id]).filter((x): x is number => x !== undefined);
    console.log(`| ${id} | ${TARGET[id]} | ${fmt(median(ts))} | ${fmt(Math.min(...ts))}–${fmt(Math.max(...ts))} |`);
  }
  const decor = DECOR.map((id) => `${id} ${fmt(median(results.map((r) => r.unlocks[id]).filter((x): x is number => x !== undefined))).trim()}`);
  console.log('Dekorasyonlar (medyan): ' + decor.join(', '));
  if (upgrades) {
    const r = results[0] as Result;
    console.log('\nÖrnek koşuda alınan yükseltmeler: ' + r.upgradesBought.map((u) => `${u.id} Sv${u.level} @${fmt(u.t).trim()}`).join(', '));
  }
}

function idleTest(after: string, label: string): void {
  const gains: number[] = [];
  const sold: number[] = [];
  const smoked: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const r = new Sim({ seed: 2000 + i, upgrades: true, idleAfter: after, idleFor: 180, endAt: 60 * 60, threats: 'off' }).run();
    if (!r.idle) continue;
    gains.push(r.idle.pileGain);
    sold.push(r.idle.sold);
    smoked.push(r.idle.smokedSold);
  }
  console.log(
    `| ${label} | ${median(gains)} coin | ${Math.min(...gains)}–${Math.max(...gains)} | ${median(sold)} balık (${median(smoked)} tütsü) |`,
  );
}

/** Sleep and peace (GDD §14): what the "well rested" buff adds to income over the same real play time. */
function sleepTable(): void {
  const rows: Array<[string, 'off' | 'on' | 'noBuff']> = [
    ['Uyumayan bot', 'off'],
    ['Uyuyan bot, buff yok (yalnız gece atlar)', 'noBuff'],
    ['Uyuyan bot, buff var', 'on'],
  ];
  const minutes = 60;
  const totals: number[] = [];
  console.log(`\n## Uyku ve huzur (${RUNS} koşu × ${minutes} dk gerçek oyun, yükseltme alan bot, tehditler aktif)`);
  console.log('| Bot | Kazanç | Fark | Uyunan gece | Bahşiş | Huzur (son) |');
  console.log('|---|---|---|---|---|---|');
  for (const [label, sleep] of rows) {
    let earned = 0;
    let nights = 0;
    let tips = 0;
    let peace = 0;
    for (let i = 0; i < RUNS; i++) {
      const sim = new Sim({ seed: 4000 + i, upgrades: true, endAt: minutes * 60, threats: 'active', sleep });
      const r = sim.run();
      earned += r.earned;
      nights += r.nightsSlept;
      tips += r.tips;
      peace += peaceScore(sim.state);
    }
    totals.push(earned);
    const base = totals[0] as number;
    const diff = totals.length === 1 ? '—' : `%${(((earned - base) / base) * 100).toFixed(1)}`;
    console.log(`| ${label} | ${Math.round(earned / RUNS)} | ${diff} | ${(nights / RUNS).toFixed(1)} | ${Math.round(tips / RUNS)} | ${(peace / RUNS).toFixed(1)} |`);
  }
  const [off, noBuff, on] = totals as [number, number, number];
  console.log(
    `Buff'ın kendi etkisi (buff var / buff yok): %${(((on - noBuff) / noBuff) * 100).toFixed(1)} (hedef ≤ ~%12). ` +
      `Uyumak buff'sız kazandırmaz (atlanan gecede istasyonlar çalışmaz); uyumayan bot ${Math.round(off / RUNS)} coin ile cezasız oynar.`,
  );
}

/** Bears and avalanches (GDD §13): what they cost an active player and one who never reacts. */
function threatTable(): void {
  const runs = (threats: Options['threats']) => {
    const out: ThreatStats[] = [];
    for (let i = 0; i < RUNS; i++) out.push(new Sim({ seed: 3000 + i, upgrades: true, endAt: 90 * 60, threats }).run().threat);
    return out;
  };
  const sum = (xs: ThreatStats[], f: (t: ThreatStats) => number) => xs.reduce((a, t) => a + f(t), 0);
  const scale = Tuning.threatScale;
  Tuning.threatScale = 1;
  const rows: Array<[string, ThreatStats[]]> = [
    ['Tehdit yok (threatScale 0)', runs('off')],
    ['Aktif oyuncu', runs('active')],
    ['Hiç ilgilenmeyen oyuncu', runs('ignore')],
  ];
  Tuning.threatScale = scale;
  console.log(`\n## Tehditler — ayı ve çığ (${RUNS} koşu × 90 dk; tehditlerin açık olduğu süreye göre, saat başına)`);
  console.log('| Oyuncu | Ayı/sa | Engellenen | Kayıp/ayı | En büyük kayıp | Kayıp/sa | Korkutma ödülü/sa | Penguen saklandı/sa | Çığ/sa | Sandık/sa | Satış/sa |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [label, xs] of rows) {
    const hours = sum(xs, (t) => t.window) / 3600;
    const bears = sum(xs, (t) => t.bears);
    const blocked = sum(xs, (t) => t.blocked);
    const lost = sum(xs, (t) => t.lostCoins);
    const hit = bears - blocked;
    const per = (v: number) => (hours > 0 ? (v / hours).toFixed(1) : '—');
    console.log(
      `| ${label} | ${per(bears)} | ${bears ? `%${Math.round((blocked / bears) * 100)}` : '—'} | ${hit ? (lost / hit).toFixed(1) : '—'} | ${Math.max(0, ...xs.map((t) => t.maxLoss))} | ${per(lost)} | ${per(sum(xs, (t) => t.scareCoins))} | ${per(sum(xs, (t) => t.penguinHides))} | ${per(sum(xs, (t) => t.avalanches))} | ${per(sum(xs, (t) => t.chestCoins))} | ${per(sum(xs, (t) => t.earned))} |`,
    );
  }
  console.log('"Kayıp/ayı" yalnızca engellenemeyen ayılar için; kayıp = çalınan balıkların satış değeri (tek seferde en fazla 40).');
}

function reelTable(): void {
  const rand = seededRandom(7);
  const trials = 600;
  const rate = (id: FishId, mods: FishingMods, bot: () => Bot) => {
    let caught = 0;
    let time = 0;
    for (let i = 0; i < trials; i++) {
      const r = reel(rand, mods, bot(), id);
      if (r.caught) {
        caught++;
        time += r.time;
      }
    }
    return { pct: Math.round((caught / trials) * 100), time: time / Math.max(caught, 1) };
  };
  const base: FishingMods = { lineStrength: 1, reelSpeed: 1, bigFishWeight: 1, baitLevel: 1 };
  const up = (id: UpgradeId, lv: number) => (UpgradeList.find((u) => u.id === id)?.values[lv - 1] ?? 1) as number;

  console.log('\n## Yükseltmelerin mini oyuna etkisi (600 deneme / hücre)');
  console.log(
    'Sağlam misina — yakalama oranı. "Uyarıda" = seğirme/sıçramayı görüp 0.3 sn içinde bırakan, ' +
      '"çekişte" = uyarıyı kaçırıp çekiş başlayınca 0.3 sn sonra bırakan, "hep bas" = hiç bırakmayan oyuncu:',
  );
  console.log('| Misina | Morina hep bas | Alabalık uyarıda | Alabalık çekişte | Alabalık hep bas | Kalkan uyarıda | Kalkan çekişte |');
  console.log('|---|---|---|---|---|---|---|');
  for (let lv = 1; lv <= 5; lv++) {
    const m = { ...base, lineStrength: up('line', lv) };
    const cells = [
      rate('cod', m, () => alwaysHold),
      rate('char', m, () => carefulBot(0.3)),
      rate('char', m, () => carefulBot(0.3, true)),
      rate('char', m, () => alwaysHold),
      rate('halibut', m, () => carefulBot(0.3)),
      rate('halibut', m, () => carefulBot(0.3, true)),
    ];
    console.log(`| Sv${lv} | ${cells.map((c) => `%${c.pct}`).join(' | ')} |`);
  }
  console.log('\nHızlı makara — ortalama sarma süresi (dikkatli oyuncu, 0.3 sn):');
  console.log('| Makara | Kapelin | Morina | Alabalık | Kalkan |');
  console.log('|---|---|---|---|---|');
  for (let lv = 1; lv <= 5; lv++) {
    const m = { ...base, reelSpeed: up('reel', lv) };
    const cells = (['capelin', 'cod', 'char', 'halibut'] as FishId[]).map((id) => rate(id, m, () => carefulBot(0.3)));
    console.log(`| Sv${lv} | ${cells.map((c) => `${c.time.toFixed(1)} sn`).join(' | ')} |`);
  }
}

function baitTable(): void {
  const rand = seededRandom(9);
  const n = 200_000;
  console.log('\n## Özel yem — tür dağılımı ve ortalama değer (200 000 vuruş / seviye)');
  console.log('| Yem | Kapelin | Morina | Alabalık | Kalkan | Ort. çiğ değer | Ort. tütsü değeri |');
  console.log('|---|---|---|---|---|---|---|');
  for (let lv = 1; lv <= 5; lv++) {
    const mods: FishingMods = { lineStrength: 1, reelSpeed: 1, bigFishWeight: UpgradeList[2]?.values[lv - 1] ?? 1, baitLevel: lv, night: false, aurora: false };
    const counts: Record<string, number> = {};
    let raw = 0;
    let smoked = 0;
    for (let i = 0; i < n; i++) {
      const f = rollFish(rand, mods).item;
      counts[f.species] = (counts[f.species] ?? 0) + 1;
      raw += f.price;
      smoked += smoke(f).price;
    }
    const pct = (id: string) => (((counts[id] ?? 0) / n) * 100).toFixed(1);
    const halibut = counts.halibut ?? 0;
    console.log(
      `| Sv${lv} | %${pct('capelin')} | %${pct('cod')} | %${pct('char')} | ${halibut === 0 ? '0 (hiç)' : `%${pct('halibut')}`} | ${(raw / n).toFixed(2)} | ${(smoked / n).toFixed(2)} |`,
    );
  }

  // Night (GDD §12): night fish + aurora glowfish join the pool; a storm boosts rare fish.
  console.log('\n## Gece ve fırtına — tür dağılımı (yem Sv1, 200 000 vuruş)');
  console.log('| Durum | Kapelin | Morina | Alabalık | Ay morinası | Gece alabalığı | Işık balığı | Ort. çiğ değer |');
  console.log('|---|---|---|---|---|---|---|---|');
  const rows: Array<[string, FishingMods]> = [
    ['Gündüz', { lineStrength: 1, reelSpeed: 1, bigFishWeight: 1, baitLevel: 1, night: false, aurora: false }],
    ['Gece (aurora)', { lineStrength: 1, reelSpeed: 1, bigFishWeight: 1, baitLevel: 1, night: true, aurora: true }],
    ['Gündüz fırtına', { lineStrength: 1, reelSpeed: 1, bigFishWeight: 1.5, baitLevel: 1, night: false, aurora: false }],
  ];
  for (const [label, mods] of rows) {
    const counts: Record<string, number> = {};
    let raw = 0;
    for (let i = 0; i < n; i++) {
      const f = rollFish(rand, mods).item;
      counts[f.species] = (counts[f.species] ?? 0) + 1;
      raw += f.price;
    }
    const pct = (id: string) => `%${(((counts[id] ?? 0) / n) * 100).toFixed(1)}`;
    console.log(`| ${label} | ${['capelin', 'cod', 'char', 'moonCod', 'nightChar', 'glowfish'].map(pct).join(' | ')} | ${(raw / n).toFixed(2)} |`);
  }
}

console.log('# Northbite denge simülasyonu');
if (process.argv[3] !== 'reel') {
  console.log(`Bot: tepki ${REACTION} sn, yürüyüş ${DETOUR}× düz çizgi + karar başına ${DAWDLE} sn oyalanma.`);
  unlockTable(false);
  unlockTable(true);
  console.log('\n## Boşta kalma testi — 3 dk hiç dokunmadan coin yığını ne kadar büyüyor?');
  console.log('| Ne zaman | Yığına eklenen | Aralık | Satılan |');
  console.log('|---|---|---|---|');
  idleTest('hut', 'Ağ + 1. penguen açılınca');
  idleTest('smokehouse', 'Tütsühane açılınca');
  threatTable();
  sleepTable();
}
reelTable();
baitTable();
