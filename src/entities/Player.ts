import * as THREE from 'three';
import { PlayerFeel } from '../settings';
import type { MoveInput } from '../core/Input';
import { animatePlayer, createPlayer, type Appearance, type PlayerModel } from '../models/createPlayer';
import { createBlobShadow } from '../render/BlobShadow';
import { updateMovement, type MoverState, type Walkable } from '../systems/Movement';

/** Player = pure state (`state`) + visuals (`object`). Only `state` is ever saved. */
export class Player {
  readonly state: MoverState;
  readonly object = new THREE.Group();
  private readonly model: PlayerModel;
  private walkPhase = 0;

  constructor(appearance: Appearance, x: number, z: number, heading = 0) {
    this.state = { x, z, vx: 0, vz: 0, heading, speed01: 0 };
    this.model = createPlayer(appearance);
    this.object.add(this.model.root);
    this.object.add(createBlobShadow(1.3));
    this.sync(0);
  }

  update(dt: number, time: number, move: MoveInput, world: Walkable): void {
    updateMovement(this.state, move, dt, world);
    this.walkPhase += this.state.speed01 * PlayerFeel.walkCycleSpeed * Math.PI * 2 * dt;
    this.sync(time);
  }

  private sync(time: number): void {
    this.object.position.set(this.state.x, 0, this.state.z);
    this.model.root.rotation.y = this.state.heading;
    animatePlayer(this.model, this.state.speed01, this.walkPhase, time);
  }
}
