import type { BoardObj, NewObj } from '../types'
import { boundsOf } from './geometry'
import { uid } from './doc'

const MARKER = 'jobaboard/objects'

export interface ClipPayload {
  [MARKER]: 1
  objects: BoardObj[]
}

/** in-memory copy, used when the system clipboard isn't readable (e.g. context menu paste) */
let memory: BoardObj[] = []

export function serialize(objs: BoardObj[]): string {
  return JSON.stringify({ [MARKER]: 1, objects: objs } satisfies ClipPayload)
}

export function parse(text: string): BoardObj[] | null {
  if (!text || !text.includes(MARKER)) return null
  try {
    const data = JSON.parse(text) as ClipPayload
    if (data[MARKER] === 1 && Array.isArray(data.objects)) return data.objects
  } catch {
    /* not ours */
  }
  return null
}

export async function copyObjects(objs: BoardObj[]): Promise<void> {
  memory = objs.map((o) => ({ ...o }))
  try {
    await navigator.clipboard.writeText(serialize(objs))
  } catch {
    /* clipboard permission denied: memory copy still works */
  }
}

export function memoryObjects(): BoardObj[] {
  return memory
}

/**
 * Re-id objects (keeping groups together) and move them so their bounds are
 * centred on (cx, cy).
 */
export function prepareForPaste(objs: BoardObj[], cx: number, cy: number): NewObj[] {
  const b = boundsOf(objs)
  if (!b) return []
  const dx = cx - (b.x + b.width / 2)
  const dy = cy - (b.y + b.height / 2)
  const groupMap = new Map<string, string>()
  return objs
    .slice()
    .sort((a, b2) => a.z - b2.z)
    .map((o) => {
      const { id: _id, z: _z, ...rest } = o
      const g = o.groupId ? (groupMap.get(o.groupId) ?? groupMap.set(o.groupId, uid()).get(o.groupId)) : undefined
      return { ...rest, x: o.x + dx, y: o.y + dy, groupId: g, locked: false } as NewObj
    })
}

export function isUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim())
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({ width: 300, height: 200 })
    img.src = src
  })
}

/** Downscale very large images so boards stay small and fast. */
export async function normalizeImage(src: string, maxDim = 2000): Promise<{ src: string; width: number; height: number }> {
  const { width, height } = await imageSize(src)
  if (width <= maxDim && height <= maxDim) return { src, width, height }
  const s = maxDim / Math.max(width, height)
  const img = new Image()
  img.src = src
  await img.decode().catch(() => undefined)
  const c = document.createElement('canvas')
  c.width = Math.round(width * s)
  c.height = Math.round(height * s)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  const isPng = src.startsWith('data:image/png')
  return { src: c.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.9), width: c.width, height: c.height }
}
