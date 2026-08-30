// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Crosslink — the SENDER half, in spert-story-map.
 *
 * ⚠️ A file with this exact basename exists in BOTH repos:
 *   - `spert-story-map/src/lib/crosslinkProtocol.ts`                      ← THIS FILE, the SENDER
 *   - `spert-forecaster/src/features/projects/lib/crosslinkProtocol.ts`   ← the RECEIVER
 * The shared basename is deliberate — the two halves speak one protocol and are easiest to
 * read side by side — but it means a bare `crosslinkProtocol.ts` citation is ambiguous. Cite
 * the path, and remember which tree you have open.
 *
 * ── WHAT THIS IS ────────────────────────────────────────────────────────────
 * Story Map can hand a Forecaster export straight to the Forecaster tab instead of making
 * the user download a file and upload it again. The JSON download is NOT going away: it is
 * still the only cross-device route, and it stays exactly where it was.
 *
 * The exchange, all of it `window.postMessage` between an opener and the popup it opened:
 *
 *   OPEN   (FC → opener)  { opcode:'crosslink-open',  protocol, exchangeId }
 *   OFFER  (SM → child)   { opcode:'crosslink-offer', protocol, exchangeId,
 *                           exportText, senderDeadlineAt }
 *   ACK    (FC → opener)  { opcode:'crosslink-ack',   protocol, exchangeId, didApply }
 *   NACK   (FC → opener)  { opcode:'crosslink-nack',  protocol, exchangeId, nackReason }
 *
 * The SENDER mints `exchangeId` and puts it in the popup URL; the receiver latches it and
 * echoes it in OPEN. Minting on the receiver would be circular — the sender would have to
 * match OPEN against an id it does not hold yet.
 *
 * ── WHY A PURE REDUCER ──────────────────────────────────────────────────────
 * Everything that decides anything lives in `reduceSender`, which touches no window, no
 * timer and no DOM. That is what makes two-concurrent-popup behaviour testable without a
 * browser. The impure parts — opening the window, comparing `event.source`, posting — stay
 * in `sendToForecaster.ts` and are a thin shell over this.
 */

/** Envelope version. Deliberately NOT the export's `version: '1.0'`, which is the payload format. */
export const CROSSLINK_PROTOCOL = 1;

/**
 * Budget for the WHOLE exchange — open, handshake, transfer, ingest, reply.
 *
 * Unmeasured, and chosen rather than derived: 30s comfortably covers a cold Firestore
 * hydration on the receiving side (the case the receiver's hold queue exists for) while
 * still failing before a user concludes the button is broken. If it ever needs tuning, the
 * receiver does NOT need changing with it — see `senderDeadlineAt` below.
 */
export const CROSSLINK_TIMEOUT_MS = 30_000;

export type CrosslinkOpcode =
  | 'crosslink-open'
  | 'crosslink-offer'
  | 'crosslink-ack'
  | 'crosslink-nack';

export interface CrosslinkOpen {
  opcode: 'crosslink-open';
  protocol: number;
  exchangeId: string;
}

export interface CrosslinkOffer {
  opcode: 'crosslink-offer';
  protocol: number;
  exchangeId: string;
  /** The export as TEXT — byte-identical to what the JSON download writes. */
  exportText: string;
  /**
   * When this sender stops listening, as an ABSOLUTE `Date.now()` epoch-ms instant.
   *
   * Absolute, not a remaining duration: opener and popup share one clock, and a duration
   * measured at send time is already stale by the OPEN→OFFER round trip. The receiver
   * derives its hold expiry from this instead of from a constant it cannot see, so the two
   * sides cannot drift apart — there is only one number, and it travels.
   */
  senderDeadlineAt: number;
}

export interface CrosslinkAck {
  opcode: 'crosslink-ack';
  protocol: number;
  exchangeId: string;
  /**
   * FALSE is not a failure. A payload that conflicts with existing projects opens a preview
   * and imports nothing until a human clicks Confirm — that is the designed path, and the
   * sender's copy must not claim success.
   */
  didApply: boolean;
}

export interface CrosslinkNack {
  opcode: 'crosslink-nack';
  protocol: number;
  exchangeId: string;
  nackReason: string;
}

// ── The sender's state machine ──────────────────────────────────────────────

export type SenderOutcome =
  | { kind: 'applied' }
  | { kind: 'needs-review' }
  | { kind: 'refused'; nackReason: string }
  | { kind: 'timed-out' };

export interface SenderState {
  readonly phase: 'awaiting-open' | 'awaiting-reply' | 'settled';
  readonly exchangeId: string;
  readonly outcome: SenderOutcome | null;
}

/**
 * `fromOpenedWindow` and `originMatches` are computed by the caller, not here: comparing
 * `event.source` to a `WindowProxy` cannot be done purely. Passing the verdicts in keeps
 * every decision in this file and every window touch out of it.
 */
export type SenderEvent =
  | { type: 'message'; originMatches: boolean; fromOpenedWindow: boolean; data: unknown }
  | { type: 'timeout' };

export type SenderEffect =
  | { type: 'ignore' }
  | { type: 'send-offer' }
  | { type: 'settle'; outcome: SenderOutcome };

export function initialSenderState(exchangeId: string): SenderState {
  return { phase: 'awaiting-open', exchangeId, outcome: null };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function reduceSender(
  state: SenderState,
  event: SenderEvent,
): { state: SenderState; effect: SenderEffect } {
  if (state.phase === 'settled') return { state, effect: { type: 'ignore' } };

  if (event.type === 'timeout') {
    const outcome: SenderOutcome = { kind: 'timed-out' };
    return { state: { ...state, phase: 'settled', outcome }, effect: { type: 'settle', outcome } };
  }

  // Identity first, and silently. A message from anywhere else is not ours to answer, and
  // replying would tell an unknown page that this exchange exists.
  if (!event.originMatches || !event.fromOpenedWindow) return { state, effect: { type: 'ignore' } };

  const msg = asRecord(event.data);
  if (!msg) return { state, effect: { type: 'ignore' } };
  if (msg.protocol !== CROSSLINK_PROTOCOL) return { state, effect: { type: 'ignore' } };
  // The discriminator that makes two concurrent popups safe: popup B echoes B's id, so its
  // OPEN cannot satisfy flow A even though both arrive on the same window's listener.
  if (msg.exchangeId !== state.exchangeId) return { state, effect: { type: 'ignore' } };

  if (state.phase === 'awaiting-open') {
    if (msg.opcode !== 'crosslink-open') return { state, effect: { type: 'ignore' } };
    return { state: { ...state, phase: 'awaiting-reply' }, effect: { type: 'send-offer' } };
  }

  const outcome = replyOutcome(msg);
  if (!outcome) return { state, effect: { type: 'ignore' } };
  return { state: { ...state, phase: 'settled', outcome }, effect: { type: 'settle', outcome } };
}

/** The outcome an ACK or NACK carries, or `null` if this is neither. */
function replyOutcome(msg: Record<string, unknown>): SenderOutcome | null {
  if (msg.opcode === 'crosslink-ack') {
    // ⚠️ `didApply: false` is NOT a failure — a conflicting payload opens a preview over
    // there and waits for a human. Reporting it as success is the specific thing this field
    // exists to prevent.
    return msg.didApply === true ? { kind: 'applied' } : { kind: 'needs-review' };
  }
  if (msg.opcode === 'crosslink-nack') {
    return {
      kind: 'refused',
      nackReason: typeof msg.nackReason === 'string' && msg.nackReason.length > 0
        ? msg.nackReason
        : 'SPERT Forecaster refused the transfer without giving a reason.',
    };
  }
  return null;
}

/** The user-facing sentence for a settled exchange. Empty array means it landed. */
export function describeOutcome(outcome: SenderOutcome): string[] {
  switch (outcome.kind) {
    case 'applied':
      return [];
    case 'needs-review':
      return ['SPERT Forecaster opened this project for review. Switch to that tab to finish the import.'];
    case 'refused':
      return [`SPERT Forecaster did not accept the transfer: ${outcome.nackReason}`];
    case 'timed-out':
      return [
        'SPERT Forecaster did not respond in time. Use "Export for SPERT Forecaster" to download the file and import it there.',
      ];
  }
}
