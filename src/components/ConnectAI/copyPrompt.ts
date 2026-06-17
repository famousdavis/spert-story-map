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

READ MODE:
- storymap_create_release does NOT require Read Mode (like create_theme, you only need a
  name and a UUID; you don't need to read the current map state).
- storymap_allocate_rib and storymap_unassign_rib REQUIRE Read Mode. Call storymap_get_project
  first to obtain rib IDs and each rib's releaseIds and locked state. If Read Mode is off,
  ask the user to enable it in the Connect AI panel before proceeding.

RE-RUN / ADDITIVE SEMANTICS:
- storymap_allocate_rib skips any rib that already has an allocation. It never overwrites.
  Re-running is safe; already-allocated ribs are simply skipped.
- To MOVE a rib to a different release: call storymap_unassign_rib first, then
  storymap_allocate_rib.
- To MOVE many ribs at once: call storymap_bulk_unassign (all the ribIds), then
  storymap_bulk_allocate. Both require Read Mode.
- storymap_unassign_rib and storymap_bulk_unassign remove ALL of a rib's allocations
  (skip locked ribs; no-op if already unassigned).

CONSTRAINTS:
- Whole-rib, single-release, 100% only. You cannot split a rib across releases.
  If the user wants a split, direct them to the Release Planning board in the app.
- Locked ribs (in progress) cannot be allocated or unassigned. If a rib has locked: true
  in storymap_get_project, tell the user — it must be changed manually.
- Never set a target date. Do not include targetDate in any create_release call.
- If a rib's releaseIds has more than one entry (a percentage split set by the user),
  warn the user before calling storymap_unassign_rib or including that rib in a
  storymap_bulk_unassign batch — both remove the rib from ALL its releases, not just one.

RELEASE IDs: Generate a fresh UUID for each new release (same rule as for themes, backbones, ribs).

BULK TOOLS (preferred when working with many ribs at once):
Use bulk tools when allocating, sizing, or unassigning more than a handful of ribs — they collapse N
round-trips into one call. This is critical for AI clients that yield to the user between
tool calls.

WHEN TO USE BULK:
- Allocating, sizing, or unassigning more than a handful of ribs → use
  storymap_bulk_allocate / storymap_bulk_size / storymap_bulk_unassign instead of
  repeated individual tool calls.
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
- storymap_bulk_allocate / storymap_bulk_size / storymap_bulk_unassign: REQUIRE Read Mode.

ADDITIVE / RE-RUN SEMANTICS (all four bulk tools):
- storymap_bulk_create_releases skips duplicate releaseIds.
- storymap_bulk_allocate skips ribs that are locked, already allocated, or whose
  target release does not exist.
- storymap_bulk_size skips ribs that are locked, already validly sized, or whose
  size label is not in sizeMapping.
- storymap_bulk_unassign skips ribs that are locked or already unassigned.
Re-running any bulk call is safe. Verify results by calling storymap_get_project after —
the tool response confirms the call was queued, not which entries applied.

CHUNKING:
- More than 500 ribs to allocate, size, or unassign → split into bulk calls of ≤500 each.
- More than 50 releases to create → split into calls of ≤50 each.

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
