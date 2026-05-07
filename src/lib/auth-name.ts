// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.

/**
 * Normalize "Last, First Middle" → "First Middle Last".
 * Apply at every spertsuite_profiles write and display-name render.
 *
 * Mirror of denormalizeLastFirst in:
 *   spert-landing-page/functions/src/mailHeaders.ts
 * Both copies must stay in sync — see LESSONS-LEARNED §19.
 * DO NOT modify one without modifying the other.
 *
 * Multi-comma: "Last, First, Middle" → "First Middle Last"
 * (rest.join(' ') collects all segments after the first comma)
 */
export function denormalizeLastFirst(s: string): string {
  const parts = s.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length < 2) return s.trim();
  const [last, ...rest] = parts;
  return `${rest.join(" ")} ${last}`;
}
