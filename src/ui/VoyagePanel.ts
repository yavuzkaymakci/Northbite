import { BoatUpgradeList, SealRoleById, type BoatUpgradeDef, type BoatUpgradeId } from '../content/harbor';
import { Destinations, type DestinationId } from '../content/voyages';
import { getLang, t, tf } from '../content/strings';
import { MarketFeel } from '../settings';
import type { GameState } from '../core/GameState';
import {
  autoVoyageUnlocked,
  boatLevel,
  boatUpgradeCost,
  boatUpgradeValue,
  crewAboard,
  crewSlots,
  destinationOpen,
  sealName,
  voyageCost,
  voyageDuration,
  voyagePhase,
} from '../systems/VoyageLogic';
import { Boat } from '../content/harbor';
import { DestinationById } from '../content/voyages';
import { sealPortrait } from './MarketPanel';
import { onTap } from './tap';
import { panels, type CloseReason } from './PanelManager';

type Tab = 'trips' | 'boat';

export interface VoyageActions {
  depart: (id: DestinationId) => void;
  crew: (sealId: number) => void;
  auto: () => void;
  upgrade: (id: BoatUpgradeId) => void;
}

const mmss = (sec: number) => {
  const s = Math.max(Math.ceil(sec), 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** "Now → next" text of a boat upgrade card. */
function upgradeText(u: BoatUpgradeDef, level: number): string {
  const f = (v: number) => (u.format === 'percentTime' ? `%${Math.round(v * 100)}` : u.format === 'risk' ? `%${Math.round(v * 100)}` : String(v));
  const now = f(boatUpgradeValue(u.id, level));
  return level >= 5 ? now : `${now} → ${f(boatUpgradeValue(u.id, level + 1))}`;
}

/**
 * Voyage panel (GDD §25), contextual: opens on the voyage point ring at the pier end and closes when the player walks
 * off (panel manager). Tabs Voyages | Boat. Rebuilt only when its structure changes; the time left, coins and button
 * states update in place so taps are never lost.
 */
export class VoyagePanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly tabButtons: Record<Tab, HTMLElement>;
  private tab: Tab = 'trips';
  private structureKey = '';
  private status: HTMLElement | null = null;
  private bar: HTMLElement | null = null;
  private destRefs: Array<{ id: DestinationId; card: HTMLElement; button: HTMLButtonElement; cost: number }> = [];
  private upRefs: Array<{ id: BoatUpgradeId; card: HTMLElement; cost: number | null }> = [];
  onClosed: ((reason: CloseReason) => void) | null = null;
  actions: VoyageActions | null = null;

  constructor(overlay: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'upgrade-panel market-panel voyage-panel';
    this.root.innerHTML = `<div class="panel-grip"></div><div class="panel-head"><div class="panel-title">${t('voyageTitle')}</div><button class="panel-x" aria-label="${t('creatorClose')}">×</button></div>
      <div class="panel-tabs"><button data-tab="trips">${t('tabVoyages')}</button><button data-tab="boat">${t('tabBoat')}</button></div>
      <div class="market-body"></div>`;
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.body = q('.market-body');
    this.tabButtons = { trips: q('button[data-tab="trips"]'), boat: q('button[data-tab="boat"]') };
    for (const tab of ['trips', 'boat'] as const) {
      onTap(this.tabButtons[tab], () => {
        this.tab = tab;
        this.structureKey = '';
      });
    }
    onTap(q('.panel-x'), () => panels.close('voyage', 'button'));
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    overlay.appendChild(this.root);
    panels.register({
      id: 'voyage',
      kind: 'contextual',
      root: this.root,
      show: () => this.root.classList.add('open'),
      hide: () => this.root.classList.remove('open'),
      onClose: (reason) => this.onClosed?.(reason),
    });
  }

  get opened(): boolean {
    return panels.isOpen('voyage');
  }

  open(state: GameState, valid: () => boolean): boolean {
    if (this.opened) return true;
    return panels.open('voyage', {
      valid,
      run: () => {
        this.structureKey = '';
        this.refresh(state);
      },
    });
  }

  refresh(state: GameState, force = false): void {
    const h = state.harbor;
    const key = JSON.stringify([
      this.tab,
      voyagePhase(state),
      h.voyage?.dest ?? '',
      h.voyages,
      h.seals.map((s) => s.id),
      h.crew,
      h.upgrades,
      h.auto,
      autoVoyageUnlocked(state),
      getLang(),
    ]);
    if (force || key !== this.structureKey) {
      this.structureKey = key;
      for (const k of ['trips', 'boat'] as const) this.tabButtons[k].classList.toggle('on', k === this.tab);
      this.body.innerHTML = '';
      this.destRefs = [];
      this.upRefs = [];
      this.status = null;
      this.bar = null;
      if (this.tab === 'trips') this.buildTrips(state);
      else this.buildBoat(state);
    }
    this.updateLive(state);
  }

  private buildTrips(state: GameState): void {
    const lang = getLang();
    const h = state.harbor;
    const phase = voyagePhase(state);
    // Status: ready / at sea (time left, event) / back (what came back).
    const box = document.createElement('div');
    box.className = 'vp-status';
    let head = t('voyageReady');
    if (phase === 'out' && h.voyage) {
      const ev = h.voyage.event ? ` · ${t(`voyageEventShort_${h.voyage.event}` as 'voyageEventShort_storm')}` : '';
      head = `${tf('voyageOut', { d: DestinationById[h.voyage.dest].name[lang] })}${ev}`;
    } else if (phase === 'returned' && h.returned) {
      head = tf('voyageBackLine', { n: h.returned.fish, c: h.returned.coins });
    }
    box.innerHTML = `<div class="vp-head">${head}</div><div class="vp-time"></div><div class="vp-bar"><span></span></div>`;
    this.status = box.querySelector('.vp-time');
    this.bar = box.querySelector('.vp-bar span');
    (box.querySelector('.vp-bar') as HTMLElement).hidden = phase !== 'out';
    this.body.appendChild(box);

    // Crew: seals picked for the next voyage.
    const crew = document.createElement('div');
    crew.className = 'vp-crew';
    const aboard = crewAboard(state).map((s) => s.id);
    crew.innerHTML = `<span class="vp-label">${tf('voyageCrew', { n: aboard.length, max: crewSlots(state) })}</span>`;
    if (h.seals.length === 0) crew.innerHTML += `<span class="vp-hint">${t('voyageNoSeals')}</span>`;
    for (const s of h.seals) {
      const chip = document.createElement('button');
      chip.className = `mr-chip vp-seal${aboard.includes(s.id) ? ' on' : ''}`;
      chip.innerHTML = `${sealPortrait(s.scarf)}<span>${sealName(s, lang)} · ${SealRoleById[s.role].name[lang]}</span>`;
      chip.disabled = phase === 'out';
      onTap(chip, () => this.actions?.crew(s.id));
      crew.appendChild(chip);
    }
    this.body.appendChild(crew);

    if (autoVoyageUnlocked(state)) {
      const auto = document.createElement('button');
      auto.className = `mr-chip vp-auto${h.auto ? ' on' : ''}`;
      auto.textContent = h.auto ? t('voyageAutoOn') : t('voyageAutoOff');
      onTap(auto, () => this.actions?.auto());
      this.body.appendChild(auto);
    } else {
      const hint = document.createElement('div');
      hint.className = 'vp-hint';
      hint.textContent = tf('voyageAutoLocked', { n: Boat.autoLevel });
      this.body.appendChild(hint);
    }

    const list = document.createElement('div');
    list.className = 'market-list';
    for (const d of Destinations) {
      const open = destinationOpen(state, d);
      const card = document.createElement('div');
      card.className = `market-card vp-dest${open ? '' : ' locked'}`;
      const lock = d.unlockAfter === null ? t('voyageSoon') : tf('voyageUnlockAfter', { n: d.unlockAfter - h.voyages });
      const cost = voyageCost(d);
      card.innerHTML = `<div class="vp-icon vp-${d.id}"></div>
        <div class="mc-text"><b class="mc-name">${d.name[lang]}</b><span class="mc-role">${tf('voyageDuration', { t: mmss(voyageDuration(state, d)) })}</span>
        <span class="mc-info">${open ? d.info[lang] : lock}</span></div>
        <button class="mc-buy"${open ? '' : ' disabled'}><span class="mc-price"><span class="coin-icon small"></span>${cost}</span><span class="mc-label">${open ? t('voyageGo') : t('voyageLockedShort')}</span></button>`;
      const button = card.querySelector('.mc-buy') as HTMLButtonElement;
      if (open) onTap(button, () => this.actions?.depart(d.id));
      this.destRefs.push({ id: d.id, card, button, cost });
      list.appendChild(card);
    }
    this.body.appendChild(list);
  }

  private buildBoat(state: GameState): void {
    const lang = getLang();
    const head = document.createElement('div');
    head.className = 'vp-status';
    head.innerHTML = `<div class="vp-head">${tf('boatLevel', { n: boatLevel(state) })}</div><div class="vp-hint">${tf('boatLevelHint', { n: Boat.autoLevel })}</div>`;
    this.body.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'upgrade-grid vp-upgrades';
    for (const u of BoatUpgradeList) {
      const level = state.harbor.upgrades[u.id];
      const cost = boatUpgradeCost(u.id, level);
      const card = document.createElement('div');
      card.className = `upgrade-card${cost === null ? ' maxed' : ''}`;
      const pips = [1, 2, 3, 4, 5].map((i) => `<span class="${i <= level ? 'on' : ''}"></span>`).join('');
      card.innerHTML = `<div class="up-name">${u.name[lang]}</div><div class="up-pips">${pips}</div>
        <div class="up-effect">${u.label[lang]}: ${upgradeText(u, level)}</div>
        <div class="up-price">${cost === null ? t('maxed') : `<span class="coin-icon small"></span>${cost}`}</div>`;
      if (cost !== null) onTap(card, () => this.actions?.upgrade(u.id));
      this.upRefs.push({ id: u.id, card, cost });
      grid.appendChild(card);
    }
    this.body.appendChild(grid);
  }

  private updateLive(state: GameState): void {
    const h = state.harbor;
    const v = h.voyage;
    if (this.status) this.status.textContent = v ? tf('voyageLeft', { t: mmss(v.left) }) : '';
    if (this.bar && v) this.bar.style.width = `${Math.round((1 - v.left / v.total) * 100)}%`;
    const busy = !!v;
    for (const r of this.destRefs) {
      if (r.button.disabled && !r.card.classList.contains('locked')) r.button.disabled = false;
      r.button.classList.toggle('affordable', !busy && state.coins >= r.cost && !r.card.classList.contains('locked'));
      r.button.classList.toggle('full', busy);
    }
    for (const u of this.upRefs) if (u.cost !== null) u.card.classList.toggle('affordable', state.coins >= u.cost);
  }

  denyDest(id: DestinationId): void {
    const r = this.destRefs.find((d) => d.id === id);
    if (r) shake(r.card);
  }

  deny(id: BoatUpgradeId): void {
    const r = this.upRefs.find((u) => u.id === id);
    if (r) shake(r.card);
  }
}

function shake(el: HTMLElement): void {
  el.classList.remove('denied');
  void el.offsetWidth;
  el.classList.add('denied');
  window.setTimeout(() => el.classList.remove('denied'), MarketFeel.celebrateMs);
}
