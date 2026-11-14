import type { PlaneId } from "../viewport";

/** A 2D point in the sketch plane's own coordinates (millimetres). */
export interface Vec {
  x: number;
  y: number;
}

export type Entity =
  | { id: number; kind: "line"; a: Vec; b: Vec }
  | { id: number; kind: "rect"; a: Vec; b: Vec }
  | { id: number; kind: "circle"; c: Vec; r: number }
  /** Counter-clockwise from `start` to `start + sweep` (radians). */
  | { id: number; kind: "arc"; c: Vec; r: number; start: number; sweep: number };

export type EntityKind = Entity["kind"];

export interface Sketch {
  id: number;
  name: string;
  plane: PlaneId;
  entities: Entity[];
}

export const v = (x: number, y: number): Vec => ({ x, y });
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const angleOf = (c: Vec, p: Vec) => Math.atan2(p.y - c.y, p.x - c.x);
export const polar = (c: Vec, r: number, ang: number): Vec => v(c.x + r * Math.cos(ang), c.y + r * Math.sin(ang));

/** Normalise an angle to [0, 2π). */
export const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

export const rectCorners = (e: { a: Vec; b: Vec }): Vec[] => [
  e.a,
  v(e.b.x, e.a.y),
  e.b,
  v(e.a.x, e.b.y),
];

/** Points used to draw an entity as a polyline. */
export function outline(e: Entity): Vec[] {
  switch (e.kind) {
    case "line":
      return [e.a, e.b];
    case "rect": {
      const c = rectCorners(e);
      return [...c, c[0]];
    }
    case "circle":
      return arcPoints(e.c, e.r, 0, 2 * Math.PI);
    case "arc":
      return arcPoints(e.c, e.r, e.start, e.sweep);
  }
}

function arcPoints(c: Vec, r: number, start: number, sweep: number): Vec[] {
  const n = Math.max(8, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * 96));
  const pts: Vec[] = [];
  for (let i = 0; i <= n; i++) pts.push(polar(c, r, start + (sweep * i) / n));
  return pts;
}

/** Points other entities can snap to: ends, corners, centres, midpoints. */
export function snapPoints(e: Entity): Vec[] {
  switch (e.kind) {
    case "line":
      return [e.a, e.b, v((e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2)];
    case "rect":
      return rectCorners(e);
    case "circle":
      return [e.c, polar(e.c, e.r, 0), polar(e.c, e.r, Math.PI / 2), polar(e.c, e.r, Math.PI), polar(e.c, e.r, -Math.PI / 2)];
    case "arc":
      return [e.c, polar(e.c, e.r, e.start), polar(e.c, e.r, e.start + e.sweep)];
  }
}

function segDist(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return dist(p, v(a.x + t * dx, a.y + t * dy));
}

/** Distance from a point to the drawn entity. */
export function distanceTo(e: Entity, p: Vec): number {
  switch (e.kind) {
    case "line":
      return segDist(p, e.a, e.b);
    case "rect": {
      const c = rectCorners(e);
      return Math.min(...c.map((q, i) => segDist(p, q, c[(i + 1) % 4])));
    }
    case "circle":
      return Math.abs(dist(p, e.c) - e.r);
    case "arc": {
      const rel = norm(angleOf(e.c, p) - e.start);
      if (rel <= e.sweep) return Math.abs(dist(p, e.c) - e.r);
      return Math.min(dist(p, polar(e.c, e.r, e.start)), dist(p, polar(e.c, e.r, e.start + e.sweep)));
    }
  }
}

export const ENTITY_NAMES: Record<EntityKind, string> = {
  line: "Đường thẳng",
  rect: "Hình chữ nhật",
  circle: "Đường tròn",
  arc: "Cung tròn",
};
