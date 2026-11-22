import { useEffect, useRef } from 'react'
import type { Actions } from './actions'
import { useUI } from './store'

interface Item {
  label: string
  shortcut?: string
  action: () => void
  disabled?: boolean
}

export function ContextMenu({ x, y, actions, onClose }: { x: number; y: number; actions: Actions; onClose: () => void }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const selection = useUI((s) => s.selection)
  const readOnly = useUI((s) => s.readOnly)
  const has = selection.length > 0
  const sel = actions.selected()
  const locked = has && sel.every((o) => o.locked)
  const grouped = sel.some((o) => o.groupId)
  const at = actions.pointer ?? actions.viewCenter()

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  const groups: Item[][] = readOnly
    ? [[{ label: 'Copy', shortcut: 'Ctrl+C', action: () => actions.copy(), disabled: !has }], [{ label: 'Export as PNG', action: () => actions.exportPng() }]]
    : [
        [
          { label: 'Cut', shortcut: 'Ctrl+X', action: () => actions.cut(), disabled: !has },
          { label: 'Copy', shortcut: 'Ctrl+C', action: () => actions.copy(), disabled: !has },
          { label: 'Paste', shortcut: 'Ctrl+V', action: () => actions.pasteFromClipboard(at) },
          { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => actions.duplicate(), disabled: !has },
          { label: 'Copy as image', action: () => actions.copyAsImage(), disabled: !has },
          { label: 'Delete', shortcut: 'Del', action: () => actions.deleteSelection(), disabled: !has || locked }
        ],
        [
          { label: 'Bring to front', shortcut: 'Ctrl+Shift+]', action: () => actions.bringToFront(), disabled: !has },
          { label: 'Bring forward', shortcut: 'Ctrl+]', action: () => actions.bringForward(), disabled: !has },
          { label: 'Send backward', shortcut: 'Ctrl+[', action: () => actions.sendBackward(), disabled: !has },
          { label: 'Send to back', shortcut: 'Ctrl+Shift+[', action: () => actions.sendToBack(), disabled: !has }
        ],
        [
          grouped
            ? { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', action: () => actions.ungroup() }
            : { label: 'Group', shortcut: 'Ctrl+G', action: () => actions.group(), disabled: selection.length < 2 },
          { label: 'Arrange as grid', action: () => actions.arrangeGrid(), disabled: selection.length < 2 },
          { label: locked ? 'Unlock' : 'Lock', shortcut: 'Ctrl+L', action: () => actions.toggleLock(), disabled: !has }
        ],
        [
          { label: 'Select all', shortcut: 'Ctrl+A', action: () => actions.selectAll() },
          { label: has ? 'Export selection as PNG' : 'Export board as PNG', action: () => actions.exportPng(has) },
          { label: 'Fit to content', shortcut: 'Shift+1', action: () => actions.fitToContent() }
        ]
      ]

  const left = Math.min(x, window.innerWidth - 240)
  const top = Math.min(y, window.innerHeight - 440)

  return (
    <div ref={ref} className="ctx-menu" style={{ left, top }} role="menu">
      {groups.map((g, i) => (
        <div key={i} className="ctx-group">
          {g.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                onClose()
                it.action()
              }}
            >
              <span>{it.label}</span>
              {it.shortcut && <kbd>{it.shortcut}</kbd>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
