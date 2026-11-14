// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

export const AI_PRIVACY_URL = 'https://spertsuite.com/ai-privacy';
export const AI_CONSENT_NOTICE_URL = 'https://spertsuite.com/ai-consent-notice';
export const AI_CONSENT_VERSION = 1;
export const AI_SESSION_ID_KEY = 'spert_ai_session_id';
export const AI_CONSENT_KEY = 'spert_ai_consent';
export const AI_LAST_SEQ_PREFIX = 'spert_ai_last_seq:';
// B-04: when sign-out cannot reach the server to end the Connect AI session
// (e.g. offline), the session id is parked here so the teardown can be retried
// on the next load / when the browser is back online, and so the user can be
// told the AI may still have access until then. Holds the session id string.
export const AI_TEARDOWN_PENDING_KEY = 'spert_ai_teardown_pending';
// B15: one record per product, `spert_ai_session:{productId}` →
// `{ sessionId, productName, startedAt }`. AI_SESSION_ID_KEY above is no longer
// written; it is read only to find a session from before v0.55.11 (a "legacy"
// session), which is never resumed and is ended when another session starts,
// unless it is in use.
export const AI_SESSION_KEY_PREFIX = 'spert_ai_session:';
// B15: sessions Story Map tried to end when another product's session started,
// and could not reach the server for. A JSON list of ids, retried silently by
// the same load / online retry as AI_TEARDOWN_PENDING_KEY. No banner: that
// banner speaks about signing out.
export const AI_END_PENDING_KEY = 'spert_ai_end_pending';
