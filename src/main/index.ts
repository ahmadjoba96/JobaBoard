import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage, Menu } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import QRCode from 'qrcode'
import * as storage from './storage'
import * as share from './share-server'
import { setupUpdater, checkForUpdates } from './updater'

let mainWindow: BrowserWindow | null = null
let pendingOpenFile: string | null = null

const rendererDir = (): string => join(__dirname, '../renderer')

function fileArg(argv: string[]): string | null {
  return argv.find((a) => a.toLowerCase().endsWith('.jboard')) ?? null
}

async function openExternalBoardFile(path: string): Promise<void> {
  try {
    const meta = await storage.importBoardFile(path)
    mainWindow?.webContents.send('board:open', meta.id)
  } catch (e) {
    dialog.showErrorBox('JobaBoard', `Could not open file:\n${(e as Error).message}`)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 560,
    show: false,
    title: 'JobaBoard',
    backgroundColor: '#f5f6fa',
    icon: join(__dirname, '../../build/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      spellcheck: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (pendingOpenFile) {
      const f = pendingOpenFile
      pendingOpenFile = null
      setTimeout(() => openExternalBoardFile(f), 800)
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(rendererDir(), 'index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('boards:list', () => storage.listBoards())
  ipcMain.handle('boards:create', (_e, name: string) => storage.createBoard(name))
  ipcMain.handle('boards:load', (_e, id: string) => storage.loadBoard(id))
  ipcMain.handle('boards:save', (_e, file: storage.BoardFile) => storage.saveBoard(file))
  ipcMain.handle('boards:delete', (_e, id: string) => storage.deleteBoard(id))
  ipcMain.handle('boards:rename', (_e, id: string, name: string) => storage.renameBoard(id, name))
  ipcMain.handle('boards:duplicate', (_e, id: string) => storage.duplicateBoard(id))

  ipcMain.handle('file:open', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open board',
      filters: [{ name: 'JobaBoard', extensions: ['jboard'] }],
      properties: ['openFile']
    })
    if (r.canceled || !r.filePaths[0]) return null
    return storage.importBoardFile(r.filePaths[0])
  })

  ipcMain.handle('file:saveBoardAs', async (_e, id: string, name: string) => {
    const r = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save board as',
      defaultPath: `${name.replace(/[\\/:*?"<>|]/g, '_')}.jboard`,
      filters: [{ name: 'JobaBoard', extensions: ['jboard'] }]
    })
    if (r.canceled || !r.filePath) return false
    await storage.exportBoardFile(id, r.filePath)
    return true
  })

  ipcMain.handle(
    'file:saveBinary',
    async (_e, defaultName: string, ext: string, label: string, base64: string) => {
      const r = await dialog.showSaveDialog(mainWindow!, {
        title: `Export ${label}`,
        defaultPath: defaultName,
        filters: [{ name: label, extensions: [ext] }]
      })
      if (r.canceled || !r.filePath) return false
      await fs.writeFile(r.filePath, Buffer.from(base64, 'base64'))
      return true
    }
  )

  ipcMain.handle('clipboard:writeImage', (_e, dataUrl: string) => {
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl))
    return true
  })
  ipcMain.handle('clipboard:readImage', () => {
    const img = clipboard.readImage()
    return img.isEmpty() ? null : img.toDataURL()
  })

  ipcMain.handle('share:start', async (_e, boardId: string) => {
    const info = await share.startShare(boardId, rendererDir())
    const qrEdit = await QRCode.toDataURL(info.editUrl, { margin: 1, width: 220 })
    const qrView = await QRCode.toDataURL(info.viewUrl, { margin: 1, width: 220 })
    return { ...info, qrEdit, qrView }
  })
  ipcMain.handle('share:stop', (_e, boardId: string) => share.stopShare(boardId))
  ipcMain.handle('share:status', (_e, boardId: string) => share.isSharing(boardId))

  ipcMain.handle('app:openExternal', (_e, url: string) => {
    if (/^(https?|mailto):/.test(url)) shell.openExternal(url)
  })
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:checkUpdates', () => checkForUpdates(true))
  ipcMain.handle('app:setTitle', (_e, title: string) => mainWindow?.setTitle(title))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  pendingOpenFile = fileArg(process.argv)

  app.on('second-instance', (_e, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    const f = fileArg(argv)
    if (f) openExternalBoardFile(f)
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.jobaboard.app')
    Menu.setApplicationMenu(null)
    registerIpc()
    createWindow()
    setupUpdater(() => mainWindow)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    share.shutdown()
    if (process.platform !== 'darwin') app.quit()
  })
}
