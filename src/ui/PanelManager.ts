import { PanelFeel as F } from '../settings';
import { sfx } from '../audio/AudioEngine';

/**
 * One place that opens and closes every panel (GDD §23).
 * - modal: full cards (settings, encyclopedia, journal, character editor, "While you were away", confirmations).
 * - contextual: tied to a ring in the world (rod bench, order board); close when the player leaves it.
 * - card: short notices (day summary, catch card, journal page); one at a time, the rest wait in a queue.
 * - strip: banners; only logged.
 * At most one modal or contextual panel is open. A closed panel is made inert, aria-hidden and, after its slide-out
 * time, `visibility: hidden` by a timer (no transitionend), so nothing invisible can catch touches.
 */
export type PanelKind = 'modal' | 'contextual' | 'card' | 'strip';
export type CloseReason = 'button' | 'outside' | 'back' | 'left' | 'forced' | 'hidden' | 'idle' | 'replaced' | 'auto' | 'done';

export interface PanelSpec {
  id: string;
  kind: PanelKind;
  /** The panel's outermost element (inert / aria-hidden / visibility are set on it). */
  root: HTMLElement;
  /** Taps outside this element close the panel (when `outside` allows). Defaults to `root`. */
  inside?: () => HTMLElement;
  /** Adds the panel's own "open" look. */
  show: () => void;
  /** Removes it. */
  hide: () => void;
  /** Runs after the panel closed, with the reason. */
  onClose?: (reason: CloseReason) => void;
  /** Close on a tap outside (default: contextual and card yes, modal no). */
  outside?: boolean;
  /** Close on Escape / Android back (default yes); a function is asked each time. */
  back?: boolean | (() => boolean);
  /** Outside taps and back do nothing for this long after opening (a tap meant for the game). */
  guardMs?: number;
  /** Open / close sounds (default: modal and contextual). */
  sound?: boolean;
}

interface Panel extends PanelSpec {
  open: boolean;
  openedAt: number;
  hideTimer: number;
  /** Contextual: still allowed to be open (the player is in the ring); checked every frame. */
  valid: (() => boolean) | null;
  /** Remote contextual panels (no ring) close after a while without touches. */
  idle: boolean;
}

export interface PanelEvent {
  at: number;
  text: string;
}

class PanelManager {
  private readonly panels = new Map<string, Panel>();
  /** The open modal or contextual panel. */
  private current: Panel | null = null;
  private card: Panel | null = null;
  private readonly cardQueue: Array<{ id: string; run: () => void }> = [];
  private readonly modalQueue: Array<{ id: string; run: () => void }> = [];
  private readonly log: PanelEvent[] = [];
  private lastTouch = 0;
  /** Pointer that closed a panel by tapping outside: the game must not also use it. */
  private swallowed = new Set<number>();
  private historyPushed = false;
  /** Problems found by the audit after a close (shown in the debug view, read by tests). */
  readonly problems: string[] = [];
  private attached = false;

  /** Global listeners (once). */
  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('pointerdown', this.onPointerDown, true);
    window.addEventListener('pointerup', this.onPointerEnd, true);
    window.addEventListener('pointercancel', this.onPointerEnd, true);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.back()) e.preventDefault();
    });
    // Android back button (and browser back): a single guard entry is pushed when a panel opens. Back pops it and
    // closes the top panel; the guard comes back while panels stay open. The game never calls history.back() itself,
    // so the history can never drift and leave the page.
    window.addEventListener('popstate', () => {
      this.historyPushed = false;
      if (!this.current && !this.card) return;
      this.back();
      if (this.current || this.card) this.pushHistory();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.current?.kind === 'contextual') this.close(this.current.id, 'hidden');
    });
  }

  register(spec: PanelSpec): void {
    const p: Panel = { ...spec, open: false, openedAt: 0, hideTimer: 0, valid: null, idle: false };
    this.panels.set(spec.id, p);
    this.setClosedState(p, true);
  }

  isOpen(id: string): boolean {
    return this.panels.get(id)?.open ?? false;
  }

  /** Waiting in a queue (cards, system modals). */
  isQueued(id: string): boolean {
    return this.cardQueue.some((q) => q.id === id) || this.modalQueue.some((q) => q.id === id);
  }

  /** A modal or contextual panel is open: game touches (joystick, mini-game) are off. */
  get blocking(): boolean {
    return this.current !== null;
  }

  get modalOpen(): boolean {
    return this.current?.kind === 'modal';
  }

  /** Open panel ids, waiting cards / modals and the last events (debug view, tests). */
  snapshot(): { open: string[]; cards: string[]; modals: string[]; events: string[]; problems: string[] } {
    return {
      open: [...this.panels.values()].filter((p) => p.open).map((p) => `${p.id}(${p.kind})`),
      cards: this.cardQueue.map((q) => q.id),
      modals: this.modalQueue.map((q) => q.id),
      events: this.log.map((e) => `${(e.at / 1000).toFixed(1)} ${e.text}`),
      problems: [...this.problems],
    };
  }

  /**
   * Opens a modal or contextual panel. `run` fills it in. Modals: `queue` waits for the open one to close (system
   * windows); otherwise the open one is replaced. Contextual panels never push a modal away (returns false).
   * `valid`: contextual ring check; `idle`: a remote contextual panel that closes after a while without touches.
   */
  open(id: string, opts: { run?: () => void; queue?: boolean; valid?: () => boolean; idle?: boolean } = {}): boolean {
    const p = this.panels.get(id);
    if (!p || p.kind === 'card' || p.kind === 'strip') return false;
    if (p.open) {
      p.valid = opts.valid ?? p.valid;
      p.idle = opts.idle ?? p.idle;
      opts.run?.();
      return true;
    }
    const cur = this.current;
    if (cur) {
      if (p.kind === 'contextual' && cur.kind === 'modal') return false;
      if (p.kind === 'modal' && cur.kind === 'modal' && opts.queue) {
        if (!this.isQueued(id)) this.modalQueue.push({ id, run: () => this.open(id, { ...opts, queue: false }) });
        this.event(`queue ${id}`);
        return false;
      }
      // No queued window may slip in between: the new panel takes the place.
      this.close(cur.id, 'replaced', false);
    }
    p.valid = opts.valid ?? null;
    p.idle = opts.idle ?? false;
    this.lastTouch = performance.now();
    this.current = p;
    opts.run?.();
    this.show(p);
    this.pushHistory();
    return true;
  }

  /** Shows a card now, or queues it (another card is up, or a modal is open). */
  showCard(id: string, run: () => void): void {
    const p = this.panels.get(id);
    if (!p) return;
    if (this.card || this.modalOpen) {
      this.cardQueue.push({ id, run });
      this.event(`queue ${id}`);
      return;
    }
    this.card = p;
    run();
    this.show(p);
  }

  /** A strip (banner) appeared: only logged. */
  strip(id: string, text: string): void {
    this.event(`strip ${id}: ${text}`);
  }

  close(id: string, reason: CloseReason, thenNext = true): void {
    const p = this.panels.get(id);
    if (!p) return;
    // A queued card or modal that never showed is dropped.
    if (!p.open) {
      this.dropQueued(id);
      return;
    }
    p.open = false;
    if (this.current === p) this.current = null;
    if (this.card === p) this.card = null;
    p.hide();
    this.setClosedState(p, false);
    if (p.sound ?? p.kind !== 'card') sfx('panelClose');
    this.event(`close ${id} (${reason})`);
    p.onClose?.(reason);
    if (thenNext) this.next();
  }

  /** Escape / Android back: closes the top panel (a card first). Returns true when something was closed. */
  back(): boolean {
    // The one on top closes first: a modal covers cards; a card sits above a contextual sheet.
    const order = this.current?.kind === 'modal' ? [this.current, this.card] : [this.card, this.current];
    for (const p of order) {
      if (!p) continue;
      const allowed = typeof p.back === 'function' ? p.back() : p.back !== false;
      if (!allowed || this.guarded(p)) continue;
      this.close(p.id, 'back');
      return true;
    }
    // Something is open that back cannot close (a new player's character screen): still handled.
    if (this.current) this.event(`back ignored (${this.current.id})`);
    return this.current !== null;
  }
  /** Closes the contextual panel (forced moves: sleep, camera tour, push...). */
  closeContextual(reason: CloseReason): void {
    if (this.current?.kind === 'contextual') this.close(this.current.id, reason);
  }

  /** The game asks before using a new touch: one that just closed a panel is not used. */
  takesPointer(id: number): boolean {
    return !this.swallowed.has(id);
  }

  /** Safety net, every frame: contextual panels close outside their ring, while locked, or idle for too long. */
  update(locked: boolean): void {
    const c = this.current;
    if (!c || c.kind !== 'contextual') return;
    if (locked) this.close(c.id, 'forced');
    else if (c.valid && !c.valid()) this.close(c.id, 'left');
    else if (c.idle && performance.now() - this.lastTouch > F.idleCloseSeconds * 1000) this.close(c.id, 'idle');
  }

  /**
   * Finds closed panels that could still catch touches: samples a grid of screen points and reports any hit inside a
   * closed panel, plus closed panels that are not hidden. Empty = clean.
   */
  audit(): string[] {
    const found: string[] = [];
    const closed = [...this.panels.values()].filter((p) => !p.open && p.kind !== 'strip');
    for (const p of closed) {
      if (window.getComputedStyle(p.root).visibility !== 'hidden' && window.getComputedStyle(p.root).display !== 'none' && p.hideTimer === 0) {
        found.push(`${p.id}: closed but visible`);
      }
      if (!p.root.inert) found.push(`${p.id}: closed but not inert`);
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let gx = 0; gx < 6; gx++) {
      for (let gy = 0; gy < 12; gy++) {
        const el = document.elementFromPoint(((gx + 0.5) / 6) * w, ((gy + 0.5) / 12) * h);
        if (!el) continue;
        const owner = closed.find((p) => p.root.contains(el));
        if (owner) found.push(`${owner.id}: catches touches at ${gx},${gy}`);
      }
    }
    return [...new Set(found)];
  }

  // ---------- internals ----------

  private guarded(p: Panel): boolean {
    return performance.now() - p.openedAt < (p.guardMs ?? 0);
  }

  private show(p: Panel): void {
    p.openedAt = performance.now();
    window.clearTimeout(p.hideTimer);
    p.hideTimer = 0;
    p.open = true;
    p.root.inert = false;
    p.root.removeAttribute('aria-hidden');
    p.root.style.visibility = '';
    p.show();
    if (p.sound ?? p.kind !== 'card') sfx('panelOpen');
    this.event(`open ${p.id}`);
  }

  /** Inert and aria-hidden at once; `visibility: hidden` after the slide-out (a timer, not transitionend). */
  private setClosedState(p: Panel, now: boolean): void {
    p.root.inert = true;
    p.root.setAttribute('aria-hidden', 'true');
    window.clearTimeout(p.hideTimer);
    if (now) {
      p.root.style.visibility = 'hidden';
      p.hideTimer = 0;
      return;
    }
    p.hideTimer = window.setTimeout(() => {
      p.hideTimer = 0;
      if (p.open) return;
      p.root.style.visibility = 'hidden';
      for (const problem of this.audit()) {
        if (problem.startsWith(`${p.id}:`)) this.problem(problem);
      }
    }, F.hideAfterMs);
  }

  /** After a close: a waiting modal first, then the next card. */
  private next(): void {
    if (!this.current) {
      const m = this.modalQueue.shift();
      if (m) {
        m.run();
        return;
      }
    }
    if (!this.card && !this.modalOpen) {
      const c = this.cardQueue.shift();
      if (c) this.showCard(c.id, c.run);
    }
  }

  private dropQueued(id: string): void {
    for (const q of [this.cardQueue, this.modalQueue]) {
      const i = q.findIndex((e) => e.id === id);
      if (i >= 0) q.splice(i, 1);
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.lastTouch = performance.now();
    this.swallowed.delete(e.pointerId);
    const target = e.target as Node | null;
    for (const p of [this.card, this.current]) {
      if (!p || !(p.outside ?? p.kind !== 'modal')) continue;
      const inside = p.inside?.() ?? p.root;
      if ((target && inside.contains(target)) || this.guarded(p)) continue;
      // A card closes and the touch goes on to the game; a contextual panel eats the touch that closes it.
      if (p.kind === 'contextual' || p.kind === 'modal') this.swallowed.add(e.pointerId);
      this.close(p.id, 'outside');
    }
  };

  private onPointerEnd = (e: PointerEvent): void => {
    // Let the swallowed pointer go a moment later (after the game's own pointerup handlers).
    const id = e.pointerId;
    window.setTimeout(() => this.swallowed.delete(id), 0);
  };

  private pushHistory(): void {
    if (this.historyPushed) return;
    try {
      history.pushState({ nbPanel: true }, '');
      this.historyPushed = true;
    } catch {
      // Some embedded browsers refuse; Escape / buttons still work.
    }
  }

  private event(text: string): void {
    this.log.push({ at: performance.now(), text });
    if (this.log.length > F.logSize) this.log.shift();
  }

  private problem(text: string): void {
    this.problems.push(text);
    if (this.problems.length > 20) this.problems.shift();
    this.event(`PROBLEM ${text}`);
    console.warn(`[panels] ${text}`);
  }
}

/** The game's panel manager (one for everything). */
export const panels = new PanelManager();
