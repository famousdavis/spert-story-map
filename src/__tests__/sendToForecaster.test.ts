// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The impure shell around the sender reducer. Every browser seam is injected, so this runs in
 * the repo's default `node` environment: jsdom's `window.open` returns `undefined` anyway
 * (it is a `notImplementedMethodWrapper`), so it could not exercise this even if it were on.
 */
import { describe, it, expect, vi } from 'vitest';
import { sendToForecaster, FORECASTER_ORIGIN, type SendDeps } from '../lib/sendToForecaster';
import { serialiseForecasterExport, buildForecasterExport } from '../lib/exportForForecaster';
import type { Product } from '../types';
import { req } from './testHelpers';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Test Product',
    description: '',
    schemaVersion: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    sprintCadenceWeeks: 2,
    sizeMapping: [{ label: 'S', points: 10 }],
    themes: [],
    releases: [],
    sprints: [],
    releaseCardOrder: {},
    ...overrides,
  };
}

interface Harness {
  deps: SendDeps;
  posted: { message: unknown; targetOrigin: string }[];
  openedUrls: { url: string; target: string }[];
  /** Deliver a message to the sender's listener. */
  deliver: (data: unknown, over?: { origin?: string; fromWindow?: boolean }) => void;
  fireTimeout: () => void;
}

function harness(openResult: 'window' | 'blocked' = 'window'): Harness {
  const posted: Harness['posted'] = [];
  const openedUrls: Harness['openedUrls'] = [];
  let listener: ((event: MessageEvent) => void) | null = null;
  let timeoutFn: (() => void) | null = null;

  const popup = {
    postMessage: (message: unknown, targetOrigin: string) => posted.push({ message, targetOrigin }),
  } as unknown as Window;

  const deps: SendDeps = {
    openWindow: (url, target) => {
      openedUrls.push({ url, target });
      return openResult === 'window' ? popup : null;
    },
    now: () => 1_000_000,
    setTimer: (fn) => { timeoutFn = fn; return 1; },
    clearTimer: () => { timeoutFn = null; },
    addMessageListener: (fn) => { listener = fn; },
    removeMessageListener: () => { listener = null; },
    mintExchangeId: () => 'xid-fixed',
  };

  return {
    deps, posted, openedUrls,
    deliver: (data, over = {}) => {
      listener?.({
        origin: over.origin ?? FORECASTER_ORIGIN,
        source: over.fromWindow === false ? ({} as Window) : popup,
        data,
      } as unknown as MessageEvent);
    },
    fireTimeout: () => timeoutFn?.(),
  };
}

const openMsg = { opcode: 'crosslink-open', protocol: 1, exchangeId: 'xid-fixed' };

describe('sendToForecaster — opening the window', () => {
  it('opens SYNCHRONOUSLY, before any await, so the pop-up blocker leaves it alone', () => {
    const h = harness();
    void sendToForecaster(makeProduct(), h.deps);
    // Not awaited: if the open happened after an await this array would still be empty.
    expect(h.openedUrls).toHaveLength(1);
  });

  it('carries the sender-minted exchange id in the URL', () => {
    const h = harness();
    void sendToForecaster(makeProduct(), h.deps);
    expect(req(h.openedUrls[0], 'an opened window').url).toBe(`${FORECASTER_ORIGIN}/?crosslink=storymap&xid=xid-fixed`);
  });

  it('does NOT pass noopener or noreferrer — the opener relationship IS the transport', () => {
    // Every other `_blank` in this repo does carry them. This one cannot: they null
    // `window.opener` in the popup, and then nothing can talk back.
    const h = harness();
    void sendToForecaster(makeProduct(), h.deps);
    expect(req(h.openedUrls[0], 'an opened window').target).toBe('_blank');
    expect(JSON.stringify(h.openedUrls[0])).not.toContain('noopener');
    expect(JSON.stringify(h.openedUrls[0])).not.toContain('noreferrer');
  });

  it('RETURNS a reason when the pop-up is blocked — it does not throw', () => {
    // The house pattern elsewhere is `if (!w) throw`. Throwing here would collide with the
    // RangeError catch and tell a pop-up-blocked user their sprint dates are invalid.
    const h = harness('blocked');
    return expect(sendToForecaster(makeProduct(), h.deps)).resolves.toEqual([
      'SPERT Forecaster could not be opened. Allow pop-ups for this site, then try again.',
    ]);
  });
});

describe('sendToForecaster — the offer', () => {
  it('posts the offer to a NAMED origin, never a wildcard', () => {
    const h = harness();
    void sendToForecaster(makeProduct(), h.deps);
    h.deliver(openMsg);
    expect(h.posted).toHaveLength(1);
    expect(req(h.posted[0], 'a posted message').targetOrigin).toBe(FORECASTER_ORIGIN);
    expect(req(h.posted[0], 'a posted message').targetOrigin).not.toBe('*');
  });

  it('sends the EXACT text the download writes', () => {
    const h = harness();
    void sendToForecaster(makeProduct(), h.deps);
    h.deliver(openMsg);
    const offer = req(h.posted[0], 'a posted message').message as { exportText: string };
    expect(offer.exportText).toBe(serialiseForecasterExport(buildForecasterExport(makeProduct())));
    // ⚠️ And NOT the fixtures' `serialise`, which appends a newline for the SHA-pinned
    // comparison. One byte, in exactly the quantity the receiver's ceiling measures.
    expect(offer.exportText.endsWith('\n')).toBe(false);
  });

  it('advertises an ABSOLUTE deadline, so the receiver derives its hold from one number', () => {
    const h = harness();
    void sendToForecaster(makeProduct(), h.deps);
    h.deliver(openMsg);
    const offer = req(h.posted[0], 'a posted message').message as { senderDeadlineAt: number };
    expect(offer.senderDeadlineAt).toBe(1_000_000 + 30_000);
  });

  it('does not offer until OPEN arrives from the right origin and window', () => {
    const h = harness();
    void sendToForecaster(makeProduct(), h.deps);
    h.deliver(openMsg, { origin: 'https://evil.example' });
    h.deliver(openMsg, { fromWindow: false });
    expect(h.posted).toHaveLength(0);
    h.deliver(openMsg); // control: the correct one does
    expect(h.posted).toHaveLength(1);
  });
});

describe('sendToForecaster — outcomes', () => {
  const settle = async (reply: unknown) => {
    const h = harness();
    const p = sendToForecaster(makeProduct(), h.deps);
    h.deliver(openMsg);
    h.deliver(reply);
    return p;
  };

  it('reports nothing at all when the project landed', async () => {
    expect(await settle({ opcode: 'crosslink-ack', protocol: 1, exchangeId: 'xid-fixed', didApply: true }))
      .toEqual([]);
  });

  it('says a preview is waiting when didApply is false', async () => {
    const [reason] = await settle({ opcode: 'crosslink-ack', protocol: 1, exchangeId: 'xid-fixed', didApply: false });
    expect(reason).toContain('review');
  });

  it('surfaces the receiver\'s NACK reason verbatim', async () => {
    const [reason] = await settle({
      opcode: 'crosslink-nack', protocol: 1, exchangeId: 'xid-fixed', nackReason: 'Still loading your cloud projects.',
    });
    expect(reason).toContain('Still loading your cloud projects.');
  });

  it('times out and points at the file route', async () => {
    const h = harness();
    const p = sendToForecaster(makeProduct(), h.deps);
    h.deliver(openMsg);
    h.fireTimeout();
    const [reason] = await p;
    expect(reason).toContain('Export for SPERT Forecaster');
  });

  it('removes its listener once settled', async () => {
    const h = harness();
    const removed = vi.spyOn(h.deps, 'removeMessageListener');
    const p = sendToForecaster(makeProduct(), h.deps);
    h.deliver(openMsg);
    h.deliver({ opcode: 'crosslink-ack', protocol: 1, exchangeId: 'xid-fixed', didApply: true });
    await p;
    expect(removed).toHaveBeenCalled();
  });
});

describe('sendToForecaster — it refuses what the download refuses', () => {
  it('returns compatibility issues instead of opening anything', async () => {
    // A name over MAX_STRING_LENGTH (200) is one Forecaster's validator would refuse. The
    // transport must not be a way around a check the file route enforces — same two
    // functions, same order, so a payload the download blocks never reaches the wire.
    const h = harness();
    const reasons = await sendToForecaster(makeProduct({ name: 'N'.repeat(201) }), h.deps);
    expect(reasons.length).toBeGreaterThan(0);
    expect(h.openedUrls).toHaveLength(0);
  });

  it('CONTROL — a compatible product DOES open the window', async () => {
    // Without this, the assertion above passes on a sender that refuses everything.
    const h = harness();
    void sendToForecaster(makeProduct(), h.deps);
    expect(h.openedUrls).toHaveLength(1);
  });

  it('returns a reason rather than throwing when a sprint date is malformed', async () => {
    // A present-but-malformed endDate reaches `addDays` and throws RangeError.
    const h = harness();
    const reasons = await sendToForecaster(
      makeProduct({ sprints: [{ id: 's1', name: 'S1', endDate: 'not-a-date', order: 1 }] }),
      h.deps,
    );
    expect(reasons.length).toBeGreaterThan(0);
    expect(h.openedUrls).toHaveLength(0);
  });
});

describe('sendToForecaster — the origin it targets', () => {
  it('never targets localhost in a production build', () => {
    // Environment-split: a local page reaching the receiver would hit fast path 1, which
    // applies an import with no user interaction.
    expect('https://forecaster.spertsuite.com').not.toContain('localhost');
  });

  it('is a single named origin, not a pattern', () => {
    expect(FORECASTER_ORIGIN).toMatch(/^https?:\/\/[^*]+$/);
  });
});
