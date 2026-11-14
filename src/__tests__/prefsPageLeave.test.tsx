// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.55.14 R-8: leaving the page flushes pending settings wherever the app is (the Products page
 * had no flush); R-5: the `_hasUploadedToCloud` flag and its upload hint are gone.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../lib/firebase', () => ({ db: null, auth: null, functionsInstance: null, isFirebaseAvailable: false }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, loading: false, firebaseAvailable: false }) }));

import { StorageProvider, useStorage } from '../lib/StorageProvider';

function Writer() {
  const { driver } = useStorage();
  return <button onClick={() => driver?.writePreferences([{ path: ['exportName'], value: 'typed' }])}>write</button>;
}
const stored = () => JSON.parse(localStorage.getItem('rp:local:preferences') ?? '{}');

afterEach(() => { cleanup(); localStorage.clear(); });

describe('R-8: a pending settings write lands when the page is left, from the Products page', () => {
  it.each(['pagehide', 'beforeunload'])('on %s', async event => {
    const view = render(<StorageProvider><Writer /></StorageProvider>);
    await act(async () => { view.getByText('write').click(); });
    expect(stored().exportName).toBeUndefined(); // control: still inside the debounce
    act(() => { window.dispatchEvent(new Event(event)); });
    expect(stored().exportName).toBe('typed');
  });
});

describe('R-5: the upload flag and its hint are gone', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== '__tests__') walk(p); } else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(join(__dirname, '..'));
  const text = files.map(f => readFileSync(f, 'utf8')).join('\n');

  it('no production file reads or writes _hasUploadedToCloud, or says products in the cloud will be skipped', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(text).toContain('writePreferences'); // must-find control: the scan reads the sources
    expect(text).not.toContain('_hasUploadedToCloud');
    expect(text).not.toContain('already in cloud will be skipped');
  });
});
