# Architecture

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x (strict mode) |
| Framework | React | 19.2.4 |
| Routing | React Router DOM | 7.16.0 |
| Build | Vite | 7.3.1 |
| Styling | Tailwind CSS | 4.2.1 |
| Charts | Recharts | 3.8.0 |
| Persistence | Browser localStorage | — |

## Directory Structure

```
src/
├── main.tsx                          # Entry point, mounts BrowserRouter + App
├── App.tsx                           # Route definitions
├── index.css                         # Tailwind imports + dark mode variant + scrollbar styles
│
├── types/
│   └── index.ts                      # Core domain interfaces (Product, Theme, Backbone, RibItem, etc.)
│
├── lib/                              # Pure logic, no React
│   ├── constants.ts                  # Storage keys, schema version, size defaults
│   ├── version.ts                    # APP_VERSION constant (single source of truth)
│   ├── storage.ts                    # localStorage CRUD with debouncing, workspace identity
│   ├── importExport.ts               # Export product JSON, bundled export, legacy single-file import helper
│   ├── import-utils.ts               # Multi-project import: parse, conflict detection, applyImport (Layer 2 drift re-validation)
│   ├── validateProduct.ts            # Comprehensive schema validation for imported products
│   ├── schemaVersion.ts              # THE single predicate deciding if the destructive v1→v2 migration runs
│   ├── validatorObserver.ts          # Flag-gated observer: runs validateProduct against a CLONE at the read seams, reports only
│   ├── validatorObserverDiff.ts      # Own-key structural diff (live vs. validated clone) used by the observer
│   ├── validatorObserverRegistry.ts  # Synchronous no-op-unless-registered slot the read seams call
│   ├── sortByOrder.ts                # Pure sort utility for persisted order arrays
│   ├── progressViewHelpers.ts        # Pure helpers for progress view (pct, delta, comments)
│   ├── sampleData.ts                 # Sample "Billing System v2" product factory
│   ├── calculations.ts              # Pure computation functions (points, progress, stats)
│   ├── progressMutations.ts         # Shared progress tracking helpers (update, remove, comment)
│   ├── settingsMutations.ts         # Pure cascade deletion (release, sprint) + releaseHasAllocations
│   ├── ribHelpers.ts                # forEachRib / reduceRibs / isRibLocked / computeRibSiblingName
│   ├── productTransforms.ts         # Pure (prev:Product)=>Product transforms shared by useProductMutations + aiOps
│   ├── firestoreCollections.ts      # Centralized Firestore collection-name constants (PROJECTS/PROFILES/SETTINGS/SESSIONS)
│   ├── themeColors.ts               # Centralized 8-color palette for themes (solid, light, dot, swatch)
│   ├── exportForForecaster.ts       # Pure transformation: Story Map → SPERT Release Forecaster import format
│   ├── sendToForecaster.ts          # Direct handover to a Forecaster tab (postMessage); returns reasons, never throws
│   ├── crosslinkProtocol.ts         # Pure sender-side handshake reducer (shared shape with Forecaster's copy)
│   ├── exportForExcel.ts            # Excel export: buildExcelWorkbook (pure, testable) + downloadExcelExport (dynamic import)
│   ├── tosConstants.ts              # ToS version, URLs, localStorage keys, app ID
│   └── tosHelpers.ts                # ToS acceptance state management (localStorage + Firestore)
│
├── hooks/
│   ├── useProduct.ts                 # Load/save product state with debounced persistence
│   ├── useProductMutations.ts        # Reusable CRUD hook (pure transforms live in lib/productTransforms.ts)
│   ├── aiConnectivityUtils.ts        # Pure helpers for useAiConnectivity (seq cursor, consent parse, ops query)
│   ├── useReleaseDrag.ts             # DnD hook for release planning (card + column drag)
│   ├── useImportState.ts             # State machine for multi-project import (idle/preview/applying/done/error)
│   └── useDarkMode.ts                # Theme toggle hook (localStorage + system preference)
│
├── components/
│   ├── ui/                           # Generic, reusable UI primitives
│   │   ├── CategoryBadge.tsx         # Core/non-core toggle button
│   │   ├── InlineEdit.tsx            # Click-to-edit text field
│   │   ├── SizePicker.tsx            # T-shirt size dropdown with color coding
│   │   ├── Modal.tsx                 # Overlay dialog with Escape/backdrop close
│   │   ├── ConfirmDialog.tsx         # Confirm/cancel dialog (wraps Modal)
│   │   ├── ProgressBar.tsx           # Animated horizontal progress bar
│   │   ├── CollapsibleSection.tsx    # Collapsible section with toggle
│   │   ├── Tooltip.tsx               # Fast tooltip (200ms) via useTooltip hook
│   │   ├── Section.tsx               # Reusable Section and Field layout components
│   │   ├── ThemeToggle.tsx           # Sun/moon dark mode toggle button
│   │   ├── StorageStatusPill.tsx    # 3-state pill showing local/cloud/sign-in status
│   │   └── FirstRunBanner.tsx       # Dismissible first-run ToS informational banner
│   ├── layout/
│   │   └── ProductLayout.tsx         # Header, tab nav, footer, outlet context
│   ├── settings/                     # Global and per-project settings components
│   │   ├── AppSettingsModal.tsx      # Global settings modal (storage mode + export attribution)
│   │   ├── StorageSection.tsx        # Storage mode toggle, auth UI, migration controls
│   │   ├── SharingSection.tsx        # Project sharing (cloud mode, owner only)
│   │   ├── TosConsentModal.tsx       # Clickwrap ToS/Privacy consent modal for cloud sign-in
│   │   ├── SizeMappingSection.tsx    # T-shirt size mapping editor
│   │   └── DataSection.tsx           # Per-project import (parseImportFile + updateProduct) and export buttons
│   ├── product/
│   │   ├── CreateProjectModal.tsx    # New-project create dialog
│   │   ├── ProjectCard.tsx           # Project list card (inline rename via pencil/double-click, export, duplicate, delete)
│   │   ├── ShareDialog.tsx           # Cloud-mode project sharing dialog
│   │   └── ImportPreviewSection.tsx  # Homepage import preview UI: phase rendering + decision rows + result banner
│   ├── progress/
│   │   ├── ProgressHeader.tsx        # Sprint selector, group-by buttons, expand/collapse toggle
│   │   ├── SprintSummaryCard.tsx     # Sprint summary stats card
│   │   ├── BurnUpChart.tsx           # Burn-up progress chart
│   │   ├── ProgressRow.tsx           # Individual progress table row
│   │   ├── GroupSummaryHeader.tsx    # Collapsible group header with summary stats
│   │   └── CommentPanel.tsx          # Assessment note panel for progress rows
│   ├── structure/                    # Structure view sub-components
│   │   ├── BackboneSection.tsx       # Backbone header + rib table grid
│   │   └── RibRow.tsx                # Individual rib item row with drag, edit, stats
│   ├── releases/
│   │   ├── RibCard.tsx               # Draggable card for release kanban
│   │   └── AllocationModal.tsx       # Split-allocation editor modal
│   ├── sizing/                       # Sizing view components
│   │   ├── SizingContent.tsx         # Sizing board renderer (unsized zone, size columns, cells)
│   │   ├── SizingFilterPanel.tsx     # Filter overlay: theme chips + hide-completed toggle
│   │   ├── useSizingLayout.ts        # Layout computation + constants + SizingFilter type
│   │   └── useSizingDrag.ts          # Pointer-event drag hook for sizing (rib drags only)
│   └── storymap/                     # Interactive story map components
│       ├── MapCanvas.tsx             # Pan/zoom container with pointer events
│       ├── MapContent.tsx            # Map rendering (headers, lanes, cells, add buttons)
│       ├── ThemeHeader.tsx           # Theme label with inline rename, drag handle, delete
│       ├── BackboneHeader.tsx        # Backbone label with inline rename, drag handle, delete
│       ├── RibCell.tsx               # Rib card on the map with drag grip and delete
│       ├── ReleaseDivider.tsx        # Release lane divider with clickable label
│       ├── UnassignedLane.tsx        # Unassigned lane at bottom of map
│       ├── DropHighlight.tsx         # Visual drop target indicator
│       ├── InsertionIndicator.tsx    # Blue line showing drop position (rib/backbone/theme)
│       ├── DragGhost.tsx             # Card-stack preview following cursor during drags
│       ├── RibDetailPanel.tsx        # Slide-out panel for rib details (rename, category, size, notes)
│       ├── ReleaseDetailPanel.tsx    # Slide-out panel for release details
│       ├── useMapLayout.ts           # Layout computation + constants (columns, lanes, cells)
│       ├── useMapDrag.ts             # Pointer-event drag hook (rib/backbone/theme drags)
│       ├── useInlineEdit.ts          # Shared inline-edit hook for map headers
│       ├── mapMutations.ts           # Pure mutation helpers (move rib/backbone/theme)
│       └── mapDragHelpers.ts         # Drag commit logic (dispatches to mapMutations)
│
└── pages/                            # Route-level views
    ├── ProductList.tsx               # Home — product listing with CRUD
    ├── StructureView.tsx             # Story map editor (themes/backbones/ribs)
    ├── StoryMapView.tsx              # Interactive visual story map
    ├── SizingView.tsx                # Drag-and-drop t-shirt sizing board
    ├── ReleasePlanningView.tsx       # Kanban release board
    ├── ProgressTrackingView.tsx      # Sprint progress tracking
    ├── InsightsView.tsx              # Analytics dashboard
    ├── SettingsView.tsx              # Product configuration
    ├── ChangelogView.tsx             # Version history (reads CHANGELOG.md)
    └── AboutView.tsx                 # About page (purpose, data security, license)

legal/
├── TOS.pdf                           # Reference copy of Terms of Service
└── PRIVACY.pdf                       # Reference copy of Privacy Policy
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
├── _changeLog: [{ t, op, entity, id?, source? }]   # Structural operation log (capped at 500). op: 'create'|'add'|'delete'|'import'|'cloud-migration'|'duplicate'|'split'. source: originating entity ID for 'duplicate' (product) and 'split' (rib).
└── themes: [Theme]
    ├── color?                                      # Optional color key (blue, teal, violet, etc.)
    └── backboneItems: [Backbone]
        └── ribItems: [RibItem]
            ├── size, category (core/non-core)
            ├── notes?                                  # Free-form notes (max 2,000 chars)
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

8. **Interactive story map** — The visual map uses absolute positioning with a computed layout (`useMapLayout`). Pan/zoom is handled via CSS `transform` on a container div. Pointer events (not HTML5 DnD) power drag-and-drop: after an 8px threshold, rib drags are free-form 2D (track both release lane and backbone column simultaneously), backbone drags are X-axis only, theme drags are X-axis only. `computeLayout` sorts cells by `releaseCardOrder`; `mapMutations.js` translates per-column insert indices to global card order positions via `spliceCardOrderByColumn`. Window-level `pointermove`/`pointerup` listeners ensure reliable event delivery even when the pointer moves over child elements. Themes with no backbones emit placeholder `themeSpan` entries (`isEmpty: true`) that reserve a grid slot, so every theme is visible on the map immediately after creation.

9. **Undo/redo** — An in-memory stack of product snapshots (capped at 30) stored in `useProduct`. Every `updateProduct` call pushes the previous state onto the undo stack. Ctrl+Z pops undo, Ctrl+Shift+Z pops redo. No persistence — undo history resets on page refresh.

10. **Map pan vs click disambiguation** — `MapCanvas` uses a blacklist approach: `setPointerCapture` starts panning on any pointerdown except when the target is inside an element with `data-rib-id` or `data-release-id`. This allows clicks on rib cards and release labels to reach their handlers while panning works everywhere else.

11. **Sizing view** — A dedicated tab for bulk-sizing rib items. Reuses `MapCanvas` (pan/zoom) and `DragGhost`. Layout is computed by `useSizingLayout` with an unsized grid zone on top and t-shirt size columns below. Rib items with progress > 0% are locked (visually dimmed, no drag handle) to prevent re-sizing active work. Drag hook (`useSizingDrag`) commits both size change and `sizingCardOrder` position in a single `updateProduct` call. `computeSizingLayout` sorts cells by `sizingCardOrder` (keyed by size label or `'unsized'`). An optional `SizingFilter` (theme chips + hide-completed toggle) gates the `forEachRib` loop inside `computeSizingLayout`; filter state is ephemeral (not persisted). `SizingFilterPanel` is a dumb UI component rendered via `MapCanvas`'s `overlayControls` prop.

12. **MapCanvas overlay slot** — `MapCanvas` accepts an optional `overlayControls` ReactNode prop. It renders in a flex column alongside the zoom controls at `top-3 right-3`, stacking naturally below the zoom bar via `flex-col gap-2`. This keeps view-specific overlay controls (e.g., sizing filter) positioned relative to the zoom bar without pixel guessing across zoom levels.

13. **Click/double-click disambiguation** — Release labels use a 200ms timer to distinguish single-click (open detail panel) from double-click (inline rename). The timer is cancelled if a double-click fires within the window.

14. **Dark mode** — Class-based dark mode using Tailwind CSS 4's `@custom-variant dark`. The `.dark` class toggles on `<html>`. A synchronous inline script in `index.html` reads localStorage before React renders to prevent FOUC. The `useDarkMode` hook manages state, persists preference to `spert-theme` in localStorage, and falls back to `prefers-color-scheme`. Recharts components use conditional JS hex values (not Tailwind classes) via `isDark` from the hook.

15. **Theme colors** — Each theme has an optional `color` field (e.g. `'blue'`, `'teal'`). `themeColors.js` defines 8 color options with Tailwind classes for solid (theme header), light (backbone header), dot, and swatch contexts. `getThemeColorClasses(theme, index)` resolves the color: uses `theme.color` if set, otherwise falls back to index-based cycling. No schema migration needed — themes without a `color` field use the fallback.

16. **Forecaster export** — `exportForForecaster.js` transforms Story Map data into the SPERT Release Forecaster's import format. Releases map to milestones with incremental `backlogSize` (per-release allocated points, not cumulative). Sprint velocity (`doneValue`) is computed via delta-percent math: `Σ(ribPoints × (pctAsOf − pctPrev) / 100)` using `getRibItemPercentCompleteAsOf`. Zero-point releases are skipped. The export is a pure function with no side effects; `downloadForecasterExport` handles the browser download.

16. **Collapsible group summaries** — Progress tab group headers display item count, total points, % done, and a mini progress bar. Groups are collapsible via a `collapsedGroups` Set (reset on groupBy or sprint change). Release groups use `getReleasePercentComplete` (allocation-weighted); backbone/theme groups compute a weighted average from visible group items. Release Planning column headers also show a progress bar via the same `ProgressBar` component.

17. **ToS & Privacy Policy acceptance (v0.17.0)** — Browsewrap footer links (ToS + Privacy Policy) render on all pages via the shared `Footer` component. A first-run banner (dismissed via `spert_firstRun_seen` localStorage key) informs new visitors that Cloud Storage requires agreement. A clickwrap consent modal (`TosConsentModal`) gates Cloud Storage sign-in — users must check a checkbox and click "Enable Cloud Storage" before Firebase Auth fires. Post-auth, `AuthProvider` writes acceptance to Firestore at `users/{uid}` with version, timestamp, auth provider, and originating app ID. Returning users are verified on app load: if the stored ToS version doesn't match the current version, the user is signed out and must re-accept. `tosHelpers.js` provides pure async functions for localStorage caching and Firestore read/write; `tosConstants.js` centralizes version strings and keys.

19. **Excel export** — `exportForExcel.ts` transforms a `Product` into a two-sheet ExcelJS workbook: Sheet 1 (Rib Items) has one data row per rib item with a color-coded theme group header row before each theme; Sheet 2 (Release Summary) has one row per release. `buildExcelWorkbook(product, ExcelJS)` accepts the ExcelJS constructor as a parameter so it is a pure async function testable in Vitest without a browser. `downloadExcelExport(product)` owns the dynamic `import('exceljs')` so ExcelJS (~1 MB) stays out of the initial bundle and loads on demand. Theme group header rows span all 9 columns via `mergeCells` (called before setting value/style). % Complete cells are conditionally filled: green (`FFD1FAE5`) at 100%, yellow (`FFFEF3C7`) for partial progress. Notes column (width 80) uses `wrapText: true` + `vertical: 'top'` alignment on data cells only.

18. **Workspace reconciliation** — Each browser gets a persistent workspace token (`rp_workspace_id` in localStorage, generated once via `getWorkspaceId()`). Products carry `_originRef` (set at creation, preserved across imports) for data provenance tracking. `_storageRef` is injected at export time from the current workspace token for cross-session identification. `appendChangeLogEntry()` maintains a capped (500-entry) structural operation log (`_changeLog`) for export pipeline diagnostics. Export Attribution preferences (`exportName`, `exportId`) are stored in `rp_app_preferences` and injected as `_exportedBy`/`_exportedById` at export time for team workflow traceability.

20. **Crosslink transport to SPERT Forecaster (v0.53.0)** — `sendToForecaster.ts` hands a project
directly to a Forecaster tab in the same browser, replacing the JSON download/upload round trip.
`window.open` targets Forecaster with `?crosslink=storymap&xid=…`, then the export is transferred
over `postMessage`: `OPEN → OFFER → ACK|NACK`, keyed on `opcode` / `protocol` / `exchangeId`.
`crosslinkProtocol.ts` holds the handshake as a **pure reducer**, which is what makes the state
machine testable without a browser (jsdom's `window.open` returns `undefined`, so the real one is
injected via `SendDeps`).
**The JSON download is retained deliberately** — `postMessage` is same-browser only, so the file
remains the cross-device path; removing it would remove a capability.
`sendToForecaster` **returns reasons and never throws**, matching `downloadForecasterExport`: a
malformed sprint date throws out of the builder while a blocked popup is the house `if (!w) throw`
pattern, so a single try/catch would tell a popup-blocked user their sprint dates are invalid.
Both paths serialise through the **one** `serialiseForecasterExport`, so the bytes Forecaster
receives are identical to the bytes the file would have contained.
`window.opener` is the transport, so the `window.open` deliberately omits `noopener`/`noreferrer`
— unlike every other `_blank` in this app.
