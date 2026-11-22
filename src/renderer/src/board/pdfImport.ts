import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Render each page of a PDF into a PNG data URL. */
export async function pdfToImages(
  data: ArrayBuffer,
  maxPages = 50
): Promise<{ src: string; width: number; height: number }[]> {
  const doc = await pdfjs.getDocument({ data }).promise
  const out: { src: string; width: number; height: number }[] = []
  const n = Math.min(doc.numPages, maxPages)
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 1.6 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    out.push({ src: canvas.toDataURL('image/jpeg', 0.88), width: viewport.width / 1.6, height: viewport.height / 1.6 })
  }
  return out
}
