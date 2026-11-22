import type Konva from 'konva'
import { jsPDF } from 'jspdf'
import type { BoardObj, Bounds } from '../types'
import { boundsOf } from './geometry'
import { polygonPoints, isLineKind } from './shapes'

const PAD = 40

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)
}

/**
 * Render the given world bounds of the content layer into a PNG data URL.
 * `layer` is the objects layer, `bg` the resolved background color.
 */
export function renderPng(stage: Konva.Stage, layer: Konva.Layer, area: Bounds, bg: string, quality = 2): string {
  const scale = stage.scaleX()
  const pos = stage.position()
  const x = area.x * scale + pos.x
  const y = area.y * scale + pos.y
  const pixelRatio = quality / scale
  const maxSide = 12000
  const ratio = Math.min(pixelRatio, maxSide / (area.width * scale), maxSide / (area.height * scale))
  const tr = layer.findOne('Transformer')
  const trVisible = tr?.visible()
  tr?.visible(false)
  const canvas = layer.toCanvas({ x, y, width: area.width * scale, height: area.height * scale, pixelRatio: ratio })
  tr?.visible(trVisible ?? true)
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, 0, 0)
  return out.toDataURL('image/png')
}

export function exportArea(objs: BoardObj[]): Bounds | null {
  const b = boundsOf(objs)
  if (!b) return null
  return { x: b.x - PAD, y: b.y - PAD, width: b.width + PAD * 2, height: b.height + PAD * 2 }
}

export function pngToPdfBase64(dataUrl: string, w: number, h: number): string {
  const orientation = w >= h ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ orientation, unit: 'px', format: [w, h], hotfixes: ['px_scaling'] })
  pdf.addImage(dataUrl, 'PNG', 0, 0, w, h)
  return pdf.output('datauristring').split(',')[1]
}

function strokePath(points: number[]): string {
  if (points.length < 4) return `M${points[0]} ${points[1]} l0.1 0`
  let d = `M${points[0].toFixed(1)} ${points[1].toFixed(1)}`
  for (let i = 2; i < points.length; i += 2) d += ` L${points[i].toFixed(1)} ${points[i + 1].toFixed(1)}`
  return d
}

function textLines(text: string, x: number, y: number, size: number, anchor: string, color: string, extra = ''): string {
  return text
    .split('\n')
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + size * (i + 1) * 1.2}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-family="Segoe UI, Arial, sans-serif" ${extra}>${escapeXml(line)}</text>`
    )
    .join('')
}

function objToSvg(o: BoardObj): string {
  const t = `translate(${o.x} ${o.y}) rotate(${o.rotation || 0})`
  const op = o.opacity !== undefined ? ` opacity="${o.opacity}"` : ''
  switch (o.type) {
    case 'stroke':
      return `<path transform="${t}" d="${strokePath(o.points)}" fill="none" stroke="${o.color}" stroke-width="${o.width}" stroke-linecap="round" stroke-linejoin="round"${o.tool === 'highlighter' ? ' opacity="0.45"' : op}/>`
    case 'shape': {
      const fill = o.fill === 'transparent' ? 'none' : o.fill
      const dash = o.dash ? ` stroke-dasharray="${o.strokeWidth * 3} ${o.strokeWidth * 2}"` : ''
      const common = `fill="${fill}" stroke="${o.stroke}" stroke-width="${o.strokeWidth}"${dash}`
      let body = ''
      if (isLineKind(o.kind)) {
        const markers = o.kind === 'arrow' ? ' marker-end="url(#ah)"' : o.kind === 'doubleArrow' ? ' marker-end="url(#ah)" marker-start="url(#ahs)"' : ''
        body = `<line x1="0" y1="0" x2="${o.width}" y2="${o.height}" stroke="${o.stroke}" stroke-width="${o.strokeWidth}"${dash}${markers} color="${o.stroke}"/>`
      } else if (o.kind === 'ellipse') {
        body = `<ellipse cx="${o.width / 2}" cy="${o.height / 2}" rx="${Math.abs(o.width / 2)}" ry="${Math.abs(o.height / 2)}" ${common}/>`
      } else if (o.kind === 'rect' || o.kind === 'roundRect') {
        body = `<rect width="${o.width}" height="${o.height}" rx="${o.kind === 'roundRect' ? 18 : 0}" ${common}/>`
      } else {
        const p = polygonPoints(o.kind, o.width, o.height) ?? []
        body = `<polygon points="${p.join(' ')}" ${common}/>`
      }
      if (o.text) {
        const fs = o.fontSize ?? 20
        const lines = o.text.split('\n').length
        body += textLines(o.text, o.width / 2, o.height / 2 - (lines * fs * 1.2) / 2 - fs * 0.25, fs, 'middle', o.textColor ?? '#1f1f1f')
      }
      return `<g transform="${t}"${op}>${body}</g>`
    }
    case 'text': {
      const anchor = o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start'
      const ax = o.align === 'center' ? o.width / 2 : o.align === 'right' ? o.width : 0
      const extra = `${o.bold ? 'font-weight="bold"' : ''} ${o.italic ? 'font-style="italic"' : ''} ${o.underline ? 'text-decoration="underline"' : ''}`
      return `<g transform="${t}"${op}>${textLines(o.text, ax, 0, o.fontSize, anchor, o.color, extra)}</g>`
    }
    case 'note':
      return `<g transform="${t}"${op}><rect width="${o.width}" height="${o.height}" fill="${o.color}" rx="4"/>${textLines(o.text, o.width / 2, 12, 20, 'middle', o.textColor ?? '#1f1f1f')}</g>`
    case 'image':
      return `<g transform="${t}"${op}><image href="${o.src}" width="${o.width}" height="${o.height}" preserveAspectRatio="none"/></g>`
    case 'link':
      return `<g transform="${t}"${op}><rect width="${o.width}" height="${o.height}" rx="10" fill="#ffffff" stroke="#c5cae9"/>${textLines(o.title, 16, 8, 18, 'start', '#1f1f1f', 'font-weight="bold"')}${textLines(o.url, 16, 40, 13, 'start', '#3949ab')}</g>`
    case 'reaction':
      return `<g transform="${t}"${op}><text x="0" y="${o.size * 0.85}" font-size="${o.size}">${o.emoji}</text></g>`
  }
}

export function toSvg(objs: BoardObj[], bg: string): string | null {
  const area = exportArea(objs)
  if (!area) return null
  const body = objs
    .slice()
    .sort((a, b) => a.z - b.z)
    .map(objToSvg)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${area.x} ${area.y} ${area.width} ${area.height}" width="${area.width}" height="${area.height}">
<defs>
<marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/></marker>
<marker id="ahs" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/></marker>
</defs>
<rect x="${area.x}" y="${area.y}" width="${area.width}" height="${area.height}" fill="${bg}"/>
${body}
</svg>`
}

export function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
