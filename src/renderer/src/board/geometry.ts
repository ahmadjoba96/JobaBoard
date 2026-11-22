import type { BoardObj, Bounds } from '../types'

export function strokeBounds(points: number[]): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]
    const y = points[i + 1]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Estimated height for a text object (used for hit tests / export before render). */
export function estimateTextHeight(text: string, width: number, fontSize: number): number {
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.55)))
  const lines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / charsPerLine)), 0)
  return lines * fontSize * 1.25 + 8
}

/** Local (unrotated) bounds relative to the object's x/y. */
export function localBounds(o: BoardObj): Bounds {
  switch (o.type) {
    case 'stroke': {
      const b = strokeBounds(o.points)
      const pad = o.width / 2
      return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 }
    }
    case 'shape':
      return {
        x: Math.min(0, o.width),
        y: Math.min(0, o.height),
        width: Math.abs(o.width),
        height: Math.abs(o.height)
      }
    case 'text':
      return { x: 0, y: 0, width: o.width, height: estimateTextHeight(o.text || ' ', o.width, o.fontSize) }
    case 'reaction':
      return { x: 0, y: 0, width: o.size, height: o.size }
    default:
      return { x: 0, y: 0, width: o.width, height: o.height }
  }
}

/** World axis-aligned bounds including rotation. */
export function objBounds(o: BoardObj): Bounds {
  const lb = localBounds(o)
  const rot = ((o.rotation || 0) * Math.PI) / 180
  if (!rot) return { x: o.x + lb.x, y: o.y + lb.y, width: lb.width, height: lb.height }
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const corners = [
    [lb.x, lb.y],
    [lb.x + lb.width, lb.y],
    [lb.x, lb.y + lb.height],
    [lb.x + lb.width, lb.y + lb.height]
  ].map(([px, py]) => [o.x + px * cos - py * sin, o.y + px * sin + py * cos])
  const xs = corners.map((c) => c[0])
  const ys = corners.map((c) => c[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (!list.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of list) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function boundsOf(objs: BoardObj[]): Bounds | null {
  return unionBounds(objs.map(objBounds))
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function contains(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

/** Convert world point to stroke-local (accounting rotation). */
export function toLocal(o: { x: number; y: number; rotation: number }, wx: number, wy: number): [number, number] {
  const rot = (-(o.rotation || 0) * Math.PI) / 180
  const dx = wx - o.x
  const dy = wy - o.y
  return [dx * Math.cos(rot) - dy * Math.sin(rot), dx * Math.sin(rot) + dy * Math.cos(rot)]
}

export function pointInPolygon(x: number, y: number, poly: number[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i]
    const yi = poly[i + 1]
    const xj = poly[j]
    const yj = poly[j + 1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function strokeHit(
  o: { x: number; y: number; rotation: number; points: number[]; width: number },
  wx: number,
  wy: number,
  radius: number
): boolean {
  const [lx, ly] = toLocal(o, wx, wy)
  const r = radius + o.width / 2
  const p = o.points
  if (p.length === 2) return Math.hypot(lx - p[0], ly - p[1]) <= r
  for (let i = 0; i < p.length - 2; i += 2) {
    if (distToSegment(lx, ly, p[i], p[i + 1], p[i + 2], p[i + 3]) <= r) return true
  }
  return false
}

/**
 * Point-erase: remove the parts of a stroke within radius of (wx, wy).
 * Returns the remaining point runs (local coords). Empty array = fully erased.
 */
export function splitStroke(
  o: { x: number; y: number; rotation: number; points: number[]; width: number },
  wx: number,
  wy: number,
  radius: number
): number[][] {
  const [lx, ly] = toLocal(o, wx, wy)
  const r = radius + o.width / 2
  const runs: number[][] = []
  let cur: number[] = []
  for (let i = 0; i < o.points.length; i += 2) {
    const x = o.points[i]
    const y = o.points[i + 1]
    if (Math.hypot(x - lx, y - ly) <= r) {
      if (cur.length >= 4) runs.push(cur)
      cur = []
    } else {
      cur.push(x, y)
    }
  }
  if (cur.length >= 4) runs.push(cur)
  return runs
}
