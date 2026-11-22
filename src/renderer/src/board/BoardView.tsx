import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WebsocketProvider } from 'y-websocket'
import {
  Home as HomeIcon,
  Undo2,
  Redo2,
  Share2,
  Download,
  Settings,
  HelpCircle,
  Moon,
  Sun,
  ChevronDown,
  WifiOff
} from 'lucide-react'
import type { BoardObj, UserPresence } from '../types'
import { BoardDoc, toBase64 } from './doc'
import { Actions } from './actions'
import { useUI } from './store'
import { Canvas, type Peer } from './Canvas'
import { InkBar, CreateRail, ZoomBar } from './Toolbar'
import { FormatPanel } from './FormatPanel'
import { ContextMenu } from './ContextMenu'
import { TextEditor } from './TextEditor'
import { TemplatesPanel, OutlinePanel, SettingsModal, HelpModal, ShareModal, Minimap, TimerWidget } from './Panels'
import { PromptModal, Toasts, useToasts } from './ui'
import { desktop, type BoardMeta, type ShareResult } from '../api'

const USER_COLORS = ['#e53935', '#8e24aa', '#3949ab', '#039be5', '#00897b', '#7cb342', '#f4511e', '#6d4c41', '#d81b60', '#5e35b1']
const myColor = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]

export interface BoardViewProps {
  board: BoardDoc
  /** desktop: library metadata; guest: undefined */
  meta?: BoardMeta
  /** guest connection (already connected) */
  guestProvider?: WebsocketProvider | null
  onHome?: () => void
}

function isTyping(e: Event): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

export function BoardView({ board, meta, guestProvider, onHome }: BoardViewProps): JSX.Element {
  const [objects, setObjects] = useState<BoardObj[]>(() => board.list())
  const [settings, setSettings] = useState(board.settings())
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const [toasts, notify] = useToasts()
  const [linkPrompt, setLinkPrompt] = useState(false)
  const [showTimer, setShowTimer] = useState(() => !!board.timer())
  const [exportOpen, setExportOpen] = useState(false)
  const [share, setShare] = useState<ShareResult | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [provider, setProvider] = useState<WebsocketProvider | null>(guestProvider ?? null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [connected, setConnected] = useState(true)
  const ui = useUI()
  const actions = useMemo(() => new Actions(board, notify), [board, notify])
  const isGuest = !!guestProvider

  // ----- doc subscriptions -----
  useEffect(() => {
    const onObjs = (): void => setObjects(board.list())
    const onMeta = (): void => {
      setSettings(board.settings())
      if (board.timer()) setShowTimer(true)
    }
    const onStack = (): void => {
      setCanUndo(board.undo.canUndo())
      setCanRedo(board.undo.canRedo())
    }
    board.objects.observe(onObjs)
    board.meta.observe(onMeta)
    board.undo.on('stack-item-added', onStack)
    board.undo.on('stack-item-popped', onStack)
    board.undo.on('stack-cleared', onStack)
    onObjs()
    onMeta()
    return () => {
      board.objects.unobserve(onObjs)
      board.meta.unobserve(onMeta)
      board.undo.off('stack-item-added', onStack)
      board.undo.off('stack-item-popped', onStack)
      board.undo.off('stack-cleared', onStack)
    }
  }, [board])

  // drop selection of objects that no longer exist (deleted remotely / undo)
  useEffect(() => {
    const st = useUI.getState()
    const alive = st.selection.filter((id) => board.get(id))
    if (alive.length !== st.selection.length) st.select(alive)
    if (st.editingId && !board.get(st.editingId)) st.set({ editingId: null })
  }, [objects, board])

  const resolvedBg = settings.bgColor === 'auto' ? (ui.dark ? '#1e1f24' : '#ffffff') : settings.bgColor
  const darkCanvas = useMemo(() => {
    const c = resolvedBg.replace('#', '')
    if (c.length !== 6) return ui.dark
    const n = parseInt(c, 16)
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 < 128
  }, [resolvedBg, ui.dark])
  actions.bgColor = resolvedBg

  // ----- title -----
  useEffect(() => {
    const t = `${settings.name} — JobaBoard`
    document.title = t
    desktop?.setTitle(t)
  }, [settings.name])

  // ----- autosave (desktop) -----
  const lastThumb = useRef(0)
  const thumb = useRef<string | undefined>(meta?.thumbnail)
  const saveTimer = useRef<number>(0)
  const doSave = useCallback(async () => {
    if (!desktop || !meta) return
    if (Date.now() - lastThumb.current > 8000) {
      lastThumb.current = Date.now()
      try {
        thumb.current = actions.thumbnail() ?? thumb.current
      } catch {
        /* ignore */
      }
    }
    await desktop.saveBoard({
      format: 'jboard',
      version: 1,
      meta: { ...meta, name: board.settings().name, updatedAt: Date.now(), thumbnail: thumb.current },
      update: toBase64(board.encode())
    })
  }, [actions, board, meta])

  useEffect(() => {
    if (!desktop || !meta) return
    const onUpdate = (): void => {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(doSave, 700)
    }
    board.doc.on('update', onUpdate)
    return () => {
      board.doc.off('update', onUpdate)
      window.clearTimeout(saveTimer.current)
      lastThumb.current = 0
      void doSave()
    }
  }, [board, doSave, meta])

  // ----- awareness / presence -----
  const awareness = provider?.awareness ?? null
  useEffect(() => {
    if (!awareness) {
      setPeers([])
      return
    }
    const name = useUI.getState().userName || (isGuest ? 'Guest' : 'Host')
    awareness.setLocalState({ name, color: myColor, cursor: null, selection: [] } satisfies UserPresence)
    const onChange = (): void => {
      const list: Peer[] = []
      awareness.getStates().forEach((state, clientId) => {
        if (clientId !== awareness.clientID && state && (state as UserPresence).name) list.push({ clientId, state: state as Peer['state'] })
      })
      setPeers(list)
    }
    awareness.on('change', onChange)
    onChange()
    const unsub = useUI.subscribe((s, prev) => {
      if (s.selection !== prev.selection) awareness.setLocalStateField('selection', s.selection)
      if (s.userName !== prev.userName) awareness.setLocalStateField('name', s.userName || (isGuest ? 'Guest' : 'Host'))
    })
    return () => {
      awareness.off('change', onChange)
      unsub()
    }
  }, [awareness, isGuest])

  useEffect(() => {
    if (!provider) return
    const onStatus = ({ status }: { status: string }): void => setConnected(status === 'connected')
    provider.on('status', onStatus)
    return () => provider.off('status', onStatus)
  }, [provider])

  // ----- sharing (desktop host) -----
  useEffect(() => {
    if (!desktop || !meta) return
    let cancelled = false
    desktop.shareStatus(meta.id).then(async (on) => {
      if (on && !cancelled) await startShare()
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hostProvider = useRef<WebsocketProvider | null>(null)
  const startShare = useCallback(async () => {
    if (!desktop || !meta) return
    setShareBusy(true)
    try {
      const info = await desktop.startShare(meta.id)
      hostProvider.current?.destroy()
      const p = new WebsocketProvider(info.hostWsBase, info.hostRoom, board.doc, { params: info.hostParams, disableBc: true })
      hostProvider.current = p
      setProvider(p)
      setShare(info)
      notify('Live sharing started')
    } catch (e) {
      notify('Could not start sharing: ' + (e as Error).message, 'error')
    } finally {
      setShareBusy(false)
    }
  }, [board, meta, notify])

  const stopShare = useCallback(async () => {
    if (!desktop || !meta) return
    hostProvider.current?.destroy()
    hostProvider.current = null
    setProvider(null)
    setShare(null)
    await desktop.stopShare(meta.id)
    notify('Sharing stopped')
  }, [meta, notify])

  useEffect(
    () => () => {
      // leaving the board: disconnect, but keep server running only while board is open
      if (hostProvider.current && meta) {
        hostProvider.current.destroy()
        desktop?.stopShare(meta.id)
      }
    },
    [meta]
  )

  // ----- keyboard shortcuts -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent): unknown => {
      if (isTyping(e)) return
      const st = useUI.getState()
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const ro = st.readOnly
      const handled = (): void => e.preventDefault()
      if (mod) {
        if (k === 'z' && !e.shiftKey) return handled(), ro || board.undo.undo()
        if (k === 'y' || (k === 'z' && e.shiftKey)) return handled(), ro || board.undo.redo()
        if (k === 'a') return handled(), actions.selectAll()
        if (k === 'd') return handled(), actions.duplicate()
        if (k === 'g' && e.shiftKey) return handled(), actions.ungroup()
        if (k === 'g') return handled(), actions.group()
        if (k === 'l') return handled(), actions.toggleLock()
        if (k === 'e') return handled(), actions.exportPng()
        if (k === ']' && e.shiftKey) return handled(), actions.bringToFront()
        if (k === '[' && e.shiftKey) return handled(), actions.sendToBack()
        if (k === '}') return handled(), actions.bringToFront()
        if (k === '{') return handled(), actions.sendToBack()
        if (k === ']') return handled(), actions.bringForward()
        if (k === '[') return handled(), actions.sendBackward()
        if (k === '=' || k === '+') return handled(), actions.zoomBy(1.2)
        if (k === '-') return handled(), actions.zoomBy(1 / 1.2)
        if (k === '0') return handled(), actions.resetZoom()
        if (k === 'b' || k === 'i' || k === 'u') {
          const field = k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline'
          const sel = actions.selected().filter((o) => o.type === 'text' || o.type === 'note')
          if (sel.length) {
            handled()
            const on = !sel.every((o) => (o as unknown as Record<string, boolean>)[field])
            board.updateMany(sel.map((o) => ({ id: o.id, patch: { [field]: on } as Partial<BoardObj> })))
          }
          return
        }
        return // let copy/cut/paste events fire
      }
      if (e.key === 'Delete' || e.key === 'Backspace') return handled(), actions.deleteSelection()
      if (e.key === 'Escape') {
        st.set({ selection: [], panel: null })
        setCtx(null)
        return
      }
      if (e.key.startsWith('Arrow') && st.selection.length && !ro) {
        handled()
        const d = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
        return actions.nudge(dx, dy)
      }
      if (e.key === '!' || (e.shiftKey && e.code === 'Digit1')) return handled(), actions.fitToContent()
      if (e.key === '?') return st.set({ panel: st.panel === 'help' ? null : 'help' })
      if (e.key === 'Enter' && st.selection.length === 1 && !ro) {
        const o = board.get(st.selection[0])
        if (o && (o.type === 'text' || o.type === 'note' || o.type === 'shape')) return handled(), st.set({ editingId: o.id })
      }
      const toolKeys: Record<string, Parameters<typeof st.setTool>[0]> = {
        v: 'select',
        h: 'pan',
        p: 'pen',
        m: 'highlighter',
        e: 'eraser',
        l: 'lasso',
        n: 'note',
        t: 'text',
        r: 'shape'
      }
      if (e.altKey || e.shiftKey) return
      if (toolKeys[k] && (!ro || k === 'h' || k === 'v')) return st.setTool(toolKeys[k])
      if (k === 'u' && !ro) return st.set({ ruler: { ...st.ruler, visible: !st.ruler.visible } })
    }
    const onCopy = (e: ClipboardEvent): void => {
      if (isTyping(e) || !useUI.getState().selection.length) return
      e.preventDefault()
      void actions.copy()
    }
    const onCut = (e: ClipboardEvent): void => {
      if (isTyping(e) || !useUI.getState().selection.length) return
      e.preventDefault()
      void actions.cut()
    }
    const onPaste = (e: ClipboardEvent): void => {
      if (isTyping(e)) return
      void actions.handlePasteEvent(e)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
    }
  }, [actions, board])

  // fit content on first open
  useEffect(() => {
    const t = setTimeout(() => {
      if (board.list().length) actions.fitToContent()
      else useUI.getState().set({ viewport: { x: 0, y: 0, scale: 1 } })
    }, 50)
    return () => clearTimeout(t)
  }, [actions, board])

  const editingObj = ui.editingId ? board.get(ui.editingId) : undefined

  const renameBoard = (name: string): void => {
    board.setSetting('name', name.trim() || 'Untitled board')
  }

  return (
    <div className={'board-view' + (ui.dark ? ' dark' : '')}>
      <header className="topbar">
        <div className="tb-left">
          {onHome && (
            <button className="icon-btn" title="All boards" aria-label="All boards" onClick={onHome}>
              <HomeIcon size={18} />
            </button>
          )}
          <span className="logo-dot" aria-hidden />
          <input
            className="board-name"
            aria-label="Board name"
            value={settings.name}
            readOnly={ui.readOnly}
            onChange={(e) => setSettings({ ...settings, name: e.target.value })}
            onBlur={(e) => renameBoard(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          {!connected && provider && (
            <span className="badge warn">
              <WifiOff size={14} /> Reconnecting…
            </span>
          )}
        </div>
        <div className="tb-right">
          {!ui.readOnly && (
            <>
              <button className="icon-btn" title="Undo (Ctrl Z)" aria-label="Undo" disabled={!canUndo} onClick={() => board.undo.undo()}>
                <Undo2 size={18} />
              </button>
              <button className="icon-btn" title="Redo (Ctrl Y)" aria-label="Redo" disabled={!canRedo} onClick={() => board.undo.redo()}>
                <Redo2 size={18} />
              </button>
            </>
          )}
          {peers.length > 0 && (
            <div className="avatars" title={peers.map((p) => p.state.name).join(', ')}>
              {peers.slice(0, 5).map((p) => (
                <span key={p.clientId} className="avatar" style={{ background: p.state.color }}>
                  {p.state.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
              {peers.length > 5 && <span className="avatar more">+{peers.length - 5}</span>}
            </div>
          )}
          <div className="dropdown">
            <button className="btn" onClick={() => setExportOpen((v) => !v)} aria-expanded={exportOpen}>
              <Download size={16} /> Export <ChevronDown size={14} />
            </button>
            {exportOpen && (
              <div className="menu" onMouseLeave={() => setExportOpen(false)}>
                <button onClick={() => (setExportOpen(false), actions.exportPng())}>Export as PNG image</button>
                <button onClick={() => (setExportOpen(false), actions.exportSvg())}>Export as SVG vector</button>
                <button onClick={() => (setExportOpen(false), actions.exportPdf())}>Export as PDF</button>
                {ui.selection.length > 0 && <button onClick={() => (setExportOpen(false), actions.exportPng(true))}>Export selection as PNG</button>}
                <button onClick={() => (setExportOpen(false), actions.copyAsImage())}>Copy as image</button>
                {desktop && meta && (
                  <button onClick={() => (setExportOpen(false), doSave().then(() => desktop!.saveBoardAs(meta.id, board.settings().name)))}>
                    Save as .jboard file…
                  </button>
                )}
              </div>
            )}
          </div>
          {desktop && meta && (
            <button className={'btn primary' + (share ? ' live' : '')} onClick={() => ui.set({ panel: 'share' })}>
              <Share2 size={16} /> {share ? 'Live' : 'Share'}
            </button>
          )}
          <button className="icon-btn" title={ui.dark ? 'Light mode' : 'Dark mode'} aria-label="Toggle dark mode" onClick={() => ui.set({ dark: !ui.dark })}>
            {ui.dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="icon-btn" title="Board settings" aria-label="Board settings" onClick={() => ui.set({ panel: 'settings' })}>
            <Settings size={18} />
          </button>
          <button className="icon-btn" title="Keyboard shortcuts (?)" aria-label="Help" onClick={() => ui.set({ panel: 'help' })}>
            <HelpCircle size={18} />
          </button>
        </div>
      </header>

      <div className="stage-wrap">
        <Canvas
          board={board}
          objects={objects}
          actions={actions}
          bgType={settings.bgType}
          bgColor={resolvedBg}
          dark={darkCanvas}
          awareness={awareness}
          peers={peers}
          onContextMenu={(x, y) => setCtx({ x, y })}
        />
        {editingObj && <TextEditor key={editingObj.id} board={board} obj={editingObj} />}
        <CreateRail actions={actions} onLink={() => setLinkPrompt(true)} onToggleTimer={() => setShowTimer((v) => !v)} />
        <InkBar />
        <ZoomBar actions={actions} />
        <Minimap actions={actions} objects={objects} />
        <FormatPanel actions={actions} objects={objects} />
        {showTimer && <TimerWidget board={board} onClose={() => setShowTimer(false)} />}
        {ui.panel === 'templates' && <TemplatesPanel actions={actions} />}
        {ui.panel === 'outline' && <OutlinePanel actions={actions} objects={objects} />}
        {!objects.length && !ui.readOnly && (
          <div className="empty-hint">
            <h2>Start creating</h2>
            <p>Draw with the pen, add sticky notes, paste images with Ctrl+V, or pick a template from the left.</p>
          </div>
        )}
      </div>

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} actions={actions} onClose={() => setCtx(null)} />}
      {ui.panel === 'settings' && (
        <SettingsModal
          board={board}
          onClose={() => ui.set({ panel: null })}
          onSaveAs={desktop && meta ? () => doSave().then(() => desktop!.saveBoardAs(meta.id, board.settings().name)) : undefined}
        />
      )}
      {ui.panel === 'help' && <HelpModal onClose={() => ui.set({ panel: null })} />}
      {ui.panel === 'share' && (
        <ShareModal info={share} busy={shareBusy} peers={peers} onStart={startShare} onStop={stopShare} onClose={() => ui.set({ panel: null })} />
      )}
      {linkPrompt && (
        <PromptModal
          title="Insert link"
          fields={[
            { key: 'url', label: 'Web address', placeholder: 'https://example.com' },
            { key: 'title', label: 'Title (optional)', placeholder: 'My link' }
          ]}
          submitLabel="Insert"
          onSubmit={(v) => v.url.trim() && actions.insertLink(v.url.trim(), v.title.trim(), actions.viewCenter())}
          onClose={() => setLinkPrompt(false)}
        />
      )}
      <Toasts items={toasts} />
    </div>
  )
}
