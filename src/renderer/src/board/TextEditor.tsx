import { useEffect, useRef, useState } from 'react'
import type { BoardObj } from '../types'
import type { BoardDoc } from './doc'
import { useUI } from './store'
import { fitFontSize } from './ObjectNode'

/** HTML textarea overlay used to edit text boxes, sticky notes and shape labels in place. */
export function TextEditor({ board, obj }: { board: BoardDoc; obj: BoardObj }): JSX.Element | null {
  const viewport = useUI((s) => s.viewport)
  const set = useUI((s) => s.set)
  const ref = useRef<HTMLTextAreaElement>(null)
  const initial = obj.type === 'text' || obj.type === 'note' ? obj.text : obj.type === 'shape' ? (obj.text ?? '') : ''
  const [value, setValue] = useState(initial)
  const committed = useRef(false)

  useEffect(() => {
    // Defer focus: the click that created the object would otherwise move focus
    // back to <body> (mousedown default action) and immediately blur/commit.
    const t = window.setTimeout(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }, 30)
    return () => window.clearTimeout(t)
  }, [])

  // grow textarea with content (text boxes)
  useEffect(() => {
    const el = ref.current
    if (el && obj.type === 'text') {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }, [value, obj.type])

  const commit = (): void => {
    if (committed.current) return
    committed.current = true
    const cur = board.get(obj.id)
    if (cur) {
      if (cur.type === 'text' && !value.trim()) board.remove([cur.id])
      else if (value !== initial) board.update(cur.id, { text: value } as Partial<BoardObj>)
    }
    set({ editingId: null })
  }

  if (obj.type !== 'text' && obj.type !== 'note' && obj.type !== 'shape') return null

  const s = viewport.scale
  const left = obj.x * s + viewport.x
  const top = obj.y * s + viewport.y
  const base: React.CSSProperties = {
    position: 'absolute',
    left,
    top,
    transform: `rotate(${obj.rotation || 0}deg)`,
    transformOrigin: 'top left',
    fontFamily: 'Segoe UI, Arial, sans-serif',
    lineHeight: 1.2,
    resize: 'none',
    outline: '2px solid #3f51b5',
    border: 'none',
    margin: 0,
    overflow: 'hidden',
    zIndex: 20
  }
  let style: React.CSSProperties
  if (obj.type === 'text') {
    style = {
      ...base,
      width: obj.width * s,
      minHeight: obj.fontSize * 1.3 * s,
      padding: 4 * s,
      fontSize: obj.fontSize * s,
      color: obj.color,
      fontWeight: obj.bold ? 'bold' : 'normal',
      fontStyle: obj.italic ? 'italic' : 'normal',
      textDecoration: [obj.underline ? 'underline' : '', obj.strike ? 'line-through' : ''].join(' ').trim() || 'none',
      textAlign: obj.align ?? 'left',
      background: obj.background && obj.background !== 'transparent' ? obj.background : 'rgba(255,255,255,0.6)'
    }
  } else if (obj.type === 'note') {
    const fs = fitFontSize(value, obj.width - 28, obj.height - 28)
    style = {
      ...base,
      width: obj.width * s,
      height: obj.height * s,
      padding: 14 * s,
      fontSize: fs * s,
      color: obj.textColor ?? '#1f1f1f',
      background: obj.color,
      textAlign: obj.align ?? 'center',
      fontWeight: obj.bold ? 'bold' : 'normal',
      fontStyle: obj.italic ? 'italic' : 'normal',
      paddingTop: Math.max(14, obj.height / 2 - fs * 0.7) * s
    }
  } else {
    const fs = obj.fontSize ?? 20
    style = {
      ...base,
      left: (obj.x + Math.min(0, obj.width)) * s + viewport.x,
      top: (obj.y + Math.min(0, obj.height)) * s + viewport.y,
      width: Math.abs(obj.width) * s,
      height: Math.abs(obj.height) * s,
      padding: 10 * s,
      paddingTop: Math.max(10, Math.abs(obj.height) / 2 - fs * 0.7) * s,
      fontSize: fs * s,
      color: obj.textColor ?? '#1f1f1f',
      background: 'rgba(255,255,255,0.35)',
      textAlign: 'center'
    }
  }

  return (
    <textarea
      ref={ref}
      aria-label="Edit text"
      value={value}
      style={style}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault()
          commit()
        }
      }}
      onPaste={(e) => e.stopPropagation()}
      onCopy={(e) => e.stopPropagation()}
      onCut={(e) => e.stopPropagation()}
    />
  )
}
