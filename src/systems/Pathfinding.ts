import { PathGraph, type PathNodeId, type Vec2 } from '../content/zones';

const NODES = PathGraph.nodes as Record<PathNodeId, Vec2>;
const IDS = Object.keys(NODES) as PathNodeId[];

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** Waypoint graph from zones.ts with A* search. Gated edges open once their region is open. */
export class PathGraphNav {
  constructor(private readonly isOpen: (regionId: string) => boolean) {}

  node(id: PathNodeId): Vec2 {
    return NODES[id];
  }

  nearest(p: Vec2): PathNodeId {
    let best = IDS[0] as PathNodeId;
    let bestD = Infinity;
    for (const id of IDS) {
      const d = dist(p, NODES[id]);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private neighbors(id: PathNodeId): PathNodeId[] {
    const out: PathNodeId[] = [];
    for (const e of PathGraph.edges) {
      if ('gate' in e && !this.isOpen(e.gate)) continue;
      if (e.a === id) out.push(e.b);
      else if (e.b === id) out.push(e.a);
    }
    return out;
  }

  /** Node ids from `from` to `to` (both included), or null if unreachable. */
  search(from: PathNodeId, to: PathNodeId): PathNodeId[] | null {
    const g = new Map<PathNodeId, number>([[from, 0]]);
    const came = new Map<PathNodeId, PathNodeId>();
    const open = new Set<PathNodeId>([from]);
    const goal = NODES[to];
    while (open.size > 0) {
      let cur: PathNodeId | null = null;
      let curF = Infinity;
      for (const id of open) {
        const f = (g.get(id) ?? Infinity) + dist(NODES[id], goal);
        if (f < curF) {
          curF = f;
          cur = id;
        }
      }
      if (!cur) break;
      if (cur === to) {
        const path: PathNodeId[] = [cur];
        while (came.has(path[0] as PathNodeId)) path.unshift(came.get(path[0] as PathNodeId) as PathNodeId);
        return path;
      }
      open.delete(cur);
      for (const n of this.neighbors(cur)) {
        const cost = (g.get(cur) as number) + dist(NODES[cur], NODES[n]);
        if (cost < (g.get(n) ?? Infinity)) {
          g.set(n, cost);
          came.set(n, cur);
          open.add(n);
        }
      }
    }
    return null;
  }

  /** World points to walk from a position to a node: nearest node first, then the graph route. */
  route(from: Vec2, to: PathNodeId): Vec2[] {
    const start = this.nearest(from);
    const ids = this.search(start, to) ?? [to];
    return ids.map((id) => NODES[id]);
  }

  /** Length of a route (used by the balance sim). */
  routeLength(from: Vec2, to: PathNodeId): number {
    let len = 0;
    let p = from;
    for (const q of this.route(from, to)) {
      len += dist(p, q);
      p = q;
    }
    return len;
  }
}
