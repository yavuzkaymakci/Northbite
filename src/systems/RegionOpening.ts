import type { RegionDef } from '../content/zones';
import { HapticsSettings, RegionFeel as R } from '../settings';
import { easeInOut } from '../core/Ease';
import { vibrate } from '../core/Haptics';
import type { Player } from '../entities/Player';
import type { CameraRig } from '../render/CameraRig';
import type { Effects } from '../render/Effects';
import type { WorldMap } from '../world/Map';
import type { Unlocks } from './Unlocks';
import { sfx } from '../audio/AudioEngine';

type Step = 'crack' | 'pause' | 'pan' | 'hold' | 'back';

/**
 * Opening a region (GDD §5, §6): the ice wall cracks and bursts, its collider goes away, the camera glides to the
 * new area while its unlock frames bounce in, then returns to the player. Input is locked meanwhile.
 */
export class RegionOpening {
  private region: RegionDef | null = null;
  private step: Step = 'crack';
  private t = 0;
  private fromX = 0;
  private fromZ = 0;

  constructor(
    private readonly world: WorldMap,
    private readonly rig: CameraRig,
    private readonly fx: Effects,
    private readonly player: Player,
    private readonly unlocks: Unlocks,
    private readonly onDone: () => void,
  ) {}

  /** True while the sequence runs (the game locks the joystick). */
  get active(): boolean {
    return this.region !== null;
  }

  start(region: RegionDef): void {
    this.region = region;
    this.step = 'crack';
    this.t = 0;
    this.world.wallFor(region.id)?.crack();
    vibrate(HapticsSettings.wallCrack);
    sfx('iceCrack');
  }

  /** Drives the camera; call instead of the normal follow while active. */
  update(dt: number): void {
    const region = this.region;
    if (!region) return;
    this.t += dt;
    const p = this.player.state;
    const tour = region.tour;
    switch (this.step) {
      case 'crack':
        this.rig.update(dt, p.x, p.z);
        this.rig.shake(R.shake * 0.25 * (this.t / R.crackTime));
        if (this.t >= R.crackTime) {
          const wall = this.world.wallFor(region.id);
          wall?.shatter(this.fx);
          this.world.openRegion(region.id);
          this.rig.shake(R.shake);
          vibrate(HapticsSettings.wallBreak);
          sfx('iceBreak');
          this.next('pause');
        }
        break;
      case 'pause':
        this.rig.update(dt, p.x, p.z);
        if (this.t >= R.pause) {
          this.fromX = this.rig.focusPoint.x;
          this.fromZ = this.rig.focusPoint.z;
          this.next('pan');
        }
        break;
      case 'pan': {
        const k = easeInOut(Math.min(this.t / R.panTime, 1));
        this.rig.hold(this.fromX + (tour.x - this.fromX) * k, this.fromZ + (tour.z - this.fromZ) * k);
        if (this.t >= R.panTime) {
          this.unlocks.refresh(true, 0);
          this.next('hold');
        }
        break;
      }
      case 'hold':
        this.rig.hold(tour.x, tour.z);
        if (this.t >= R.holdTime) this.next('back');
        break;
      case 'back': {
        const k = easeInOut(Math.min(this.t / R.returnTime, 1));
        this.rig.hold(tour.x + (p.x - tour.x) * k, tour.z + (p.z - tour.z) * k);
        if (this.t >= R.returnTime) {
          this.region = null;
          this.onDone();
        }
        break;
      }
    }
  }

  private next(step: Step): void {
    this.step = step;
    this.t = 0;
  }
}
