export type ObjType = 'stroke' | 'shape' | 'text' | 'note' | 'image' | 'link' | 'reaction'

export type ShapeKind =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'hexagon'
  | 'line'
  | 'arrow'
  | 'doubleArrow'

export interface BaseObj {
  id: string
  type: ObjType
  x: number
  y: number
  rotation: number
  z: number
  locked?: boolean
  groupId?: string
  opacity?: number
}

export interface StrokeObj extends BaseObj {
  type: 'stroke'
  /** flat [x0,y0,x1,y1,...] relative to x,y */
  points: number[]
  color: string
  width: number
  tool: 'pen' | 'highlighter' | 'pencil'
}

export interface ShapeObj extends BaseObj {
  type: 'shape'
  kind: ShapeKind
  width: number
  height: number
  stroke: string
  fill: string
  strokeWidth: number
  dash?: boolean
  /** text label inside shape */
  text?: string
  fontSize?: number
  textColor?: string
}

export interface TextObj extends BaseObj {
  type: 'text'
  text: string
  width: number
  fontSize: number
  color: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  align?: 'left' | 'center' | 'right'
  fontFamily?: string
  background?: string
}

export interface NoteObj extends BaseObj {
  type: 'note'
  text: string
  width: number
  height: number
  color: string
  textColor?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right'
  author?: string
}

export interface ImageObj extends BaseObj {
  type: 'image'
  src: string
  width: number
  height: number
  alt?: string
  border?: boolean
}

export interface LinkObj extends BaseObj {
  type: 'link'
  url: string
  title: string
  width: number
  height: number
}

export interface ReactionObj extends BaseObj {
  type: 'reaction'
  emoji: string
  size: number
}

export type BoardObj = StrokeObj | ShapeObj | TextObj | NoteObj | ImageObj | LinkObj | ReactionObj

/** Distributes Omit across the union so each member keeps its own fields. */
export type NewObj<T = BoardObj> = T extends BoardObj ? Omit<T, 'id' | 'z'> & { id?: string; z?: number } : never

export type BackgroundType = 'blank' | 'grid' | 'dots' | 'lines' | 'isometric'

export interface BoardSettings {
  name: string
  bgType: BackgroundType
  /** 'auto' follows the app theme */
  bgColor: string
}

export interface TimerState {
  running: boolean
  /** epoch ms when the timer ends (running) */
  endAt: number
  /** ms remaining when paused */
  remaining: number
  duration: number
}

export interface Viewport {
  x: number
  y: number
  scale: number
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface UserPresence {
  name: string
  color: string
  cursor?: { x: number; y: number } | null
  selection?: string[]
}
