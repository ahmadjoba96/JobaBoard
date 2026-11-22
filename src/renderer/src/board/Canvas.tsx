import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer, Shape, Line, Rect, Circle, Transformer, Group, Text, Path } from 'react-konva'
import type { Awareness } from 'y-protocols/awareness'
import type { BoardObj, BackgroundType, NewObj, ShapeKind, UserPresence } from '../types'
import type { BoardDoc } from './doc'
import type { Actions } from './actions'
import { useUI } from './store'
import { ObjectNode } from './ObjectNode'
import { boundsOf, intersects, objBounds, pointInPolygon, splitStroke, strokeHit, toLocal, strokeBounds } from './geometry'
import { recognizeShape, smooth, snapToRuler } from './ink'
import { isLineKind } from './shapes'
import { openUrl } from '../api'

export interface Peer {
  clientId: number
  state: UserPresence & { laser?: number[] | null }
}

interface Props {
  board: BoardDoc
  objects: BoardObj[]
  actions: Actions
  bgType: BackgroundType
  bgColor: string
  dark: boolean
  awareness: Awareness | null
  peers: Peer[]
  onContextMenu: (x: number, y: number) => void
}

type Mode = 'none' | 'pan' | 'draw' | 'erase' | 'lasso' | 'marquee' | 'shape' | 'laser' | 'pinch'

const GRID = 40

function Background({ type, w, h, vx, vy, s, dark }: { type: BackgroundType; w: number; h: number; vx: number; vy: number; s: number; dark: boolean }): JSX.Element | null {
  if (type === 'blank') return null
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        let step = GRID
        while (step * s < 16) step *= 2
        const x0 = Math.floor(-vx / s / step) * step - step
        const y0 = Math.floor(-vy / s / step) * step - step
        const x1 = -vx / s + w / s + step
        const y1 = -vy / s + h / s + step
        const color = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.13)'
        const c = ctx._context
        c.save()
        if (type === 'dots') {
          c.fillStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)'
          const r = 1.5 / s
          for (let x = x0; x < x1; x += step) {
            for (let y = y0; y < y1; y += step) {
              c.beginPath()
              c.arc(x, y, r, 0, Math.PI * 2)
              c.fill()
            }
          }
        } else {
          c.strokeStyle = color
          c.lineWidth = 1 / s
          c.beginPath()
          if (type === 'grid') {
            for (let x = x0; x < x1; x += step) {
              c.moveTo(x, y0)
              c.lineTo(x, y1)
            }
          }
          if (type === 'grid' || type === 'lines') {
            for (let y = y0; y < y1; y += step) {
              c.moveTo(x0, y)
              c.lineTo(x1, y)
            }
          }
          if (type === 'isometric') {
            const t = Math.tan(Math.PI / 6)
            const span = (y1 - y0) / t
            for (let x = x0 - span; x < x1 + span; x += step / t) {
              c.moveTo(x, y0)
              c.lineTo(x + (y1 - y0) / t, y1)
              c.moveTo(x, y1)
              c.lineTo(x + (y1 - y0) / t, y0)
            }
            for (let y = y0; y < y1; y += step) {
              c.moveTo(x0, y)
              c.lineTo(x1, y)
            }
          }
          c.stroke()
        }
        c.restore()
      }}
    />
  )
}

function Ruler({ s }: { s: number }): JSX.Element | null {
  const ruler = useUI((st) => st.ruler)
  const set = useUI((st) => st.set)
  if (!ruler.visible) return null
  const H = 72
  return (
    <Group
      name="ruler"
      x={ruler.x}
      y={ruler.y}
      rotation={ruler.angle}
      draggable
      onDragEnd={(e) => set({ ruler: { ...ruler, x: e.target.x(), y: e.target.y() } })}
      onWheel={(e) => {
        if (e.evt.ctrlKey) return
        e.evt.preventDefault()
        e.cancelBubble = true
        const step = e.evt.shiftKey ? 15 : 1
        const angle = (ruler.angle + (e.evt.deltaY > 0 ? step : -step) + 360) % 360
        set({ ruler: { ...ruler, angle } })
      }}
    >
      <Rect width={ruler.length} height={H} fill="rgba(240,240,245,0.88)" stroke="#9fa8da" strokeWidth={1 / s} shadowColor="#000" shadowOpacity={0.15} shadowBlur={8} cornerRadius={4} />
      <Shape
        listening={false}
        sceneFunc={(ctx) => {
          const c = ctx._context
          c.strokeStyle = '#5c6bc0'
          c.lineWidth = 1
          c.beginPath()
          for (let x = 0; x <= ruler.length; x += 10) {
            const len = x % 100 === 0 ? 22 : x % 50 === 0 ? 15 : 8
            c.moveTo(x, 0)
            c.lineTo(x, len)
          }
          c.stroke()
          c.fillStyle = '#3949ab'
          c.font = '11px Segoe UI'
          for (let x = 100; x < ruler.length; x += 100) c.fillText(String(x / 10), x - 6, 36)
        }}
      />
      <Text text={`${Math.round(ruler.angle)}°`} x={ruler.length / 2 - 30} y={44} width={60} align="center" fontSize={16} fontStyle="bold" fill="#3949ab" listening={false} />
      <Text text="⟳ scroll to rotate" x={10} y={52} fontSize={10} fill="#7986cb" listening={false} />
    </Group>
  )
}

function PeerCursor({ p, s }: { p: Peer; s: number }): JSX.Element | null {
  const c = p.state.cursor
  if (!c) return null
  return (
    <Group x={c.x} y={c.y} scaleX={1 / s} scaleY={1 / s} listening={false}>
      <Path data="M0 0 L0 18 L5 13 L9 22 L12 21 L8 12 L15 12 Z" fill={p.state.color} stroke="#fff" strokeWidth={1.5} />
      <Rect x={14} y={18} height={22} width={Math.max(40, p.state.name.length * 8 + 14)} fill={p.state.color} cornerRadius={11} />
      <Text x={21} y={22} text={p.state.name} fill="#fff" fontSize={13} fontStyle="bold" />
    </Group>
  )
}

export function Canvas({ board, objects, actions, bgType, bgColor, dark, awareness, peers, onContextMenu }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const liveRef = useRef<Konva.Line>(null)
  const laserRef = useRef<Konva.Line>(null)
  const eraserRef = useRef<Konva.Circle>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [preview, setPreview] = useState<
    | null
    | { kind: 'marquee'; x: number; y: number; w: number; h: number }
    | { kind: 'lasso'; points: number[] }
    | { kind: 'shape'; obj: NewObj }
  >(null)

  const ui = useUI()
  const { viewport, tool, selection, readOnly } = ui
  const s = viewport.scale

  const mode = useRef<Mode>('none')
  const start = useRef({ x: 0, y: 0, sx: 0, sy: 0, vx: 0, vy: 0 })
  const pts = useRef<number[]>([])
  const pressures = useRef<number[]>([])
  const pointerType = useRef('mouse')
  const spaceDown = useRef(false)
  const pinch = useRef<{ dist: number; cx: number; cy: number; vp: typeof viewport } | null>(null)
  const lastAware = useRef(0)
  const laserTimer = useRef<number>(0)
  const dragStartPos = useRef<{ x: number; y: number } | null>(null)

  // latest-value refs so stable callbacks see current state
  const objsRef = useRef(objects)
  objsRef.current = objects

  useEffect(() => {
    actions.stage = stageRef.current
    actions.layer = layerRef.current
  })

  // size
  useEffect(() => {
    const el = containerRef.current!
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // space to pan
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('input,textarea,[contenteditable]')) {
        spaceDown.current = true
        if (containerRef.current) containerRef.current.style.cursor = 'grab'
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        spaceDown.current = false
        if (containerRef.current) containerRef.current.style.cursor = ''
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // attach transformer
  const selectedObjs = useMemo(() => selection.map((id) => board.get(id)).filter(Boolean) as BoardObj[], [selection, objects, board])
  useEffect(() => {
    const tr = trRef.current
    const layer = layerRef.current
    if (!tr || !layer) return
    if (tool !== 'select' || readOnly) {
      tr.nodes([])
      return
    }
    const ids = new Set(selection)
    const nodes = layer.find('.obj').filter((n) => ids.has(n.id()) && n.id() !== ui.editingId)
    tr.nodes(nodes)
    const anyLocked = selectedObjs.some((o) => o.locked)
    const single = selectedObjs.length === 1 ? selectedObjs[0] : null
    tr.resizeEnabled(!anyLocked)
    tr.rotateEnabled(!anyLocked)
    tr.keepRatio(!!single && (single.type === 'image' || single.type === 'reaction'))
    tr.enabledAnchors(
      single?.type === 'text'
        ? ['middle-left', 'middle-right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']
        : ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']
    )
    tr.borderStroke(anyLocked ? '#9e9e9e' : '#3f51b5')
    tr.getLayer()?.batchDraw()
  }, [selection, objects, tool, readOnly, ui.editingId, selectedObjs])

  const world = useCallback((): { x: number; y: number } => {
    const st = stageRef.current!
    return st.getRelativePointerPosition() ?? { x: 0, y: 0 }
  }, [])

  const broadcast = useCallback(
    (patch: Partial<UserPresence> & { laser?: number[] | null }, force = false) => {
      if (!awareness) return
      const now = performance.now()
      if (!force && now - lastAware.current < 40) return
      lastAware.current = now
      const cur = awareness.getLocalState() ?? {}
      awareness.setLocalState({ ...cur, ...patch })
    },
    [awareness]
  )

  // ---------- erasing ----------
  const eraseAt = useCallback(
    (wx: number, wy: number) => {
      const st = useUI.getState()
      const r = st.eraserSize / st.viewport.scale
      const probe = { x: wx - r, y: wy - r, width: r * 2, height: r * 2 }
      const toRemove: string[] = []
      const toAdd: NewObj[] = []
      for (const o of objsRef.current) {
        if (o.type !== 'stroke' || o.locked) continue
        if (!intersects(objBounds(o), probe)) continue
        if (!strokeHit(o, wx, wy, r)) continue
        toRemove.push(o.id)
        if (st.eraserMode === 'point') {
          for (const run of splitStroke(o, wx, wy, r)) {
            const { id: _i, z: _z, ...rest } = o
            toAdd.push({ ...rest, points: run } as NewObj)
          }
        }
      }
      if (!toRemove.length) return
      board.transact(() => {
        board.remove(toRemove)
        if (toAdd.length) board.addMany(toAdd)
      })
    },
    [board]
  )

  // ---------- pointer handlers ----------
  const onPointerDown = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      const evt = e.evt
      const st = useUI.getState()
      pointerType.current = evt.pointerType
      if (mode.current === 'pinch') return
      const stage = stageRef.current!
      const p = world()
      start.current = { x: p.x, y: p.y, sx: evt.clientX, sy: evt.clientY, vx: st.viewport.x, vy: st.viewport.y }
      if (evt.button === 2) return
      if (evt.button === 1 || spaceDown.current || st.tool === 'pan') {
        mode.current = 'pan'
        evt.preventDefault()
        if (containerRef.current) containerRef.current.style.cursor = 'grabbing'
        return
      }
      if (e.target.findAncestor('.ruler', true) || e.target.getParent()?.name() === 'ruler') return
      const objNode = e.target.findAncestor('.obj', true) as Konva.Node | undefined
      const isTransformer = !!e.target.findAncestor('Transformer', true)
      if (isTransformer) return

      if (st.readOnly && st.tool !== 'laser') {
        mode.current = 'pan'
        return
      }

      switch (st.tool) {
        case 'select': {
          if (objNode) {
            const id = objNode.id()
            const ids = actions.expandGroups([id])
            if (evt.shiftKey || evt.ctrlKey || evt.metaKey) {
              const has = st.selection.includes(id)
              st.select(has ? st.selection.filter((x) => !ids.includes(x)) : Array.from(new Set([...st.selection, ...ids])))
            } else if (!st.selection.includes(id)) {
              st.select(ids)
            }
            return
          }
          if (!evt.shiftKey) st.select([])
          mode.current = 'marquee'
          setPreview({ kind: 'marquee', x: p.x, y: p.y, w: 0, h: 0 })
          return
        }
        case 'pen':
        case 'highlighter':
        case 'pencil': {
          mode.current = 'draw'
          pts.current = [p.x, p.y]
          pressures.current = [evt.pressure || 0.5]
          const line = liveRef.current!
          const color = st.tool === 'pen' ? st.penColor : st.tool === 'pencil' ? st.pencilColor : st.highlighterColor
          const width = st.tool === 'pen' ? st.penWidth : st.tool === 'pencil' ? st.pencilWidth : st.highlighterWidth
          line.setAttrs({
            points: [p.x, p.y, p.x + 0.01, p.y],
            stroke: color,
            strokeWidth: width,
            opacity: st.tool === 'highlighter' ? 0.45 : st.tool === 'pencil' ? 0.85 : 1,
            lineCap: st.tool === 'highlighter' ? 'square' : 'round',
            visible: true
          })
          line.getLayer()?.batchDraw()
          return
        }
        case 'eraser':
          mode.current = 'erase'
          board.breakUndo()
          eraseAt(p.x, p.y)
          return
        case 'lasso':
          mode.current = 'lasso'
          pts.current = [p.x, p.y]
          setPreview({ kind: 'lasso', points: [p.x, p.y] })
          return
        case 'shape':
          mode.current = 'shape'
          return
        case 'laser':
          mode.current = 'laser'
          pts.current = [p.x, p.y]
          window.clearTimeout(laserTimer.current)
          return
        case 'text': {
          const o = actions.add({
            type: 'text',
            x: p.x,
            y: p.y - st.textSize * 0.6,
            rotation: 0,
            text: '',
            width: 320,
            fontSize: st.textSize,
            color: st.textColor
          })
          if (o) st.set({ tool: 'select', selection: [o.id], editingId: o.id })
          return
        }
        case 'note': {
          const o = actions.add({
            type: 'note',
            x: p.x - 100,
            y: p.y - 100,
            rotation: 0,
            text: '',
            width: 200,
            height: 200,
            color: st.noteColor,
            author: st.userName || undefined
          })
          if (o) st.set({ tool: 'select', selection: [o.id], editingId: o.id })
          return
        }
        case 'reaction':
          actions.add({ type: 'reaction', x: p.x - 28, y: p.y - 28, rotation: 0, emoji: st.reaction, size: 56 })
          return
      }
      void stage
    },
    [actions, board, eraseAt, world]
  )

  const onPointerMove = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      const evt = e.evt
      const st = useUI.getState()
      const p = world()
      actions.pointer = p
      broadcast({ cursor: p })
      if (eraserRef.current) {
        const show = st.tool === 'eraser'
        eraserRef.current.setAttrs({ x: p.x, y: p.y, radius: st.eraserSize / st.viewport.scale, visible: show, strokeWidth: 1.5 / st.viewport.scale })
        if (show) eraserRef.current.getLayer()?.batchDraw()
      }
      switch (mode.current) {
        case 'pan': {
          const dx = evt.clientX - start.current.sx
          const dy = evt.clientY - start.current.sy
          st.set({ viewport: { ...st.viewport, x: start.current.vx + dx, y: start.current.vy + dy } })
          return
        }
        case 'draw': {
          const a = pts.current
          const lx = a[a.length - 2]
          const ly = a[a.length - 1]
          if (Math.hypot(p.x - lx, p.y - ly) < 1.2 / st.viewport.scale) return
          a.push(p.x, p.y)
          pressures.current.push(evt.pressure || 0.5)
          let shown = a
          if (st.ruler.visible && st.tool !== 'highlighter') {
            const snapped = snapToRuler(a, st.ruler, 36 / st.viewport.scale)
            if (snapped) shown = snapped
          }
          liveRef.current?.points(shown)
          liveRef.current?.getLayer()?.batchDraw()
          return
        }
        case 'erase':
          eraseAt(p.x, p.y)
          return
        case 'lasso':
          pts.current.push(p.x, p.y)
          setPreview({ kind: 'lasso', points: [...pts.current] })
          return
        case 'marquee':
          setPreview({ kind: 'marquee', x: start.current.x, y: start.current.y, w: p.x - start.current.x, h: p.y - start.current.y })
          return
        case 'shape':
          setPreview({ kind: 'shape', obj: buildShape(st.shapeKind, start.current, p, evt.shiftKey, st) })
          return
        case 'laser': {
          const a = pts.current
          a.push(p.x, p.y)
          if (a.length > 60) a.splice(0, a.length - 60)
          laserRef.current?.points(a)
          laserRef.current?.strokeWidth(5 / st.viewport.scale)
          laserRef.current?.visible(true)
          laserRef.current?.getLayer()?.batchDraw()
          broadcast({ laser: a.slice() })
          return
        }
      }
    },
    [actions, broadcast, eraseAt, world]
  )

  const onPointerUp = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      const st = useUI.getState()
      const m = mode.current
      mode.current = 'none'
      const p = world()
      switch (m) {
        case 'pan':
          if (containerRef.current) containerRef.current.style.cursor = ''
          return
        case 'draw': {
          liveRef.current?.visible(false)
          liveRef.current?.getLayer()?.batchDraw()
          let a = pts.current
          if (a.length === 2) a = [a[0], a[1], a[0] + 0.01, a[1]]
          const tool = st.tool as 'pen' | 'highlighter' | 'pencil'
          const color = tool === 'pen' ? st.penColor : tool === 'pencil' ? st.pencilColor : st.highlighterColor
          let width = tool === 'pen' ? st.penWidth : tool === 'pencil' ? st.pencilWidth : st.highlighterWidth
          if (pointerType.current === 'pen' && tool !== 'highlighter') {
            const avg = pressures.current.reduce((x, y) => x + y, 0) / pressures.current.length
            width = Math.max(1, width * (0.4 + avg * 1.2))
          }
          // ruler snapping
          if (st.ruler.visible && tool !== 'highlighter') {
            const snapped = snapToRuler(a, st.ruler, 36 / st.viewport.scale)
            if (snapped) a = snapped
          }
          // ink to shape
          if (st.inkToShape && tool === 'pen' && a.length > 8) {
            const rec = recognizeShape(a)
            if (rec) {
              const base = { rotation: 0, stroke: color, fill: 'transparent', strokeWidth: Math.max(2, width) }
              if (rec.line) {
                const [x1, y1, x2, y2] = rec.line
                actions.add({ type: 'shape', kind: 'line', x: x1, y: y1, width: x2 - x1, height: y2 - y1, ...base })
              } else {
                actions.add({ type: 'shape', kind: rec.kind, x: rec.x, y: rec.y, width: rec.width, height: rec.height, ...base })
              }
              return
            }
          }
          if (tool === 'pen' && a.length > 8) a = smooth(a)
          const b = strokeBounds(a)
          const rel = a.map((v, i) => (i % 2 === 0 ? v - b.x : v - b.y))
          actions.add({ type: 'stroke', x: b.x, y: b.y, rotation: 0, points: rel, color, width, tool })
          return
        }
        case 'erase':
          board.breakUndo()
          return
        case 'lasso': {
          const poly = pts.current
          setPreview(null)
          if (poly.length < 6) return
          const ids: string[] = []
          for (const o of objsRef.current) {
            if (o.type === 'stroke') {
              let inside = 0
              const n = o.points.length / 2
              const rot = (o.rotation * Math.PI) / 180
              for (let i = 0; i < o.points.length; i += 2) {
                const lx = o.points[i]
                const ly = o.points[i + 1]
                const wx = o.x + lx * Math.cos(rot) - ly * Math.sin(rot)
                const wy = o.y + lx * Math.sin(rot) + ly * Math.cos(rot)
                if (pointInPolygon(wx, wy, poly)) inside++
              }
              if (inside / n >= 0.5) ids.push(o.id)
            } else {
              const b = objBounds(o)
              if (pointInPolygon(b.x + b.width / 2, b.y + b.height / 2, poly)) ids.push(o.id)
            }
          }
          st.setTool('select')
          actions.select(ids)
          return
        }
        case 'marquee': {
          const r = { x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), width: Math.abs(p.x - start.current.x), height: Math.abs(p.y - start.current.y) }
          setPreview(null)
          if (r.width < 3 && r.height < 3) return
          const ids = objsRef.current.filter((o) => intersects(objBounds(o), r)).map((o) => o.id)
          actions.select(e.evt.shiftKey ? [...st.selection, ...ids] : ids)
          return
        }
        case 'shape': {
          setPreview(null)
          const obj = buildShape(st.shapeKind, start.current, p, e.evt.shiftKey, st)
          const tiny = Math.abs((obj as { width: number }).width) < 5 && Math.abs((obj as { height: number }).height) < 5
          if (tiny) {
            const line = isLineKind(st.shapeKind)
            Object.assign(obj, line ? { width: 180, height: 0 } : { x: p.x - 90, y: p.y - 65, width: 180, height: 130 })
          }
          actions.add(obj, true)
          return
        }
        case 'laser':
          laserTimer.current = window.setTimeout(() => {
            laserRef.current?.visible(false)
            laserRef.current?.getLayer()?.batchDraw()
            broadcast({ laser: null }, true)
          }, 700)
          return
      }
    },
    [actions, board, broadcast, world]
  )

  const onWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    const evt = e.evt
    evt.preventDefault()
    const st = useUI.getState()
    if (evt.ctrlKey || evt.metaKey) {
      const f = Math.exp(-evt.deltaY * (evt.deltaMode === 1 ? 0.05 : 0.0022))
      const ptr = stageRef.current!.getPointerPosition() ?? undefined
      actions.zoomAt(st.viewport.scale * f, ptr)
    } else {
      const dx = evt.shiftKey ? evt.deltaY : evt.deltaX
      const dy = evt.shiftKey ? 0 : evt.deltaY
      st.set({ viewport: { ...st.viewport, x: st.viewport.x - dx, y: st.viewport.y - dy } })
    }
  }, [actions])

  // pinch zoom with two fingers
  const onTouchMove = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const t = e.evt.touches
      if (t.length !== 2) return
      e.evt.preventDefault()
      const st = useUI.getState()
      const rect = containerRef.current!.getBoundingClientRect()
      const cx = (t[0].clientX + t[1].clientX) / 2 - rect.left
      const cy = (t[0].clientY + t[1].clientY) / 2 - rect.top
      const dist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
      if (!pinch.current) {
        if (mode.current === 'draw') {
          liveRef.current?.visible(false)
        }
        mode.current = 'pinch'
        pinch.current = { dist, cx, cy, vp: st.viewport }
        return
      }
      const p0 = pinch.current
      const scale = Math.max(0.05, Math.min(8, (p0.vp.scale * dist) / p0.dist))
      const wx = (p0.cx - p0.vp.x) / p0.vp.scale
      const wy = (p0.cy - p0.vp.y) / p0.vp.scale
      st.set({ viewport: { scale, x: cx - wx * scale, y: cy - wy * scale } })
    },
    []
  )
  const onTouchEnd = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2 && pinch.current) {
      pinch.current = null
      mode.current = 'none'
    }
  }, [])

  // ---------- object callbacks (stable) ----------
  const noop = useCallback(() => undefined, [])

  const onDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    dragStartPos.current = { x: e.target.x(), y: e.target.y() }
    board.breakUndo()
  }, [board])

  const onDragMove = noop

  const onDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, o: BoardObj) => {
      const st = useUI.getState()
      const layer = layerRef.current!
      const ids = st.selection.includes(o.id) ? st.selection : [o.id]
      let dx = 0
      let dy = 0
      if (st.snapToGrid) {
        const nx = Math.round(e.target.x() / (GRID / 2)) * (GRID / 2)
        const ny = Math.round(e.target.y() / (GRID / 2)) * (GRID / 2)
        dx = nx - e.target.x()
        dy = ny - e.target.y()
      }
      const patches = ids
        .map((id) => {
          const node = layer.find('.obj').find((n) => n.id() === id)
          if (!node) return null
          return { id, patch: { x: node.x() + dx, y: node.y() + dy } }
        })
        .filter(Boolean) as { id: string; patch: Partial<BoardObj> }[]
      board.updateMany(patches)
      board.breakUndo()
    },
    [board]
  )

  const onTransformEnd = useCallback(
    (node: Konva.Node, o: BoardObj) => {
      const sx = node.scaleX()
      const sy = node.scaleY()
      node.scaleX(1)
      node.scaleY(1)
      const base = { x: node.x(), y: node.y(), rotation: node.rotation() }
      let patch: Partial<BoardObj>
      switch (o.type) {
        case 'stroke':
          patch = { ...base, points: o.points.map((v, i) => (i % 2 === 0 ? v * sx : v * sy)) }
          break
        case 'text':
          patch = { ...base, width: Math.max(30, o.width * sx), fontSize: Math.abs(sy - 1) > 0.01 ? Math.max(6, o.fontSize * sy) : o.fontSize }
          break
        case 'reaction':
          patch = { ...base, size: Math.max(16, o.size * Math.max(sx, sy)) }
          break
        default:
          patch = { ...base, width: (o as { width: number }).width * sx, height: (o as { height: number }).height * sy } as Partial<BoardObj>
      }
      board.update(o.id, patch)
    },
    [board]
  )

  const onDblClick = useCallback(
    (o: BoardObj) => {
      const st = useUI.getState()
      if (o.type === 'link') return openUrl(o.url)
      if (st.readOnly || o.locked) return
      if (o.type === 'text' || o.type === 'note' || (o.type === 'shape' && !isLineKind(o.kind))) {
        st.set({ editingId: o.id, selection: [o.id] })
      }
    },
    []
  )

  const onCtx = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault()
      const st = useUI.getState()
      const objNode = e.target.findAncestor('.obj', true) as Konva.Node | undefined
      actions.pointer = world()
      if (objNode && !st.selection.includes(objNode.id())) {
        st.setTool('select')
        actions.select([objNode.id()])
      }
      onContextMenu(e.evt.clientX, e.evt.clientY)
    },
    [actions, onContextMenu, world]
  )

  const cursor =
    readOnly && tool !== 'laser'
      ? 'grab'
      : tool === 'pan'
        ? 'grab'
        : tool === 'eraser'
          ? 'none'
          : tool === 'text'
            ? 'text'
            : tool === 'select'
              ? 'default'
              : 'crosshair'

  const peerSelections = peers.flatMap((p) => {
    const ids = p.state.selection ?? []
    const objs = ids.map((id) => board.get(id)).filter(Boolean) as BoardObj[]
    const b = boundsOf(objs)
    return b ? [{ p, b }] : []
  })

  return (
    <div
      ref={containerRef}
      className="canvas"
      style={{ background: bgColor, cursor }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const stage = stageRef.current!
        stage.setPointersPositions(e.nativeEvent)
        const p = stage.getRelativePointerPosition() ?? actions.viewCenter()
        const files = Array.from(e.dataTransfer.files)
        if (files.length) actions.insertFiles(files, p)
        else {
          const text = e.dataTransfer.getData('text/plain')
          if (text) actions.insertText(text, p)
        }
      }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={s}
        scaleY={s}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (eraserRef.current?.visible()) {
            eraserRef.current.visible(false)
            eraserRef.current.getLayer()?.batchDraw()
          }
          broadcast({ cursor: null }, true)
        }}
        onWheel={onWheel}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onContextMenu={onCtx}
      >
        <Layer listening={false}>
          <Background type={bgType} w={size.width} h={size.height} vx={viewport.x} vy={viewport.y} s={s} dark={dark} />
        </Layer>
        <Layer ref={layerRef} listening={tool === 'select' && !readOnly}>
          {objects.map((o) => (
            <ObjectNode
              key={o.id}
              o={o}
              draggable={tool === 'select' && !readOnly && !o.locked && ui.editingId !== o.id}
              editing={ui.editingId === o.id}
              dark={dark}
              onPointerDown={noop}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onDblClick={onDblClick}
              onTransformEnd={onTransformEnd}
            />
          ))}
          <Transformer
            ref={trRef}
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={4}
            anchorSize={10}
            anchorCornerRadius={5}
            anchorStroke="#3f51b5"
            borderDash={[4, 3]}
            padding={4}
            ignoreStroke
            flipEnabled={false}
            boundBoxFunc={(oldB, newB) => (Math.abs(newB.width) < 8 || Math.abs(newB.height) < 8 ? oldB : newB)}
          />
        </Layer>
        <Layer>
          <Ruler s={s} />
        </Layer>
        <Layer listening={false}>
          <Line ref={liveRef} visible={false} lineJoin="round" tension={0.3} perfectDrawEnabled={false} />
          {preview?.kind === 'marquee' && (
            <Rect x={preview.x} y={preview.y} width={preview.w} height={preview.h} fill="rgba(63,81,181,0.08)" stroke="#3f51b5" strokeWidth={1 / s} dash={[6 / s, 4 / s]} />
          )}
          {preview?.kind === 'lasso' && (
            <Line points={preview.points} closed stroke="#3f51b5" strokeWidth={1.5 / s} dash={[6 / s, 4 / s]} fill="rgba(63,81,181,0.06)" />
          )}
          {preview?.kind === 'shape' && <ObjectNode o={{ ...(preview.obj as BoardObj), id: '__preview', z: 0, opacity: 0.7 }} draggable={false} editing={false} dark={dark} onPointerDown={noop} onDragStart={noop} onDragMove={noop} onDragEnd={noop} onDblClick={noop} onTransformEnd={noop} />}
          <Line ref={laserRef} visible={false} stroke="#ff1744" lineCap="round" lineJoin="round" tension={0.4} shadowColor="#ff1744" shadowBlur={12} />
          <Circle ref={eraserRef} visible={false} stroke="#3f51b5" fill="rgba(255,255,255,0.4)" />
          {peerSelections.map(({ p, b }) => (
            <Rect key={'sel' + p.clientId} x={b.x - 6} y={b.y - 6} width={b.width + 12} height={b.height + 12} stroke={p.state.color} strokeWidth={2 / s} dash={[6 / s, 4 / s]} />
          ))}
          {peers.map((p) =>
            p.state.laser && p.state.laser.length > 2 ? (
              <Line key={'laser' + p.clientId} points={p.state.laser} stroke={p.state.color} strokeWidth={5 / s} lineCap="round" tension={0.4} shadowColor={p.state.color} shadowBlur={12} />
            ) : null
          )}
          {peers.map((p) => (
            <PeerCursor key={p.clientId} p={p} s={s} />
          ))}
        </Layer>
      </Stage>
    </div>
  )
}

function buildShape(
  kind: ShapeKind,
  a: { x: number; y: number },
  b: { x: number; y: number },
  constrain: boolean,
  st: { shapeStroke: string; shapeFill: string; shapeStrokeWidth: number }
): NewObj {
  const base = { type: 'shape' as const, kind, rotation: 0, stroke: st.shapeStroke, fill: st.shapeFill, strokeWidth: st.shapeStrokeWidth }
  if (isLineKind(kind)) {
    let dx = b.x - a.x
    let dy = b.y - a.y
    if (constrain) {
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
      const len = Math.hypot(dx, dy)
      dx = Math.cos(ang) * len
      dy = Math.sin(ang) * len
    }
    return { ...base, x: a.x, y: a.y, width: dx, height: dy }
  }
  let w = Math.abs(b.x - a.x)
  let h = Math.abs(b.y - a.y)
  if (constrain) w = h = Math.max(w, h)
  const x = b.x < a.x ? a.x - w : a.x
  const y = b.y < a.y ? a.y - h : a.y
  return { ...base, x, y, width: w, height: h }
}

export { toLocal }
