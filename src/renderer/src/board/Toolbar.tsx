import { useRef, useState } from 'react'
import {
  MousePointer2,
  Hand,
  Pen,
  Pencil,
  Highlighter,
  Eraser,
  Lasso,
  Ruler as RulerIcon,
  Shapes,
  StickyNote,
  Type,
  Image as ImageIcon,
  FileText,
  Link as LinkIcon,
  Smile,
  LayoutTemplate,
  Timer,
  ListTree,
  Wand2,
  Zap,
  ZoomIn,
  ZoomOut,
  Maximize,
  Map as MapIcon
} from 'lucide-react'
import type { ShapeKind } from '../types'
import { useUI, PEN_COLORS, HIGHLIGHTER_COLORS, NOTE_COLORS, REACTIONS, type Tool } from './store'
import type { Actions } from './actions'
import { SHAPE_LABELS } from './shapes'
import { ColorRow } from './ui'

function ToolButton({
  active,
  title,
  onClick,
  children,
  disabled
}: {
  active?: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
}): JSX.Element {
  return (
    <button className={'tb-btn' + (active ? ' active' : '')} title={title} aria-label={title} aria-pressed={active} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

function WidthSlider({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }): JSX.Element {
  return (
    <label className="slider">
      <span>Thickness</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider-val">{value}</span>
    </label>
  )
}

const SHAPE_ICONS: Record<ShapeKind, string> = {
  rect: '▭',
  roundRect: '▢',
  ellipse: '◯',
  triangle: '△',
  diamond: '◇',
  star: '☆',
  hexagon: '⬡',
  line: '╱',
  arrow: '→',
  doubleArrow: '↔'
}

function ToolOptions(): JSX.Element | null {
  const ui = useUI()
  switch (ui.tool) {
    case 'pen':
      return (
        <div className="popover ink-pop">
          <ColorRow colors={PEN_COLORS} value={ui.penColor} onChange={(c) => ui.set({ penColor: c })} custom />
          <WidthSlider value={ui.penWidth} min={1} max={30} onChange={(v) => ui.set({ penWidth: v })} />
          <label className="check">
            <input type="checkbox" checked={ui.inkToShape} onChange={(e) => ui.set({ inkToShape: e.target.checked })} /> Ink to shape
          </label>
        </div>
      )
    case 'pencil':
      return (
        <div className="popover ink-pop">
          <ColorRow colors={PEN_COLORS} value={ui.pencilColor} onChange={(c) => ui.set({ pencilColor: c })} custom />
          <WidthSlider value={ui.pencilWidth} min={1} max={12} onChange={(v) => ui.set({ pencilWidth: v })} />
        </div>
      )
    case 'highlighter':
      return (
        <div className="popover ink-pop">
          <ColorRow colors={HIGHLIGHTER_COLORS} value={ui.highlighterColor} onChange={(c) => ui.set({ highlighterColor: c })} custom />
          <WidthSlider value={ui.highlighterWidth} min={6} max={60} onChange={(v) => ui.set({ highlighterWidth: v })} />
        </div>
      )
    case 'eraser':
      return (
        <div className="popover ink-pop">
          <div className="seg">
            <button className={ui.eraserMode === 'stroke' ? 'on' : ''} onClick={() => ui.set({ eraserMode: 'stroke' })}>
              Stroke eraser
            </button>
            <button className={ui.eraserMode === 'point' ? 'on' : ''} onClick={() => ui.set({ eraserMode: 'point' })}>
              Point eraser
            </button>
          </div>
          <WidthSlider value={ui.eraserSize} min={4} max={60} onChange={(v) => ui.set({ eraserSize: v })} />
        </div>
      )
    case 'shape':
      return (
        <div className="popover ink-pop">
          <div className="shape-grid">
            {(Object.keys(SHAPE_LABELS) as ShapeKind[]).map((k) => (
              <button key={k} className={ui.shapeKind === k ? 'on' : ''} title={SHAPE_LABELS[k]} aria-label={SHAPE_LABELS[k]} onClick={() => ui.set({ shapeKind: k })}>
                {SHAPE_ICONS[k]}
              </button>
            ))}
          </div>
          <div className="pop-label">Outline</div>
          <ColorRow colors={PEN_COLORS} value={ui.shapeStroke} onChange={(c) => ui.set({ shapeStroke: c })} custom />
          <div className="pop-label">Fill</div>
          <ColorRow colors={['transparent', ...NOTE_COLORS.slice(0, 6), ...PEN_COLORS.slice(1, 7)]} value={ui.shapeFill} onChange={(c) => ui.set({ shapeFill: c })} custom />
          <WidthSlider value={ui.shapeStrokeWidth} min={1} max={20} onChange={(v) => ui.set({ shapeStrokeWidth: v })} />
          <div className="hint">Hold Shift for squares, circles and 45° lines</div>
        </div>
      )
    case 'note':
      return (
        <div className="popover ink-pop">
          <div className="pop-label">Note color — click the board to place</div>
          <ColorRow colors={NOTE_COLORS} value={ui.noteColor} onChange={(c) => ui.set({ noteColor: c })} />
        </div>
      )
    case 'text':
      return (
        <div className="popover ink-pop">
          <div className="pop-label">Click the board to add text</div>
          <ColorRow colors={PEN_COLORS} value={ui.textColor} onChange={(c) => ui.set({ textColor: c })} custom />
          <WidthSlider value={ui.textSize} min={10} max={120} onChange={(v) => ui.set({ textSize: v })} />
        </div>
      )
    case 'reaction':
      return (
        <div className="popover ink-pop">
          <div className="emoji-grid">
            {REACTIONS.map((r) => (
              <button key={r} className={ui.reaction === r ? 'on' : ''} onClick={() => ui.set({ reaction: r })} aria-label={'Reaction ' + r}>
                {r}
              </button>
            ))}
          </div>
          <div className="hint">Click anywhere to stamp a reaction</div>
        </div>
      )
    case 'laser':
      return (
        <div className="popover ink-pop">
          <div className="hint">Laser pointer — draws a temporary trail everyone can see</div>
        </div>
      )
    default:
      return null
  }
}

/** Bottom inking toolbar */
export function InkBar(): JSX.Element {
  const tool = useUI((s) => s.tool)
  const setTool = useUI((s) => s.setTool)
  const ruler = useUI((s) => s.ruler)
  const set = useUI((s) => s.set)
  const inkToShape = useUI((s) => s.inkToShape)
  const penColor = useUI((s) => s.penColor)
  const readOnly = useUI((s) => s.readOnly)
  const [showOpts, setShowOpts] = useState(true)
  const pick = (t: Tool): void => {
    if (t === tool) setShowOpts((v) => !v)
    else {
      setTool(t)
      setShowOpts(true)
    }
  }
  if (readOnly) {
    return (
      <div className="inkbar">
        <ToolButton title="Pan (H)" active={tool === 'pan'} onClick={() => setTool('pan')}>
          <Hand size={20} />
        </ToolButton>
        <ToolButton title="Laser pointer" active={tool === 'laser'} onClick={() => setTool('laser')}>
          <Zap size={20} />
        </ToolButton>
        <span className="ro-badge">View only</span>
      </div>
    )
  }
  return (
    <div className="inkbar-wrap">
      {showOpts && <ToolOptions />}
      <div className="inkbar" role="toolbar" aria-label="Inking tools">
        <ToolButton title="Select (V)" active={tool === 'select'} onClick={() => pick('select')}>
          <MousePointer2 size={20} />
        </ToolButton>
        <ToolButton title="Pan (H / hold Space)" active={tool === 'pan'} onClick={() => pick('pan')}>
          <Hand size={20} />
        </ToolButton>
        <span className="sep" />
        <ToolButton title="Pen (P)" active={tool === 'pen'} onClick={() => pick('pen')}>
          <Pen size={20} color={tool === 'pen' ? penColor : undefined} />
        </ToolButton>
        <ToolButton title="Pencil" active={tool === 'pencil'} onClick={() => pick('pencil')}>
          <Pencil size={20} />
        </ToolButton>
        <ToolButton title="Highlighter (M)" active={tool === 'highlighter'} onClick={() => pick('highlighter')}>
          <Highlighter size={20} />
        </ToolButton>
        <ToolButton title="Eraser (E)" active={tool === 'eraser'} onClick={() => pick('eraser')}>
          <Eraser size={20} />
        </ToolButton>
        <ToolButton title="Lasso select (L)" active={tool === 'lasso'} onClick={() => pick('lasso')}>
          <Lasso size={20} />
        </ToolButton>
        <ToolButton title="Laser pointer" active={tool === 'laser'} onClick={() => pick('laser')}>
          <Zap size={20} />
        </ToolButton>
        <span className="sep" />
        <ToolButton title="Ruler (U) — scroll over it to rotate" active={ruler.visible} onClick={() => set({ ruler: { ...ruler, visible: !ruler.visible } })}>
          <RulerIcon size={20} />
        </ToolButton>
        <ToolButton title="Ink to shape" active={inkToShape} onClick={() => set({ inkToShape: !inkToShape })}>
          <Wand2 size={20} />
        </ToolButton>
      </div>
    </div>
  )
}

/** Left "create" rail */
export function CreateRail({ actions, onLink, onToggleTimer }: { actions: Actions; onLink: () => void; onToggleTimer: () => void }): JSX.Element | null {
  const tool = useUI((s) => s.tool)
  const setTool = useUI((s) => s.setTool)
  const panel = useUI((s) => s.panel)
  const set = useUI((s) => s.set)
  const readOnly = useUI((s) => s.readOnly)
  const imgInput = useRef<HTMLInputElement>(null)
  const docInput = useRef<HTMLInputElement>(null)
  if (readOnly) return null
  const togglePanel = (p: typeof panel): void => set({ panel: panel === p ? null : p })
  return (
    <div className="rail" role="toolbar" aria-label="Create">
      <ToolButton title="Sticky note (N)" active={tool === 'note'} onClick={() => setTool('note')}>
        <StickyNote size={20} />
      </ToolButton>
      <ToolButton title="Text (T)" active={tool === 'text'} onClick={() => setTool('text')}>
        <Type size={20} />
      </ToolButton>
      <ToolButton title="Shapes (R)" active={tool === 'shape'} onClick={() => setTool('shape')}>
        <Shapes size={20} />
      </ToolButton>
      <ToolButton title="Templates" active={panel === 'templates'} onClick={() => togglePanel('templates')}>
        <LayoutTemplate size={20} />
      </ToolButton>
      <ToolButton title="Insert image" onClick={() => imgInput.current?.click()}>
        <ImageIcon size={20} />
      </ToolButton>
      <ToolButton title="Insert PDF document" onClick={() => docInput.current?.click()}>
        <FileText size={20} />
      </ToolButton>
      <ToolButton title="Insert link" onClick={onLink}>
        <LinkIcon size={20} />
      </ToolButton>
      <ToolButton title="Reactions" active={tool === 'reaction'} onClick={() => setTool('reaction')}>
        <Smile size={20} />
      </ToolButton>
      <span className="sep-h" />
      <ToolButton title="Timer" onClick={onToggleTimer}>
        <Timer size={20} />
      </ToolButton>
      <ToolButton title="Board outline" active={panel === 'outline'} onClick={() => togglePanel('outline')}>
        <ListTree size={20} />
      </ToolButton>
      <input
        ref={imgInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          actions.insertFiles(files, actions.viewCenter())
        }}
      />
      <input
        ref={docInput}
        type="file"
        accept="application/pdf,.pdf,.txt,.md,.csv"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          actions.insertFiles(files, actions.viewCenter())
        }}
      />
    </div>
  )
}

export function ZoomBar({ actions }: { actions: Actions }): JSX.Element {
  const scale = useUI((s) => s.viewport.scale)
  const showMinimap = useUI((s) => s.showMinimap)
  const set = useUI((s) => s.set)
  return (
    <div className="zoombar" role="toolbar" aria-label="Zoom">
      <ToolButton title="Zoom out (Ctrl -)" onClick={() => actions.zoomBy(1 / 1.2)}>
        <ZoomOut size={18} />
      </ToolButton>
      <button className="zoom-val" title="Reset to 100% (Ctrl 0)" onClick={() => actions.resetZoom()}>
        {Math.round(scale * 100)}%
      </button>
      <ToolButton title="Zoom in (Ctrl +)" onClick={() => actions.zoomBy(1.2)}>
        <ZoomIn size={18} />
      </ToolButton>
      <ToolButton title="Fit to content (Shift 1)" onClick={() => actions.fitToContent()}>
        <Maximize size={18} />
      </ToolButton>
      <ToolButton title="Minimap" active={showMinimap} onClick={() => set({ showMinimap: !showMinimap })}>
        <MapIcon size={18} />
      </ToolButton>
    </div>
  )
}
