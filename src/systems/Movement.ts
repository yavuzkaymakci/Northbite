import { Economy } from '../content/economy';
import { PlayerFeel } from '../settings';
import type { RectArea } from '../content/zones';
import type { MoveInput } from '../core/Input';
import { damp } from '../core/Time';
import { resolveCollisions, type Collider } from './Collision';

/** Pure movement state (what gets saved is a subset of this). */
export interface MoverState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  /** 0..1, current speed relative to walk speed; drives the walk animation. */
  speed01: number;
}

export interface Walkable {
  colliders: readonly Collider[];
  bounds: RectArea;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Screen axes map straight onto world axes because the camera has no yaw:
 * screen-right = +X, screen-down = +Z.
 */
export function updateMovement(s: MoverState, move: MoveInput, dt: number, world: Walkable): void {
  const maxSpeed = Economy.player.walkSpeed;
  const k = damp(PlayerFeel.accelSharpness, dt);
  s.vx += (move.x * maxSpeed - s.vx) * k;
  s.vz += (move.y * maxSpeed - s.vz) * k;

  const prevX = s.x;
  const prevZ = s.z;
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  resolveCollisions(s, PlayerFeel.radius, world.colliders, world.bounds);

  // Actual displacement (after sliding along walls) drives the animation.
  const actual = dt > 0 ? Math.hypot(s.x - prevX, s.z - prevZ) / dt : 0;
  s.speed01 = Math.min(actual / maxSpeed, 1);

  const inputLen = Math.hypot(move.x, move.y);
  if (inputLen > 0.01) {
    const target = Math.atan2(move.x, move.y);
    s.heading = wrapAngle(s.heading + wrapAngle(target - s.heading) * damp(PlayerFeel.turnSharpness, dt));
  }
}
