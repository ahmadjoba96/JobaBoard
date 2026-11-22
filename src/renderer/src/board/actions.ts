import type Konva from 'konva'
import type { BoardObj, NewObj, Bounds } from '../types'
import { BoardDoc, uid } from './doc'
import { useUI } from './store'
import { boundsOf, objBounds } from './geometry'
import * as clip from './clipboard'
import { renderPng, exportArea, toSvg, pngToPdfBase64, utf8ToBase64 } from './export'
import { saveFile, writeImageToClipboard } from '../api'
import type { Template } from './templates'

export type Notify = (msg: string, kind?: 'info' | 'error') => void

/**
 * All board commands live here so the toolbar, context menu, keyboard
 * shortcuts and format pane share one implementation.
 */
export class Actions {
  stage: Konva.Stage | null = null
  layer: Konva.Layer | null = null
  /** last pointer position in world coordinates */
  pointer: { x: number; y: number } | null = null
  bgColor = '#ffffff'

  constructor(
    readonly board: BoardDoc,
    readonly notify: Notify
  ) {}

  private get ui() {
    return useUI.getState()
  }

  get readOnly(): boolean {
    return this.ui.readOnly
  }

  selected(): BoardObj[] {
    return this.ui.selection.map((id) => this.board.get(id)).filter(Boolean) as BoardObj[]
  }

  /** Expand ids so that grouped objects are always selected together. */
  expandGroups(ids: string[]): string[] {
    const groups = new Set(ids.map((id) => this.board.get(id)?.groupId).filter(Boolean))
    if (!groups.size) return ids
    const out = new Set(ids)
    this.board.objects.forEach((o) => {
      if (o.groupId && groups.has(o.groupId)) out.add(o.id)
    })
    return Array.from(out)
  }

  select(ids: string[]): void {
    this.ui.select(this.expandGroups(ids))
  }

  // ---------- viewport ----------
  screenSize(): { width: number; height: number } {
    return { width: this.stage?.width() ?? window.innerWidth, height: this.stage?.height() ?? window.innerHeight }
  }

  viewCenter(): { x: number; y: number } {
    const { x, y, scale } = this.ui.viewport
    const { width, height } = this.screenSize()
    return { x: (width / 2 - x) / scale, y: (height / 2 - y) / scale }
  }

  pastePoint(): { x: number; y: number } {
    return this.pointer ?? this.viewCenter()
  }

  zoomAt(newScale: number, screenPt?: { x: number; y: number }): void {
    const { x, y, scale } = this.ui.viewport
    const s = Math.max(0.05, Math.min(8, newScale))
    const { width, height } = this.screenSize()
    const p = screenPt ?? { x: width / 2, y: height / 2 }
    const wx = (p.x - x) / scale
    const wy = (p.y - y) / scale
    this.ui.set({ viewport: { scale: s, x: p.x - wx * s, y: p.y - wy * s } })
  }

  zoomBy(f: number): void {
    this.zoomAt(this.ui.viewport.scale * f)
  }

  resetZoom(): void {
    this.zoomAt(1)
  }

  fitBounds(b: Bounds, maxScale = 2): void {
    const { width, height } = this.screenSize()
    const pad = 80
    const s = Math.max(0.05, Math.min(maxScale, (width - pad * 2) / Math.max(1, b.width), (height - pad * 2) / Math.max(1, b.height)))
    this.ui.set({
      viewport: { scale: s, x: width / 2 - (b.x + b.width / 2) * s, y: height / 2 - (b.y + b.height / 2) * s }
    })
  }

  fitToContent(): void {
    const b = boundsOf(this.board.list())
    if (b) this.fitBounds(b, 1.5)
    else this.ui.set({ viewport: { x: 0, y: 0, scale: 1 } })
  }

  centerOn(id: string): void {
    const o = this.board.get(id)
    if (!o) return
    const b = objBounds(o)
    const { scale } = this.ui.viewport
    const { width, height } = this.screenSize()
    this.ui.set({ viewport: { scale, x: width / 2 - (b.x + b.width / 2) * scale, y: height / 2 - (b.y + b.height / 2) * scale } })
    this.select([id])
  }

  // ---------- editing ----------
  add(obj: NewObj, selectIt = false): BoardObj | null {
    if (this.readOnly) return null
    const o = this.board.add(obj)
    if (selectIt) {
      this.ui.setTool('select')
      this.select([o.id])
    }
    return o
  }

  addMany(objs: NewObj[], selectThem = true): BoardObj[] {
    if (this.readOnly || !objs.length) return []
    const created = this.board.addMany(objs)
    if (selectThem) {
      this.ui.setTool('select')
      this.ui.select(created.map((o) => o.id))
    }
    return created
  }

  deleteSelection(): void {
    if (this.readOnly) return
    const ids = this.selected()
      .filter((o) => !o.locked)
      .map((o) => o.id)
    if (!ids.length) return
    this.board.remove(ids)
    this.ui.select([])
  }

  selectAll(): void {
    this.ui.setTool('select')
    this.ui.select(this.board.list().map((o) => o.id))
  }

  async copy(): Promise<void> {
    const sel = this.selected()
    if (!sel.length) return
    await clip.copyObjects(sel)
    this.notify(`Copied ${sel.length} item${sel.length > 1 ? 's' : ''}`)
  }

  async cut(): Promise<void> {
    if (this.readOnly) return
    await this.copy()
    this.deleteSelection()
  }

  duplicate(): void {
    const sel = this.selected()
    if (!sel.length || this.readOnly) return
    const b = boundsOf(sel)!
    this.addMany(clip.prepareForPaste(sel, b.x + b.width / 2 + 30, b.y + b.height / 2 + 30))
  }

  pasteObjects(objs: BoardObj[], at = this.pastePoint()): void {
    if (!objs.length || this.readOnly) return
    this.addMany(clip.prepareForPaste(objs, at.x, at.y))
  }

  /** Handle a real `paste` DOM event (Ctrl+V): images, files, our objects, URLs and text. */
  async handlePasteEvent(e: ClipboardEvent): Promise<void> {
    if (this.readOnly) return
    const dt = e.clipboardData
    if (!dt) return
    const at = this.pastePoint()
    const files = Array.from(dt.files)
    if (files.length) {
      e.preventDefault()
      await this.insertFiles(files, at)
      return
    }
    const text = dt.getData('text/plain')
    const ours = clip.parse(text)
    if (ours) {
      e.preventDefault()
      this.pasteObjects(ours, at)
      return
    }
    const html = dt.getData('text/html')
    const imgMatch = html && html.match(/<img[^>]+src="(data:image\/[^"]+|https?:[^"]+)"/i)
    if (imgMatch && !text.trim()) {
      e.preventDefault()
      await this.insertImageSrc(imgMatch[1], at)
      return
    }
    if (text.trim()) {
      e.preventDefault()
      this.insertText(text, at)
    }
  }

  /** Paste from context menu / toolbar (no DOM paste event available). */
  async pasteFromClipboard(at = this.pastePoint()): Promise<void> {
    if (this.readOnly) return
    try {
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'))
          if (imgType) {
            const blob = await item.getType(imgType)
            await this.insertImageSrc(await clip.readFileAsDataUrl(blob), at)
            return
          }
        }
      }
    } catch {
      /* fall through */
    }
    try {
      const text = await navigator.clipboard.readText()
      const ours = clip.parse(text)
      if (ours) return this.pasteObjects(ours, at)
      if (text.trim()) return this.insertText(text, at)
    } catch {
      /* fall through */
    }
    const mem = clip.memoryObjects()
    if (mem.length) this.pasteObjects(mem, at)
  }

  insertText(text: string, at = this.pastePoint()): void {
    const t = text.trim()
    if (clip.isUrl(t)) {
      this.insertLink(t, t.replace(/^https?:\/\//, '').split('/')[0], at)
      return
    }
    const width = Math.min(600, Math.max(160, Math.max(...t.split('\n').map((l) => l.length)) * 12))
    this.add(
      {
        type: 'text',
        x: at.x - width / 2,
        y: at.y - 20,
        rotation: 0,
        text: t,
        width,
        fontSize: 22,
        color: this.ui.textColor
      },
      true
    )
  }

  async insertImageSrc(src: string, at = this.pastePoint(), maxW = 600): Promise<BoardObj | null> {
    const img = src.startsWith('data:') ? await clip.normalizeImage(src) : { src, ...(await clip.imageSize(src)) }
    const s = Math.min(1, maxW / img.width)
    const width = img.width * s
    const height = img.height * s
    return this.add({ type: 'image', x: at.x - width / 2, y: at.y - height / 2, rotation: 0, src: img.src, width, height }, true)
  }

  async insertFiles(files: File[], at = this.pastePoint()): Promise<void> {
    let offset = 0
    for (const f of files) {
      const pos = { x: at.x + offset, y: at.y + offset }
      if (f.type.startsWith('image/')) {
        await this.insertImageSrc(await clip.readFileAsDataUrl(f), pos)
      } else if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        await this.insertPdf(f, pos)
      } else if (f.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(f.name)) {
        this.insertText(await f.text(), pos)
      } else {
        this.notify(`Can't insert "${f.name}" — supported: images, PDF, text`, 'error')
      }
      offset += 40
    }
  }

  async insertPdf(file: Blob, at = this.pastePoint()): Promise<void> {
    this.notify('Importing PDF…')
    try {
      const { pdfToImages } = await import('./pdfImport')
      const pages = await pdfToImages(await file.arrayBuffer())
      let y = at.y
      const objs: NewObj[] = pages.map((p) => {
        const o: NewObj = { type: 'image', x: at.x - p.width / 2, y, rotation: 0, src: p.src, width: p.width, height: p.height, border: true }
        y += p.height + 30
        return o
      })
      this.addMany(objs)
      this.notify(`Inserted ${pages.length} PDF page${pages.length > 1 ? 's' : ''}`)
    } catch (e) {
      this.notify('Could not import PDF: ' + (e as Error).message, 'error')
    }
  }

  insertLink(url: string, title: string, at = this.pastePoint()): void {
    const u = /^https?:\/\//i.test(url) ? url : 'https://' + url
    this.add({ type: 'link', x: at.x - 170, y: at.y - 40, rotation: 0, url: u, title: title || u, width: 340, height: 76 }, true)
  }

  insertTemplate(t: Template): void {
    const c = this.viewCenter()
    const objs = t.build(c.x, c.y)
    const created = this.addMany(objs)
    const b = boundsOf(created)
    if (b) this.fitBounds(b, 1)
  }

  // ---------- arrange ----------
  bringToFront(): void {
    this.board.bringToFront(this.ui.selection)
  }
  sendToBack(): void {
    this.board.sendToBack(this.ui.selection)
  }
  bringForward(): void {
    this.board.step(this.ui.selection, 1)
  }
  sendBackward(): void {
    this.board.step(this.ui.selection, -1)
  }

  group(): void {
    const sel = this.selected()
    if (sel.length < 2) return
    const g = uid()
    this.board.updateMany(sel.map((o) => ({ id: o.id, patch: { groupId: g } })))
    this.notify('Grouped')
  }

  ungroup(): void {
    this.board.updateMany(this.selected().map((o) => ({ id: o.id, patch: { groupId: undefined } })))
    this.notify('Ungrouped')
  }

  toggleLock(): void {
    const sel = this.selected()
    if (!sel.length) return
    const lock = !sel.every((o) => o.locked)
    this.board.updateMany(sel.map((o) => ({ id: o.id, patch: { locked: lock } })))
    this.notify(lock ? 'Locked' : 'Unlocked')
  }

  nudge(dx: number, dy: number): void {
    const sel = this.selected().filter((o) => !o.locked)
    this.board.updateMany(sel.map((o) => ({ id: o.id, patch: { x: o.x + dx, y: o.y + dy } })))
  }

  align(mode: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'): void {
    const sel = this.selected().filter((o) => !o.locked)
    if (sel.length < 2) return
    const all = boundsOf(sel)!
    this.board.updateMany(
      sel.map((o) => {
        const b = objBounds(o)
        let dx = 0
        let dy = 0
        if (mode === 'left') dx = all.x - b.x
        if (mode === 'right') dx = all.x + all.width - (b.x + b.width)
        if (mode === 'centerX') dx = all.x + all.width / 2 - (b.x + b.width / 2)
        if (mode === 'top') dy = all.y - b.y
        if (mode === 'bottom') dy = all.y + all.height - (b.y + b.height)
        if (mode === 'centerY') dy = all.y + all.height / 2 - (b.y + b.height / 2)
        return { id: o.id, patch: { x: o.x + dx, y: o.y + dy } }
      })
    )
  }

  distribute(axis: 'h' | 'v'): void {
    const sel = this.selected().filter((o) => !o.locked)
    if (sel.length < 3) return
    const items = sel.map((o) => ({ o, b: objBounds(o) })).sort((a, b) => (axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y))
    const first = items[0].b
    const last = items[items.length - 1].b
    const totalSize = items.reduce((s, i) => s + (axis === 'h' ? i.b.width : i.b.height), 0)
    const span = axis === 'h' ? last.x + last.width - first.x : last.y + last.height - first.y
    const gap = (span - totalSize) / (items.length - 1)
    let pos = axis === 'h' ? first.x : first.y
    this.board.updateMany(
      items.map(({ o, b }) => {
        const d = pos - (axis === 'h' ? b.x : b.y)
        pos += (axis === 'h' ? b.width : b.height) + gap
        return { id: o.id, patch: axis === 'h' ? { x: o.x + d } : { y: o.y + d } }
      })
    )
  }

  /** Arrange selected sticky notes (or all selected items) into a tidy grid. */
  arrangeGrid(): void {
    const sel = this.selected().filter((o) => !o.locked)
    if (sel.length < 2) return
    const all = boundsOf(sel)!
    const cols = Math.ceil(Math.sqrt(sel.length))
    const cell = Math.max(...sel.map((o) => Math.max(objBounds(o).width, objBounds(o).height))) + 20
    const ordered = sel.slice().sort((a, b) => a.y - b.y || a.x - b.x)
    const g = uid()
    this.board.updateMany(
      ordered.map((o, i) => ({
        id: o.id,
        patch: { x: all.x + (i % cols) * cell, y: all.y + Math.floor(i / cols) * cell, rotation: 0, groupId: g }
      }))
    )
    this.notify('Arranged as grid')
  }

  // ---------- export ----------
  private exportTargets(selectionOnly: boolean): BoardObj[] {
    const sel = this.selected()
    return selectionOnly && sel.length ? sel : this.board.list()
  }

  renderToPng(objs: BoardObj[], quality = 2): { url: string; w: number; h: number } | null {
    if (!this.stage || !this.layer) return null
    const area = exportArea(objs)
    if (!area) return null
    // hide unselected objects when exporting a selection
    const ids = new Set(objs.map((o) => o.id))
    const hidden: Konva.Node[] = []
    this.layer.find('.obj').forEach((n) => {
      if (!ids.has(n.id()) && n.visible()) {
        n.visible(false)
        hidden.push(n)
      }
    })
    const url = renderPng(this.stage, this.layer, area, this.bgColor, quality)
    hidden.forEach((n) => n.visible(true))
    return { url, w: area.width, h: area.height }
  }

  private fileBase(): string {
    return (this.board.settings().name || 'board').replace(/[\\/:*?"<>|]/g, '_')
  }

  async exportPng(selectionOnly = false): Promise<void> {
    const r = this.renderToPng(this.exportTargets(selectionOnly))
    if (!r) return this.notify('Nothing to export', 'error')
    await saveFile(this.fileBase() + '.png', 'png', 'PNG image', r.url.split(',')[1], 'image/png')
  }

  async exportSvg(selectionOnly = false): Promise<void> {
    const svg = toSvg(this.exportTargets(selectionOnly), this.bgColor)
    if (!svg) return this.notify('Nothing to export', 'error')
    await saveFile(this.fileBase() + '.svg', 'svg', 'SVG image', utf8ToBase64(svg), 'image/svg+xml')
  }

  async exportPdf(selectionOnly = false): Promise<void> {
    const r = this.renderToPng(this.exportTargets(selectionOnly))
    if (!r) return this.notify('Nothing to export', 'error')
    await saveFile(this.fileBase() + '.pdf', 'pdf', 'PDF document', pngToPdfBase64(r.url, r.w, r.h), 'application/pdf')
  }

  async copyAsImage(): Promise<void> {
    const r = this.renderToPng(this.exportTargets(true))
    if (!r) return
    try {
      await writeImageToClipboard(r.url)
      this.notify('Copied as image')
    } catch {
      this.notify('Could not copy image', 'error')
    }
  }

  thumbnail(): string | undefined {
    const objs = this.board.list()
    if (!objs.length || !this.stage) return undefined
    const area = exportArea(objs)!
    const q = Math.min(1, 360 / area.width, 240 / area.height)
    const r = this.renderToPng(objs, q)
    if (!r) return undefined
    // shrink to jpeg to keep library small
    return r.url
  }
}
