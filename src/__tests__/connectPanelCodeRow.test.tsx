// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
// B14 R-3: the session code sits on its own line, with Copy Code and Copy Prompt grouped on the
// line below. jsdom does no layout, so this checks the structure only; the PR carries the
// measurement made in a browser.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ConnectPanel from '../components/ConnectAI/ConnectPanel';
import type { AiSessionState } from '../hooks/useAiConnectivity';

vi.mock('../lib/firebase', () => ({ functionsInstance: { __fns: true } }));
vi.mock('../lib/callables', () => ({
  callGeneratePairingCode: vi.fn(async () => ({ code: 'ABSTRACT-0384216791', expiresAt: '2026-11-14T00:15:00.000Z' })),
}));

const sessionState: AiSessionState = {
  sessionActive: true, aiConnected: false, consentRead: true, sessionId: 's1', boundProductId: 'p1', notice: null,
};

afterEach(cleanup);

describe('Connect AI code row', () => {
  it('puts the code on one line of a column and both buttons together on the next', async () => {
    render(
      <ConnectPanel open onClose={() => {}} sessionState={sessionState}
        onChangePermissions={async () => true} onDisconnect={async () => {}} />,
    );
    const code = await screen.findByText('ABSTRACT · 0384216791');
    expect(code.classList.contains('whitespace-nowrap')).toBe(true);

    const row = code.parentElement;
    expect(row?.className.split(/\s+/)).toEqual(expect.arrayContaining(['flex', 'flex-col']));
    expect(row?.children).toHaveLength(2);
    expect(row?.children[0]).toBe(code);

    const group = row?.children[1];
    expect(group?.className.split(/\s+/)).toContain('flex');
    const labels = [...(group?.querySelectorAll('button') ?? [])].map(b => b.textContent);
    expect(labels).toEqual(['Copy Code', 'Copy Prompt']);
    expect(group?.children).toHaveLength(2);
  });
});
