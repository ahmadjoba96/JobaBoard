import { create } from 'zustand'
import type { ShapeKind, Viewport } from '../types'

export type Tool =
  | 'select'
  | 'pan'
  | 'pen'
  | 'highlighter'
  | 'pencil'
  | 'eraser'
  | 'lasso'
  | 'shape'
  | 'text'
  | 'note'
  | 'reaction'
  | 'laser'

export type Panel = null | 'templates' | 'outline' | 'settings' | 'share' | 'help' | 'insert'

export const PEN_COLORS = [
  '#1f1f1f',
  '#e53935',
  '#fb8c00',
  '#fdd835',
  '#43a047',
  '#00acc1',
  '#1e88e5',
  '#8e24aa',
  '#d81b60',
  '#6d4c41',
  '#9e9e9e',
  '#ffffff'
]

export const HIGHLIGHTER_COLORS = ['#fff176', '#a5d6a7', '#81d4fa', '#f48fb1', '#ffcc80', '#ce93d8']

export const NOTE_COLORS = ['#fff59d', '#ffcc80', '#f8bbd0', '#c5e1a5', '#b3e5fc', '#d1c4e9', '#ffffff', '#e0e0e0']

export const REACTIONS = ['👍', '❤️', '😂', '🎉', '💡', '⭐', '✅', '❌', '❓', '🔥', '👀', '🚀', '👏', '😮', '😢', '💯']

interface UIState {
  tool: Tool
  penColor: string
  penWidth: number
  pencilColor: string
  pencilWidth: number
  highlighterColor: string
  highlighterWidth: number
  eraserMode: 'stroke' | 'point'
  eraserSize: number
  inkToShape: boolean
  shapeKind: ShapeKind
  shapeStroke: string
  shapeFill: string
  shapeStrokeWidth: number
  noteColor: string
  textColor: string
  textSize: number
  reaction: string
  selection: string[]
  viewport: Viewport
  panel: Panel
  ruler: { visible: boolean; x: number; y: number; angle: number; length: number }
  snapToGrid: boolean
  showMinimap: boolean
  editingId: string | null
  dark: boolean
  readOnly: boolean
  userName: string
  set: (p: Partial<UIState>) => void
  setTool: (t: Tool) => void
  select: (ids: string[]) => void
}

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('jb:' + key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem('jb:' + key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

const PERSISTED = [
  'penColor',
  'penWidth',
  'pencilColor',
  'pencilWidth',
  'highlighterColor',
  'highlighterWidth',
  'eraserMode',
  'eraserSize',
  'inkToShape',
  'shapeKind',
  'shapeStroke',
  'shapeFill',
  'shapeStrokeWidth',
  'noteColor',
  'textColor',
  'textSize',
  'snapToGrid',
  'showMinimap',
  'dark',
  'userName'
] as const

const systemDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches

export const useUI = create<UIState>((set) => ({
  tool: 'pen',
  penColor: loadPref('penColor', '#1f1f1f'),
  penWidth: loadPref('penWidth', 3),
  pencilColor: loadPref('pencilColor', '#555555'),
  pencilWidth: loadPref('pencilWidth', 2),
  highlighterColor: loadPref('highlighterColor', '#fff176'),
  highlighterWidth: loadPref('highlighterWidth', 18),
  eraserMode: loadPref('eraserMode', 'stroke'),
  eraserSize: loadPref('eraserSize', 14),
  inkToShape: loadPref('inkToShape', false),
  shapeKind: loadPref('shapeKind', 'rect'),
  shapeStroke: loadPref('shapeStroke', '#1f1f1f'),
  shapeFill: loadPref('shapeFill', 'transparent'),
  shapeStrokeWidth: loadPref('shapeStrokeWidth', 3),
  noteColor: loadPref('noteColor', '#fff59d'),
  textColor: loadPref('textColor', '#1f1f1f'),
  textSize: loadPref('textSize', 24),
  reaction: '👍',
  selection: [],
  viewport: { x: 0, y: 0, scale: 1 },
  panel: null,
  ruler: { visible: false, x: 200, y: 300, angle: 0, length: 900 },
  snapToGrid: loadPref('snapToGrid', false),
  showMinimap: loadPref('showMinimap', true),
  editingId: null,
  dark: loadPref('dark', !!systemDark),
  readOnly: false,
  userName: loadPref('userName', ''),
  set: (p) => {
    for (const k of PERSISTED) if (k in p) savePref(k, (p as Record<string, unknown>)[k])
    set(p)
  },
  setTool: (tool) => set({ tool, editingId: null, ...(tool !== 'select' ? { selection: [] } : {}) }),
  select: (selection) => set({ selection })
}))
