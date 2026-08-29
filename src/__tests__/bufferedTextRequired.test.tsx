// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BufferedText from '../components/ui/BufferedText';
import { validateProduct } from '../lib/validateProduct';

afterEach(cleanup);

/** Type into the field and blur, which is the commit gesture. */
function typeAndBlur(el: HTMLElement, text: string) {
  fireEvent.focus(el);
  fireEvent.change(el, { target: { value: text } });
  fireEvent.blur(el);
}

describe('BufferedText — required', () => {
  it('refuses to commit an empty value, and restores what was there', () => {
    const onCommit = vi.fn();
    render(<BufferedText value="Release One" onCommit={onCommit} name="f" required />);
    const input = screen.getByRole('textbox');
    typeAndBlur(input, '');
    expect(onCommit).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('Release One');
  });

  it('refuses whitespace-only, which validateProduct would otherwise accept', () => {
    // `isValidString('   ')` is true — length > 0 — so this one is not a
    // round-trip breakage. It is still not a name, and trim is the natural
    // predicate, so it reverts too.
    const onCommit = vi.fn();
    render(<BufferedText value="Sprint 1" onCommit={onCommit} name="f" required />);
    const input = screen.getByRole('textbox');
    typeAndBlur(input, '   ');
    expect(onCommit).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('Sprint 1');
  });

  it('commits a real value', () => {
    const onCommit = vi.fn();
    render(<BufferedText value="Old" onCommit={onCommit} name="f" required />);
    typeAndBlur(screen.getByRole('textbox'), 'New');
    expect(onCommit).toHaveBeenCalledWith('New');
  });

  it('reverts on Enter too, not only blur', () => {
    const onCommit = vi.fn();
    render(<BufferedText value="Kept" onCommit={onCommit} name="f" required />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input); // jsdom does not blur from .blur() inside the handler
    expect(onCommit).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('Kept');
  });

  // ⚠️ The guard stops NEW blanks; it does not invent a name. Reverting
  // restores the focus snapshot, which may itself be blank for data written
  // before this shipped.
  it('does not repair a value that was already empty', () => {
    const onCommit = vi.fn();
    render(<BufferedText value="" onCommit={onCommit} name="f" required />);
    const input = screen.getByRole('textbox');
    typeAndBlur(input, '');
    expect(onCommit).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('');
  });

  // The hook gates external→local sync on its focused flag, which only
  // handleBlur clears. A guard that returned early instead of calling it would
  // leave the field deaf to cloud echoes and undo until refocused.
  it('still accepts external updates after a rejected commit', () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <BufferedText value="First" onCommit={onCommit} name="f" required />);
    const input = screen.getByRole('textbox');
    typeAndBlur(input, '');
    rerender(<BufferedText value="Echoed" onCommit={onCommit} name="f" required />);
    expect((input as HTMLInputElement).value).toBe('Echoed');
  });
});

describe('BufferedText — not required', () => {
  it('commits an empty value, because description and notes may be blank', () => {
    const onCommit = vi.fn();
    render(<BufferedText value="Some description" onCommit={onCommit} name="f" />);
    typeAndBlur(screen.getByRole('textbox'), '');
    expect(onCommit).toHaveBeenCalledWith('');
  });

  it('applies the same rule to the multiline variant', () => {
    const onCommit = vi.fn();
    render(<BufferedText value="Notes" onCommit={onCommit} name="f" multiline rows={3} required />);
    typeAndBlur(screen.getByRole('textbox'), '');
    expect(onCommit).not.toHaveBeenCalled();
  });
});

// ── Why `required` exists at all ────────────────────────────────────────────
// The prop is not a UI preference: it mirrors what the importer demands. These
// pin the coupling, so loosening either side alone turns something red rather
// than silently re-opening the create-but-cannot-reimport gap.
describe('the validator rule the required prop exists to satisfy', () => {
  const base = () => ({
    id: 'p1', name: 'P', themes: [],
    releases: [{ id: 'r1', name: 'R', order: 1 }],
    sprints: [{ id: 's1', name: 'S', order: 1 }],
  });

  it('accepts the baseline', () => {
    expect(() => validateProduct(base())).not.toThrow();
  });

  it.each([
    ['product name', (p: ReturnType<typeof base>) => { p.name = ''; }, 'Product name'],
    ['release name', (p: ReturnType<typeof base>) => { p.releases[0]!.name = ''; }, 'Release name'],
    ['sprint name', (p: ReturnType<typeof base>) => { p.sprints[0]!.name = ''; }, 'Sprint name'],
  ])('rejects an empty %s — so the UI must not write one', (_label, mutate, message) => {
    const p = base();
    mutate(p);
    expect(() => validateProduct(p)).toThrow(message);
  });

  // The deliberate non-members of that set: the validator accepts these, so
  // their inline editors are correctly left unguarded.
  it('accepts an empty theme, backbone and rib name', () => {
    expect(() => validateProduct({
      ...base(),
      themes: [{ id: 't1', name: '', order: 1, backboneItems: [
        { id: 'b1', name: '', order: 1, ribItems: [
          { id: 'x1', name: '', order: 1, size: null, category: 'core',
            releaseAllocations: [], progressHistory: [] },
        ] },
      ] }],
    })).not.toThrow();
  });
});
