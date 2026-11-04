import { JoystickSettings as S } from '../settings';

/**
 * Floating joystick (GDD §4.1): appears where the finger lands in the bottom 70% of the screen.
 * Output is analog: 0 inside the dead zone, then ramps linearly to 1 at max drag.
 * Pointer events are fed in by TouchRouter, which decides whether a touch belongs to the joystick or the mini-game.
 */
export class Joystick {
  /** Screen-space direction scaled by strength. x = right, y = down. */
  readonly value = { x: 0, y: 0 };

  private readonly root: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private hideTimer = 0;

  constructor(overlay: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'joystick';
    this.root.style.width = `${S.outerDiameter}px`;
    this.root.style.height = `${S.outerDiameter}px`;
    this.root.style.setProperty('--fade-ms', `${S.fadeOutMs}ms`);
    this.root.style.setProperty('--appear-ms', `${S.appearMs}ms`);

    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.knob.style.width = `${S.knobDiameter}px`;
    this.knob.style.height = `${S.knobDiameter}px`;

    this.root.appendChild(this.knob);
    overlay.appendChild(this.root);
  }

  get activePointer(): number | null {
    return this.pointerId;
  }

  /** Starts the joystick if the touch is in the active area. Returns true if it took the pointer. */
  tryBegin(id: number, x: number, y: number): boolean {
    if (this.pointerId !== null) return false; // one finger drives the joystick
    if (y < window.innerHeight * S.activeAreaFromTop) return false;
    this.begin(id, x, y);
    return true;
  }

  /** Takes over a touch that started elsewhere (e.g. a cancelled mini-game), centered where it began. */
  adopt(id: number, originX: number, originY: number, x: number, y: number): void {
    if (this.pointerId !== null) return;
    this.begin(id, originX, originY);
    this.move(id, x, y);
  }

  move(id: number, x: number, y: number): void {
    if (id !== this.pointerId) return;
    let dx = x - this.originX;
    let dy = y - this.originY;
    const dist = Math.hypot(dx, dy);
    if (dist > S.maxDrag) {
      dx = (dx / dist) * S.maxDrag;
      dy = (dy / dist) * S.maxDrag;
    }
    this.setKnob(dx, dy);

    const t = Math.min(dist, S.maxDrag) / S.maxDrag;
    if (t <= S.deadZone || dist === 0) {
      this.value.x = 0;
      this.value.y = 0;
      return;
    }
    const strength = (t - S.deadZone) / (1 - S.deadZone);
    const len = Math.hypot(dx, dy);
    this.value.x = (dx / len) * strength;
    this.value.y = (dy / len) * strength;
  }

  end(id: number): void {
    if (id !== this.pointerId) return;
    this.release();
  }

  /** Force-release, e.g. when the page goes to background. */
  release(): void {
    this.pointerId = null;
    this.value.x = 0;
    this.value.y = 0;
    this.hide();
  }

  private begin(id: number, x: number, y: number): void {
    this.pointerId = id;
    this.originX = x;
    this.originY = y;
    window.clearTimeout(this.hideTimer);
    this.root.style.left = `${x}px`;
    this.root.style.top = `${y}px`;
    this.setKnob(0, 0);
    // Restart the appear animation.
    this.root.classList.remove('visible', 'hiding');
    void this.root.offsetWidth;
    this.root.classList.add('visible');
  }

  private hide(): void {
    if (!this.root.classList.contains('visible')) return;
    this.root.classList.add('hiding');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.root.classList.remove('visible', 'hiding');
    }, S.fadeOutMs);
  }

  private setKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}
