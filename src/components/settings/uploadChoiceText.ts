// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.56.1 (R71 R-4): the upload list's words.

/** "Last edited 14 Nov 2026, 12:00", in the browser's own date format. */
export function lastEditedText(updatedAt: string | undefined): string {
  const t = updatedAt ? Date.parse(updatedAt) : NaN;
  if (Number.isNaN(t)) return 'Last edited: not recorded';
  return `Last edited ${new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
}

export const UPLOAD_CHOICE_INTRO =
  'These products are stored in this browser, and anyone who uses it can see them. Tick the ones to upload to your cloud account. The rest stay in this browser.';
