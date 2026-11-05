import { FishById } from '../content/fish';
import { getLang, t, tf, type StringKey } from '../content/strings';
import type { GameState, Order } from '../core/GameState';
import { orderProgress } from '../systems/OrderLogic';
import { onTap } from './tap';
import { sfx } from '../audio/AudioEngine';

const mmss = (sec: number) => {
  const s = Math.max(Math.ceil(sec), 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Text of an order ("3 raw fish", "2 × Arctic char"...). */
export function orderText(o: Order): string {
  if (o.kind === 'species') return tf('order_species', { n: o.amount, name: FishById[o.species ?? 'capelin'].name[getLang()] });
  return tf(`order_${o.kind}` as StringKey, { n: o.amount });
}

/**
 * Order board panel (GDD §20): up to three order cards with what they ask for, time left, reward and progress, a
 * "Deliver" button (inactive with the missing amount when there is not enough), and the free "Swap" button. Opened by
 * walking up to the board; the HUD icon opens it from afar, where delivering is not possible.
 */
export class OrderPanel {
  private readonly root: HTMLDivElement;
  private readonly list: HTMLElement;
  private readonly swapHint: HTMLElement;
  private atBoard = false;
  private isOpenValue = false;
  private lastKey = '';

  constructor(
    overlay: HTMLElement,
    private readonly onDeliver: (id: number) => void,
    private readonly onSwap: (id: number) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'upgrade-panel order-panel';
    this.root.innerHTML = `<div class="panel-grip"></div><div class="panel-title">${t('boardTitle')}</div>
      <div class="order-swap-hint"></div><div class="order-list"></div><button class="settings-btn close order-close">${t('codexClose')}</button>`;
    this.list = this.root.querySelector('.order-list') as HTMLElement;
    this.swapHint = this.root.querySelector('.order-swap-hint') as HTMLElement;
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    onTap(this.root.querySelector('.order-close') as HTMLElement, () => this.close());
    overlay.appendChild(this.root);
  }

  get opened(): boolean {
    return this.isOpenValue;
  }

  /** `atBoard`: standing at the board (delivering works); otherwise a view from the HUD. */
  open(atBoard: boolean): void {
    if (this.isOpenValue && this.atBoard === atBoard) return;
    this.atBoard = atBoard;
    this.isOpenValue = true;
    this.lastKey = '';
    this.root.classList.add('open');
    this.root.classList.toggle('remote', !atBoard);
    sfx('panelOpen');
  }

  close(): void {
    this.isOpenValue = false;
    this.root.classList.remove('open');
    sfx('panelClose');
  }

  /** Redraws when something visible changed (orders, progress, timers in whole seconds). */
  refresh(state: GameState, visible: number): void {
    if (!this.isOpenValue) return;
    const o = state.orders;
    const progress = o.active.map((a) => orderProgress(state, a, visible));
    const key = JSON.stringify([o.active.map((a) => [a.id, Math.ceil(a.timeLeft)]), progress, o.refill.map(Math.ceil), Math.ceil(o.rerollIn), this.atBoard]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.swapHint.textContent = o.rerollIn > 0 ? tf('orderRerollWait', { t: mmss(o.rerollIn) }) : '';
    this.list.innerHTML = '';
    o.active.forEach((a, i) => {
      const p = progress[i] as { have: number; need: number };
      const ready = p.have >= p.need;
      const card = document.createElement('div');
      card.className = `order-card${ready ? ' ready' : ''}`;
      const extra = a.extra ? `<span class="order-extra">+ ${t(`extra_${a.extra}` as StringKey)}</span>` : '';
      const missing = a.kind === 'kg' ? Math.round((p.need - p.have) * 10) / 10 : p.need - p.have;
      const button = !this.atBoard ? t('orderGoToBoard') : ready ? t('orderDeliver') : tf('orderMissing', { n: missing });
      card.innerHTML = `
        <div class="order-top"><b class="order-what">${orderText(a)}</b><span class="order-time">${mmss(a.timeLeft)}</span></div>
        <div class="order-mid"><span class="order-reward"><span class="coin-icon small"></span>${a.reward}</span>${extra}<span class="order-have">${Math.min(p.have, p.need)}/${p.need}</span></div>
        <div class="order-actions"><button class="order-deliver"${ready && this.atBoard ? '' : ' disabled'}>${button}</button>
        <button class="order-swap"${o.rerollIn > 0 ? ' disabled' : ''}>${t('orderReroll')}</button></div>`;
      onTap(card.querySelector('.order-deliver') as HTMLElement, () => {
        if (ready && this.atBoard) this.onDeliver(a.id);
      });
      onTap(card.querySelector('.order-swap') as HTMLElement, () => {
        if (o.rerollIn <= 0) this.onSwap(a.id);
      });
      this.list.appendChild(card);
    });
    for (const r of o.refill) {
      const empty = document.createElement('div');
      empty.className = 'order-card empty';
      empty.textContent = tf('orderNext', { t: mmss(r) });
      this.list.appendChild(empty);
    }
  }
}
