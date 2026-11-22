import { memo, useEffect, useState } from 'react'
import Konva from 'konva'
import { Group, Rect, Ellipse, Line, Arrow, Text, Image as KImage } from 'react-konva'
import type { BoardObj, NoteObj, ShapeObj } from '../types'
import { polygonPoints } from './shapes'

const imageCache = new Map<string, HTMLImageElement>()

function useImage(src: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(() => {
    const c = imageCache.get(src)
    return c && c.complete ? c : null
  })
  useEffect(() => {
    let cached = imageCache.get(src)
    if (cached && cached.complete) {
      setImg(cached)
      return
    }
    if (!cached) {
      cached = new window.Image()
      cached.src = src
      imageCache.set(src, cached)
    }
    const el = cached
    const onLoad = (): void => setImg(el)
    el.addEventListener('load', onLoad)
    return () => el.removeEventListener('load', onLoad)
  }, [src])
  return img
}

const measurer = new Konva.Text({ fontFamily: 'Segoe UI, Arial, sans-serif', lineHeight: 1.2, wrap: 'word' })

/** Find the largest font that lets `text` fit in a w×h box (auto-fit sticky notes). */
export function fitFontSize(text: string, w: number, h: number, max = 32, min = 9): number {
  if (!text) return Math.min(max, 24)
  let size = max
  measurer.width(w)
  measurer.text(text)
  while (size > min) {
    measurer.fontSize(size)
    if (measurer.height() <= h) break
    size -= 1
  }
  return size
}

/** On dark canvases, near-black ink is shown as near-white so it stays visible (like a chalkboard). */
export function adapt(color: string, dark: boolean): string {
  if (!dark || !color || color[0] !== '#' || color.length < 7) return color
  const n = parseInt(color.slice(1, 7), 16)
  const lum = ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114
  return lum < 50 ? '#f1f1f1' : color
}

function fontStyle(bold?: boolean, italic?: boolean): string {
  return [italic ? 'italic' : '', bold ? 'bold' : ''].filter(Boolean).join(' ') || 'normal'
}

function decoration(underline?: boolean, strike?: boolean): string {
  return [underline ? 'underline' : '', strike ? 'line-through' : ''].filter(Boolean).join(' ')
}

function ShapeBody({ o, hidden, dark }: { o: ShapeObj; hidden: boolean; dark: boolean }): JSX.Element {
  const fill = o.fill === 'transparent' ? undefined : o.fill
  const dash = o.dash ? [o.strokeWidth * 3, o.strokeWidth * 2] : undefined
  const common = {
    stroke: adapt(o.stroke, dark),
    strokeWidth: o.strokeWidth,
    fill,
    dash,
    hitStrokeWidth: Math.max(14, o.strokeWidth),
    fillEnabled: true,
    strokeScaleEnabled: false
  }
  let body: JSX.Element
  switch (o.kind) {
    case 'ellipse':
      body = <Ellipse x={o.width / 2} y={o.height / 2} radiusX={Math.abs(o.width / 2)} radiusY={Math.abs(o.height / 2)} {...common} />
      break
    case 'rect':
      body = <Rect width={o.width} height={o.height} {...common} />
      break
    case 'roundRect':
      body = <Rect width={o.width} height={o.height} cornerRadius={Math.min(18, Math.abs(o.width) / 4, Math.abs(o.height) / 4)} {...common} />
      break
    case 'line':
      body = <Line points={[0, 0, o.width, o.height]} {...common} lineCap="round" />
      break
    case 'arrow':
    case 'doubleArrow':
      body = (
        <Arrow
          points={[0, 0, o.width, o.height]}
          {...common}
          fill={adapt(o.stroke, dark)}
          pointerLength={o.strokeWidth * 3 + 6}
          pointerWidth={o.strokeWidth * 3 + 6}
          pointerAtBeginning={o.kind === 'doubleArrow'}
          lineCap="round"
        />
      )
      break
    default:
      body = <Line points={polygonPoints(o.kind, o.width, o.height) ?? []} closed {...common} lineJoin="round" />
  }
  return (
    <>
      {/* transparent hit area so empty shapes are easy to grab */}
      {o.fill === 'transparent' && o.kind !== 'line' && o.kind !== 'arrow' && o.kind !== 'doubleArrow' && (
        <Rect width={o.width} height={o.height} fill="rgba(0,0,0,0)" listening={false} />
      )}
      {body}
      {o.text && !hidden ? (
        <Text
          text={o.text}
          width={Math.abs(o.width)}
          height={Math.abs(o.height)}
          x={Math.min(0, o.width)}
          y={Math.min(0, o.height)}
          padding={10}
          align="center"
          verticalAlign="middle"
          fontSize={o.fontSize ?? 20}
          fill={o.fill === 'transparent' ? adapt(o.textColor ?? '#1f1f1f', dark) : (o.textColor ?? '#1f1f1f')}
          fontFamily="Segoe UI, Arial, sans-serif"
          listening={false}
        />
      ) : null}
    </>
  )
}

function NoteBody({ o, hidden }: { o: NoteObj; hidden: boolean }): JSX.Element {
  const pad = 14
  const size = fitFontSize(o.text, o.width - pad * 2, o.height - pad * 2 - (o.author ? 16 : 0))
  return (
    <>
      <Rect
        width={o.width}
        height={o.height}
        fill={o.color}
        cornerRadius={4}
        shadowColor="#000"
        shadowOpacity={0.18}
        shadowBlur={10}
        shadowOffsetY={4}
      />
      {!hidden && (
        <Text
          text={o.text}
          width={o.width}
          height={o.height - (o.author ? 16 : 0)}
          padding={pad}
          fontSize={size}
          fontStyle={fontStyle(o.bold, o.italic)}
          textDecoration={decoration(o.underline)}
          align={o.align ?? 'center'}
          verticalAlign="middle"
          fill={o.textColor ?? '#1f1f1f'}
          fontFamily="Segoe UI, Arial, sans-serif"
          lineHeight={1.2}
          listening={false}
        />
      )}
      {o.author && (
        <Text text={o.author} x={8} y={o.height - 20} fontSize={11} fill="#00000088" width={o.width - 16} align="right" listening={false} />
      )}
    </>
  )
}

function ImageBody({ src, width, height, border }: { src: string; width: number; height: number; border?: boolean }): JSX.Element {
  const img = useImage(src)
  return (
    <>
      {img ? (
        <KImage image={img} width={width} height={height} />
      ) : (
        <Rect width={width} height={height} fill="#eceff1" />
      )}
      {border && <Rect width={width} height={height} stroke="#9e9e9e" strokeWidth={1} listening={false} />}
    </>
  )
}

export interface ObjectNodeProps {
  o: BoardObj
  draggable: boolean
  editing: boolean
  dark?: boolean
  onPointerDown: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, o: BoardObj) => void
  onDragStart: (e: Konva.KonvaEventObject<DragEvent>, o: BoardObj) => void
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>, o: BoardObj) => void
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>, o: BoardObj) => void
  onDblClick: (o: BoardObj) => void
  onTransformEnd: (node: Konva.Node, o: BoardObj) => void
}

function ObjectNodeImpl(p: ObjectNodeProps): JSX.Element {
  const { o } = p
  const dark = !!p.dark
  const groupProps = {
    id: o.id,
    name: 'obj',
    x: o.x,
    y: o.y,
    rotation: o.rotation || 0,
    opacity: o.opacity ?? 1,
    draggable: p.draggable,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => p.onPointerDown(e, o),
    onTouchStart: (e: Konva.KonvaEventObject<TouchEvent>) => p.onPointerDown(e, o),
    onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => p.onDragStart(e, o),
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => p.onDragMove(e, o),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => p.onDragEnd(e, o),
    onDblClick: () => p.onDblClick(o),
    onDblTap: () => p.onDblClick(o),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => p.onTransformEnd(e.target, o)
  }
  switch (o.type) {
    case 'stroke':
      return (
        <Group {...groupProps}>
          <Line
            points={o.points}
            stroke={adapt(o.color, dark)}
            strokeWidth={o.width}
            lineCap={o.tool === 'highlighter' ? 'square' : 'round'}
            lineJoin="round"
            tension={0.35}
            opacity={o.tool === 'highlighter' ? 0.45 : o.tool === 'pencil' ? 0.85 : 1}
            globalCompositeOperation={o.tool === 'highlighter' ? 'multiply' : 'source-over'}
            hitStrokeWidth={Math.max(16, o.width + 8)}
            perfectDrawEnabled={false}
          />
        </Group>
      )
    case 'shape':
      return (
        <Group {...groupProps}>
          <ShapeBody o={o} hidden={p.editing} dark={dark} />
        </Group>
      )
    case 'text':
      return (
        <Group {...groupProps}>
          {o.background && o.background !== 'transparent' && (
            <Rect width={o.width} height={o.fontSize * 1.3 * Math.max(1, o.text.split('\n').length) + 8} fill={o.background} cornerRadius={4} />
          )}
          <Text
            text={o.text || (p.editing ? '' : ' ')}
            width={o.width}
            fontSize={o.fontSize}
            fill={o.background && o.background !== 'transparent' ? o.color : adapt(o.color, dark)}
            fontStyle={fontStyle(o.bold, o.italic)}
            textDecoration={decoration(o.underline, o.strike)}
            align={o.align ?? 'left'}
            fontFamily={o.fontFamily ?? 'Segoe UI, Arial, sans-serif'}
            lineHeight={1.2}
            padding={4}
            visible={!p.editing}
          />
        </Group>
      )
    case 'note':
      return (
        <Group {...groupProps}>
          <NoteBody o={o} hidden={p.editing} />
        </Group>
      )
    case 'image':
      return (
        <Group {...groupProps}>
          <ImageBody src={o.src} width={o.width} height={o.height} border={o.border} />
        </Group>
      )
    case 'link':
      return (
        <Group {...groupProps}>
          <Rect width={o.width} height={o.height} fill="#ffffff" stroke="#c5cae9" strokeWidth={1.5} cornerRadius={10} shadowColor="#000" shadowOpacity={0.12} shadowBlur={8} />
          <Rect width={8} height={o.height} fill="#3949ab" cornerRadius={[10, 0, 0, 10]} />
          <Text text="🔗" x={20} y={o.height / 2 - 14} fontSize={26} listening={false} />
          <Text text={o.title} x={62} y={16} width={o.width - 76} fontSize={17} fontStyle="bold" fill="#1f1f1f" ellipsis wrap="none" listening={false} />
          <Text text={o.url} x={62} y={44} width={o.width - 76} fontSize={13} fill="#3949ab" ellipsis wrap="none" listening={false} />
        </Group>
      )
    case 'reaction':
      return (
        <Group {...groupProps}>
          <Rect width={o.size} height={o.size} fill="rgba(0,0,0,0)" />
          <Text text={o.emoji} fontSize={o.size * 0.85} y={o.size * 0.05} listening={false} />
        </Group>
      )
  }
}

export const ObjectNode = memo(ObjectNodeImpl)
