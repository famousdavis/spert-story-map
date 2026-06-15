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
  for each backbone, then storymap_create_rib for each rib — one at a time, awaiting each
  result. No per-call size cap (only a per-minute rate limit; pause briefly if throttled).
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
edits. Call tools strictly one at a time — await each result before the next.
For each new entity (theme, backbone, rib), generate a fresh UUID as its ID.`;
}
