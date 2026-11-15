// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * What the Storage section says (v0.55.15, R-3, R68, R72). The status is decided here, with the
 * words, and never read back out of them: ok (everything uploaded), notice (anything skipped or
 * unreadable, including nothing uploaded, or a colour and archive the cap kept out, v0.56.0), error
 * (the upload, or another storage action, stopped).
 */
import type { UploadOutcome } from '../../lib/migration';
import { MAX_PROJECT_PREFS } from '../../lib/projectPrefs';

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

/** At most MAX_NAMED of these, each already quoted, then "and N more". */
function nameList(quoted: string[]): string {
  const more = quoted.length > MAX_NAMED ? ` and ${quoted.length - MAX_NAMED} more` : '';
  return `${quoted.slice(0, MAX_NAMED).join(', ')}${more}`;
}

function skippedLine(skipped: UploadOutcome['skipped']): string {
  const named = skipped.map(s => (s.cloudName === s.name ? `“${s.name}”` : `“${s.name}” (in the cloud as “${s.cloudName}”)`));
  return `Already in the cloud, so not uploaded again: ${nameList(named)}. This browser still has its own copy of each, which may differ from the cloud version.`;
}

function headline({ uploadedIds, skipped }: UploadOutcome): string {
  if (uploadedIds.length > 0) return `Uploaded ${products(uploadedIds.length)} to the cloud.`;
  return skipped.length > 0 ? 'No new products to upload.' : 'No products uploaded.';
}

/**
 * `stayed`: the names of the products the person did not tick (v0.56.1, R71 R-4), which stay in
 * this browser only.
 */
export function uploadMessage(outcome: UploadOutcome, stayed: readonly string[] = []): StorageMessage {
  const lines = [headline(outcome)];
  if (stayed.length > 0) lines.push(`Not ticked, so kept in this browser only: ${nameList(stayed.map(n => `“${n}”`))}.`);
  if (outcome.skipped.length > 0) lines.push(skippedLine(outcome.skipped));
  if (outcome.unreadable > 0) {
    lines.push(`${products(outcome.unreadable)} could not be read and ${outcome.unreadable === 1 ? 'was' : 'were'} not uploaded.`);
  }
  if (outcome.prefsNotCopied > 0) {
    lines.push(`Tile colors and archive were not copied for ${products(outcome.prefsNotCopied)}: they can be kept for at most ${MAX_PROJECT_PREFS} products.`);
  }
  const allSent = outcome.skipped.length === 0 && outcome.unreadable === 0 && outcome.prefsNotCopied === 0;
  return { status: allSent ? 'ok' : 'notice', text: lines.join(' ') };
}

/**
 * The clear offered after an upload, or null when nothing was uploaded (R72: it removes only what was
 * sent). It names what it removes and says everyone using this browser loses it (v0.56.1, R71 R-4):
 * the products in this browser are everyone's.
 */
export function clearOfferMessage(outcome: UploadOutcome, uploadedNames: readonly string[] = [], stayedAny = false): string | null {
  const n = outcome.uploadedIds.length;
  if (n === 0) return null;
  const one = n === 1;
  const what = uploadedNames.length > 0 ? nameList(uploadedNames.map(x => `“${x}”`)) : `the ${one ? 'uploaded product' : 'uploaded products'}`;
  const ask = `Remove ${what} from this browser? ${one ? 'It is' : 'They are'} now in your cloud account. Everyone who uses this browser will no longer have ${one ? 'it' : 'them'} here.`;
  const keptAny = outcome.skipped.length > 0 || outcome.unreadable > 0 || stayedAny;
  return keptAny ? `${ask} The products that were not uploaded stay in this browser.` : ask;
}
