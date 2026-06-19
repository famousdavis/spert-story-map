// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MarkdownRenderer } from '../pages/ChangelogView';

afterEach(() => cleanup());

describe('ChangelogView MarkdownRenderer', () => {
  it('renders ## as an h2 heading', () => {
    render(<MarkdownRenderer content={'## Version 0.46.2 (2026-06-18)'} />);
    expect(screen.getByRole('heading', { level: 2 }))
      .toHaveTextContent('Version 0.46.2 (2026-06-18)');
  });

  it('joins a hard-wrapped bullet continuation into one list item', () => {
    const md = [
      '- **New: Foo** — updates the description, category, and notes',
      '  fields of multiple rib items in one call.',
    ].join('\n');
    const { container } = render(<MarkdownRenderer content={md} />);
    const li = container.querySelector('li');
    // The continuation line must be appended, not dropped.
    expect(li).toHaveTextContent(
      'New: Foo — updates the description, category, and notes ' +
      'fields of multiple rib items in one call.',
    );
  });

  it('renders a > blockquote with consecutive lines merged', () => {
    const md = [
      '> Note: the tool becomes available once the service update',
      '> is deployed.',
    ].join('\n');
    const { container } = render(<MarkdownRenderer content={md} />);
    const bq = container.querySelector('blockquote');
    expect(bq).not.toBeNull();
    expect(bq).toHaveTextContent(
      'Note: the tool becomes available once the service update is deployed.',
    );
  });

  it('renders an indented sub-bullet as a list item (not dropped)', () => {
    const md = [
      '- Parent bullet',
      '  - Rib item category now validates against enum',
    ].join('\n');
    render(<MarkdownRenderer content={md} />);
    expect(screen.getByText('Rib item category now validates against enum'))
      .toBeInTheDocument();
  });

  it('renders a bold section header the old renderer silently dropped', () => {
    const { container } = render(<MarkdownRenderer content={'**Connect AI: bulk update**'} />);
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong).toHaveTextContent('Connect AI: bulk update');
  });

  it('renders inline `code` as a <code> element', () => {
    const { container } = render(
      <MarkdownRenderer content={'- Uses `storymap_get_project` now'} />,
    );
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code).toHaveTextContent('storymap_get_project');
  });

  it('renders a plain intro paragraph', () => {
    render(<MarkdownRenderer content={'Enrich and update story map cards in bulk.'} />);
    expect(screen.getByText('Enrich and update story map cards in bulk.'))
      .toBeInTheDocument();
  });

  it('keeps separate blocks separate across blank lines', () => {
    const md = [
      '## Version 9.9.9 (2026-01-01)',
      '',
      'An intro sentence.',
      '',
      '- A bullet',
    ].join('\n');
    const { container } = render(<MarkdownRenderer content={md} />);
    expect(container.querySelector('h2')).toHaveTextContent('Version 9.9.9 (2026-01-01)');
    expect(container.querySelector('p')).toHaveTextContent('An intro sentence.');
    expect(container.querySelector('li')).toHaveTextContent('A bullet');
  });
});
