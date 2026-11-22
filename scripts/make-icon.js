// Renders build/icon.svg to build/icon.png and a multi-size build/icon.ico using Electron.
// Usage: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const root = path.join(__dirname, '..')
  const svg = fs.readFileSync(path.join(root, 'build/icon.svg'), 'utf8')
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } })
  const html = `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="512" height="512" ')}</body></html>`
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 400))
  const img = (await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })).resize({ width: 512, height: 512 })
  fs.writeFileSync(path.join(root, 'build/icon.png'), img.toPNG())
  const sizes = [256, 128, 64, 48, 32, 16]
  const pngs = sizes.map((s) => img.resize({ width: s, height: s, quality: 'best' }).toPNG())
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  const dir = Buffer.alloc(16 * sizes.length)
  let offset = 6 + dir.length
  sizes.forEach((s, i) => {
    const e = i * 16
    dir.writeUInt8(s >= 256 ? 0 : s, e)
    dir.writeUInt8(s >= 256 ? 0 : s, e + 1)
    dir.writeUInt8(0, e + 2)
    dir.writeUInt8(0, e + 3)
    dir.writeUInt16LE(1, e + 4)
    dir.writeUInt16LE(32, e + 6)
    dir.writeUInt32LE(pngs[i].length, e + 8)
    dir.writeUInt32LE(offset, e + 12)
    offset += pngs[i].length
  })
  fs.writeFileSync(path.join(root, 'build/icon.ico'), Buffer.concat([header, dir, ...pngs]))
  console.log('icons written')
  app.quit()
})
