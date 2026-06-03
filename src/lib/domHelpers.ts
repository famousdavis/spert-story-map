// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * True when a pointer press / click landed on an interactive control that must NOT
 * arm a card drag (Map) or open a card editor (Sizing).
 *
 * Shared by RibCell (Map) and SizingRibCell (Sizing) so the two tabs use one
 * predicate. Buttons cover the color swatch, clone/delete, and the kebab trigger;
 * `input` covers the inline-edit field; `[role="menu"]` covers the kebab popover.
 * The color-picker popover is excluded structurally (its root stops click
 * propagation), so it needs no clause here.
 */
export function isInteractiveChild(target: HTMLElement | null): boolean {
  return !!target?.closest('button, input, [role="menu"]');
}
