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
import { Camp as CampCfg, Cave as CaveCfg } from '../src/content/land';
import { CampLayout, CaveLayout } from '../src/content/zones';
import { CaveLogic, GuestLogic, KitchenLogic } from '../src/systems/LandLogic';
import { stationUpgradeCost, stationUpgradeValue, stationUpgradeVisible, stationValue } from '../src/systems/StationUpgrades';
import { StationUpgradeList, type StationUpgradeId } from '../src/content/stationUpgrades';
import { applyOffline } from '../src/systems/Offline';
import { grantReward, recordCatch, rewardsDue } from '../src/systems/CodexLogic';
import { deliverOrder, orderProgress, updateOrders } from '../src/systems/OrderLogic';
import { Variants } from '../src/content/codex';
import type { OrderKind } from '../src/content/orders';
import { findPage, mainPagesDue } from '../src/systems/StoryLogic';
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
  stealPlates,
  ThreatDirector,
  threatsUnlocked,
  type BearTargetId,
} from '../src/systems/ThreatLogic';
import { WorkerBrain, type WorkContext } from '../src/systems/WorkerBrain';
import { JobBoard, type Stores, type WorkStore } from '../src/systems/JobBoard';
import { veinStore } from '../src/systems/LandLogic';
import {
  addXp,
  availableRoles,
  buyOffer,
  firstPenguin,
  hutCapacity,
  hutUpgradeCost,
  offerPrice,
  penguinCarry,
  penguinSpeed,
  rerollOffers,
  updateMarket,
  upgradeHut,
} from '../src/systems/PenguinLogic';
import { PenguinLevels } from '../src/content/penguins';
import { RoleList, type RoleId } from '../src/content/roles';
import { isFish } from '../src/core/GameState';
import { refillRack } from '../src/systems/VoyageLogic';

declare const process: { argv: string[] };

const DT = 0.05;
const REACTION = 0.3; // seconds the bot needs to react to a tug or a bite
const DETOUR = 1.2; // real paths are longer than straight lines (obstacles, imperfect steering)
const DAWDLE = 1.0; // seconds lost per decision (looking around, small corrections)
const PASS: Vec2 = { x: -11.6, z: -1.2 };
const BRIDGE: Vec2 = { x: 10.9, z: -1.1 };
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
  /** Part of the bill that was smoked fish. */
  smoked: number;
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
  /** Also buy station and time upgrades (GDD §18) with the same "one per unlock, under 30% of the goal" rule. */
  stationUpgrades?: boolean;
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
  upgradesBought: Array<{ id: string; level: number; t: number }>;
  idle?: { pileGain: number; sold: number; smokedSold: number };
  earned: number;
  /** Peace tips paid (included in `earned`). */
  tips: number;
  /** Income by line (GDD §16), including tips: counter sales of raw / smoked fish, the camp, the cave. */
  income: Income;
  /** Game state copies when the automation stages open (offline report), with the income rate right after. */
  snapshots: Partial<Record<OfflineStage, Snapshot>>;
  /** Encyclopedia and order board (GDD §19, §20). */
  extra: Extras;
  /** `extra` at 60 minutes. */
  extra60?: Extras;
  /** `income` at 60 minutes. */
  income60?: Income;
  nightsSlept: number;
  threat: ThreatStats;
  /** Total income at every full minute (role effect report). */
  timeline: number[];
  /** When each penguin role was first bought (GDD §24). */
  roles: Partial<Record<RoleId, number>>;
}

type OfflineStage = 'hut' | 'smokehouse' | 'penguin3' | 'attendant' | 'penguin5';
const OFFLINE_STAGES: OfflineStage[] = ['hut', 'smokehouse', 'penguin3', 'attendant', 'penguin5'];

interface Snapshot {
  state: GameState;
  t: number;
  earnedAt: number;
  /** Active income per hour over the 20 minutes after the stage opened. */
  perHour?: number;
}

interface Extras {
  /** Coins from delivered orders and from collection rewards. */
  orderCoins: number;
  codexCoins: number;
  /** Sale value of what was handed over for orders (the counter would have paid it). */
  orderGiven: number;
  /** Value of rod catches, and the part that came from gold/rainbow variants (above the normal price). */
  rodValue: number;
  variantExtra: number;
  /** Per order kind: made, delivered, seconds from appearing to delivery. */
  orders: Partial<Record<OrderKind, { made: number; done: number; secs: number[] }>>;
}

interface Income {
  raw: number;
  smoked: number;
  camp: number;
  cave: number;
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

/** Something the bot can pay for: an unlock frame, a region gate, a penguin from the market or a hut level. */
interface Target {
  id: string;
  at: Vec2;
  cost: number;
  region: boolean;
  kind?: 'penguin' | 'hut';
  offer?: number;
}

/**
 * The bot's penguins in order, the hut's free carrier first (GDD §24 targets: 2nd ~28 min, 3rd ~40 min, the first
 * miner / cook ~50 min).
 */
const BOT_PLAN: readonly RoleId[] = ['carrier', 'smoker', 'carrier', 'miner', 'cook'];
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
    income: { raw: 0, smoked: 0, camp: 0, cave: 0 },
    snapshots: {},
    extra: { orderCoins: 0, codexCoins: 0, orderGiven: 0, rodValue: 0, variantExtra: 0, orders: {} },
    nightsSlept: 0,
    timeline: [],
    roles: {},
    threat: { window: 0, earned: 0, bears: 0, blocked: 0, lostCoins: 0, maxLoss: 0, penguinHides: 0, scareCoins: 0, avalanches: 0, chestCoins: 0 },
  };
  private readonly director: ThreatDirector;
  private threat: SimThreat | null = null;
  /** Seconds the bot owes for answering a threat; paid after its current action. */
  private debt = 0;
  private debtPos: Vec2 | null = null;
  private readonly tipCarry = { value: 0 };
  // Lands (GDD §15)
  private readonly caveLogic: CaveLogic;
  private readonly kitchenLogic: KitchenLogic;
  private readonly guests: GuestLogic;
  private bench = false;
  private kitchen = false;
  private tents = 0;
  private attendant = false;
  private serveTimer = 0;
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
    this.caveLogic = new CaveLogic(s);
    this.kitchenLogic = new KitchenLogic(s);
    this.guests = new GuestLogic(s, this.rand);
    const store = (node: WorkStore['node'], o: Partial<WorkStore>): WorkStore => ({
      node,
      enabled: () => true,
      takeable: () => 0,
      take: () => null,
      room: () => 0,
      give: () => {},
      accepts: () => false,
      ...o,
    });
    const stores: Stores = {
      basket: store('basket', { enabled: () => !!this.net, takeable: () => s.basket.length, take: () => s.basket.pop() ?? null }),
      smokerIn: store('smokeIn', {
        enabled: () => !!this.smoker,
        room: () => Stations.smokehouse.inputCapacity - s.smoker.input.length,
        give: (item) => isFish(item) && s.smoker.input.push(item),
        accepts: (item) => item.kind === 'raw',
      }),
      smokerOut: store('smokeOut', {
        enabled: () => !!this.smoker,
        takeable: () => s.smoker.output.length,
        take: () => s.smoker.output.pop() ?? null,
      }),
      counter: store('counter', {
        room: () => stationValue(this.state, 'counterCapacity') - s.counter.length,
        give: (item) => isFish(item) && s.counter.push(item),
        accepts: (item) => isFish(item),
      }),
      kitchenIn: store('kitchenIn', {
        enabled: () => this.kitchen,
        room: () => CampCfg.kitchen.inputCapacity - s.camp.input.length,
        give: (item) => isFish(item) && s.camp.input.push(item),
        accepts: (item) => item.kind === 'smoked',
      }),
      plates: store('plates', {
        enabled: () => this.kitchen,
        takeable: () => s.camp.plates.length,
        take: () => (s.camp.plates.length > 0 ? { kind: 'plate', price: s.camp.plates.pop() as number } : null),
      }),
      serve: store('serve', {
        enabled: () => this.kitchen,
        room: () => this.guests.queue.filter((g) => !g.serving && g.path.length === 0).length,
        give: (item) => {
          const g = this.guests.nextToServe();
          if (!g) {
            s.camp.plates.push(item.price);
            return;
          }
          const pay = this.guests.serve(g, item.price, this.tents);
          this.result.income.camp += pay.value + pay.tip;
        },
        accepts: (item) => item.kind === 'plate',
      }),
      vein: veinStore(this.caveLogic, () => this.bench),
      crystalIn: store('crystalIn', {
        enabled: () => this.bench,
        room: () => CaveCfg.bench.inputCapacity - s.cave.input,
        give: () => {
          s.cave.input++;
        },
        accepts: (item) => item.kind === 'crystal',
      }),
      // Threat buildings are optional and the bot never builds them.
      bait: store('bait', { enabled: () => false }),
      // Harbour Pier loot rack (GDD §25): the dockhand takes deep-sea fish from it (crates refill it).
      lootRack: store('loot', {
        enabled: () => s.regions.includes('harbor'),
        takeable: () => s.harbor.rack.length,
        take: () => {
          const f = s.harbor.rack.pop() ?? null;
          refillRack(s);
          return f;
        },
      }),
    };
    const home = IceShore.hut.slots;
    this.ctx = {
      board: new JobBoard(stores),
      nav: new PathGraphNav((id) => s.regions.includes(id)),
      homeNode: 'hut',
      homeSpot: (i) => home[i % home.length] as Vec2,
      carry: (w) => penguinCarry(s, w),
      speed: (w) => penguinSpeed(s, w),
      onDeliver: (w) => addXp(w.data, PenguinLevels.xpPerItem),
      onDug: (w) => addXp(w.data, PenguinLevels.xpPerPile),
    };
  }

  get mods(): FishingMods {
    const d = this.day;
    return fishingMods(this.state, { night: d.isNight, aurora: d.auroraActive, rareBonus: d.rareFishBonus });
  }

  /** Room for fish (crystals on the back take places too). */
  get capacity(): number {
    return carryCapacity(this.state) - this.state.carriedCrystals;
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
      this.updateLands(dt);
      this.updateBoard(dt);
      if (this.state.unlocked.includes('market')) updateMarket(this.state, dt, this.rand);
      for (const w of this.workers) w.update(dt, this.ctx, this.workers);
      const minute = Math.floor(this.t / 60);
      while (this.result.timeline.length <= minute) this.result.timeline.push(this.totalEarned);
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
          smoked: 0,
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
      const smokedShare = c.bill > 0 ? c.smoked / c.bill : 0;
      this.result.income.smoked += value * smokedShare;
      this.result.income.raw += value * (1 - smokedShare);
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
    if (item.kind === 'smoked') c.smoked += item.price;
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
      plates: this.kitchen ? s.camp.plates.length : null,
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
    if (th.target === 'plates') {
      const value = stealPlates(s.camp.plates, this.rand).reduce((v, p) => v + p, 0);
      this.result.threat.lostCoins += value;
      this.result.threat.maxLoss = Math.max(this.result.threat.maxLoss, value);
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

  // ---------- order board (GDD §20) ----------

  private orderSeen = new Map<number, number>();

  private updateBoard(dt: number): void {
    const s = this.state;
    if (!s.unlocked.includes('orderBoard')) return;
    s.codex.rareBait = Math.max(s.codex.rareBait - dt, 0);
    for (const o of updateOrders(s, dt, this.rand)) {
      this.orderSeen.set(o.id, this.t);
      const k = (this.result.extra.orders[o.kind] ??= { made: 0, done: 0, secs: [] });
      k.made++;
    }
  }

  /** On the way to the counter: hand over every order the back (or the camp / cave racks) can fill. */
  deliverOrders(): void {
    const s = this.state;
    if (!s.unlocked.includes('orderBoard')) return;
    for (const o of [...s.orders.active]) {
      const p = orderProgress(s, o);
      if (p.have < p.need) continue;
      this.walkTo(IceShore.board);
      this.advance(1);
      const d = deliverOrder(s, o.id);
      if (!d) continue;
      const x = this.result.extra;
      x.orderCoins += d.coins;
      x.orderGiven += d.givenValue;
      const k = (x.orders[o.kind] ??= { made: 0, done: 0, secs: [] });
      k.done++;
      k.secs.push(this.t - (this.orderSeen.get(o.id) ?? this.t));
    }
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
    // Through the yard pass and the camp bridge when going between areas.
    const stops: Vec2[] = [this.pos];
    const area = (q: Vec2) => (inYard(q) ? 0 : q.x > 11 ? 2 : 1);
    const a = area(this.pos);
    const b = area(p);
    if (a !== b) {
      if (a === 0 || b === 0) stops.push(PASS);
      if (a === 2 || b === 2) stops.push(BRIDGE);
      if (a === 2) stops.splice(1, stops.length - 1, ...stops.slice(1).reverse());
    }
    stops.push(p);
    let d = 0;
    for (let i = 1; i < stops.length; i++) d += dist(stops[i - 1] as Vec2, stops[i] as Vec2);
    this.advance((d * DETOUR) / Economy.player.walkSpeed + DAWDLE);
    this.pos = { ...p };
  }

  /** Unlock frames and region gates that are visible now. */
  available(): Target[] {
    const s = this.state;
    const out: Target[] = [];
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
    const buy = this.penguinTarget();
    if (buy) out.push(buy);
    return out.sort((a, b) => a.cost - b.cost);
  }

  /**
   * The bot's next penguin (GDD §24): roles in BOT_PLAN order, the first one it does not own yet that can work now.
   * A full hut means a hut upgrade first. A missing role in the catalog is looked for with the free refresh.
   */
  penguinTarget(): Target | null {
    const s = this.state;
    if (!s.unlocked.includes('market') || s.workers.length >= BOT_PLAN.length) return null;
    const owned = new Map<RoleId, number>();
    for (const w of s.workers) owned.set(w.role, (owned.get(w.role) ?? 0) + 1);
    const need = new Map<RoleId, number>();
    let want: RoleId | null = null;
    for (const r of BOT_PLAN) {
      need.set(r, (need.get(r) ?? 0) + 1);
      if ((owned.get(r) ?? 0) >= (need.get(r) as number)) continue;
      if (availableRoles(s).includes(r)) want = r;
      break;
    }
    if (!want) return null;
    const pad = IceShore.market.pad;
    if (s.workers.length >= hutCapacity(s)) {
      const cost = hutUpgradeCost(s);
      return cost === null ? null : { id: `hutL${s.hutLevel + 1}`, at: pad, cost, region: false, kind: 'hut' };
    }
    let offer = s.market.offers.find((o) => o.role === want);
    if (!offer && rerollOffers(s, this.rand)) offer = s.market.offers.find((o) => o.role === want);
    if (!offer) return null;
    return { id: `penguin${s.workers.length + 1}`, at: pad, cost: offerPrice(s, offer), region: false, kind: 'penguin', offer: offer.id };
  }

  unlock(u: Target): void {
    this.walkTo(u.at);
    if (u.kind === 'hut') {
      this.advance(1);
      if (upgradeHut(this.state)) this.result.unlocks[u.id] = this.t;
      return;
    }
    if (u.kind === 'penguin') {
      this.advance(1.5);
      const r = buyOffer(this.state, u.offer ?? -1);
      if (!r.ok) return;
      this.result.unlocks[u.id] = this.t;
      this.result.roles[r.penguin.role] ??= this.t;
      this.addBrain(r.penguin);
      if ((OFFLINE_STAGES as string[]).includes(u.id)) this.pendingSnapshot = u.id as OfflineStage;
      this.boughtSinceUnlock = 0;
      return;
    }
    this.advance(UnlockFeel.startDelay + UnlockFeel.fillTime);
    this.state.coins -= u.cost;
    this.result.unlocks[u.id] = this.t;
    if ((OFFLINE_STAGES as string[]).includes(u.id)) this.pendingSnapshot = u.id as OfflineStage;
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
        const data = firstPenguin(this.state, this.rand);
        this.state.workers.push(data);
        this.result.roles[data.role] ??= this.t;
        this.addBrain(data);
      } else if (e.kind === 'igloo' || e.kind === 'decoration') applyComfortUnlock(this.state, e);
      else if (e.kind === 'land') {
        if (e.part === 'crystalBench') {
          this.bench = true;
          this.caveLogic.benchBuilt();
        } else if (e.part === 'kitchen') this.kitchen = true;
        else if (e.part === 'attendant') this.attendant = true;
        else this.tents++;
      }
      else if (e.kind === 'station' && e.station === 'net') this.net = new NetLogic(this.state, this.rand);
      else if (e.kind === 'station' && e.station === 'smokehouse') this.smoker = new SmokerLogic(this.state);
    }
  }

  addBrain(data: GameState['workers'][number]): void {
    const home = IceShore.hut.slots[this.workers.length % IceShore.hut.slots.length] as Vec2;
    this.workers.push(new WorkerBrain(data, this.workers.length, home.x, home.z));
  }

  /** Upgrade levels bought since the last unlock (the bot buys one between unlocks, like an "optional" spend). */
  boughtSinceUnlock = 0;
  /** An automation stage just opened: copy the state once the unlock is applied. */
  private pendingSnapshot: OfflineStage | null = null;

  /** Total income so far (counter sales, camp, cave). */
  get totalEarned(): number {
    const x = this.result.extra;
    return this.result.earned + this.result.income.camp + this.result.income.cave + x.orderCoins + x.codexCoins;
  }

  /** Cheapest upgrade worth buying now (rod, and station/time upgrades when enabled): affordable and small next to the next unlock goal. */
  upgradeToBuy(): { kind: 'rod' | 'station'; id: string; cost: number } | null {
    if (this.boughtSinceUnlock >= 1) return null;
    const next = this.available()[0];
    const goal = next ? next.cost : Infinity;
    let best: { kind: 'rod' | 'station'; id: string; cost: number } | null = null;
    const consider = (kind: 'rod' | 'station', id: string, cost: number | null) => {
      if (cost === null || cost > this.state.coins || cost > goal * 0.3) return;
      if (!best || cost < best.cost) best = { kind, id, cost };
    };
    for (const u of UpgradeList) consider('rod', u.id, upgradeCost(u.id, this.state.upgrades[u.id]));
    if (this.opts.stationUpgrades) {
      for (const u of StationUpgradeList) {
        if (stationUpgradeVisible(this.state, u)) consider('station', u.id, stationUpgradeCost(u.id, this.state.stationUpgrades[u.id]));
      }
    }
    return best;
  }

  buyUpgrades(): void {
    this.walkTo(IceShore.bench.pad);
    for (let pick = this.upgradeToBuy(); pick; pick = this.upgradeToBuy()) {
      this.state.coins -= pick.cost;
      let level: number;
      if (pick.kind === 'rod') level = ++this.state.upgrades[pick.id as UpgradeId];
      else level = ++this.state.stationUpgrades[pick.id as StationUpgradeId];
      this.result.upgradesBought.push({ id: pick.id, level, t: this.t });
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
      if (this.state.carried.length === 0 && this.mineRunDue()) return;
      const r = fishSession(this.rand, this.mods);
      this.advance(r.time);
      if (this.debt > 0) return; // a threat warning: go deal with it
      if (r.item) {
        this.state.carried.push(r.item);
        // Encyclopedia: discovery, records, variants; collection rewards are paid at once.
        recordCatch(this.state, r.item);
        const x = this.result.extra;
        x.rodValue += r.item.price;
        if (r.item.variant) x.variantExtra += r.item.price - r.item.price / Variants[r.item.variant].valueMul;
        for (const id of rewardsDue(this.state)) x.codexCoins += grantReward(this.state, id).coins;
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
    // Orders first, before raw fish go into the smokehouse.
    this.deliverOrders();
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
    this.deliverOrders();
    // The camp kitchen gets smoked fish when it runs low.
    if (this.kitchen && s.carried.some((f) => f.kind === 'smoked') && s.camp.input.length <= 2) this.campRun();
    if (s.carried.length > 0) {
      this.walkTo(C.dropPoint);
      const room = stationValue(this.state, 'counterCapacity') - s.counter.length;
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

  /** All coin piles with something on them (counter, cave, camp), nearest first-ish. */
  collectAll(): void {
    const s = this.state;
    if (s.cave.pile > 0) {
      this.walkTo(CaveLayout.pile);
      this.advance(0.6);
      s.coins += s.cave.pile;
      s.cave.pile = 0;
    }
    this.collectPile();
    if (s.camp.pile > 0) {
      this.walkTo(CampLayout.pile);
      this.advance(0.6);
      s.coins += s.camp.pile;
      s.camp.pile = 0;
    }
  }

  // ---------- lands (GDD §15) ----------

  private updateLands(dt: number): void {
    const s = this.state;
    for (const id of mainPagesDue(s)) findPage(s, id);
    if (!s.regions.includes('iceCave')) return;
    const ev = this.caveLogic.update(dt, this.bench);
    if (ev.sold) this.result.income.cave += ev.sold.value + ev.sold.tip;
    if (!s.regions.includes('hotSpring')) return;
    if (this.kitchen) this.kitchenLogic.update(dt);
    for (const pay of this.guests.update(dt, this.tents, this.kitchen, peaceScore(s))) this.result.income.camp += pay.value + pay.tip;
    // The attendant hands out platters; so does the player while standing at the rack (`serving`).
    this.serveTimer -= dt;
    if ((this.attendant || this.serving) && this.serveTimer <= 0 && s.camp.plates.length > 0) {
      const g = this.guests.nextToServe();
      if (g) {
        this.serveTimer = this.serving ? 0.3 : CampCfg.attendantServeInterval;
        const pay = this.guests.serve(g, s.camp.plates.pop() as number, this.tents);
        this.result.income.camp += pay.value + pay.tip;
      }
    }
  }

  private serving = false;

  private readyVeins(): number[] {
    return CaveLayout.veins.map((_, i) => i).filter((i) => this.caveLogic.veinReady(i));
  }

  /** Mining is worth a trip: enough veins have grown back and the bench is running low (or the first crystal). */
  mineRunDue(): boolean {
    const s = this.state;
    if (!s.regions.includes('iceCave') || s.carried.length > 0) return false;
    if (s.cave.mined === 0) return true;
    return this.bench && s.cave.input <= 2 && this.readyVeins().length >= 3;
  }

  /** Walks the cave, mining ready veins until the back is full, then loads the bench. */
  mineRun(): void {
    const s = this.state;
    for (;;) {
      const ready = this.readyVeins();
      const room = carryCapacity(s) - s.carried.length - s.carriedCrystals;
      if (ready.length === 0 || room <= 0) break;
      const i = ready.reduce((a, b) => (dist(this.pos, CaveLayout.veins[a] as Vec2) <= dist(this.pos, CaveLayout.veins[b] as Vec2) ? a : b));
      this.walkTo(CaveLayout.veins[i] as Vec2);
      this.advance(CaveCfg.mineTime + REACTION);
      s.carriedCrystals += Math.min(this.caveLogic.mine(i), room);
      if (!this.bench) break;
    }
    if (this.bench && s.carriedCrystals > 0) {
      this.walkTo(CaveLayout.bench.input);
      const n = Math.min(s.carriedCrystals, CaveCfg.bench.inputCapacity - s.cave.input);
      s.carriedCrystals -= n;
      s.cave.input += n;
      this.advance(n * 0.15);
    }
    if (s.cave.pile > 0) this.collectAll();
  }

  /** Smoked fish on the back go to the camp kitchen when it is running low; the bot serves the queue while there. */
  campRun(): void {
    const s = this.state;
    const k = CampLayout.kitchen;
    this.walkTo(k.input);
    const room = CampCfg.kitchen.inputCapacity - s.camp.input.length;
    let moved = 0;
    for (let i = s.carried.length - 1; i >= 0 && moved < room; i--) {
      if (s.carried[i]?.kind !== 'smoked') continue;
      s.camp.input.push(s.carried.splice(i, 1)[0] as FishItem);
      moved++;
    }
    this.advance(moved * 0.15);
    if (!this.attendant && s.camp.plates.length > 0) {
      this.walkTo(k.output);
      this.serving = true;
      this.advance(Math.min(s.camp.plates.length, this.guests.queue.length) * 0.4 + 1);
      this.serving = false;
    }
    if (s.camp.pile > 0) {
      this.walkTo(CampLayout.pile);
      this.advance(0.6);
      s.coins += s.camp.pile;
      s.camp.pile = 0;
    }
  }

  // ---------- player actions (each advances time) ----------

  run(): Result {
    const o = this.opts;
    let idleDone = false;
    while (this.t < o.endAt) {
      this.payDebt();
      if (o.sleep && o.sleep !== 'off' && canSleepAt(this.day.t)) {
        this.goSleep();
        continue;
      }
      if (!this.result.income60 && this.t >= 60 * 60) {
        this.result.income60 = { ...this.result.income };
        this.result.extra60 = { ...this.result.extra, orders: {} };
      }
      if (this.pendingSnapshot) {
        this.result.snapshots[this.pendingSnapshot] = { state: structuredClone(this.state), t: this.t, earnedAt: this.totalEarned };
        this.pendingSnapshot = null;
      }
      for (const snap of Object.values(this.result.snapshots)) {
        if (snap && snap.perHour === undefined && this.t >= snap.t + 1200) snap.perHour = ((this.totalEarned - snap.earnedAt) / (this.t - snap.t)) * 3600;
      }
      if (o.idleAfter && !idleDone && (isDone(this.state, o.idleAfter) || this.result.unlocks[o.idleAfter] !== undefined)) {
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
      const s = this.state;
      const piles = s.pile + s.cave.pile + s.camp.pile;
      if (next && piles > 0 && s.coins + piles >= next.cost) {
        this.collectAll();
        continue;
      }
      if (this.mineRunDue()) {
        this.mineRun();
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
  if (sec === undefined || !Number.isFinite(sec)) return '   —  ';
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2)}:${String(s).padStart(2, '0')}`;
};
const median = (xs: number[]) => {
  const a = [...xs].sort((p, q) => p - q);
  return a.length ? (a[Math.floor((a.length - 1) / 2)] as number) : NaN;
};

const RUNS = Number(process.argv[2] ?? 12);
const ORDER = ['hole2', 'net', 'hut', 'smokeYard', 'smokehouse', 'market', 'hole3', 'penguin2', 'igloo2', 'igloo3', 'igloo4', 'iceCave', 'crystalBench', 'hutL2', 'penguin3', 'hotSpring', 'tent1', 'kitchen', 'tent2', 'tent3', 'hutL3', 'penguin4', 'attendant', 'hutL4', 'penguin5'];
const DECOR = ['flagpole', 'doormat', 'snowman', 'sled', 'lanterns', 'dryingRack', 'iceSculpture'];
const TARGET: Record<string, string> = {
  hole2: '~2 dk',
  net: '~4 dk',
  hut: '~6 dk',
  smokeYard: '~10 dk',
  smokehouse: '12–15 dk',
  hole3: '15+ dk',
  market: '~15 dk',
  penguin2: '~28 dk',
  hutL2: '—',
  penguin3: '~40 dk',
  hutL3: '—',
  penguin4: '~50 dk',
  hutL4: '—',
  penguin5: '~50+ dk',
  igloo2: '~8 dk',
  igloo3: '~18 dk',
  igloo4: '~32 dk',
  iceCave: '~26 dk (tapu)',
  crystalBench: '~26 dk',
  hotSpring: '~38 dk (tapu)',
  tent1: '~38 dk',
  kitchen: '—',
  tent2: '—',
  tent3: '—',
  attendant: '~45 dk',
};

function unlockTable(upgrades: boolean): void {
  const results: Result[] = [];
  for (let i = 0; i < RUNS; i++) results.push(new Sim({ seed: 1000 + i, upgrades, endAt: 60 * 60, threats: 'active' }).run());
  console.log(`\n## Açılış süreleri — ${upgrades ? 'yükseltme alan bot' : 'yükseltme almayan bot'} (${RUNS} koşu, medyan [min–maks], oyun içi süre)`);
  console.log('| Açılış | Hedef | Medyan | Aralık |');
  console.log('|---|---|---|---|');
  console.log(`| İlk satış | <1 dk | ${fmt(median(results.map((r) => r.firstSale)))} | |`);
  for (const id of ORDER) {
    const ts = results.map((r) => r.unlocks[id]).filter((x): x is number => x !== undefined);
    console.log(`| ${id} | ${TARGET[id]} | ${fmt(median(ts))} | ${ts.length ? `${fmt(Math.min(...ts))}–${fmt(Math.max(...ts))}` : `0/${RUNS} koşu`} |`);
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

/** Income lines (GDD §16): where the coins come from at 60 and 90 minutes; no line above 70% or below 10%. */
function incomeTable(): void {
  const runs: Result[] = [];
  for (let i = 0; i < RUNS; i++) runs.push(new Sim({ seed: 5000 + i, upgrades: true, stationUpgrades: true, endAt: 90 * 60, threats: 'active' }).run());
  console.log(`\n## Gelir kolları (${RUNS} koşu, olta + istasyon yükseltmesi alan bot, tehditler aktif)`);
  console.log('| Süre | Toplam | Balık (çiğ + tütsü) | – çiğ | – tütsü | Kamp (tabak + kira) | Mağara (heykelcik) | Kontrol |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const [label, pick] of [
    ['60 dk', (r: Result) => r.income60 ?? r.income],
    ['90 dk', (r: Result) => r.income],
  ] as const) {
    const sum = { raw: 0, smoked: 0, camp: 0, cave: 0 };
    for (const r of runs) {
      const inc = pick(r);
      sum.raw += inc.raw;
      sum.smoked += inc.smoked;
      sum.camp += inc.camp;
      sum.cave += inc.cave;
    }
    const total = sum.raw + sum.smoked + sum.camp + sum.cave;
    const pct = (v: number) => (v / total) * 100;
    const lines = [pct(sum.raw + sum.smoked), pct(sum.camp), pct(sum.cave)];
    const ok = lines.every((p) => p <= 70) && lines.every((p) => p >= 10);
    console.log(
      `| ${label} | ${Math.round(total / RUNS)} | %${lines[0]?.toFixed(0)} | %${pct(sum.raw).toFixed(0)} | %${pct(sum.smoked).toFixed(0)} | %${lines[1]?.toFixed(0)} | %${lines[2]?.toFixed(0)} | ${ok ? 'tamam (%10–70)' : 'SINIR DIŞI'} |`,
    );
  }
  console.log('Üç kol: balık (tezgâh), kamp (tabak, çadır kirası, bahşiş), mağara (heykelcik + bahşiş). Kontrol 90 dk için bağlayıcı; 60. dakikada kamp yeni açılmış olur.');
}

/** Offline earnings (GDD §18): 8 hours away at each automation stage, against active play over the same time. */
function offlineTable(): void {
  const runs: Result[] = [];
  for (let i = 0; i < RUNS; i++) runs.push(new Sim({ seed: 6000 + i, upgrades: true, stationUpgrades: true, endAt: 90 * 60, threats: 'active' }).run());
  const away = 8 * 3600;
  const labels: Record<OfflineStage, string> = { hut: 'Ağ + 1. penguen', smokehouse: '+ tütsühane', penguin3: '+ 3. penguen (taşıyıcı)', attendant: '+ kamp (görevli)', penguin5: '+ 5. penguen (mutfakçı)' };
  console.log(`\n## Çevrimdışı gelir — 8 saat yokluk (${RUNS} koşu, medyan; aşama açıldığı anki durum)`);
  console.log(`| Aşama | Sayılan süre | Çevrimdışı coin | Aktif coin/sa (sonraki 20 dk) | Oran (aynı süre aktif oyuna) | Maks. Zaman yükseltmesi (8 sa, %${Math.round(stationUpgradeValue('offlineRate', 5) * 100)}) | Oran |`);
  console.log('|---|---|---|---|---|---|---|');
  for (const stage of OFFLINE_STAGES) {
    const base: number[] = [];
    const maxed: number[] = [];
    const perHour: number[] = [];
    const counted: number[] = [];
    for (const r of runs) {
      const snap = r.snapshots[stage];
      if (!snap || snap.perHour === undefined) continue;
      const a = structuredClone(snap.state);
      const resA = applyOffline(a, away, seededRandom(1));
      const b = structuredClone(snap.state);
      b.stationUpgrades.offlineCap = 5;
      b.stationUpgrades.offlineRate = 5;
      const resB = applyOffline(b, away, seededRandom(1));
      base.push(resA.coins);
      counted.push(resA.seconds);
      maxed.push(resB.coins);
      perHour.push(snap.perHour);
    }
    if (base.length === 0) continue;
    const h = median(counted) / 3600;
    const rate = median(perHour);
    const ratio = (coins: number, hours: number) => `%${Math.round((coins / (rate * hours)) * 100)}`;
    console.log(
      `| ${labels[stage]} | ${h} sa | ${median(base)} | ${Math.round(rate)} | ${ratio(median(base), h)} | ${median(maxed)} | ${ratio(median(maxed), 8)} |`,
    );
  }
  console.log('Hedef (Demo 7B): üst sınırdaki bir çevrimdışı oturum, aynı süre aktif oyunun en fazla ~%40\'ı.');
}

/** Station upgrades and the Demo 4 unlock targets: the same bot with and without them. */
function stationUpgradeTimings(): void {
  const ids = ['hole3', 'penguin2', 'igloo4', 'iceCave', 'crystalBench', 'penguin3', 'hotSpring', 'tent1', 'penguin4', 'attendant', 'penguin5'];
  const med = (station: boolean) => {
    const rs: Result[] = [];
    for (let i = 0; i < RUNS; i++) rs.push(new Sim({ seed: 1000 + i, upgrades: true, stationUpgrades: station, endAt: 60 * 60, threats: 'active' }).run());
    return Object.fromEntries(ids.map((id) => [id, median(rs.map((r) => r.unlocks[id]).filter((x): x is number => x !== undefined))]));
  };
  const rod = med(false);
  const all = med(true);
  console.log(`\n## İstasyon yükseltmelerinin açılış sürelerine etkisi (${RUNS} koşu, medyan)`);
  console.log('| Açılış | Hedef | Yalnız olta yükseltmesi | Olta + istasyon | Fark |');
  console.log('|---|---|---|---|---|');
  for (const id of ids) {
    const d = (all[id] as number) - (rod[id] as number);
    console.log(`| ${id} | ${TARGET[id]} | ${fmt(rod[id])} | ${fmt(all[id])} | ${d >= 0 ? '+' : '−'}${fmt(Math.abs(d)).trim()} |`);
  }
}

/** Encyclopedia variants and the order board (GDD §19, §20): their share of the income and what orders cost the counter. */
function codexOrderTable(): void {
  const runs: Result[] = [];
  for (let i = 0; i < RUNS; i++) runs.push(new Sim({ seed: 7000 + i, upgrades: true, stationUpgrades: true, endAt: 90 * 60, threats: 'active' }).run());
  const total = (r: Result, at60: boolean) => {
    const inc = at60 ? (r.income60 ?? r.income) : r.income;
    const x = at60 ? (r.extra60 ?? r.extra) : r.extra;
    return { all: inc.raw + inc.smoked + inc.camp + inc.cave + x.orderCoins + x.codexCoins, x };
  };
  console.log(`\n## Ansiklopedi ve sipariş panosu (${RUNS} koşu, olta + istasyon yükseltmesi alan bot)`);
  console.log('| Süre | Toplam gelir | Sipariş geliri | Payı | Siparişe giden eşyanın satış değeri | Net sipariş kazancı | Koleksiyon ödülleri | Varyant katkısı (olta değerine) |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const at60 of [true, false]) {
    let all = 0;
    let orders = 0;
    let given = 0;
    let codex = 0;
    let rod = 0;
    let variant = 0;
    for (const r of runs) {
      const t = total(r, at60);
      all += t.all;
      orders += t.x.orderCoins;
      given += t.x.orderGiven;
      codex += t.x.codexCoins;
      rod += t.x.rodValue;
      variant += t.x.variantExtra;
    }
    const n = RUNS;
    console.log(
      `| ${at60 ? '60 dk' : '90 dk'} | ${Math.round(all / n)} | ${Math.round(orders / n)} | %${((orders / all) * 100).toFixed(1)} | ${Math.round(given / n)} | +${Math.round((orders - given) / n)} | ${Math.round(codex / n)} | %${((variant / Math.max(rod, 1)) * 100).toFixed(1)} |`,
    );
  }
  console.log('\nSipariş türleri (90 dk, toplam): çıkan / teslim / medyan teslim süresi');
  console.log('| Tür | Çıkan | Teslim | Medyan süre |');
  console.log('|---|---|---|---|');
  const kinds = new Map<string, { made: number; done: number; secs: number[] }>();
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.extra.orders)) {
      const acc = kinds.get(k) ?? { made: 0, done: 0, secs: [] };
      acc.made += v.made;
      acc.done += v.done;
      acc.secs.push(...v.secs);
      kinds.set(k, acc);
    }
  }
  for (const [k, v] of kinds) console.log(`| ${k} | ${v.made} | ${v.done} | ${v.secs.length ? fmt(median(v.secs)) : '—'} |`);
  console.log('Sipariş havuzu yalnızca açık olanı sorar (tür siparişi: keşfedilmiş, yemle tutulabilen, ışık balığı ve kalkan hariç); süre dolan sipariş cezasız silinir.');
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

/** Penguin roles (GDD §24): when the bot gets each one and how the income per minute changes around it. */
function roleTable(): void {
  const runs: Result[] = [];
  for (let i = 0; i < RUNS; i++) runs.push(new Sim({ seed: 8000 + i, upgrades: true, stationUpgrades: true, endAt: 75 * 60, threats: 'active' }).run());
  console.log(`\n## Penguen rolleri — ilk alınış ve etkisi (${RUNS} koşu, olta + istasyon yükseltmesi alan bot)`);
  console.log('| Rol | Medyan ilk alınış | Koşu | Gelir/dk önceki 10 dk | Gelir/dk sonraki 10 dk | Fark |');
  console.log('|---|---|---|---|---|---|');
  for (const r of RoleList) {
    const times: number[] = [];
    const before: number[] = [];
    const after: number[] = [];
    for (const run of runs) {
      const t = run.roles[r.id];
      if (t === undefined) continue;
      times.push(t);
      const m = Math.floor(t / 60);
      const tl = run.timeline;
      const at = (k: number) => tl[Math.min(Math.max(k, 0), tl.length - 1)] as number;
      if (m >= 10 && m + 10 < tl.length) {
        before.push((at(m) - at(m - 10)) / 10);
        after.push((at(m + 10) - at(m)) / 10);
      }
    }
    if (times.length === 0) {
      console.log(`| ${r.name.tr} | — | 0/${RUNS} | | | |`);
      continue;
    }
    const b = median(before);
    const a = median(after);
    const diff = before.length ? `%${Math.round(((a - b) / b) * 100)}` : '—';
    console.log(`| ${r.name.tr} | ${fmt(median(times))} | ${times.length}/${RUNS} | ${before.length ? Math.round(b) : '—'} | ${before.length ? Math.round(a) : '—'} | ${diff} |`);
  }
  console.log('Fark, rolün yanında o 10 dakikada açılan her şeyi de içerir (yeni bölge, yükseltme); rol ilk kez geldiğinde ölçülür.');
  console.log('Bot sırası: hediye taşıyıcı → tütsücü → taşıyıcı → madenci → mutfakçı (kulübe dolunca önce kulübe büyütülür).');
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
  idleTest('penguin2', '2. penguen (tütsücü) gelince');
  idleTest('penguin3', '3. penguen (taşıyıcı) gelince');
  roleTable();
  threatTable();
  sleepTable();
  incomeTable();
  stationUpgradeTimings();
  offlineTable();
  codexOrderTable();
}
reelTable();
baitTable();
