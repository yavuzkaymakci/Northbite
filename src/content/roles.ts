// Penguin roles and the jobs stations post on the job board (GDD §24). Data only: systems/JobBoard.ts and
// systems/WorkerBrain.ts read these tables; no role has its own code path. Balance values only (feel in settings.ts).

/** Places goods are taken from or brought to. Each one is a "store" the game and the sim fill in. */
export type StoreId =
  | 'basket' // net basket (raw fish)
  | 'smokerIn' // smokehouse input rack
  | 'smokerOut' // smokehouse output rack (smoked fish)
  | 'counter' // sales counter
  | 'kitchenIn' // camp kitchen input rack (smoked fish)
  | 'plates' // camp platter rack
  | 'serve' // the next guest in the camp queue
  | 'vein' // a ready crystal vein in the Ice Cave (mined on the spot)
  | 'crystalIn' // crystal bench input rack
  | 'bait'; // bait trap (one raw fish)

export type JobId =
  | 'smokedToCounter'
  | 'rawToSmoker'
  | 'rawToCounter'
  | 'smokedToKitchen'
  | 'platesToGuests'
  | 'crystalsToBench'
  | 'baitTrap';

export interface JobDef {
  from: StoreId;
  to: StoreId;
  /** Most pieces one trip moves (default: the penguin's carry). */
  max?: number;
  /** Seconds of work at the source before the first piece comes off (mining). */
  workTime?: number;
  /** Graph legs of one trip (offline formula: trip time from the path graph). */
  legs: readonly [from: string, to: string];
}

export const Jobs: Record<JobId, JobDef> = {
  smokedToCounter: { from: 'smokerOut', to: 'counter', legs: ['smokeOut', 'counter'] },
  rawToSmoker: { from: 'basket', to: 'smokerIn', legs: ['basket', 'smokeIn'] },
  rawToCounter: { from: 'basket', to: 'counter', legs: ['basket', 'counter'] },
  smokedToKitchen: { from: 'smokerOut', to: 'kitchenIn', legs: ['smokeOut', 'kitchenIn'] },
  platesToGuests: { from: 'plates', to: 'serve', legs: ['plates', 'serve'] },
  // Penguins mine slower than the player (Cave.mineTime 2 s).
  crystalsToBench: { from: 'vein', to: 'crystalIn', workTime: 4, legs: ['caveMid', 'crystalIn'] },
  baitTrap: { from: 'basket', to: 'bait', max: 1, legs: ['basket', 'bait'] },
};

export type RoleId = 'carrier' | 'smoker' | 'miner' | 'cook' | 'sweeper' | 'guard';

export interface RoleJob {
  job: JobId;
  /** Skipped while a penguin with this role exists (that role does the job instead). */
  unlessRole?: RoleId;
}

export interface RoleDef {
  id: RoleId;
  name: { tr: string; en: string };
  /** One line for the market card. */
  info: { tr: string; en: string };
  /** Unlock or region id: the role shows in the catalog and can be assigned only once this is done. */
  requires: string;
  /** Jobs in priority order. */
  jobs: readonly RoleJob[];
  /** Shovels avalanche snow piles when there is nothing else to do (`unlessRole`: only while no such penguin exists). */
  dig?: { unlessRole?: RoleId };
  /** Base price in the market (GDD §24, before the trait and count multipliers and priceScale). */
  price: number;
}

export const RoleList: readonly RoleDef[] = [
  {
    id: 'carrier',
    name: { tr: 'Taşıyıcı', en: 'Carrier' },
    info: { tr: 'Sepetten tütsühaneye ya da tezgâha', en: 'Basket to smokehouse or counter' },
    requires: 'hut',
    // Without a smoker it also brings smoked fish to the counter (the Demo 3 behaviour), and digs without a sweeper.
    jobs: [{ job: 'smokedToCounter', unlessRole: 'smoker' }, { job: 'rawToSmoker' }, { job: 'rawToCounter' }],
    dig: { unlessRole: 'sweeper' },
    price: 180,
  },
  {
    id: 'smoker',
    name: { tr: 'Tütsücü', en: 'Smoker' },
    info: { tr: 'Tütsühaneden tezgâha (aşçı yoksa mutfağa)', en: 'Smokehouse to counter (kitchen if no cook)' },
    requires: 'smokehouse',
    jobs: [{ job: 'smokedToKitchen', unlessRole: 'cook' }, { job: 'smokedToCounter' }],
    price: 175,
  },
  {
    id: 'miner',
    name: { tr: 'Madenci', en: 'Miner' },
    info: { tr: 'Damardan kristal çıkarır, tezgâha bırakır', en: 'Mines crystals for the crystal bench' },
    requires: 'crystalBench',
    jobs: [{ job: 'crystalsToBench' }],
    price: 260,
  },
  {
    id: 'cook',
    name: { tr: 'Mutfakçı', en: 'Cook' },
    info: { tr: 'Tütsüyü mutfağa taşır, tabak servis eder', en: 'Fills the kitchen and serves platters' },
    requires: 'kitchen',
    jobs: [{ job: 'platesToGuests' }, { job: 'smokedToKitchen' }],
    price: 260,
  },
  {
    id: 'sweeper',
    name: { tr: 'Temizlikçi', en: 'Sweeper' },
    info: { tr: 'Çığ kar yığınlarını temizler', en: 'Clears avalanche snow piles' },
    requires: 'smokehouse',
    jobs: [],
    dig: {},
    price: 150,
  },
  {
    id: 'guard',
    name: { tr: 'Bekçi', en: 'Guard' },
    info: { tr: 'Ayı uyarısı +5 sn, yem tuzağını kurar', en: 'Bear warning +5 s, sets the bait trap' },
    requires: 'smokehouse',
    jobs: [{ job: 'baitTrap' }],
    price: 160,
  },
];

export const RoleById = Object.fromEntries(RoleList.map((r) => [r.id, r])) as Record<RoleId, RoleDef>;

/** Guards: each adds warning time before a bear, up to `maxGuards` of them count. They also mark the bear. */
export const GuardEffect = { warningBonus: 5, maxGuards: 2 } as const;
