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
├── index.css                         # Tailwind imports + scrollbar styles
│
├── lib/                              # Pure logic, no React
│   ├── constants.js                  # Storage keys, schema version, size defaults
│   ├── version.js                    # APP_VERSION constant (single source of truth)
│   ├── storage.js                    # localStorage CRUD with debouncing
│   ├── sampleData.js                 # Sample "Billing System v2" product factory
│   └── calculations.js              # Pure computation functions (points, progress, stats)
│
├── hooks/
│   ├── useProduct.js                 # Load/save product state with debounced persistence
│   └── useProductMutations.js        # Reusable CRUD for theme/backbone/rib hierarchy
│
├── components/
│   ├── ui/                           # Generic, reusable UI primitives
│   │   ├── CategoryBadge.jsx         # Core/non-core toggle button
│   │   ├── InlineEdit.jsx            # Click-to-edit text field
│   │   ├── SizePicker.jsx            # T-shirt size dropdown with color coding
│   │   ├── Modal.jsx                 # Overlay dialog with Escape/backdrop close
│   │   ├── ConfirmDialog.jsx         # Confirm/cancel dialog (wraps Modal)
│   │   └── ProgressBar.jsx           # Animated horizontal progress bar
│   ├── layout/
│   │   └── ProductLayout.jsx         # Header, tab nav, footer, outlet context
│   └── releases/
│       ├── RibCard.jsx               # Draggable card for release kanban
│       └── AllocationModal.jsx       # Split-allocation editor modal
│
└── pages/                            # Route-level views
    ├── ProductList.jsx               # Home — product listing with CRUD
    ├── StructureView.jsx             # Story map editor (themes/backbones/ribs)
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
└── themes: [Theme]
    └── backboneItems: [Backbone]
        └── ribItems: [RibItem]
            ├── size, category (core/non-core)
            ├── releaseAllocations: [{ releaseId, percentage, memo }]
            └── progressHistory: [{ sprintId, releaseId, percentComplete, comment?, updatedAt? }]
```

## Data Flow

```
localStorage ──load──> useProduct hook ──context──> Views
                                          │
                                     updateProduct()
                                          │
                              useProduct ──debounced save──> localStorage
```

All state mutations flow through `updateProduct(prev => next)`. The `useProductMutations` hook provides convenience wrappers for common operations (update theme, backbone, rib; add items; reorder).

## Key Design Decisions

1. **Pure calculations** — `calculations.js` has zero side effects. Every function derives values from the product object. This makes the logic testable and cacheable with `useMemo`.

2. **Native HTML5 DnD** — We use the browser's built-in drag-and-drop API rather than a library. Refs (`dropTargetRef`, `dropBeforeRef`) track the latest drop position to avoid stale closures in event handlers.

3. **Atomic state updates** — Cross-column card moves combine allocation changes + card order into a single `updateProduct` call to prevent race conditions between separate state updates.

4. **Per-release progress** — Progress is tracked per-release per-sprint. Each `progressHistory` entry has a `releaseId` and `percentComplete` capped at the allocation percentage. Overall rib % is the sum of per-release entries. Schema migration (v1→v2) uses a waterfall algorithm to distribute old global entries across allocations.

5. **Assessment notes** — Each progress entry can carry an optional `comment` and `updatedAt` timestamp. Notes are entered via expandable rows in the progress table, with full history shown newest-first. Clearing a progress value removes the entry entirely unless it has a comment attached.

6. **Sprint-aware progress** — `getRibItemPercentCompleteAsOf()` walks backward through sprint history to find the most recent progress entry at or before a selected sprint, enabling historical views. Progress regression (negative deltas) is allowed to keep data honest.

7. **Debounced persistence** — Saves are debounced (500ms for products, 100ms for index) to avoid excessive writes during rapid edits, while `saveProductImmediate` is used for critical operations like create/import.
