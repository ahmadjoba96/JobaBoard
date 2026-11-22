import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Copy, Check, Play, Pause, RotateCcw, Users, Eye, Pencil } from 'lucide-react'
import type { BoardObj, BackgroundType, TimerState } from '../types'
import type { Actions } from './actions'
import type { BoardDoc } from './doc'
import { TEMPLATES } from './templates'
import { useUI } from './store'
import { boundsOf, objBounds } from './geometry'
import { ColorRow, Modal } from './ui'
import type { ShareResult } from '../api'
import type { Peer } from './Canvas'

function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <aside className="side-panel" aria-label={title}>
      <div className="sp-head">
        <h3>{title}</h3>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="sp-body">{children}</div>
    </aside>
  )
}

export function TemplatesPanel({ actions }: { actions: Actions }): JSX.Element {
  const set = useUI((s) => s.set)
  const [q, setQ] = useState('')
  const cats = Array.from(new Set(TEMPLATES.map((t) => t.category)))
  const list = TEMPLATES.filter((t) => (t.name + t.description).toLowerCase().includes(q.toLowerCase()))
  return (
    <SidePanel title="Templates" onClose={() => set({ panel: null })}>
      <input className="search" placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
      {cats.map((c) => {
        const items = list.filter((t) => t.category === c)
        if (!items.length) return null
        return (
          <div key={c}>
            <div className="sp-cat">{c}</div>
            <div className="tpl-grid">
              {items.map((t) => (
                <button
                  key={t.id}
                  className="tpl"
                  onClick={() => {
                    actions.insertTemplate(t)
                    set({ panel: null })
                  }}
                >
                  <span className="tpl-icon">{t.icon}</span>
                  <span className="tpl-name">{t.name}</span>
                  <span className="tpl-desc">{t.description}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </SidePanel>
  )
}

function describe(o: BoardObj): string {
  switch (o.type) {
    case 'text':
      return o.text.slice(0, 40) || 'Text'
    case 'note':
      return '🗒 ' + (o.text.slice(0, 36) || 'Sticky note')
    case 'shape':
      return '⬜ ' + (o.text?.slice(0, 30) || o.kind)
    case 'image':
      return '🖼 Image'
    case 'link':
      return '🔗 ' + o.title
    case 'reaction':
      return o.emoji + ' Reaction'
    case 'stroke':
      return '✎ Ink (' + o.tool + ')'
  }
}

export function OutlinePanel({ actions, objects }: { actions: Actions; objects: BoardObj[] }): JSX.Element {
  const set = useUI((s) => s.set)
  const selection = useUI((s) => s.selection)
  const [filter, setFilter] = useState<'all' | BoardObj['type']>('all')
  const list = objects.filter((o) => filter === 'all' || o.type === filter).slice().reverse()
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    objects.forEach((o) => (c[o.type] = (c[o.type] ?? 0) + 1))
    return c
  }, [objects])
  return (
    <SidePanel title={`Board outline (${objects.length})`} onClose={() => set({ panel: null })}>
      <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="search" aria-label="Filter">
        <option value="all">All items</option>
        {Object.entries(counts).map(([t, n]) => (
          <option key={t} value={t}>
            {t} ({n})
          </option>
        ))}
      </select>
      <ul className="outline">
        {list.map((o) => (
          <li key={o.id}>
            <button className={selection.includes(o.id) ? 'on' : ''} onClick={() => actions.centerOn(o.id)}>
              {describe(o)} {o.locked ? '🔒' : ''}
            </button>
          </li>
        ))}
        {!list.length && <li className="empty">Nothing here yet</li>}
      </ul>
    </SidePanel>
  )
}

export function SettingsModal({ board, onClose, onSaveAs }: { board: BoardDoc; onClose: () => void; onSaveAs?: () => void }): JSX.Element {
  const [st, setSt] = useState(board.settings())
  const ui = useUI()
  useEffect(() => {
    const h = (): void => setSt(board.settings())
    board.meta.observe(h)
    return () => board.meta.unobserve(h)
  }, [board])
  const bgs: { id: BackgroundType; label: string }[] = [
    { id: 'blank', label: 'Blank' },
    { id: 'dots', label: 'Dots' },
    { id: 'grid', label: 'Grid' },
    { id: 'lines', label: 'Lines' },
    { id: 'isometric', label: 'Isometric' }
  ]
  return (
    <Modal title="Board settings" onClose={onClose}>
      <div className="fp-label">Background pattern</div>
      <div className="seg">
        {bgs.map((b) => (
          <button key={b.id} className={st.bgType === b.id ? 'on' : ''} onClick={() => board.setSetting('bgType', b.id)} disabled={ui.readOnly}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="fp-label">Background color</div>
      <ColorRow
        colors={['auto', '#ffffff', '#f5f5f0', '#fff8e1', '#e8f5e9', '#e3f2fd', '#fce4ec', '#263238', '#1b2a1b', '#102027']}
        value={st.bgColor}
        onChange={(c) => !ui.readOnly && board.setSetting('bgColor', c)}
        custom
      />
      <div className="hint">“auto” follows light / dark mode (first swatch)</div>
      <div className="fp-label">Preferences</div>
      <label className="check">
        <input type="checkbox" checked={ui.dark} onChange={(e) => ui.set({ dark: e.target.checked })} /> Dark mode
      </label>
      <label className="check">
        <input type="checkbox" checked={ui.snapToGrid} onChange={(e) => ui.set({ snapToGrid: e.target.checked })} /> Snap objects to grid when moving
      </label>
      <label className="check">
        <input type="checkbox" checked={ui.showMinimap} onChange={(e) => ui.set({ showMinimap: e.target.checked })} /> Show minimap
      </label>
      <label className="field">
        <span>Your name (shown on notes and to collaborators)</span>
        <input value={ui.userName} onChange={(e) => ui.set({ userName: e.target.value })} placeholder="Your name" />
      </label>
      {onSaveAs && (
        <div className="modal-actions">
          <button className="btn" onClick={onSaveAs}>
            Save a copy as .jboard file…
          </button>
        </div>
      )}
    </Modal>
  )
}

const SHORTCUTS: [string, string][] = [
  ['V', 'Select'],
  ['H / hold Space', 'Pan the canvas'],
  ['P', 'Pen'],
  ['M', 'Highlighter'],
  ['E', 'Eraser'],
  ['L', 'Lasso select'],
  ['N', 'Sticky note'],
  ['T', 'Text'],
  ['R', 'Shapes'],
  ['U', 'Toggle ruler'],
  ['Ctrl + Z / Ctrl + Y', 'Undo / redo'],
  ['Ctrl + C / X / V', 'Copy / cut / paste (images, text, objects)'],
  ['Ctrl + D', 'Duplicate'],
  ['Ctrl + A', 'Select all'],
  ['Delete / Backspace', 'Delete selection'],
  ['Arrows (Shift = 10×)', 'Nudge selection'],
  ['Ctrl + G / Ctrl + Shift + G', 'Group / ungroup'],
  ['Ctrl + L', 'Lock / unlock'],
  ['Ctrl + ] / [', 'Bring forward / send backward'],
  ['Ctrl + B / I / U', 'Bold / italic / underline'],
  ['Ctrl + wheel / pinch', 'Zoom'],
  ['Ctrl + = / - / 0', 'Zoom in / out / 100%'],
  ['Shift + 1', 'Fit to content'],
  ['Ctrl + E', 'Export PNG'],
  ['Double-click', 'Edit text, note or shape label; open link'],
  ['Esc', 'Deselect / stop editing'],
  ['?', 'This help']
]

export function HelpModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} wide>
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}

function CopyField({ value }: { value: string }): JSX.Element {
  const [done, setDone] = useState(false)
  return (
    <div className="copy-field">
      <input readOnly value={value} onFocus={(e) => e.target.select()} />
      <button
        className="btn"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => undefined)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        }}
      >
        {done ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  )
}

export function ShareModal({
  info,
  busy,
  peers,
  onStart,
  onStop,
  onClose
}: {
  info: ShareResult | null
  busy: boolean
  peers: Peer[]
  onStart: () => void
  onStop: () => void
  onClose: () => void
}): JSX.Element {
  const [tab, setTab] = useState<'edit' | 'view'>('edit')
  return (
    <Modal title="Share this board" onClose={onClose} wide>
      {!info ? (
        <>
          <p>
            Start a live session hosted on <b>this PC</b>. Anyone on the same network (Wi-Fi / LAN) can open the link in any web browser — no
            install needed — and draw with you in real time.
          </p>
          <ul className="bullets">
            <li>Collaboration works while JobaBoard is open on this PC.</li>
            <li>If Windows asks, allow JobaBoard through the firewall on private networks.</li>
            <li>For people outside your network, see the README (port forwarding or a tunnel).</li>
          </ul>
          <div className="modal-actions">
            <button className="btn primary" onClick={onStart} disabled={busy}>
              <Users size={16} /> {busy ? 'Starting…' : 'Start live sharing'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="seg">
            <button className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>
              <Pencil size={14} /> Can edit
            </button>
            <button className={tab === 'view' ? 'on' : ''} onClick={() => setTab('view')}>
              <Eye size={14} /> View only
            </button>
          </div>
          <div className="share-body">
            <img src={tab === 'edit' ? info.qrEdit : info.qrView} alt="QR code for the share link" className="qr" />
            <div className="share-links">
              <div className="fp-label">{tab === 'edit' ? 'Anyone with this link can edit' : 'Anyone with this link can view and follow along'}</div>
              <CopyField value={tab === 'edit' ? info.editUrl : info.viewUrl} />
              <div className="hint">
                Hosted at {info.host}:{info.port}. Scan the QR code from a phone or tablet on the same Wi-Fi.
              </div>
              <div className="fp-label">In this session ({peers.length + 1})</div>
              <div className="peers">
                <span className="peer me">You (host)</span>
                {peers.map((p) => (
                  <span key={p.clientId} className="peer" style={{ background: p.state.color }}>
                    {p.state.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn danger" onClick={onStop}>
              Stop sharing
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

export function Minimap({ actions, objects }: { actions: Actions; objects: BoardObj[] }): JSX.Element | null {
  const ref = useRef<HTMLCanvasElement>(null)
  const viewport = useUI((s) => s.viewport)
  const show = useUI((s) => s.showMinimap)
  const dark = useUI((s) => s.dark)
  const W = 200
  const H = 130
  const content = boundsOf(objects)
  const screen = actions.screenSize()
  const view = {
    x: -viewport.x / viewport.scale,
    y: -viewport.y / viewport.scale,
    width: screen.width / viewport.scale,
    height: screen.height / viewport.scale
  }
  const all = content
    ? {
        x: Math.min(content.x, view.x),
        y: Math.min(content.y, view.y),
        width: Math.max(content.x + content.width, view.x + view.width) - Math.min(content.x, view.x),
        height: Math.max(content.y + content.height, view.y + view.height) - Math.min(content.y, view.y)
      }
    : view
  const sc = Math.min(W / all.width, H / all.height) * 0.9
  const ox = (W - all.width * sc) / 2 - all.x * sc
  const oy = (H - all.height * sc) / 2 - all.y * sc

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    for (const o of objects) {
      const b = objBounds(o)
      ctx.fillStyle =
        o.type === 'note' ? (o as { color: string }).color : o.type === 'stroke' ? (o as { color: string }).color : o.type === 'image' ? '#90a4ae' : dark ? '#9fa8da' : '#7986cb'
      ctx.globalAlpha = 0.8
      ctx.fillRect(ox + b.x * sc, oy + b.y * sc, Math.max(1.5, b.width * sc), Math.max(1.5, b.height * sc))
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#3f51b5'
    ctx.lineWidth = 2
    ctx.strokeRect(ox + view.x * sc, oy + view.y * sc, view.width * sc, view.height * sc)
  })

  if (!show) return null
  const jump = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const r = e.currentTarget.getBoundingClientRect()
    const wx = (e.clientX - r.left - ox) / sc
    const wy = (e.clientY - r.top - oy) / sc
    useUI.getState().set({
      viewport: { scale: viewport.scale, x: screen.width / 2 - wx * viewport.scale, y: screen.height / 2 - wy * viewport.scale }
    })
  }
  return (
    <canvas
      ref={ref}
      className="minimap"
      width={W}
      height={H}
      aria-label="Minimap — click to navigate"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        jump(e)
      }}
      onPointerMove={(e) => e.buttons && jump(e)}
    />
  )
}

function fmt(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** Shared countdown timer (synced to collaborators through the board doc). */
export function TimerWidget({ board, onClose }: { board: BoardDoc; onClose: () => void }): JSX.Element {
  const [timer, setTimer] = useState<TimerState | null>(board.timer())
  const [, tick] = useState(0)
  const readOnly = useUI((s) => s.readOnly)
  const alerted = useRef(false)
  useEffect(() => {
    const h = (): void => setTimer(board.timer())
    board.meta.observe(h)
    const iv = setInterval(() => tick((n) => n + 1), 250)
    return () => {
      board.meta.unobserve(h)
      clearInterval(iv)
    }
  }, [board])
  const remaining = timer ? (timer.running ? timer.endAt - Date.now() : timer.remaining) : 0
  useEffect(() => {
    if (timer?.running && remaining <= 0 && !alerted.current) {
      alerted.current = true
      try {
        const ac = new AudioContext()
        const o = ac.createOscillator()
        o.frequency.value = 880
        o.connect(ac.destination)
        o.start()
        o.stop(ac.currentTime + 0.4)
      } catch {
        /* no audio */
      }
    }
    if (remaining > 0) alerted.current = false
  })
  const start = (ms: number): void => board.setTimer({ running: true, endAt: Date.now() + ms, remaining: ms, duration: ms })
  return (
    <div className={'timer' + (timer?.running && remaining <= 0 ? ' done' : '')} role="timer">
      <span className="timer-val">{timer ? fmt(remaining) : '--:--'}</span>
      {!readOnly && (
        <>
          {[1, 3, 5, 10].map((m) => (
            <button key={m} className="btn small" onClick={() => start(m * 60000)}>
              {m}m
            </button>
          ))}
          {timer && (
            <button
              className="icon-btn"
              aria-label={timer.running ? 'Pause' : 'Resume'}
              onClick={() =>
                timer.running
                  ? board.setTimer({ ...timer, running: false, remaining: Math.max(0, timer.endAt - Date.now()) })
                  : board.setTimer({ ...timer, running: true, endAt: Date.now() + timer.remaining })
              }
            >
              {timer.running ? <Pause size={16} /> : <Play size={16} />}
            </button>
          )}
          {timer && (
            <button className="icon-btn" aria-label="Reset" onClick={() => board.setTimer(null)}>
              <RotateCcw size={16} />
            </button>
          )}
        </>
      )}
      <button className="icon-btn" aria-label="Hide timer" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  )
}
