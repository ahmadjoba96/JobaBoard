import { useEffect, useState } from 'react'
import { Plus, FolderOpen, Search, MoreVertical, Moon, Sun, RefreshCw } from 'lucide-react'
import { desktop, type BoardMeta } from '../api'
import { useUI } from '../board/store'
import { TEMPLATES } from '../board/templates'
import { PromptModal, Modal } from '../board/ui'

function timeAgo(t: number): string {
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`
  return new Date(t).toLocaleDateString()
}

export function Home({ onOpen }: { onOpen: (id: string, templateId?: string) => void }): JSX.Element {
  const [boards, setBoards] = useState<BoardMeta[] | null>(null)
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<BoardMeta | null>(null)
  const [deleting, setDeleting] = useState<BoardMeta | null>(null)
  const [version, setVersion] = useState('')
  const dark = useUI((s) => s.dark)
  const set = useUI((s) => s.set)

  const refresh = (): void => {
    desktop?.listBoards().then(setBoards)
  }
  useEffect(() => {
    refresh()
    desktop?.version().then(setVersion)
    document.title = 'JobaBoard'
    desktop?.setTitle('JobaBoard')
  }, [])

  const create = async (templateId?: string): Promise<void> => {
    const tpl = TEMPLATES.find((t) => t.id === templateId)
    const n = (boards?.length ?? 0) + 1
    const meta = await desktop!.createBoard(tpl ? tpl.name : `Board ${n}`)
    onOpen(meta.id, templateId)
  }

  const list = (boards ?? []).filter((b) => b.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className={'home' + (dark ? ' dark' : '')} onClick={() => setMenu(null)}>
      <header className="home-head">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 32 32" width="30" height="30">
              <rect x="2" y="2" width="28" height="28" rx="7" fill="#3f51b5" />
              <path d="M8 21 C11 12, 15 12, 16 17 S 21 22, 24 11" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
              <circle cx="24" cy="11" r="2.4" fill="#ffd54f" />
            </svg>
          </span>
          <h1>JobaBoard</h1>
        </div>
        <div className="home-search">
          <Search size={16} />
          <input placeholder="Search boards" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search boards" />
        </div>
        <div className="home-actions">
          <button className="icon-btn" title={dark ? 'Light mode' : 'Dark mode'} aria-label="Toggle dark mode" onClick={() => set({ dark: !dark })}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="icon-btn" title="Check for updates" aria-label="Check for updates" onClick={() => desktop?.checkUpdates()}>
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <section className="home-create">
        <button className="create-card new" onClick={() => create()}>
          <Plus size={34} />
          <span>New board</span>
        </button>
        <button
          className="create-card"
          onClick={async () => {
            const meta = await desktop!.openBoardFile()
            if (meta) onOpen(meta.id)
          }}
        >
          <FolderOpen size={30} />
          <span>Open .jboard file</span>
        </button>
        {TEMPLATES.slice(0, 6).map((t) => (
          <button key={t.id} className="create-card tpl" onClick={() => create(t.id)}>
            <span className="tpl-icon">{t.icon}</span>
            <span>{t.name}</span>
          </button>
        ))}
      </section>

      <h2 className="home-sub">{q ? 'Search results' : 'Recent boards'}</h2>
      {boards === null ? (
        <p className="muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="muted">{q ? 'No boards match your search.' : 'No boards yet — create your first one above.'}</p>
      ) : (
        <section className="board-grid">
          {list.map((b) => (
            <div key={b.id} className="board-card" onDoubleClick={() => onOpen(b.id)}>
              <button className="thumb" onClick={() => onOpen(b.id)} aria-label={'Open ' + b.name}>
                {b.thumbnail ? <img src={b.thumbnail} alt="" /> : <span className="thumb-empty">Empty board</span>}
              </button>
              <div className="card-foot">
                <div>
                  <div className="card-name">{b.name}</div>
                  <div className="card-time">Edited {timeAgo(b.updatedAt)}</div>
                </div>
                <button
                  className="icon-btn"
                  aria-label="Board options"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenu(menu === b.id ? null : b.id)
                  }}
                >
                  <MoreVertical size={16} />
                </button>
                {menu === b.id && (
                  <div className="menu card-menu" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onOpen(b.id)}>Open</button>
                    <button onClick={() => (setMenu(null), setRenaming(b))}>Rename</button>
                    <button onClick={async () => (setMenu(null), await desktop!.duplicateBoard(b.id), refresh())}>Duplicate</button>
                    <button onClick={() => (setMenu(null), desktop!.saveBoardAs(b.id, b.name))}>Save as file…</button>
                    <button className="danger" onClick={() => (setMenu(null), setDeleting(b))}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
      <footer className="home-foot">JobaBoard {version} · Your boards are stored locally on this PC</footer>

      {renaming && (
        <PromptModal
          title="Rename board"
          fields={[{ key: 'name', label: 'Name', initial: renaming.name }]}
          submitLabel="Rename"
          onSubmit={async (v) => {
            if (v.name.trim()) await desktop!.renameBoard(renaming.id, v.name.trim())
            refresh()
          }}
          onClose={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <Modal title="Delete board?" onClose={() => setDeleting(null)}>
          <p>
            “{deleting.name}” will be permanently deleted from this PC. This can’t be undone.
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              className="btn danger"
              onClick={async () => {
                await desktop!.deleteBoard(deleting.id)
                setDeleting(null)
                refresh()
              }}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
