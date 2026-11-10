import { t, type StringKey } from '../content/strings';
import { onTap } from './tap';
import { panels } from './PanelManager';

export type DebugAction = 'coins' | 'hour' | 'day' | 'bear' | 'avalanche' | 'xp' | 'panels' | 'jobs' | 'voyage' | 'part' | 'boat';

type View = 'off' | 'panels' | 'jobs' | 'boat';

const BUTTONS: ReadonlyArray<[DebugAction, StringKey]> = [
  ['coins', 'debugCoins'],
  ['hour', 'debugHour'],
  ['day', 'debugDay'],
  ['bear', 'debugBear'],
  ['avalanche', 'debugAvalanche'],
  ['xp', 'debugXp'],
  ['panels', 'debugPanels'],
  ['jobs', 'debugJobs'],
  // Harbour Pier (GDD §25): voyage time multiplier, a lantern part, the boat state view.
  ['voyage', 'debugVoyage'],
  ['part', 'debugPart'],
  ['boat', 'debugBoat'],
];

/**
 * Debug tools (Settings → Debug → Tools, off by default): give coins, skip time, start a threat, give the penguins
 * experience, the panel state view (open panels, waiting cards, the last panel events, problems found by the audit),
 * the job view (open job-board listings, what each penguin is doing) and the boat view (GDD §25).
 */
export class DebugBar {
  private readonly bar: HTMLDivElement;
  private readonly view: HTMLPreElement;
  private mode: View = 'off';
  private timer = 0;

  constructor(
    overlay: HTMLElement,
    onAction: (a: DebugAction) => void,
    private readonly jobs: () => string[] = () => [],
    private readonly boat: () => string[] = () => [],
  ) {
    this.bar = document.createElement('div');
    this.bar.className = 'debug-bar hidden';
    for (const [action, label] of BUTTONS) {
      const b = document.createElement('button');
      b.textContent = t(label);
      onTap(b, () => {
        if (action === 'panels' || action === 'jobs' || action === 'boat') this.toggleView(action);
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
    if (!on) this.toggleView('off');
  }

  private toggleView(mode: View): void {
    this.mode = this.mode === mode ? 'off' : mode;
    this.view.classList.toggle('hidden', this.mode === 'off');
    this.timer = 0;
  }

  update(dt: number): void {
    if (this.mode === 'off') return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    if (this.mode === 'jobs' || this.mode === 'boat') {
      this.view.textContent = (this.mode === 'jobs' ? this.jobs() : this.boat()).join('\n');
      return;
    }
    const s = panels.snapshot();
    this.view.textContent = [
      `open: ${s.open.join(', ') || '-'}`,
      `cards: ${s.cards.join(', ') || '-'} | modals: ${s.modals.join(', ') || '-'}`,
      ...s.events,
      ...(s.problems.length ? ['PROBLEMS:', ...s.problems] : []),
    ].join('\n');
  }
}
