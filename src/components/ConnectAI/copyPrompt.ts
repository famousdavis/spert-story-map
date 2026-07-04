// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The "Copy Prompt" payload the user pastes into their AI chatbot. The
 * canonical WORD-NNNN pairing code is interpolated in. Keep the modeling
 * guidance in sync with the MCP tool descriptions in the Landing Page repo.
 */
export function buildCopyPrompt(code: string): string {
  return `I want to build a story map for a software product using SPERT Story Map.

WHAT IS A STORY MAP?
A story map captures the breadth and depth of what a product team wants to build.
It has three levels:
- Themes: broad groupings of the work. USE ONE THEME BY DEFAULT. Only add a second
  theme if your product spans truly distinct domains with no overlap (e.g., a platform
  that serves both end customers and internal ops teams). Don't create multiple themes
  just because the tool allows it.
- Backbones: the middle tier. What they represent depends on the modeling approach (see below).
- Ribs: individual user stories or build tasks within each backbone.

MODELING APPROACHES — I'll pick one with your help:
1. Workflow — backbones are steps in a user's workflow (Search → Select → Checkout);
   ribs are tasks at each step. Good for mapping a user journey end-to-end.
2. Capability — backbones are named product capabilities (Authentication, Reporting,
   Notifications); ribs are user stories or build tasks to deliver each capability.
3. Epic/Story — backbones are epics from your existing backlog; ribs are user stories
   within each epic. Good when you already have a backlog structure you want to visualize.
4. Journey Stage — backbones are lifecycle phases (Onboarding, Growth, Retention);
   ribs are product initiatives or features supporting each phase. Good for strategic roadmaps.
5. Something else — if your product doesn't fit these patterns, describe how you'd
   like to organize it and we'll figure out the right structure together.

MY PAIRING CODE IS: ${code}

INSTRUCTIONS FOR YOU:
Call resolve_session_code with my code, then call get_session_info to confirm which
project is open.
Call resolve_session_code exactly once — it is single-use and will fail if called again. The session remains active for the entire conversation after that first successful call. Do not call resolve_session_code again at any point.
To build a new map from scratch: first ask me what product I am planning and which modeling
approach fits best — do not write anything until I have answered. Then pick a build method:
- FAST PATH (storymap_bulk_import): builds the entire map in one call, but is capped at
  5 themes, 10 backbones per theme, and 10 ribs per backbone. Use it ONLY IF BOTH are true:
  (a) you can reliably construct deeply nested tool inputs, and (b) the map fits those caps.
- RELIABLE PATH (fine-grained tools): storymap_create_theme, then storymap_create_backbone
  for each backbone, then storymap_create_rib for each rib — one at a time — await each
  result and immediately call the next, all within the same response. Do not stop to
  narrate progress between calls. No per-call size cap (only a per-minute rate limit;
  pause briefly if throttled).
If you are Microsoft Copilot Chat — or any assistant that cannot reliably build deeply
nested tool inputs — do NOT attempt storymap_bulk_import at all. Use the fine-grained tools
from the start. If you ever try bulk_import and get an error mentioning an invalid property
or structure (e.g. "structure.themes.name is not a valid property"), do NOT retry it; switch
to the fine-grained tools immediately.
If the map we designed exceeds bulk_import's caps (5 themes / 10 backbones per theme /
10 ribs per backbone), either ask me to shrink it to fit or use the fine-grained tools
instead — never silently drop themes, backbones, or ribs to make it fit.
The finished map is identical whichever path you use; only the speed differs.
To add to or edit an existing map: call storymap_get_project first to see the current
structure and entity IDs. This requires Read Mode — if I have not enabled it, ask me
to turn it on in the Connect AI panel. Then use the fine-grained tools for targeted
changes: storymap_create_theme, storymap_create_backbone, storymap_create_rib for
additions; storymap_update_theme, storymap_update_backbone, storymap_update_rib for
edits. Call tools sequentially — await each result and immediately call the next within
the same response. Do not pause between calls to report progress. Complete the full
sequence before summarizing. Only stop mid-sequence if a tool returns an error or a
structural mismatch requires user input.
For each new entity (theme, backbone, rib), generate a fresh UUID as its ID.

RELEASE PLANNING (separate step — only when the user explicitly asks):
Release planning is an optional second phase. Build and confirm the map structure first.
Only proceed with releases after the user asks you to.

COUNTING RELEASES: Ask the user how many releases they want and what to name them. Never
infer a release count from the map structure or the product description.

ORDERING DISCIPLINE — CRITICAL: Create all releases first, then allocate. Do not interleave.
Reason: storymap_allocate_rib silently skips if the target release doesn't yet exist — there
is no error, so you will not know the allocation was lost. Create every release (await each
result before the next, all within the same response), then allocate ribs to them.
Same rule for backbones: create a backbone before moving ribs into it — storymap_move_rib
silently skips a target backbone that doesn't exist yet.

READ MODE:
- storymap_create_release does NOT require Read Mode (like create_theme, you only need a
  name and a UUID; you don't need to read the current map state).
- storymap_allocate_rib, storymap_unassign_rib, and storymap_move_rib REQUIRE Read Mode.
  Call storymap_get_project first to obtain rib IDs and each rib's releaseIds, locked, and
  partial state. If Read Mode is off, ask the user to enable it in the Connect AI panel
  before proceeding.

RE-RUN / ADDITIVE SEMANTICS:
- storymap_allocate_rib skips any rib that already has an allocation. It never overwrites.
  Re-running is safe; already-allocated ribs are simply skipped.
- To MOVE a rib to a different release: use storymap_move_rib (one call — it replaces the
  old unassign-then-allocate two-step). For a rib whose allocation is a percentage split
  or a single partial allocation under 100%, the release change is skipped instead — call
  storymap_unassign_rib first, then storymap_move_rib.
- To MOVE many ribs at once: use storymap_bulk_move_ribs. The same split/partial rule
  applies per entry. Both move tools require Read Mode.
- storymap_unassign_rib and storymap_bulk_unassign remove ALL of a rib's allocations
  (skip locked ribs; no-op if already unassigned).

MOVING RIB ITEMS:
storymap_move_rib moves a rib to a different backbone, a different release, or both, in
one call. The two changes apply independently — an invalid target for one never blocks
the other. The target backbone may belong to ANY theme, not just the rib's current one.
- Locked ribs (in progress): only the release change is blocked; the backbone change
  still applies.
- Split or partial allocations: if a rib's releaseIds has more than one entry (a split),
  or partial is true in storymap_get_project (a single allocation under 100%), the
  release change is skipped rather than overwritten. To actually reassign such a rib's
  release, call storymap_unassign_rib first, then storymap_move_rib.
- Check locked, releaseIds, and partial in storymap_get_project BEFORE calling to know
  whether the release change will apply.
- A moved rib lands at the END of its destination backbone; position cannot be specified.
- Moving a rib between backbones may also drop it to the bottom of its release's column
  on the Release Planning board, even though its release did not change — a known,
  accepted cosmetic side effect, not a bug. Explain this if the user asks why their
  board reordered.
- After moving a rib, call storymap_get_project again before calling storymap_update_rib
  on it — update_rib addresses a rib through its backbone, and the pre-move location
  will no longer match, causing a silent no-op.

CONSTRAINTS:
- Whole-rib, single-release, 100% only. You cannot split a rib across releases.
  If the user wants a split, direct them to the Release Planning board in the app.
- Locked ribs (in progress) cannot be allocated or unassigned, and storymap_move_rib
  skips their release change (their backbone CAN still be changed). If a rib has
  locked: true in storymap_get_project, tell the user — its release assignment must be
  changed manually.
- Never set a target date. Do not include targetDate in any create_release call.
- If a rib's releaseIds has more than one entry (a percentage split set by the user),
  warn the user before calling storymap_unassign_rib or including that rib in a
  storymap_bulk_unassign batch — both remove the rib from ALL its releases, not just one.

RELEASE IDs: Generate a fresh UUID for each new release (same rule as for themes, backbones, ribs).

BULK TOOLS (preferred when working with many ribs at once):
Use bulk tools when allocating, sizing, unassigning, moving, or updating rib content
(description, category, notes) — they collapse N round-trips into one call. This is
critical for AI clients that yield to the user between tool calls.

WHEN TO USE BULK:
- Allocating, sizing, or unassigning more than a handful of ribs → use
  storymap_bulk_allocate / storymap_bulk_size / storymap_bulk_unassign instead of
  repeated individual tool calls.
- Updating description, category, or notes on more than a handful of ribs → use
  storymap_bulk_update_ribs instead of repeated storymap_update_rib calls.
- Redistributing many ribs across backbones or releases → use storymap_bulk_move_ribs.
  Its array-of-objects payload is a shape Microsoft Copilot Chat cannot reliably
  construct — if you are Copilot, use sequential storymap_move_rib calls instead.
- Creating multiple releases at once → use storymap_bulk_create_releases.
- A single targeted change (one rib, one action) → individual tools are fine.

BULK RELEASE PLANNING (two calls total):
1. storymap_bulk_create_releases — Does NOT require Read Mode. Provide an array of
   {releaseId, name} objects; generate a fresh UUID per releaseId. Await the result.
2. storymap_bulk_allocate — Requires Read Mode (call storymap_get_project first for
   ribIds, releaseIds, and locked state). Provide an array of {ribId, releaseId} objects.
Same ordering rule as the individual tools: releases must exist before you allocate.
An allocation silently skips if its target release does not yet exist.

BULK SIZING:
storymap_bulk_size — Requires Read Mode (call storymap_get_project first for ribIds,
current size, locked state, and sizeMapping). Provide {ribId, size} objects; use only
labels from sizeMapping.

READ MODE SUMMARY:
- storymap_bulk_create_releases: does NOT require Read Mode.
- storymap_bulk_allocate / storymap_bulk_size / storymap_bulk_unassign
  / storymap_bulk_update_ribs / storymap_bulk_move_ribs: REQUIRE Read Mode.

ADDITIVE / RE-RUN SEMANTICS (all six bulk tools):
- storymap_bulk_create_releases skips duplicate releaseIds.
- storymap_bulk_allocate skips ribs that are locked, already allocated, or whose
  target release does not exist.
- storymap_bulk_size skips ribs that are locked, already validly sized, or whose
  size label is not in sizeMapping.
- storymap_bulk_unassign skips ribs that are locked or already unassigned.
- storymap_bulk_move_ribs REPLACES a rib's backbone and/or release allocation per entry.
  Entries already at their target are skipped (no-op on re-run), but re-running can
  overwrite a manual backbone or release change made since the first run — the same
  caveat as storymap_bulk_update_ribs. Ineligible release changes (locked, split,
  partial) are skipped per entry.
- storymap_bulk_update_ribs REPLACES description, category, and notes when provided;
  omitted fields are left unchanged. It does NOT skip locked ribs for text edits —
  you can update a rib that is in progress. Re-running writes the same values again
  (not ref-equal; appends one additional changelog entry each time).
Re-running the other four bulk calls is safe and ref-equal. Verify results by calling
storymap_get_project after — the tool response confirms the call was queued, not which
entries applied. Note: storymap_get_project does not return notes values; description
and category can be verified that way, but notes cannot.

CHUNKING:
- More than 500 ribs to allocate, size, unassign, move, or update → split into bulk calls of ≤500 each.
- More than 50 releases to create → split into calls of ≤50 each.

BULK CONTENT UPDATES (description, category, notes):
storymap_bulk_update_ribs — Requires Read Mode (call storymap_get_project first for
ribIds). Provide an array of {ribId, description?, category?, notes?} objects. Only
the fields you include are updated; omitted fields are left exactly as they are. An
empty string "" clears a field. No size or name field — use storymap_bulk_size for
sizing and storymap_update_rib for renaming. Locked ribs (in progress) can still have
their description, category, and notes updated. Max 500 per call.

NOTE ON NOTES: storymap_get_project does not return existing notes values, so you
cannot read notes before writing. When you write notes via storymap_bulk_update_ribs,
you are replacing whatever the user has there, unseen. Use this tool to set notes
content you are confident should replace the existing value — not to append to or
extend notes you have not read.

SIZING (separate step — only when the user explicitly asks):
Sizing assigns a t-shirt size to each rib item. Build and confirm the map structure first.
Only proceed with sizing after the user explicitly asks you to.

READ MODE REQUIRED: Call storymap_get_project before any sizing. You need the project's
sizeMapping (valid labels and point values), each rib's id and current size, and each rib's
locked state. If Read Mode is off, ask the user to enable it in the Connect AI panel.

SIZE MAPPING — CRITICAL: Use only size labels that appear in the project's sizeMapping. Never
invent labels or assume the seven defaults (XS/S/M/L/XL/XXL/XXXL) — this project may use
entirely different labels. An unknown label is silently skipped with no error: you will not
know the size was lost. Always read sizeMapping first.

For sizing multiple ribs, use storymap_bulk_size (one call). For a single rib, use
storymap_size_rib. Never use storymap_update_rib for sizing — it bypasses sizeMapping
validation and can create invalid sizes for projects with custom size labels.
For updating description, category, or notes on multiple ribs, use
storymap_bulk_update_ribs (one call) instead of repeated storymap_update_rib calls.

If sizeMapping is empty, stop and tell the user to define t-shirt sizes in the app's Settings
tab before sizing can proceed.

REASONING FROM POINTS: Use the points values in sizeMapping to reason about scale, not just
letter labels. If XL is 5× the points of M, that step represents much larger effort than a
step from S to M at 2×. Size each rib from its name and description against the actual scale.

ADDITIVE SEMANTICS: storymap_size_rib skips any rib that already has a valid size and never
overwrites. Re-running is safe; already-sized ribs are simply skipped. To change an existing
size or clear one, direct the user to the Sizing board in the app — storymap_size_rib cannot
resize or clear.

LOCKED RIBS: Locked ribs (locked: true) have their size frozen. The AI cannot resize them,
and neither can the Sizing board — both are blocked to protect historical progress math.
To resize a locked rib, its sprint progress must be cleared first, then sized in the app.

NO NEW UUIDs: Unlike create_* operations, storymap_size_rib targets existing ribs. Use ribIds
from storymap_get_project — do not generate new UUIDs for sizing calls.

If throttled (rate limit), pause briefly before retrying — same rule as fine-grained map-building.`;
}
