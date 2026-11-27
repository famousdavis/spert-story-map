// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * No test reaches Google (v0.58.0). Every test file runs with this setup. It refuses each TCP connection its worker
 * tries to open to a Google or Firebase host (the call throws before the socket opens, so no connection is made),
 * records it, and fails the file if one was tried before the file ended. A late one, after the file's last test, is
 * still refused; the fold's test, reverted, made its attempt that late.
 *
 * It watches `net.Socket.prototype.connect`, the one door every client in Node goes through: `fetch` (undici), jsdom's
 * XMLHttpRequest (node:http), `tls`, HTTP/2 and gRPC. So it sees the Firebase SDK whichever build it resolves to.
 *
 * Why: with a developer's `.env.local`, `lib/firebase.ts` used to build the real app in tests, and the local-store
 * fold's test then made a real Firestore write and called production's `teardownAiSession` Cloud Function.
 * `vite.config.ts` now blanks the Firebase keys for every test; this holds the line whatever else changes.
 */
import net from 'node:net';
import { afterAll } from 'vitest';

/** A host this suite must never contact. */
export const GUARDED_HOST = /(?:^|\.)(?:googleapis\.com|cloudfunctions\.net|firebaseio\.com|firebaseapp\.com|google\.com|gstatic\.com)$/i;

/**
 * The names a `Socket#connect` call carries: `connect(options)`, `connect(port, host)`, or Node's own normalised form,
 * `connect([options, callback])`, which `net.connect` and `tls.connect` pass. Both `host` and `servername`: `fetch`
 * resolves the address itself and connects by IP, so the hostname is only in `servername` (measured: the fold's test,
 * reverted, connected to `2607:f8b0:…` with `servername: 'firestore.googleapis.com'`).
 */
export function connectHosts(args: unknown[]): string[] {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first && typeof first === 'object') {
    const { host, servername } = first as { host?: unknown; servername?: unknown };
    return [host, servername].filter((n): n is string => typeof n === 'string');
  }
  if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) {
    return typeof args[1] === 'string' ? [args[1]] : [];
  }
  return [];
}

type Guarded = typeof net.Socket.prototype.connect & { __networkGuard?: true };

/** Every guarded host this worker has tried to connect to, in order. */
export const guardedConnections: string[] = [];

const original = net.Socket.prototype.connect as Guarded;
if (!original.__networkGuard) {
  const guarded = function (this: net.Socket, ...args: unknown[]) {
    const host = connectHosts(args).find(n => GUARDED_HOST.test(n));
    if (host) {
      guardedConnections.push(host);
      throw new Error(`networkGuard: a test tried to connect to ${host}`);
    }
    return (original as (...a: unknown[]) => net.Socket).apply(this, args);
  } as unknown as Guarded;
  guarded.__networkGuard = true;
  net.Socket.prototype.connect = guarded;
}

afterAll(() => {
  if (guardedConnections.length > 0) {
    throw new Error(`a test tried to connect to Google or Firebase: ${[...new Set(guardedConnections)].join(', ')}`);
  }
});
