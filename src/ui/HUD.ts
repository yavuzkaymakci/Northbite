import { t, tf } from '../content/strings';
import { CoinFeel } from '../settings';
import { damp } from '../core/Time';
import { onTap } from './tap';
import { handHint } from './hints';

/** Top HUD: coin counter (counts toward its target), FPS readout and the first-move hint. */
export class HUD {
  private readonly coinPill: HTMLDivElement;
  private readonly coinValue: HTMLSpanElement;
  private readonly fpsEl: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;
  private readonly dayEl: HTMLDivElement;
  private readonly torchEl: HTMLDivElement;
  private lastTorches = -1;
  private readonly restedEl: HTMLDivElement;
  private lastRested = '';
  private lastDayKey = '';
  private frames = 0;
  private fpsTimer = 0;
  private hintHidden = false;
  private shown = 0;
  private target = 0;
  private lastText = '';
  private bumpAt = -1e9;

  private readonly codexBtn: HTMLElement;
  private readonly boardBtn: HTMLElement;
  private lastDots = '';

  constructor(overlay: HTMLElement, onSettings: () => void, onJournal: () => void, onCodex: () => void, onBoard: () => void) {
    const bar = document.createElement('div');
    bar.className = 'hud-bar';

    this.coinPill = document.createElement('div');
    this.coinPill.className = 'hud-pill';
    this.coinPill.innerHTML = '<span class="coin-icon"></span>';
    this.coinValue = document.createElement('span');
    this.coinValue.className = 'hud-value';
    this.coinValue.textContent = '0';
    this.coinPill.appendChild(this.coinValue);

    this.fpsEl = document.createElement('div');
    // Off by default; "FPS counter" under Debug in the settings shows it.
    this.fpsEl.className = 'hud-fps hidden';
    this.fpsEl.textContent = `-- ${t('fps')}`;

    const right = document.createElement('div');
    right.className = 'hud-right';
    const gear = document.createElement('button');
    gear.className = 'hud-gear';
    gear.setAttribute('aria-label', t('settingsOpen'));
    gear.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M13.6 3h4.8l.7 3.4 2.4 1 2.9-1.9 3.4 3.4-1.9 2.9 1 2.4 3.4.7v4.8l-3.4.7-1 2.4 1.9 2.9-3.4 3.4-2.9-1.9-2.4 1-.7 3.4h-4.8l-.7-3.4-2.4-1-2.9 1.9-3.4-3.4 1.9-2.9-1-2.4L3 18.4v-4.8l3.4-.7 1-2.4-1.9-2.9 3.4-3.4 2.9 1.9 2.4-1zM16 11a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>`;
    onTap(gear, onSettings);
    // Captain's journal (GDD §15).
    const book = document.createElement('button');
    book.className = 'hud-gear hud-book';
    book.setAttribute('aria-label', t('journalOpen'));
    book.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M6 5c3-1 7-1 10 1 3-2 7-2 10-1v21c-3-1-7-1-10 1-3-2-7-2-10-1zm2 2v16c2.5-.4 5-.2 7 .9V7.6C13 6.6 10.5 6.5 8 7zm16 0c-2.5-.5-5-.4-7 .6v16.3c2-1.1 4.5-1.3 7-.9z"/></svg>`;
    onTap(book, onJournal);
    right.append(this.fpsEl, book, gear);
    bar.append(this.coinPill, right);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'hud-hint';
    // A hand drags over a joystick ring; the words are short (GDD §22).
    this.hintEl.innerHTML = `${handHint('drag')}<span class="hud-hint-text">${t('moveHint')}</span>`;

    // Encyclopedia (fish) and order board buttons in a small column under the gear (GDD §19, §20).
    const side = document.createElement('div');
    side.className = 'hud-side';
    this.codexBtn = document.createElement('button');
    this.codexBtn.className = 'hud-gear hud-small hud-codex';
    this.codexBtn.setAttribute('aria-label', t('codexOpen'));
    this.codexBtn.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M4 16c4-6 10-8 16-6l6-4v20l-6-4c-6 2-12 0-16-6zm17-1.5a1.5 1.5 0 1 0 0 .01z"/></svg><span class="hud-dot"></span>`;
    onTap(this.codexBtn, onCodex);
    this.boardBtn = document.createElement('button');
    this.boardBtn.className = 'hud-gear hud-small hud-board hidden';
    this.boardBtn.setAttribute('aria-label', t('boardOpen'));
    this.boardBtn.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M5 6h22v16H5zm2 2v12h18V8zm2 2h6v4H9zm8 0h6v2h-6zm0 4h6v2h-6zM8 22h2v6H8zm14 0h2v6h-2z"/></svg><span class="hud-dot"></span>`;
    onTap(this.boardBtn, onBoard);
    side.append(this.codexBtn, this.boardBtn);
    overlay.appendChild(side);

    this.dayEl = document.createElement('div');
    this.dayEl.className = 'hud-day';
    this.torchEl = document.createElement('div');
    this.torchEl.className = 'hud-torch hidden';
    this.restedEl = document.createElement('div');
    this.restedEl.className = 'hud-rested hidden';
    // Small chips under the coin counter: day, torches, "well rested".
    const chips = document.createElement('div');
    chips.className = 'hud-chips';
    chips.append(this.dayEl, this.torchEl, this.restedEl);
    overlay.append(bar, chips, this.hintEl);
  }

  /** Red dots: a newly found species, an order that can be delivered. The board button shows once the board exists. */
  setSideButtons(codexDot: boolean, boardBuilt: boolean, boardDot: boolean): void {
    const key = `${codexDot}|${boardBuilt}|${boardDot}`;
    if (key === this.lastDots) return;
    this.lastDots = key;
    this.codexBtn.classList.toggle('dot', codexDot);
    this.boardBtn.classList.toggle('hidden', !boardBuilt);
    this.boardBtn.classList.toggle('dot', boardDot);
  }

  /** "Well rested" chip: quality and minutes left (quality 0 hides it). */
  setRested(quality: number, minutes: number): void {
    const key = `${quality}|${minutes}`;
    if (key === this.lastRested) return;
    this.lastRested = key;
    this.restedEl.classList.toggle('hidden', quality <= 0);
    if (quality <= 0) return;
    this.restedEl.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 18v-7h2v4h14v-3a2 2 0 0 0-2-2h-6v5H9V9a2 2 0 0 0-2-2H5V5H3v13zm2-1h14v1H5zM7 10a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg><span>${tf('restedChip', { q: quality, m: minutes })}</span>`;
  }

  /** Torch count under the day pill once the torch stand exists (-1 hides it). */
  setTorches(count: number): void {
    if (count === this.lastTorches) return;
    this.lastTorches = count;
    this.torchEl.classList.toggle('hidden', count < 0);
    this.torchEl.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.6.8-2.7 1.6-3.6.2 1.3.9 2.1 1.7 2.4C11 6.5 11 4.5 12 2z"/><path fill="currentColor" opacity=".6" d="M11 15h2l-.5 7h-1z"/></svg><span>×${Math.max(count, 0)}</span>`;
  }

  /** Sun or moon icon with "Day N" under the coin counter. */
  setDay(day: number, night: boolean): void {
    const key = `${day}|${night}`;
    if (key === this.lastDayKey) return;
    this.lastDayKey = key;
    const icon = night
      ? '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M15 3a9 9 0 1 0 6 15.7A8 8 0 0 1 15 3z"/></svg>'
      : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></g></svg>';
    this.dayEl.innerHTML = `${icon}<span>${tf('dayLabel', { n: day })}</span>`;
    this.dayEl.classList.toggle('night', night);
  }

  /** Jump straight to a value (on load). */
  setCoins(value: number): void {
    this.shown = this.target = value;
    this.render();
  }

  /** The display counts toward this value. */
  setCoinTarget(value: number): void {
    // One bump per burst of coins: restarting it every frame would only jitter.
    if (value > this.target && performance.now() - this.bumpAt > CoinFeel.hudBumpGapMs) {
      this.bumpAt = performance.now();
      this.coinPill.classList.remove('bump');
      void this.coinPill.offsetWidth;
      this.coinPill.classList.add('bump');
    }
    this.target = value;
  }

  setFpsVisible(on: boolean): void {
    this.fpsEl.classList.toggle('hidden', !on);
  }

  hideHint(): void {
    if (this.hintHidden) return;
    this.hintHidden = true;
    this.hintEl.classList.add('hidden');
  }

  update(dt: number): void {
    if (this.shown !== this.target) {
      this.shown += (this.target - this.shown) * damp(CoinFeel.hudCountSpeed, dt);
      if (Math.abs(this.target - this.shown) < 0.5) this.shown = this.target;
      this.render();
    }

    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      if (!this.fpsEl.classList.contains('hidden')) this.fpsEl.textContent = `${Math.round(this.frames / this.fpsTimer)} ${t('fps')}`;
      this.frames = 0;
      this.fpsTimer = 0;
    }
  }

  private render(): void {
    const text = String(Math.round(this.shown));
    if (text !== this.lastText) {
      this.coinValue.textContent = text;
      this.lastText = text;
    }
  }
}
