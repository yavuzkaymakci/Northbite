import { Hut, PenguinLevels, TraitById } from '../content/penguins';
import { RoleById, type RoleId } from '../content/roles';
import { getLang, t, tf } from '../content/strings';
import { MarketFeel } from '../settings';
import type { GameState, PenguinLook, WorkerData } from '../core/GameState';
import { HeadwearColors, ScarfColors, toCss } from '../render/Palette';
import { availableRoles, hutCapacity, hutUpgradeCost, levelProgress, offerPrice, penguinName, roleChangeFee } from '../systems/PenguinLogic';
import { SealRoleById } from '../content/harbor';
import { crewSlots, sealName, sealPrice, sealRoom, sealsOpen } from '../systems/VoyageLogic';
import { onTap } from './tap';
import { panels, type CloseReason } from './PanelManager';

type Tab = 'catalog' | 'mine' | 'hut' | 'seals';

export interface MarketActions {
  buy: (offerId: number) => void;
  reroll: () => void;
  role: (penguinId: number, role: RoleId) => void;
  hut: () => void;
  /** Seal tab (GDD §25 C4): buy a seal, refresh the seal offers. */
  buySeal: (offerId: number) => void;
  rerollSeals: () => void;
}

/** Small seal portrait (SVG): round grey head, whiskers, scarf in its colour. */
export function sealPortrait(scarf: number): string {
  const c = toCss(ScarfColors[scarf % ScarfColors.length] as number);
  return `<svg class="pg-portrait seal" viewBox="0 0 48 48" aria-hidden="true">
    <ellipse cx="24" cy="34" rx="15" ry="11" fill="var(--seal)"/>
    <circle cx="24" cy="20" r="11" fill="var(--seal)"/>
    <ellipse cx="24" cy="24" rx="6.5" ry="4.5" fill="var(--seal-belly)"/>
    <circle cx="20" cy="18" r="1.4" fill="var(--eye)"/><circle cx="28" cy="18" r="1.4" fill="var(--eye)"/>
    <circle cx="24" cy="22" r="1.5" fill="var(--eye)"/>
    <path d="M17 24 h-6 M17 26 h-5 M31 24 h6 M31 26 h5" stroke="var(--seal-belly)" stroke-width="0.8"/>
    <rect x="14" y="29" width="20" height="4" rx="2" fill="${c}"/></svg>`;
}

const mmss = (sec: number) => {
  const s = Math.max(Math.ceil(sec), 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Small penguin portrait drawn from its look (SVG, no renderer): body, belly, beak, scarf and beanie. */
export function penguinPortrait(look: PenguinLook): string {
  const scarf = toCss(ScarfColors[look.scarf % ScarfColors.length] as number);
  const hat =
    look.hat >= 0
      ? `<path d="M14 14 a10 9 0 0 1 20 0 z" fill="${toCss(HeadwearColors[look.hat % HeadwearColors.length] as number)}"/><rect x="13" y="12.5" width="22" height="3.5" rx="1.7" fill="${toCss(HeadwearColors[look.hat % HeadwearColors.length] as number)}"/><circle cx="24" cy="4.6" r="2.6" fill="var(--snow)"/>`
      : '';
  return `<svg class="pg-portrait" viewBox="0 0 48 48" aria-hidden="true">
    <ellipse cx="24" cy="33" rx="13" ry="13.5" fill="var(--penguin-back)"/>
    <ellipse cx="24" cy="35" rx="8.5" ry="10" fill="var(--penguin-belly)"/>
    <circle cx="24" cy="17" r="9.5" fill="var(--penguin-back)"/>
    <ellipse cx="24" cy="18.5" rx="6.4" ry="5.6" fill="var(--penguin-belly)"/>
    <circle cx="21" cy="17" r="1.3" fill="var(--eye)"/><circle cx="27" cy="17" r="1.3" fill="var(--eye)"/>
    <path d="M22 19.5 h4 l-2 3.2 z" fill="var(--penguin-beak)"/>
    <rect x="14.5" y="24.5" width="19" height="4" rx="2" fill="${scarf}"/><rect x="28" y="26" width="3.6" height="8" rx="1.5" fill="${scarf}"/>
    ${hat}</svg>`;
}

interface OfferRefs {
  id: number;
  card: HTMLElement;
  button: HTMLButtonElement;
  price: HTMLElement;
  cost: number;
}

/**
 * Penguin Market panel (GDD §24), contextual (opens on the stall pad, closes when the player walks off): tabs
 * Catalog | My penguins | Hut. The structure is rebuilt only when offers, penguins, roles or the hut change; coins,
 * timers and experience bars update in place, so a tap is never lost to a re-render.
 */
export class MarketPanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly tabButtons: Record<Tab, HTMLElement>;
  private tab: Tab = 'catalog';
  private structureKey = '';
  /** Penguin whose role chips are open. */
  private roleOpen = -1;
  private offerRefs: OfferRefs[] = [];
  private refreshBtn: HTMLButtonElement | null = null;
  private xpBars: Array<{ w: WorkerData; bar: HTMLElement }> = [];
  private roleChips: Array<{ el: HTMLButtonElement }> = [];
  private hutBtn: HTMLElement | null = null;
  private hutCost: number | null = null;
  onClosed: ((reason: CloseReason) => void) | null = null;
  actions: MarketActions | null = null;

  constructor(overlay: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'upgrade-panel market-panel';
    this.root.innerHTML = `<div class="panel-grip"></div><div class="panel-head"><div class="panel-title">${t('marketTitle')}</div><button class="panel-x" aria-label="${t('creatorClose')}">×</button></div>
      <div class="panel-tabs"><button data-tab="catalog">${t('tabCatalog')}</button><button data-tab="mine">${t('tabMyPenguins')}</button><button data-tab="hut">${t('tabHut')}</button><button data-tab="seals" hidden>${t('tabSeals')}</button></div>
      <div class="market-body"></div>`;
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.body = q('.market-body');
    this.tabButtons = { catalog: q('button[data-tab="catalog"]'), mine: q('button[data-tab="mine"]'), hut: q('button[data-tab="hut"]'), seals: q('button[data-tab="seals"]') };
    for (const tab of ['catalog', 'mine', 'hut', 'seals'] as const) {
      onTap(this.tabButtons[tab], () => {
        this.tab = tab;
        this.roleOpen = -1;
        this.structureKey = '';
      });
    }
    onTap(q('.panel-x'), () => panels.close('market', 'button'));
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    overlay.appendChild(this.root);
    panels.register({
      id: 'market',
      kind: 'contextual',
      root: this.root,
      show: () => this.root.classList.add('open'),
      hide: () => this.root.classList.remove('open'),
      onClose: (reason) => {
        this.roleOpen = -1;
        this.onClosed?.(reason);
      },
    });
  }

  get opened(): boolean {
    return panels.isOpen('market');
  }

  open(state: GameState, valid: () => boolean): boolean {
    if (this.opened) return true;
    return panels.open('market', {
      valid,
      run: () => {
        this.structureKey = '';
        this.refresh(state);
      },
    });
  }

  /** Rebuilds when the structure changed (or `force`), then updates coins, timers and bars in place. */
  refresh(state: GameState, force = false): void {
    const key = JSON.stringify([
      this.tab,
      this.roleOpen,
      state.market.offers.map((o) => o.id),
      state.workers.map((w) => [w.id, w.role, w.level]),
      state.hutLevel,
      availableRoles(state).length,
      getLang(),
      sealsOpen(state),
      state.harbor.sealMarket.offers.map((o) => o.id),
      state.harbor.seals.map((s) => s.id),
      crewSlots(state),
    ]);
    if (force || key !== this.structureKey) {
      this.structureKey = key;
      // The seal tab shows once the boat is repaired (GDD §25).
      this.tabButtons.seals.hidden = !sealsOpen(state);
      if (this.tab === 'seals' && !sealsOpen(state)) this.tab = 'catalog';
      for (const k of ['catalog', 'mine', 'hut', 'seals'] as const) this.tabButtons[k].classList.toggle('on', k === this.tab);
      this.build(state);
    }
    this.updateLive(state);
  }

  private build(state: GameState): void {
    this.body.innerHTML = '';
    this.offerRefs = [];
    this.xpBars = [];
    this.roleChips = [];
    this.refreshBtn = null;
    this.hutBtn = null;
    this.sealRefs = [];
    if (this.tab === 'catalog') this.buildCatalog(state);
    else if (this.tab === 'mine') this.buildMine(state);
    else if (this.tab === 'seals') this.buildSeals(state);
    else this.buildHut(state);
  }

  /** Seal tab: today's seals (same catalog idea as penguins) and the crew; seals need crew places, not hut room. */
  private buildSeals(state: GameState): void {
    const lang = getLang();
    const h = state.harbor;
    const head = document.createElement('div');
    head.className = 'market-head';
    head.innerHTML = `<span class="market-cap seal-cap"></span><button class="market-refresh"></button>`;
    this.refreshBtn = head.querySelector('.market-refresh') as HTMLButtonElement;
    onTap(this.refreshBtn, () => this.actions?.rerollSeals());
    this.body.appendChild(head);
    const list = document.createElement('div');
    list.className = 'market-list';
    if (h.sealMarket.offers.length === 0) list.innerHTML = `<div class="market-empty">${t('marketEmpty')}</div>`;
    for (const o of h.sealMarket.offers) {
      const role = SealRoleById[o.role];
      const card = document.createElement('div');
      card.className = 'market-card';
      card.innerHTML = `${sealPortrait(o.scarf)}
        <div class="mc-text"><b class="mc-name">${sealName(o, lang)}</b><span class="mc-role">${role.name[lang]}</span><span class="mc-info">${role.info[lang]}</span></div>
        <button class="mc-buy"><span class="mc-price"><span class="coin-icon small"></span><span class="mc-cost"></span></span><span class="mc-label"></span></button>`;
      const button = card.querySelector('.mc-buy') as HTMLButtonElement;
      onTap(button, () => this.actions?.buySeal(o.id));
      this.sealRefs.push({ id: o.id, card, button, price: card.querySelector('.mc-cost') as HTMLElement, cost: sealPrice(state, o.role) });
      list.appendChild(card);
    }
    for (const s of h.seals) {
      const row = document.createElement('div');
      row.className = 'market-card mine';
      row.innerHTML = `${sealPortrait(s.scarf)}<div class="mc-text"><b class="mc-name">${sealName(s, lang)}</b><span class="mc-role">${SealRoleById[s.role].name[lang]}</span><span class="mc-info">${SealRoleById[s.role].info[lang]}</span></div>`;
      list.appendChild(row);
    }
    this.body.appendChild(list);
  }

  private sealRefs: OfferRefs[] = [];

  /** Shakes a seal offer the player cannot buy now. */
  denySeal(offerId: number): void {
    const r = this.sealRefs.find((o) => o.id === offerId);
    if (r) shake(r.card);
  }

  private buildCatalog(state: GameState): void {
    const lang = getLang();
    const head = document.createElement('div');
    head.className = 'market-head';
    head.innerHTML = `<span class="market-cap"></span><button class="market-refresh"></button>`;
    this.refreshBtn = head.querySelector('.market-refresh') as HTMLButtonElement;
    onTap(this.refreshBtn, () => this.actions?.reroll());
    this.body.appendChild(head);
    const list = document.createElement('div');
    list.className = 'market-list';
    if (state.market.offers.length === 0) list.innerHTML = `<div class="market-empty">${t('marketEmpty')}</div>`;
    for (const o of state.market.offers) {
      const role = RoleById[o.role];
      const trait = TraitById[o.trait];
      const card = document.createElement('div');
      card.className = 'market-card';
      card.innerHTML = `${penguinPortrait(o.look)}
        <div class="mc-text"><b class="mc-name">${penguinName(o, lang)}</b><span class="mc-role">${role.name[lang]}</span>
        <span class="mc-info">${role.info[lang]}</span><span class="mc-trait">${trait.name[lang]} · ${trait.info[lang]}</span></div>
        <button class="mc-buy"><span class="mc-price"><span class="coin-icon small"></span><span class="mc-cost"></span></span><span class="mc-label"></span></button>`;
      const button = card.querySelector('.mc-buy') as HTMLButtonElement;
      onTap(button, () => this.actions?.buy(o.id));
      this.offerRefs.push({ id: o.id, card, button, price: card.querySelector('.mc-cost') as HTMLElement, cost: offerPrice(state, o) });
      list.appendChild(card);
    }
    this.body.appendChild(list);
  }

  private buildMine(state: GameState): void {
    const lang = getLang();
    const list = document.createElement('div');
    list.className = 'market-list';
    if (state.workers.length === 0) list.innerHTML = `<div class="market-empty">${t('marketNoPenguins')}</div>`;
    const roles = availableRoles(state);
    for (const w of state.workers) {
      const row = document.createElement('div');
      row.className = 'market-card mine';
      const maxed = w.level >= PenguinLevels.max;
      row.innerHTML = `${penguinPortrait(w.look)}
        <div class="mc-text"><b class="mc-name">${penguinName(w, lang)}</b><span class="mc-role">${RoleById[w.role].name[lang]} · ${tf('penguinLevel', { n: w.level })}</span>
        <span class="mc-trait">${TraitById[w.trait].name[lang]} · ${TraitById[w.trait].info[lang]}</span>
        <span class="mc-xp${maxed ? ' max' : ''}"><span class="mc-xp-fill"></span></span></div>
        <button class="mc-role-btn">${t('roleChange')}</button>`;
      this.xpBars.push({ w, bar: row.querySelector('.mc-xp-fill') as HTMLElement });
      onTap(row.querySelector('.mc-role-btn') as HTMLElement, () => {
        this.roleOpen = this.roleOpen === w.id ? -1 : w.id;
      });
      list.appendChild(row);
      if (this.roleOpen === w.id) {
        const chips = document.createElement('div');
        chips.className = 'market-roles';
        chips.innerHTML = `<span class="mr-fee">${tf('roleChangeFee', { c: roleChangeFee() })}</span>`;
        for (const r of roles) {
          const chip = document.createElement('button');
          chip.className = `mr-chip${r === w.role ? ' on' : ''}`;
          chip.textContent = RoleById[r].name[lang];
          chip.disabled = r === w.role;
          onTap(chip, () => {
            if (r === w.role) return;
            this.roleOpen = -1;
            this.actions?.role(w.id, r);
          });
          this.roleChips.push({ el: chip });
          chips.appendChild(chip);
        }
        list.appendChild(chips);
      }
    }
    this.body.appendChild(list);
  }

  private buildHut(state: GameState): void {
    const cap = hutCapacity(state);
    const next = Hut.capacity[state.hutLevel];
    this.hutCost = hutUpgradeCost(state);
    const box = document.createElement('div');
    box.className = 'market-hut';
    const pips = Hut.capacity.map((_, i) => `<span class="${i < state.hutLevel ? 'on' : ''}"></span>`).join('');
    box.innerHTML = `<div class="mh-cap">${tf('hutCapacity', { n: state.workers.length, max: cap })}</div><div class="up-pips">${pips}</div>
      <div class="upgrade-card mh-card${this.hutCost === null ? ' maxed' : ''}"><div class="up-name">${t('hutUpgrade')}</div>
      <div class="up-effect">${next === undefined ? t('hutMax') : tf('hutUpgradeEffect', { a: cap, b: next })}</div>
      <div class="up-price">${this.hutCost === null ? t('maxed') : `<span class="coin-icon small"></span>${this.hutCost}`}</div></div>`;
    this.hutBtn = box.querySelector('.mh-card') as HTMLElement;
    if (this.hutCost !== null) onTap(this.hutBtn, () => this.actions?.hut());
    this.body.appendChild(box);
  }

  /** Coins, timers and bars: no rebuild. */
  private updateLive(state: GameState): void {
    const full = state.workers.length >= hutCapacity(state);
    const cap = this.body.querySelector('.market-cap');
    if (cap) cap.textContent = tf('hutCapacity', { n: state.workers.length, max: hutCapacity(state) });
    const sealCap = this.body.querySelector('.seal-cap');
    if (sealCap) sealCap.textContent = tf('sealCapacity', { n: state.harbor.seals.length, max: crewSlots(state) });
    const sealFull = sealRoom(state) <= 0;
    for (const r of this.sealRefs) {
      const offer = state.harbor.sealMarket.offers.find((o) => o.id === r.id);
      if (!offer) continue;
      r.cost = sealPrice(state, offer.role);
      r.price.textContent = String(r.cost);
      r.button.classList.toggle('affordable', !sealFull && state.coins >= r.cost);
      r.button.classList.toggle('full', sealFull);
      (r.button.querySelector('.mc-label') as HTMLElement).textContent = sealFull ? t('sealCrewFull') : t('marketBuy');
    }
    if (this.refreshBtn) {
      const wait = this.tab === 'seals' ? state.harbor.sealMarket.refreshIn : state.market.refreshIn;
      this.refreshBtn.textContent = wait > 0 ? tf('marketRefreshWait', { t: mmss(wait) }) : t('marketRefresh');
      this.refreshBtn.disabled = wait > 0;
    }
    for (const r of this.offerRefs) {
      const offer = state.market.offers.find((o) => o.id === r.id);
      if (!offer) continue;
      r.cost = offerPrice(state, offer);
      r.price.textContent = String(r.cost);
      r.button.classList.toggle('affordable', !full && state.coins >= r.cost);
      r.button.classList.toggle('full', full);
      (r.button.querySelector('.mc-label') as HTMLElement).textContent = full ? t('marketHutFull') : t('marketBuy');
    }
    for (const x of this.xpBars) x.bar.style.width = `${Math.round(levelProgress(x.w) * 100)}%`;
    const fee = roleChangeFee();
    for (const c of this.roleChips) c.el.classList.toggle('poor', state.coins < fee);
    if (this.hutBtn && this.hutCost !== null) this.hutBtn.classList.toggle('affordable', state.coins >= this.hutCost);
  }

  /** Shakes an offer the player cannot buy now. */
  deny(offerId: number): void {
    const r = this.offerRefs.find((o) => o.id === offerId);
    if (r) shake(r.card);
  }

  denyHut(): void {
    if (this.hutBtn) shake(this.hutBtn);
  }
}

function shake(el: HTMLElement): void {
  el.classList.remove('denied');
  void el.offsetWidth;
  el.classList.add('denied');
  window.setTimeout(() => el.classList.remove('denied'), MarketFeel.celebrateMs);
}
