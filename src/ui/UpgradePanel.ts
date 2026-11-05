import { getLang, t, tf } from '../content/strings';
import { FishById } from '../content/fish';
import { StationUpgradeList, type StationUpgradeDef, type StationUpgradeId } from '../content/stationUpgrades';
import { UpgradeList, UpgradeMaxLevel, type UpgradeId } from '../content/upgrades';
import { BenchFeel } from '../settings';
import type { GameState } from '../core/GameState';
import { stationUpgradeCost, stationUpgradeValue, stationUpgradeVisible } from '../systems/StationUpgrades';
import { upgradeCost, upgradeValue } from '../systems/Upgrades';
import { onTap } from './tap';
import { panels, type CloseReason } from './PanelManager';

const ICONS: Record<UpgradeId, string> = {
  // Spool with line
  line: `<svg viewBox="0 0 48 48"><rect x="12" y="8" width="24" height="6" rx="2"/><rect x="12" y="34" width="24" height="6" rx="2"/>
    <rect x="16" y="14" width="16" height="20" fill="var(--fishing-line)"/><path d="M32 22 C40 22 42 30 44 40" stroke="var(--fishing-line)" stroke-width="2" fill="none"/></svg>`,
  // Reel with speed lines
  reel: `<svg viewBox="0 0 48 48"><circle cx="26" cy="24" r="13" fill="var(--reel)"/><circle cx="26" cy="24" r="5" fill="var(--panel-card)"/>
    <rect x="25" y="5" width="3" height="8" rx="1.5"/><rect x="3" y="16" width="9" height="3" rx="1.5"/><rect x="1" y="23" width="11" height="3" rx="1.5"/><rect x="3" y="30" width="9" height="3" rx="1.5"/></svg>`,
  // Hook with a bait blob
  bait: `<svg viewBox="0 0 48 48"><path d="M24 4 V30 a8 8 0 1 1 -12 -6" stroke="var(--reel)" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="24" cy="22" r="7" fill="var(--bobber-red)"/><circle cx="21.5" cy="19.5" r="2" fill="var(--panel-card)"/></svg>`,
  // Backpack
  backpack: `<svg viewBox="0 0 48 48"><path d="M17 12 a7 7 0 0 1 14 0" stroke="var(--wood-dark)" stroke-width="3" fill="none"/>
    <rect x="10" y="12" width="28" height="30" rx="7" fill="var(--jacket)"/><rect x="15" y="26" width="18" height="11" rx="3" fill="var(--wood-light)"/></svg>`,
};

const STATION_ICONS: Record<StationUpgradeId, string> = {
  netSpeed: `<svg viewBox="0 0 48 48"><path d="M8 10h32L30 40H18z" fill="none" stroke="var(--net-cord)" stroke-width="3"/><path d="M14 18h20M17 26h14M12 10l12 30M36 10L24 40" stroke="var(--net-cord)" stroke-width="2"/></svg>`,
  basket: `<svg viewBox="0 0 48 48"><path d="M8 18h32l-4 22H12z" fill="var(--wicker)"/><path d="M12 18a12 10 0 0 1 24 0" stroke="var(--wood-dark)" stroke-width="3" fill="none"/></svg>`,
  penguinSpeed: `<svg viewBox="0 0 48 48"><ellipse cx="26" cy="28" rx="11" ry="14" fill="var(--penguin-back)"/><ellipse cx="27" cy="31" rx="7" ry="10" fill="var(--penguin-belly)"/><path d="M33 16l8 3-8 2z" fill="var(--penguin-beak)"/><rect x="2" y="22" width="9" height="3" rx="1.5"/><rect x="4" y="30" width="7" height="3" rx="1.5"/></svg>`,
  penguinCarry: `<svg viewBox="0 0 48 48"><ellipse cx="24" cy="32" rx="11" ry="12" fill="var(--penguin-back)"/><ellipse cx="25" cy="35" rx="7" ry="8" fill="var(--penguin-belly)"/><rect x="12" y="8" width="24" height="5" rx="2.5" fill="var(--fish-cod)"/><rect x="14" y="14" width="20" height="5" rx="2.5" fill="var(--fish-capelin)"/></svg>`,
  smokeSpeed: `<svg viewBox="0 0 48 48"><rect x="10" y="22" width="28" height="20" rx="3" fill="var(--wood)"/><rect x="18" y="30" width="12" height="8" fill="var(--ember-glow)"/><circle cx="20" cy="14" r="5" fill="var(--smoke)"/><circle cx="29" cy="10" r="6" fill="var(--smoke)"/></svg>`,
  counter: `<svg viewBox="0 0 48 48"><rect x="6" y="20" width="36" height="20" rx="2" fill="var(--wood)"/><path d="M4 12h40l-4 8H8z" fill="var(--awning)"/><rect x="12" y="16" width="10" height="4" rx="2" fill="var(--fish-cod)"/><rect x="26" y="16" width="10" height="4" rx="2" fill="var(--smoked-fish)"/></svg>`,
  kitchenSpeed: `<svg viewBox="0 0 48 48"><ellipse cx="24" cy="30" rx="18" ry="7" fill="var(--plate)"/><rect x="14" y="25" width="20" height="6" rx="3" fill="var(--smoked-fish)"/><circle cx="32" cy="24" r="3" fill="var(--garnish)"/></svg>`,
  tentRent: `<svg viewBox="0 0 48 48"><path d="M24 8L42 40H6z" fill="var(--tent-blue)"/><path d="M24 22l7 18H17z" fill="var(--doorway)"/></svg>`,
  statuette: `<svg viewBox="0 0 48 48"><rect x="14" y="36" width="20" height="6" fill="var(--cave-ice)"/><path d="M24 6l8 14-8 16-8-16z" fill="var(--crystal)"/></svg>`,
  offlineCap: `<svg viewBox="0 0 48 48"><circle cx="24" cy="26" r="16" fill="var(--panel-card)" stroke="var(--ui-ink)" stroke-width="3"/><path d="M24 16v11l7 4" stroke="var(--ui-ink)" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M8 8l6 4M40 8l-6 4" stroke="var(--ui-ink)" stroke-width="3"/></svg>`,
  offlineRate: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" fill="var(--coin)"/><text x="24" y="30" text-anchor="middle" font-size="16" font-weight="900" fill="var(--ui-ink)">%</text></svg>`,
};

type Tab = 'rod' | 'stations' | 'time';
export type UpgradeKind = 'rod' | 'station';

interface Card {
  root: HTMLDivElement;
  level: HTMLDivElement;
  pips: HTMLDivElement;
  effect: HTMLDivElement;
  extra: HTMLDivElement;
  price: HTMLDivElement;
  priceValue: HTMLSpanElement;
}

/**
 * Bottom sheet with one big card per upgrade (GDD §4.2, §18), in three tabs: Rod | Stations | Time. The whole card is
 * the button. Opens while the player stands on the rod bench pad. Cards of stations the player does not have yet
 * (camp, cave...) stay hidden.
 */
export class UpgradePanel {
  private readonly root: HTMLDivElement;
  private readonly cards = new Map<string, Card>();
  private readonly grids: Record<Tab, HTMLDivElement>;
  private readonly tabButtons: Record<Tab, HTMLElement>;
  private tab: Tab = 'rod';
  private lastKey = '';
  /** The rod bench learns how the panel closed (walked off, or dismissed while still on the pad). */
  onClosed: ((reason: CloseReason) => void) | null = null;

  constructor(
    overlay: HTMLElement,
    private readonly onBuy: (kind: UpgradeKind, id: string) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'upgrade-panel';
    this.root.innerHTML = `<div class="panel-grip"></div><div class="panel-head"><div class="panel-title">${t('benchTitle')}</div><button class="panel-x" aria-label="${t('creatorClose')}">×</button></div>
      <div class="panel-tabs"><button data-tab="rod">${t('tabRod')}</button><button data-tab="stations">${t('tabStations')}</button><button data-tab="time">${t('tabTime')}</button></div>
      <div class="upgrade-grid" data-tab="rod"></div><div class="upgrade-grid" data-tab="stations"></div><div class="upgrade-grid" data-tab="time"></div>`;
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.grids = { rod: q('.upgrade-grid[data-tab="rod"]'), stations: q('.upgrade-grid[data-tab="stations"]'), time: q('.upgrade-grid[data-tab="time"]') };
    this.tabButtons = { rod: q('button[data-tab="rod"]'), stations: q('button[data-tab="stations"]'), time: q('button[data-tab="time"]') };
    for (const tab of ['rod', 'stations', 'time'] as const) onTap(this.tabButtons[tab], () => this.showTab(tab));
    for (const u of UpgradeList) this.addCard('rod', u.id, ICONS[u.id], u.name[getLang()], this.grids.rod);
    for (const u of StationUpgradeList) this.addCard('station', u.id, STATION_ICONS[u.id], u.name[getLang()], this.grids[u.tab]);
    this.showTab('rod');
    onTap(q('.panel-x'), () => panels.close('bench', 'button'));
    overlay.appendChild(this.root);
    // Contextual (GDD §23): opens on the bench pad; the manager closes it when the player leaves the pad.
    panels.register({
      id: 'bench',
      kind: 'contextual',
      root: this.root,
      show: () => this.root.classList.add('open'),
      hide: () => this.root.classList.remove('open'),
      onClose: (reason) => this.onClosed?.(reason),
    });
  }

  private addCard(kind: UpgradeKind, id: string, icon: string, name: string, grid: HTMLDivElement): void {
    const root = document.createElement('div');
    root.className = 'upgrade-card';
    root.dataset.id = id;
    root.innerHTML = `<div class="up-head"><div class="up-icon">${icon}</div>
        <div class="up-titles"><div class="up-name">${name}</div><div class="up-level"></div></div></div>
      <div class="up-pips"></div>
      <div class="up-effect"></div><div class="up-extra"></div>
      <div class="up-price"><span class="coin-icon small"></span><span class="up-price-value"></span></div>
      <div class="up-burst"></div>`;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.cards.set(`${kind}:${id}`, {
      root,
      level: q('.up-level'),
      pips: q('.up-pips'),
      effect: q('.up-effect'),
      extra: q('.up-extra'),
      price: q('.up-price'),
      priceValue: q('.up-price-value'),
    });
    // pointerup (not click): the game blocks quick double-tap touchends, which would swallow clicks.
    let downOnCard = false;
    root.addEventListener('pointerdown', (e) => {
      downOnCard = true;
      root.classList.add('pressed');
      e.stopPropagation();
    });
    const cancel = () => {
      downOnCard = false;
      root.classList.remove('pressed');
    };
    root.addEventListener('pointerleave', cancel);
    root.addEventListener('pointercancel', cancel);
    root.addEventListener('pointerup', () => {
      root.classList.remove('pressed');
      if (downOnCard && this.opened) this.onBuy(kind, id);
      downOnCard = false;
    });
    grid.appendChild(root);
  }

  private showTab(tab: Tab): void {
    this.tab = tab;
    for (const k of ['rod', 'stations', 'time'] as const) {
      this.grids[k].classList.toggle('hidden', k !== tab);
      this.tabButtons[k].classList.toggle('on', k === tab);
    }
  }

  get opened(): boolean {
    return panels.isOpen('bench');
  }

  /** `valid`: the player is still on the pad. False when a modal is open (the bench waits). */
  open(state: GameState, valid: () => boolean): boolean {
    if (this.opened) return true;
    return panels.open('bench', {
      valid,
      run: () => {
        this.lastKey = '';
        this.refresh(state);
      },
    });
  }

  /** Re-renders levels, effects, prices and affordability when something changed. */
  refresh(state: GameState): void {
    const key = `${state.coins}|${Object.values(state.upgrades).join('')}|${Object.values(state.stationUpgrades).join('')}|${state.unlocked.length}|${this.tab}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    for (const u of UpgradeList) {
      const lv = state.upgrades[u.id];
      const cost = upgradeCost(u.id, lv);
      const unlocksHalibut = u.id === 'bait' && cost !== null && lv + 1 === FishById.halibut.baitLevel;
      this.render(this.cards.get(`rod:${u.id}`) as Card, lv, cost, state.coins, effectText(u.id, lv), unlocksHalibut ? t('upgrade_baitHalibut') : '');
    }
    for (const u of StationUpgradeList) {
      const card = this.cards.get(`station:${u.id}`) as Card;
      const visible = stationUpgradeVisible(state, u);
      card.root.classList.toggle('hidden', !visible);
      if (!visible) continue;
      const lv = state.stationUpgrades[u.id];
      this.render(card, lv, stationUpgradeCost(u.id, lv), state.coins, stationEffectText(u, lv), '');
    }
  }

  private render(card: Card, lv: number, cost: number | null, coins: number, effect: string, extra: string): void {
    card.level.textContent = tf('level', { n: lv, max: UpgradeMaxLevel });
    card.pips.innerHTML = Array.from({ length: UpgradeMaxLevel }, (_, i) => `<span class="${i < lv ? 'on' : ''}"></span>`).join('');
    card.effect.textContent = effect;
    card.extra.textContent = extra;
    card.root.classList.toggle('maxed', cost === null);
    card.root.classList.toggle('affordable', cost !== null && coins >= cost);
    if (cost === null) {
      card.price.innerHTML = t('maxed');
    } else {
      if (!card.price.contains(card.priceValue)) {
        card.price.innerHTML = '<span class="coin-icon small"></span>';
        card.price.appendChild(card.priceValue);
      }
      card.priceValue.textContent = String(cost);
    }
  }

  /** Little celebration on a card after a purchase. */
  celebrate(kind: UpgradeKind, id: string): void {
    const card = this.cards.get(`${kind}:${id}`);
    if (!card) return;
    card.root.classList.remove('bought');
    void card.root.offsetWidth;
    card.root.classList.add('bought');
    window.setTimeout(() => card.root.classList.remove('bought'), BenchFeel.celebrateMs);
  }

  /** Shakes a card the player cannot afford. */
  deny(kind: UpgradeKind, id: string): void {
    const card = this.cards.get(`${kind}:${id}`);
    if (!card) return;
    card.root.classList.remove('denied');
    void card.root.offsetWidth;
    card.root.classList.add('denied');
  }
}

function pct(v: number): number {
  return Math.round(v * 100);
}

function effectText(id: UpgradeId, lv: number): string {
  const now = upgradeValue(id, lv);
  const maxed = lv >= UpgradeMaxLevel;
  const next = upgradeValue(id, lv + 1);
  switch (id) {
    case 'line':
      return maxed ? tf('upgrade_line_max', { a: pct(now) }) : tf('upgrade_line', { a: pct(now), b: pct(next) });
    case 'reel':
      return maxed ? tf('upgrade_reel_max', { a: pct(now) }) : tf('upgrade_reel', { a: pct(now), b: pct(next) });
    case 'bait':
      return maxed ? tf('upgrade_bait_max', { a: now.toFixed(1) }) : tf('upgrade_bait', { a: now.toFixed(1), b: next.toFixed(1) });
    case 'backpack':
      return maxed ? tf('upgrade_backpack_max', { a: now }) : tf('upgrade_backpack', { a: now, b: next });
  }
}

/** "Net interval 6 s → 5.4 s" style lines for station and time upgrades. */
function stationEffectText(def: StationUpgradeDef, lv: number): string {
  const now = stationUpgradeValue(def.id, lv);
  const base = def.values[0] as number;
  const fmt = (v: number) => {
    const n = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    switch (def.format) {
      case 'seconds':
        return tf('fmtSeconds', { v: n });
      case 'hours':
        return tf('fmtHours', { v: n });
      case 'percent':
        return tf('fmtPercent', { v: pct(v) });
      case 'percentOfBase':
        return tf('fmtPercent', { v: pct(v / base) });
      case 'coinsPerMin':
        return tf('fmtCoinsPerMin', { v: n });
      case 'coins':
        return tf('fmtCoins', { v: n });
      case 'count':
        return n;
    }
  };
  const label = def.label[getLang()];
  if (lv >= UpgradeMaxLevel) return `${label} ${fmt(now)}`;
  return `${label} ${fmt(now)} → ${fmt(stationUpgradeValue(def.id, lv + 1))}`;
}
