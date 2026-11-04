import { getLang, t, tf } from '../content/strings';
import { FishById } from '../content/fish';
import { UpgradeList, UpgradeMaxLevel, type UpgradeId } from '../content/upgrades';
import { BenchFeel } from '../settings';
import type { GameState } from '../core/GameState';
import { upgradeCost, upgradeValue } from '../systems/Upgrades';

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
 * Bottom sheet with one big card per rod upgrade (GDD §4.2). The game's first button UI: the whole card is the
 * button. Opens while the player stands on the rod bench pad.
 */
export class UpgradePanel {
  private readonly root: HTMLDivElement;
  private readonly cards = new Map<UpgradeId, Card>();
  private isOpen = false;
  private lastKey = '';

  constructor(
    overlay: HTMLElement,
    private readonly onBuy: (id: UpgradeId) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'upgrade-panel';
    this.root.innerHTML = `<div class="panel-grip"></div><div class="panel-title">${t('benchTitle')}</div><div class="upgrade-grid"></div>`;
    const grid = this.root.querySelector('.upgrade-grid') as HTMLDivElement;
    for (const u of UpgradeList) {
      const root = document.createElement('div');
      root.className = 'upgrade-card';
      root.dataset.id = u.id;
      root.innerHTML = `<div class="up-head"><div class="up-icon">${ICONS[u.id]}</div>
          <div class="up-titles"><div class="up-name">${u.name[getLang()]}</div><div class="up-level"></div></div></div>
        <div class="up-pips"></div>
        <div class="up-effect"></div><div class="up-extra"></div>
        <div class="up-price"><span class="coin-icon small"></span><span class="up-price-value"></span></div>
        <div class="up-burst"></div>`;
      const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
      this.cards.set(u.id, {
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
      root.addEventListener('pointerleave', () => {
        downOnCard = false;
        root.classList.remove('pressed');
      });
      root.addEventListener('pointerup', () => {
        root.classList.remove('pressed');
        if (downOnCard && this.isOpen) this.onBuy(u.id);
        downOnCard = false;
      });
      grid.appendChild(root);
    }
    overlay.appendChild(this.root);
  }

  get opened(): boolean {
    return this.isOpen;
  }

  open(state: GameState): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.lastKey = '';
    this.refresh(state);
    this.root.classList.add('open');
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('open');
  }

  /** Re-renders levels, effects, prices and affordability when something changed. */
  refresh(state: GameState): void {
    const key = `${state.coins}|${state.upgrades.line}${state.upgrades.reel}${state.upgrades.bait}${state.upgrades.backpack}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    for (const u of UpgradeList) {
      const card = this.cards.get(u.id) as Card;
      const lv = state.upgrades[u.id];
      const cost = upgradeCost(u.id, lv);
      card.level.textContent = tf('level', { n: lv, max: UpgradeMaxLevel });
      card.pips.innerHTML = Array.from({ length: UpgradeMaxLevel }, (_, i) => `<span class="${i < lv ? 'on' : ''}"></span>`).join('');
      card.effect.textContent = effectText(u.id, lv);
      const unlocksHalibut = u.id === 'bait' && cost !== null && lv + 1 === FishById.halibut.baitLevel;
      card.extra.textContent = unlocksHalibut ? t('upgrade_baitHalibut') : '';
      card.root.classList.toggle('maxed', cost === null);
      card.root.classList.toggle('affordable', cost !== null && state.coins >= cost);
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
  }

  /** Little celebration on a card after a purchase. */
  celebrate(id: UpgradeId): void {
    const card = this.cards.get(id);
    if (!card) return;
    card.root.classList.remove('bought');
    void card.root.offsetWidth;
    card.root.classList.add('bought');
    window.setTimeout(() => card.root.classList.remove('bought'), BenchFeel.celebrateMs);
  }

  /** Shakes a card the player cannot afford. */
  deny(id: UpgradeId): void {
    const card = this.cards.get(id);
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
