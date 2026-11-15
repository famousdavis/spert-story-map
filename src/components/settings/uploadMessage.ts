// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * What the Storage section says (v0.55.15, R-3, R68, R72). The status is decided here, with the
 * words, and never read back out of them: ok (everything uploaded), notice (anything skipped or
 * unreadable, including nothing uploaded), error (the upload, or another storage action, stopped).
 */
import type { UploadOutcome } from '../../lib/migration';

export type StorageStatus = 'ok' | 'notice' | 'error';
export interface StorageMessage { status: StorageStatus; text: string }

/** At most this many skipped products are named; the rest are counted. */
const MAX_NAMED = 10;

export const STATUS_CLASS: Record<StorageStatus, string> = {
  ok: 'text-green-600 dark:text-green-400',
  notice: 'text-amber-700 dark:text-amber-400',
  error: 'text-red-500 dark:text-red-400',
};

const products = (n: number) => `${n} product${n === 1 ? '' : 's'}`;

export const UPLOAD_STOPPED: StorageMessage = {
  status: 'error',
  text: 'The upload stopped before it finished. Products it had already uploaded are in the cloud, and uploading again will not add them twice.',
};

function skippedLine(skipped: UploadOutcome['skipped']): string {
  const named = skipped.slice(0, MAX_NAMED).map(s => (s.cloudName === s.name ? `“${s.name}”` : `“${s.name}” (in the cloud as “${s.cloudName}”)`));
  const more = skipped.length > MAX_NAMED ? ` and ${skipped.length - MAX_NAMED} more` : '';
  return `Already in the cloud, so not uploaded again: ${named.join(', ')}${more}. This browser still has its own copy of each, which may differ from the cloud version.`;
}

function headline({ uploadedIds, skipped }: UploadOutcome): string {
  if (uploadedIds.length > 0) return `Uploaded ${products(uploadedIds.length)} to the cloud.`;
  return skipped.length > 0 ? 'No new products to upload.' : 'No products uploaded.';
}

export function uploadMessage(outcome: UploadOutcome): StorageMessage {
  const lines = [headline(outcome)];
  if (outcome.skipped.length > 0) lines.push(skippedLine(outcome.skipped));
  if (outcome.unreadable > 0) {
    lines.push(`${products(outcome.unreadable)} could not be read and ${outcome.unreadable === 1 ? 'was' : 'were'} not uploaded.`);
  }
  const allSent = outcome.skipped.length === 0 && outcome.unreadable === 0;
  return { status: allSent ? 'ok' : 'notice', text: lines.join(' ') };
}

/** The clear offered after an upload, or null when nothing was uploaded (R72: it removes only what was sent). */
export function clearOfferMessage(outcome: UploadOutcome): string | null {
  if (outcome.uploadedIds.length === 0) return null;
  const ask = 'Your uploaded products are now in the cloud. Clear their copies from this browser?';
  const keptAny = outcome.skipped.length > 0 || outcome.unreadable > 0;
  return keptAny ? `${ask} The products that were not uploaded stay in this browser.` : ask;
}
