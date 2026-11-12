// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import useInlineEdit from '../components/storymap/useInlineEdit';

afterEach(cleanup);

// `useInlineEdit` drives every rename on the Map tab, the release panel and the
// Release Planning column. The defect: `commit` compared the draft with the
// CURRENT value, so Enter after a rename from elsewhere (Connect AI, a
// collaborator, undo) wrote the old name back. `rerender` with a new `value`
// is that remote rename.
//
// The wrapper owns the double click, so a double click inside the open input
// reaches `startEditing` again. No consumer is built that way today; the theme
// and backbone headers planned next are, and the hook must not re-capture then.

function NameField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit(value, onCommit);
  return (
    <div data-testid="name" onDoubleClick={startEditing}>
      {editing ? (
        <input
          ref={inputRef}
          name="name"
          aria-label="Name"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
}

function mount(value: string) {
  const onCommit = vi.fn();
  const view = render(<NameField value={value} onCommit={onCommit} />);
  const remote = (next: string) => view.rerender(<NameField value={next} onCommit={onCommit} />);
  const open = () => {
    fireEvent.doubleClick(screen.getByTestId('name'));
    return screen.getByRole('textbox') as HTMLInputElement;
  };
  return { onCommit, remote, open };
}

const enter = (input: HTMLElement) => fireEvent.keyDown(input, { key: 'Enter' });

describe('useInlineEdit — a rename that arrived while the input was open', () => {
  it('Enter with no change writes nothing', () => {
    const { onCommit, remote, open } = mount('Old');
    const input = open();
    remote('Remote');
    enter(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a typed change still wins over the newer name (last writer)', () => {
    const { onCommit, remote, open } = mount('Old');
    const input = open();
    remote('Remote');
    fireEvent.change(input, { target: { value: 'Typed' } });
    enter(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('Typed');
  });

  it('a double click inside the open input does not re-capture the newer name', () => {
    const { onCommit, remote, open } = mount('Old');
    const input = open();
    remote('Remote');
    fireEvent.doubleClick(input);
    enter(input);
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('useInlineEdit — blank names', () => {
  // Release names use this hook, and `validateProduct` refuses a blank release
  // name on import, so a blank must never be written.
  it('blanking the name and pressing Enter writes nothing', () => {
    const { onCommit, open } = mount('Release 1');
    const input = open();
    fireEvent.change(input, { target: { value: '   ' } });
    enter(input);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
