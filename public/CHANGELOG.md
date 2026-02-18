# Changelog

## Version 0.12.0 (2026-02-18)

### Added
- **Export attribution** — New section in Settings for attaching name and identifier to JSON exports for team workflow traceability
- **Workspace reconciliation tokens** — Exports include `_originRef` and `_storageRef` for cross-session data provenance tracking and localStorage hydration recovery
- **Export pipeline diagnostics** — Products maintain a lightweight `_changeLog` of structural operations for client-side telemetry

### Technical
- New localStorage key `rp_workspace_id` for deterministic workspace binding
- `_originRef` set at product creation, preserved across imports for data lineage
- `_storageRef` injected at export time from workspace token
- `appendChangeLogEntry()` utility with 500-entry cap
- Audit trail logging in `useProductMutations` (add/delete operations)

## Version 0.11.3 (2026-02-16)

### Fixed
- **Size picker truncation** — Size dropdown in Structure view was clipped by the theme card's `overflow-hidden`. Dropdown now renders via portal to `document.body` with viewport-aware positioning (flips above when near bottom edge)

### Added
- **Release rename on Release Planning** — Double-click a release column header to rename it inline. Uses the same `useInlineEdit` hook as the Story Map. Dragging remains on single-click; editing disables drag while active

## Version 0.11.2 (2026-02-15)

### Improved
- **Import warnings** — Both dashboard and Settings import now use a proper confirmation dialog instead of browser `confirm()`. Dashboard warns when overwriting an existing project by ID; Settings warns that all project data (themes, backbones, rib items, releases, sprints, progress history) will be permanently replaced
- **Import/export labeling** — Dashboard button renamed to "Import Project"; Settings button renamed to "Import Project from JSON" with a subtitle clarifying scope: "Export and import this project's data"

## Version 0.11.1 (2026-02-15)

### Fixed
- **Settings dark mode** — Description textarea was missing dark mode classes, appearing as a white box in dark theme

### Refactored
- **DRY mapMutations.js** (443 → ~310 LOC) — Extracted `transferAllocation`, `moveRibBetweenBackbones`, and `applyAllocationTransfer` helpers, eliminating 4× duplication of allocation-transfer logic across `moveRibToRelease`, `moveRib2D`, `moveRibs2D`, and `ReleasePlanningView`
- **Extracted GroupSummaryHeader** — Moved from inline definition in `ProgressTrackingView.jsx` to `src/components/progress/GroupSummaryHeader.jsx`
- **Extracted formatDate utility** — Moved to `src/lib/formatDate.js`, imported directly by `SprintSummaryCard`, `ProgressRow`, and `CommentPanel` instead of prop drilling through 3 layers
- **Unified stats computation** — Extracted `computeItemStats` in `calculations.js`, shared by `getThemeStats` and `getBackboneStats`
- **Improved formatDate** — Added `isNaN` guard for invalid date strings

### Technical
- New file: `src/lib/formatDate.js` — shared date formatting utility
- New file: `src/components/progress/GroupSummaryHeader.jsx` — extracted collapsible group header component
- New test file: `src/__tests__/formatDate.test.js` (4 tests)
- Added `transferAllocation` tests in `mapMutations.test.js` (5 tests)
- Added `computeItemStats` tests in `calculations.test.js` (2 tests)
- 281 tests total across 13 test files

## Version 0.11.0 (2026-02-15)

### Added
- **Export for SPERT Forecaster** — One-click export from Settings transforms Story Map data into the SPERT Release Forecaster's import format. Maps releases to milestones (incremental backlog sizes), computes per-sprint velocity via delta-percent math, and outputs a ready-to-import JSON file
- **Collapsible group summaries (Progress tab)** — Group headers now show item count, total points, % done, and a mini progress bar. Click to collapse/expand groups for focused scanning. Stats use allocation-weighted percent for release groups and item-weighted average for backbone/theme groups
- **Release column progress bars** — Release Planning tab column headers now display a progress bar with % complete for each release

### Technical
- New file: `src/lib/exportForForecaster.js` — pure transformation functions (`buildForecasterExport`, `downloadForecasterExport`) + date utilities
- New test file: `src/__tests__/exportForForecaster.test.js` (39 tests) covering milestones, sprint mapping, delta-percent velocity, edge cases, and full integration scenario
- `ProgressTrackingView.jsx` — Added `GroupSummaryHeader` component with `collapsedGroups` Set state (resets on groupBy/sprint change)
- `ReleaseColumn.jsx` — Added `ProgressBar` in column header (guarded by `stats.percentComplete !== undefined`)
- `ReleasePlanningView.jsx` — Passes `percentComplete` via `getReleasePercentComplete` in release stats
- `SettingsView.jsx` — Added emerald "Export for SPERT Forecaster" button
- 270 tests total across 12 test files

## Version 0.10.0 (2026-02-15)

### Added
- **User-selectable theme colors** — Click the color swatch next to a theme name in Structure view to choose from 8 colors (blue, teal, violet, rose, amber, emerald, indigo, orange). Colors apply to theme and backbone headers on the story map
- **Delete release in Release Planning** — Delete button on release column headers with same constraint as the Map tab (must move all items out first). Disabled state shows fast 200ms tooltip explaining why
- **Progress table improvements** — Sprint column values display with `%` suffix; Points column shows done/total fraction (e.g. `18/20`); "Target" column renamed to "Alloc" for clarity
- **Settings date labels** — Sprint dates labeled "Finish" and release dates labeled "Target" to clarify their purpose

### Fixed
- **Map rib card reorder** — Rib cards on the story map can now be reordered within a release lane and placed precisely when dragged across columns/releases. Fixed layout not respecting `releaseCardOrder`, per-column vs global index translation in card order mutations, and layout instability when `releaseCardOrder` was previously empty or sparse
- **Sizing board card placement** — Rib cards on the sizing board now land exactly where the insertion indicator shows. Added `sizingCardOrder` to persist ordering within size columns and the unsized zone; same-column reorders and cross-column moves both respect insertion position

### Refactored
- Decomposed `StructureView` (413→228 LOC) — extracted `BackboneSection` and `RibRow` into `src/components/structure/`
- Centralized theme color definitions in `src/lib/themeColors.js` — single source of truth for 8-color palette used across Structure view, story map headers, and backbone dots

### Technical
- New file: `src/lib/themeColors.js` — `THEME_COLOR_OPTIONS`, `getThemeColorClasses()`, `DEFAULT_THEME_COLOR_KEYS`
- New files: `src/components/structure/RibRow.jsx`, `src/components/structure/BackboneSection.jsx`
- `mapMutations.js` — Added `spliceCardOrderByColumn` and `getColumnRibIds` helpers for backbone-aware card order insertion
- `useMapLayout.js` — `computeLayout` now sorts cells by `releaseCardOrder`
- Added `themeColors.test.js` (9 tests) for color palette and fallback logic
- Added `reorderTheme` tests (5 tests) and rib drag placement tests (18 tests) in `mapMutations.test.js`
- Added end-to-end rib drag tests verifying full flow: computeLayout → computeInsertIndex → mutation → computeLayout → verify
- `useSizingLayout.js` — `computeSizingLayout` now sorts cells by `sizingCardOrder`
- `useSizingDrag.js` — Drag end commits both size change and card order in a single `updateProduct` call
- Added `sizingLayout.test.js` (7 tests) for sizing card order sorting and cell placement
- 231 tests total across 11 test files

## Version 0.9.0 (2026-02-14)

### Added
- **Dark mode** — Full dark mode support across all views, components, and charts with appropriate contrast ratios
- **Theme toggle** — Sun/moon icon button on the homepage and inside product views to switch between light and dark modes
- **System preference detection** — Defaults to the user's OS-level `prefers-color-scheme` setting on first visit
- **Theme persistence** — User's light/dark preference saved to localStorage and restored on subsequent visits
- **FOUC prevention** — Synchronous inline script in `<head>` applies the `.dark` class before React renders, preventing flash of unstyled content

### Technical
- Tailwind CSS 4 dark mode via `@custom-variant dark (&:where(.dark, .dark *))` with `.dark` class on `<html>`
- 2 new files: `src/hooks/useDarkMode.js`, `src/components/ui/ThemeToggle.jsx`
- 38 files updated with `dark:` Tailwind variants across all UI components, page views, and layout files
- Recharts components use conditional hex colors via `useDarkMode()` hook (grid, axis, tooltip, fill colors)

## Version 0.8.0 (2026-02-14)

### Added
- **Sizing View** — New tab for bulk-sizing rib items via drag-and-drop into t-shirt size columns (XS–XXXL). Unsized items live in a top grid zone; sized items stack in labeled columns with point values and count badges
- **Locked sizing cards** — Rib items with progress (in-progress or done) are visually dimmed and cannot be re-sized, preventing accidental changes to active work
- **Release management on Map** — `+ Release` buttons on each release divider and the unassigned lane; releases insert at the clicked position with correct ordering
- **Delete release on Map** — Single-click a release label to open the detail panel; "Delete Release" button is disabled while rib items are allocated (must move them out first), enabled when empty
- **Release detail panel on Map** — Single-click a release label to view progress, points breakdown, scope counts, and inline-edit the name (previously only accessible via code)
- **Inline release rename on Map** — Double-click a release label to rename it directly on the map (uses shared `useInlineEdit` hook)

### Fixed
- **Canvas panning under release labels** — Blank area below release label text no longer blocks panning (fixed with `pointer-events-none` container and `pointer-events-auto` on label only)
- **Consistent add-button styling** — All `+` buttons on the map (Theme, Backbone, Rib, Release) now use unified blue styling

### Technical
- 4 new files: `useSizingLayout.js`, `useSizingDrag.js`, `SizingContent.jsx`, `SizingView.jsx` in `src/components/sizing/` and `src/pages/`
- Sizing layout reuses `MapCanvas`, `DragGhost`, `forEachRib`, `getRibItemPoints`, `getRibItemPercentComplete`
- `addReleaseAfter(afterReleaseId)` mutation added to `useProductMutations` for positional release insertion
- `deleteReleaseFromProduct` from `settingsMutations.js` reused for map-based release deletion
- Click/double-click disambiguation on release labels (200ms timer pattern)

## Version 0.7.0 (2026-02-14)

### Added
- **Map CRUD** — Create and delete themes, backbones, and rib items directly on the story map without switching to the Structure tab
- **Delete with confirmation** — All × delete buttons (rib, backbone, theme) show a confirmation dialog before deleting; theme/backbone dialogs warn about cascading child deletion
- **Multi-select keyboard delete** — Shift+click to select multiple rib cards, then Delete/Backspace to remove all at once (no confirmation, undoable with Cmd/Ctrl+Z)
- **Add buttons on map** — `+ Theme` and `+ Backbone` buttons after the last column; `+ Rib` button at bottom of each backbone column
- **Backbone drag insertion bar** — Vertical blue line shows where backbone will be placed when dragging between positions
- **Theme drag-and-drop** — Grab handle on theme headers to reorder themes left/right with insertion indicator

### Fixed
- **Release lane labels** — Labels now use the shared `LANE_LABEL_WIDTH` constant (widened to 160px) instead of a hardcoded 106px that truncated release names
- **Rib card category label** — Changed "N-C" to "Non-Core" for clarity

### Refactored
- Centralized delete logic (`deleteTheme`, `deleteBackbone`, `deleteRib`, `deleteRibs`) in `useProductMutations` hook — StructureView now delegates to shared methods

## Version 0.6.0 (2026-02-14)

### Added
- **Error Boundary** — Wraps the app router; catches render crashes and shows a reload button instead of white-screening
- **Save flush on tab close** — `flushPendingSaves()` fires on `beforeunload`, preventing data loss from the 500ms debounce window
- **Storage quota awareness** — Red banner appears in ProductLayout when localStorage writes fail ("Storage full — export your data")

### Refactored
- Created `forEachRib` / `reduceRibs` utilities — replaces 12+ manual triple-nested loops across the codebase
- Rewrote 10 functions in `calculations.js` (458→320 LOC) using `reduceRibs`
- Extracted `ReleaseColumn` component from `ReleasePlanningView` (429→355 LOC)
- Decomposed `ProgressTrackingView` (606→395 LOC) — extracted `SprintSummaryCard`, `BurnUpChart`, and `ProgressRow` into `src/components/progress/`
- Extracted `CollapsibleSection` into reusable `src/components/ui/CollapsibleSection.jsx`
- Moved `addRelease` and `addSprint` into `useProductMutations` hook — eliminates duplication across 3 views
- Extracted `readImportFile()` shared utility to deduplicate file import in ProductList and SettingsView
- Extracted cascade deletion as pure functions in `src/lib/settingsMutations.js` (`deleteReleaseFromProduct`, `deleteSprintFromProduct`, `releaseHasAllocations`)
- Replaced manual stats loop in StructureView with `reduceRibs`

### Fixed
- **Map panning** — Switched from whitelist (`data-map-bg`) to blacklist approach so panning works when clicking release lane backgrounds, column dividers, and other non-interactive areas
- **2D rib drags** — Rib cards now move freely in both X (backbone) and Y (release) axes simultaneously using `moveRib2D`; removed axis-lock that restricted movement to one direction
- **Insertion indicator** — Wired up `InsertionIndicator` component and `insertIndex` computation so a blue line shows where cards will land during drag
- **Multi-select and bulk drag** — Shift+click to select multiple rib cards; drag any selected card's grip to move all selected items together via `moveRibs2D`; selected cards show blue ring highlight
- **Drag ghost** — Card-stack preview follows cursor during rib drags showing up to 3 names
- **Rib detail panel inline edit** — Click the rib name in the detail panel to rename it; Escape while editing cancels without closing the panel
- **Missing `onRenameRib` prop** — Restored the prop on `MapContent` so double-click rename on map rib cards works
- **Click event forwarding** — `RibCell` now passes the click event to the handler so Shift+click detection works
- `parseInt` calls missing radix parameter in SettingsView size mapping
- Sprint cadence input NaN fallback (empty input now defaults to 2 weeks)

### Technical
- Added `settingsMutations.test.js` (12 tests) for cascade deletion coverage
- Added `duplicateProduct` edge case tests (4 tests) in `storage.test.js`
- Added `getReleasePercentComplete` sprint history tests (4 tests) and `getSprintSummary` non-core breakdown tests (2 tests) in `calculations.test.js`
- Added `ribHelpers.test.js` (6 tests) for `forEachRib` / `reduceRibs`
- 156 tests total across 8 test files

## Version 0.5.0 (2026-02-14)

### Refactored
- Decomposed `ProgressTrackingView` (743→634 LOC) into `ProgressRow`, `SprintSummaryCard`, and `CollapsibleSection` sub-components
- Extracted `CommentPanel` into `src/components/progress/CommentPanel.jsx`
- Created `src/lib/progressMutations.js` — shared `updateProgress`, `removeProgress`, `updateComment` mutations eliminate triple-nested traversal duplication across views
- Shared `calculateNextSprintEndDate` helper replaces duplicated sprint date logic in ProgressTrackingView and SettingsView
- Extracted `spliceCardOrder` helper in `mapMutations.js` — consolidates 4 duplicated card-order splice patterns
- Added `moveRib2D` and `moveRibs2D` — atomic combined backbone + release move mutations for story map drag-and-drop

### Fixed
- Fixed setState-during-render bug in ProgressTrackingView comment draft initialization (replaced `setTimeout` with proper `useEffect`)

### Technical
- Added `progressMutations.test.js` test suite (15 tests); 128 tests total across 6 files
- Cleaned up 9 macOS "copy 2" duplicate files from storymap directory
- Added `.gitignore` pattern to prevent future macOS duplicates

## Version 0.4.0 (2026-02-14)

### Features
- **Interactive Story Map** — New visual story map tab with pan/zoom canvas showing themes, backbones, and rib items laid out in a 2D grid by release
- **Drag-and-drop on map** — Drag rib items between releases (Y-axis) and between backbones (X-axis) with position-aware drops; drag backbones between themes
- **Inline rename on map** — Click to rename themes and backbones directly on the story map headers
- **Rib detail panel** — Click a rib card to open a slide-out panel with size, category, allocation breakdown, progress, and click-to-edit name
- **Release detail panel** — Click a release label to view progress, points breakdown (total/core/non-core), scope counts, and inline-edit the release name
- **Undo/redo** — Ctrl+Z / Ctrl+Shift+Z (Cmd on Mac) with a 30-level in-memory snapshot stack for all map operations
- **Settings improvements** — Enhanced settings page layout and product list UX

### Bug Fixes
- **Map panning** — Fixed panning not working when clicking empty space inside the map (switched from whitelist to blacklist approach for interactive elements)
- **Release label click** — Fixed pointer capture swallowing clicks on release labels
- **Allocation modal** — UI refinements for release allocation editing

### Technical
- 14 new components in `src/components/storymap/` (MapCanvas, MapContent, RibCell, BackboneHeader, ThemeHeader, ReleaseDivider, UnassignedLane, DropHighlight, RibDetailPanel, ReleaseDetailPanel, useMapLayout, useMapDrag, useInlineEdit, mapMutations)
- Pointer-event-based drag system with axis detection and window-level event listeners
- `releaseCardOrder`-aware layout sorting for consistent card positioning
- 103 tests across 5 test files (calculations, layout, mutations, storage, product mutations)
- Vitest test runner added to project

## Version 0.3.0 (2026-02-13)

### Features
- **Per-release progress tracking** — Progress is now tracked per-release per-sprint instead of globally per-rib. Split-allocated items show separate rows for each release with target ceiling enforcement
- **Assessment notes** — Expandable rows in the progress table let teams capture reasoning for each sprint's progress assessment, with auto-timestamped history shown newest-first
- **Expand All / Collapse All** — Toggle button to open or close all comment panels at once for scanning notes across the board
- **Multi-expand** — Multiple rows can be expanded simultaneously (previously only one at a time)
- **Alphabetical sorting** — Progress table items sorted by backbone → rib name (release grouping) or rib name (backbone/theme grouping)
- **Allocation memo field** — Each release allocation line can carry a free-text memo

### Bug Fixes
- **Progress input clearing** — Clearing a sprint progress value now removes the entry entirely instead of writing 0, fixing broken delta calculations
- **Comment-preserving clear** — When clearing progress on a row with an assessment note, the note is preserved (progress set to 0 instead of deleting)

### Technical
- Schema version bumped to v2 with waterfall migration for legacy progress entries
- `progressHistory` entries now include optional `comment` and `updatedAt` fields
- `removeProgress` function for clean entry deletion
- `expandedRows` changed from single string to Set for multi-expand support
- Updated `ARCHITECTURE.md` and `CLAUDE.md` with new patterns

## Version 0.2.0 (2026-02-13)

### Features
- **About Page** — Purpose, data security, author info, GitHub link, license, and warranty disclaimer
- **App Branding** — Renamed to "SPERT® Story Map" with registered trademark symbol
- **Dismissible Warning** — localStorage warning banner can now be closed (reappears on next visit)

### Bug Fixes
- **Duplicate product** — `releaseCardOrder` now correctly remaps release and rib IDs
- **Progress history** — `getProgressOverTime` and `getReleaseProgressOverTime` now use `getRibItemPercentCompleteAsOf()` for correct sprint ordering
- **Delete cleanup** — Deleting ribs, backbones, themes, and releases now cleans stale IDs from `releaseCardOrder`
- **Progress input** — Clearing the sprint progress field now sets value to 0 instead of being ignored

### Technical
- Extracted `RibCard` and `AllocationModal` into `src/components/releases/`
- Created shared `useProductMutations` hook for DRY hierarchy updates
- Added documentation: `ARCHITECTURE.md`, `CLAUDE.md`, `CHANGELOG.md`
- Added footer with version link and changelog page (reads `CHANGELOG.md` at runtime)
- Removed unused `App.css` and `@dnd-kit` packages

## Version 0.1.0 (2026-02-13)

### Features
- **Story Map Structure** — Three-level hierarchy (Theme, Backbone, Rib Item) with inline editing, drag-to-reorder, and collapsible sections
- **Release Planning** — Kanban-style board with drag-and-drop assignment, split allocations across multiple releases, and column reordering
- **Progress Tracking** — Sprint-by-sprint progress entry with burn-up chart, release progress bars, and sprint-aware historical views
- **Insights Dashboard** — Project analytics with core/non-core breakdown, sizing distribution, release comparison charts, and attention items
- **Settings** — T-shirt size mapping, release management, sprint management, and JSON import/export
- **Product Management** — Create, duplicate, import/export, and delete products from a central home page
- **LocalStorage Persistence** — All data saved locally with debounced writes and immediate save for critical operations

### Technical
- React 19.2.4 with Vite 7.3.1 and Tailwind CSS 4.1.18
- Recharts 3.7.0 for data visualizations
- Native HTML5 drag-and-drop (no external DnD library)
- Pure calculation functions with sprint-aware progress computation
- Shared `useProductMutations` hook for DRY hierarchy updates
