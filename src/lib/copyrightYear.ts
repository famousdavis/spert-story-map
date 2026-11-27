// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The year in the © line (FRAME26 pass 3, Y1, v0.59.0): the current year, read from one place so the footer and the
 * About page's Version and license block can never show two different years.
 */
export const copyrightYear = (): number => new Date().getFullYear();
