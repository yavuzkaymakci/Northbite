import { t, type StringKey } from '../content/strings';
import { onTap } from './tap';
import { panels } from './PanelManager';

export type DebugAction = 'coins' | 'hour' | 'day' | 'bear' | 'avalanche' | 'panels';

const BUTTONS: ReadonlyArray<[DebugAction, StringKey]> = [
  ['coins', 'debugCoins'],
  ['hour', 'debugHour'],
  ['day', 'debugDay'],
  ['bear', 'debugBear'],
  ['avalanche', 'debugAvalanche'],
  ['panels', 'debugPanels'],
];

/**
 * Debug tools (Settings → Debug → Tools, off by default): give coins, skip time, start a threat, and the panel
 * state view (open panels, waiting cards, the last panel events, problems found by the audit).
 */
export class DebugBar {
  private readonly bar: HTMLDivElement;
  private readonly view: HTMLPreElement;
  private viewOn = false;
  private timer = 0;

  constructor(overlay: HTMLElement, onAction: (a: DebugAction) => void) {
    this.bar = document.createElement('div');
    this.bar.className = 'debug-bar hidden';
    for (const [action, label] of BUTTONS) {
      const b = document.createElement('button');
      b.textContent = t(label);
      onTap(b, () => {
        if (action === 'panels') this.toggleView();
        else onAction(action);
      });
      this.bar.appendChild(b);
    }
    this.view = document.createElement('pre');
    this.view.className = 'debug-panels hidden';
    overlay.append(this.bar, this.view);
  }

  setVisible(on: boolean): void {
    this.bar.classList.toggle('hidden', !on);
    if (!on && this.viewOn) this.toggleView();
  }

  private toggleView(): void {
    this.viewOn = !this.viewOn;
    this.view.classList.toggle('hidden', !this.viewOn);
    this.timer = 0;
  }

  update(dt: number): void {
    if (!this.viewOn) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const s = panels.snapshot();
    this.view.textContent = [
      `open: ${s.open.join(', ') || '-'}`,
      `cards: ${s.cards.join(', ') || '-'} | modals: ${s.modals.join(', ') || '-'}`,
      ...s.events,
      ...(s.problems.length ? ['PROBLEMS:', ...s.problems] : []),
    ].join('\n');
  }
}
