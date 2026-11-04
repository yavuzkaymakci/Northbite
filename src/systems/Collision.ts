import type { RectArea } from '../content/zones';

// Hand-written 2D collisions on the XZ plane (no physics engine).

export interface CircleCollider {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
}

export interface RectCollider extends RectArea {
  kind: 'rect';
}

export type Collider = CircleCollider | RectCollider;

export interface Body2D {
  x: number;
  z: number;
}

/** Pushes a circle out of a static circle. Returns true if they overlapped. */
export function pushOutOfCircle(b: Body2D, r: number, c: CircleCollider): boolean {
  const dx = b.x - c.x;
  const dz = b.z - c.z;
  const min = r + c.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-6) {
    b.x = c.x + min; // exactly centered: pick any direction
    return true;
  }
  const push = (min - d) / d;
  b.x += dx * push;
  b.z += dz * push;
  return true;
}

/** Pushes a circle out of an axis-aligned rectangle. Returns true if they overlapped. */
export function pushOutOfRect(b: Body2D, r: number, rect: RectArea): boolean {
  const cx = Math.min(Math.max(b.x, rect.minX), rect.maxX);
  const cz = Math.min(Math.max(b.z, rect.minZ), rect.maxZ);
  const dx = b.x - cx;
  const dz = b.z - cz;
  const d2 = dx * dx + dz * dz;

  if (d2 > 1e-12) {
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    b.x += dx * push;
    b.z += dz * push;
    return true;
  }

  // Center is inside the rectangle: exit through the nearest side.
  const left = b.x - rect.minX;
  const right = rect.maxX - b.x;
  const top = b.z - rect.minZ;
  const bottom = rect.maxZ - b.z;
  const m = Math.min(left, right, top, bottom);
  if (m === left) b.x = rect.minX - r;
  else if (m === right) b.x = rect.maxX + r;
  else if (m === top) b.z = rect.minZ - r;
  else b.z = rect.maxZ + r;
  return true;
}

/** Keeps a circle fully inside an area. */
export function clampInside(b: Body2D, r: number, area: RectArea): void {
  b.x = Math.min(Math.max(b.x, area.minX + r), area.maxX - r);
  b.z = Math.min(Math.max(b.z, area.minZ + r), area.maxZ - r);
}

export function resolveCollisions(b: Body2D, r: number, colliders: readonly Collider[], bounds: RectArea): void {
  // A couple of passes settle cases where pushing out of one obstacle moves the body into another.
  for (let pass = 0; pass < 3; pass++) {
    let hit = false;
    for (const c of colliders) {
      hit = (c.kind === 'circle' ? pushOutOfCircle(b, r, c) : pushOutOfRect(b, r, c)) || hit;
    }
    clampInside(b, r, bounds);
    if (!hit) break;
  }
}
