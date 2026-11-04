import type { Joystick } from '../ui/Joystick';

export interface MoveInput {
  /** Screen-right axis, -1..1 */
  x: number;
  /** Screen-down axis, -1..1 */
  y: number;
}

/** Merges the touch joystick with keyboard (WASD / arrows, Space = reel) for desktop testing. */
export class Input {
  private readonly keys = new Set<string>();
  readonly move: MoveInput = { x: 0, y: 0 };

  constructor(private readonly joystick: Joystick) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  update(): void {
    const j = this.joystick.value;
    if (j.x !== 0 || j.y !== 0) {
      this.move.x = j.x;
      this.move.y = j.y;
      return;
    }
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    const len = Math.hypot(x, y);
    this.move.x = len > 0 ? x / len : 0;
    this.move.y = len > 0 ? y / len : 0;
  }

  get active(): boolean {
    return this.move.x !== 0 || this.move.y !== 0;
  }

  /** Space bar acts as "screen held" for the fishing mini-game on desktop. */
  get reelKey(): boolean {
    return this.keys.has('Space');
  }

  reset(): void {
    this.keys.clear();
    this.joystick.release();
  }
}
