import { useEffect, useState } from 'react'
import { WebsocketProvider } from 'y-websocket'
import { BoardDoc, fromBase64 } from './board/doc'
import { BoardView } from './board/BoardView'
import { Home } from './home/Home'
import { useUI } from './board/store'
import { desktop, type BoardMeta } from './api'
import { TEMPLATES } from './board/templates'
import { PromptModal } from './board/ui'

interface Open {
  board: BoardDoc
  meta: BoardMeta
}

function DesktopApp(): JSX.Element {
  const [open, setOpen] = useState<Open | null>(null)
  const dark = useUI((s) => s.dark)

  const openBoard = async (id: string, templateId?: string): Promise<void> => {
    const file = await desktop!.loadBoard(id)
    if (!file) return
    const board = new BoardDoc(file.update ? fromBase64(file.update) : undefined)
    if (!board.meta.get('name')) board.doc.transact(() => board.meta.set('name', file.meta.name), 'settings')
    const tpl = TEMPLATES.find((t) => t.id === templateId)
    if (tpl) {
      board.addMany(tpl.build(0, 0))
      board.undo.clear()
    }
    useUI.getState().set({ selection: [], editingId: null, panel: null, tool: tpl ? 'select' : 'pen', readOnly: false })
    setOpen({ board, meta: file.meta })
  }

  useEffect(() => desktop!.onOpenBoard((id) => openBoard(id)), [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  if (open) {
    return (
      <BoardView
        key={open.meta.id}
        board={open.board}
        meta={open.meta}
        onHome={() => {
          const b = open.board
          setOpen(null)
          setTimeout(() => b.destroy(), 1500)
        }}
      />
    )
  }
  return <Home onOpen={openBoard} />
}

/** Browser client used by people who open a share link. */
function GuestApp({ boardId, token, view }: { boardId: string; token: string; view: boolean }): JSX.Element {
  const userName = useUI((s) => s.userName)
  const set = useUI((s) => s.set)
  const dark = useUI((s) => s.dark)
  const [state, setState] = useState<{ board: BoardDoc; provider: WebsocketProvider } | null>(null)
  const [status, setStatus] = useState<'connecting' | 'ready' | 'denied'>('connecting')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    if (!userName) return
    const board = new BoardDoc()
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const provider = new WebsocketProvider(`${proto}://${location.host}/ws`, boardId, board.doc, { params: { t: token }, disableBc: true })
    let fails = 0
    provider.on('sync', (synced: boolean) => {
      if (synced) setStatus('ready')
    })
    provider.on('connection-close', () => {
      fails++
      if (fails > 4 && !provider.synced) setStatus('denied')
    })
    useUI.getState().set({ readOnly: view, tool: view ? 'pan' : 'pen', selection: [] })
    setState({ board, provider })
    return () => {
      provider.destroy()
      board.destroy()
    }
  }, [boardId, token, view, userName])

  if (!userName) {
    return (
      <div className={'guest-splash' + (dark ? ' dark' : '')}>
        <PromptModal
          title="Join whiteboard"
          fields={[{ key: 'name', label: 'Your name (shown to others)', placeholder: 'e.g. Sam' }]}
          submitLabel="Join"
          onSubmit={(v) => set({ userName: v.name.trim() || 'Guest' })}
          onClose={() => set({ userName: 'Guest' })}
        />
      </div>
    )
  }
  if (status === 'denied') {
    return (
      <div className="guest-splash">
        <div className="splash-card">
          <h2>Can’t join this board</h2>
          <p>The share link has expired or the host stopped sharing. Ask the host for a new link.</p>
        </div>
      </div>
    )
  }
  if (!state || status !== 'ready') {
    return (
      <div className="guest-splash">
        <div className="splash-card">
          <div className="spinner" />
          <p>Connecting to the board…</p>
        </div>
      </div>
    )
  }
  return <BoardView board={state.board} guestProvider={state.provider} />
}

export function App(): JSX.Element {
  const params = new URLSearchParams(location.search)
  const boardId = params.get('board')
  const token = params.get('t')
  if (!desktop) {
    if (boardId && token) return <GuestApp boardId={boardId} token={token} view={params.get('mode') === 'view'} />
    return (
      <div className="guest-splash">
        <div className="splash-card">
          <h2>JobaBoard</h2>
          <p>Open a share link from the JobaBoard desktop app to join a board.</p>
        </div>
      </div>
    )
  }
  return <DesktopApp />
}
