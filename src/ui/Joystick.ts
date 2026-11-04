import { JoystickSettings as S } from '../settings';

/**
 * Floating joystick (GDD §4.1): appears where the finger lands in the bottom 70% of the screen.
 * Output is analog: 0 inside the dead zone, then ramps linearly to 1 at max drag.
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

  constructor(private readonly surface: HTMLElement, overlay: HTMLElement) {
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

    surface.addEventListener('pointerdown', this.onDown);
    surface.addEventListener('pointermove', this.onMove);
    surface.addEventListener('pointerup', this.onUp);
    surface.addEventListener('pointercancel', this.onUp);
    surface.addEventListener('lostpointercapture', this.onUp);
  }

  /** Force-release, e.g. when the page goes to background. */
  release(): void {
    if (this.pointerId !== null && this.surface.hasPointerCapture(this.pointerId)) {
      this.surface.releasePointerCapture(this.pointerId);
    }
    this.pointerId = null;
    this.value.x = 0;
    this.value.y = 0;
    this.hide();
  }

  private onDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return; // one finger drives the joystick
    if (e.clientY < window.innerHeight * S.activeAreaFromTop) return;
    e.preventDefault();

    this.pointerId = e.pointerId;
    this.surface.setPointerCapture(e.pointerId);
    this.originX = e.clientX;
    this.originY = e.clientY;

    window.clearTimeout(this.hideTimer);
    this.root.style.left = `${e.clientX}px`;
    this.root.style.top = `${e.clientY}px`;
    this.setKnob(0, 0);
    // Restart the appear animation.
    this.root.classList.remove('visible', 'hiding');
    void this.root.offsetWidth;
    this.root.classList.add('visible');
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();

    let dx = e.clientX - this.originX;
    let dy = e.clientY - this.originY;
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
    this.value.x = (dx / Math.hypot(dx, dy)) * strength;
    this.value.y = (dy / Math.hypot(dx, dy)) * strength;
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.value.x = 0;
    this.value.y = 0;
    this.hide();
  };

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
