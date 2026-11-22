import type { ShapeKind } from '../types'
import { strokeBounds } from './geometry'

export interface RecognizedShape {
  kind: ShapeKind
  /** shape bounds (world/local same space as input) */
  x: number
  y: number
  width: number
  height: number
  /** for lines/arrows: endpoints */
  line?: [number, number, number, number]
}

type Pt = [number, number]

function toPts(flat: number[]): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]])
  return out
}

function pathLength(p: Pt[]): number {
  let l = 0
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
  return l
}

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (!len) return Math.hypot(p[0] - a[0], p[1] - a[1])
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len
}

/** Ramer–Douglas–Peucker simplification */
export function rdp(points: Pt[], eps: number): Pt[] {
  if (points.length < 3) return points
  let maxD = 0
  let idx = 0
  const end = points.length - 1
  for (let i = 1; i < end; i++) {
    const d = perpDist(points[i], points[0], points[end])
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD > eps) {
    const left = rdp(points.slice(0, idx + 1), eps)
    const right = rdp(points.slice(idx), eps)
    return left.slice(0, -1).concat(right)
  }
  return [points[0], points[end]]
}

export function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: Pt, a: Pt, b: Pt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Pt[] = []
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop()
    lower.push(pt)
  }
  const upper: Pt[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop()
    upper.push(pt)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

function polygonArea(p: Pt[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length
    a += p[i][0] * p[j][1] - p[j][0] * p[i][1]
  }
  return Math.abs(a / 2)
}

/**
 * Recognise a hand-drawn stroke as a geometric shape (ink-to-shape).
 * Returns null when the stroke doesn't look like a clean shape.
 */
export function recognizeShape(flat: number[]): RecognizedShape | null {
  const pts = toPts(flat)
  if (pts.length < 4) return null
  const b = strokeBounds(flat)
  const diag = Math.hypot(b.width, b.height)
  if (diag < 20) return null
  const len = pathLength(pts)
  const first = pts[0]
  const last = pts[pts.length - 1]
  const endGap = Math.hypot(last[0] - first[0], last[1] - first[1])

  // straight line
  if (endGap / len > 0.92) {
    return {
      kind: 'line',
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      line: [first[0], first[1], last[0], last[1]]
    }
  }

  const closed = endGap < diag * 0.25
  if (!closed) return null

  const hull = convexHull(pts)
  const hullArea = polygonArea(hull)
  const bboxArea = b.width * b.height || 1
  const fill = hullArea / bboxArea

  // circularity: radial distance variance from the centroid
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  const ellipseDev =
    pts.reduce((s, p) => {
      const nx = (p[0] - cx) / (b.width / 2 || 1)
      const ny = (p[1] - cy) / (b.height / 2 || 1)
      return s + Math.abs(Math.hypot(nx, ny) - 1)
    }, 0) / pts.length

  const simplified = rdp(hull.concat([hull[0]]), diag * 0.08)
  const corners = Math.max(0, simplified.length - 1)

  const base = { x: b.x, y: b.y, width: b.width, height: b.height }

  if (corners === 3 && fill < 0.7) return { kind: 'triangle', ...base }
  if (corners === 4) {
    if (fill > 0.85) return { kind: 'rect', ...base }
    if (fill > 0.4 && fill < 0.65) return { kind: 'diamond', ...base }
  }
  if (ellipseDev < 0.12 && fill > 0.68 && fill < 0.88) return { kind: 'ellipse', ...base }
  if (fill > 0.88 && corners <= 6) return { kind: 'rect', ...base }
  if (ellipseDev < 0.18) return { kind: 'ellipse', ...base }
  return null
}

/** Project points onto the ruler edge line when the stroke starts near it. */
export function snapToRuler(
  flat: number[],
  ruler: { x: number; y: number; angle: number; length: number },
  threshold: number
): number[] | null {
  if (flat.length < 4) return null
  const a = (ruler.angle * Math.PI) / 180
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  const proj = (px: number, py: number): { t: number; d: number } => {
    const dx = px - ruler.x
    const dy = py - ruler.y
    return { t: dx * ux + dy * uy, d: Math.abs(-dx * uy + dy * ux) }
  }
  const p0 = proj(flat[0], flat[1])
  if (p0.d > threshold || p0.t < -threshold || p0.t > ruler.length + threshold) return null
  let minT = Infinity
  let maxT = -Infinity
  for (let i = 0; i < flat.length; i += 2) {
    const { t } = proj(flat[i], flat[i + 1])
    minT = Math.min(minT, t)
    maxT = Math.max(maxT, t)
  }
  return [ruler.x + ux * minT, ruler.y + uy * minT, ruler.x + ux * maxT, ruler.y + uy * maxT]
}

/** Light smoothing for freehand ink (moving average). */
export function smooth(flat: number[], window = 2): number[] {
  if (flat.length < 8) return flat
  const out: number[] = []
  const n = flat.length / 2
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1) {
      out.push(flat[i * 2], flat[i * 2 + 1])
      continue
    }
    let sx = 0
    let sy = 0
    let c = 0
    for (let j = Math.max(0, i - window); j <= Math.min(n - 1, i + window); j++) {
      sx += flat[j * 2]
      sy += flat[j * 2 + 1]
      c++
    }
    out.push(sx / c, sy / c)
  }
  return out
}
