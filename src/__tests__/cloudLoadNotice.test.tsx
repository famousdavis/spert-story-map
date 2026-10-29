// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * W4 containment and notice: the project view's own error boundary, and the
 * banner shown when the cloud-load guard set part of a project aside.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ErrorBoundary from '../components/ui/ErrorBoundary';
import CloudLoadNotice from '../components/ui/CloudLoadNotice';
import { reportGuardedLoad, dismissGuardedLoad } from '../lib/cloudLoadNotices';

afterEach(() => { cleanup(); dismissGuardedLoad('p1'); });

function Boom(): never {
  throw new Error('view failed');
}

describe('ErrorBoundary inline (around the project view)', () => {
  it('keeps the page and offers the way back to the project list', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <MemoryRouter>
        <p>header and tabs</p>
        <ErrorBoundary inline resetKey="/product/p1/structure"><Boom /></ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText('header and tabs')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This view could not be displayed');
    expect(screen.getByRole('link', { name: 'Back to projects' })).toHaveAttribute('href', '/');
    err.mockRestore();
  });

  it('clears the error when the route changes', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <MemoryRouter><ErrorBoundary inline resetKey="a"><Boom /></ErrorBoundary></MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<MemoryRouter><ErrorBoundary inline resetKey="b"><p>other tab</p></ErrorBoundary></MemoryRouter>);
    expect(screen.getByText('other tab')).toBeInTheDocument();
    err.mockRestore();
  });
});

describe('CloudLoadNotice', () => {
  it('is hidden until the guard reports the open project, then names it and can be dismissed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<CloudLoadNotice productId="p1" productName="Capstone" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => { reportGuardedLoad('p1', ['rib.name'], true); });
    expect(screen.getByRole('status')).toHaveTextContent('Capstone');

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    warn.mockRestore();
  });

  it('stays hidden for a report from the project list, and for another project', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<CloudLoadNotice productId="p1" productName="Capstone" />);
    act(() => {
      reportGuardedLoad('p1', ['rib.name'], false);
      reportGuardedLoad('p2', ['rib.name'], true);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    dismissGuardedLoad('p2');
    warn.mockRestore();
  });
});
