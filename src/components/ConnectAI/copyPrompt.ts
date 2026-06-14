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
To build a new map from scratch: ask me what product I am planning and which modeling
approach fits best. Do not call storymap_bulk_import until I have answered.
To add to or edit an existing map: call storymap_get_project first to see the current
structure and entity IDs. This requires Read Mode — if I have not enabled it, ask me
to turn it on in the Connect AI panel. Then use the fine-grained tools for targeted
changes: storymap_create_theme, storymap_create_backbone, storymap_create_rib for
additions; storymap_update_theme, storymap_update_backbone, storymap_update_rib for
edits. Call tools strictly one at a time — await each result before the next.
For each new entity (theme, backbone, rib), generate a fresh UUID as its ID.`;
}
