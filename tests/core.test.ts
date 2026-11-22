import { describe, it, expect } from 'vitest'
import { recognizeShape, snapToRuler } from '../src/renderer/src/board/ink'
import { strokeHit, splitStroke, objBounds, pointInPolygon } from '../src/renderer/src/board/geometry'
import { BoardDoc, toBase64, fromBase64 } from '../src/renderer/src/board/doc'
import { serialize, parse, prepareForPaste } from '../src/renderer/src/board/clipboard'
import { TEMPLATES } from '../src/renderer/src/board/templates'
import { toSvg } from '../src/renderer/src/board/export'
import type { BoardObj, NewObj } from '../src/renderer/src/types'

function circle(cx: number, cy: number, r: number, n = 60): number[] {
  const out: number[] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  return out
}

function polyline(corners: [number, number][], stepsPerEdge = 15): number[] {
  const out: number[] = []
  for (let i = 0; i < corners.length; i++) {
    const [x1, y1] = corners[i]
    const [x2, y2] = corners[(i + 1) % corners.length]
    for (let s = 0; s < stepsPerEdge; s++) {
      const t = s / stepsPerEdge
      out.push(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)
    }
  }
  out.push(corners[0][0], corners[0][1])
  return out
}

describe('ink to shape', () => {
  it('recognises a circle as an ellipse', () => {
    expect(recognizeShape(circle(200, 200, 80))?.kind).toBe('ellipse')
  })
  it('recognises a rectangle', () => {
    expect(recognizeShape(polyline([[0, 0], [200, 0], [200, 120], [0, 120]]))?.kind).toBe('rect')
  })
  it('recognises a triangle', () => {
    expect(recognizeShape(polyline([[100, 0], [200, 170], [0, 170]]))?.kind).toBe('triangle')
  })
  it('recognises a straight line', () => {
    const pts: number[] = []
    for (let i = 0; i <= 30; i++) pts.push(i * 10, i * 5 + (i % 2))
    const r = recognizeShape(pts)
    expect(r?.kind).toBe('line')
    expect(r?.line).toEqual([0, 0, 300, 150])
  })
  it('ignores scribbles', () => {
    const pts: number[] = []
    for (let i = 0; i < 40; i++) pts.push(i * 7, (i % 2) * 60)
    expect(recognizeShape(pts)).toBeNull()
  })
})

describe('ruler', () => {
  it('snaps strokes that start at the ruler edge', () => {
    const r = snapToRuler([10, 5, 50, 12, 120, -4], { x: 0, y: 0, angle: 0, length: 500 }, 20)
    expect(r).toEqual([0 + 10, 0, 120, 0])
  })
  it('ignores strokes away from the ruler', () => {
    expect(snapToRuler([10, 200, 50, 210], { x: 0, y: 0, angle: 0, length: 500 }, 20)).toBeNull()
  })
})

describe('geometry', () => {
  const stroke = { x: 100, y: 100, rotation: 0, points: [0, 0, 100, 0], width: 4 }
  it('hit-tests strokes', () => {
    expect(strokeHit(stroke, 150, 102, 3)).toBe(true)
    expect(strokeHit(stroke, 150, 130, 3)).toBe(false)
  })
  it('point-erases the middle of a stroke', () => {
    const s = { ...stroke, points: Array.from({ length: 21 }, (_, i) => [i * 5, 0]).flat() }
    const runs = splitStroke(s, 150, 100, 6)
    expect(runs.length).toBe(2)
  })
  it('computes rotated bounds', () => {
    const b = objBounds({ id: 'a', type: 'note', x: 0, y: 0, rotation: 90, z: 1, text: '', width: 100, height: 50, color: '#fff' })
    expect(Math.round(b.width)).toBe(50)
    expect(Math.round(b.height)).toBe(100)
  })
  it('point in polygon', () => {
    expect(pointInPolygon(5, 5, [0, 0, 10, 0, 10, 10, 0, 10])).toBe(true)
    expect(pointInPolygon(15, 5, [0, 0, 10, 0, 10, 10, 0, 10])).toBe(false)
  })
})

describe('board doc', () => {
  const note: NewObj = { type: 'note', x: 0, y: 0, rotation: 0, text: 'hi', width: 100, height: 100, color: '#ff0' }
  it('adds, undoes and redoes', () => {
    const b = new BoardDoc()
    const o = b.add(note)
    expect(b.list()).toHaveLength(1)
    b.undo.undo()
    expect(b.get(o.id)).toBeUndefined()
    b.undo.redo()
    expect(b.get(o.id)?.type).toBe('note')
  })
  it('round-trips through encoded storage', () => {
    const b = new BoardDoc()
    b.add(note)
    b.setSetting('name', 'Plan')
    const restored = new BoardDoc(fromBase64(toBase64(b.encode())))
    expect(restored.list()).toHaveLength(1)
    expect(restored.settings().name).toBe('Plan')
  })
  it('reorders z', () => {
    const b = new BoardDoc()
    const a = b.add(note)
    const c = b.add(note)
    b.bringToFront([a.id])
    expect(b.list().map((o) => o.id)).toEqual([c.id, a.id])
    b.sendToBack([a.id])
    expect(b.list().map((o) => o.id)).toEqual([a.id, c.id])
  })
})

describe('clipboard', () => {
  it('serializes and re-ids objects on paste, keeping groups', () => {
    const objs: BoardObj[] = [
      { id: 'a', z: 1, type: 'note', x: 0, y: 0, rotation: 0, text: 'x', width: 100, height: 100, color: '#ff0', groupId: 'g1' },
      { id: 'b', z: 2, type: 'note', x: 200, y: 0, rotation: 0, text: 'y', width: 100, height: 100, color: '#ff0', groupId: 'g1' }
    ]
    const parsed = parse(serialize(objs))!
    expect(parsed).toHaveLength(2)
    const pasted = prepareForPaste(parsed, 1000, 1000)
    expect(pasted[0].groupId).toBeTruthy()
    expect(pasted[0].groupId).toBe(pasted[1].groupId)
    expect(pasted[0].groupId).not.toBe('g1')
    expect(pasted[0].x).toBe(850)
    expect(parse('hello')).toBeNull()
  })
})

describe('templates and export', () => {
  it('every template builds objects', () => {
    for (const t of TEMPLATES) expect(t.build(0, 0).length).toBeGreaterThan(0)
  })
  it('exports svg', () => {
    const b = new BoardDoc()
    b.addMany(TEMPLATES[0].build(0, 0))
    const svg = toSvg(b.list(), '#fff')!
    expect(svg.startsWith('<?xml')).toBe(true)
    expect(svg).toContain('<svg')
  })
})
