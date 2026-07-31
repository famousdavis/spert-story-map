// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { useState, type ComponentProps } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ProgressRow from '../components/progress/ProgressRow';

afterEach(cleanup);

type Props = ComponentProps<typeof ProgressRow>;
type Rib = Props['rib'];

const RELEASE_ID = 'rel-1';
const SPRINT_ID = 'sp-4';

const editableRib: Rib = {
  id: 'r1',
  name: 'Email Notifications',
  description: '',
  order: 1,
  size: 'M',
  category: 'core',
  releaseAllocations: [{ releaseId: RELEASE_ID, percentage: 100 }],
  progressHistory: [],
  _releaseId: RELEASE_ID,
  _allocPct: 100,
  _editable: true,
  backboneName: 'Customer Communications',
};

/**
 * The backbone/theme groupings render read-only rows: no single allocation to
 * edit, so ProgressTrackingView writes `_releaseId: null` / `_editable: false`.
 */
const readOnlyRib: Rib = {
  ...editableRib,
  _releaseId: null,
  _allocPct: null,
  _editable: false,
};

function renderRow(rib: Rib, overrides: Partial<Props> = {}) {
  const updateProgress = vi.fn();
  const removeProgress = vi.fn();

  // progressDrafts is real state so the draft round-trip (click -> type ->
  // blur) behaves as it does in the page.
  function Harness() {
    const [progressDrafts, setProgressDrafts] = useState<Record<string, string>>({});
    const props: Props = {
      rib,
      idx: 0,
      sprint: { id: SPRINT_ID, name: 'Sprint 4', order: 4, endDate: '2026-02-27' },
      prevSprint: null,
      selectedSprint: SPRINT_ID,
      showTargetCol: true,
      totalCols: 7,
      expandedRows: new Set<string>(),
      toggleRow: vi.fn(),
      commentDrafts: {},
      setCommentDrafts: vi.fn(),
      progressDrafts,
      setProgressDrafts,
      getSprintPct: () => 90,
      getCurrentPct: () => 90,
      getDelta: () => null,
      getCommentCount: () => 0,
      getCommentHistory: () => [],
      updateProgress,
      removeProgress,
      updateComment: vi.fn(),
      sizeMapping: [{ label: 'M', points: 20 }],
      ...overrides,
    };
    return <table><tbody><ProgressRow {...props} /></tbody></table>;
  }

  render(<Harness />);
  return { updateProgress, removeProgress };
}

describe('ProgressRow editing', () => {
  it('commits an edited percentage through updateProgress with the row release id', () => {
    const { updateProgress } = renderRow(editableRib);

    fireEvent.click(screen.getByRole('button', { name: '90%' }));
    const input = screen.getByRole('spinbutton');

    fireEvent.change(input, { target: { value: '75' } });
    fireEvent.blur(input);

    expect(updateProgress).toHaveBeenCalledTimes(1);
    expect(updateProgress).toHaveBeenCalledWith('r1', RELEASE_ID, 75);
  });

  it('clearing the input removes the entry rather than writing zero', () => {
    const { updateProgress, removeProgress } = renderRow(editableRib);

    fireEvent.click(screen.getByRole('button', { name: '90%' }));
    const input = screen.getByRole('spinbutton');

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(removeProgress).toHaveBeenCalledWith('r1', RELEASE_ID);
    expect(updateProgress).not.toHaveBeenCalled();
  });

  it('rejects a value above the row allocation', () => {
    const { updateProgress } = renderRow(editableRib);

    fireEvent.click(screen.getByRole('button', { name: '90%' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '150' } });
    fireEvent.blur(screen.getByRole('spinbutton'));

    expect(updateProgress).not.toHaveBeenCalled();
  });

  it('renders a read-only cell for a non-editable row, with no input to open', () => {
    const { updateProgress } = renderRow(readOnlyRib);

    expect(screen.queryByRole('button', { name: '90%' })).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getAllByText('90%').length).toBeGreaterThan(0);
    expect(updateProgress).not.toHaveBeenCalled();
  });
});
