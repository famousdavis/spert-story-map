# Changelog

## Version 0.39.0 (2026-06-03)

Cards now move the same way on both the Map and Sizing tabs, and release lanes on the Map can be collapsed.

**Unified card gesture (Map + Sizing tabs)**

- **Click a card to open it; click-and-hold anywhere to move it — identical on both tabs.** Previously the Map tab required grabbing a small "⠿" handle to move a card, while the Sizing tab let you drag from anywhere but had no click action. Now both behave the same: a single click opens the card's editor (the detail panel on the Map, the edit dialog on Sizing), and pressing and dragging anywhere on the card body moves it. You no longer have to remember which tab you're on to know how a card behaves.
- **The Map card grip is gone, and the layout was tidied to fit more of the title.** With whole-card dragging, the drag handle was redundant, so it's been removed. The color swatch moved to the top-right corner alongside the clone and delete icons, freeing the left column so longer rib names show a little more before truncating.
- **Locked Sizing cards are now clickable to edit.** Cards with progress still can't be dragged (to protect historical points/percentage math), but you can now click one to open its editor and adjust the name, description, category, or notes.
- An 8px click-vs-drag threshold keeps a normal click from being mistaken for a move, and a click immediately after a drag won't accidentally open the editor. Inline double-click-to-rename on Map cards still works (a sloppy double-click that drifts more than 8px becomes a move instead — undo with Ctrl+Z).

**Collapsible release lanes (Map tab)**

- **Collapse a release lane to hide its cards; expand it to show them again.** Each release label now has a ▸/▾ toggle. When you're populating later releases, collapse the earlier ones you've already filled so the Unassigned lane sits right under the backbone column headers — making it far easier to line up unassigned items with the right backbone without scanning past everything.
- **A collapsed lane shows its name and card count** (e.g. "Release 2 (12)") so you still know what's inside at a glance.
- **A "Collapse releases" / "Expand all" button** in the top-right controls collapses every release lane at once (the Unassigned lane always stays open). It appears only when you have two or more releases.
- **Drag-and-drop still works with collapsed lanes:** drop a card onto a collapsed lane and it automatically expands so you can see where the card landed. The "+ Release" and delete controls are hidden on a collapsed lane — expand it first to use them. Collapsing a lane closes the detail panel if its card was open.
- Collapse state is remembered per project as you move between tabs (it resets when you close the browser).

**Under the hood**

- A shared `isInteractiveChild` helper (`src/lib/domHelpers.ts`) gates both tabs' card gestures so presses on buttons, the inline-edit field, or the kebab menu never start a drag or open the editor. The color-picker popover now stops click propagation, fixing a latent case where picking a color could also open the card behind it.
- Map layout (`computeLayout`) takes an optional list of collapsed release ids; collapsed lanes get a fixed 30px height and emit no cells or "+ Rib" buttons, and the existing cumulative-Y layout reflows everything below automatically. Drop-to-expand reads the drop target from the live drag state and batches the expand with the move (no flicker); selection cleanup and the bulk toggle are small pure helpers (`collapseHelpers.ts`). New unit tests cover the gesture guard, the collapse helpers, and the collapsed-lane layout math.

## Version 0.38.0 (2026-06-02)

Card color palette fix — the gold "amber" flag was too close to yellow to tell apart.

**Amber replaced with a true orange**

- **The card color palette is now red / orange / yellow / green / blue / purple / gray.** The previous "amber" swatch rendered as a gold tone almost identical to yellow, which made two color-coded meanings hard to distinguish in the legend and on cards (reported during a live sizing session). Amber has been replaced with a clearly distinct orange, so every pair in the 7-color palette is now unmistakable. (The green option — emerald — was always there; it only shows in the legend once you apply it to a card.)
- **Your existing amber cards become orange automatically — nothing is lost.** Any card you'd already flagged amber is migrated to orange on load, and the legend label you typed for amber carries over to orange. The conversion is idempotent and applies in both local and cloud storage, as well as on JSON import (legacy amber files normalize to orange). If a project somehow had both an amber and an orange label, the orange one wins.
- **Under the hood.** `ribCardColors.ts` now exports a `LEGACY_CARD_COLOR_ALIASES` map (`amber → orange`), a `resolveCardColorKey` helper, and a pure idempotent `migrateCardColors(product)` that rewrites rib `cardColor` flags and `cardColorLabels` keys. It runs at the two `useProduct` state boundaries (initial load + cloud echo) and inside `validateProduct` for imports. Alias lookups are own-property-guarded so `constructor` / `__proto__` keys can't resolve to prototype members. The Tailwind classes for amber elsewhere (e.g. the Sizing tab's "L" size-column header) are unrelated and unchanged.

## Version 0.37.0 (2026-06-02)

A dynamic color legend for the Map and Sizing tabs, plus a fix for modals closing when you drag outside them.

**Card color legend (Map + Sizing tabs)**

- **A legend now appears when you color-code cards, and you can name each color.** During sizing exercises you may use card colors to mean different things — e.g. one color for "defer for later discussion," another for "might not be needed at all." A small legend now floats in the bottom-right corner of both the Map and Sizing tabs, listing every color currently applied to at least one card with an editable text field next to each. Type the meaning of a color once and it shows in the legend on both tabs.
- **Shared across tabs.** Labels are stored on the project (`cardColorLabels`), so a label you set on the Sizing tab appears on the Map tab and vice-versa. Edit-in-place: click a label, type, and it commits on blur (or Enter). Escape reverts the current edit.
- **Dynamic and self-hiding.** The legend only lists colors actually in use — color a card and its row appears; remove the last card of a color and that row disappears. When no card is colored at all, the legend is hidden entirely. It's collapsible (click the × to shrink it to a small "Legend" pill; click the pill to expand), and the open/collapsed state is remembered per project as you navigate between tabs.
- **Under the hood.** New shared `CardColorLegend` component in `src/components/ui/`, rendered as a sibling of the canvas so it stays fixed in the corner instead of panning/zooming with the map. Labels are committed via a new `setCardColorLabel` mutation and buffered with `useBufferedField` so cloud-sync echoes can't scramble mid-type input. The new field is allowlisted and sanitized in `validateProduct` (known color keys only, non-empty strings, capped at 80 chars, prototype-pollution keys rejected).

**Bug fix — modals no longer close when a drag ends outside them**

- **Resizing the Notes box or selecting text in a modal no longer makes the modal vanish.** In the Sizing tab's Edit dialog (and every other modal), if you grabbed the Notes textarea's resize handle and dragged past the edge of the dialog, or started selecting text inside a field and released the mouse button outside the dialog, the whole modal would disappear — losing your resize or your selection. The cause: a browser `click` event fires on the nearest common ancestor of where the mouse went *down* and *up*, so a drag that started inside the card but ended on the dark backdrop resolved its click to the backdrop and triggered "click outside to close." The shared `Modal` now tracks where the press *started* and only closes when both the press and release happen on the backdrop itself. Resized boxes keep their shape and text selections survive a release outside the modal. Fixed once in `Modal.tsx`, so it applies to every dialog in the app.

## Version 0.36.1 (2026-05-28)

Bug fix — Sizing tab insertion indicator was rendering in the wrong vertical position.

**Fix**

- **Insertion indicator in the unsized zone now lands between cards instead of inside the Excel-style header strip.** When dragging a card into the unsized grid, the blue horizontal line that shows where the card will land was using zero as its origin — but the cells themselves render below the column-letter strip and to the right of the row-number gutter. The result: the indicator was offset by the full strip height vertically (above the column letters) and by the full gutter width horizontally. The bug was introduced silently in v0.35.0 when the Excel-style headers were added (16px strip / 28px gutter, so the misalignment was easy to overlook) and became visibly worse in v0.36.0 when the headers were enlarged (24px strip / 36px gutter). Indicator coordinates now include the `LETTER_STRIP_HEIGHT` and `NUMBER_GUTTER_WIDTH` offsets, mirroring how `useSizingLayout` places the cells themselves. The sized-column branch of the same component was already correct (it uses `col.x` and `sizeColumnsY`, which carry the offsets) and is unchanged. While I was in the function, collapsed two identical `else` branches into a single ternary — no behavior change.

## Version 0.36.0 (2026-05-28)

UX polish — conventional zoom button order, drag-edge auto-scroll on Map and Sizing tabs, and larger Excel-style headers on the Sizing grid.

**Zoom controls**

- **Minus on the left, plus on the right.** Swapped the order of the `−` / `+` zoom buttons on both Map and Sizing tabs to match the conventional left-to-right "less → more" arrangement most apps use. Keyboard shortcuts (`+` / `−` / `0` for fit) and the percentage label between the buttons are unchanged. Single edit in `MapCanvas`, which both tabs share.

**Drag-edge auto-scroll on Map and Sizing tabs**

- **Drag a card to the edge of the canvas and it scrolls automatically.** Previously when you grabbed a rib / backbone / theme / release card and dragged it toward the edge of the viewport, you hit a brick wall — to drop the card somewhere currently off-screen you had to first release, pan the canvas, then start the drag over. Now when the pointer enters a 60-pixel band along any edge during an active drag, the canvas pans automatically in that direction, scaled to how close to the edge you are: a slow creep at 60px in, faster the deeper you go, capped at 20 pixels per frame. Both axes work independently — diagonal corner drags pan in both X and Y. The instant the pointer leaves the edge zone or you release the card, panning stops. Applies to all four Map drag types (rib, backbone, theme, release) and the Sizing tab's rib drag.
- **How it works.** New `useEdgeAutoPan` hook in `src/hooks/`. While drag is active, runs a `requestAnimationFrame` loop that reads the latest pointer position (kept fresh in a `dragPointerRef` exposed from both `useMapDrag` and `useSizingDrag`), measures distance from each edge of the canvas container, and updates `pan` via the existing setter. After each pan tick the hook synthesizes a `pointermove` event on the container so the drag hook re-runs hit-testing against the new pan — drop-target indicators stay accurate even when the user holds the pointer still in the edge zone. Pure delta math (`computeEdgeAutoPanDelta`) is exported separately for unit testing.
- **Release Planning unchanged.** Release Planning still uses native HTML5 DnD (a different mechanism); edge-scroll there will be a separate follow-up if requested.

**Sizing tab — bigger Excel-style headers**

- **Column letters (A, B, C…) and row numbers (1, 2, 3…) are now legible at a glance.** Previously the letter strip was 16px tall and the gutter was 28px wide, both using 10px font. The letters/numbers were physically smaller than the 14px card titles next to them, which made them hard to read on standard-DPI displays. Bumped letter strip height `16 → 24px`, gutter width `28 → 36px`, and header font from 10px to 14px semibold — same size as the card title text so the grid address is as readable as the card itself. Color stays neutral (`gray-500` / `dark:gray-400`) so the headers read as structure, not content. The "Unsized (n)" label tracks the strip's new height and gets a small bump in max-width to accommodate longer counts.

**Tests**

- `sizingLayout.test.ts` — updated `totalWidth` expectations from 644 → 652 (gutter went from 28 → 36, so `36 + 616 = 652` at minimum).

## Version 0.35.0 (2026-05-28)

UX polish — Sizing board canvas utilization, card color coding, Excel-style grid addressing, editable Description on the Map tab's detail panel, and quality-of-life fixes for the Sizing filter.

**Sizing tab — make better use of the canvas**

- **Sized columns now expand to fill the canvas.** Previously each size column was a fixed 200px-wide vertical strip — with only a few sizes (e.g. S/M/L) and many ribs, you got tall narrow columns and wasted horizontal canvas. Each size column zone now expands to fill its proportional share of the available width, and cards inside flow in a grid (multiple sub-columns) just like the unsized zone has always done. `computeSizingLayout` accepts a new optional `targetWidth` parameter; the hook reads container width via `ResizeObserver` and feeds it in. When `targetWidth` is unset or below the minimum stacked width, the layout falls back to the legacy 1-card-wide behavior (preserves back-compat for tests / SSR).
- **Grid-aware insertion indicator inside sized zones.** When dragging into a sized column, the blue insertion line now snaps to the grid position (row, sub-col) instead of vertical-only. Mirrors the unsized zone math for consistency.
- **Excel-style A/B/C column letters + 1/2/3 row numbers on the unsized grid.** With many unsized cards, you can now reference a specific card by its grid address (e.g. "B3"). Column letters render above each grid column in a 16px strip, row numbers render in a 28px gutter on the left. Letters use Excel-style addressing (`A`–`Z`, then `AA`, `AB`, …). The "Unsized (n)" label moves from the upper-left to the right edge of the letter strip so it doesn't fight for the `A` column position.
- **Card color coding on Sizing cards.** Each Sizing card gets a new `Color…` entry in its kebab menu (`Edit / Color / Split / Delete`). Selecting it opens the same `RibCardColorPicker` used on the Map tab; when a color is set, the card background is tinted via `RIB_CARD_COLOR_BG`. Color is an organizational flag independent of work state, so locked cards still get tinted.
- **Filter panel closes on outside click.** Clicking anywhere outside the Sizing filter panel (canvas, `+ Rib` button, a card) now collapses it — no more required re-click of the Filter button to dismiss. Same pattern as `RibCardColorPicker` and `KebabMenu`.

**Map tab — RibDetailPanel polish**

- **Description is now editable in the side panel.** Previously the field was only read-only when present (and entirely hidden when empty), so there was no signal that the field existed. The panel now has a collapsible `Description` section: header always visible (so the field is discoverable), expanded by default if the rib has a description, collapsed when empty. When collapsed-with-content, a single-line truncated preview shows next to the label. Uses `useBufferedField` for cloud-echo safety — same hook the v0.33.0 SettingsView fields use.
- **Panel widened from `w-80` to `w-96`** (320 → 384px) so Description and Notes both get meaningful room without one crowding the other.
- **Notes textarea migrated to `useBufferedField`** (drive-by) — same cloud-echo scramble fix the SettingsView fields got in v0.33.0.

**Tests**

- `sizingLayout.test.ts` — added 3 cases for the targetWidth-driven expansion: legacy 1-sub-col stacking at `targetWidth=0`, multi-sub-col packing at `targetWidth=1300`, and `totalWidth` clamping math (accounts for the 28px row-number gutter).

## Version 0.34.0 (2026-05-28)

UX polish — clickable logo home navigation and broader `+ Rib` affordance coverage on the Map tab.

**Navigation**

- **Logo links to home.** The SPERT favicon in both the homepage and per-project headers is now a `Link` to `/`. Clicking it returns to the projects list and scrolls to top — works as expected even on the homepage itself, where it acts as a refresh-and-scroll. Includes a focus-visible ring for keyboard users and an `aria-label` for screen readers.

**Map tab — `+ Rib` affordance**

- **`+ Rib` button now appears in every empty release×column cell.** Previously the hover affordance only rendered in an empty cell if the entire backbone column was empty across all lanes — meaning a half-filled column would leave its empty release rows with no way to add a rib without scrolling to the unassigned lane. Every empty cell under a release divider now hosts a `+ Rib` button at the top of the cell.
- **Longest column in the unassigned lane is no longer excluded.** The unassigned lane's height used to be sized exactly to fit its tallest column, leaving zero pixels below the last rib for a `+ Rib` button. The lane now reserves `ADD_BUTTON_RESERVED` (24px) below the rib stack when at least one rib is present, so the longest column gets the same affordance every other column gets.
- **Release lanes get the same treatment.** Release-lane heights also reserve 24px below the longest column's rib stack, so a `+ Rib` button sits below the last card in every column — including the one that determines lane height.
- **Simpler layout code.** The `emptyBackboneColIdx` exclusion set and `availableGap` / `MIN_GAP_HEIGHT` runtime guard are removed from `computeLayout`. Lane heights now guarantee room, so the gap-button loop just emits one entry per `(lane × column)` cell unconditionally — top of cell when empty, below last card when populated. New `ADD_BUTTON_RESERVED` constant is exported alongside the other layout constants.

**Tests**

- `computeLayout.test.ts` — updated lane-height expectation to account for the reserved button padding; added a new case asserting that a `+ Rib` button is emitted for every `(lane × column)` cell, including the longest unassigned column and empty release cells inside a partially-filled backbone.

## Version 0.33.0 (2026-05-24)

Cloud storage remediation — sign-out safety, debounce reduction, buffered inputs, per-user localStorage namespacing, Firestore mergeFields + atomic changelog, multi-subscriber error surface, and permission-denied recovery.

**Reliability**

- **Sign-out safety.** Driver teardown (cancel pending saves + detach Firestore listeners) now runs through a single-slot registry, guaranteed to complete before Firebase credentials are revoked. Prevents `PERMISSION_DENIED` toasts after a successful sign-out and prevents trailing writes from landing on the user's cloud doc after they believed they signed out. All three sign-out paths (UI button, ToS-stale, ToS-error) go through the same sequence.
- **Delete is now atomic.** `deleteProduct` (both local and cloud) cancels any pending debounced save for the product before deleting — a trailing write would otherwise resurrect the just-deleted doc. The local driver also cancels the products-index timer in the same atomic step.
- **Driver-swap flush.** `useProduct` now flushes pending saves to the outgoing driver on mode/uid changes — typing-in-progress when switching local↔cloud no longer disappears.
- **`pagehide` + `beforeunload`.** Mobile browsers fire `pagehide` reliably where `beforeunload` does not; both are now wired so up-to-200ms of typing is preserved on tab close.

**Performance**

- **Save latency cut by ~60%.** The old 500ms outer debounce in `useProduct` stacked on top of the driver's 500ms inner debounce produced ~1s of perceived input latency. The outer timer is removed and the inner debounce is reduced to 200ms; `lastSaved` is now mode-aware (optimistic for local, server-timestamped for cloud — no flash).
- **Batch export reads prefs once.** `exportAllProducts` now hoists a single Firestore preferences read and threads it through to each per-product `exportProduct` call via a `cachedPrefs` parameter (a cloud user exporting N projects used to incur N reads). Single-product export callers are unchanged.

**Input handling**

- **Buffered text inputs (`useBufferedField`).** Project name, description, release name, and sprint name in Settings now commit on blur, not on every keystroke. Mid-type cloud echoes can no longer scramble cursors or wipe pending characters. Date pickers and selects are intentionally unbuffered (their native commit semantics differ).
- **`InlineEdit` mid-edit sync fix.** External value updates no longer overwrite the editing draft — sync is gated on `!editing`.
- **`onProductChange` invariant documented.** Echoes are wholesale tree replacements; components that buffer user input must gate sync on focus state.

**Storage isolation**

- **Per-user localStorage namespacing.** Keys are now `rp:{uid}:product_<id>` / `rp:{uid}:products_index` / `rp:{uid}:preferences` (and `rp:local:*` when anonymous). The same browser can hold multiple users' caches without collision. `rp_workspace_id` is never namespaced (per-browser academic-integrity token must survive sign-outs).
- **One-time legacy migration.** Pre-v0.33.0 data at `rp_product_*` / `rp_products_index` / `rp_app_preferences` is migrated to `rp:local:*` in a top-level `await` before React mounts. Uses `navigator.locks` when available (exclusive across tabs); falls back to a 30s timestamp lock. Corrupt JSON preserves the old key and logs a warning rather than silently dropping data.
- **Sign-out clears only the active namespace.** A signed-out cloud user's anonymous-session data at `rp:local:*` survives — they get it back if they keep using the app without signing in.

**Firestore write semantics**

- **`mergeFields` replaces `merge: true`.** Saves now whitelist exactly which top-level keys can be written. Side-write fields (`_storageRef`, `_exportedBy`, `_exportedById`, `owner`/`members`/`_owner`/`_members` aliases) can no longer leak into Firestore via a routine save.
- **Atomic changelog (`arrayUnion`).** `_changeLog` is now excluded from `mergeFields` and written via a separate `updateDoc(_changeLog: arrayUnion(...newEntries))` that appends only entries new to the server. A smaller local log can no longer truncate the server's history.
- **`seq` nonce on every changelog entry.** A per-entry uniqueness token distinguishes same-second writes (notably bulk-deletes that share `op: 'delete'` / `entity: 'rib'` and omit `id`/`uid`/`source`) so `arrayUnion`'s structural dedupe doesn't collapse them. Validator allowlist updated; backward-compatible with pre-v0.33.0 imports.
- **Listener echo re-attaches `_members`.** Without this, the Sharing UI lost owner/editor/viewer discrimination 1-3s after every save when the snapshot arrived.

**Error surface**

- **Multi-subscriber `onSaveError`.** Both `ProductLayout` and `ProductList` can register independently — previously the second registration silently replaced the first. Returns an unsubscribe function so unmounting components don't leak setState targets.
- **Mode-aware save error banner.** Cloud failures show "Changes may not have saved. Check your connection." instead of the quota-focused localStorage message.

**Access denied recovery**

- **Cold-load and live `permission-denied`.** Both paths now redirect to the project list with a one-shot "You no longer have access to that project." banner. The live path unsubscribes the listener immediately so it can't keep firing. The cold-load path falls through to the existing "Project not found" UI for non-permission errors.
- **`onProductChange` accepts an optional `onError` callback.** Routes Firestore listener errors per-call when provided; falls back to the save-error subscribers when omitted.

## Version 0.32.1 (2026-05-24)

About page polish — renames the QRG download button to match the canonical label shared across all SPERT® Suite apps.

**About page**
- Renamed the QRG download button from `Quick Reference Guide (PDF)` to `Open Quick Reference Guide (PDF)` so the label matches the convention used by SPERT® Forecaster, MyScrumBudget, and SPERT® AHP.

## Version 0.32.0 (2026-05-20)

Level 4 Import — multi-project preview, conflict resolution, and import-as-copy.

**New features**

- **Multi-project import preview.** Pick a file on the project list homepage and review every project before anything changes. ID conflicts (definite match — same project ID) and name conflicts (probable match — same name, different origin) are detected with per-project resolution choices: skip, replace existing, or import as copy.
- **Bundle file import (bug fix).** "Export All Projects" previously produced a file that the Import button rejected with "Product must be a JSON object". Bundled exports are now fully importable via the project list homepage. Using a bundled file in Settings → Data → Import now shows a targeted message directing you to the homepage importer.
- **Import as copy.** Creates a new project with a disambiguated name, fully regenerated IDs for all nested entities (themes, backbones, rib items, releases, sprints, allocations, progress entries, card order maps), and a preserved audit history from the source file (matching the 'add' path).

**Improvements**

- **Cloud-mode import readiness.** Import button gated on Firestore data hydration, not just authentication. Prevents false "no conflicts" results during workspace loading.
- **Mid-write protection.** The Import button is disabled while an import is being applied, and the hook rejects file picks while writes are in flight.
- **Applying state.** Spinner shown while imports write. Cloud imports can take 1–3 seconds per project.
- **Result banners.** Confirms counts of added, replaced, copied, skipped. All-skip shows "N skipped" rather than silently doing nothing. Workspace-changed skips reported separately with the conflicting project's name.
- **Import failures surface in the banner.** Write errors during add, replace, and copy now appear in the import result banner (per-project), not silently in a separate global banner. Both local and cloud modes report failures correctly. Driver-level `createProduct` gained a `throwOnError` option for this path; existing callers retain best-effort semantics.
- **Replace protection (Firestore).** Cloud replace uses `runTransaction`, eliminating a concurrent-edit race. Original creation date (`createdAt`) and workspace fingerprint (`_originRef`) are preserved.
- **Identity field preservation (local).** Local replace reads the existing project before overwriting, preserving `createdAt` and `_originRef` so academic-integrity provenance is not laundered through a re-import.
- **DataSection cleanup.** Per-project replace (Settings → Data → Import) no longer forces a full page reload. Errors shown inline. Bundle files show a targeted message. Driver write failures surface as errors.

**Tests:** 23 new tests across 3 new files (`importUtils.test.ts`, `useImportState.test.ts`, `dataSection.test.tsx`) covering the parse → conflict → apply pipeline, the hook state machine, and the per-project replace surface. Total 554 → 577.

**Known limitations**

- Cloud mode always shows the preview — no one-click fast path even for conflict-free files (intentional: Firestore may still be loading).
- For multi-project cloud imports, writes are sequential and span several seconds. A concurrent peer edit during that window is not detected after the Layer 2 re-read.
- The per-project import in Settings → Data is not gated on cloud hydration (only the homepage importer is). Importing immediately after sign-in via this surface could theoretically overwrite stale data.
- After enabling cloud sync, wait for the dashboard to load your existing projects before importing. The homepage Import button enables once your projects are loaded.

## Version 0.31.3 (2026-05-14)

Bug fix: refreshing the browser on a deep route (e.g. `/product/<id>` or any nested tab like `/product/<id>/storymap`) no longer returns Vercel's generic `404: NOT_FOUND` page. The repo had no `vercel.json` and no SPA fallback, so Vercel treated parameterized routes as literal file requests and 404'd before React Router ever got a chance to resolve the URL. Added `vercel.json` with a catch-all rewrite to `/index.html` so all routes deliver the app shell and React Router takes over. Refresh now reloads cleanly on whatever route you're on — no need to bounce back to the project dashboard.

## Version 0.31.2 (2026-05-14)

Bug fix: name-tooltips no longer get stuck after using the color picker. The card's hover tooltip is dismissed via `mouseLeave` on the card div — but when the color-picker portal opens, the cursor never physically leaves the card's bounding box during picker interaction, so `mouseLeave` never fired and the tooltip stayed visible. Repeated across cards, the screen would accumulate a stack of stuck tooltips. Now the swatch click explicitly dismisses any visible tooltip and suppresses it while the picker is open.

## Version 0.31.1 (2026-05-14)

Selected rib card now stays visually anchored while its detail panel is open. Previously the blue border + ring only appeared for multi-selected cards (drag-select), so clicking a single card to edit it left no visual cue tying the open detail panel back to its source. Now the card whose detail panel is open keeps the same selection styling for the duration of the edit. No data changes; UI-only patch.

## Version 0.31.0 (2026-05-14)

Rib-card layout reshuffle + per-card color flagging on the Map tab.

- **New 3-column card layout.** Drag grip on the left now has a color-swatch button stacked below it (hover-only, like the clone/delete icons). Clone and delete icons moved to a vertical stack in the top-right corner, with clone on top (it's the more frequently used of the two). "Core" / "Non-Core" label is now anchored at the bottom-right corner, freeing the bottom row for points and percentage.
- **Per-card color flag.** Clicking the color-swatch button opens a small popover with 7 mid-tone colors (rose, amber, yellow, emerald, sky, violet, slate) plus a "clear" option. The chosen color shades the entire rib card so flagged cards stand out across the whole map — useful for triaging cards suspected of being unneeded so the team can locate them quickly at the next meeting. Cloning a colored rib carries the color over (matches the existing "shares everything" clone semantics; clear it manually if the slice no longer needs the flag).
- **Schema:** new optional `RibItem.cardColor` field. Validator allowlist updated; unknown color values are cleared non-destructively (matches the existing `size` validator pattern). No data migration needed — existing ribs default to no color.

4 new tests (clone inherits cardColor, clone omits when none, validator accepts known values, validator clears unknown values). Total 539 → 543.

## Version 0.30.0 (2026-05-14)

Map tab affordance overhaul.

- **Empty backbones now show a hover "+ Rib" affordance in every release lane and the unassigned lane.** Previously, a backbone with no rib items had no contextual way to add the first one — you had to scroll to the bottom of the map and click a persistent footer button. Now hovering any empty cell under such a column reveals "+ Rib" right there.
- **Persistent column-bottom "+ Rib" buttons removed.** The hover-reveal affordance (both the existing below-last-card variant and the new empty-cell variant) now covers every case, so the always-visible row at the map's footer was redundant clutter.
- **Clone icon on every rib card.** Hovering a rib card reveals a small "two squares" clone icon to the left of the delete ×. Click it to duplicate the rib in place — same size, category, description, notes, and release allocations as the original, with progress history starting fresh. The clone sits immediately below the original in every release lane it inhabits (and in the same size bucket on the Sizing tab). Smart naming: "Foo" → "Foo (1)", clone "Foo" again → "Foo (2)", clone "Foo (3)" → "Foo (4)". The new card opens in the detail panel with the name field focused, ready to tweak. Designed for the slice-a-rib-into-smaller-pieces workflow.

14 new tests covering `cloneRibInProduct` (525 → 539 total).

## Version 0.29.3 (2026-05-09)

Security audit wrap-up — bundles every remaining non-deferred audit finding (M1, M2, M3, L1, L3, L4) into a single Story Map release plus a companion canonical-rules patch (M4) in the Landing Page repo. No user-visible behavior change. Test count grows from 510 → 524.

### Security
- **XLSX formula-injection neutralizer in `exportForExcel.ts` (audit M1, CWE-1236).** A user naming a theme `=HYPERLINK(…)` previously produced a workbook that, when opened by a colleague, would evaluate the formula. New `safeCell()` helper prefixes any string starting with `=`, `+`, `-`, `@`, TAB, or CR with a single quote — Excel's documented opt-out for formula evaluation. Applied at every user-controlled string cell across both worksheets (project name, theme group header, theme/backbone/rib/notes/release-string in the data row, release name in the summary).
- **Per-entity field allowlists + prototype-pollution key rejection in `validateProduct.ts` (audit M2 + L4).** The previous validator only stripped unknown fields at the top level; nested objects (themes, backbones, ribs, releases, sprints, allocations, progress entries, changelog entries, sizeMapping rows) accepted arbitrary keys, and only `releaseCardOrder` / `sizingCardOrder` were guarded against `__proto__` / `constructor` / `prototype`. New `stripObject(obj, allowed)` helper applies a per-entity allowlist (`KNOWN_THEME_FIELDS`, `KNOWN_BACKBONE_FIELDS`, `KNOWN_RIB_FIELDS`, `KNOWN_RELEASE_FIELDS`, `KNOWN_SPRINT_FIELDS`, `KNOWN_ALLOCATION_FIELDS`, `KNOWN_PROGRESS_FIELDS`, `KNOWN_CHANGELOG_FIELDS`, `KNOWN_SIZEMAPPING_FIELDS`) and rejects prototype-pollution keys on every object. Changelog entries also now bound `op`/`entity`/`id`/`uid`/`source` strings to 128 chars; oversized values are dropped rather than rejected. 14 new test cases (510 → 524) cover unknown-field stripping per entity and `__proto__`/`constructor`/`prototype` rejection on theme, rib, and release.
- **Runtime role allowlist in `callSendInvitationEmail` (audit L1).** TypeScript types are erased at runtime, so `'editor' | 'viewer'` on `SendInvitationEmailInput.role` does not prevent a future code path or DOM-tampered call from sending `'owner'` or arbitrary strings. Added a synchronous validation step in the callable wrapper that throws `Invalid invitation role` before forwarding. Defense-in-depth: the CF must (and is assumed to) independently validate.
- **Driver-managed listener teardown (audit L3).** `firestoreDriver` now tracks every active `onProductChange` subscription in an internal `Set<Unsubscribe>` and exposes `tearDownListeners()`. `signOutCleanup` calls it after `cancelPendingSaves` and before `firebaseSignOut`, so listeners cannot fire `permission-denied` against a logged-out auth state and surface a misleading toast on the post-sign-out screen. The wrapped unsubscribers are idempotent — both `tearDownListeners()` and the consumer's React-effect-cleanup path remove the same listener exactly once. New no-op implementation in the local driver. New tests verify the call-order (`cancelPendingSaves` → `tearDownListeners` → `firebaseSignOut`) and the local-driver no-op shape.
- **Resend-cap dual-layer documentation (audit M3 — docs only).** No behavior change. `callables.ts` JSDoc now spells out that the 5/5 resend cap is enforced exclusively by the `resendInvite` Cloud Function, and that Firestore rules deny direct client writes to `spertsuite_invitations` (`allow write: if false`) so a UI bypass cannot increment `emailSendCount`. The matching `disabled={inv.emailSendCount >= 5}` site in `ProjectSharingPanel.tsx` gets a comment explaining "UX gate only — CF enforces" so a future maintainer doesn't strip the redundant check.

### Companion canonical-rules patch (Landing Page repo)
- **M4 — `spertstorymap_projects` field allowlist + payload size cap.** Adds `request.resource.data.keys().hasOnly([...])` to both `create` and `update` and a coarse `request.resource.data.size() < 900_000` guard on update. Same pattern as `spertscheduler_settings` (v0.22.2) and `users` (v0.22.2). See the Landing Page PR for the diff.

## Version 0.29.2 (2026-05-09)

Security audit hardening — Story Map app-side prerequisite for the suite-parity Firestore rules tightening landing in the Landing Page repo. No user-visible behavior change in production (the path under change is gated behind `INVITATIONS_ENABLED === false`, which is currently `true`).

### Security
- **Legacy single-add email lookup now bounded by `limit(1)` (audit L6/L7).** The flag-off "add member by email" form in `ProjectSharingPanel.tsx` previously issued an unbounded `query(collection(db, PROFILES_COL), where('email', '==', …))`. The companion canonical `firestore.rules` change restricts `spertstorymap_profiles` `list` permission to `request.query.limit <= 1` — matching the suite-wide pattern already in place for `spertahp_profiles` and `spertsuite_profiles` — to block bulk profile enumeration by any signed-in SPERT user. This commit adds `limit(1)` to the query so the legacy path remains rule-compliant if the feature flag is ever toggled. With `INVITATIONS_ENABLED = true` (current state) the legacy path is unreachable, so no production behavior change. Pairs with M5 (project create rule binds top-level `owner` to caller) in the same Landing Page rules patch.

## Version 0.29.1 (2026-05-09)

Maintenance refactor — no behavior change. Targeted decomposition of the Sharing panel and a small batch of type-annotation and signature cleanups. All 510 tests remain green.

### Internal
- **`InvitationSection` extracted from `ProjectSharingPanel.tsx`.** The flag-on bulk-invitation subsystem (8 state hooks, the `listPendingInvites` effect, `handleSendInvitations` / `handleRevoke` / `handleResend`, and the revoke `ConfirmDialog`) is now a self-contained sub-component declared below `MemberRow` in the same file. The parent retains member-CRUD state and handlers (`handleAddMember`, `handleRemoveMember`, `handleRoleChange`), the members-loading effect, all render gates, and the legacy single-email-input form for the flag-off path. Communication contract: `InvitationSection` receives `productId`, `driver`, `ownerStatus`, `members`, `onMembersUpdate`, and `onOwnerStatusError`. The post-send members-refresh failure path still hides the panel — `onOwnerStatusError()` advances the parent's `ownerStatus` to `'error'`, identical observable behavior to the previous inline `setOwnerStatus('error')`. Invitation-flow errors are now displayed via a local `inviteError` state inside the section; the parent's `error` state continues to serve member-CRUD failures only.
- **Explicit generics on `useState(null)` calls.** `members` (`Record<string, string> | null`), `owner` (`string | null`), `error` (`string | null`) in `ProjectSharingPanel`; `profile` (`{ displayName?: string; email?: string } | null`) in `MemberRow`.
- **Type annotations in `mapMutations.ts`.** `let ribData: RibItem | null = null` in `moveRibBetweenBackbones`; `let backboneData: Backbone | null = null` in `moveBackboneToTheme`; `const ids = new Set<string>()` in `getColumnRibIds`. Added `Backbone` to the type import.
- **Collapsed `enrichProduct` redundant dual-parameter signature in `ProductList.tsx`.** Was `enrichProduct(entry, full)` always called as `enrichProduct(p, p)`; now `enrichProduct(product)` with a single argument.

## Version 0.29.0 (2026-05-09)

Bulk-sharing retrograde audit — six confirmed gaps closed across the sharing UI, callable wrapper layer, invitation landing hook, and banner shell. PR 1 (driver hardening, v0.28.0 → unreleased) landed `removeCollaborator` three-guard `runTransaction` and `onProductChange` `_owner` re-attach. This release ships the correctness + hygiene pass.

### Fixed
- **OwnerStatus four-state enum in the Sharing panel (Lesson 60).** `ProjectSharingPanel` previously used a nullable `owner` string with a derived `isOwner` boolean; transient Firestore read failures silently rendered nothing, so a network blip during the initial load made the entire Sharing section disappear with no signal to the user. Replaced with `OwnerStatus = 'loading' | 'owner' | 'not-owner' | 'error'`. The `'error'` branch now surfaces a visible "Couldn't load sharing details. Refresh the page to try again." message inside the optional Section wrapper. Non-cloud mode still short-circuits before the status branches; non-owners and the loading window still render nothing.
- **Post-send refresh uses `Promise.allSettled` (Lesson 64).** The members + pending-invites refresh after a successful bulk-invite send was sequential `await`s — a rejection in the second call lost the first call's update. Now both calls run concurrently via `Promise.allSettled`; a members-fetch rejection sets `ownerStatus = 'error'` so the user sees the visible message, and a pending-fetch rejection only logs (the success chips remain visible). Single refresh site — `handleRevoke` and `handleResend` are single-fetch and were not affected.
- **Bulk-invite textarea preserved when no address is delivered (Lesson 43).** v0.27.1 cleared the textarea on any CF-success response, which included the case where every valid address came back in `result.failed[]` (CF rate-limited, all already-invited, etc.) — the user had to re-type every address to retry. New predicate gates the clear on `added.length + invited.length > 0` — only an actual delivery resets the field.
- **Centralized `requireFunctions()` callable guard (Lesson 61).** The four lazy callable getters (`getSendInvitationEmail`, `getClaimPendingInvitations`, `getRevokeInvite`, `getResendInvite`) returned `null` when `functionsInstance` was unavailable; downstream `await` on a null produced the SDK's opaque `TypeError: Cannot read properties of null (reading 'name')`. Replaced with a new `src/lib/callables.ts` module exporting async wrappers (`callSendInvitationEmail`, `callClaimPendingInvitations`, `callRevokeInvite`, `callResendInvite`) that go through `requireFunctions()`, which throws a meaningful `'Firebase Functions not initialized.'` error. Callers' existing `.catch` handlers now see the canonical message uniformly. `functionsInstance` is exported from `firebase.ts` for the new module.
- **Lazy `useState` initializer in `useInvitationLanding` (Lesson 66).** React 19 flagged the previous `useState('idle')` + `setState`-in-effect restoral as a `react-hooks/set-state-in-effect` violation. Replaced with a lazy initializer that reads `SESSION_KEY` synchronously on first render, eliminating the double-render on fresh page load with an invite token. Effect 1 (URL capture, strip, sessionStorage write, mode flip) cannot collapse — it performs DOM and storage side effects — and remains. Effect 2 narrowed to handle the `firebaseAvailable=false→true` async transition only. Canonical patterns A3 (SESSION_KEY gate, Effect 3), A4 (30-second grace timer, Effect 4), and `dismiss()` are unchanged.
- **InvitationBanner compact card width (Lesson 56).** Inner content wrapper changed from `max-w-4xl` (1024px strip) to `max-w-lg` (512px primary-CTA card). The outer color strip stays full-width by design. Both `pre_auth` and `claimed` render paths flow through the same shell.
- **`handleRemoveMember` surfaces the driver's guard messages (paired with PR 1 / Lesson 50).** PR 1 added the three-guard `runTransaction` to `removeCollaborator` and re-throws guard errors; this release replaces the generic "Failed to remove member. Please try again." catch with `err.message`, so users now see "Cannot remove yourself from a project.", "Cannot remove the project owner.", or "Only the project owner can remove members." directly.

### Internal
- New `src/lib/callables.ts` (Lesson 61): four async wrappers + `requireFunctions()` guard. Story Map has no voting model, so there is no `callUpdateInvite`.
- `src/lib/firebase.ts` exports `functionsInstance` and no longer exports the four `getXxx` factories. The `httpsCallable` import and the four invitation type imports moved to `callables.ts`.
- Test mocks updated in `migration.test.ts`, `storageDriver.test.ts`, `signOutCleanup.test.ts`: dropped the four `getXxx: vi.fn(() => null)` lines; added `functionsInstance: null` to the firebase mock; added a `vi.mock('../lib/callables')` factory with rejecting wrappers for module resolution.
- F4 ↔ A8 parity: `loadProductIndex` now uses `data.owner ?? null` for the same field shape as the new `onProductChange` re-attach.

## Version 0.28.0 (2026-05-07)

Project tile actions get a visual refresh, and Share lands as a cloud-mode owner-only affordance — extending the just-merged owner-gating audit (CFD v0.10.2, Forecaster v0.27.1) to Story Map.

### Added
- **Share icon on the Projects homepage**, visible only when the user is in cloud mode AND owns the project. Opens a new `ShareDialog` modal that reuses the existing sharing logic (members list, bulk email invitations, pending-invitation management) without duplication. Editors and viewers don't see the Share affordance — consistent with GanttApp/CFD/Forecaster.
- **`src/components/settings/ProjectSharingPanel.tsx`** — extracted from `SharingSection.tsx`. All sharing logic, state, effects, handlers, and JSX moved verbatim into this new component, plus a `withSectionWrapper` prop that controls whether the `<Section title="Sharing">` heading is rendered. The early-return guard for non-owners fires before any wrapper is constructed, so non-owners never see an empty "Sharing" header card. SharingSection (Settings page) sets `withSectionWrapper`; ShareDialog (homepage modal) doesn't, so its body has no nested heading.
- **`src/components/product/ShareDialog.tsx`** — thin modal wrapper around `ProjectSharingPanel`. Uses the existing `Modal` component with `wide` and renders the project name as a subtitle below the modal header.

### Changed
- **Project tile action buttons: text → SVG icons (16×16)**. `src/components/product/ProjectCard.tsx` replaces three `group-hover:opacity-100` text buttons (Export, Duplicate, Delete) with always-visible icon buttons. Final left-to-right order: Share, Export, Duplicate, Delete. Each is gray by default and color-tinted on hover (Share: blue, Export: emerald, Duplicate: violet, Delete: red). Tile no longer requires a hover to expose its actions, matching the CFD/Forecaster project-tile pattern.
- **`SharingSection.tsx` collapsed to a one-line passthrough** — `<ProjectSharingPanel productId={productId} withSectionWrapper />`. All logic now lives in the extracted panel; `SharingSection` is preserved as the import name `SettingsView` already uses.
- **`Modal.tsx` is now stack-aware.** A module-level `openModalCount` plus a per-instance `myDepth` ensures Escape closes only the topmost modal and body-scroll lock is released only when the last modal closes. This fixes the cascade and scroll-restoration race that the new ShareDialog would otherwise expose by nesting a `ConfirmDialog` (Revoke confirmation) inside its outer `Modal`. The existing `ConfirmDialog` consumer inherits the fix automatically — no callsite changes.

### Internal
- `useEffect` in Modal: two effects (body-overflow + Escape listener) consolidated into one stack-aware effect. Behavior preserved for the single-modal case; nesting now works correctly.
- `MemberRow` component and `MemberRowProps` interface relocated from `SharingSection.tsx` to `ProjectSharingPanel.tsx`.
- `appId: 'spertstorymap'` literal in `getSendInvitationEmail` preserved verbatim through the extraction (Lesson 15).

## Version 0.27.1 (2026-05-06)

Two bulk-invitation UX fixes surfaced by first-day production use.

### Fixed
- **Invalid email addresses in the bulk textarea are now reported.** Previously, a malformed address like `yourmama@gmailcom` (missing dot before `com`) was silently filtered out client-side before the Cloud Function call, so the user saw no signal it had been dropped. The result chip set now includes a red "Skipped: <addr> (invalid-format)" entry for each malformed token, alongside the existing CF-side failure reasons (`already-invited`, `already-member`, etc.). If the entire input is invalid, the CF is not called at all and only the format errors are shown.
- **Bulk-invite textarea now clears on a successful send.** Previously, all addresses (including the ones that just succeeded) stayed in the textarea, leaving the user unsure whether re-clicking Send would re-dispatch them. The textarea now empties on a successful send response; result chips remain visible until the user types into the empty textarea (matching the existing chip-clear-on-edit behavior).

### Internal
- `parseBulkEmails` signature changed from `(string) => string[]` to `(string) => { valid: string[]; invalid: string[] }`. Sole consumer (`SharingSection`) updated. Tests expanded from 13 to 16 cases covering the dedup/lowercase behavior on both sides of the split.

## Version 0.27.0 (2026-05-06)

Bulk Email Invitations — feature flag off in this release. The full implementation lands behind `INVITATIONS_ENABLED = false`; cross-app profile infrastructure activates immediately on merge. A subsequent single-line ship-gate commit flips the flag once the Landing Page PR deploys.

### New feature (INVITATIONS_ENABLED = false — not yet active)
- **Bulk invitations.** Project owners can invite multiple collaborators by email in one operation. Existing SPERT Suite users are added immediately; others receive an invitation email and are added automatically when they sign in.
- **Pending invitations panel.** Project Settings → Sharing now shows outstanding invitations with Resend (up to 5×) and Revoke actions, gated by a confirmation dialog for revoke.
- **Invitation landing banner.** When a user navigates from an invitation email link, a banner appears prompting sign-in (with Google / Microsoft buttons and ToS consent gate), then transitions to a success confirmation when the claim resolves. Auto-flips storage mode to cloud only when the user has zero local projects (Lesson 28 guard).

### Active in this release regardless of invitation flag
- **Suite-wide `spertsuite_profiles` dual-write** added to AuthProvider. Every sign-in now populates the cross-app profile required for invitation email lookup, alongside the existing per-app `spertstorymap_profiles` write.
- **Display-name normalization fix.** Microsoft Entra ID "Last, First" displayName format now correctly becomes "First Last" in profile writes and all display contexts. Multi-part names (e.g., "Smith, Jane Ann") are also correctly handled. Implementation delegates to a new `denormalizeLastFirst` helper that mirrors the canonical Cloud Functions implementation in the Landing Page repo (`functions/src/mailHeaders.ts`).
- **`photoURL`** included in all profile writes.
- **Profile email stored lowercased** for cross-app lookup consistency.
- **Profile timestamp renamed** from `lastLogin` to `updatedAt`.
- **Removing a project collaborator** now routes through the `StorageDriver` interface (`driver.removeCollaborator`) instead of writing directly to Firestore.

### Internal refactors (no UX change)
- `sanitizeForFirestore` extracted from `firestoreDriver.ts` into a new `firestoreUtils.ts` module so it can be shared with AuthProvider's profile writes without circular imports.
- `GoogleIcon` / `MicrosoftIcon` extracted to `src/components/auth/AuthProviderLogos.tsx` and shared between StorageSection and InvitationBanner.
- New `useSignInWithTosGate` hook captures the consent-gate sign-in flow that StorageSection had inlined; InvitationBanner reuses it.
- New `useInvitationLanding` hook owns the invite-token capture, URL stripping, mode flip, and claim-event listener.

### Tests
- New pure-function tests for `parseBulkEmails`, `mapInvitationError`, and `denormalizeLastFirst` (38 new assertions across 2 files). Hook and component tests for `useInvitationLanding` and `InvitationBanner` are deferred to a follow-up chore PR — they require `jsdom` + `@testing-library/react`.

## Version 0.26.4 (2026-05-03)

Form-hygiene cleanup — silences Chrome DevTools Issues warnings around `id`/`name` on form fields and `<label>` association.

### Fixed
- **All form fields now carry a `name` attribute.** 35 inputs / textareas / selects across 21 files lacked any `id` or `name`, triggering Chrome's "form field element should have an id or name attribute" warning. Each field now has a stable, semantic `name` (e.g. `projectName`, `ribName`, `releaseName`, `sprintAssessmentNote`). No real `<form>` elements wrap these inputs — React owns state directly — so the names are purely advisory; reusing the same name across visually distinct inputs (e.g. `releaseName` in `ReleaseColumn`, `ReleaseDetailPanel`, and `ReleaseDivider`'s left + right labels) is intentional and harmless.
- **All standalone `<label>` elements now associate with their input.** 7 bare `<label>` tags across `CreateProjectModal`, `CommentPanel`, `AppSettingsModal`, `SettingsView`, and the `Field` component (`Section.tsx`) gained `htmlFor` pointing at a `useId()`-generated stable id on the matching input. The `Field` component now accepts an optional `htmlFor` prop for callers that want explicit association — non-breaking; existing callers passing no `htmlFor` continue to render unchanged.

### Why this wasn't caught in v0.26.2
The previous patch's Category 3 sweep was scoped strictly to `autoComplete` attributes per the original prompt's rules, even though I had eyes on every field that lacks `name`/`id` while doing it. Adjacent form-hygiene warnings (id-or-name, label association) are separate Chrome DevTools rules and weren't in scope. Lesson logged: when fixing one class of form-hygiene warning, scan the same fields for the related ones.

## Version 0.26.3 (2026-05-03)

Insights tab console-warning cleanup.

### Fixed
- **Recharts `width(-1)/height(-1)` warning on Insights.** The Core vs Non-core pie chart was wrapping a fixed-size 160×160 container in `<ResponsiveContainer width="100%" height="100%">`. The percentage-string sizing forces Recharts to wait for its `ResizeObserver` to fire before it can compute dimensions, and during that one-frame window it logs a console warning with `-1` placeholders. Since the parent dimensions are already known and fixed, the `ResponsiveContainer` was redundant — replaced with a direct `<PieChart width={160} height={160}>`. Visual output is identical; warning is gone. The other three charts on the tab (`Sizing Distribution`, `Release Breakdown`, `Burn-up`) already pass numeric heights and were not affected.

## Version 0.26.2 (2026-05-03)

Three-category bug sweep — surfaces silent Firestore write failures on shared projects, hardens the real-time listener, and clears the one active browser warning on `<input type="email">`.

### Fixed
- **Sharing errors are no longer silent.** `Remove member` and `Change role` failures in `SharingSection` previously logged to console only. They now surface inline through the existing `setError(...)` UI that `Add member` already used — same red text below the add-member input, identical pattern, no new infrastructure. Both handlers also clear stale errors at the top of the call.
- **`onSnapshot` listener has an error callback.** The single `onProductChange` subscription in `firestoreDriver.ts` was passing only a success callback. A permission-denied or sustained network drop on the live-sync stream would have thrown unhandled. Added the third-arg error handler — logs to console using the same shape as `handleWriteError`, and invokes the driver-level `_onSaveError` callback so the existing red save-error banner in `ProductLayout` covers a sync interruption with the same surface as a write failure.
- **`<input type="email">` warning silenced.** The email-entry input in `SharingSection` for adding collaborators now carries `autoComplete="off"` — Chrome flags `type="email"` without `autoComplete` unconditionally. The field collects another user's email (for sharing), never the signed-in user's own credential, so `"off"` is the right value.

### Hygiene
- **Export Attribution Name field carries `autoComplete="name"`.** The `Name` input in App Settings → Export Attribution is the user's own name (per `CLAUDE.md`, students fill in their own name and identifier before exporting). Adding `autoComplete="name"` enables browser autofill suggestions on a field whose semantics match the standard `name` token. Preemptive only — `type="text"` is not browser-flagged when `autoComplete` is missing.

### Out of scope
- `AuthProvider` profile upsert and `tosHelpers.writeTosAcceptance` errors remain console-only. They run inside `onAuthStateChanged` before any product page mounts; the existing banner is per-route and `ProductList` does not subscribe to `onSaveError`. Wiring them in would require a new global notification surface, which is explicitly deferred.
- The Identifier field in Export Attribution (placeholder `"e.g., student ID, email, or team name"`) intentionally does not get an `autoComplete` value — the field accepts mixed personal-identifier formats and the prompt's hygiene rules name this exact case as a skip.

## Version 0.26.1 (2026-04-30)

Branding polish — replaces the default Vite SVG favicon with the SPERT Story Map indigo mark and surfaces the icon in both header surfaces.

### Added
- **Branded favicon.** New `public/spert-favicon-storymap.png` (192×192, indigo `#4f46e5` panels with rounded corners) replaces the Vite SVG placeholder in the browser tab.
- **Dark-mode favicon variant.** `public/spert-favicon-storymap-dark.png` swaps the source PNG's near-black center pixels (`R<20 & G<20 & B<20 & A>200`) for charcoal `#2a2a2a` so the icon stays legible against dark backgrounds.
- **Header icon on the homepage.** `ProductList` now renders a 28×28 rounded icon immediately to the left of the `SPERT® Story Map` title. Source switches between light and dark variants based on `useDarkMode()`'s `isDark` flag — honors the user's explicit light/dark toggle, not just `prefers-color-scheme`.
- **Header icon on per-project pages.** `ProductLayout` adds a 24×24 rounded icon at the start of the top header (before the `← Projects` link) so branding stays consistent when drilling into a project.

### Internal
- No new runtime dependencies. Pillow-based dark-variant generation is a one-off dev script. No schema changes.

## Version 0.26.0 (2026-04-26)

Sizing tab becomes a self-sufficient triage surface: persisted filters, per-card kebab menu, and in-tab create / edit / split / delete. Five user-facing features plus shared infrastructure (kebab menu, modal, sessionStorage hook). Architecture decisions resolved up front in the implementation plan; gates ran clean after every step.

### Added
- **Filter persists across tab navigation.** The Sizing filter (themes, releases, hide-locked) now survives switching to Map / Releases / Settings and back. Stored in `sessionStorage` keyed by product ID — clears on browser refresh or tab close. A one-pass orphan strip in `SizingView` drops `themeIds` and `releaseIds` that no longer exist in the current product, so deleting a filtered theme in another tab self-heals on return.
- **+ Rib button in the Sizing overlay.** Sibling to the filter panel (not nested inside it, since the panel is collapsible). Opens a create modal with cascading theme → backbone → name selectors. Smart defaults frozen at click time: a single-theme filter pre-selects the theme; a single-backbone theme pre-selects the backbone; both pre-resolved and the selectors are hidden, leaving only the name field. Name is always required — the placeholder `"New Rib Item"` is never committed silently.
- **Edit from a per-card kebab menu (`⋮`).** Each Sizing card now exposes a kebab in the top-right with Edit / Split / Delete. Edit opens the same modal in edit mode, prefilled with current values, allowing changes to name, description, category, size, and notes. Release allocations are intentionally out of scope for this modal — manage those from the Releases tab.
- **Split a rib in place.** The Split action creates a new sibling rib in the same backbone. Naming follows a `(N)` suffix convention with collision avoidance: scans all siblings sharing the same prefix and uses `max(existing N) + 1`. Splitting `"Foo"` produces `"Foo (1)"` + `"Foo (2)"`; splitting `"Foo (1)"` while `"Foo (2)"` already exists produces `"Foo (3)"`, never a duplicate. New rib starts fresh — `size: null`, no allocations, no progress, copied category, cleared description and notes. Inserted into the parent backbone immediately after the original; `sizingCardOrder['unsized']` updated to keep the two adjacent in the unsized zone.
- **Delete from the kebab.** Confirmation dialog with the rib's name in the prompt. Standard recovery path is Ctrl+Z — no toast, no soft-delete. Existing `deleteRib` mutation already cleans `sizingCardOrder` and `releaseCardOrder` for the deleted ID.
- **Locked-card editing with size protection.** Cards with `percentComplete > 0` are considered locked. The Edit modal disables size editing for locked cards (rendered as a static badge with `"Size locked: progress recorded"` tooltip) so historical points-vs-progress math is preserved. Name, description, category, and notes remain editable. Split and Delete are still available on locked cards.
- **Unsaved-changes protection on the modal.** Closing via X, Cancel, Escape, or backdrop click while the form has unsaved changes now shows an in-modal prompt: Keep editing / Discard changes / Save. Save is disabled (with explanation tooltip) when required fields are missing in create mode.

### Changed
- **`ChangeLogOp` extended with `'split'`.** The audit-log entry for a split rib uses `op: 'split'` with `source` holding the originating rib's ID, symmetric with how `'duplicate'` records the originating product's ID at `storage.ts:305`. Distinguishing splits from generic adds is useful for the academic-integrity audit trail.
- **Rib hover tooltips no longer leak through modals.** Tooltip portal z-index dropped from `z-[9999]` to `z-40`, so the Modal's `z-50` backdrop now correctly covers any leftover tooltips. Additionally, when a card's kebab opens, the card's own tooltip is dismissed proactively, so it never persists into the menu / modal flow regardless of pointer-event timing.
- **`NOTES_MAX = 2000` exported from `src/lib/constants.ts`.** Previously a file-local constant in `RibDetailPanel.tsx`; now imported from the shared module by both `RibDetailPanel.tsx` and the new `SizingRibModal.tsx`. The validation-layer `MAX_MEMO` in `validateProduct.ts` is left intact — it's a broader cap covering description, allocation memo, and progress comments, distinct concern.

### Internal
- **`src/hooks/useSessionState.ts`** — generic `useSessionState<T>(key, defaultValue)` hook plus pure `readSessionValue` / `writeSessionValue` helpers. Hook composes the helpers; tests target the helpers directly so they run cleanly in the project's `node` test environment without a DOM.
- **`src/components/ui/KebabMenu.tsx`** — reusable kebab menu component. Trigger is `<button aria-haspopup="true" aria-expanded={…}>⋮</button>`. Popover renders via `ReactDOM.createPortal(…, document.body)` with `position: fixed` against the trigger's `getBoundingClientRect()` so it never inherits the Sizing canvas's `transform: scale()` zoom. Closes on outside click (capture-phase), Escape, scroll, resize, and focus loss. Full keyboard navigation: Enter/Space to open, Arrow keys to cycle enabled items, Enter to invoke, Escape to close and return focus to trigger, Tab to close-and-advance. ARIA roles `menu` / `menuitem` and `aria-disabled` on disabled items.
- **`src/components/sizing/SizingRibModal.tsx`** — discriminated `mode: { kind: 'create' | 'edit' }` modal. Edit mode runs a defensive lookup against `product.themes → backboneItems → ribItems`; if the rib was deleted concurrently in another tab (cloud mode race), the modal closes silently via `onClose()` rather than rendering against a stale reference. Form state seeded via lazy `useState` initializers; parent passes a `key` that changes per target so each open gets fresh seed values without a reset effect. Initial-value snapshot for dirty detection uses lazy `useState` (not `useRef`) to comply with React 19's `react-hooks/refs` rule.
- **`useProductMutations` exposes `splitRib(themeId, backboneId, ribId): string` and `addNamedRib(themeId, backboneId, attrs): string`.** Both hook callbacks are thin wrappers that call new exported pure transformations `splitRibInProduct` and `addNamedRibToProduct`, allowing direct unit tests in the existing `node` test env without a React runtime. `addNamedRib` is atomic — one `updateProduct` call, one changelog entry, no `"New Rib Item"` placeholder flash that the old `addRib` + `updateRib` two-step pattern produced.
- **`SizingCell` interface extended with `themeId` and `backboneId`** (already populated by `useSizingLayout` enrichment; previously not declared in the public interface). Required by all four kebab actions to address the rib through `mutations.<op>(themeId, backboneId, ribId)`.
- **Locked-state size-omission lives in the caller, not the modal.** `SizingRibModal.onSave` always sends the full payload including `size`. `SizingView.handleEditSave` is the boundary that strips `size` from the `mutations.updateRib` call when `editingCell.locked === true`. Single source of truth for the rule, easy to inspect, easy to test.
- **SessionStorage key namespacing.** `sizing-filter:${product.id}` so per-project filters don't leak across projects in the same session.
- **Test coverage.** 30 new tests added (`useSessionState` × 8, `splitRib` × 11 including collision-avoidance cases, `addNamedRib` × 7, `SizingCell` cell-identity × 2, plus existing-deleteRib `sizingCardOrder` cleanup confirmation). Total suite: 473 tests, all green.

### Known follow-ups
- Component-render tests for `KebabMenu` and `SizingRibModal` were deferred — the project's test env is `node` with no jsdom or RTL. Both components are exercised end-to-end via integration with `SizingView` and manual verification. Adding `jsdom` + `@testing-library/react` as devDeps and backfilling these test files is a candidate for v0.26.1.

## Version 0.25.0 (2026-04-26)

Cloud Storage modal unification. Targeted UX refinement — no schema, provider, or driver changes.

### Changed
- **Unified chip click behavior across all three auth states.** Previously, clicking the storage status pill did three different things depending on state: cloud-signed-in opened an inline "Account" modal, signed-in-local opened a popover with "Switch to Cloud Storage" and "Sign Out" buttons, and signed-out opened App Settings. All three states now open the same Cloud Storage modal. Sign-out and storage-mode switching are reached through the modal's identity card, not through divergent chip behaviors.
- **Modal renamed from "App Settings" to "Cloud Storage".** Reflects the modal's actual primary purpose — managing storage mode, sign-in, and migration. Export Attribution and Notifications remain second-class sections within the same modal.
- **Identity card display name now normalized.** Microsoft Entra ID returns `displayName` as `"Last, First MI"`, which read awkwardly as the primary identity label. The card now shows `"First MI Last"` reading order. Google sign-ins (already in `"First Last"` order) pass through unchanged. Pulled from a new shared utility so the chip and the identity card always agree.
- **Voluntary popup-dismiss is now silent.** Closing the Google or Microsoft sign-in popup yourself (`auth/popup-closed-by-user`) no longer surfaces a "Sign-in was cancelled." message — the user explicitly dismissed the popup, so an error label was redundant. Popup-blocked and other auth errors still surface their recovery message.

### Added
- **"Keep using local storage" button (signed-in + local mode only).** When you sign in but have not yet switched to cloud storage, the modal now shows an outline button below the identity card that closes the modal without changing storage mode. Previously the only ways out without switching were ×, Esc, or backdrop click — discoverable, but not obvious. The button is intentionally hidden when already on cloud storage (Sign Out and the Local radio already cover that case).
- **Auto-close after sign-out.** Clicking the red "Sign out" link in the identity card now closes the Cloud Storage modal automatically once `signOutCleanup` resolves. The chip updates to the signed-out variant in place, no page reload.

### Internal
- New module `src/lib/userDisplay.ts` exports `normalizeDisplayName` (comma-detection swap for Microsoft `"Last, First MI"` format) and `getFirstName` (first token, falling back to email local-part). Replaces duplicated inline parsing that previously lived in both `StorageStatusPill` and `AccountPopoverLocal`.
- `StorageStatusPill` reduced to a pure visual component. All click handling collapses to a single `onClick` prop call — no internal modals, no inline popover, no `signOutCleanup` import, no refs. Three visual variants and the `onClick: () => void` interface are unchanged, so `ProductList` and `ProductLayout` need no updates.
- `AppSettingsModal` now passes `onClose` through to `StorageSection`, which uses it for both the new "Keep using local storage" button and post-sign-out auto-close. The prop is optional; `StorageSection` consumers that render it without a parent modal continue to work.
- `AccountPopoverLocal.tsx` deleted. Its functionality (display name + email + sign-out + switch-to-cloud) is now subsumed by the unified Cloud Storage modal.

### Test & lint baseline restored
The ship gate caught a backlog of pre-existing failures on `main` that had accumulated and were blocking clean releases. Fixed in this delta so v0.25.0 ships against a green baseline.
- `useSizingLayout` no longer crashes when a caller passes a `SizingFilter` without a `releaseIds` field. The interface still types `releaseIds` as required, but the runtime now guards with `(filter.releaseIds?.length ?? 0) > 0` to match how older test fixtures construct filters. Restores 6 sizing-layout tests.
- `computeLayout.test.ts` `totalWidth` assertions updated to include `RIGHT_LABEL_WIDTH`. The mirrored release-label column was added in v0.21 but the two affected expectations were not migrated. Restores 2 layout tests.
- `ReleaseDivider.tsx` destructures `useInlineEdit` and `useTooltip` returns at the top of the component to comply with the React 19 `react-hooks/refs` rule, which flags `someHook.refField` access during render. Behavior is identical; this is a zero-cost lint fix following the project's standing pattern.
- `useMapDrag.ts` adds `layout.releaseLanes` to the `handleDragMove` `useCallback` dep array — it is read inside the callback body via `buildReleaseMoveState` but was missing from the dep list. Resolves both `react-hooks/exhaustive-deps` and `react-hooks/preserve-manual-memoization`.
- `StoryMapView.tsx` removes the unused `handleAddRelease` from the `useMapHandlers` destructure (only `handleAddReleaseAfter` is wired to the canvas).

## Version 0.24.0 (2026-04-19)

Privacy and correctness bug-fix release. No new features, no schema changes, no Firestore rule changes.

### Fixed
- **Sign-out now clears local storage (privacy fix — critical).** Previously, `firebaseSignOut` was the entire sign-out implementation, leaving `rp_products_index`, `rp_product_*` keys, and `rp_app_preferences` (which holds the Export Attribution `exportName` / `exportId` fields) in localStorage. On a shared browser, a second user inheriting the same session would see the first user's local projects and, critically, export files stamped with the first user's identity. Sign-out now clears all of those keys. `rp_workspace_id` (the per-browser academic-integrity token) and non-sensitive UI preferences (`spert-theme`, `spert_firstRun_seen`, `spert_map_hint_dismissed`) are deliberately preserved.
- **Pending Firestore writes are canceled on sign-out (data-integrity fix — critical).** A 500ms-debounced save scheduled just before a sign-out click could fire after Firebase revoked credentials, producing either a spurious `PERMISSION_DENIED` error (surfaced to the just-signed-out user as a "Storage full" banner) or, in the revocation race window, a successful stale write committed to the user's cloud doc after they believed they had signed out. A new `cancelPendingSaves` method was added to the storage driver interface and both implementations; sign-out now invokes it as the first step of cleanup, before credentials are revoked.
- **Sign-out sequence is now correctly ordered.** The correct order is: (1) cancel pending writes, (2) clear local user data, (3) reset the persisted storage mode to `'local'`, (4) revoke the Firebase session. All sign-out paths — user-initiated from the pill popover, user-initiated from the Settings storage section, and automatic from the ToS-version mismatch branches in `AuthProvider` — now route through a single `signOutCleanup` helper and follow this order.
- **ToS-failure sign-out now resets storage mode (consistency fix).** The two branches in `AuthProvider` that sign a user out for ToS version mismatch or verification failure previously called `firebaseSignOut` but never called `switchMode('local')`. This left `spert-storage-mode` as `'cloud'` in localStorage. The new centralized cleanup helper writes `'local'` directly in this case so the state is consistent with user-initiated sign-out.
- **Cloud→Local mode switch no longer leaves the user on "Project not found".** Switching from Cloud to Local while viewing a cloud-only project swapped the driver to local, `loadProduct` returned `null`, and `ProductLayout` rendered a dead-end "Project not found" view. The Settings storage section now navigates to the project list (`/`) immediately after the cloud→local switch, and `ProductLayout` has a safety-net effect that redirects to `/` whenever the current product is unresolvable in local mode — covering any other path that might reach the same state.
- **Sign-in popup-blocked errors now show a recovery message (UX fix).** Previously, all sign-in errors except `auth/popup-closed-by-user` fell through to a generic "Sign-in failed. Please try again." message, giving users on popup-blocking browsers no recovery path. `auth/popup-blocked` and `auth/cancelled-popup-request` now show: "Your browser blocked the sign-in popup. Please allow popups for this site and try again." The error object is also now properly type-guarded instead of accessing `.code` on `unknown`. `signInWithRedirect` was intentionally not added in this release.
- **Pill now correctly reflects signed-in + local mode.** The `StorageStatusPill` previously had only two render branches: cloud-signed-in, or signed-out. A user who was signed in but had toggled storage mode to Local saw the signed-out pill displaying "Sign in", which was wrong — they were already signed in. A new third branch renders a split pill with avatar + first name on the left and a lock icon on the right, mirroring the cloud pill with the cloud icon replaced by a lock. Clicking opens a small popover with display name, email, a "Switch to Cloud Storage" button, and a Sign Out button.

### Internal
- New module `src/lib/signOutCleanup.ts` is now the single source of truth for sign-out cleanup. Every sign-out path calls it. No other file in the codebase calls `firebaseSignOut` directly.
- New component `src/components/ui/AccountPopoverLocal.tsx` backs the new signed-in + local pill state. It reuses the existing comma-detection / first-name extraction logic used for Microsoft `"Last, First"` displayNames.
- New `cancelPendingSaves` method on the `StorageDriver` interface. The local driver delegates to a new `cancelPendingSaves` export in `src/lib/storage.ts` that clears the shared debounce map without writing. The Firestore driver clears its `productTimer` and `prefsTimer` without invoking `doSaveProduct` / `doSavePrefs`.

## Version 0.23.9 (2026-04-10)

### Improved
- **Sign-in buttons in App Settings** now show Google and Microsoft brand icons with solid blue styling.

## Version 0.23.8 (2026-04-10)

### Fixed
- **First-run banner placement** — The ToS/Privacy Policy first-run banner now appears below the app header instead of above it, on both the home page and product views.

## Version 0.23.7 (2026-04-09)

### Improved
- **Unified click-to-logout auth chip** — The entire storage status pill is now a single clickable button. When signed into cloud storage, clicking anywhere on the chip (avatar, first name, or cloud icon) opens a lightweight Account modal showing the user's display name and email with a Sign Out button. Sign Out signs out of Firebase and switches back to local mode in place — no page reload, no detour through the Settings tab. The button shows "Signing out…" and is disabled during the await to prevent double-fire. When signed out, clicking the chip continues to open App Settings (unchanged).

## Version 0.23.6 (2026-04-05)

### Legal
- Updated Terms of Service and Privacy Policy to v04-05-2026
- Added SPERT® AHP to list of covered apps
- Updated effective date to April 5, 2026

## Version 0.23.5 (2026-04-05)

### Improved
- **Standardized auth chip (Option C split pill)** — Replaced the colored storage status pill with a split pill design matching the SPERT Suite standard. Signed-in cloud mode shows a 26px avatar circle with first initial (white on `#0070f3`) + first name, a vertical divider, and a cloud icon button that opens Settings. Local/signed-out mode shows a lock icon + "Local only" with a "Sign in" action in the right segment. Uses `#0070f3` suite-standard blue across all states. Dark mode supported.

## Version 0.23.4 (2026-04-05)

### Added
- **Storage status pill in header** — A pill-shaped indicator now appears in the upper-right corner of both the home page and per-project headers showing the current storage mode and sign-in state. Local mode shows a gray "Local" pill with a database icon. Cloud mode shows a blue pill with the user's initial, display name, and cloud icon. Cloud mode without sign-in shows an amber "Sign in" pill. Clicking the pill opens App Settings. Matches the pattern used in GanttApp, MyScrumBudget, and SPERT Forecaster.

## Version 0.23.3 (2026-04-02)

### Added
- **Export All Projects button** — New "Export All Projects" button on the home page (between Import and Load Sample) downloads every project as a single bundled JSON file named `spert-story-map-<datetime>.json`. Disabled when no projects exist.

### Improved
- **localStorage warning banner revamp** — The startup caution banner for local-storage users now reads: "**Your data exists only in this browser** and can be lost without warning. Export at the end of every session to protect your work." Banner initializes hidden and appears only after preferences load, preventing a flash for users who have suppressed it.
- **Suppress warning toggle in App Settings** — New "Notifications" section in App Settings with a "Warn me on startup when using local storage" toggle. Default: on. Toggling it off persists `suppressLocalStorageWarning` in preferences so the banner stays hidden across sessions. The session-dismiss (× button) behavior is unchanged.
- **Standardized export filenames** — All JSON exports now use the `spert-story-map-<project-name>-<datetime>.json` naming convention for consistency and easier identification.

## Version 0.23.2 (2026-04-01)

### Improved
- **Whole-card drag on Sizing tab** — Sizing cards can now be grabbed and dragged from anywhere on the card, not just the small grip handle. The grip icon is removed; unlocked cards show a grab cursor on hover. Locked cards remain non-draggable.
- **Core/Non-core toggle in Allocation Modal** — The category (Core / Non-core) can now be changed directly in the allocation modal on the Release Planning tab. Previously it was display-only in that modal.
- **License footer link** — Added a License link to the footer (Terms of Service | Privacy Policy | License) pointing to the GitHub LICENSE file, matching SPERT Scheduler.

## Version 0.23.1 (2026-04-01)

### Added
- **Contextual hover "+ Rib" buttons on Story Map** — An invisible `+ Rib` button appears on hover below the last rib card in each column×release lane, wherever there is gap space. Clicking it in a release lane creates a new rib with 100% allocation to that release. In the Unassigned lane, creates an unallocated rib. Buttons only appear when there is visual room below the last card (not in the tallest column), and never in empty cells. Hidden during drag operations.

## Version 0.23.0 (2026-04-01)

### Added
- **Mirrored release labels on Story Map** — Release names now appear on both the left and right edges of the map, so you never lose lane context when scrolling a wide map. Both labels are editable via double-click.
- **Release add/delete on Story Map** — `+ Release` and `×` delete buttons at the bottom of each release lane on both sides. `+ Release` inserts after that release. Delete is blocked (with tooltip) when the release has rib items allocated to it.
- **Drag-to-reorder releases on Story Map** — Grab handle (`⠿`) next to each release label on both sides. Drag vertically to reorder release lanes with a blue insertion line showing the drop position. The Unassigned lane stays anchored at the bottom.

### Removed
- Removed the `+ Release` button from the Unassigned lane (redundant now that each release has its own `+ Release` at the bottom).
- Removed the far-right `+ Release` buttons on release divider lines (replaced by the per-lane bottom buttons).

## Version 0.22.2 (2026-04-01)

### Added
- **Release filter on Sizing tab** — The sizing filter panel now includes release chips alongside the existing theme filter. Select one or more releases to show only ribs allocated to those releases. Unallocated ribs are hidden when any release filter is active. Filter badge count reflects all active filters (themes + releases + hide completed).

## Version 0.22.1 (2026-04-01)

### Improved
- **Two-line rib names on Sizing tab** — Sizing cards now display up to two lines of the rib item name (matching the Map tab), replacing single-line truncation. Card height increased from 52px to 68px to accommodate the extra line.

## Version 0.22.0 (2026-03-31)

### Improved
- **Per-theme "Add Backbone" button on Story Map** — Each theme header now has a `+` button that adds a new backbone directly to that theme. Previously, the only way to add a backbone was via the global `+ Backbone` button at the far right of the map (which always targets the last theme), requiring a drag to reposition it under the correct theme. The global button is still available as a shortcut.

## Version 0.21.1 (2026-03-31)

### Maintenance
- Updated Terms of Service and Privacy Policy to v03-31-2026
- Updated canonical legal document URLs to spertsuite.com
- Updated consent UI text to SPERT® Suite branding

## Version 0.21.0 (2026-03-30)

### Added
- **Excel export** — Export any project to a formatted `.xlsx` file from Settings → Data. Generates a two-sheet workbook: **Rib Items** (Theme, Backbone, Rib Item, Category, Size, Points, % Complete, Release(s), Notes — one row per rib item, preceded by a color-coded theme group header row) and **Release Summary** (Release, Total Points, % Complete, Core Points, Non-Core Points, Target Date — one row per release sorted by order). % Complete cells are conditionally filled: light green at 100%, light yellow for partial progress. Theme group header rows are filled with the theme's color tint. Both header rows are frozen. Notes column (width 80) uses wrap text with top alignment. ExcelJS is loaded via dynamic import so it does not affect initial bundle size.

## Version 0.20.0 (2026-03-30)

### Added
- **Sizing filter panel** — Filter the sizing board by theme and/or completion status. A collapsible filter panel sits below the zoom controls with two controls: theme chips (multi-select; all unselected = show all) and a "Hide completed" toggle that excludes ribs with progress > 0%. The view auto-fits to the filtered card set when filters change. Filter state is ephemeral (not persisted).
- **MapCanvas overlay slot** — `MapCanvas` now accepts an optional `overlayControls` prop for view-specific controls that stack below the zoom bar via flexbox. Used by the sizing filter panel; available to any view that shares `MapCanvas`.

## Version 0.19.0 (2026-03-30)

### Added
- **Rib item notes** — Free-form notes field (up to 2,000 characters) on rib items. Click any rib card on the Story Map to open the detail panel; a Notes section at the bottom supports multi-line text for requirements, acceptance criteria, reference content, or any other per-item context. Notes save automatically on blur. Character counter turns amber at 1,800 and red at 2,000 characters.

### Improved
- **Rib card text wrapping** — Rib item names on the Story Map now wrap up to 2 lines (ellipsis after line 2) instead of truncating at 1 line. Card height increased from 52px to 68px. All cards remain a fixed height so columns stay visually aligned regardless of name length.
- **Backbone header text wrapping** — Backbone names now wrap up to 2 lines (ellipsis after line 2) instead of truncating at 1 line. Header height increased from 28px to 40px.
- **+ Rib auto-open** — Clicking **+ Rib** now immediately opens the detail panel with the name field focused and pre-selected, so the user can type the new item name directly without additional clicks.

### Fixed
- **Right-click no longer triggers panning** — Map panning now responds to left-click only; right-click and middle-click are ignored.
- **Browser context menu suppressed on map canvas** — Right-clicking the Story Map background no longer shows the OS context menu.
- **Text selection during pan eliminated** — Backbone names, theme labels, and rib text can no longer be accidentally highlighted while dragging to pan the map.
- **Grabbing cursor during background pan** — The cursor now correctly shows a closed-hand (`grabbing`) while actively panning the map background, not only during card drags.
- **Pan/zoom discoverability hint** — A subtle "Drag to pan · Scroll to zoom" hint appears in the bottom-left corner of the Story Map for new users. It auto-dismisses after the first successful pan or can be closed with ×. Dismissal is persisted to localStorage.

## Version 0.18.0 (2026-03-22)

### Changed
- **Full TypeScript migration** — Migrated entire codebase from JavaScript/JSX to TypeScript/TSX. All 104 source files (85 source + 18 tests + 1 new types module) are now strictly typed with zero `any` workarounds that lack justification. Brings SPERT Story Map into consistency with the other five apps in the Statistical PERT Suite.
- **TypeScript infrastructure** — Added `tsconfig.json` (project references), `tsconfig.app.json` (strict mode, ES2020, react-jsx, bundler resolution), and `tsconfig.node.json`. Renamed `vite.config.js` → `vite.config.ts` and `eslint.config.js` → `eslint.config.ts`.
- **Centralized domain types** — New `src/types/index.ts` with 28 type/interface definitions covering the full data model: `Product`, `Theme`, `Backbone`, `RibItem`, `Release`, `Sprint`, `SizeMapping`, `ProgressEntry`, `ReleaseAllocation`, `ChangeLogEntry`, `StorageDriver`, `OutletContextValue`, and more.
- **ESLint TypeScript integration** — Switched to unified `typescript-eslint` package with `tseslint.config()`. Removed redundant individual `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` packages.
- **Entry point** — Updated `index.html` script src from `main.jsx` to `main.tsx`.

### Added
- `typescript`, `typescript-eslint`, `@types/node` dev dependencies
- `src/types/index.ts` — centralized domain type definitions
- `OutletContextValue` type shared between `ProductLayout` and all page views via `useOutletContext<OutletContextValue>()`
- Drag state interfaces (`RibDragState`, `BackboneDragState`, `ThemeDragState`, `LayoutCell`, `Column`, `ThemeSpan`) in `mapDragHelpers.ts`
- `UpdateProduct` type alias used consistently across hooks and mutation files
- Props interfaces for all 44 React components

### Hardened
- **Console error sanitization** — All 17 `console.error` call sites now sanitize error objects to `e.message` instead of logging raw Firebase/system error objects that could expose internal details
- **Import file type validation** — `readImportFile()` now checks `.json` file extension before reading, in addition to the existing UI-level `accept=".json"` filter
- **Closed `any` types** — Replaced migration-pragmatic `any` with proper types where clean replacements exist: `UserSettings` for preferences, `StorageDriver` for export driver, `Record<string, unknown>` for generic constraints, `unknown` for raw JSON parse returns
- **Intentional `any` documented** — All remaining `any` types have inline `--` comments explaining why they are necessary (Firestore heterogeneous data, complex layout/drag state objects)

### Removed
- All `.js` and `.jsx` source files (replaced by `.ts`/`.tsx`)
- `allowJs: true` and `checkJs: false` from `tsconfig.app.json` (migration complete)

## Version 0.17.4 (2026-03-16)

### Changed
- **First-run banner** — Updated notification text to clarify browsewrap agreement on app use and added linked Terms of Service and Privacy Policy references

## Version 0.17.3 (2026-03-11)

### Changed
- **Node 22 LTS pinning** — Added `engines` field (`>=22.12.0`) to `package.json` and `.nvmrc` for Vercel deployment targeting ahead of Node 20 EOL (April 30, 2026)

## Version 0.17.2 (2026-03-11)

### Fixed
- **AuthProvider ToS bypass** — Firestore error during returning-user ToS verification now correctly signs the user out instead of falling through and granting access without verified ToS acceptance
- **Import error message sanitization** — JSON parse errors no longer leak raw file content snippets to the UI; replaced with a generic format error message

### Hardened
- **Import validation** — Strengthened `validateProduct.js` schema validation:
  - Rib item `category` field now validates against enum (`"core"` | `"non-core"`) instead of accepting any string
  - Release and sprint `order` fields are clamped to 0–10,000 and floored to integers
  - `sprintCadenceWeeks` upper-bounded to 52 (was unbounded)
  - Changelog entry timestamps validated to positive range (0 < t < year 2100)
  - `releaseCardOrder` and `sizingCardOrder` strip `__proto__`, `constructor`, and `prototype` keys to prevent prototype pollution via crafted imports

## Version 0.17.1 (2026-03-11)

### Improved
- **Dependency updates** — Updated 9 packages to latest stable minor/patch versions within existing semver ranges
  - `react-router-dom` 7.13.0 → 7.13.1 (double-slash normalization fix)
  - `recharts` 3.7.0 → 3.8.0 (new axis scale hooks)
  - `firebase` 12.9.0 → 12.10.0 (bug fixes)
  - `tailwindcss` 4.1.18 → 4.2.1 (Oxide scanner performance improvements)
  - `@tailwindcss/vite` 4.1.18 → 4.2.1
  - `eslint` 9.39.3 → 9.39.4, `@eslint/js` 9.39.3 → 9.39.4
  - `eslint-plugin-react-refresh` 0.5.0 → 0.5.2
  - `globals` 17.3.0 → 17.4.0

## Version 0.17.0 (2026-03-11)

### Added
- **Terms of Service & Privacy Policy compliance** — Legal framework for Cloud Storage users
  - Persistent footer with Terms of Service and Privacy Policy links on all pages (browsewrap notice)
  - First-run informational banner for new visitors explaining that no account is required and Cloud Storage requires agreement
  - Clickwrap consent modal that intercepts Cloud Storage sign-in — users must agree to ToS and Privacy Policy before Firebase Authentication fires
  - Post-authentication Firestore write records acceptance with version, timestamp, auth provider, and originating app ID
  - Returning user verification on app load checks acceptance version; signs out users with outdated or missing acceptance
  - Firestore security rule for `users/{uid}` ToS acceptance records
  - Reference copies of legal documents in `/legal` directory
  - Updated README with legal document links

### Fixed
- **Pre-existing lint errors** — Resolved all ESLint warnings and errors across the codebase
  - Removed unused imports and variables in migration tests, ProgressRow, RibDetailPanel, MapContent, validateProduct
  - Fixed refs-during-render errors in ReleaseColumn by destructuring `useInlineEdit` and `useTooltip` return values
  - Prefixed unused destructured variables in firestoreDriver, removed unused params in storageDriver and useSizingDrag
  - Added missing `mode` dependency in ProductList useCallback
  - Suppressed unavoidable `set-state-in-effect` warnings in useProduct and StorageProvider (async data loading pattern)

## Version 0.16.5 (2026-03-09)

### Added
- **Copyright headers** — All source files now include a copyright and license notice header (96 files across `src/`, plus root config files and `index.html`)
- **LICENSE file** — Added GPL v3 license with author attribution block and Section 7 additional terms (attribution preservation and UI notice preservation)

## Version 0.16.4 (2026-03-09)

### Fixed
- **Structure view text overflow** — Long rib item names no longer bleed into adjacent columns (Size, Points, etc.) in the Structure table. Names now truncate properly within the Name column.

### Improved
- **Structure view width** — Widened from 768px to 1024px max width, giving the Name column ~256px more space to display long rib item names before truncation

## Version 0.16.3 (2026-03-09)

### Fixed
- **Cloud import silently fails** — Importing a project in cloud mode failed silently because Firestore security rules deny `getDoc` on non-existent documents (`resource.data` is null, so `isProjectMember` check fails). The collision check now catches this error and generates a new ID, matching the pattern used by the migration flow
- **Cloud import overwrites stale fields** — Importing a project over an existing cloud project now performs a full document overwrite instead of a merge, preventing stale fields (e.g., old `releaseCardOrder` or `sizingCardOrder`) from surviving the import and referencing deleted entities
- **Cloud import missing ownership** — Importing a new project (no collision) in cloud mode now correctly sets `owner` and `members` fields, preventing the imported project from being invisible in the project list
- **Stale debounced save after import** — `replaceProduct` now cancels any pending debounced save before writing, preventing a queued save of the old product data from overwriting the import
- **Preferences overwrite on re-migration** — Uploading local projects to cloud on re-sign-in no longer overwrites existing cloud preferences (e.g., `projectOrder`); local and cloud preferences are now merged

### Technical
- Added `replaceProduct(product)` to both storage drivers — cancels pending debounce, reads existing `owner`/`members`, then writes a full `setDoc` (no `merge: true`) to eliminate stale field retention on import
- `ProductList.handleImport` collision check wrapped in try/catch — on permission error (non-existent or inaccessible doc), generates a new UUID and creates the product, mirroring `migrateLocalToCloud` collision handling
- Changed `ProductList.handleImport` (no-collision path) from `saveProductImmediate` to `createProduct` to set ownership fields
- Changed `ProductList.confirmImport` and `DataSection.confirmImport` from `saveProductImmediate` to `replaceProduct`
- Changed `migrateLocalToCloud` preferences write from `setDoc` to `setDoc` with `merge: true`

## Version 0.16.2 (2026-03-09)

### Added
- **Quick Reference Guide** — Downloadable PDF overview of SPERT Story Map's features and workflow, available on the About page

### Improved
- **About page — Your Data & Security** — Updated to describe both local and cloud storage modes, replacing the previous local-only description
- **Theme toggle** — Icon now shows the current mode (sun = light, moon = dark, monitor = system) instead of the mode it would switch to. Adds a third "system default" option that follows the OS preference

## Version 0.16.1 (2026-03-08)

### Fixed
- **Cloud sync data guard** — Switching to cloud mode no longer silently hides local projects when the cloud account is empty. A warning banner now tells users to upload their local projects or switch back to local mode
- **Unsafe cloud mode switch** — Removed the "Skip" button that let users switch to cloud without uploading data, which stranded them with an empty project list. Cancel now stays in local mode
- **Cloud connectivity check** — Switching to cloud mode with no local projects now verifies Firestore is reachable before completing the switch, preventing users from being stranded in cloud mode when offline

## Version 0.16.0 (2026-03-04)

### Added
- **Incremental map rendering** — Story map now shows each element as soon as it's created. Themes appear immediately (even with no backbones), with inline `+ Backbone` buttons. Backbones appear with `+ Rib` buttons. Users can build the entire Theme → Backbone → Rib hierarchy directly from the Map tab without switching to Structure view
- **Empty theme placeholders** — Themes with no backbones render as placeholder slots in the layout, reserving space and displaying a `+ Backbone` button inside the theme's column area
- **Always-visible unassigned lane** — The unassigned lane and its `+ Release` button now render even when no rib items exist, so users can create releases directly from the Map tab during incremental map building
- **Full-bleed canvas views** — Map and Sizing tabs now use the full browser width on large monitors instead of being capped at 1600px. Other tabs retain the constrained layout for readability

### Improved
- **Editable rib detail panel** — Click a rib card on the Map to toggle category (Core / Non-core) and change t-shirt size directly from the slide-out panel, without switching to Structure view
- **Release label wrapping** — Long release names on the story map now wrap to multiple lines instead of truncating with an ellipsis

### Fixed
- **Invisible backbone headers** — Fixed `+ Rib` button overlapping backbone header text when a backbone had no rib items, making the backbone name unreadable

### Technical
- `computeLayout()` now emits placeholder `themeSpan` entries with `isEmpty: true` for themes with no backbones, advancing `colIdx` to preserve correct positioning of subsequent themes
- Rib placement loops changed from index-based iteration to `for (const col of columns)` to skip placeholder slots
- `MapContent` empty state guard changed from `themeSpans.length === 0` to `!themes?.length` so themes are visible immediately after creation
- `unassignedLane` is now always emitted by `computeLayout()` (not just when unassigned ribs exist), ensuring the `+ Release` button is always accessible
- `ProductLayout` conditionally removes `max-w-[1600px]` and hides footer for canvas views (Map, Sizing) via `isCanvasView` route detection
- 5 new tests for empty theme and always-present unassigned lane scenarios (397 total tests across 18 files)

## Version 0.15.2 (2026-02-22)

### Security
- **Import race condition fix** — `saveProductImmediate` is now awaited before page reload in DataSection, preventing potential data loss
- **Email enumeration prevention** — Member lookup error message changed to a generic response that doesn't reveal whether an email exists in the system
- **Dangling reference cleanup** — Import validation now strips release allocations and progress history entries that reference non-existent releases or sprints, instead of silently allowing them

## Version 0.15.1 (2026-02-22)

### Improved
- **Codebase refactoring** — Decomposed `ProductList.jsx` (418→321 lines) by extracting `CreateProjectModal` and `ProjectCard` components
- **Shared utilities** — Moved `formatRelativeTime` from `ProductLayout.jsx` to `formatDate.js` for reuse; consolidated duplicate `sanitize` function in `migration.js` with `sanitizeForFirestore` from `firestoreDriver.js`
- **New test coverage** — Added 8 tests for `parseDate` and `formatRelativeTime` (392 total tests)

### Fixed
- **Firestore date display** — All Firestore-sourced dates now use `formatDate()` helper (fixed `ReleaseColumn` and `ReleaseDetailPanel` showing raw ISO strings or "Invalid Date")

## Version 0.15.0 (2026-02-21)

### Changed
- **Cloud as source of truth** — Eliminated bidirectional migration to prevent data duplication. Cloud-to-local migration (`migrateCloudToLocal`) removed entirely. Switching from cloud to local is now a simple mode toggle with no data transfer.
- **Smart re-upload detection** — On re-sign-in, existing Firestore collision check skips products already in cloud (existence-based dedup). `_hasUploadedToCloud` boolean flag tracks whether user has uploaded before.
- **Post-upload cleanup** — After uploading local projects to cloud, users are offered the option to clear local copies to prevent stale data on future sign-ins.

### Added
- **Download All Projects as JSON** — New button in Storage settings (cloud mode) exports all cloud projects as individual JSON files for data portability.
- **`clearAllLocalProducts()`** — New storage helper that removes all local product data and index.
- **`exportAllProducts(driver)`** — Batch export all projects via the storage driver with staggered downloads.
- **ConfirmDialog enhancements** — Added `cancelLabel` and `onCancel` props for custom cancel button behavior.

## Version 0.14.3 (2026-02-21)

### Security
- **Firestore rules**: Added field-level protection preventing editors from modifying `owner`/`members` fields (privilege escalation fix)
- **Firestore rules**: Version-controlled `firestore.rules` and `firebase.json` added to repository
- **Import validation**: Comprehensive schema validation on import — checks types, string lengths, numeric ranges, strips unknown fields, enforces size limits (5 MB max)
- **Query filtering**: `loadProductIndex` and `migrateCloudToLocal` now use server-side `where()` filter instead of full collection scan
- **Error handling**: Import errors shown inline in UI instead of `alert()` (prevents information disclosure)
- **parseInt radix**: Fixed `parseInt` without radix in AllocationModal
- **Dependencies**: Fixed moderate `ajv` vulnerability via `npm audit fix`

## Version 0.14.2 (2026-02-21)

### Added
- **Drag-to-reorder projects** — Reorder projects on the homepage by dragging the grip handle (⠿). Order persists in preferences across sessions and syncs to cloud.

### Improved
- **Codebase refactoring** — Decomposed 5 large files into smaller, focused modules for better maintainability and token efficiency:
  - `ProgressTrackingView.jsx` (415→339 lines): Extracted `progressViewHelpers.js` (pure helper functions) and `ProgressHeader.jsx` (header bar component)
  - `SettingsView.jsx` (357→210 lines): Extracted `SizeMappingSection.jsx` and `DataSection.jsx`
  - `ReleasePlanningView.jsx` (356→176 lines): Extracted `useReleaseDrag.js` hook (all DnD state and handlers)
  - `storage.js` (365→282 lines): Extracted `importExport.js` (export/import/readImportFile)
  - `storageDriver.js` (327→96 lines): Extracted `firestoreDriver.js` (Firestore driver + helpers)
- **New test coverage** — Added 19 tests for `progressViewHelpers` and 8 tests for `sortByOrder` (353 total tests)
- **Cleanup** — Deleted 5 duplicate macOS Finder files, removed trailing blank lines

## Version 0.14.1 (2026-02-21)

### Improved
- **Global settings modal** — Storage mode and Export Attribution moved from per-project Settings to a global App Settings modal, accessible via gear icon on both the homepage and per-project header. These settings apply to all projects, not individual ones.
- **Per-project Settings cleanup** — Settings tab now shows only per-project configuration (name, description, sizes, releases, sprints, sharing, data import/export). Global settings removed to avoid confusion.

### Technical
- New `AppSettingsModal.jsx` component wrapping `StorageSection` + Export Attribution in a `Modal`
- Gear icon added to `ProductList.jsx` header and `ProductLayout.jsx` header
- `SettingsView.jsx` cleaned up: removed `StorageSection`, Export Attribution section, and related `prefs` state/`useEffect`/`updatePref`

## Version 0.14.0 (2026-02-21)

### Added
- **Firebase Cloud Integration** — Full Firestore cloud storage backend with real-time sync, replacing the skeleton driver from v0.13.0
- **Data migration** — Bidirectional local↔cloud migration with collision detection (skip if user already has project, generate new ID if belongs to someone else)
- **Project sharing** — Share cloud projects with other users by email; member management with owner/editor/viewer roles
- **Shared project badge** — Purple "Shared" badge on ProductList for projects owned by other users

### Fixed
- **Migration changelog bug** — `appendChangeLogEntry` returns a `_changeLog` array, not a product object; migration now correctly applies the returned array back to the product

### Technical
- `createFirestoreDriver(uid)` fully implemented: CRUD via `setDoc`/`getDoc`/`deleteDoc`, debounced saves (500ms product, 200ms prefs), real-time sync via `onSnapshot` with `hasPendingWrites` echo prevention
- Ownership safety: `saveProduct`/`saveProductImmediate` never include `owner`/`members`; new `createProduct` method sets ownership only during creation
- `sanitizeForFirestore()` recursively strips `undefined` values before Firestore writes
- New `migration.js` with `migrateLocalToCloud(uid)` and `migrateCloudToLocal(uid)` — collision-aware upload, owned-only download, changelog entries
- New `SharingSection.jsx` — reads/writes Firestore directly for member management, profile lookup by email
- `StorageSection` wired with real migration logic, progress indicators, result messages
- Fingerprinting adaptations: `createNewProduct`, `duplicateProduct`, `exportProduct` accept optional workspace ID override for cloud mode (Firebase UID vs localStorage UUID)
- Uniform `loadProductIndex` — both drivers return full product data, eliminating per-product `loadProduct` calls in ProductList
- 5 new tests (migration), 6 new tests (storage optional params), 326 total across 15 files

## Version 0.13.0 (2026-02-21)

### Added
- **Cloud storage architecture** — Storage abstraction layer with async driver interface supporting both localStorage and future Firestore backends
- **Authentication provider** — Firebase Auth integration with Google and Microsoft SSO (activated when Firebase environment variables are configured)
- **Storage provider** — Auth-aware storage context with mode switching (local/cloud), loading gate to prevent flash of stale data
- **Storage settings** — New section in Settings for toggling storage mode, signing in, and viewing account info (hidden when Firebase is not configured)

### Technical
- New `storageDriver.js` with `createLocalStorageDriver()` (async wrapper over localStorage) and `createFirestoreDriver()` (skeleton for v0.14.0)
- `AuthProvider` + `StorageProvider` context hierarchy wrapping the app
- `useProduct` hook refactored from synchronous init to async loading via driver, with cloud sync subscription support
- `ProductList` refactored to async loading via driver with mode-aware data warning
- `ProductLayout` uses driver for save error subscription
- `SettingsView` uses driver for preferences load/save and product import
- Extracted reusable `Section` and `Field` components to `src/components/ui/Section.jsx`
- 24 new tests for storage driver abstraction (321 total)

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
