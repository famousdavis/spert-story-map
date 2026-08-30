// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The SENDER half's pure reducer. No jsdom pragma is needed — that is the point of the
 * reducer existing: two concurrent popups are a browser scenario that is miserable to stage
 * by hand, and here it is three function calls.
 */
import { describe, it, expect } from 'vitest';
import {
  CROSSLINK_PROTOCOL,
  CROSSLINK_TIMEOUT_MS,
  describeOutcome,
  initialSenderState,
  reduceSender,
  type SenderEvent,
  type SenderState,
} from '../lib/crosslinkProtocol';

const XID = 'exchange-A';

const open = (exchangeId = XID) => ({
  opcode: 'crosslink-open',
  protocol: CROSSLINK_PROTOCOL,
  exchangeId,
});

const message = (data: unknown, over: Partial<Extract<SenderEvent, { type: 'message' }>> = {}): SenderEvent => ({
  type: 'message',
  originMatches: true,
  fromOpenedWindow: true,
  data,
  ...over,
});

/** State that has already received OPEN and posted its offer. */
function offered(): SenderState {
  return reduceSender(initialSenderState(XID), message(open())).state;
}

describe('crosslink sender — the handshake', () => {
  it('posts the offer once OPEN echoes the id it minted', () => {
    const { state, effect } = reduceSender(initialSenderState(XID), message(open()));
    expect(effect).toEqual({ type: 'send-offer' });
    expect(state.phase).toBe('awaiting-reply');
  });

  it('ignores OPEN from a different ORIGIN', () => {
    const { effect } = reduceSender(initialSenderState(XID), message(open(), { originMatches: false }));
    expect(effect).toEqual({ type: 'ignore' });
  });

  it('ignores OPEN from a window it did not open', () => {
    const { effect } = reduceSender(initialSenderState(XID), message(open(), { fromOpenedWindow: false }));
    expect(effect).toEqual({ type: 'ignore' });
  });

  it('ignores a wrong protocol', () => {
    const { effect } = reduceSender(
      initialSenderState(XID),
      message({ ...open(), protocol: 99 }),
    );
    expect(effect).toEqual({ type: 'ignore' });
  });

  it('ignores a non-object payload', () => {
    expect(reduceSender(initialSenderState(XID), message('nope')).effect).toEqual({ type: 'ignore' });
  });
});

// ── §6.4 · Two concurrent windows ───────────────────────────────────────────
describe('crosslink sender — two popups open at once', () => {
  it("popup B's OPEN must NOT satisfy flow A", () => {
    // Both listeners are on the SAME window, so both see both messages. The exchange id is
    // the only thing separating them — this is why the SENDER mints it, and why the
    // `_messageId` worker pattern was the wrong precedent: that one supersedes stale replies
    // from ONE peer, which would have let popup B overwrite popup A.
    const flowA = initialSenderState('exchange-A');
    const { state, effect } = reduceSender(flowA, message(open('exchange-B')));
    expect(effect).toEqual({ type: 'ignore' });
    expect(state.phase).toBe('awaiting-open');
  });

  it("and popup A's own OPEN still does — the control", () => {
    // Without this, the assertion above passes on a reducer that ignores everything.
    const flowA = initialSenderState('exchange-A');
    expect(reduceSender(flowA, message(open('exchange-A'))).effect).toEqual({ type: 'send-offer' });
  });

  it('keeps two flows independent all the way to their outcomes', () => {
    let a = reduceSender(initialSenderState('exchange-A'), message(open('exchange-A'))).state;
    let b = reduceSender(initialSenderState('exchange-B'), message(open('exchange-B'))).state;
    // B is refused; A must be untouched by it.
    const bNack = { opcode: 'crosslink-nack', protocol: 1, exchangeId: 'exchange-B', nackReason: 'nope' };
    a = reduceSender(a, message(bNack)).state;
    b = reduceSender(b, message(bNack)).state;
    expect(a.phase).toBe('awaiting-reply');
    expect(b.outcome).toEqual({ kind: 'refused', nackReason: 'nope' });
  });
});

describe('crosslink sender — settling', () => {
  it('reports APPLIED on an ACK with didApply true', () => {
    const { effect } = reduceSender(offered(), message({
      opcode: 'crosslink-ack', protocol: 1, exchangeId: XID, didApply: true,
    }));
    expect(effect).toEqual({ type: 'settle', outcome: { kind: 'applied' } });
    expect(describeOutcome({ kind: 'applied' })).toEqual([]);
  });

  it('reports NEEDS-REVIEW on an ACK with didApply false — not success, not failure', () => {
    // A conflicting payload opens a preview and imports nothing until a human confirms.
    const { effect } = reduceSender(offered(), message({
      opcode: 'crosslink-ack', protocol: 1, exchangeId: XID, didApply: false,
    }));
    expect(effect).toEqual({ type: 'settle', outcome: { kind: 'needs-review' } });
    expect(describeOutcome({ kind: 'needs-review' })[0]).toContain('review');
  });

  it('surfaces the receiver\'s own reason on a NACK', () => {
    const { effect } = reduceSender(offered(), message({
      opcode: 'crosslink-nack', protocol: 1, exchangeId: XID, nackReason: 'Still loading.',
    }));
    expect(effect).toEqual({ type: 'settle', outcome: { kind: 'refused', nackReason: 'Still loading.' } });
    expect(describeOutcome({ kind: 'refused', nackReason: 'Still loading.' })[0]).toContain('Still loading.');
  });

  it('substitutes a sentence for a NACK with no usable reason', () => {
    const { effect } = reduceSender(offered(), message({
      opcode: 'crosslink-nack', protocol: 1, exchangeId: XID, nackReason: '',
    }));
    expect(effect).toMatchObject({ type: 'settle', outcome: { kind: 'refused' } });
    expect(describeOutcome({ kind: 'refused', nackReason: 'x' })).toHaveLength(1);
  });

  it('times out, and says so with the file route as the remedy', () => {
    const { effect } = reduceSender(offered(), { type: 'timeout' });
    expect(effect).toEqual({ type: 'settle', outcome: { kind: 'timed-out' } });
    // ⚠️ The JSON download is not going away; it IS the cross-device route.
    expect(describeOutcome({ kind: 'timed-out' })[0]).toContain('Export for SPERT Forecaster');
  });

  it('ignores everything once settled', () => {
    const settled = reduceSender(offered(), { type: 'timeout' }).state;
    expect(reduceSender(settled, message({
      opcode: 'crosslink-ack', protocol: 1, exchangeId: XID, didApply: true,
    })).effect).toEqual({ type: 'ignore' });
  });

  it('ONE timeout spans the whole exchange, including before OPEN', () => {
    const { effect } = reduceSender(initialSenderState(XID), { type: 'timeout' });
    expect(effect).toEqual({ type: 'settle', outcome: { kind: 'timed-out' } });
  });
});

describe('crosslink sender — the budget it advertises', () => {
  it('leaves the receiver room to refuse before the sender stops listening', () => {
    // The receiver derives its hold from `senderDeadlineAt` minus a 1s margin, so this has to
    // be comfortably larger than that margin for a NACK to ever arrive in time.
    expect(CROSSLINK_TIMEOUT_MS).toBeGreaterThan(5_000);
  });
});
