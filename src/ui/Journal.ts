import { Pages, type PageId } from '../content/story';
import { t, tf, type StringKey } from '../content/strings';
import { LandFeel } from '../settings';
import { onTap } from './tap';

const title = (id: PageId) => t(`${id}Title` as StringKey);
const text = (id: PageId) => t(`${id}Text` as StringKey);
const hint = (id: PageId) => t(`${id}Hint` as StringKey);

/**
 * A found journal page (GDD §15): a sheet of paper unfolds in the middle of the screen with the title and text, and
 * one button, "Add to journal". The game keeps running underneath (threats wait until it is closed).
 */
export class PageCard {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private shownFor = 0;
  private onClose: (() => void) | null = null;

  constructor(overlay: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'page-card-wrap';
    this.root.innerHTML = `
      <div class="page-card">
        <div class="page-new">${t('pageNew')}</div>
        <div class="page-title"></div>
        <div class="page-text"></div>
        <button class="page-add">${t('journalAdd')}</button>
      </div>`;
    this.titleEl = this.root.querySelector('.page-title') as HTMLElement;
    this.textEl = this.root.querySelector('.page-text') as HTMLElement;
    (this.root.querySelector('.page-card') as HTMLElement).addEventListener('pointerdown', (e) => e.stopPropagation());
    onTap(this.root.querySelector('.page-add') as HTMLElement, () => {
      // A short guard so a tap meant for the game does not close the card the moment it appears.
      if (this.shownFor >= LandFeel.cardMinTime) this.close();
    });
    overlay.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  show(id: PageId, onClose: () => void): void {
    this.titleEl.textContent = title(id);
    this.textEl.innerHTML = text(id);
    this.onClose = onClose;
    this.shownFor = 0;
    this.root.classList.add('open');
  }

  update(dt: number): void {
    if (this.isOpen) this.shownFor += dt;
  }

  private close(): void {
    this.root.classList.remove('open');
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }
}

/** The journal (HUD button): found pages can be read again; missing ones show "???" and a short hint. */
export class Journal {
  private readonly root: HTMLDivElement;
  private readonly list: HTMLElement;
  private readonly reader: HTMLElement;
  private readonly countEl: HTMLElement;

  constructor(overlay: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'journal-backdrop';
    this.root.innerHTML = `
      <div class="journal">
        <div class="journal-head"><span class="journal-title">${t('journalTitle')}</span><span class="journal-count"></span></div>
        <div class="journal-list"></div>
        <div class="journal-reader"></div>
        <button class="settings-btn close">${t('journalClose')}</button>
      </div>`;
    this.list = this.root.querySelector('.journal-list') as HTMLElement;
    this.reader = this.root.querySelector('.journal-reader') as HTMLElement;
    this.countEl = this.root.querySelector('.journal-count') as HTMLElement;
    (this.root.querySelector('.journal') as HTMLElement).addEventListener('pointerdown', (e) => e.stopPropagation());
    onTap(this.root.querySelector('.settings-btn.close') as HTMLElement, () => this.close());
    this.root.addEventListener('pointerup', (e) => {
      if (e.target === this.root) this.close();
    });
    overlay.appendChild(this.root);
  }

  open(found: readonly string[]): void {
    this.countEl.textContent = tf('journalFound', { n: found.length });
    this.list.innerHTML = '';
    this.reader.classList.remove('open');
    this.list.classList.remove('hidden');
    for (const p of Pages) {
      const has = found.includes(p.id);
      const row = document.createElement('button');
      row.className = `journal-row${has ? '' : ' locked'}`;
      row.innerHTML = has
        ? `<b>${title(p.id)}</b>`
        : `<b>${t('journalLocked')}</b><span>${hint(p.id)}</span>`;
      if (has) onTap(row, () => this.read(p.id));
      this.list.appendChild(row);
    }
    this.root.classList.add('open');
  }

  private read(id: PageId): void {
    this.reader.innerHTML = `<div class="page-title">${title(id)}</div><div class="page-text">${text(id)}</div><button class="settings-btn back">${t('journalBack')}</button>`;
    onTap(this.reader.querySelector('.back') as HTMLElement, () => {
      this.reader.classList.remove('open');
      this.list.classList.remove('hidden');
    });
    this.list.classList.add('hidden');
    this.reader.classList.add('open');
  }

  close(): void {
    this.root.classList.remove('open');
  }
}
