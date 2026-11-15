// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/** v0.55.15 (R-3): what the upload says, word for word, and its status. */
import { describe, it, expect } from 'vitest';
import { uploadMessage, clearOfferMessage, UPLOAD_STOPPED } from '../components/settings/uploadMessage';

const outcome = (uploaded: number, skipped: { name: string; cloudName?: string }[] = [], unreadable = 0, prefsNotCopied = 0) => ({
  uploadedIds: Array.from({ length: uploaded }, (_, i) => `id${i}`),
  skipped: skipped.map((s, i) => ({ localId: `s${i}`, name: s.name, cloudName: s.cloudName ?? s.name })),
  unreadable,
  prefsNotCopied,
});
const KEPT = 'This browser still has its own copy of each, which may differ from the cloud version.';

describe('uploadMessage', () => {
  it('everything uploaded: ok', () => {
    expect(uploadMessage(outcome(3))).toEqual({ status: 'ok', text: 'Uploaded 3 products to the cloud.' });
    expect(uploadMessage(outcome(1))).toEqual({ status: 'ok', text: 'Uploaded 1 product to the cloud.' });
  });

  it('some skipped: a notice naming them, with the cloud name where it differs', () => {
    expect(uploadMessage(outcome(1, [{ name: 'A' }, { name: 'B', cloudName: 'B 2' }]))).toEqual({
      status: 'notice',
      text: `Uploaded 1 product to the cloud. Already in the cloud, so not uploaded again: “A”, “B” (in the cloud as “B 2”). ${KEPT}`,
    });
  });

  it('none uploaded and some skipped: "No new products to upload."', () => {
    expect(uploadMessage(outcome(0, [{ name: 'A' }]))).toEqual({
      status: 'notice', text: `No new products to upload. Already in the cloud, so not uploaded again: “A”. ${KEPT}`,
    });
  });

  it('names at most ten, then "and N more"', () => {
    const names = Array.from({ length: 12 }, (_, i) => ({ name: `P${i + 1}` }));
    const listed = names.slice(0, 10).map(n => `“${n.name}”`).join(', ');
    expect(uploadMessage(outcome(0, names)).text).toBe(`No new products to upload. Already in the cloud, so not uploaded again: ${listed} and 2 more. ${KEPT}`);
  });

  it('exactly ten: all named, with no "and"', () => {
    const names = Array.from({ length: 10 }, (_, i) => ({ name: `P${i + 1}` }));
    const listed = names.map(n => `“${n.name}”`).join(', ');
    expect(uploadMessage(outcome(0, names)).text).toBe(`No new products to upload. Already in the cloud, so not uploaded again: ${listed}. ${KEPT}`);
  });

  it('eleven: ten named, then "and 1 more"', () => {
    const names = Array.from({ length: 11 }, (_, i) => ({ name: `P${i + 1}` }));
    const listed = names.slice(0, 10).map(n => `“${n.name}”`).join(', ');
    expect(uploadMessage(outcome(0, names)).text).toBe(`No new products to upload. Already in the cloud, so not uploaded again: ${listed} and 1 more. ${KEPT}`);
  });

  // v0.56.0 (PR #245 review -05): copies the cap kept out are said, in one line, never silently.
  it('colours and archive the cap kept out: one line, and a notice', () => {
    const CAP = 'they can be kept for at most 1000 products.';
    expect(uploadMessage(outcome(3, [], 0, 2))).toEqual({
      status: 'notice',
      text: `Uploaded 3 products to the cloud. Tile colors and archive were not copied for 2 products: ${CAP}`,
    });
    expect(uploadMessage(outcome(0, [{ name: 'A' }], 0, 1)).text).toBe(
      `No new products to upload. Already in the cloud, so not uploaded again: “A”. ${KEPT} Tile colors and archive were not copied for 1 product: ${CAP}`,
    );
  });

  it('unreadable: one, several, and alone', () => {
    expect(uploadMessage(outcome(2, [], 1))).toEqual({ status: 'notice', text: 'Uploaded 2 products to the cloud. 1 product could not be read and was not uploaded.' });
    expect(uploadMessage(outcome(0, [{ name: 'A' }], 3)).text).toBe(`No new products to upload. Already in the cloud, so not uploaded again: “A”. ${KEPT} 3 products could not be read and were not uploaded.`);
    expect(uploadMessage(outcome(0, [], 2))).toEqual({ status: 'notice', text: 'No products uploaded. 2 products could not be read and were not uploaded.' });
  });

  it('the stopped upload is an error', () => {
    expect(UPLOAD_STOPPED).toEqual({
      status: 'error',
      text: 'The upload stopped before it finished. Products it had already uploaded are in the cloud, and uploading again will not add them twice.',
    });
  });
});

describe('clearOfferMessage', () => {
  it('no offer when nothing was uploaded', () => {
    expect(clearOfferMessage(outcome(0, [{ name: 'A' }], 1))).toBeNull();
  });
  it('the offer, and the line about what stays when anything was not uploaded', () => {
    // v0.56.1 (R71 R-4): it names what it removes and says everyone using this browser loses it; no "Your".
    const TWO = 'Remove “B”, “C” from this browser? They are now in your cloud account. Everyone who uses this browser will no longer have them here.';
    const ONE = 'Remove “B” from this browser? It is now in your cloud account. Everyone who uses this browser will no longer have it here.';
    const STAY = 'The products that were not uploaded stay in this browser.';
    expect(clearOfferMessage(outcome(2), ['B', 'C'])).toBe(TWO);
    expect(clearOfferMessage(outcome(1, [{ name: 'A' }]), ['B'])).toBe(`${ONE} ${STAY}`);
    expect(clearOfferMessage(outcome(1, [], 1), ['B'])).toBe(`${ONE} ${STAY}`);
    expect(clearOfferMessage(outcome(1), ['B'], true)).toBe(`${ONE} ${STAY}`);
    expect(clearOfferMessage(outcome(2))).toBe('Remove the uploaded products from this browser? They are now in your cloud account. Everyone who uses this browser will no longer have them here.');
  });
  it('names at most ten products that stayed, then counts the rest', () => {
    const stayed = Array.from({ length: 12 }, (_, i) => `P${i + 1}`);
    expect(uploadMessage(outcome(1), stayed).text).toBe(`Uploaded 1 product to the cloud. Not ticked, so kept in this browser only: ${stayed.slice(0, 10).map(n => `“${n}”`).join(', ')} and 2 more.`);
  });
});
