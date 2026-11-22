import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Lock,
  Unlock,
  Trash2,
  Copy,
  BringToFront,
  SendToBack,
  Group,
  Ungroup,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Grid3x3
} from 'lucide-react'
import type { BoardObj } from '../types'
import type { Actions } from './actions'
import { useUI, PEN_COLORS, NOTE_COLORS, HIGHLIGHTER_COLORS } from './store'
import { ColorRow } from './ui'
import { isLineKind, SHAPE_LABELS } from './shapes'

function IconBtn({ title, on, onClick, children }: { title: string; on?: boolean; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button className={'fp-btn' + (on ? ' on' : '')} title={title} aria-label={title} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}

const TYPE_LABEL: Record<BoardObj['type'], string> = {
  stroke: 'Ink',
  shape: 'Shape',
  text: 'Text',
  note: 'Sticky note',
  image: 'Image',
  link: 'Link',
  reaction: 'Reaction'
}

/** Floating format pane shown for the current selection. */
export function FormatPanel({ actions, objects }: { actions: Actions; objects: BoardObj[] }): JSX.Element | null {
  const selection = useUI((s) => s.selection)
  const tool = useUI((s) => s.tool)
  const readOnly = useUI((s) => s.readOnly)
  if (tool !== 'select' || readOnly || !selection.length) return null
  const set = new Set(selection)
  const sel = objects.filter((o) => set.has(o.id))
  if (!sel.length) return null
  const board = actions.board
  const patchAll = (fn: (o: BoardObj) => Partial<BoardObj> | null): void =>
    board.updateMany(
      sel
        .filter((o) => !o.locked)
        .map((o) => ({ id: o.id, patch: fn(o) }))
        .filter((p) => p.patch) as { id: string; patch: Partial<BoardObj> }[]
    )
  const types = new Set(sel.map((o) => o.type))
  const only = types.size === 1 ? sel[0].type : null
  const first = sel[0]
  const locked = sel.every((o) => o.locked)
  const grouped = sel.some((o) => o.groupId)

  return (
    <div className="format-panel" role="region" aria-label="Format">
      <div className="fp-title">
        {sel.length === 1 ? TYPE_LABEL[first.type] + (first.type === 'shape' ? ' · ' + SHAPE_LABELS[first.kind] : '') : `${sel.length} items selected`}
      </div>

      {only === 'stroke' && (
        <>
          <div className="fp-label">Ink color</div>
          <ColorRow
            colors={first.type === 'stroke' && first.tool === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS}
            value={first.type === 'stroke' ? first.color : ''}
            onChange={(c) => patchAll(() => ({ color: c }))}
            custom
          />
          <div className="fp-label">Thickness</div>
          <input type="range" min={1} max={60} value={first.type === 'stroke' ? first.width : 3} onChange={(e) => patchAll(() => ({ width: Number(e.target.value) }))} />
        </>
      )}

      {only === 'shape' && first.type === 'shape' && (
        <>
          <div className="fp-label">Outline</div>
          <ColorRow colors={PEN_COLORS} value={first.stroke} onChange={(c) => patchAll(() => ({ stroke: c }))} custom />
          {!isLineKind(first.kind) && (
            <>
              <div className="fp-label">Fill</div>
              <ColorRow colors={['transparent', ...NOTE_COLORS.slice(0, 6), ...PEN_COLORS.slice(1, 7)]} value={first.fill} onChange={(c) => patchAll(() => ({ fill: c }))} custom />
            </>
          )}
          <div className="fp-label">Line width</div>
          <input type="range" min={1} max={24} value={first.strokeWidth} onChange={(e) => patchAll(() => ({ strokeWidth: Number(e.target.value) }))} />
          <label className="check">
            <input type="checkbox" checked={!!first.dash} onChange={(e) => patchAll(() => ({ dash: e.target.checked }))} /> Dashed
          </label>
          {!isLineKind(first.kind) && (
            <>
              <div className="fp-label">Label</div>
              <div className="fp-row">
                <input type="number" className="num" min={8} max={120} value={first.fontSize ?? 20} onChange={(e) => patchAll(() => ({ fontSize: Number(e.target.value) }))} aria-label="Label size" />
                <ColorRow colors={['#1f1f1f', '#ffffff', '#e53935', '#1e88e5']} value={first.textColor ?? '#1f1f1f'} onChange={(c) => patchAll(() => ({ textColor: c }))} />
              </div>
              <div className="hint">Double-click the shape to type a label</div>
            </>
          )}
        </>
      )}

      {(only === 'text' || only === 'note') && (first.type === 'text' || first.type === 'note') && (
        <>
          <div className="fp-row">
            <IconBtn title="Bold (Ctrl B)" on={first.bold} onClick={() => patchAll((o) => ({ bold: !(o as { bold?: boolean }).bold }))}>
              <Bold size={16} />
            </IconBtn>
            <IconBtn title="Italic (Ctrl I)" on={first.italic} onClick={() => patchAll((o) => ({ italic: !(o as { italic?: boolean }).italic }))}>
              <Italic size={16} />
            </IconBtn>
            <IconBtn title="Underline (Ctrl U)" on={first.underline} onClick={() => patchAll((o) => ({ underline: !(o as { underline?: boolean }).underline }))}>
              <Underline size={16} />
            </IconBtn>
            {first.type === 'text' && (
              <IconBtn title="Strikethrough" on={first.strike} onClick={() => patchAll((o) => ({ strike: !(o as { strike?: boolean }).strike }))}>
                <Strikethrough size={16} />
              </IconBtn>
            )}
            <span className="fp-gap" />
            <IconBtn title="Align left" on={first.align === 'left'} onClick={() => patchAll(() => ({ align: 'left' }))}>
              <AlignLeft size={16} />
            </IconBtn>
            <IconBtn title="Align center" on={(first.align ?? (first.type === 'note' ? 'center' : 'left')) === 'center'} onClick={() => patchAll(() => ({ align: 'center' }))}>
              <AlignCenter size={16} />
            </IconBtn>
            <IconBtn title="Align right" on={first.align === 'right'} onClick={() => patchAll(() => ({ align: 'right' }))}>
              <AlignRight size={16} />
            </IconBtn>
          </div>
          {first.type === 'text' && (
            <>
              <div className="fp-label">Size</div>
              <div className="fp-row">
                <input type="number" className="num" min={6} max={300} value={Math.round(first.fontSize)} onChange={(e) => patchAll(() => ({ fontSize: Number(e.target.value) || 12 }))} aria-label="Font size" />
                <select value={first.fontFamily ?? 'Segoe UI, Arial, sans-serif'} onChange={(e) => patchAll(() => ({ fontFamily: e.target.value }))} aria-label="Font">
                  <option value="Segoe UI, Arial, sans-serif">Sans</option>
                  <option value="Georgia, 'Times New Roman', serif">Serif</option>
                  <option value="'Cascadia Code', Consolas, monospace">Mono</option>
                  <option value="'Segoe Print', 'Comic Sans MS', cursive">Handwriting</option>
                </select>
              </div>
              <div className="fp-label">Text color</div>
              <ColorRow colors={PEN_COLORS} value={first.color} onChange={(c) => patchAll(() => ({ color: c }))} custom />
              <div className="fp-label">Highlight</div>
              <ColorRow colors={['transparent', ...HIGHLIGHTER_COLORS]} value={first.background ?? 'transparent'} onChange={(c) => patchAll(() => ({ background: c }))} />
            </>
          )}
          {first.type === 'note' && (
            <>
              <div className="fp-label">Note color</div>
              <ColorRow colors={NOTE_COLORS} value={first.color} onChange={(c) => patchAll(() => ({ color: c }))} />
            </>
          )}
        </>
      )}

      {only === 'note' && sel.length > 1 && (
        <button className="btn small block" onClick={() => actions.arrangeGrid()}>
          <Grid3x3 size={14} /> Arrange as note grid
        </button>
      )}

      {only === 'image' && first.type === 'image' && (
        <label className="check">
          <input type="checkbox" checked={!!first.border} onChange={(e) => patchAll(() => ({ border: e.target.checked }))} /> Border
        </label>
      )}

      <div className="fp-label">Opacity</div>
      <input type="range" min={10} max={100} value={Math.round((first.opacity ?? 1) * 100)} onChange={(e) => patchAll(() => ({ opacity: Number(e.target.value) / 100 }))} />

      {sel.length > 1 && (
        <>
          <div className="fp-label">Align</div>
          <div className="fp-row">
            <IconBtn title="Align left edges" onClick={() => actions.align('left')}>
              <AlignStartVertical size={16} />
            </IconBtn>
            <IconBtn title="Align centers horizontally" onClick={() => actions.align('centerX')}>
              <AlignCenterVertical size={16} />
            </IconBtn>
            <IconBtn title="Align right edges" onClick={() => actions.align('right')}>
              <AlignEndVertical size={16} />
            </IconBtn>
            <IconBtn title="Align top edges" onClick={() => actions.align('top')}>
              <AlignStartHorizontal size={16} />
            </IconBtn>
            <IconBtn title="Align middles" onClick={() => actions.align('centerY')}>
              <AlignCenterHorizontal size={16} />
            </IconBtn>
            <IconBtn title="Align bottom edges" onClick={() => actions.align('bottom')}>
              <AlignEndHorizontal size={16} />
            </IconBtn>
            <IconBtn title="Distribute horizontally" onClick={() => actions.distribute('h')}>
              <AlignHorizontalSpaceAround size={16} />
            </IconBtn>
            <IconBtn title="Distribute vertically" onClick={() => actions.distribute('v')}>
              <AlignVerticalSpaceAround size={16} />
            </IconBtn>
          </div>
        </>
      )}

      <div className="fp-row fp-actions">
        <IconBtn title="Duplicate (Ctrl D)" onClick={() => actions.duplicate()}>
          <Copy size={16} />
        </IconBtn>
        <IconBtn title="Bring to front (Ctrl Shift ])" onClick={() => actions.bringToFront()}>
          <BringToFront size={16} />
        </IconBtn>
        <IconBtn title="Send to back (Ctrl Shift [)" onClick={() => actions.sendToBack()}>
          <SendToBack size={16} />
        </IconBtn>
        {sel.length > 1 && !grouped && (
          <IconBtn title="Group (Ctrl G)" onClick={() => actions.group()}>
            <Group size={16} />
          </IconBtn>
        )}
        {grouped && (
          <IconBtn title="Ungroup (Ctrl Shift G)" onClick={() => actions.ungroup()}>
            <Ungroup size={16} />
          </IconBtn>
        )}
        <IconBtn title={locked ? 'Unlock' : 'Lock'} on={locked} onClick={() => actions.toggleLock()}>
          {locked ? <Lock size={16} /> : <Unlock size={16} />}
        </IconBtn>
        <IconBtn title="Delete (Del)" onClick={() => actions.deleteSelection()}>
          <Trash2 size={16} />
        </IconBtn>
      </div>
    </div>
  )
}
