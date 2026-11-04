import * as THREE from 'three';
import type { RectArea } from '../content/zones';
import { RegionFeel } from '../settings';
import { range } from '../core/Random';
import { createIceWall, type IceWallModel } from '../models/createIceWall';
import type { Effects } from '../render/Effects';
import type { RectCollider } from '../systems/Collision';

interface Shard {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  size: THREE.Vector3;
  age: number;
}

type WallPhase = 'standing' | 'cracking' | 'shattered' | 'gone';

/** A breakable ice wall: collider while standing; cracks, then bursts into tumbling shards (GDD §6). */
export class IceWall {
  readonly root = new THREE.Group();
  readonly collider: RectCollider;
  phase: WallPhase = 'standing';
  private readonly model: IceWallModel;
  private readonly shards: Shard[] = [];
  private shardMesh: THREE.InstancedMesh | null = null;
  private t = 0;
  private readonly center: THREE.Vector3;
  private readonly normal: THREE.Vector3;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly crackColor: THREE.Color;

  constructor(rect: RectArea, height: number, seed: number) {
    this.model = createIceWall(rect, height, seed);
    this.root.add(this.model.root);
    this.collider = { kind: 'rect', ...rect };
    this.center = new THREE.Vector3((rect.minX + rect.maxX) / 2, height / 2, (rect.minZ + rect.maxZ) / 2);
    const alongX = rect.maxX - rect.minX >= rect.maxZ - rect.minZ;
    this.normal = alongX ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    this.crackColor = (this.model.cracks.material as THREE.MeshBasicMaterial).color;
  }

  get centerPoint(): THREE.Vector3 {
    return this.center;
  }

  /** Starts the crack-up: shaking and darkening cracks. Call `shatter` when it should burst. */
  crack(): void {
    if (this.phase === 'standing') this.phase = 'cracking';
    this.t = 0;
  }

  shatter(fx: Effects): void {
    if (this.phase === 'shattered' || this.phase === 'gone') return;
    this.phase = 'shattered';
    this.t = 0;
    this.model.blocks.visible = false;
    this.model.cracks.visible = false;
    this.model.root.position.set(0, 0, 0);

    const n = RegionFeel.shardCount;
    for (const b of this.model.blockTransforms) {
      const sx = b.sx ?? 1;
      const sy = b.sy ?? 1;
      const sz = b.sz ?? 1;
      for (let i = 0; i < n; i++) {
        const pos = new THREE.Vector3(b.x + range(Math.random, -0.4, 0.4) * sx, (b.y ?? 0) + range(Math.random, -0.4, 0.4) * sy, b.z + range(Math.random, -0.4, 0.4) * sz);
        // Fly out to either side of the wall, mostly upward.
        const side = Math.random() < 0.5 ? -1 : 1;
        const out = this.normal.clone().multiplyScalar(side * range(Math.random, 1.5, 4.5));
        const vel = new THREE.Vector3(out.x + range(Math.random, -1.2, 1.2), range(Math.random, 2.5, 6), out.z + range(Math.random, -1.2, 1.2));
        const s = i < 2 ? range(Math.random, 0.38, 0.55) : range(Math.random, 0.15, 0.36);
        this.shards.push({
          pos,
          vel,
          rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
          spin: new THREE.Vector3(range(Math.random, -9, 9), range(Math.random, -9, 9), range(Math.random, -9, 9)),
          size: new THREE.Vector3(s, s * range(Math.random, 0.6, 1.2), s * range(Math.random, 0.7, 1.3)),
          age: 0,
        });
      }
      fx.splash(b.x, (b.y ?? 0) + sy * 0.3, b.z, 12, 3.6, 0);
      fx.smoke(b.x, 0.3, b.z, 0.5); // snow dust
    }
    this.shardMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), this.model.material, this.shards.length);
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shardMesh.frustumCulled = false;
    this.root.add(this.shardMesh);
  }

  update(dt: number): void {
    this.t += dt;
    if (this.phase === 'cracking') {
      const k = Math.min(this.t / RegionFeel.crackTime, 1);
      const a = 0.02 + 0.06 * k;
      this.model.root.position.set(Math.sin(this.t * 61) * a, 0, Math.cos(this.t * 47) * a);
      this.crackColor.setRGB(0.36 * (1 - k) + 0.12 * k, 0.56 * (1 - k) + 0.25 * k, 0.68 * (1 - k) + 0.4 * k);
      return;
    }
    if (this.phase !== 'shattered' || !this.shardMesh) return;
    let alive = 0;
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i] as Shard;
      s.age += dt;
      s.vel.y -= 14 * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < s.size.y * 0.5) {
        s.pos.y = s.size.y * 0.5;
        s.vel.y *= -0.3;
        s.vel.x *= 0.6;
        s.vel.z *= 0.6;
        s.spin.multiplyScalar(0.6);
      }
      s.rot.x += s.spin.x * dt;
      s.rot.y += s.spin.y * dt;
      s.rot.z += s.spin.z * dt;
      const life = RegionFeel.shardLife;
      const shrink = s.age < life * 0.55 ? 1 : Math.max(0, 1 - (s.age - life * 0.55) / (life * 0.45));
      if (shrink > 0) alive++;
      this.m.compose(s.pos, this.q.setFromEuler(s.rot), new THREE.Vector3().copy(s.size).multiplyScalar(Math.max(shrink, 0.0001)));
      this.shardMesh.setMatrixAt(i, this.m);
    }
    this.shardMesh.instanceMatrix.needsUpdate = true;
    if (alive === 0) {
      this.phase = 'gone';
      this.root.removeFromParent();
    }
  }
}
