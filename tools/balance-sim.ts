// Balance simulation (Demo 3): a bot plays the economy with the real content numbers and the real
// mini-game / station / helper logic, and reports when each unlock happens.
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
import { WorkerBrain, type StoreId, type WorkContext, type WorkStore } from '../src/systems/WorkerBrain';

declare const process: { argv: string[] };

const DT = 0.05;
const REACTION = 0.3; // seconds the bot needs to react to a tug or a bite
const DETOUR = 1.2; // real paths are longer than straight lines (obstacles, imperfect steering)
const DAWDLE = 1.0; // seconds lost per decision (looking around, small corrections)
const PASS: Vec2 = { x: -11.6, z: -1.2 };
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
}

interface Result {
  unlocks: Record<string, number>;
  firstSale: number;
  upgradesBought: Array<{ id: UpgradeId; level: number; t: number }>;
  idle?: { pileGain: number; sold: number; smokedSold: number };
  earned: number;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const inYard = (p: Vec2) => p.x < -11;

class Sim {
  t = 0;
  readonly state: GameState = createGameState();
  pos: Vec2 = { ...IceShore.playerSpawn };
  readonly rand: () => number;
  readonly result: Result = { unlocks: {}, firstSale: -1, upgradesBought: [], earned: 0 };
  private readonly customers: Customer[] = [];
  private spawnTimer = 0.5;
  private net: NetLogic | null = null;
  private smoker: SmokerLogic | null = null;
  readonly workers: WorkerBrain[] = [];
  private readonly ctx: WorkContext;
  smokedSold = 0;

  constructor(readonly opts: Options) {
    this.rand = seededRandom(opts.seed);
    const s = this.state;
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
    return fishingMods(this.state);
  }

  get capacity(): number {
    return carryCapacity(this.state);
  }

  /** Advances the town (customers, net, smokehouse, helpers) for `sec` seconds. */
  advance(sec: number): void {
    for (let left = sec; left > 1e-9; left -= DT) {
      const dt = Math.min(DT, left);
      this.t += dt;
      this.updateCustomers(dt);
      this.net?.update(dt);
      this.smoker?.update(dt);
      for (const w of this.workers) w.update(dt, this.ctx, this.workers);
    }
  }

  private updateCustomers(dt: number): void {
    const cfg = Economy.customers;
    this.spawnTimer -= dt;
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
      this.state.pile += c.bill;
      this.result.earned += c.bill;
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
        out.push({ id: r.id, at: r.gate, cost: Economy.unlocks[r.cost], region: true });
      }
    }
    for (const z of UnlockZones) {
      if (isDone(s, z.id)) continue;
      const region = Regions.find((r) => r.unlockZones.includes(z.id));
      if (region && !isDone(s, region.id)) continue;
      if (!z.requires.every((q) => isDone(s, q))) continue;
      out.push({ id: z.id, at: z, cost: Economy.unlocks[z.cost as UnlockCostKey], region: false });
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
      } else if (e.station === 'net') this.net = new NetLogic(this.state, this.rand);
      else if (e.station === 'smokehouse') this.smoker = new SmokerLogic(this.state);
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
      if (r.item) {
        this.state.carried.push(r.item);
        this.state.stats.caught++;
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
const ORDER = ['hole2', 'net', 'hut', 'smokeYard', 'smokehouse', 'hole3', 'penguin2'];
const TARGET: Record<string, string> = {
  hole2: '~2 dk',
  net: '~4 dk',
  hut: '~6 dk',
  smokeYard: '~10 dk',
  smokehouse: '12–15 dk',
  hole3: '15+ dk',
  penguin2: '15+ dk',
};

function unlockTable(upgrades: boolean): void {
  const results: Result[] = [];
  for (let i = 0; i < RUNS; i++) results.push(new Sim({ seed: 1000 + i, upgrades, endAt: 40 * 60 }).run());
  console.log(`\n## Açılış süreleri — ${upgrades ? 'yükseltme alan bot' : 'yükseltme almayan bot'} (${RUNS} koşu, medyan [min–maks], oyun içi süre)`);
  console.log('| Açılış | Hedef | Medyan | Aralık |');
  console.log('|---|---|---|---|');
  console.log(`| İlk satış | <1 dk | ${fmt(median(results.map((r) => r.firstSale)))} | |`);
  for (const id of ORDER) {
    const ts = results.map((r) => r.unlocks[id]).filter((x): x is number => x !== undefined);
    console.log(`| ${id} | ${TARGET[id]} | ${fmt(median(ts))} | ${fmt(Math.min(...ts))}–${fmt(Math.max(...ts))} |`);
  }
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
    const r = new Sim({ seed: 2000 + i, upgrades: true, idleAfter: after, idleFor: 180, endAt: 60 * 60 }).run();
    if (!r.idle) continue;
    gains.push(r.idle.pileGain);
    sold.push(r.idle.sold);
    smoked.push(r.idle.smokedSold);
  }
  console.log(
    `| ${label} | ${median(gains)} coin | ${Math.min(...gains)}–${Math.max(...gains)} | ${median(sold)} balık (${median(smoked)} tütsü) |`,
  );
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
    const mods: FishingMods = { lineStrength: 1, reelSpeed: 1, bigFishWeight: UpgradeList[2]?.values[lv - 1] ?? 1, baitLevel: lv };
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
}
reelTable();
baitTable();
