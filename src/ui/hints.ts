/**
 * Visual tutorial hints (GDD §22): a pointing hand that drags, taps or holds. Shapes only; the motion is CSS
 * (`.hint-hand.drag | .tap | .hold`), and "Reduce motion" stops it.
 */
export function handHint(kind: 'drag' | 'tap' | 'hold'): string {
  return `<span class="hint-hand ${kind}" aria-hidden="true"><span class="hint-ring"></span><svg viewBox="0 0 32 40"><path fill="currentColor" stroke="var(--ui-ink)" stroke-width="1.6" stroke-linejoin="round" d="M11 4.5a2.5 2.5 0 0 1 5 0V17l1-.2V13a2.4 2.4 0 0 1 4.8 0v4.2l.6-.1v-2.6a2.4 2.4 0 0 1 4.8 0V25c0 6-4 11-10 11h-1.4c-3.4 0-6-1.6-7.8-4.4L3.4 24a2.4 2.4 0 0 1 3.8-2.9L11 25z"/></svg></span>`;
}
