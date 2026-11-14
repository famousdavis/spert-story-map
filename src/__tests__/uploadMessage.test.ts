// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/** v0.55.15 (R-3): what the upload says, word for word, and its status. */
import { describe, it, expect } from 'vitest';
import { uploadMessage, clearOfferMessage, UPLOAD_STOPPED } from '../components/settings/uploadMessage';

const outcome = (uploaded: number, skipped: { name: string; cloudName?: string }[] = [], unreadable = 0) => ({
  uploadedIds: Array.from({ length: uploaded }, (_, i) => `id${i}`),
  skipped: skipped.map((s, i) => ({ localId: `s${i}`, name: s.name, cloudName: s.cloudName ?? s.name })),
  unreadable,
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
    const ASK = 'Your uploaded products are now in the cloud. Clear their copies from this browser?';
    expect(clearOfferMessage(outcome(2))).toBe(ASK);
    expect(clearOfferMessage(outcome(1, [{ name: 'A' }]))).toBe(`${ASK} The products that were not uploaded stay in this browser.`);
    expect(clearOfferMessage(outcome(1, [], 1))).toBe(`${ASK} The products that were not uploaded stay in this browser.`);
  });
});
