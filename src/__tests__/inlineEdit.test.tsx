// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import InlineEdit from '../components/ui/InlineEdit';

afterEach(cleanup);

// `ui/InlineEdit` renames themes, backbones and ribs on the Structure tab, and
// saves on blur. The defect: it compared the draft with the CURRENT value, so
// a plain blur after a rename from elsewhere (Connect AI, a collaborator, undo)
// wrote the old name back. `rerender` with a new `value` is that remote rename.

function mount(value: string) {
  const onSave = vi.fn();
  const view = render(<InlineEdit value={value} onSave={onSave} />);
  const remote = (next: string) => view.rerender(<InlineEdit value={next} onSave={onSave} />);
  const open = () => {
    fireEvent.click(screen.getByRole('button'));
    return screen.getByRole('textbox') as HTMLInputElement;
  };
  return { onSave, remote, open };
}

describe('ui/InlineEdit — a rename that arrived while the input was open', () => {
  it('a plain blur writes nothing', () => {
    const { onSave, remote, open } = mount('Old');
    const input = open();
    remote('Remote');
    fireEvent.blur(input);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a typed change still wins over the newer name (last writer)', () => {
    const { onSave, remote, open } = mount('Old');
    const input = open();
    remote('Remote');
    fireEvent.change(input, { target: { value: 'Typed' } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Typed');
  });
});

describe('ui/InlineEdit — blank names', () => {
  // Unchanged on purpose: the validator accepts a blank theme, backbone or rib
  // name, and this field has always saved one.
  it('blanking the name and blurring still saves the blank', () => {
    const { onSave, open } = mount('Theme A');
    const input = open();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith('');
  });
});
