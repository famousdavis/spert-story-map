// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
//
// B-04 — when sign-out cannot reach the server to end the Connect AI session,
// AiTeardownBanner tells the user in plain words (not only the console) and
// offers a retry. These tests pin the user-visible message and the auto-hide.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const { getPendingMock, retryMock, clearMock } = vi.hoisted(() => ({
  getPendingMock: vi.fn<() => string | null>(),
  retryMock: vi.fn(() => Promise.resolve(true)),
  clearMock: vi.fn(),
}));

vi.mock('../lib/aiSessionTeardown', () => ({
  getPendingAiTeardownSessionId: getPendingMock,
  retryPendingAiTeardown: retryMock,
  clearPendingAiTeardown: clearMock,
  AI_TEARDOWN_CHANGED_EVENT: 'spert:ai-teardown-changed',
}));

import AiTeardownBanner from '../components/ui/AiTeardownBanner';

beforeEach(() => {
  getPendingMock.mockReset();
  retryMock.mockReset().mockResolvedValue(true);
  clearMock.mockReset();
});

afterEach(cleanup);

describe('AiTeardownBanner', () => {
  it('renders nothing when no teardown is pending', () => {
    getPendingMock.mockReturnValue(null);
    const { container } = render(<AiTeardownBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('warns the user, in plain words, that the AI may still be connected', async () => {
    // Pending throughout, and the on-mount retry fails so the banner stays.
    getPendingMock.mockReturnValue('sid-1');
    retryMock.mockResolvedValue(false);

    render(<AiTeardownBanner />);

    expect(await screen.findByText(/AI assistant may still be connected/i)).toBeInTheDocument();
    expect(screen.getByText(/could not reach the server to end your Connect AI session/i)).toBeInTheDocument();
    expect(screen.getByText(/read and change your last-open project/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    // Accurate guidance (review 3): keeps trying + 7-day fallback...
    expect(screen.getByText(/keeps trying whenever you are online/i)).toBeInTheDocument();
    expect(screen.getByText(/ends on its own within 7 days/i)).toBeInTheDocument();
    // ...and NOT the false "reconnect then Disconnect ends it at once" claim —
    // reconnecting mints a NEW session id, so Disconnect ends that, not this one.
    expect(screen.queryByText(/reconnect/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/disconnect/i)).not.toBeInTheDocument();
  });

  it('hides once a teardown retry succeeds', async () => {
    // Pending until a retry succeeds, then gone.
    let pending = true;
    getPendingMock.mockImplementation(() => (pending ? 'sid-1' : null));
    retryMock.mockImplementation(() => { pending = false; return Promise.resolve(true); });

    render(<AiTeardownBanner />);
    // The on-mount auto-retry clears it immediately; the banner should vanish.
    await waitFor(() => {
      expect(screen.queryByText(/AI assistant may still be connected/i)).not.toBeInTheDocument();
    });
    expect(retryMock).toHaveBeenCalled();
  });

  it('attempts a teardown retry on mount (covers "end it on the next load")', () => {
    getPendingMock.mockReturnValue('sid-1');
    retryMock.mockResolvedValue(false);
    render(<AiTeardownBanner />);
    expect(retryMock).toHaveBeenCalled();
  });
});
