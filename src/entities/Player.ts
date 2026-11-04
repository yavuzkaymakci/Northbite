import * as THREE from 'three';
import { FishingFeel, PlayerFeel } from '../settings';
import type { MoveInput } from '../core/Input';
import { damp } from '../core/Time';
import {
  animatePlayer,
  applyAppearance,
  createPlayer,
  HAND_POSITION,
  type Appearance,
  type PlayerModel,
  type PlayerPose,
} from '../models/createPlayer';
import { createRod, type RodModel } from '../models/createRod';
import { createBlobShadow } from '../render/BlobShadow';
import { updateMovement, type MoverState, type Walkable } from '../systems/Movement';

/** Player = pure state (`state`) + visuals (`object`). Only `state` is ever saved. */
export class Player {
  readonly state: MoverState;
  readonly object = new THREE.Group();
  readonly rod: RodModel;
  /** Set by the fishing system each frame. */
  readonly pose: PlayerPose = { armsForward: 0, armRaise: 0, lean: 0 };
  private readonly model: PlayerModel;
  private walkPhaseValue = 0;

  constructor(appearance: Appearance, x: number, z: number, heading = 0) {
    this.state = { x, z, vx: 0, vz: 0, heading, speed01: 0 };
    this.model = createPlayer(appearance);
    this.object.add(this.model.root);
    this.object.add(createBlobShadow(1.3));

    this.rod = createRod(FishingFeel.rodLength);
    this.rod.root.position.set(HAND_POSITION.x, HAND_POSITION.y, HAND_POSITION.z);
    this.rod.root.visible = false;
    this.model.body.add(this.rod.root);
    this.sync(0);
  }

  get walkPhase(): number {
    return this.walkPhaseValue;
  }

  /** Character editor result: recolors/swaps parts in place. */
  setAppearance(appearance: Appearance): void {
    applyAppearance(this.model, appearance);
  }

  /** Holds a tool (shovel, torch) in the right hand; its owner toggles `visible`. */
  attachToHand(obj: THREE.Object3D): void {
    obj.position.set(HAND_POSITION.x, HAND_POSITION.y, HAND_POSITION.z);
    this.model.body.add(obj);
  }

  /** Turns smoothly toward a point (while working on something next to the player). */
  faceToward(x: number, z: number, dt: number): void {
    const target = Math.atan2(x - this.state.x, z - this.state.z);
    const diff = Math.atan2(Math.sin(target - this.state.heading), Math.cos(target - this.state.heading));
    this.state.heading += diff * damp(PlayerFeel.turnSharpness, dt);
  }

  /** @param face optional point to turn toward while not walking (e.g. the fishing hole). */
  update(dt: number, time: number, move: MoveInput, world: Walkable, face: { x: number; z: number } | null): void {
    updateMovement(this.state, move, dt, world);
    if (face && move.x === 0 && move.y === 0) {
      const target = Math.atan2(face.x - this.state.x, face.z - this.state.z);
      const diff = Math.atan2(Math.sin(target - this.state.heading), Math.cos(target - this.state.heading));
      this.state.heading += diff * damp(PlayerFeel.turnSharpness, dt);
    }
    this.walkPhaseValue += this.state.speed01 * PlayerFeel.walkCycleSpeed * Math.PI * 2 * dt;
    this.sync(time);
  }

  private sync(time: number): void {
    this.object.position.set(this.state.x, 0, this.state.z);
    this.model.root.rotation.y = this.state.heading;
    animatePlayer(this.model, this.state.speed01, this.walkPhaseValue, time, this.pose);
  }
}
