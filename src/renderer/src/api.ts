export interface BoardMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  thumbnail?: string
}

export interface BoardFile {
  format: 'jboard'
  version: 1
  meta: BoardMeta
  update: string
}

export interface ShareResult {
  boardId: string
  port: number
  host: string
  editUrl: string
  viewUrl: string
  hostWsBase: string
  hostRoom: string
  hostParams: Record<string, string>
  qrEdit: string
  qrView: string
}

export interface DesktopApi {
  isDesktop: true
  listBoards(): Promise<BoardMeta[]>
  createBoard(name: string): Promise<BoardMeta>
  loadBoard(id: string): Promise<BoardFile | null>
  saveBoard(file: BoardFile): Promise<void>
  deleteBoard(id: string): Promise<void>
  renameBoard(id: string, name: string): Promise<void>
  duplicateBoard(id: string): Promise<BoardMeta | null>
  openBoardFile(): Promise<BoardMeta | null>
  saveBoardAs(id: string, name: string): Promise<boolean>
  saveBinary(defaultName: string, ext: string, label: string, base64: string): Promise<boolean>
  clipboardWriteImage(dataUrl: string): Promise<boolean>
  clipboardReadImage(): Promise<string | null>
  startShare(boardId: string): Promise<ShareResult>
  stopShare(boardId: string): Promise<void>
  shareStatus(boardId: string): Promise<boolean>
  openExternal(url: string): Promise<void>
  version(): Promise<string>
  checkUpdates(): Promise<void>
  setTitle(t: string): Promise<void>
  onOpenBoard(cb: (id: string) => void): () => void
}

declare global {
  interface Window {
    api?: DesktopApi
  }
}

export const desktop: DesktopApi | undefined = window.api

export const isDesktop = !!desktop

/** Save a binary file: native dialog on desktop, download in the browser. */
export async function saveFile(name: string, ext: string, label: string, base64: string, mime: string): Promise<void> {
  if (desktop) {
    await desktop.saveBinary(name, ext, label, base64)
    return
  }
  const a = document.createElement('a')
  a.href = `data:${mime};base64,${base64}`
  a.download = name
  a.click()
}

export async function writeImageToClipboard(dataUrl: string): Promise<void> {
  if (desktop) {
    await desktop.clipboardWriteImage(dataUrl)
    return
  }
  const blob = await (await fetch(dataUrl)).blob()
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
}

export function openUrl(url: string): void {
  if (desktop) desktop.openExternal(url)
  else window.open(url, '_blank', 'noopener')
}
