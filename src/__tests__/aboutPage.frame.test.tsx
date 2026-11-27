// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * The About page (FRAME26 pass 3, v0.59.0): contract §3 "About page" and §7 "About" (spert-suite-docs be37884), with
 * William's words of 2026-11-27 (`FRAME26-ABOUT-WORDS.md`, Story Map's own; §7, the shared). This pins the markup and
 * the words in jsdom; `frame-check`'s About screen measures the same page in Chrome (place, width, type, links).
 *
 * The guides are the Help Center's list for Story Map, `famousdavis/spert-landing` `src/data/help.ts` on `main` at
 * 6792169 (md5 f6f63415508b436a11794454a2305e38), copied below. If the hub changes them, this test does not see it:
 * `frame-check` reads help.ts from GitHub at gate time, and fails the About screen until the page follows.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import AboutView from '../pages/AboutView';
import AppFooter from '../components/layout/AppFooter';
import { APP_VERSION } from '../lib/version';
import { req } from './testHelpers';

const HELP_TS = {
  slug: 'storymap',
  repo: 'famousdavis/spert-story-map',
  guides: [
    { file: 'SPERTStoryMap_Quick_Reference_Guide.pdf', title: 'Quick Reference Guide',
      description: 'What Story Map is and how to use it: themes, backbones and rib items, releases, sprints and progress tracking.' },
    { file: 'SPERTStoryMap_Connect_AI_Guide.pdf', title: 'Connect AI User Guide',
      description: 'How to pair an AI assistant with your story map so it can build and edit the map with you.' },
  ],
};
const GH = `https://github.com/${HELP_TS.repo}`;

/** Text as frame-check compares it: screen-reader-only text removed, whitespace collapsed, quotes made straight. */
function seen(el: Element | null | undefined): string {
  const c = req(el, 'element').cloneNode(true) as Element;
  c.querySelectorAll('.sf-sr').forEach(x => x.remove());
  return (c.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

function Where() { return <p data-testid="where">{useLocation().pathname}</p>; }

function renderAbout() {
  render(
    <MemoryRouter initialEntries={['/about']}>
      <Routes>
        <Route path="/about" element={<main><AboutView /></main>} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  const main = req(document.querySelector('main'), 'main');
  const about = req(main.querySelector<HTMLElement>('.sf-about'), '.sf-about');
  const sections = Array.from(about.children) as HTMLElement[];
  return { main, about, sections };
}

describe('the heading row and the page (§3, §7; D3)', () => {
  it('the h1 is "About " and the brand row\'s title, its ® in .sf-mark as there', () => {
    renderAbout();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(seen(h1)).toBe('About SPERT® Story Map');
    const marks = Array.from(h1.querySelectorAll('.sf-mark'));
    expect(marks.map(m => [m.textContent, m.className])).toEqual([['®', 'sf-mark']]);
  });

  it('main holds the heading row, then .sf-about[data-sf=about], and nothing else: no back link, no tagline', () => {
    const { main, about } = renderAbout();
    expect(Array.from(main.children).map(c => c.getAttribute('data-sf'))).toEqual(['headrow', 'about']);
    expect(about.tagName).toBe('DIV');
    expect(about.className).toBe('sf-about');
    expect(screen.queryByRole('link', { name: /Back/ })).toBeNull();
  });

  it('six sections in §7\'s order, each a <section> opening with its h2; legal is .sf-about-legal[data-sf=about-legal]', () => {
    const { sections } = renderAbout();
    expect(sections.map(s => s.tagName)).toEqual(Array(6).fill('SECTION'));
    expect(sections.map(s => s.firstElementChild?.tagName)).toEqual(Array(6).fill('H2'));
    expect(sections.map(s => seen(s.querySelector('h2')))).toEqual([
      'What is SPERT® Story Map?', 'How it works', 'Connect AI', 'Guides', 'Your data and storage', 'Version and license',
    ]);
    const legal = req(sections[5], 'legal');
    expect(legal.className).toBe('sf-about-legal');
    expect(legal.getAttribute('data-sf')).toBe('about-legal');
  });

  it('no class inside .sf-about but the frame\'s own (no utility, no dark:)', () => {
    const { about } = renderAbout();
    const classes = new Set(Array.from(about.querySelectorAll('[class]')).flatMap(e => (e.getAttribute('class') ?? '').split(/\s+/)));
    expect([...classes].filter(c => c && !c.startsWith('sf-'))).toEqual([]);
  });

  it('every ® and ™ on the page is the glyph alone in a .sf-mark (™ with .sf-mark--tm), and no "TM" letters', () => {
    const { about } = renderAbout();
    const walker = document.createTreeWalker(about, NodeFilter.SHOW_TEXT);
    const bad: string[] = [];
    let marks = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent ?? '';
      if (!/[®™]/.test(t)) continue;
      const el = req(n.parentElement, 'parent');
      const ok = /^[®™]$/.test(t) && el.classList.contains('sf-mark') && (t === '™') === el.classList.contains('sf-mark--tm');
      if (ok) marks++; else bad.push(t);
    }
    expect(bad).toEqual([]);
    // 4 in What is, 2 in Connect AI, 1 in the data paragraph, 1 in the © line and 5 in the trademark line.
    expect(marks).toBe(13);
    expect(seen(about)).not.toMatch(/\bTM\b/);
  });
});

describe('Story Map\'s own words (FRAME26-ABOUT-WORDS.md, approved 2026-11-27)', () => {
  it('What is: the paragraph, four features with their labels alone in <strong>, the suite line', () => {
    const { sections } = renderAbout();
    const what = req(sections[0], 'what');
    expect(Array.from(what.children).map(c => c.tagName)).toEqual(['H2', 'P', 'UL', 'P']);
    expect(seen(what.children[1])).toBe('SPERT® Story Map is a browser-based agile release planning tool that replaces spreadsheet-driven story mapping workflows. It provides a three-level hierarchy (Theme → Backbone → Rib Item) for organizing product work, with features for:');
    const items = Array.from(what.querySelectorAll('li'));
    expect(items.map(seen)).toEqual([
      'Story map structure: Organize work into themes, backbone items, and rib items with inline editing and drag-to-reorder',
      'Release planning: Kanban board with drag-and-drop assignment, split allocations across releases, and column reordering',
      'Progress tracking: Sprint-by-sprint progress entry with burn-up charts and delta tracking',
      'Insights: Analytics dashboard with core/non-core breakdown, sizing distribution, release charts, and attention items',
    ]);
    expect(items.map(li => li.firstElementChild?.tagName === 'STRONG' ? seen(li.firstElementChild) : null))
      .toEqual(['Story map structure:', 'Release planning:', 'Progress tracking:', 'Insights:']);
    expect(Array.from(what.querySelectorAll('strong'))).toHaveLength(4);
    expect(seen(what.children[3])).toBe('SPERT® Story Map is part of the SPERT® Suite of project management tools.');
  });

  it('How it works: one ol of the six approved steps', () => {
    const { sections } = renderAbout();
    const how = req(sections[1], 'how');
    expect(Array.from(how.children).map(c => c.tagName)).toEqual(['H2', 'OL']);
    expect(Array.from(how.querySelectorAll('ol > li')).map(seen)).toEqual([
      'Create a product, or load the sample',
      'On Structure, organize its work into themes, backbone items and rib items',
      'On Sizing, size the rib items',
      'On Releases, assign rib items to releases, splitting an item across releases where it needs to',
      "On Progress, record each sprint's progress",
      'On Map and Insights, see the whole map, the burn-up charts and what needs attention',
    ]);
  });
});

/** A link that opens a new tab, as §7 marks it: "↗" hidden from screen readers, "(opens in a new tab)" for them. */
function expectNewTab(a: Element, href: string, srTail = ' (opens in a new tab)') {
  expect(a.getAttribute('href')).toBe(href);
  expect(a.getAttribute('target')).toBe('_blank');
  expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  expect(a.querySelector('[aria-hidden="true"]')?.textContent).toBe(' ↗');
  expect(a.querySelector('.sf-sr')?.textContent).toBe(srTail);
}

describe('the shared sections (§7, frame-check\'s lib/contract.mjs)', () => {
  it('Connect AI: Story Map\'s line, then the shared paragraph with its three links', () => {
    const { sections } = renderAbout();
    const ai = req(sections[2], 'connect ai');
    const ps = Array.from(ai.querySelectorAll('p'));
    expect(ps.map(seen)).toEqual([
      'Pair a compatible AI assistant with your story map to build and edit structure in real time.',
      "To connect, follow the steps for your assistant on the Help Center's Connect AI setup page ↗. The Connect AI User Guide ↗ explains what your assistant can do in SPERT® Story Map. What it reads or changes passes through the SPERT® Suite relay, whichever storage you use; the AI Privacy Notice ↗ says what is kept and for how long.",
    ]);
    const links = Array.from(req(ps[1], 'shared').querySelectorAll('a'));
    expect(links.map(seen)).toEqual(['Connect AI setup page ↗', 'Connect AI User Guide ↗', 'AI Privacy Notice ↗']);
    expectNewTab(req(links[0], 'setup'), 'https://spertsuite.com/help/connect-ai');
    expectNewTab(req(links[1], 'guide'), `/${req(HELP_TS.guides[1], 'ai guide').file}`);
    expectNewTab(req(links[2], 'privacy'), 'https://spertsuite.com/ai-privacy');
  });

  it('Guides: help.ts\'s rows verbatim and in order, each opening its PDF here; then More help', () => {
    const { sections } = renderAbout();
    const guides = req(sections[3], 'guides');
    const list = req(guides.querySelector('ul'), 'the list');
    expect(list.className).toBe('sf-guides');
    expect(list.getAttribute('data-sf')).toBe('guides');
    const rows = Array.from(list.children);
    expect(rows.map(r => [r.tagName, r.className])).toEqual(HELP_TS.guides.map(() => ['LI', 'sf-guide']));
    rows.forEach((row, i) => {
      const g = req(HELP_TS.guides[i], 'guide');
      const title = req(row.querySelector('h3'), 'title');
      expect(title.className).toBe('sf-guide-title');
      expect(seen(title)).toBe(g.title);
      const text = req(row.querySelector('p'), 'text');
      expect(text.className).toBe('sf-guide-text');
      expect(seen(text)).toBe(g.description);
      const open = req(row.querySelector('a'), 'open');
      expect(open.className).toBe('sf-guide-open');
      expect(seen(open)).toBe('Open PDF ↗');
      expectNewTab(open, `/${g.file}`, `: ${g.title} (opens in a new tab)`);
      expect(within(row as HTMLElement).getByRole('link', { name: `Open PDF: ${g.title} (opens in a new tab)` })).toBe(open);
    });
    const more = req(list.nextElementSibling, 'More help');
    expect(more.tagName).toBe('P');
    expect(seen(more)).toBe('More help in the Help Center ↗');
    expectNewTab(req(more.querySelector('a'), 'more link'), `https://spertsuite.com/help/${HELP_TS.slug}`);
  });

  it('Your data and storage: the two shared paragraphs, the Connect AI variant first, and none of its own', () => {
    const { sections } = renderAbout();
    const data = req(sections[4], 'data');
    expect(Array.from(data.querySelectorAll('p')).map(seen)).toEqual([
      "Unless you sign in and choose cloud storage, SPERT® Story Map keeps your products in this browser, on this device, and sends them to no server except through Connect AI, while an assistant is connected. Clearing this site's data deletes them, so export a backup from time to time.",
      'If you sign in, with Google or with a Microsoft work or school account, and choose cloud storage, your products are saved to your account in Google Firebase, over encrypted (HTTPS) connections. You can then open them on any device and share them with other people.',
    ]);
    expect(seen(document.body)).not.toContain('never leaves your device');
    expect(seen(document.body)).not.toContain('We recommend exporting a backup');
  });

  it('Version and license: the five paragraphs, the version, the links, and the warranty with straight quotes', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-03-01T12:00:00Z'));
    const { sections } = renderAbout();
    const legal = req(sections[5], 'legal');
    const ps = Array.from(legal.querySelectorAll('p'));
    expect(ps.map(seen)).toEqual([
      `Version ${APP_VERSION} · What's new`,
      'Created by William W. Davis, MSPM, PMP · Source code on GitHub ↗',
      '© 2027 William W. Davis, MSPM, PMP. SPERT® Story Map is free software: you may use, change and share it under the GNU General Public License, version 3, with the additional terms its LICENSE ↗ adds under Section 7 of that license: attribution and legal notices, trademarks, the marking of modified versions, endorsement, and indemnification.',
      'SPERT®, Statistical PERT® and Estimation Made Easy® are registered trademarks of famousdavis, LLC. GanttApp™ and MyScrumBudget™ are trademarks of famousdavis, LLC.',
      'THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW. EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY SERVICING, REPAIR OR CORRECTION.',
    ]);
    expect(req(ps[4], 'warranty').textContent).toContain('"AS IS"');
    const whatsNew = req(req(ps[0], 'version').querySelector('a'), "What's new");
    expect(whatsNew.getAttribute('href')).toBe('/changelog');
    expect(whatsNew.getAttribute('target')).toBeNull();
    expectNewTab(req(req(ps[1], 'author').querySelector('a'), 'source'), GH);
    expectNewTab(req(req(ps[2], 'licence').querySelector('a'), 'LICENSE'), `${GH}/blob/main/LICENSE`);
  });

  it('"What\'s new" opens the changelog, as the footer\'s Version does', async () => {
    renderAbout();
    await userEvent.click(screen.getByRole('link', { name: "What’s new" }));
    expect(screen.getByTestId('where').textContent).toBe('/changelog');
  });
});

describe('Y1: the © year is the current year, from the footer\'s source', () => {
  it.each([2026, 2031])('in %i, About and the footer both read © %i', year => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${year}-06-15T12:00:00Z`));
    render(<MemoryRouter><main><AboutView /></main><AppFooter /></MemoryRouter>);
    const about = seen(req(document.querySelector('[data-sf="about-legal"]'), 'legal'));
    const footer = seen(req(document.querySelector('[data-sf="footer"]'), 'footer'));
    expect(about).toContain(`© ${year} William W. Davis`);
    expect(footer).toContain(`© ${year} William W. Davis`);
    expect(footer).toContain(`Version ${APP_VERSION}`);
    expect(about).toContain(`Version ${APP_VERSION}`);
  });
});
