// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useBufferedField } from '../hooks/useBufferedField';

afterEach(cleanup);

// React fires no `onBlur` when a focused field is removed, so a field unmounted while
// focused drops what was typed. `commitOnUnmount` applies the blur rule to that missing
// blur: commit only if the field is focused AND differs from its focus-time value.
// Focus is moved with `.focus()` (jsdom's real focus, which React hears as onFocus);
// `rerender` with a new `value` is a change arriving from outside.

function Field({ value, onCommit, commitOnUnmount }: { value: string; onCommit: (v: string) => void; commitOnUnmount?: boolean }) {
  const { localValue, setLocalValue, handleFocus, handleBlur } =
    useBufferedField(value, onCommit, commitOnUnmount === undefined ? undefined : { commitOnUnmount });
  return (
    <textarea
      name="f"
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}

function mount(value: string, commitOnUnmount?: boolean) {
  const onCommit = vi.fn();
  const view = render(<Field value={value} onCommit={onCommit} commitOnUnmount={commitOnUnmount} />);
  const field = screen.getByRole('textbox') as HTMLTextAreaElement;
  const remote = (next: string) => view.rerender(<Field value={next} onCommit={onCommit} commitOnUnmount={commitOnUnmount} />);
  return { onCommit, field, remote, unmount: view.unmount };
}

describe('useBufferedField — commitOnUnmount', () => {
  it('commits once when unmounted focused and changed', () => {
    const { onCommit, field, unmount } = mount('Old', true);
    act(() => field.focus());
    fireEvent.change(field, { target: { value: 'Typed' } });
    unmount();
    expect(onCommit.mock.calls).toStrictEqual([['Typed']]);
  });

  it('does not commit a second time when the blur already committed', () => {
    const { onCommit, field, unmount } = mount('Old', true);
    act(() => field.focus());
    fireEvent.change(field, { target: { value: 'Typed' } });
    act(() => field.blur());
    unmount();
    expect(onCommit.mock.calls).toStrictEqual([['Typed']]);
  });

  it('does not write the old text over a change that arrived while focused and untouched', () => {
    const { onCommit, field, remote, unmount } = mount('Old', true);
    act(() => field.focus());
    remote('Remote');
    expect(field.value).toBe('Old');
    unmount();
    expect(onCommit.mock.calls).toStrictEqual([]);
  });

  it('is off by default: unmounting a focused, changed field commits nothing', () => {
    const { onCommit, field, unmount } = mount('Old');
    act(() => field.focus());
    fireEvent.change(field, { target: { value: 'Typed' } });
    unmount();
    expect(onCommit.mock.calls).toStrictEqual([]);
  });
});
