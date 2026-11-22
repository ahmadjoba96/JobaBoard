import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

let getWin: () => BrowserWindow | null = () => null
let manual = false

export function setupUpdater(win: () => BrowserWindow | null): void {
  getWin = win
  if (!app.isPackaged) return
  autoUpdater.autoDownload = false
  autoUpdater.on('update-available', async (info) => {
    const w = getWin()
    const opts = {
      type: 'info' as const,
      buttons: ['Download', 'Later'],
      title: 'Update available',
      message: `JobaBoard ${info.version} is available. Download and install it now?`
    }
    const r = w ? await dialog.showMessageBox(w, opts) : await dialog.showMessageBox(opts)
    if (r.response === 0) autoUpdater.downloadUpdate()
  })
  autoUpdater.on('update-not-available', () => {
    if (manual) dialog.showMessageBox({ type: 'info', message: 'You have the latest version of JobaBoard.' })
    manual = false
  })
  autoUpdater.on('update-downloaded', async () => {
    const r = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      message: 'Update downloaded. Restart JobaBoard to install it?'
    })
    if (r.response === 0) autoUpdater.quitAndInstall()
  })
  autoUpdater.on('error', (e) => {
    if (manual) dialog.showMessageBox({ type: 'warning', message: `Update check failed: ${e.message}` })
    manual = false
  })
  setTimeout(() => checkForUpdates(false), 5000)
}

export async function checkForUpdates(isManual: boolean): Promise<void> {
  if (!app.isPackaged) {
    if (isManual) dialog.showMessageBox({ type: 'info', message: 'Updates are only available in the installed app.' })
    return
  }
  manual = isManual
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    /* handled by error event */
  }
}
