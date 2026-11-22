import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

export interface BoardMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  thumbnail?: string
}

export interface BoardFile {
  format: 'jboard'
  version: 1
  meta: BoardMeta
  /** base64 encoded Yjs state update */
  update: string
}

export function boardsDir(): string {
  return join(app.getPath('userData'), 'boards')
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(boardsDir(), { recursive: true })
}

const fileFor = (id: string): string => join(boardsDir(), `${id.replace(/[^a-zA-Z0-9_-]/g, '')}.jboard`)

export function parseBoardFile(text: string): BoardFile {
  const data = JSON.parse(text) as BoardFile
  if (data.format !== 'jboard' || !data.meta || typeof data.update !== 'string') {
    throw new Error('Not a valid JobaBoard file')
  }
  return data
}

export async function listBoards(): Promise<BoardMeta[]> {
  await ensureDir()
  const files = (await fs.readdir(boardsDir())).filter((f) => f.endsWith('.jboard'))
  const metas: BoardMeta[] = []
  for (const f of files) {
    try {
      const b = parseBoardFile(await fs.readFile(join(boardsDir(), f), 'utf8'))
      metas.push(b.meta)
    } catch {
      /* skip corrupt file */
    }
  }
  return metas.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadBoard(id: string): Promise<BoardFile | null> {
  try {
    return parseBoardFile(await fs.readFile(fileFor(id), 'utf8'))
  } catch {
    return null
  }
}

export async function saveBoard(file: BoardFile): Promise<void> {
  await ensureDir()
  const target = fileFor(file.meta.id)
  const tmp = target + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(file), 'utf8')
  await fs.rename(tmp, target)
}

export async function createBoard(name: string): Promise<BoardMeta> {
  const now = Date.now()
  const meta: BoardMeta = { id: randomUUID(), name, createdAt: now, updatedAt: now }
  await saveBoard({ format: 'jboard', version: 1, meta, update: '' })
  return meta
}

export async function deleteBoard(id: string): Promise<void> {
  await fs.rm(fileFor(id), { force: true })
}

export async function renameBoard(id: string, name: string): Promise<void> {
  const b = await loadBoard(id)
  if (!b) return
  b.meta.name = name
  b.meta.updatedAt = Date.now()
  await saveBoard(b)
}

export async function duplicateBoard(id: string): Promise<BoardMeta | null> {
  const b = await loadBoard(id)
  if (!b) return null
  const now = Date.now()
  const meta: BoardMeta = { ...b.meta, id: randomUUID(), name: `${b.meta.name} (copy)`, createdAt: now, updatedAt: now }
  await saveBoard({ ...b, meta })
  return meta
}

/** Import an external .jboard file into the library (always as a new id). */
export async function importBoardFile(path: string): Promise<BoardMeta> {
  const b = parseBoardFile(await fs.readFile(path, 'utf8'))
  const meta: BoardMeta = { ...b.meta, id: randomUUID(), updatedAt: Date.now() }
  await saveBoard({ ...b, meta })
  return meta
}

export async function exportBoardFile(id: string, path: string): Promise<void> {
  const b = await loadBoard(id)
  if (!b) throw new Error('Board not found')
  await fs.writeFile(path, JSON.stringify(b), 'utf8')
}
