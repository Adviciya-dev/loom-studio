# Product Requirements Document
## UI Design Canvas — Tauri Application Feature

**Version:** 1.0  
**Status:** Draft  
**Date:** 2026-05-17  

---

## 1. Overview

### 1.1 Background

The existing Tauri application enables task-based development using Claude Code CLI as the AI engine and a Go CLI binary for backend operations. The current workflow supports structured, task-driven development — not vibe coding.

This PRD defines a new **UI Design Canvas** module to be added to the existing application. It allows users to generate, preview, inspect, edit, and save HTML/JSX UI designs entirely within the Tauri app — without modifying any source files until the user explicitly chooses to save.

### 1.2 Goal

Give developers and designers a Figma-like canvas inside the Tauri app where they can:
- Generate UI designs using Claude Code CLI via prompt
- View live rendered previews in isolated frames
- Inspect and select individual elements visually
- Edit selected elements through targeted prompts
- Manage multiple UI variants simultaneously on a zoomable canvas
- Save output to actual source files only on explicit user action

### 1.3 Non-Goals

- This is **not** a vibe coding tool — all generation is prompt-driven and task-specific
- This module does **not** auto-save or write to disk during design iteration
- This module does **not** replace the existing task-based development workflow
- This module does **not** support real-time collaboration in v1

---

## 2. User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| US-01 | Developer | Generate a UI from a text prompt | I can quickly prototype screens |
| US-02 | Developer | See the rendered HTML preview instantly | I can validate the design visually |
| US-03 | Designer | Click on any element in the preview | I can select and inspect it |
| US-04 | Designer | Edit a selected element via prompt | I can make targeted changes without regenerating the whole UI |
| US-05 | Developer | Add multiple frames to the canvas | I can compare variants side by side |
| US-06 | Developer | Zoom and pan the canvas freely | I can navigate multi-frame layouts easily |
| US-07 | Developer | Save to a file only when ready | I never accidentally overwrite source code |
| US-08 | Developer | Undo design iterations | I can revert to a previous state |
| US-09 | Designer | Resize frames to simulate different viewports | I can test desktop, tablet, and mobile layouts |
| US-10 | Developer | Export HTML or JSX from the canvas | I can use the output in my actual project |

---

## 3. Architecture

### 3.1 High-Level Flow

```
[User Prompt]
     │
     ▼
[Claude Code CLI]
     │  returns HTML/JSX string
     ▼
[Tauri: In-Memory Buffer]  ◄──── all edits stay here
     │
     ▼
[Canvas: iframe srcDoc]  ──── live preview render
     │
     ▼
[JS Injection: Element Picker]
     │  returns { selector, outerHTML, computedStyles }
     ▼
[Inspector Panel]
     │  user writes edit prompt
     ▼
[Claude Code CLI with element context]
     │  returns updated full HTML
     ▼
[Buffer Updated]  ──── re-render in iframe
     │
  [Save]
     │
     ▼
[Write to Disk]  ──── only on explicit save action
```

### 3.2 State Management (Rust — Tauri Backend)

```rust
struct DesignState {
    frames: Arc<Mutex<Vec<Frame>>>,
    selected_frame_id: Option<String>,
}

struct Frame {
    id: String,
    label: String,
    buffer: String,          // HTML/JSX in memory
    history: Vec<String>,    // undo stack
    saved_path: Option<PathBuf>,
    viewport: Viewport,
}

struct Viewport {
    width: u32,
    height: u32,
    x: f32,                  // canvas position
    y: f32,
}
```

### 3.3 Canvas State (Frontend)

```typescript
interface CanvasState {
  frames: Frame[]
  zoom: number               // range: 0.1 – 3.0
  panX: number
  panY: number
  selectedFrameId: string | null
  selectedElement: SelectedElement | null
}

interface Frame {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  buffer: string             // current HTML content
}

interface SelectedElement {
  frameId: string
  selector: string           // unique CSS path
  outerHTML: string
  computedStyles: Record<string, string>
}
```

---

## 4. Feature Requirements

### 4.1 Canvas

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| C-01 | Canvas is an infinite scrollable and zoomable surface | P0 |
| C-02 | Zoom range: 10% to 300%, triggered by mouse wheel or toolbar controls | P0 |
| C-03 | Zoom centers on mouse cursor position (Figma-style) | P0 |
| C-04 | Pan via middle-click drag or Space + left-click drag | P0 |
| C-05 | Canvas zoom level displayed in toolbar | P1 |
| C-06 | Fit-to-screen shortcut resets zoom and pan to show all frames | P1 |
| C-07 | Canvas background is a neutral dark grid pattern | P2 |

### 4.2 Frames

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| F-01 | Each frame renders HTML via `<iframe srcDoc>` | P0 |
| F-02 | Frames are absolutely positioned on the canvas | P0 |
| F-03 | Frames are resizable by dragging corners/edges | P0 |
| F-04 | Frames are draggable by their title bar | P0 |
| F-05 | Frame label displayed above the frame (e.g. "Desktop 1440", "Mobile 375") | P0 |
| F-06 | Preset viewport sizes: Desktop (1440px), Laptop (1280px), Tablet (768px), Mobile (375px) | P1 |
| F-07 | Multiple frames can exist simultaneously on the canvas | P0 |
| F-08 | Add new frame via toolbar button or right-click canvas | P0 |
| F-09 | Delete frame via frame context menu or keyboard shortcut | P1 |
| F-10 | Frames list shown in left Layers Panel | P1 |

### 4.3 HTML Preview

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| P-01 | Generated HTML renders live inside iframe via `srcDoc` | P0 |
| P-02 | Preview updates immediately when buffer changes | P0 |
| P-03 | Preview is isolated (sandbox: allow-scripts) | P0 |
| P-04 | Preview scrolls independently within the frame | P1 |
| P-05 | JSX is transpiled to HTML for preview render (esbuild WASM or Babel) | P2 |

### 4.4 Element Inspector

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| I-01 | Hover over any element in preview shows a blue highlight outline | P0 |
| I-02 | Click on element selects it and sends context to Inspector Panel | P0 |
| I-03 | Selected element context includes: outerHTML, unique CSS selector, computed styles | P0 |
| I-04 | Inspector Panel displays selected element's tag, class, key styles | P0 |
| I-05 | Selection is cleared when clicking canvas outside a frame | P1 |
| I-06 | Breadcrumb path shown (e.g. `body > .hero > h1`) | P2 |

The element picker is implemented by injecting a JS script into the iframe at load time:

```javascript
// Injected into iframe
document.addEventListener('click', e => {
  e.preventDefault()
  window.parent.postMessage({
    type: 'ELEMENT_SELECTED',
    outerHTML: e.target.outerHTML,
    selector: getCssSelector(e.target),
    computedStyles: getRelevantStyles(e.target)
  }, '*')
})
```

### 4.5 Prompt-Based Editing

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| E-01 | Prompt bar at bottom accepts user input for generation and editing | P0 |
| E-02 | When no element selected: prompt generates a full new UI for the active frame | P0 |
| E-03 | When element selected: prompt is scoped to that element only | P0 |
| E-04 | Claude receives: full buffer + selected element context + user prompt | P0 |
| E-05 | Claude returns: updated full HTML buffer (not a diff) | P0 |
| E-06 | Buffer updated and preview re-rendered on response | P0 |
| E-07 | Loading indicator shown during Claude Code CLI call | P1 |
| E-08 | Error state shown if CLI call fails | P1 |

**Claude prompt template for element editing:**

```
You are editing a specific element in an existing HTML UI.

Full current HTML:
{buffer}

Selected element:
  CSS Selector: {selector}
  OuterHTML: {outerHTML}
  Key styles: {computedStyles}

User request: "{userPrompt}"

Rules:
- Return ONLY the complete updated HTML
- Modify ONLY the selected element and its styles
- Do not change any other elements
- No explanation, markdown, or preamble — only raw HTML
```

### 4.6 Buffer and Save

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| B-01 | All edits are held in-memory per frame — no disk writes during iteration | P0 |
| B-02 | Each edit pushes previous buffer to history stack (undo support) | P0 |
| B-03 | Undo (Ctrl+Z) restores previous buffer state | P0 |
| B-04 | Save button writes buffer to a user-selected file path | P0 |
| B-05 | Save As opens file picker to choose destination | P0 |
| B-06 | Discard clears buffer without writing to disk | P1 |
| B-07 | Export converts buffer to JSX/TSX before writing (optional toggle) | P2 |
| B-08 | Save All writes all frames to their respective paths | P2 |

### 4.7 Layers Panel (Left)

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| L-01 | Lists all frames in canvas | P1 |
| L-02 | Clicking a frame in panel selects and focuses it on canvas | P1 |
| L-03 | Shows frame label and viewport size | P1 |
| L-04 | Drag to reorder frames in list | P2 |

### 4.8 Inspector Panel (Right)

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| R-01 | Displays selected element info: tag, selector, key styles | P0 |
| R-02 | Prompt input scoped to selected element | P0 |
| R-03 | Shows current frame buffer size and history depth | P2 |
| R-04 | Clear selection button | P1 |

---

## 5. UI Layout

```
┌────────────────────────────────────────────────────────────────┐
│  TOOLBAR                                                        │
│  [+ Add Frame ▾]  [Zoom: 75% - +]  [Fit]  [Save]  [Save As]  │
├──────────┬─────────────────────────────────┬───────────────────┤
│          │                                 │                   │
│  LAYERS  │         CANVAS                  │   INSPECTOR       │
│          │                                 │                   │
│ ▣ Frame1 │  ┌──────────────┐              │  Selected:        │
│ ▣ Frame2 │  │  Frame 1     │              │  .hero > h1       │
│ ▣ Frame3 │  │  Desktop     │              │                   │
│          │  │  ┌────────┐  │              │  tag: h1          │
│          │  │  │ iframe │  │              │  color: #111      │
│          │  │  │preview │  │              │  fontSize: 2rem   │
│          │  │  └────────┘  │              │                   │
│          │  └──────────────┘              │  ┌─────────────┐  │
│          │                                │  │ Edit prompt │  │
│          │  ┌──────┐  ┌──────┐           │  │             │  │
│          │  │Frame2│  │Frame3│           │  └─────────────┘  │
│          │  └──────┘  └──────┘           │  [Apply Edit]     │
│          │                                │                   │
├──────────┴─────────────────────────────────┴───────────────────┤
│  PROMPT BAR                                                     │
│  [Generate / Edit UI...                              ] [Send]  │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. Technical Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri (Rust) |
| Frontend UI | React + TypeScript |
| Styling | Tailwind CSS |
| Preview render | `<iframe srcDoc>` |
| Element picker | Injected JS via postMessage |
| AI generation | Claude Code CLI (existing) |
| Backend CLI | Go binary (existing) |
| JSX transpile (v2) | esbuild WASM in-browser |

---

## 7. Data Flow — Tauri Commands

```
Frontend                          Tauri (Rust)
   │                                   │
   │── generate_ui(prompt, frameId) ──►│── spawn Claude Code CLI
   │                                   │── receive HTML string
   │◄── { html: string } ─────────────│── push to frame buffer
   │                                   │
   │── element_selected(data) ────────►│── store selected element context
   │                                   │
   │── edit_element(prompt, frameId) ─►│── build scoped prompt
   │                                   │── call Claude Code CLI
   │◄── { html: string } ─────────────│── update buffer + push history
   │                                   │
   │── save_frame(frameId, path) ─────►│── write buffer to disk
   │◄── { success: bool } ────────────│
   │                                   │
   │── undo_frame(frameId) ───────────►│── pop history stack
   │◄── { html: string } ─────────────│
```

---

## 8. Release Phases

### Phase 1 — Core Canvas (MVP)
- Single frame canvas with zoom and pan
- Prompt → HTML generation via Claude Code CLI
- iframe live preview
- Element picker (click to select)
- Targeted edit via prompt
- In-memory buffer with undo
- Save to file

### Phase 2 — Multi-Frame
- Multiple frames on canvas
- Draggable and resizable frames
- Layers panel
- Viewport presets (Desktop, Mobile, Tablet)
- Add / delete frames

### Phase 3 — Polish
- JSX transpile and export
- Save All
- Export as JSX/TSX toggle
- Fit-to-screen
- Breadcrumb element path
- Frame duplication
- Keyboard shortcuts

---

## 9. Out of Scope (v1)

- Real-time collaboration
- Component library integration
- CSS variable theming panel
- Auto-layout / Figma constraints
- Asset management (images, icons)
- Version history beyond in-session undo

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Time from prompt to visible preview | < 5 seconds |
| Element selection accuracy | Selects exact clicked element 100% of the time |
| Targeted edit scope | Claude modifies only selected element in ≥ 95% of cases |
| Buffer integrity | Zero accidental disk writes before user clicks Save |
| Undo reliability | Correctly restores previous state 100% of the time |

---

## 11. App Integration

This section defines exactly how the Design Canvas module plugs into the existing Loom app architecture.

### 11.1 App Mode Value

The Design Canvas is activated by a new app mode value: `'design'`.

**`src/context/types.ts` — required changes:**

```typescript
// AppState.appMode union
appMode: 'run' | 'harness' | 'qa' | 'github' | 'cqc' | 'audit' | 'design'

// AppAction SET_APP_MODE union
| { type: 'SET_APP_MODE'; mode: 'run' | 'harness' | 'qa' | 'github' | 'cqc' | 'audit' | 'design' }
```

### 11.2 Sidebar Entry

Add a `Palette` icon button to `src/components/Sidebar/Sidebar.tsx` between the Site Audit entry (`Globe`) and the Settings button at the bottom.

```tsx
import { Palette } from 'lucide-react'

<button
  className={`${styles.navItem} ${appMode === 'design' ? styles.active : ''}`}
  title="UI Design Canvas"
  onClick={() => dispatch({ type: 'SET_APP_MODE', mode: 'design' })}
>
  <Palette size={18} strokeWidth={1.75} />
</button>
```

### 11.3 App.tsx Routing

Add the Design Canvas arm to the mode switch in `src/App.tsx`:

```tsx
) : state.appMode === 'audit' ? (
  <SiteAudit />
) : state.appMode === 'design' ? (
  <UIDesignCanvas />
) : (
  <Workspace />
```

### 11.4 TopBar Behavior in Design Mode

The Design Canvas owns its own full-width toolbar (see Section 5 layout). When `appMode === 'design'`:

- `TopBar` returns `null` — the module provides its own toolbar internally
- `LogPanel` and `BottomBar` remain visible and unchanged
- The module's internal `Toolbar.tsx` renders at the top of `<UIDesignCanvas />`

`src/components/TopBar/TopBar.tsx` must check `appMode === 'design'` and return `null` before rendering any toolbar content.

### 11.5 Canvas State Isolation

`CanvasState` (frames, zoom, pan, selection) must **not** be merged into the global `AppContext` reducer. Rationale: design state is large, unrelated to engine/git/task state, and isolating it prevents accidental cross-module coupling.

- A dedicated `DesignContext` with its own `useReducer` is created and wraps only `<UIDesignCanvas />`
- The global `AppState` holds only `appMode: 'design'` to activate the route
- No design-canvas fields are added to `AppState` or `AppAction`

### 11.6 Component File Structure

```
src/components/UIDesignCanvas/
  UIDesignCanvas.tsx            ← root component mounted by App.tsx
  UIDesignCanvas.module.css
  Canvas.tsx                    ← infinite zoom/pan surface
  Canvas.module.css
  Frame.tsx                     ← iframe frame with drag/resize
  Frame.module.css
  LayersPanel.tsx               ← left panel (frame list)
  LayersPanel.module.css
  InspectorPanel.tsx            ← right panel (element details + edit prompt)
  InspectorPanel.module.css
  Toolbar.tsx                   ← top toolbar (add frame, zoom, save)
  Toolbar.module.css
  PromptBar.tsx                 ← bottom prompt input
  PromptBar.module.css
  DesignContext.tsx             ← DesignContext + useReducer (CanvasState)
```

All files use **CSS Modules** per the project coding standard (see `harness/CLAUDE.md`).

---

## 12. Gap Analysis

Gaps identified against this PRD. Status updated as sections are resolved.

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| G-01 | Critical | No app integration spec — appMode value, sidebar icon, App.tsx routing, TopBar behavior all undefined | **Resolved — Section 11** |
| G-02 | Critical | Claude Code CLI integration undefined — no spec for whether `invoke_engine()` is reused, how streaming is buffered into a full HTML string, or how markdown fences are stripped from Claude's response | Open |
| G-03 | Critical | Dual prompt inputs — Section 4.5 (Prompt Bar E-01) and Section 4.8 (Inspector Panel R-02) both define a prompt input; no spec for which is authoritative or how they relate | Open |
| G-04 | Critical | `iframe sandbox: allow-scripts` blocks `window.parent.postMessage` — correct sandbox value must be `allow-scripts allow-same-origin`; security implications in Tauri webview must be evaluated | Open |
| G-05 | Critical | State management integration unspecified — resolved for CanvasState isolation (Section 11.5), but action types for DesignContext reducer are still undefined | Partial |
| G-06 | High | No redo — Ctrl+Y / Ctrl+Shift+Z redo is absent; B-02/B-03 specify undo only | Open |
| G-07 | High | `CanvasState` missing `isGenerating: boolean` and `generationError: string \| null` — required to implement E-07 (loading indicator) and E-08 (error state) | Open |
| G-08 | High | Active frame ambiguity — when multiple frames exist and no element is selected, which frame receives a full-generation prompt (E-02) is undefined | Open |
| G-09 | High | New frame initial `buffer` content undefined — F-08 adds a frame but doesn't specify whether initial content is empty string, blank HTML shell, or placeholder; affects both preview render and prompt context | Open |
| G-10 | High | `getCssSelector(el)` and `getRelevantStyles(el)` are called in the picker script (Section 4.4) but never defined — these are non-trivial to implement correctly | Open |
| G-11 | High | Hover highlight (I-01) has no corresponding JS snippet — only the click handler is specified | Open |
| G-12 | High | Position source-of-truth conflict — Rust `Viewport.x/y` and frontend `Frame.x/y` both represent canvas position; no spec for sync direction or frequency on drag | Open |
| G-13 | High | Canvas state persistence across restarts not addressed — Section 9 excludes version history but is silent on frame/buffer persistence; no Tauri commands exist for state restore (Section 7) | Open |
| G-14 | High | Styling standard conflict — Section 6 lists Tailwind CSS but `harness/CLAUDE.md` mandates CSS Modules and prohibits CSS-in-JS; **CSS Modules must be used** (aligned in Section 11.6) | Resolved — Section 11.6 |
| G-15 | Medium | Phase vs. priority mismatch — C-06 (Fit-to-screen) is P1 but placed in Phase 3; several other requirements have mismatched priority/phase assignments | Open |
| G-16 | Medium | No Esc key to clear element selection — standard design-tool interaction absent | Open |
| G-17 | Medium | No undo stack size limit — unbounded history stack could cause memory issues on long sessions | Open |
| G-18 | Medium | No retry action on generation error — E-08 shows error state but no recovery mechanism is specified | Open |
| G-19 | Medium | Frame duplication mentioned in Phase 3 description but absent from all requirement tables | Open |
| G-20 | Medium | No keyboard shortcut reference table — Phase 3 mentions shortcuts but lists none | Open |
| G-21 | Medium | No loading/skeleton visual spec — E-07 requires a loading indicator but frame and prompt bar appearance during generation is unspecified | Open |
| G-22 | Medium | Missing Tauri commands — Section 7 has no `list_frames`, `get_frame_buffer`, or state-restore commands needed for persistence | Open |
| G-23 | Low | JSX transpile implementation undefined — P-05 and B-07 reference esbuild WASM or Babel with no implementation detail | Open |
| G-24 | Low | No per-requirement acceptance criteria — Section 10 has five high-level metrics but no done-criteria per requirement | Open |

### Gap Summary

| Severity | Total | Resolved | Open |
|----------|-------|----------|------|
| Critical | 5 | 2 | 3 |
| High | 9 | 1 | 8 |
| Medium | 7 | 0 | 7 |
| Low | 2 | 0 | 2 |
| **Total** | **23** | **3** | **20** |

**Minimum gaps to resolve before Phase 1 implementation begins:** G-02, G-03, G-04, G-05 (action types), G-07, G-08.

---

*End of Document*
