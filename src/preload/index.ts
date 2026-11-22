import { contextBridge, ipcRenderer } from 'electron'

const api = {
  isDesktop: true,
  listBoards: () => ipcRenderer.invoke('boards:list'),
  createBoard: (name: string) => ipcRenderer.invoke('boards:create', name),
  loadBoard: (id: string) => ipcRenderer.invoke('boards:load', id),
  saveBoard: (file: unknown) => ipcRenderer.invoke('boards:save', file),
  deleteBoard: (id: string) => ipcRenderer.invoke('boards:delete', id),
  renameBoard: (id: string, name: string) => ipcRenderer.invoke('boards:rename', id, name),
  duplicateBoard: (id: string) => ipcRenderer.invoke('boards:duplicate', id),
  openBoardFile: () => ipcRenderer.invoke('file:open'),
  saveBoardAs: (id: string, name: string) => ipcRenderer.invoke('file:saveBoardAs', id, name),
  saveBinary: (defaultName: string, ext: string, label: string, base64: string) =>
    ipcRenderer.invoke('file:saveBinary', defaultName, ext, label, base64),
  clipboardWriteImage: (dataUrl: string) => ipcRenderer.invoke('clipboard:writeImage', dataUrl),
  clipboardReadImage: () => ipcRenderer.invoke('clipboard:readImage'),
  startShare: (boardId: string) => ipcRenderer.invoke('share:start', boardId),
  stopShare: (boardId: string) => ipcRenderer.invoke('share:stop', boardId),
  shareStatus: (boardId: string) => ipcRenderer.invoke('share:status', boardId),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  version: () => ipcRenderer.invoke('app:version'),
  checkUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
  setTitle: (t: string) => ipcRenderer.invoke('app:setTitle', t),
  onOpenBoard: (cb: (id: string) => void) => {
    const h = (_e: unknown, id: string): void => cb(id)
    ipcRenderer.on('board:open', h)
    return () => ipcRenderer.removeListener('board:open', h)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type DesktopApi = typeof api
