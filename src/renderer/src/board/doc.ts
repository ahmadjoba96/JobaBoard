import * as Y from 'yjs'
import { nanoid } from 'nanoid'
import type { BoardObj, BoardSettings, NewObj, TimerState } from '../types'

export const LOCAL = 'local'

export function uid(): string {
  return nanoid(12)
}

export function toBase64(u8: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode(...u8.subarray(i, i + chunk))
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const u8 = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i)
  return u8
}

/**
 * The board document. A Yjs doc is the single source of truth, which gives us
 * undo/redo, persistence and real-time collaboration from one model.
 */
export class BoardDoc {
  readonly doc: Y.Doc
  readonly objects: Y.Map<BoardObj>
  readonly meta: Y.Map<unknown>
  readonly undo: Y.UndoManager

  constructor(initialUpdate?: Uint8Array) {
    this.doc = new Y.Doc()
    if (initialUpdate && initialUpdate.length) Y.applyUpdate(this.doc, initialUpdate)
    this.objects = this.doc.getMap<BoardObj>('objects')
    this.meta = this.doc.getMap('meta')
    this.undo = new Y.UndoManager([this.objects], {
      trackedOrigins: new Set([LOCAL]),
      captureTimeout: 400
    })
  }

  destroy(): void {
    this.undo.destroy()
    this.doc.destroy()
  }

  encode(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc)
  }

  transact(fn: () => void): void {
    this.doc.transact(fn, LOCAL)
  }

  /** Stop merging consecutive edits into one undo step. */
  breakUndo(): void {
    this.undo.stopCapturing()
  }

  list(): BoardObj[] {
    return Array.from(this.objects.values()).sort((a, b) => a.z - b.z)
  }

  get(id: string): BoardObj | undefined {
    return this.objects.get(id)
  }

  maxZ(): number {
    let m = 0
    this.objects.forEach((o) => {
      if (o.z > m) m = o.z
    })
    return m
  }

  minZ(): number {
    let m = 0
    this.objects.forEach((o) => {
      if (o.z < m) m = o.z
    })
    return m
  }

  add(obj: NewObj): BoardObj {
    const full = { ...obj, id: obj.id ?? uid(), z: obj.z ?? this.maxZ() + 1 } as BoardObj
    this.transact(() => this.objects.set(full.id, full))
    return full
  }

  addMany(objs: NewObj[]): BoardObj[] {
    let z = this.maxZ()
    const out: BoardObj[] = []
    this.transact(() => {
      for (const o of objs) {
        const full = { ...o, id: o.id ?? uid(), z: ++z } as BoardObj
        this.objects.set(full.id, full)
        out.push(full)
      }
    })
    return out
  }

  update(id: string, patch: Partial<BoardObj>): void {
    const cur = this.objects.get(id)
    if (!cur) return
    this.transact(() => this.objects.set(id, { ...cur, ...patch } as BoardObj))
  }

  updateMany(patches: { id: string; patch: Partial<BoardObj> }[]): void {
    this.transact(() => {
      for (const { id, patch } of patches) {
        const cur = this.objects.get(id)
        if (cur) this.objects.set(id, { ...cur, ...patch } as BoardObj)
      }
    })
  }

  remove(ids: string[]): void {
    this.transact(() => ids.forEach((id) => this.objects.delete(id)))
  }

  bringToFront(ids: string[]): void {
    let z = this.maxZ()
    const sorted = ids.map((id) => this.get(id)).filter(Boolean).sort((a, b) => a!.z - b!.z)
    this.updateMany(sorted.map((o) => ({ id: o!.id, patch: { z: ++z } })))
  }

  sendToBack(ids: string[]): void {
    let z = this.minZ() - ids.length - 1
    const sorted = ids.map((id) => this.get(id)).filter(Boolean).sort((a, b) => a!.z - b!.z)
    this.updateMany(sorted.map((o) => ({ id: o!.id, patch: { z: ++z } })))
  }

  /** move one step forward / backward in z order */
  step(ids: string[], dir: 1 | -1): void {
    const all = this.list()
    const set = new Set(ids)
    const order = all.map((o) => o.id)
    const idxs = order.map((id, i) => (set.has(id) ? i : -1)).filter((i) => i >= 0)
    if (dir === 1) idxs.reverse()
    for (const i of idxs) {
      const j = i + dir
      if (j < 0 || j >= order.length || set.has(order[j])) continue
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    this.updateMany(order.map((id, i) => ({ id, patch: { z: i + 1 } })))
  }

  settings(): BoardSettings {
    return {
      name: (this.meta.get('name') as string) ?? 'Untitled board',
      bgType: (this.meta.get('bgType') as BoardSettings['bgType']) ?? 'dots',
      bgColor: (this.meta.get('bgColor') as string) ?? 'auto'
    }
  }

  setSetting<K extends keyof BoardSettings>(key: K, value: BoardSettings[K]): void {
    this.doc.transact(() => this.meta.set(key, value), 'settings')
  }

  timer(): TimerState | null {
    return (this.meta.get('timer') as TimerState) ?? null
  }

  setTimer(t: TimerState | null): void {
    this.doc.transact(() => (t ? this.meta.set('timer', t) : this.meta.delete('timer')), 'settings')
  }
}
