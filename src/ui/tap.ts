/**
 * Calls `fn` when a press starts and ends on `el`. Uses pointer events instead of `click`, because the game blocks
 * quick double-tap touchends (to stop iOS zoom), which would swallow clicks.
 */
export function onTap(el: HTMLElement, fn: (e: PointerEvent) => void): void {
  let down = false;
  el.addEventListener('pointerdown', (e) => {
    down = true;
    el.classList.add('pressed');
    e.stopPropagation();
  });
  const cancel = () => {
    down = false;
    el.classList.remove('pressed');
  };
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerup', (e) => {
    const was = down;
    cancel();
    if (was) fn(e);
  });
}
