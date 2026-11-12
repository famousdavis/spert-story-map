// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BufferedText from '../components/ui/BufferedText';

afterEach(cleanup);

// `useBufferedField` ignores outside changes while the field is focused, which
// is its purpose. The defect: once focus left, the field went on showing the
// OLD text, and the next focus-and-blur wrote it back over the newer value that
// had arrived meanwhile (Connect AI, a collaborator, undo). Driven through
// `BufferedText`, its Settings consumer, which also carries the Escape and
// `required` revert paths. `rerender` with a new `value` is the remote change.
//
// fireEvent.focus does not move jsdom's focus, so the `.blur()` that Escape
// calls is a no-op here and the blur is fired by hand, exactly once.

function mount(value: string, required = false) {
  const onCommit = vi.fn();
  const view = render(<BufferedText value={value} onCommit={onCommit} name="f" required={required} />);
  const input = screen.getByRole('textbox') as HTMLInputElement;
  const remote = (next: string) =>
    view.rerender(<BufferedText value={next} onCommit={onCommit} name="f" required={required} />);
  return { onCommit, input, remote };
}

/** Focus and leave without typing: must never write anything. */
function touch(input: HTMLElement) {
  fireEvent.focus(input);
  fireEvent.blur(input);
}

describe('useBufferedField — a value that arrived while focused', () => {
  it('a blur that writes nothing shows the newer value, and the next touch writes nothing', () => {
    const { onCommit, input, remote } = mount('Old');
    fireEvent.focus(input);
    remote('Remote');
    fireEvent.blur(input);
    expect(input.value).toBe('Remote');
    expect(onCommit).not.toHaveBeenCalled();

    touch(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Escape shows the newer value, not the one held at focus', () => {
    const { onCommit, input, remote } = mount('Old');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Draft' } });
    remote('Remote');
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(input.value).toBe('Remote');
    expect(onCommit).not.toHaveBeenCalled();

    touch(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a blanked required field reverts to the newer value', () => {
    const { onCommit, input, remote } = mount('Release One', true);
    fireEvent.focus(input);
    remote('Release Renamed');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input.value).toBe('Release Renamed');
    expect(onCommit).not.toHaveBeenCalled();

    touch(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('what the user typed still wins over the newer value (last writer)', () => {
    const { onCommit, input, remote } = mount('Old');
    fireEvent.focus(input);
    remote('Remote');
    fireEvent.change(input, { target: { value: 'Typed' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('Typed');
  });

  it('while focused, the newer value does not replace what is being typed', () => {
    const { input, remote } = mount('Old');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Typing' } });
    remote('Remote');
    expect(input.value).toBe('Typing');
  });
});
