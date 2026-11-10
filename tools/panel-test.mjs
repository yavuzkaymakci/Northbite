// Panel stress tests (GDD §23) in headless Chrome. Starts its own Vite dev server, loads crafted saves and drives
// the game with real pointer / key events over the DevTools protocol.
//   node tools/panel-test.mjs [suite ...] [--chrome <path>] [--throttle N] [--reduce-motion] [--cycles N]
// Suites: cycles, storm, pairs, joystick, forced, lang, market, roles, harbor (default: all).
// --shots <dir> saves screenshots of the roles suite there. Exit code 1 when a check fails.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const CHROME = opt('--chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const THROTTLE = Number(opt('--throttle', '1'));
const REDUCE = args.includes('--reduce-motion');
const CYCLES = Number(opt('--cycles', '200'));
const VALUED = ['--chrome', '--throttle', '--cycles', '--shots'];
const SHOTS = opt('--shots', '');
const SUITES = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
const ALL = ['cycles', 'storm', 'pairs', 'joystick', 'forced', 'lang', 'market', 'roles', 'harbor'];
const run = SUITES.length ? SUITES : ALL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- save ----------
const fish = (species, kind, price) => ({ species, kg: 1, kind, price });
const save = () => ({
  saveVersion: 5,
  savedAt: Date.now(),
  appearance: null,
  player: { x: 2, z: 1.5, heading: 0 },
  game: {
    coins: 5000,
    pile: 0,
    carried: [],
    counter: [fish('cod', 'raw', 3)],
    unlocked: ['hole2', 'net', 'hut', 'smokehouse', 'hole3', 'penguin2', 'orderBoard', 'igloo2'],
    regions: ['smokeYard'],
    unlockPaid: {},
    basket: [],
    smoker: { input: [], output: [], progress: 0 },
    workers: [{ carried: [] }, { carried: [] }],
    upgrades: { line: 1, reel: 1, bait: 1, backpack: 1 },
    seen: ['capelin', 'cod', 'char'],
    stats: { caught: 50, sold: 50, reels: 50, playTime: 2000, bears: 1, avalanches: 1 },
    clock: { day: 3, t: 0.3 },
    today: { coins: 0, caught: 0, sold: 0 },
    buffs: { aurora: 0 },
    threats: { torches: 0, bait: null, fur: 0 },
    iglooLevel: 2,
    story: { pages: ['page1'] },
    lastSeenAt: Date.now(),
    prefs: { threats: false, dayLength: 'medium', vibration: true, lang: 'tr', reduceMotion: REDUCE, qualityAsked: true, audio: { master: 0, music: 0, sfx: 0, ambience: 0, mute: true } },
  },
});

// ---------- browser ----------
const server = await createServer({ server: { port: 5300 + Math.floor(Math.random() * 400), strictPort: false }, logLevel: 'silent' });
await server.listen();
const URL = server.resolvedUrls.local[0];
const PORT = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-panels-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=390,844', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank']);
let page;
for (let i = 0; i < 160 && !page; i++) {
  await sleep(250);
  try {
    page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page');
  } catch {}
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result ?? msg.error);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push('EXCEPTION ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
  } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    errors.push(msg.params.type.toUpperCase() + ' ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const js = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`${expr.slice(0, 80)}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
if (THROTTLE > 1) await send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `const s = sessionStorage.getItem('nbSeed'); if (s) { localStorage.setItem('northbite-save', s); sessionStorage.removeItem('nbSeed'); }`,
});

async function load(extra = {}) {
  if (!(await js('location.href').catch(() => '')).startsWith(URL)) {
    await send('Page.navigate', { url: URL });
    await sleep(1500);
  }
  const s = save();
  Object.assign(s.game, extra);
  // Seeded at the start of the next page (the old page saves itself on pagehide, after this).
  await js(`sessionStorage.setItem('nbSeed', ${JSON.stringify(JSON.stringify(s))}), true`);
  await send('Page.navigate', { url: URL });
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    if (await js(`!!(window.__game && window.__panels && !document.querySelector('.splash'))`).catch(() => false)) break;
  }
  await sleep(500);
}
await send('Page.navigate', { url: URL });
await sleep(1500);

// ---------- input ----------
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 });
const tap = async (x, y) => {
  await mouse('mousePressed', x, y);
  await mouse('mouseReleased', x, y);
};
const center = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return b.width ? [b.x + b.width / 2, b.y + b.height / 2] : null; })()`);
const tapSel = async (sel) => {
  // Wait for a sliding sheet to settle: two equal reads inside the screen.
  let c = await center(sel);
  let same = 0;
  for (let i = 0; i < 40 && c && same < 2; i++) {
    await sleep(40);
    const d = await center(sel);
    same = d && d[0] === c[0] && d[1] === c[1] && d[1] > 0 && d[1] < 844 ? same + 1 : 0;
    c = d;
  }
  if (!c) return false;
  await tap(c[0], c[1]);
  return true;
};
const key = async (k, code = k, vk = 27) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
};
const frames = (n = 2) => js(`new Promise((r) => { let i = 0; const f = () => (++i >= ${n} ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);
const teleport = (x, z) => js(`(() => { const p = window.__game.player.state; p.x = ${x}; p.z = ${z}; p.vx = 0; p.vz = 0; return true; })()`);
const isOpen = (pid) => js(`window.__panels.isOpen(${JSON.stringify(pid)})`);
const PAD = { x: -7.6, z: -2.0 };
const BOARD = { x: -1.2, z: 2.9 };
const MARKET = { x: -8.6, z: 8.1 };
const AWAY = { x: 2, z: 1.5 };
const VOYAGE = { x: 20.3, z: 17.2 };
const RACK = { x: 9.2, z: 14.2 };
const LIGHTHOUSE = { x: 17.9, z: 17.2 };
/** A late save with the Harbour Pier open and the boat repaired (GDD §25), one penguin a dockhand later. */
const HARBOR_SAVE = (harbor = {}) => ({
  coins: 20000,
  unlocked: ['hole2', 'net', 'hut', 'smokehouse', 'hole3', 'penguin2', 'orderBoard', 'igloo2', 'crystalBench', 'tent1', 'kitchen', 'boatHull', 'boatSail', 'boatCabin'],
  regions: ['smokeYard', 'iceCave', 'hotSpring', 'harbor'],
  // Harbour pages 7–9 already found, so no page card covers the panels (page 10 is checked at the end).
  story: { pages: ['page1', 'page2', 'page3', 'page7', 'page8', 'page9'] },
  workers: [{ carried: [] }, { carried: [] }],
  harbor,
});

/** Clean state: nothing open or queued, no hidden touch catcher, game touches on, no pointer held. */
async function audit(label, expectOpen = []) {
  await sleep(550);
  const r = await js(`(() => {
    const p = window.__panels, g = window.__game;
    const s = p.snapshot();
    return { problems: p.audit(), recorded: s.problems, open: s.open, cards: s.cards, modals: s.modals, events: s.events,
      router: g.router.enabled, owned: g.router.owned.size, joy: g.joystick.activePointer };
  })()`);
  const fails = [];
  const open = r.open.map((o) => o.replace(/\(.*\)/, ''));
  if (r.problems.length) fails.push(`audit: ${r.problems.join('; ')}`);
  if (r.recorded.length) fails.push(`recorded: ${r.recorded.join('; ')}`);
  for (const o of open) if (!expectOpen.includes(o)) fails.push(`still open: ${o}`);
  for (const o of expectOpen) if (!open.includes(o)) fails.push(`not open: ${o}`);
  if (r.cards.length || r.modals.length) fails.push(`queued: ${[...r.cards, ...r.modals].join(',')}`);
  const blocking = expectOpen.some((o) => !['daySummary', 'page', 'fishCard'].includes(o));
  if (!blocking && !r.router) fails.push('game touches still off');
  if (r.owned) fails.push(`${r.owned} pointer(s) still owned`);
  if (r.joy !== null) fails.push('joystick still held');
  results.push({ label, ok: fails.length === 0, fails, events: fails.length ? r.events : undefined });
  return fails.length === 0;
}
const results = [];
const check = (label, ok, detail = '') => results.push({ label, ok, fails: ok ? [] : [detail || 'failed'] });

// ---------- suites ----------
const shot = async (name) => {
  if (!SHOTS) return;
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
};

const suites = {
  /**
   * Roles at work (GDD §24): a late save with the cave, the camp and the bait trap open and five penguins (miner, cook,
   * guard, sweeper, carrier). The real game runs for a while; the work must get done and no penguin may get stuck.
   */
  async roles() {
    const smoked = (n) => Array.from({ length: n }, () => fish('cod', 'smoked', 8));
    const raw = (n) => Array.from({ length: n }, () => fish('capelin', 'raw', 2));
    await load({
      unlocked: ['hole2', 'net', 'hut', 'smokehouse', 'hole3', 'penguin2', 'orderBoard', 'igloo2', 'torchStand', 'baitTrap', 'crystalBench', 'tent1', 'kitchen', 'tent2'],
      regions: ['smokeYard', 'iceCave', 'hotSpring'],
      story: { pages: ['page1', 'page2', 'page3'] },
      workers: Array.from({ length: 5 }, () => ({ carried: [] })),
      basket: raw(6),
      smoker: { input: [], output: smoked(8), progress: 0 },
      cave: { veins: [0, 0, 0, 0, 0, 0], input: 0, output: 0, progress: 0, collectorIn: 400, pile: 0, mined: 3 },
      camp: { input: [], plates: [], progress: 0, pile: 0, served: 1 },
    });
    const roles = ['carrier', 'miner', 'cook', 'guard', 'sweeper'];
    await js(`(() => { const g = window.__game; g.state.workers.forEach((w, i) => { w.role = ${JSON.stringify(roles)}[i]; g.workers.roleChanged(w); }); return true; })()`);
    const st = () =>
      js(`(() => { const g = window.__game; const s = g.state; return { mined: s.cave.mined, crystals: s.cave.input + s.cave.output, kitchen: s.camp.input.length, plates: s.camp.plates.length, served: s.camp.served, bait: !!s.threats.bait, hut: s.hutLevel, pos: g.workers.brains.map((b) => [b.x, b.z, b.phase]) }; })()`);
    const s0 = await st();
    check('5 penguins from a v5 save: hut grows to fit them', s0.hut >= 4, JSON.stringify(s0.hut));
    await js(`window.__game.threats.debugStart('avalanche', false), true`);
    const moved = [0, 0, 0, 0, 0];
    let last = s0.pos;
    for (let t = 0; t < 30; t++) {
      await sleep(3000);
      const now = (await st()).pos;
      now.forEach((p, i) => (moved[i] += Math.hypot(p[0] - last[i][0], p[1] - last[i][1])));
      last = now;
      if (t === 8) {
        await teleport(-27.5, 0.6);
        await sleep(600);
        await shot('roles-cave');
      }
      if (t === 18) {
        await teleport(15.5, -2.5);
        await sleep(600);
        await shot('roles-camp');
      }
    }
    const s1 = await st();
    check('miner: crystals mined and on the bench', s1.mined > s0.mined && s1.crystals > 0, `mined ${s0.mined}→${s1.mined}, bench ${s1.crystals}`);
    check('cook: kitchen filled and platters served', s1.kitchen + s1.plates > 0 || s1.served > s0.served, JSON.stringify({ k: s1.kitchen, p: s1.plates, served: s1.served }));
    check('guard: bait trap set from the basket', s1.bait);
    check('sweeper: avalanche piles cleared', await js(`window.__game.world.colliders.filter((c) => window.__game.threats.avalanche.isPile(c)).length === 0`));
    check('every penguin moved (none stuck at home or on the way)', moved.every((d) => d > 5), moved.map((d) => d.toFixed(0)).join(', '));
    await teleport(-6, 8.6);
    await sleep(600);
    await shot('roles-hut');
    await teleport(AWAY.x, AWAY.z);
    await audit('roles: clean');
  },


  /**
   * Penguin Market (GDD §24): the v5 test save migrates (two penguins become carrier + smoker, the old "2nd penguin"
   * gives the stall); tabs, buying, a role change and a hut upgrade work through the panel and leave nothing stuck.
   */
  /**
   * Harbour Pier (GDD §25): the voyage panel opens on its ring, a voyage leaves, comes back and fills the loot rack;
   * a dockhand carries loot away; a voyage finishing while the game is closed lands once (no double count); the
   * seal tab buys a seal; walking off closes the panel.
   */
  async harbor() {
    await load(HARBOR_SAVE());
    const st = () =>
      js(`(() => { const h = window.__game.state.harbor; return { phase: h.voyage ? 'out' : h.returned ? 'returned' : 'ready', voyages: h.voyages, rack: h.rack.length, crates: h.crates.length, pile: h.pile, seals: h.seals.length, coins: window.__game.state.coins, pending: window.__game.state.offlinePending }; })()`);
    const s0 = await st();
    check('v5 save + harbour: default harbour state, boat ready', s0.phase === 'ready' && s0.voyages === 0, JSON.stringify(s0));
    await teleport(VOYAGE.x, VOYAGE.z);
    for (let k = 0; k < 40 && !(await isOpen('voyage')); k++) await sleep(25);
    check('voyage panel opens on the voyage point', await isOpen('voyage'));
    await shot('harbor-panel');
    await tapSel('.voyage-panel .vp-dest .mc-buy');
    await frames(3);
    let s1 = await st();
    check('"Sail" sends the boat out (supplies paid)', s1.phase === 'out' && s1.coins < s0.coins, JSON.stringify(s1));
    for (let i = 0; i < 10; i++) {
      await tapSel(`.voyage-panel .panel-tabs button[data-tab="${i % 2 ? 'trips' : 'boat'}"]`);
      await frames(1);
    }
    check('still open after tab taps', await isOpen('voyage'));
    await tapSel('.voyage-panel .panel-tabs button[data-tab="boat"]');
    await frames(3);
    await tapSel('.voyage-panel .upgrade-card');
    await frames(3);
    check('boat upgrade from the Boat tab', await js(`window.__game.state.harbor.upgrades.boatSpeed === 2 || window.__game.state.harbor.upgrades.boatCargo === 2 || window.__game.state.harbor.upgrades.boatCrew === 2 || window.__game.state.harbor.upgrades.boatLantern === 2`));
    await teleport(AWAY.x, AWAY.z);
    await frames(3);
    check('walking off closes the voyage panel', !(await isOpen('voyage')));
    // Fast-forward the voyage: it comes back once, loot lands on the rack.
    await js(`(() => { const v = window.__game.state.harbor.voyage; v.left = 1; return true; })()`);
    await sleep(1800);
    s1 = await st();
    check('the boat comes back with loot on the rack', s1.phase === 'returned' && s1.voyages === 1 && s1.rack + s1.crates > 0, JSON.stringify(s1));
    // Offline: a voyage with 2 minutes left, 10 minutes away → back exactly once, one line in the window.
    await js(`(() => { const g = window.__game; g.state.coins += 100; g.harbor.depart('reef', true); const v = g.state.harbor.voyage; v.left = 120; g.state.harbor.auto = false; g.state.lastSeenAt = Date.now() - 600000; g.checkOffline(); return true; })()`);
    await frames(3);
    const s2 = await st();
    check('offline: the voyage at sea finishes once while away', s2.voyages === 2 && s2.phase === 'returned', JSON.stringify(s2));
    check('offline: "the boat came back" line in the window', !!s2.pending?.boat && s2.pending.boat.voyages === 1, JSON.stringify(s2.pending));
    await js(`(() => { window.__game.checkOffline(); return true; })()`);
    const s3 = await st();
    check('offline: checking again does not count it twice', s3.voyages === 2 && s3.pending?.boat?.voyages === 1, JSON.stringify(s3.pending));
    if (await isOpen('offline')) await tapSel('.offline-collect');
    await frames(3);
    // A dockhand takes loot off the rack.
    await js(`(() => { const g = window.__game; const w = g.state.workers[0]; w.role = 'dockhand'; g.workers.roleChanged(w); return true; })()`);
    const r0 = (await st()).rack + (await st()).crates;
    await sleep(15000);
    const r1 = (await st()).rack + (await st()).crates;
    check('dockhand carries loot from the rack', r1 < r0, `${r0} → ${r1}`);
    // The player picks loot up at the rack.
    await teleport(RACK.x, RACK.z);
    await sleep(1500);
    const carried = await js(`window.__game.state.carried.length`);
    check('loot flies onto the back at the rack', carried > 0 || r1 === 0, `${carried}`);
    await shot('harbor-rack');
    // Seal tab in the Penguin Market.
    await js(`(() => { const s = window.__game.state; s.carried.length = 0; return true; })()`);
    await teleport(MARKET.x, MARKET.z);
    for (let k = 0; k < 40 && !(await isOpen('market')); k++) await sleep(25);
    check('market opens (seal tab test)', await isOpen('market'));
    await tapSel('.market-panel .panel-tabs button[data-tab="seals"]');
    await frames(3);
    const tabInfo = await js(`(() => { const b = document.querySelector('.market-panel .panel-tabs button[data-tab="seals"]'); return { hidden: b.hidden, on: b.classList.contains('on'), offers: window.__game.state.harbor.sealMarket.offers.length }; })()`);
    await tapSel('.market-panel .mc-buy');
    await frames(3);
    check('seal tab: a seal joins the crew', (await st()).seals === 1, JSON.stringify({ ...(await st()), tabInfo }));
    await teleport(AWAY.x, AWAY.z);
    await frames(3);
    // Lighthouse (GDD §25 C6): five stages from the panel on the pier; then the season card and page 10.
    await js(`(() => { const s = window.__game.state; s.harbor.parts = 5; s.coins = 50000; return true; })()`);
    await teleport(LIGHTHOUSE.x, LIGHTHOUSE.z);
    for (let k = 0; k < 40 && !(await isOpen('lighthouse')); k++) await sleep(25);
    check('lighthouse panel opens on its ring', await isOpen('lighthouse'));
    for (let i = 0; i < 5; i++) {
      await tapSel('.lighthouse-panel .lh-card');
      await frames(4);
    }
    const lh = await js(`(() => { const s = window.__game.state; return { stage: s.harbor.lighthouse, parts: s.harbor.parts, page10: s.story.pages.includes('page10'), season: s.harbor.seasonShown }; })()`);
    check('lighthouse: 5 stages repaired with 5 parts', lh.stage === 5 && lh.parts === 0, JSON.stringify(lh));
    await shot('harbor-lighthouse');
    await teleport(AWAY.x, AWAY.z);
    await frames(3);
    check('lighthouse panel closes when walking off', !(await isOpen('lighthouse')));
    await sleep(600);
    const lh2 = await js(`(() => { const s = window.__game.state; return { page10: s.story.pages.includes('page10'), season: s.harbor.seasonShown, cards: window.__panels.snapshot().cards, open: window.__panels.snapshot().open }; })()`);
    check('season card and the last journal page come', lh2.season && lh2.page10, JSON.stringify(lh2));
    for (let i = 0; i < 6 && ((await isOpen('season')) || (await isOpen('page')) || (await js('window.__panels.snapshot().cards.length'))); i++) {
      await key('Escape');
      await sleep(700);
    }
    await audit('harbor: clean');
  },

  async market() {
    await load();
    const st = () => js(`(() => { const s = window.__game.state; return { n: s.workers.length, roles: s.workers.map((w) => w.role), market: s.unlocked.includes('market'), hut: s.hutLevel, coins: s.coins, offers: s.market.offers.length }; })()`);
    let s0 = await st();
    check('v5 → v6: penguins kept as carrier + smoker, stall from the old 2nd-penguin frame', s0.n === 2 && s0.roles[0] === 'carrier' && s0.roles[1] === 'smoker' && s0.market, JSON.stringify(s0));
    await teleport(MARKET.x, MARKET.z);
    for (let k = 0; k < 40 && !(await isOpen('market')); k++) await sleep(25);
    check('market opens on its pad', await isOpen('market'));
    check('catalog has 3–4 candidates', s0.offers >= 3 && s0.offers <= 4, `${s0.offers}`);
    const buyBtn = () => js(`(() => { const b = document.querySelector('.market-panel .mc-buy'); return b ? b.classList.contains('full') : null; })()`);
    check('hut full (2/2): buy button says so', (await buyBtn()) === true);
    await tapSel('.market-panel .panel-tabs button[data-tab="hut"]');
    await frames(3);
    await tapSel('.market-panel .mh-card');
    await frames(3);
    s0 = await st();
    check('hut upgrade from the Hut tab (2 → 3 places)', s0.hut === 2, JSON.stringify(s0));
    await tapSel('.market-panel .panel-tabs button[data-tab="catalog"]');
    await frames(3);
    await tapSel('.market-panel .mc-buy');
    await frames(3);
    s0 = await st();
    check('buying a candidate adds a penguin', s0.n === 3 && s0.offers >= 2, JSON.stringify(s0));
    await tapSel('.market-panel .panel-tabs button[data-tab="mine"]');
    await frames(3);
    await tapSel('.market-panel .mc-role-btn');
    await frames(3);
    const before = (await st()).roles[0];
    await tapSel('.market-panel .mr-chip:not(.on)');
    await frames(3);
    const after = (await st()).roles[0];
    check('role change from "My penguins"', before !== after, `${before} → ${after}`);
    for (let i = 0; i < 20; i++) {
      await tapSel(`.market-panel .panel-tabs button[data-tab="${['catalog', 'mine', 'hut'][i % 3]}"]`);
      await frames(1);
    }
    check('still open after tab taps', await isOpen('market'));
    await teleport(AWAY.x, AWAY.z);
    await frames(3);
    check('walking off closes the market', !(await isOpen('market')));
    await audit('market: clean');
  },


  /** Every panel opened and closed CYCLES times, closing it every possible way in turn. */
  async cycles() {
    await load();
    const modal = async (pid, openSel, closers) => {
      let stuck = 0;
      for (let i = 0; i < CYCLES; i++) {
        await tapSel(openSel);
        if (!(await isOpen(pid))) stuck++;
        const how = closers[i % closers.length];
        if (how === 'escape') await key('Escape');
        else if (how === 'outside') await tap(12, 430);
        else if (how === 'outsideTop') await tap(195, 150);
        else if (how === 'history') await js('history.back(), true'), await sleep(30);
        else await tapSel(how);
        if (await isOpen(pid)) stuck++;
      }
      check(`${pid}: ${CYCLES}× open/close (${closers.join(', ')})`, stuck === 0, `${stuck} failed open/close steps`);
      await audit(`${pid}: clean after cycles`);
    };
    await modal('settings', '.hud-right .hud-gear:not(.hud-book)', ['.settings-card .settings-btn.close', 'outside', 'escape', 'history']);
    await modal('journal', '.hud-book', ['.journal .settings-btn.close', 'outside', 'escape']);
    await modal('codex', '.hud-codex', ['.codex-close', 'escape']);
    await modal('orders', '.hud-board', ['.order-close', 'outsideTop', 'escape']);

    // Contextual: stand on the pad, close every way; dismissed panels stay shut until the player steps off.
    const contextual = async (pid, spot, closer, xSel = '.panel-x') => {
      let stuck = 0;
      let reopened = 0;
      const n = Math.max(Math.round(CYCLES / 4), 10);
      const ways = [xSel, 'outside', 'escape', 'leave', closer];
      for (let i = 0; i < n; i++) {
        await teleport(spot.x, spot.z);
        let opened = false;
        for (let k = 0; k < 40 && !opened; k++) {
          await sleep(25);
          opened = await isOpen(pid);
        }
        if (!opened) stuck++;
        const how = ways[i % ways.length];
        if (how === 'leave') await teleport(AWAY.x, AWAY.z), await frames(3);
        else if (how === 'escape') await key('Escape');
        else if (how === 'outside') await tap(195, 120);
        else await tapSel(how);
        await frames(2);
        if (await isOpen(pid)) stuck++;
        if (how !== 'leave') {
          await sleep(400);
          if (await isOpen(pid)) reopened++;
        }
        await teleport(AWAY.x, AWAY.z);
        await frames(3);
      }
      check(`${pid}: ${n}× stand / close (×, outside, back, walk off)`, stuck === 0, `${stuck} failed steps`);
      check(`${pid}: dismissed panel stays shut on the pad`, reopened === 0, `${reopened} re-opened`);
      await audit(`${pid}: clean after cycles`);
    };
    await contextual('bench', PAD, '.panel-x');
    await contextual('orders', BOARD, '.order-close');
    await contextual('market', MARKET, '.panel-x');
    // Harbour Pier (GDD §25): the voyage panel on the voyage point ring (a save with the harbour open).
    await load(HARBOR_SAVE());
    await contextual('voyage', VOYAGE, '.voyage-panel .panel-x', '.voyage-panel .panel-x');
    await contextual('lighthouse', LIGHTHOUSE, '.lighthouse-panel .panel-x', '.lighthouse-panel .panel-x');
    await load();

    // Cards.
    let stuck = 0;
    for (let i = 0; i < CYCLES; i++) {
      await js(`window.__game.summary.show(${i}, { coins: 1, caught: 1, sold: 1 }, null), true`);
      if (!(await isOpen('daySummary'))) stuck++;
      if (i % 2) await tapSel('.day-summary');
      else await tap(195, 700);
      if (await isOpen('daySummary')) stuck++;
    }
    check(`daySummary: ${CYCLES}× show/close (tap, outside)`, stuck === 0, `${stuck} failed steps`);
    stuck = 0;
    for (let i = 0; i < Math.round(CYCLES / 10); i++) {
      await js(`window.__game.story.card.show('page1', () => {}), true`);
      await sleep(650);
      await tapSel('.page-add');
      if (await isOpen('page')) stuck++;
    }
    check(`page: ${Math.round(CYCLES / 10)}× show/add`, stuck === 0, `${stuck} stuck`);
    stuck = 0;
    for (let i = 0; i < CYCLES; i++) {
      await js(`window.__game.offline.show(10, 4000, false, 2, () => {}), true`);
      if (!(await isOpen('offline'))) stuck++;
      if (i % 2) await tapSel('.offline-collect');
      else await key('Escape');
      if (await isOpen('offline')) stuck++;
    }
    check(`offline: ${CYCLES}× show/collect (button, back)`, stuck === 0, `${stuck} failed steps`);
    // Character editor (fades in / out: fewer rounds).
    stuck = 0;
    for (let i = 0; i < 12; i++) {
      await tapSel('.hud-right .hud-gear:not(.hud-book)');
      await tapSel('.settings-btn.primary');
      await sleep(700);
      if (!(await isOpen('creator'))) {
        stuck++;
        if (stuck === 1) console.log('creator debug', JSON.stringify(await js('window.__panels.snapshot()')), await js(`document.querySelector('.settings-btn.primary')?.getBoundingClientRect().toJSON()`));
      }
      if (i % 2) await tapSel('.creator-close');
      else await key('Escape');
      await sleep(700);
      if (await isOpen('creator')) stuck++;
      if (await js(`document.querySelector('.ui-layer').classList.contains('hidden')`)) stuck++;
    }
    check('creator (edit): 12× open/close (×, back)', stuck === 0, `${stuck} failed steps`);
    await audit('all panels: clean at the end');
  },

  /** Random taps everywhere (HUD buttons, cards, canvas), Escape and drags, fast; then everything must settle. */
  async storm() {
    await load();
    const sels = ['.hud-right .hud-gear:not(.hud-book)', '.hud-book', '.hud-codex', '.hud-board', '.settings-btn.close', '.codex-close', '.order-close', '.panel-x', '.journal-row', '.codex-card', '.market-panel .panel-tabs button', '.mc-buy', '.mc-role-btn'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 600; i++) {
      const r = rnd();
      if (r < 0.35) await tapSel(sels[Math.floor(rnd() * sels.length)]);
      else if (r < 0.75) await tap(rnd() * 390, rnd() * 844);
      else if (r < 0.82) await key('Escape');
      else if (r < 0.88) {
        const spot = [PAD, BOARD, MARKET][Math.floor(rnd() * 3)];
        await teleport(spot.x, spot.z);
      }
      else if (r < 0.92) await js(`window.__game.summary.show(1, { coins: 1, caught: 1, sold: 1 }, null), true`);
      else {
        const x = rnd() * 390;
        const y = 300 + rnd() * 500;
        await mouse('mousePressed', x, y);
        await mouse('mouseMoved', x + 40, y + 30);
        await mouse('mouseReleased', x + 40, y + 30);
      }
      if (i % 25 === 0) await frames(1);
    }
    await teleport(AWAY.x, AWAY.z);
    for (let i = 0; i < 6; i++) await key('Escape');
    await sleep(4500); // a day summary closes by itself
    await audit('storm: everything settles');
  },

  /** Two panels at once: the newer contextual / modal one wins; a system window waits its turn. */
  async pairs() {
    await load();
    await teleport(PAD.x, PAD.z);
    await sleep(500);
    check('bench opens on the pad', await isOpen('bench'));
    await tapSel('.hud-board');
    check('orders replace the bench', (await isOpen('orders')) && !(await isOpen('bench')));
    await sleep(400);
    check('bench stays shut (dismissed) while the player stays on the pad', !(await isOpen('bench')));
    await tapSel('.hud-right .hud-gear:not(.hud-book)');
    check('settings replace the orders', (await isOpen('settings')) && !(await isOpen('orders')));
    await js(`window.__game.offline.show(10, 4000, false, 2, () => {}), true`);
    check('offline window waits while settings are open', !(await isOpen('offline')) && (await js(`window.__panels.isQueued('offline')`)));
    await js(`window.__game.summary.show(1, { coins: 1, caught: 1, sold: 1 }, null), true`);
    check('day summary waits while a modal is open', !(await isOpen('daySummary')));
    await key('Escape');
    check('offline window shows after settings close', await isOpen('offline'));
    await tapSel('.offline-collect');
    check('day summary shows after the windows', await isOpen('daySummary'));
    await js(`window.__game.story.card.show('page1', () => {}), true`);
    check('page card waits behind the day summary', !(await isOpen('page')));
    await tapSel('.day-summary');
    check('page card follows', await isOpen('page'));
    await sleep(650);
    await tapSel('.page-add');
    // A card already up, then a modal: back closes the modal (it covers the card) first.
    await js(`window.__game.summary.show(2, { coins: 1, caught: 1, sold: 1 }, null), true`);
    // Opened by code (a tap on the gear would close the card as an outside tap).
    await js(`window.__panels.open('settings'), true`);
    await key('Escape');
    check('back closes the modal before a card under it', !(await isOpen('settings')) && (await isOpen('daySummary')));
    await key('Escape');
    check('then the card', !(await isOpen('daySummary')));
    await teleport(AWAY.x, AWAY.z);
    await audit('pairs: clean');
  },

  /** A touch while a panel is open closes it and does not move the player; the next touch walks. */
  async joystick() {
    await load();
    await teleport(PAD.x, PAD.z);
    await sleep(500);
    const before = await js(`[window.__game.player.state.x, window.__game.player.state.z]`);
    // Just above the sheet, inside the joystick area (below the top 30 %).
    await mouse('mousePressed', 195, 270);
    await mouse('mouseMoved', 195, 350);
    await sleep(400);
    const during = await js(`[window.__game.player.state.x, window.__game.player.state.z]`);
    await mouse('mouseReleased', 195, 350);
    check('outside touch closes the bench', !(await isOpen('bench')));
    check('that touch does not walk', Math.hypot(during[0] - before[0], during[1] - before[1]) < 0.05, `moved ${during}`);
    await mouse('mousePressed', 195, 700);
    await mouse('mouseMoved', 195, 780);
    await sleep(500);
    const after = await js(`[window.__game.player.state.x, window.__game.player.state.z]`);
    await mouse('mouseReleased', 195, 780);
    check('the next touch walks', Math.hypot(after[0] - during[0], after[1] - during[1]) > 0.3, `moved ${after}`);
    // A pointer held when a modal opens is let go.
    await mouse('mousePressed', 195, 700);
    await mouse('mouseMoved', 195, 760);
    await js(`window.__game.codex.open(window.__game.state), true`);
    await frames(2);
    check('a held joystick is let go when a modal opens', (await js('window.__game.joystick.activePointer')) === null);
    await mouse('mouseReleased', 195, 760);
    await key('Escape');
    // pointercancel
    await mouse('mousePressed', 195, 700);
    await mouse('mouseMoved', 195, 760);
    await js(`(() => { const c = document.querySelector('.game-canvas'); c.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })); return true; })()`);
    await frames(2);
    await mouse('mouseReleased', 195, 760);
    await audit('joystick: clean');
  },

  /** Forced moves and app switches while a contextual panel is open. */
  async forced() {
    await load({ clock: { day: 3, t: 0.72 } });
    const openBench = async () => {
      await teleport(AWAY.x, AWAY.z);
      await frames(3);
      await teleport(PAD.x, PAD.z);
      for (let k = 0; k < 40 && !(await isOpen('bench')); k++) await sleep(25);
      return isOpen('bench');
    };
    check('bench open (push test)', await openBench());
    await teleport(PAD.x + 3, PAD.z + 2); // an avalanche push / teleport
    await frames(2);
    check('push off the pad closes the bench', !(await isOpen('bench')));
    check('bench open (igloo test)', await openBench());
    await js(`window.__game.igloo.upgrade(3), true`);
    await frames(3);
    check('igloo upgrade: bench closed or still valid', !(await isOpen('bench')) || (await js(`Math.hypot(window.__game.player.state.x + 7.6, window.__game.player.state.z + 2) <= 0.9`)));
    check('bench open (sleep test)', await openBench());
    await js(`window.__game.fallAsleep(), true`);
    await frames(3);
    check('falling asleep closes the bench', !(await isOpen('bench')));
    await sleep(4200);
    check('bench open (camera tour test)', await openBench());
    await js(`(async () => { const z = await import('${new globalThis.URL(URL).pathname}src/content/zones.ts'); window.__game.regionOpening.start(z.Regions.find((r) => r.id === 'iceCave')); return true; })()`);
    await frames(3);
    check('camera tour closes the bench', !(await isOpen('bench')));
    await sleep(4500);
    check('bench open (background test)', await openBench());
    await js(`(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); return true; })()`);
    check('going to the background closes the bench', !(await isOpen('bench')));
    await tapSel('.hud-codex');
    await js(`(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); return true; })()`);
    check('a modal opened before stays open after coming back', await isOpen('codex'));
    await key('Escape');
    await teleport(AWAY.x, AWAY.z);
    await audit('forced: clean');
  },

  /** Language change reloads the game: nothing is left open, panels work after it. */
  async lang() {
    await load();
    await teleport(PAD.x, PAD.z);
    await sleep(500);
    await tapSel('.hud-right .hud-gear:not(.hud-book)');
    await tapSel('.seg[data-key="lang"] [data-v="en"]');
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      if (await js(`!!(window.__game && window.__panels && !document.querySelector('.splash'))`).catch(() => false)) break;
    }
    await sleep(800);
    await teleport(AWAY.x, AWAY.z);
    await audit('after language change: clean');
    await tapSel('.hud-right .hud-gear:not(.hud-book)');
    check('settings open after the reload (English)', (await isOpen('settings')) && (await js(`document.querySelector('.settings-title').textContent`)) === 'Settings');
    await tapSel('.seg[data-key="lang"] [data-v="tr"]');
    await sleep(3000);
  },
};

const t0 = Date.now();
for (const name of run) {
  try {
    await suites[name]();
  } catch (e) {
    results.push({ label: `${name}: crashed`, ok: false, fails: [String(e)] });
  }
}
const failed = results.filter((r) => !r.ok);
const tag = `${THROTTLE > 1 ? ` throttle ${THROTTLE}×` : ''}${REDUCE ? ' reduce-motion' : ''}`;
console.log(`\nPanel tests${tag} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label}${r.ok ? '' : `\n     ${r.fails.join('\n     ')}${r.events ? `\n     events: ${r.events.join(' | ')}` : ''}`}`);
const pageErrors = errors.filter((e) => !e.includes('[vite]'));
console.log(`page errors: ${pageErrors.length ? pageErrors.join('\n  ') : 'none'}`);
console.log(`${results.length - failed.length}/${results.length} passed`);
ws.close();
chrome.kill();
await server.close();
process.exit(failed.length || pageErrors.length ? 1 : 0);
