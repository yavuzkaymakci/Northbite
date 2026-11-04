import type { Joystick } from '../ui/Joystick';

/** Something that can claim touches ahead of the joystick (the fishing mini-game). */
export interface TouchClaimer {
  /** True while touches should go to the claimer instead of the joystick. */
  wantsTouches(): boolean;
  touchDown(id: number, x: number, y: number): void;
  /** Return 'release' to hand the touch over to the joystick. */
  touchMove(id: number, x: number, y: number): 'keep' | 'release';
  touchUp(id: number): void;
}

interface Owned {
  owner: 'joystick' | 'claimer';
  startX: number;
  startY: number;
}

/** Single place that receives canvas pointer events and routes each touch to one owner. */
export class TouchRouter {
  private readonly owned = new Map<number, Owned>();

  constructor(
    private readonly surface: HTMLElement,
    private readonly joystick: Joystick,
    private readonly claimer: TouchClaimer,
  ) {
    surface.addEventListener('pointerdown', this.onDown);
    surface.addEventListener('pointermove', this.onMove);
    surface.addEventListener('pointerup', this.onUp);
    surface.addEventListener('pointercancel', this.onUp);
    surface.addEventListener('lostpointercapture', this.onUp);
  }

  releaseAll(): void {
    for (const id of [...this.owned.keys()]) this.finish(id);
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.claimer.wantsTouches()) {
      this.capture(e.pointerId);
      this.owned.set(e.pointerId, { owner: 'claimer', startX: e.clientX, startY: e.clientY });
      this.claimer.touchDown(e.pointerId, e.clientX, e.clientY);
      return;
    }
    if (this.joystick.tryBegin(e.pointerId, e.clientX, e.clientY)) {
      this.capture(e.pointerId);
      this.owned.set(e.pointerId, { owner: 'joystick', startX: e.clientX, startY: e.clientY });
    }
  };

  private onMove = (e: PointerEvent): void => {
    const o = this.owned.get(e.pointerId);
    if (!o) return;
    e.preventDefault();
    if (o.owner === 'joystick') {
      this.joystick.move(e.pointerId, e.clientX, e.clientY);
      return;
    }
    if (this.claimer.touchMove(e.pointerId, e.clientX, e.clientY) === 'release') {
      o.owner = 'joystick';
      this.joystick.adopt(e.pointerId, o.startX, o.startY, e.clientX, e.clientY);
      // If the joystick is already driven by another finger, this touch simply ends up unowned.
      if (this.joystick.activePointer !== e.pointerId) this.owned.delete(e.pointerId);
    }
  };

  private onUp = (e: PointerEvent): void => {
    this.finish(e.pointerId);
  };

  private finish(id: number): void {
    const o = this.owned.get(id);
    if (!o) return;
    this.owned.delete(id);
    if (o.owner === 'joystick') this.joystick.end(id);
    else this.claimer.touchUp(id);
    if (this.surface.hasPointerCapture(id)) this.surface.releasePointerCapture(id);
  }

  private capture(id: number): void {
    try {
      this.surface.setPointerCapture(id);
    } catch {
      // Pointer already gone.
    }
  }
}
