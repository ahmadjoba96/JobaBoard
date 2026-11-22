# JobaBoard

**A free, infinite digital whiteboard for Windows** for brainstorming, planning, teaching and visual teamwork. It works offline on your PC, and you can share a board live with people on your network, who join from any web browser.

> JobaBoard is an independent open-source project. It is not affiliated with or endorsed by Microsoft.

## Download

1. Go to [**Releases**](../../releases/latest).
2. Download **`JobaBoard-Setup-1.0.0.exe`** (installer) or **`JobaBoard-Portable-1.0.0.exe`** (runs without installing).
3. Run it. Windows SmartScreen may warn because the app isn't code-signed. Click **More info → Run anyway**.

The installer adds Start-menu and desktop shortcuts and opens `.jboard` files with JobaBoard. Installed copies check GitHub for updates automatically.

## Features

### Infinite canvas
- Pan with the hand tool, by holding <kbd>Space</kbd>, with the middle mouse button, by scrolling or with a two-finger swipe.
- Zoom with <kbd>Ctrl</kbd> + wheel, a pinch, the zoom buttons, zoom-to-fit or 100% reset.
- Backgrounds: blank, dots, grid, lines or isometric, with any background color. "Auto" follows light or dark mode.
- A minimap for quick navigation, optional snap-to-grid, and dark mode. Dark ink is shown light on dark boards, like chalk.

### Inking
- Pen, pencil and highlighter, each with a color palette, a custom color picker and adjustable thickness.
- Pressure-aware ink on pen and tablet devices.
- Stroke eraser and point eraser, which cuts strokes apart.
- Lasso select.
- **Ink to shape**: rough circles, rectangles, triangles, diamonds and lines turn into clean shapes.
- **Ruler**: drag it into place, scroll over it to rotate, and draw straight lines along its edge.
- **Laser pointer**: a temporary trail that collaborators see too.

### Content
- **Sticky notes** in 8 colors, with text that shrinks to fit, author names, and *Arrange as note grid*.
- **Text** with bold, italic, underline, strikethrough, alignment, size, font, color and highlight.
- **Shapes**: rectangle, rounded rectangle, ellipse, triangle, diamond, star, hexagon, line, arrow and double arrow. Each has outline and fill colors, line width, a dashed option and a text label.
- **Images** from a file, by drag-and-drop, or pasted with <kbd>Ctrl</kbd>+<kbd>V</kbd> from screenshots, browsers or other apps.
- **PDF documents**: each page is inserted as an image.
- **Link cards**. Double-click one to open it.
- **Reactions**: emoji stamps.
- **14 templates**: Brainstorm, Mind map, SWOT, Kanban, Retrospective, Project plan, Weekly planner, Timeline, Venn diagram, Pros & cons, Fishbone, Lesson plan, Meeting notes and Flowchart.

### Editing
- Select, multi-select (<kbd>Shift</kbd>-click or drag a box), move, resize and rotate. Rotation snaps to 45° steps.
- <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>X</kbd>/<kbd>V</kbd>/<kbd>D</kbd>/<kbd>A</kbd>, <kbd>Delete</kbd>, unlimited undo and redo (<kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd>), and arrow-key nudging.
- Paste works across boards, and between JobaBoard and other apps (images and text).
- Group and ungroup, lock and unlock, bring forward / send backward, align and distribute.
- Right-click context menu, format pane, and *Copy as image*.

### Boards
- Home screen with thumbnails, search, recent boards, and rename / duplicate / delete.
- Autosaves locally to `%APPDATA%\JobaBoard\boards`.
- Open and save `.jboard` files to back up or move boards to another PC.
- Export to **PNG**, **SVG** or **PDF**, either the whole board or just the selection.
- A shared countdown **timer** and a **board outline** listing every item.

### Live collaboration (local network)
1. Open a board and click **Share → Start live sharing**.
2. Send the **Can edit** or **View only** link, or let people scan the QR code.
3. People on the same Wi-Fi or LAN open the link in **any browser** (phone, tablet or PC). Nothing needs to be installed.
4. Everyone sees edits in real time, with named live cursors and presence avatars.

Notes:
- Sharing works while JobaBoard is open on your PC. Click **Stop sharing** to end the session; the links stop working.
- The first time, Windows may ask whether JobaBoard can use the network. Allow it on **private networks**.
- **People outside your network** can join in one of two ways:
  - Forward TCP port `4321` on your router to your PC, then share `http://<your-public-ip>:4321/...`.
  - Run a tunnel, for example `cloudflared tunnel --url http://localhost:4321` or `ngrok http 4321`, and replace the host in the share link with the tunnel address.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| <kbd>V</kbd> <kbd>H</kbd> <kbd>P</kbd> <kbd>M</kbd> <kbd>E</kbd> <kbd>L</kbd> | Select, Pan, Pen, Highlighter, Eraser, Lasso |
| <kbd>N</kbd> <kbd>T</kbd> <kbd>R</kbd> <kbd>U</kbd> | Sticky note, Text, Shapes, Ruler |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> | Undo / redo |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> / <kbd>D</kbd> | Copy / cut / paste / duplicate |
| <kbd>Ctrl</kbd>+<kbd>G</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> | Group / ungroup |
| <kbd>Ctrl</kbd>+<kbd>L</kbd> | Lock / unlock |
| <kbd>Ctrl</kbd>+<kbd>]</kbd> / <kbd>[</kbd> (add <kbd>Shift</kbd> for front/back) | Change stacking order |
| <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>U</kbd> | Bold / italic / underline |
| <kbd>Ctrl</kbd>+<kbd>+</kbd> / <kbd>-</kbd> / <kbd>0</kbd>, <kbd>Shift</kbd>+<kbd>1</kbd> | Zoom in / out / 100% / fit |
| <kbd>Ctrl</kbd>+<kbd>E</kbd> | Export PNG |
| <kbd>?</kbd> | Show all shortcuts |

## Build from source

Requirements: Node.js 20+ and Windows (to build the `.exe`).

```bash
npm install
npm run dev        # run the app in development
npm test           # unit tests
npm run typecheck
npm run dist       # build dist/JobaBoard-Setup-<version>.exe and the portable exe
```

> If you run commands from VS Code's terminal and Electron starts as plain Node, clear the `ELECTRON_RUN_AS_NODE` environment variable first.

### Tech
Electron, React, TypeScript, Vite, Konva (canvas rendering) and **Yjs** (CRDT). One Yjs document drives undo/redo, saving and real-time sync. The share server built into the app (Express + WebSocket) serves the same React app to browser guests.

```
src/main/       Electron main: windows, storage, share server, auto-update
src/preload/    Safe bridge between the UI and the main process
src/renderer/   React UI: home screen, canvas, tools, panels, export, templates
tests/          Unit tests (ink recognition, geometry, clipboard, undo, storage)
```

### Releasing
Bump `version` in `package.json`, then push a tag such as `v1.0.1`. The GitHub Actions workflow builds the Windows installer and attaches it to a GitHub Release.

## License

MIT
