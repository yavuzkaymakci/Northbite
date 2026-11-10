import { Lighthouse } from '../content/harbor';
import { t, tf, type StringKey } from '../content/strings';
import { MarketFeel } from '../settings';
import type { GameState } from '../core/GameState';
import { lighthouseCost, lighthouseDone } from '../systems/VoyageLogic';
import { onTap } from './tap';
import { panels, type CloseReason } from './PanelManager';

/**
 * Lighthouse panel (GDD §25 C6), contextual: opens on the "Lighthouse" ring on the pier (no need to walk to the
 * island). Shows the five stages, the lantern parts in hand and the repair button (one part + coins per stage).
 */
export class LighthousePanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private key = '';
  private button: HTMLElement | null = null;
  private cost: number | null = null;
  onClosed: ((reason: CloseReason) => void) | null = null;
  onRepair: (() => void) | null = null;

  constructor(overlay: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'upgrade-panel market-panel lighthouse-panel';
    this.root.innerHTML = `<div class="panel-grip"></div><div class="panel-head"><div class="panel-title">${t('lighthouseTitle')}</div><button class="panel-x" aria-label="${t('creatorClose')}">×</button></div><div class="market-body"></div>`;
    this.body = this.root.querySelector('.market-body') as HTMLDivElement;
    onTap(this.root.querySelector('.panel-x') as HTMLElement, () => panels.close('lighthouse', 'button'));
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    overlay.appendChild(this.root);
    panels.register({
      id: 'lighthouse',
      kind: 'contextual',
      root: this.root,
      show: () => this.root.classList.add('open'),
      hide: () => this.root.classList.remove('open'),
      onClose: (reason) => this.onClosed?.(reason),
    });
  }

  get opened(): boolean {
    return panels.isOpen('lighthouse');
  }

  open(state: GameState, valid: () => boolean): boolean {
    if (this.opened) return true;
    return panels.open('lighthouse', {
      valid,
      run: () => {
        this.key = '';
        this.refresh(state);
      },
    });
  }

  refresh(state: GameState, force = false): void {
    const h = state.harbor;
    const key = `${h.lighthouse}|${h.parts}`;
    if (force || key !== this.key) {
      this.key = key;
      this.build(state);
    }
    if (this.button && this.cost !== null) this.button.classList.toggle('affordable', state.coins >= this.cost && h.parts > 0);
  }

  private build(state: GameState): void {
    const h = state.harbor;
    const n = Lighthouse.stageCosts.length;
    const pips = Lighthouse.stageCosts.map((_, i) => `<span class="${i < h.lighthouse ? 'on' : ''}"></span>`).join('');
    this.cost = lighthouseCost(state);
    const done = lighthouseDone(state);
    const next = done ? '' : t(`lighthouseStage${h.lighthouse + 1}` as StringKey);
    this.body.innerHTML = `<div class="vp-status"><div class="vp-head">${tf('lighthouseProgress', { n: h.lighthouse, max: n })}</div>
      <div class="up-pips lh-pips">${pips}</div><div class="vp-time">${tf('lighthouseParts', { n: h.parts })}</div>
      <div class="vp-hint">${done ? t('lighthouseDoneInfo') : t('lighthousePartHint')}</div></div>
      ${
        done
          ? ''
          : `<div class="upgrade-card lh-card"><div class="up-name">${t('lighthouseRepair')}</div><div class="up-effect">${next}</div>
        <div class="up-price"><span class="coin-icon small"></span>${this.cost} · ${t('lighthousePartCost')}</div></div>`
      }`;
    this.button = this.body.querySelector('.lh-card');
    if (this.button) onTap(this.button, () => this.onRepair?.());
  }

  deny(): void {
    const el = this.button;
    if (!el) return;
    el.classList.remove('denied');
    void el.offsetWidth;
    el.classList.add('denied');
    window.setTimeout(() => el.classList.remove('denied'), MarketFeel.celebrateMs);
  }
}

/** "Season 1 complete" card (GDD §25): the lighthouse shines; the Far Island waits ("Coming soon…"). */
export class SeasonCard {
  private readonly el: HTMLDivElement;

  constructor(overlay: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'day-summary season-card';
    onTap(this.el, () => panels.close('season', 'button'));
    overlay.appendChild(this.el);
    panels.register({
      id: 'season',
      kind: 'card',
      root: this.el,
      show: () => {
        this.el.classList.remove('show');
        void this.el.offsetWidth;
        this.el.classList.add('show');
      },
      hide: () => this.el.classList.remove('show'),
    });
  }

  show(): void {
    panels.showCard('season', () => {
      this.el.innerHTML = `<div class="ds-title">${t('seasonTitle')}</div><div class="season-text">${t('seasonText')}</div>
        <div class="season-teaser">${t('seasonTeaser')}</div><div class="season-tap">${t('seasonTap')}</div>`;
    });
  }
}
