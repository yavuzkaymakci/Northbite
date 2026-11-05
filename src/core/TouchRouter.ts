import type { Joystick } from '../ui/Joystick';

/** Something that can claim touches ahead of the joystick (the fishing mini-game, mining crystals). */
export interface TouchClaimer {
  /** True while touches should go to the claimer instead of the joystick. */
  wantsTouches(): boolean;
  touchDown(id: number, x: number, y: number): void;
  /** Return 'release' to hand the touch over to the joystick. */
  touchMove(id: number, x: number, y: number): 'keep' | 'release';
  touchUp(id: number): void;
}

interface Owned {
  owner: 'joystick' | TouchClaimer;
  startX: number;
  startY: number;
}

/** Single place that receives canvas pointer events and routes each touch to one owner. */
export class TouchRouter {
  private readonly owned = new Map<number, Owned>();

  constructor(
    private readonly surface: HTMLElement,
    private readonly joystick: Joystick,
    /** Asked in order; the first one that wants touches gets them. */
    private readonly claimers: readonly TouchClaimer[],
    /** False for a touch the game must not use (it just closed a panel). */
    private readonly gate: (id: number) => boolean = () => true,
  ) {
    surface.addEventListener('pointerdown', this.onDown);
    surface.addEventListener('pointermove', this.onMove);
    surface.addEventListener('pointerup', this.onUp);
    surface.addEventListener('pointercancel', this.onUp);
    surface.addEventListener('lostpointercapture', this.onUp);
  }

  private enabledValue = true;

  releaseAll(): void {
    for (const id of [...this.owned.keys()]) this.finish(id);
  }

  /** While disabled (camera tours), every touch is ignored and held ones are let go. */
  set enabled(on: boolean) {
    if (this.enabledValue === on) return;
    this.enabledValue = on;
    if (!on) this.releaseAll();
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (!this.enabledValue || !this.gate(e.pointerId)) return;
    const claimer = this.claimers.find((c) => c.wantsTouches());
    if (claimer) {
      this.capture(e.pointerId);
      this.owned.set(e.pointerId, { owner: claimer, startX: e.clientX, startY: e.clientY });
      claimer.touchDown(e.pointerId, e.clientX, e.clientY);
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
    if (o.owner.touchMove(e.pointerId, e.clientX, e.clientY) === 'release') {
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
    else o.owner.touchUp(id);
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
