# Architecture

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 19.2.4 |
| Routing | React Router DOM | 7.13.0 |
| Build | Vite | 7.3.1 |
| Styling | Tailwind CSS | 4.1.18 |
| Charts | Recharts | 3.7.0 |
| Persistence | Browser localStorage | — |

## Directory Structure

```
src/
├── main.jsx                          # Entry point, mounts BrowserRouter + App
├── App.jsx                           # Route definitions
├── index.css                         # Tailwind imports + dark mode variant + scrollbar styles
│
├── lib/                              # Pure logic, no React
│   ├── constants.js                  # Storage keys, schema version, size defaults
│   ├── version.js                    # APP_VERSION constant (single source of truth)
│   ├── storage.js                    # localStorage CRUD with debouncing, workspace identity
│   ├── importExport.js               # Export/import product JSON, file picker utility
│   ├── validateProduct.js            # Comprehensive schema validation for imported products
│   ├── sortByOrder.js                # Pure sort utility for persisted order arrays
│   ├── progressViewHelpers.js        # Pure helpers for progress view (pct, delta, comments)
│   ├── sampleData.js                 # Sample "Billing System v2" product factory
│   ├── calculations.js              # Pure computation functions (points, progress, stats)
│   ├── progressMutations.js         # Shared progress tracking helpers (update, remove, comment)
│   ├── settingsMutations.js         # Pure cascade deletion (release, sprint) + releaseHasAllocations
│   ├── ribHelpers.js                # forEachRib / reduceRibs traversal utilities
│   ├── themeColors.js               # Centralized 8-color palette for themes (solid, light, dot, swatch)
│   └── exportForForecaster.js       # Pure transformation: Story Map → SPERT Release Forecaster import format
│
├── hooks/
│   ├── useProduct.js                 # Load/save product state with debounced persistence
│   ├── useProductMutations.js        # Reusable CRUD for theme/backbone/rib hierarchy
│   ├── useReleaseDrag.js             # DnD hook for release planning (card + column drag)
│   └── useDarkMode.js                # Theme toggle hook (localStorage + system preference)
│
├── components/
│   ├── ui/                           # Generic, reusable UI primitives
│   │   ├── CategoryBadge.jsx         # Core/non-core toggle button
│   │   ├── InlineEdit.jsx            # Click-to-edit text field
│   │   ├── SizePicker.jsx            # T-shirt size dropdown with color coding
│   │   ├── Modal.jsx                 # Overlay dialog with Escape/backdrop close
│   │   ├── ConfirmDialog.jsx         # Confirm/cancel dialog (wraps Modal)
│   │   ├── ProgressBar.jsx           # Animated horizontal progress bar
│   │   ├── CollapsibleSection.jsx    # Collapsible section with toggle
│   │   ├── Tooltip.jsx               # Fast tooltip (200ms) via useTooltip hook
│   │   ├── Section.jsx               # Reusable Section and Field layout components
│   │   └── ThemeToggle.jsx           # Sun/moon dark mode toggle button
│   ├── layout/
│   │   └── ProductLayout.jsx         # Header, tab nav, footer, outlet context
│   ├── settings/                     # Global and per-project settings components
│   │   ├── AppSettingsModal.jsx      # Global settings modal (storage mode + export attribution)
│   │   ├── StorageSection.jsx        # Storage mode toggle, auth UI, migration controls
│   │   ├── SharingSection.jsx        # Project sharing (cloud mode, owner only)
│   │   ├── SizeMappingSection.jsx    # T-shirt size mapping editor
│   │   └── DataSection.jsx           # Import/export buttons + confirm dialogs
│   ├── progress/
│   │   ├── ProgressHeader.jsx        # Sprint selector, group-by buttons, expand/collapse toggle
│   │   ├── SprintSummaryCard.jsx     # Sprint summary stats card
│   │   ├── BurnUpChart.jsx           # Burn-up progress chart
│   │   ├── ProgressRow.jsx           # Individual progress table row
│   │   ├── GroupSummaryHeader.jsx    # Collapsible group header with summary stats
│   │   └── CommentPanel.jsx          # Assessment note panel for progress rows
│   ├── structure/                    # Structure view sub-components
│   │   ├── BackboneSection.jsx       # Backbone header + rib table grid
│   │   └── RibRow.jsx                # Individual rib item row with drag, edit, stats
│   ├── releases/
│   │   ├── RibCard.jsx               # Draggable card for release kanban
│   │   └── AllocationModal.jsx       # Split-allocation editor modal
│   ├── sizing/                       # Sizing view components
│   │   ├── SizingContent.jsx         # Sizing board renderer (unsized zone, size columns, cells)
│   │   ├── useSizingLayout.js        # Layout computation + constants for sizing board
│   │   └── useSizingDrag.js          # Pointer-event drag hook for sizing (rib drags only)
│   └── storymap/                     # Interactive story map components
│       ├── MapCanvas.jsx             # Pan/zoom container with pointer events
│       ├── MapContent.jsx            # Map rendering (headers, lanes, cells, add buttons)
│       ├── ThemeHeader.jsx           # Theme label with inline rename, drag handle, delete
│       ├── BackboneHeader.jsx        # Backbone label with inline rename, drag handle, delete
│       ├── RibCell.jsx               # Rib card on the map with drag grip and delete
│       ├── ReleaseDivider.jsx        # Release lane divider with clickable label
│       ├── UnassignedLane.jsx        # Unassigned lane at bottom of map
│       ├── DropHighlight.jsx         # Visual drop target indicator
│       ├── InsertionIndicator.jsx    # Blue line showing drop position (rib/backbone/theme)
│       ├── DragGhost.jsx             # Card-stack preview following cursor during drags
│       ├── RibDetailPanel.jsx        # Slide-out panel for rib details
│       ├── ReleaseDetailPanel.jsx    # Slide-out panel for release details
│       ├── useMapLayout.js           # Layout computation + constants (columns, lanes, cells)
│       ├── useMapDrag.js             # Pointer-event drag hook (rib/backbone/theme drags)
│       ├── useInlineEdit.js          # Shared inline-edit hook for map headers
│       ├── mapMutations.js           # Pure mutation helpers (move rib/backbone/theme)
│       └── mapDragHelpers.js         # Drag commit logic (dispatches to mapMutations)
│
└── pages/                            # Route-level views
    ├── ProductList.jsx               # Home — product listing with CRUD
    ├── StructureView.jsx             # Story map editor (themes/backbones/ribs)
    ├── StoryMapView.jsx              # Interactive visual story map
    ├── SizingView.jsx                # Drag-and-drop t-shirt sizing board
    ├── ReleasePlanningView.jsx       # Kanban release board
    ├── ProgressTrackingView.jsx      # Sprint progress tracking
    ├── InsightsView.jsx              # Analytics dashboard
    ├── SettingsView.jsx              # Product configuration
    ├── ChangelogView.jsx             # Version history (reads CHANGELOG.md)
    └── AboutView.jsx                 # About page (purpose, data security, license)
```

## Data Model

```
Product
├── id, name, description, schemaVersion
├── sizeMapping: [{ label, points }]
├── releases: [{ id, name, order, description, targetDate }]
├── sprints: [{ id, name, order, endDate }]
├── releaseCardOrder: { [colId]: [ribId, ...] }
├── sizingCardOrder: { [sizeLabel|'unsized']: [ribId, ...] }
├── _originRef                                      # Workspace reconciliation token (set at creation)
├── _changeLog: [{ t, op, entity, id? }]            # Structural operation log (capped at 500)
└── themes: [Theme]
    ├── color?                                      # Optional color key (blue, teal, violet, etc.)
    └── backboneItems: [Backbone]
        └── ribItems: [RibItem]
            ├── size, category (core/non-core)
            ├── releaseAllocations: [{ releaseId, percentage, memo }]
            └── progressHistory: [{ sprintId, releaseId, percentComplete, comment?, updatedAt? }]

Export-time only fields (injected by exportProduct, not stored in localStorage):
├── _storageRef                                     # Exporting browser's workspace token
├── _exportedBy                                     # User name from Export Attribution preferences
└── _exportedById                                   # User identifier from Export Attribution preferences
```

## Data Flow

```
localStorage ──load──> useProduct hook ──context──> Views
                                          │
                                     updateProduct()
                                          │
                              useProduct ──debounced save──> localStorage
```

All state mutations flow through `updateProduct(prev => next)`. The `useProductMutations` hook provides convenience wrappers for common operations (update theme, backbone, rib; add items; reorder). Structural mutations (add/delete) also append entries to the product's `_changeLog` for export pipeline diagnostics.

## Key Design Decisions

1. **Pure calculations** — `calculations.js` has zero side effects. Every function derives values from the product object. This makes the logic testable and cacheable with `useMemo`.

2. **Dual DnD systems** — Release planning uses native HTML5 DnD with refs (`dropTargetRef`, `dropBeforeRef`) to avoid stale closures. The story map uses pointer events (`useMapDrag`) for smoother drag with three types: `'rib'`, `'backbone'`, `'theme'`. Window-level `pointermove`/`pointerup` listeners ensure reliable delivery.

3. **Atomic state updates** — Cross-column card moves combine allocation changes + card order into a single `updateProduct` call to prevent race conditions between separate state updates.

4. **Per-release progress** — Progress is tracked per-release per-sprint. Each `progressHistory` entry has a `releaseId` and `percentComplete` capped at the allocation percentage. Overall rib % is the sum of per-release entries. Schema migration (v1→v2) uses a waterfall algorithm to distribute old global entries across allocations.

5. **Assessment notes** — Each progress entry can carry an optional `comment` and `updatedAt` timestamp. Notes are entered via expandable rows in the progress table, with full history shown newest-first. Clearing a progress value removes the entry entirely unless it has a comment attached.

6. **Sprint-aware progress** — `getRibItemPercentCompleteAsOf()` walks backward through sprint history to find the most recent progress entry at or before a selected sprint, enabling historical views. Progress regression (negative deltas) is allowed to keep data honest.

7. **Debounced persistence** — Saves are debounced (500ms for products, 100ms for index) to avoid excessive writes during rapid edits, while `saveProductImmediate` is used for critical operations like create/import.

8. **Interactive story map** — The visual map uses absolute positioning with a computed layout (`useMapLayout`). Pan/zoom is handled via CSS `transform` on a container div. Pointer events (not HTML5 DnD) power drag-and-drop: after an 8px threshold, rib drags are free-form 2D (track both release lane and backbone column simultaneously), backbone drags are X-axis only, theme drags are X-axis only. `computeLayout` sorts cells by `releaseCardOrder`; `mapMutations.js` translates per-column insert indices to global card order positions via `spliceCardOrderByColumn`. Window-level `pointermove`/`pointerup` listeners ensure reliable event delivery even when the pointer moves over child elements.

9. **Undo/redo** — An in-memory stack of product snapshots (capped at 30) stored in `useProduct`. Every `updateProduct` call pushes the previous state onto the undo stack. Ctrl+Z pops undo, Ctrl+Shift+Z pops redo. No persistence — undo history resets on page refresh.

10. **Map pan vs click disambiguation** — `MapCanvas` uses a blacklist approach: `setPointerCapture` starts panning on any pointerdown except when the target is inside an element with `data-rib-id` or `data-release-id`. This allows clicks on rib cards and release labels to reach their handlers while panning works everywhere else.

11. **Sizing view** — A dedicated tab for bulk-sizing rib items. Reuses `MapCanvas` (pan/zoom) and `DragGhost`. Layout is computed by `useSizingLayout` with an unsized grid zone on top and t-shirt size columns below. Rib items with progress > 0% are locked (visually dimmed, no drag handle) to prevent re-sizing active work. Drag hook (`useSizingDrag`) commits both size change and `sizingCardOrder` position in a single `updateProduct` call. `computeSizingLayout` sorts cells by `sizingCardOrder` (keyed by size label or `'unsized'`).

12. **Click/double-click disambiguation** — Release labels use a 200ms timer to distinguish single-click (open detail panel) from double-click (inline rename). The timer is cancelled if a double-click fires within the window.

13. **Dark mode** — Class-based dark mode using Tailwind CSS 4's `@custom-variant dark`. The `.dark` class toggles on `<html>`. A synchronous inline script in `index.html` reads localStorage before React renders to prevent FOUC. The `useDarkMode` hook manages state, persists preference to `spert-theme` in localStorage, and falls back to `prefers-color-scheme`. Recharts components use conditional JS hex values (not Tailwind classes) via `isDark` from the hook.

14. **Theme colors** — Each theme has an optional `color` field (e.g. `'blue'`, `'teal'`). `themeColors.js` defines 8 color options with Tailwind classes for solid (theme header), light (backbone header), dot, and swatch contexts. `getThemeColorClasses(theme, index)` resolves the color: uses `theme.color` if set, otherwise falls back to index-based cycling. No schema migration needed — themes without a `color` field use the fallback.

15. **Forecaster export** — `exportForForecaster.js` transforms Story Map data into the SPERT Release Forecaster's import format. Releases map to milestones with incremental `backlogSize` (per-release allocated points, not cumulative). Sprint velocity (`doneValue`) is computed via delta-percent math: `Σ(ribPoints × (pctAsOf − pctPrev) / 100)` using `getRibItemPercentCompleteAsOf`. Zero-point releases are skipped. The export is a pure function with no side effects; `downloadForecasterExport` handles the browser download.

16. **Collapsible group summaries** — Progress tab group headers display item count, total points, % done, and a mini progress bar. Groups are collapsible via a `collapsedGroups` Set (reset on groupBy or sprint change). Release groups use `getReleasePercentComplete` (allocation-weighted); backbone/theme groups compute a weighted average from visible group items. Release Planning column headers also show a progress bar via the same `ProgressBar` component.

17. **Workspace reconciliation** — Each browser gets a persistent workspace token (`rp_workspace_id` in localStorage, generated once via `getWorkspaceId()`). Products carry `_originRef` (set at creation, preserved across imports) for data provenance tracking. `_storageRef` is injected at export time from the current workspace token for cross-session identification. `appendChangeLogEntry()` maintains a capped (500-entry) structural operation log (`_changeLog`) for export pipeline diagnostics. Export Attribution preferences (`exportName`, `exportId`) are stored in `rp_app_preferences` and injected as `_exportedBy`/`_exportedById` at export time for team workflow traceability.
