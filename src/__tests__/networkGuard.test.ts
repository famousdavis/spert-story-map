// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * S11 (v0.58.0): no test reaches Google, whatever a developer's `.env.local` holds. With it present, the local-store
 * fold's test failed (1 of 26) because it made a real Firestore write and called production's `teardownAiSession`
 * Cloud Function, and its assertion raced that request. Two holds:
 * - `vite.config.ts`'s `test.env` blanks the three Firebase keys for every test, so `lib/firebase.ts` builds nothing;
 * - `setup/networkGuard.ts`, run before every test file, refuses any connection to a Google or Firebase host.
 */
import { describe, it, expect } from 'vitest';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, auth, functionsInstance, isFirebaseAvailable } from '../lib/firebase';
import { GUARDED_HOST, connectHosts, guardedConnections } from './setup/networkGuard';

describe('Firebase is never configured in a test', () => {
  it('the three keys the app checks are blank, whatever .env.local holds', () => {
    expect(import.meta.env.VITE_FIREBASE_API_KEY).toBe('');
    expect(import.meta.env.VITE_FIREBASE_PROJECT_ID).toBe('');
    expect(import.meta.env.VITE_FIREBASE_APP_ID).toBe('');
  });

  it('so lib/firebase.ts builds no app: no database, no auth, no functions', () => {
    expect(isFirebaseAvailable).toBe(false);
    expect(db).toBeNull();
    expect(auth).toBeNull();
    expect(functionsInstance).toBeNull();
  });

  it('the config sets it, and runs the guard before every test file', () => {
    const config = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8');
    expect(config).toMatch(/env:\s*\{\s*VITE_FIREBASE_API_KEY:\s*'',\s*VITE_FIREBASE_PROJECT_ID:\s*'',\s*VITE_FIREBASE_APP_ID:\s*''\s*\}/);
    expect(config).toMatch(/setupFiles:\s*\['src\/__tests__\/setup\/networkGuard\.ts'\]/);
  });
});

describe('the guard', () => {
  it('is installed on the one door every Node client uses', () => {
    expect((net.Socket.prototype.connect as { __networkGuard?: true }).__networkGuard).toBe(true);
  });

  it('reads the host from every form of connect, servername included (fetch connects by IP)', () => {
    expect(connectHosts([{ host: 'firestore.googleapis.com', port: 443 }])).toEqual(['firestore.googleapis.com']);
    expect(connectHosts([[{ host: '2607:f8b0:4008:815::200a', servername: 'firestore.googleapis.com', port: 443 }, () => {}]]))
      .toEqual(['2607:f8b0:4008:815::200a', 'firestore.googleapis.com']);
    expect(connectHosts([443, 'us-central1-x.cloudfunctions.net'])).toEqual(['us-central1-x.cloudfunctions.net']);
    expect(connectHosts(['/tmp/socket'])).toEqual([]);
  });

  it.each(['firestore.googleapis.com', 'us-central1-spert-suite.cloudfunctions.net', 'spert-suite.firebaseapp.com',
    'x.firebaseio.com', 'www.google.com', 'www.gstatic.com'])('guards %s', host => {
    expect(GUARDED_HOST.test(host)).toBe(true);
  });

  it.each(['localhost', '127.0.0.1', 'googleapis.com.example.org', 'notgoogle.com'])('leaves %s alone', host => {
    expect(GUARDED_HOST.test(host)).toBe(false);
  });

  it('refuses a connection to a guarded host before the socket opens, and records it (must-fail control)', () => {
    const before = guardedConnections.length;
    const socket = new net.Socket();
    // As tls.connect passes it: an address, with the name only in `servername` (not in SocketConnectOpts' type).
    const options = { host: 'nothing.invalid', servername: 'firestore.googleapis.com', port: 443 };
    expect(() => socket.connect(options)).toThrow(/networkGuard/);
    expect(socket.connecting).toBe(false);
    expect(guardedConnections.slice(before)).toEqual(['firestore.googleapis.com']);
    // This file's own deliberate attempt must not fail it at the end.
    guardedConnections.splice(before);
    socket.destroy();
  });
});
