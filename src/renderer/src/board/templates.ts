import type { NewObj, ShapeKind } from '../types'

export interface Template {
  id: string
  name: string
  category: 'Brainstorming' | 'Planning' | 'Analysis' | 'Education' | 'Meetings'
  description: string
  icon: string
  build: (ox: number, oy: number) => NewObj[]
}

const shape = (
  x: number,
  y: number,
  width: number,
  height: number,
  kind: ShapeKind = 'rect',
  fill = 'transparent',
  stroke = '#5c6bc0',
  extra: Partial<NewObj> = {}
): NewObj =>
  ({
    type: 'shape',
    kind,
    x,
    y,
    width,
    height,
    rotation: 0,
    fill,
    stroke,
    strokeWidth: 3,
    ...extra
  }) as NewObj

const label = (x: number, y: number, text: string, width = 300, fontSize = 28, color = '#1f1f1f', bold = true): NewObj => ({
  type: 'text',
  x,
  y,
  rotation: 0,
  text,
  width,
  fontSize,
  color,
  bold,
  align: 'center'
})

const note = (x: number, y: number, text: string, color = '#fff59d', w = 180, h = 180): NewObj => ({
  type: 'note',
  x,
  y,
  rotation: 0,
  text,
  width: w,
  height: h,
  color
})

const arrow = (x1: number, y1: number, x2: number, y2: number, color = '#5c6bc0'): NewObj =>
  ({
    type: 'shape',
    kind: 'arrow',
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    rotation: 0,
    fill: 'transparent',
    stroke: color,
    strokeWidth: 3
  }) as NewObj

function columns(ox: number, oy: number, titles: string[], colors: string[], noteText: string[][]): NewObj[] {
  const out: NewObj[] = []
  const w = 380
  const h = 820
  const gap = 30
  const total = titles.length * w + (titles.length - 1) * gap
  const sx = ox - total / 2
  const sy = oy - h / 2
  titles.forEach((t, i) => {
    const x = sx + i * (w + gap)
    out.push(shape(x, sy, w, h, 'roundRect', colors[i] + '22', colors[i]))
    out.push(label(x, sy + 20, t, w, 30, colors[i]))
    ;(noteText[i] ?? []).forEach((n, j) => out.push(note(x + 30 + (j % 2) * 170, sy + 90 + Math.floor(j / 2) * 170, n, '#fff59d', 150, 150)))
  })
  return out
}

export const TEMPLATES: Template[] = [
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    category: 'Brainstorming',
    description: 'Central topic with idea notes around it',
    icon: '💡',
    build: (ox, oy) => {
      const out: NewObj[] = [
        shape(ox - 160, oy - 90, 320, 180, 'ellipse', '#e8eaf6', '#3949ab', { text: 'Main topic', fontSize: 30 } as Partial<NewObj>)
      ]
      const colors = ['#fff59d', '#ffcc80', '#f8bbd0', '#c5e1a5', '#b3e5fc', '#d1c4e9', '#fff59d', '#ffcc80']
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const nx = ox + Math.cos(a) * 420 - 90
        const ny = oy + Math.sin(a) * 320 - 90
        out.push(arrow(ox + Math.cos(a) * 170, oy + Math.sin(a) * 100, ox + Math.cos(a) * 320, oy + Math.sin(a) * 230, '#9fa8da'))
        out.push(note(nx, ny, `Idea ${i + 1}`, colors[i]))
      }
      return out
    }
  },
  {
    id: 'mindmap',
    name: 'Mind map',
    category: 'Brainstorming',
    description: 'Topic with branches and sub-branches',
    icon: '🧠',
    build: (ox, oy) => {
      const out: NewObj[] = [
        shape(ox - 130, oy - 60, 260, 120, 'roundRect', '#3949ab', '#3949ab', {
          text: 'Central idea',
          fontSize: 28,
          textColor: '#ffffff'
        } as Partial<NewObj>)
      ]
      const branches = ['Goals', 'Ideas', 'Resources', 'Risks']
      const cols = ['#e53935', '#43a047', '#fb8c00', '#8e24aa']
      branches.forEach((b, i) => {
        const left = i % 2 === 0
        const by = oy + (i < 2 ? -220 : 160)
        const bx = left ? ox - 520 : ox + 300
        out.push(arrow(ox + (left ? -130 : 130), oy, bx + (left ? 220 : 0), by + 40, cols[i]))
        out.push(shape(bx, by, 220, 80, 'roundRect', cols[i] + '22', cols[i], { text: b, fontSize: 24 } as Partial<NewObj>))
        for (let k = 0; k < 2; k++) {
          const sx = left ? bx - 220 : bx + 280
          const sy = by - 50 + k * 120
          out.push(arrow(left ? bx : bx + 220, by + 40, left ? sx + 170 : sx, sy + 30, cols[i]))
          out.push(shape(sx, sy, 170, 60, 'roundRect', '#ffffff', cols[i], { text: 'Sub-topic', fontSize: 18 } as Partial<NewObj>))
        }
      })
      return out
    }
  },
  {
    id: 'swot',
    name: 'SWOT analysis',
    category: 'Analysis',
    description: 'Strengths, weaknesses, opportunities, threats',
    icon: '📊',
    build: (ox, oy) => {
      const s = 420
      const items: [string, string, number, number][] = [
        ['Strengths', '#43a047', -1, -1],
        ['Weaknesses', '#e53935', 0, -1],
        ['Opportunities', '#1e88e5', -1, 0],
        ['Threats', '#fb8c00', 0, 0]
      ]
      const out: NewObj[] = [label(ox - 400, oy - s - 100, 'SWOT Analysis', 800, 40)]
      for (const [t, c, cx, cy] of items) {
        const x = ox + cx * s + (cx === 0 ? 10 : -10)
        const y = oy + cy * s + (cy === 0 ? 10 : -10)
        out.push(shape(x, y, s, s, 'roundRect', c + '1a', c))
        out.push(label(x, y + 16, t, s, 30, c))
        out.push(note(x + 30, y + 80, '', '#ffffff', 160, 140))
      }
      return out
    }
  },
  {
    id: 'kanban',
    name: 'Kanban board',
    category: 'Planning',
    description: 'To do, in progress and done columns',
    icon: '🗂️',
    build: (ox, oy) =>
      columns(ox, oy, ['To do', 'In progress', 'Done'], ['#1e88e5', '#fb8c00', '#43a047'], [
        ['Task 1', 'Task 2', 'Task 3'],
        ['Task 4'],
        ['Task 5']
      ])
  },
  {
    id: 'retro',
    name: 'Retrospective',
    category: 'Meetings',
    description: 'What went well, what to improve, actions',
    icon: '🔁',
    build: (ox, oy) =>
      columns(ox, oy, ['😀 Went well', '🤔 To improve', '🚀 Action items'], ['#43a047', '#e53935', '#3949ab'], [[''], [''], ['']])
  },
  {
    id: 'project',
    name: 'Project plan',
    category: 'Planning',
    description: 'Phases with milestones and owners',
    icon: '📅',
    build: (ox, oy) => {
      const phases = ['Discover', 'Define', 'Design', 'Build', 'Launch']
      const cols = ['#1e88e5', '#00acc1', '#43a047', '#fb8c00', '#e53935']
      const w = 260
      const sx = ox - (phases.length * w) / 2
      const out: NewObj[] = [label(sx, oy - 330, 'Project plan', phases.length * w, 40)]
      phases.forEach((p, i) => {
        out.push(shape(sx + i * w, oy - 250, w - 10, 70, i === phases.length - 1 ? 'rect' : 'rect', cols[i], cols[i], {
          text: p,
          fontSize: 24,
          textColor: '#ffffff'
        } as Partial<NewObj>))
        out.push(note(sx + i * w + 20, oy - 150, 'Milestone', '#fff59d', 210, 130))
        out.push(note(sx + i * w + 20, oy + 0, 'Owner:', '#b3e5fc', 210, 110))
        out.push(note(sx + i * w + 20, oy + 130, 'Due:', '#f8bbd0', 210, 110))
      })
      return out
    }
  },
  {
    id: 'weekly',
    name: 'Weekly planner',
    category: 'Planning',
    description: 'Seven day columns',
    icon: '🗓️',
    build: (ox, oy) => {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      const w = 220
      const sx = ox - (days.length * w) / 2
      const out: NewObj[] = []
      days.forEach((d, i) => {
        out.push(shape(sx + i * w, oy - 350, w - 10, 700, 'rect', i >= 5 ? '#fce4ec' : '#e3f2fd', '#90a4ae'))
        out.push(label(sx + i * w, oy - 335, d, w - 10, 28, '#37474f'))
      })
      return out
    }
  },
  {
    id: 'timeline',
    name: 'Timeline',
    category: 'Planning',
    description: 'Horizontal timeline with events',
    icon: '⏱️',
    build: (ox, oy) => {
      const out: NewObj[] = [arrow(ox - 700, oy, ox + 700, oy, '#37474f')]
      for (let i = 0; i < 6; i++) {
        const x = ox - 600 + i * 240
        out.push(shape(x - 14, oy - 14, 28, 28, 'ellipse', '#3949ab', '#3949ab'))
        out.push(note(x - 85, i % 2 ? oy + 50 : oy - 230, `Event ${i + 1}`, i % 2 ? '#b3e5fc' : '#fff59d', 170, 170))
      }
      return out
    }
  },
  {
    id: 'venn',
    name: 'Venn diagram',
    category: 'Analysis',
    description: 'Three overlapping sets',
    icon: '⭕',
    build: (ox, oy) => [
      shape(ox - 380, oy - 380, 460, 460, 'ellipse', '#e5393533', '#e53935', { text: 'A', fontSize: 40 } as Partial<NewObj>),
      shape(ox - 80, oy - 380, 460, 460, 'ellipse', '#1e88e533', '#1e88e5', { text: 'B', fontSize: 40 } as Partial<NewObj>),
      shape(ox - 230, oy - 120, 460, 460, 'ellipse', '#43a04733', '#43a047', { text: 'C', fontSize: 40 } as Partial<NewObj>)
    ]
  },
  {
    id: 'proscons',
    name: 'Pros and cons',
    category: 'Analysis',
    description: 'Compare two sides of a decision',
    icon: '⚖️',
    build: (ox, oy) => columns(ox, oy, ['👍 Pros', '👎 Cons'], ['#43a047', '#e53935'], [[''], ['']])
  },
  {
    id: 'fishbone',
    name: 'Fishbone (cause & effect)',
    category: 'Analysis',
    description: 'Find the root causes of a problem',
    icon: '🐟',
    build: (ox, oy) => {
      const out: NewObj[] = [
        arrow(ox - 650, oy, ox + 400, oy, '#37474f'),
        shape(ox + 410, oy - 70, 260, 140, 'roundRect', '#ffebee', '#e53935', { text: 'Problem', fontSize: 28 } as Partial<NewObj>)
      ]
      const cats = ['People', 'Process', 'Tools', 'Materials', 'Environment', 'Measurement']
      cats.forEach((c, i) => {
        const x = ox - 520 + (i % 3) * 320
        const top = i < 3
        const y = top ? oy - 260 : oy + 260
        out.push(arrow(x, y, x + 150, oy, '#78909c'))
        out.push(label(x - 100, top ? y - 50 : y + 10, c, 200, 24, '#37474f'))
      })
      return out
    }
  },
  {
    id: 'lesson',
    name: 'Lesson plan',
    category: 'Education',
    description: 'Objectives, activities and assessment',
    icon: '🎓',
    build: (ox, oy) =>
      columns(ox, oy, ['🎯 Objectives', '🧩 Activities', '📝 Assessment', '📚 Resources'], ['#3949ab', '#00897b', '#f4511e', '#6d4c41'], [
        [''],
        [''],
        [''],
        ['']
      ])
  },
  {
    id: 'meeting',
    name: 'Meeting notes',
    category: 'Meetings',
    description: 'Agenda, notes, decisions and follow-ups',
    icon: '📝',
    build: (ox, oy) => [
      label(ox - 500, oy - 420, 'Meeting — ' + new Date().toLocaleDateString(), 1000, 40),
      shape(ox - 500, oy - 340, 480, 330, 'roundRect', '#e3f2fd', '#1e88e5'),
      label(ox - 500, oy - 325, 'Agenda', 480, 26, '#1e88e5'),
      shape(ox + 20, oy - 340, 480, 330, 'roundRect', '#f1f8e9', '#43a047'),
      label(ox + 20, oy - 325, 'Notes', 480, 26, '#43a047'),
      shape(ox - 500, oy + 20, 480, 330, 'roundRect', '#fff3e0', '#fb8c00'),
      label(ox - 500, oy + 35, 'Decisions', 480, 26, '#fb8c00'),
      shape(ox + 20, oy + 20, 480, 330, 'roundRect', '#f3e5f5', '#8e24aa'),
      label(ox + 20, oy + 35, 'Follow-ups', 480, 26, '#8e24aa')
    ]
  },
  {
    id: 'flowchart',
    name: 'Flowchart',
    category: 'Planning',
    description: 'Start, steps, decision and end',
    icon: '🔀',
    build: (ox, oy) => [
      shape(ox - 110, oy - 420, 220, 80, 'ellipse', '#c8e6c9', '#43a047', { text: 'Start', fontSize: 24 } as Partial<NewObj>),
      arrow(ox, oy - 340, ox, oy - 270),
      shape(ox - 130, oy - 270, 260, 90, 'rect', '#e3f2fd', '#1e88e5', { text: 'Step', fontSize: 24 } as Partial<NewObj>),
      arrow(ox, oy - 180, ox, oy - 110),
      shape(ox - 140, oy - 110, 280, 170, 'diamond', '#fff8e1', '#fb8c00', { text: 'Decision?', fontSize: 22 } as Partial<NewObj>),
      arrow(ox + 140, oy - 25, ox + 300, oy - 25),
      shape(ox + 300, oy - 70, 240, 90, 'rect', '#e3f2fd', '#1e88e5', { text: 'Yes path', fontSize: 22 } as Partial<NewObj>),
      arrow(ox, oy + 60, ox, oy + 140),
      shape(ox - 110, oy + 140, 220, 80, 'ellipse', '#ffcdd2', '#e53935', { text: 'End', fontSize: 24 } as Partial<NewObj>)
    ]
  }
]
