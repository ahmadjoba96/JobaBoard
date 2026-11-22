import type { ShapeKind } from '../types'

/** Polygon points (flat) for polygonal shape kinds, in a width×height box. */
export function polygonPoints(kind: ShapeKind, w: number, h: number): number[] | null {
  switch (kind) {
    case 'triangle':
      return [w / 2, 0, w, h, 0, h]
    case 'diamond':
      return [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]
    case 'hexagon':
      return [w * 0.25, 0, w * 0.75, 0, w, h / 2, w * 0.75, h, w * 0.25, h, 0, h / 2]
    case 'star': {
      const pts: number[] = []
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 === 0 ? 0.5 : 0.21
        pts.push(w / 2 + Math.cos(a) * w * r, h / 2 + Math.sin(a) * h * r * 1.05 + h * 0.03)
      }
      return pts
    }
    default:
      return null
  }
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  roundRect: 'Rounded rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  diamond: 'Diamond',
  star: 'Star',
  hexagon: 'Hexagon',
  line: 'Line',
  arrow: 'Arrow',
  doubleArrow: 'Double arrow'
}

export const isLineKind = (k: ShapeKind): boolean => k === 'line' || k === 'arrow' || k === 'doubleArrow'
