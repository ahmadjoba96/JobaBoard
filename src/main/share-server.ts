import http from 'http'
import os from 'os'
import { randomBytes } from 'crypto'
import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const MSG_SYNC = 0
const MSG_AWARENESS = 1

interface Room {
  doc: Y.Doc
  awareness: awarenessProtocol.Awareness
  conns: Map<WebSocket, Set<number>>
  editToken: string
  viewToken: string
}

export interface ShareInfo {
  boardId: string
  port: number
  host: string
  editUrl: string
  viewUrl: string
  /** websocket base url + params for the local desktop app (host) */
  hostWsBase: string
  hostRoom: string
  hostParams: Record<string, string>
}

let server: http.Server | null = null
let wss: WebSocketServer | null = null
let port = 4321
const rooms = new Map<string, Room>()
/** Secret that lets the local desktop app join as full editor. */
let hostSecret = randomBytes(12).toString('base64url')

export function lanAddress(): string {
  const nets = os.networkInterfaces()
  const candidates: string[] = []
  for (const list of Object.values(nets)) {
    for (const n of list ?? []) {
      if (n.family === 'IPv4' && !n.internal) candidates.push(n.address)
    }
  }
  return (
    candidates.find((a) => a.startsWith('192.168.')) ??
    candidates.find((a) => a.startsWith('10.')) ??
    candidates.find((a) => a.startsWith('172.')) ??
    candidates[0] ??
    '127.0.0.1'
  )
}

function send(conn: WebSocket, data: Uint8Array): void {
  if (conn.readyState === WebSocket.OPEN) {
    conn.send(data, (err) => {
      if (err) conn.close()
    })
  }
}

function createRoom(id: string): Room {
  const doc = new Y.Doc()
  const awareness = new awarenessProtocol.Awareness(doc)
  awareness.setLocalState(null)
  const room: Room = {
    doc,
    awareness,
    conns: new Map(),
    editToken: randomBytes(9).toString('base64url'),
    viewToken: randomBytes(9).toString('base64url')
  }
  doc.on('update', (update: Uint8Array) => {
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MSG_SYNC)
    syncProtocol.writeUpdate(enc, update)
    const msg = encoding.toUint8Array(enc)
    room.conns.forEach((_, c) => send(c, msg))
  })
  awareness.on(
    'update',
    ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const changed = added.concat(updated, removed)
      if (origin instanceof WebSocket) {
        const ids = room.conns.get(origin)
        if (ids) {
          added.forEach((i) => ids.add(i))
          removed.forEach((i) => ids.delete(i))
        }
      }
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MSG_AWARENESS)
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed))
      const msg = encoding.toUint8Array(enc)
      room.conns.forEach((_, c) => send(c, msg))
    }
  )
  rooms.set(id, room)
  return room
}

function handleConnection(conn: WebSocket, room: Room, readOnly: boolean): void {
  conn.binaryType = 'arraybuffer'
  room.conns.set(conn, new Set())
  conn.on('message', (raw: ArrayBuffer | Buffer) => {
    try {
      const data =
        raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
      const dec = decoding.createDecoder(data)
      const enc = encoding.createEncoder()
      const type = decoding.readVarUint(dec)
      if (type === MSG_SYNC) {
        encoding.writeVarUint(enc, MSG_SYNC)
        if (readOnly) {
          const syncType = decoding.readVarUint(dec)
          // read-only viewers may request state but never apply updates
          if (syncType === syncProtocol.messageYjsSyncStep1) syncProtocol.readSyncStep1(dec, enc, room.doc)
        } else {
          syncProtocol.readSyncMessage(dec, enc, room.doc, conn)
        }
        if (encoding.length(enc) > 1) send(conn, encoding.toUint8Array(enc))
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(dec), conn)
      }
    } catch (e) {
      console.error('share message error', e)
    }
  })
  const close = (): void => {
    const ids = room.conns.get(conn)
    room.conns.delete(conn)
    if (ids && ids.size) awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(ids), null)
  }
  conn.on('close', close)
  conn.on('error', close)

  const enc = encoding.createEncoder()
  encoding.writeVarUint(enc, MSG_SYNC)
  syncProtocol.writeSyncStep1(enc, room.doc)
  send(conn, encoding.toUint8Array(enc))
  const states = room.awareness.getStates()
  if (states.size > 0) {
    const enc2 = encoding.createEncoder()
    encoding.writeVarUint(enc2, MSG_AWARENESS)
    encoding.writeVarUint8Array(enc2, awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())))
    send(conn, encoding.toUint8Array(enc2))
  }
}

async function ensureServer(staticDir: string): Promise<void> {
  if (server) return
  const appx = express()
  appx.get('/health', (_req, res) => {
    res.json({ ok: true, app: 'JobaBoard' })
  })
  appx.use(
    express.static(staticDir, {
      index: 'index.html',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.mjs')) res.setHeader('Content-Type', 'text/javascript')
      }
    })
  )
  const srv = http.createServer(appx)
  const wsServer = new WebSocketServer({ noServer: true })
  srv.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    // y-websocket client connects to `${base}/${room}?params`
    const m = url.pathname.match(/^\/ws\/([\w-]+)$/)
    const room = m ? rooms.get(m[1]) : undefined
    const token = url.searchParams.get('t')
    const isHost = url.searchParams.get('host') === hostSecret
    if (!room || (!isHost && token !== room.editToken && token !== room.viewToken)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
    const readOnly = !isHost && token === room.viewToken
    wsServer.handleUpgrade(req, socket, head, (ws) => handleConnection(ws, room, readOnly))
  })
  await new Promise<void>((resolve, reject) => {
    const tryListen = (p: number, attempts: number): void => {
      const onErr = (err: NodeJS.ErrnoException): void => {
        if (err.code === 'EADDRINUSE' && attempts > 0) tryListen(p + 1, attempts - 1)
        else reject(err)
      }
      srv.once('error', onErr)
      srv.listen(p, '0.0.0.0', () => {
        srv.off('error', onErr)
        port = p
        resolve()
      })
    }
    tryListen(4321, 20)
  })
  server = srv
  wss = wsServer
}

export async function startShare(boardId: string, staticDir: string): Promise<ShareInfo> {
  await ensureServer(staticDir)
  const room = rooms.get(boardId) ?? createRoom(boardId)
  const host = lanAddress()
  const base = `http://${host}:${port}/`
  return {
    boardId,
    port,
    host,
    editUrl: `${base}?board=${boardId}&t=${room.editToken}`,
    viewUrl: `${base}?board=${boardId}&t=${room.viewToken}&mode=view`,
    hostWsBase: `ws://127.0.0.1:${port}/ws`,
    hostRoom: boardId,
    hostParams: { host: hostSecret }
  }
}

export function stopShare(boardId: string): void {
  const room = rooms.get(boardId)
  if (!room) return
  room.conns.forEach((_, c) => c.close())
  room.awareness.destroy()
  room.doc.destroy()
  rooms.delete(boardId)
  if (rooms.size === 0) shutdown()
}

export function shutdown(): void {
  rooms.forEach((r) => r.conns.forEach((_, c) => c.close()))
  rooms.clear()
  wss?.close()
  server?.close()
  wss = null
  server = null
  hostSecret = randomBytes(12).toString('base64url')
}

export function isSharing(boardId: string): boolean {
  return rooms.has(boardId)
}
