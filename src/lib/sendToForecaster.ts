// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { buildForecasterExport, serialiseForecasterExport } from './exportForForecaster';
import { checkForecasterCompatibility } from './forecasterLimits';
import {
  CROSSLINK_PROTOCOL,
  CROSSLINK_TIMEOUT_MS,
  describeOutcome,
  initialSenderState,
  reduceSender,
  type CrosslinkOffer,
  type SenderState,
} from './crosslinkProtocol';
import type { Product } from '../types';

/**
 * Where the receiving Forecaster tab lives.
 *
 * ⚠️ Environment-split, and production NEVER contains localhost. A local page that could
 * satisfy the receiver's origin check would reach its zero-conflict fast path, which applies
 * an import with no user interaction at all.
 *
 * The dev value targets :3000, but ⚠️ **nothing in either repo can guarantee that port**.
 * Forecaster's `.claude/launch.json` is gitignored in both repos and uses `autoPort`, so a
 * busy 3000 silently moves it — observed live at 49496, 53220 and 53580 across three starts,
 * because an unrelated three-day-old `next-server` was holding the port.
 *
 * ⚠️ **If the handshake times out in dev, check Forecaster's actual port first** and set
 * `VITE_FORECASTER_ORIGIN`. The escape hatch is the real mechanism here; the pin is not one.
 * It is dev-only by construction, because the production branch never reads it.
 */
export const FORECASTER_ORIGIN: string = import.meta.env.PROD
  ? 'https://forecaster.spertsuite.com'
  : (import.meta.env.VITE_FORECASTER_ORIGIN ?? 'http://localhost:3000');

/**
 * The seams this needs in order to be testable. jsdom's `window.open` returns `undefined`
 * (it is a `notImplementedMethodWrapper`), so the real one cannot be exercised in a test —
 * hence injection rather than mocking the global.
 */
export interface SendDeps {
  openWindow: (url: string, target: string) => Window | null;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
  addMessageListener: (fn: (event: MessageEvent) => void) => void;
  removeMessageListener: (fn: (event: MessageEvent) => void) => void;
  mintExchangeId: () => string;
}

function defaultMintExchangeId(): string {
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Only reached in environments without WebCrypto. The id is a correlation token, not a
  // secret — the origin and opener checks are what make the channel safe.
  return `xid-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function defaultSendDeps(): SendDeps {
  return {
    openWindow: (url, target) => window.open(url, target),
    now: () => Date.now(),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id),
    addMessageListener: (fn) => window.addEventListener('message', fn),
    removeMessageListener: (fn) => window.removeEventListener('message', fn),
    mintExchangeId: defaultMintExchangeId,
  };
}

/**
 * Hand this product's Forecaster export directly to a Forecaster tab.
 *
 * ⚠️ Returns REASONS, never throws — the same contract as `downloadForecasterExport`. The
 * two failure families would otherwise combine badly: a malformed sprint date throws
 * `RangeError` out of the builder, and a blocked popup is the house `if (!w) throw` pattern,
 * so a caller with one try/catch would tell a popup-blocked user their sprint dates are
 * invalid.
 *
 * @returns [] when the project landed in Forecaster; otherwise the reasons it did not.
 */
export async function sendToForecaster(
  product: Product,
  deps: SendDeps = defaultSendDeps(),
): Promise<string[]> {
  let data: ReturnType<typeof buildForecasterExport>;
  try {
    // The SAME two functions the download runs, in the same order. If the download would
    // refuse this product, so does this — the transport must not be a way around the check.
    data = buildForecasterExport(product);
  } catch {
    return [
      'The export could not be built. A sprint may have an invalid end date — check the Sprints section in Settings.',
    ];
  }

  const issues = checkForecasterCompatibility(data);
  if (issues.length > 0) return issues;

  const exchangeId = deps.mintExchangeId();
  const url = `${FORECASTER_ORIGIN}/?crosslink=storymap&xid=${encodeURIComponent(exchangeId)}`;

  // ⚠️ NO `noopener` / `noreferrer` here, and that is deliberate — they null `window.opener`
  // in the popup, and the opener relationship IS the transport. Every OTHER `_blank` in this
  // repo does carry them (13 of 13 anchor sites) because none of them needs to be talked to.
  // Must be called synchronously in the click handler or the popup blocker takes it.
  const opened = deps.openWindow(url, '_blank');
  if (!opened) {
    return ['SPERT Forecaster could not be opened. Allow pop-ups for this site, then try again.'];
  }
  const senderWindow: Window = opened;

  const exportText = serialiseForecasterExport(data);

  return new Promise<string[]>((resolve) => {
    let state: SenderState = initialSenderState(exchangeId);
    let timerId = 0;
    // ONE timeout spans the whole exchange — open, handshake, transfer, ingest, reply — and
    // this same instant is what the receiver derives its hold expiry from.
    const deadlineAt = deps.now() + CROSSLINK_TIMEOUT_MS;

    const finish = (reasons: string[]) => {
      deps.clearTimer(timerId);
      deps.removeMessageListener(onMessage);
      resolve(reasons);
    };

    function onMessage(event: MessageEvent) {
      const { state: next, effect } = reduceSender(state, {
        type: 'message',
        originMatches: event.origin === FORECASTER_ORIGIN,
        // Not `event.source === window` — this is the specific popup THIS call opened, which
        // is what stops a second popup's handshake from satisfying this one.
        fromOpenedWindow: event.source === senderWindow,
        data: event.data,
      });
      state = next;

      if (effect.type === 'send-offer') {
        // ⚠️ A named origin, never '*'. The export is the user's project data.
        const offer: CrosslinkOffer = {
          opcode: 'crosslink-offer',
          protocol: CROSSLINK_PROTOCOL,
          exchangeId,
          exportText,
          senderDeadlineAt: deadlineAt,
        };
        senderWindow.postMessage(offer, FORECASTER_ORIGIN);
        return;
      }
      if (effect.type === 'settle') finish(describeOutcome(effect.outcome));
    }

    deps.addMessageListener(onMessage);
    timerId = deps.setTimer(() => {
      const { state: next, effect } = reduceSender(state, { type: 'timeout' });
      state = next;
      if (effect.type === 'settle') finish(describeOutcome(effect.outcome));
    }, CROSSLINK_TIMEOUT_MS);
  });
}
