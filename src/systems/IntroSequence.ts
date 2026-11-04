import { displayName, tf } from '../content/strings';
import { IntroFeel as F } from '../settings';
import { easeInOut } from '../core/Ease';
import type { Player } from '../entities/Player';
import type { CameraRig } from '../render/CameraRig';
import type { Snowfall } from '../render/Snowfall';
import type { WorldLabel, WorldLabels } from '../ui/WorldLabels';

/**
 * First-start intro after the character creator (GDD §3): the camera eases in from wide, snow thickens a little,
 * a greeting bubble pops over the player. The joystick and guide stay off until it ends.
 */
export class IntroSequence {
  private t = -1;
  private readonly bubble: WorldLabel;

  constructor(
    private readonly rig: CameraRig,
    private readonly snow: Snowfall,
    private readonly player: Player,
    private readonly labels: WorldLabels,
  ) {
    this.bubble = labels.create('greeting');
  }

  get active(): boolean {
    return this.t >= 0;
  }

  start(name: string): void {
    this.t = 0;
    this.bubble.el.textContent = tf('greeting', { name: displayName(name) });
    this.rig.setZoom(F.startZoom);
    this.snow.setDensity(F.startSnow);
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const k = easeInOut(Math.min(this.t / F.zoomTime, 1));
    this.rig.setZoom(F.startZoom + (1 - F.startZoom) * k);
    this.snow.setDensity(F.startSnow + (1 - F.startSnow) * k);
    const p = this.player.state;
    this.bubble.anchor.set(p.x, 2.55, p.z);
    if (this.t >= F.greetAt && !this.bubble.visible) this.labels.pop(this.bubble);
    if (this.t >= F.greetAt + F.greetTime) {
      this.labels.show(this.bubble, false);
      this.rig.setZoom(1);
      this.snow.setDensity(1);
      this.t = -1;
    }
  }
}
