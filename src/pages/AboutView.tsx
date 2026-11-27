// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { Link } from 'react-router-dom';
import { APP_VERSION } from '../lib/version';
import { LICENSE_URL } from '../lib/tosConstants';
import { AI_PRIVACY_URL } from '../lib/aiConstants';
import { copyrightYear } from '../lib/copyrightYear';
import HeadingRow from '../components/layout/HeadingRow';

/**
 * The About page (FRAME26 pass 3, contract §3 "About page" and §7 "About", v0.59.0). A capped screen (X4): the heading
 * row, then `.sf-about` as `main`'s next child, with nothing between them. Stylesheet v4 draws all of it: no utility or
 * `dark:` class belongs inside `.sf-about`. The words are William's (2026-11-27): Story Map's own from the words file,
 * the rest shared by all seven apps and held by `frame-check`. The guides are the Help Center's list (`help.ts`,
 * `famousdavis/spert-landing`) verbatim, in its order.
 */

const SOURCE_URL = 'https://github.com/famousdavis/spert-story-map';
const HELP_URL = 'https://spertsuite.com/help/storymap';
const CONNECT_AI_SETUP_URL = 'https://spertsuite.com/help/connect-ai';
const QUICK_REFERENCE_PDF = '/SPERTStoryMap_Quick_Reference_Guide.pdf';
const CONNECT_AI_PDF = '/SPERTStoryMap_Connect_AI_Guide.pdf';

const GUIDES = [
  {
    title: 'Quick Reference Guide',
    file: QUICK_REFERENCE_PDF,
    text: 'What Story Map is and how to use it: themes, backbones and rib items, releases, sprints and progress tracking.',
  },
  {
    title: 'Connect AI User Guide',
    file: CONNECT_AI_PDF,
    text: 'How to pair an AI assistant with your story map so it can build and edit the map with you.',
  },
];

/** A registered mark: the glyph alone in the frame's `.sf-mark`, as in the brand row. */
const R = () => <span className="sf-mark">®</span>;
/** An unregistered mark (™). */
const TM = () => <span className="sf-mark sf-mark--tm">™</span>;
/** The brand row's title, marks included. */
const Title = () => <>SPERT<R /> Story Map</>;

/** A link that opens a new tab: "↗" for the eye, "(opens in a new tab)" for screen readers. */
function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}<span aria-hidden="true"> ↗</span><span className="sf-sr"> (opens in a new tab)</span>
    </a>
  );
}

export default function AboutView() {
  return (
    <>
      <HeadingRow>About <Title /></HeadingRow>
      <div className="sf-about" data-sf="about">
        <section>
          <h2>What is <Title />?</h2>
          <p>
            <Title /> is a browser-based agile release planning tool that replaces spreadsheet-driven story mapping
            workflows. It provides a three-level hierarchy (Theme → Backbone → Rib Item) for organizing product work,
            with features for:
          </p>
          <ul>
            <li><strong>Story map structure:</strong> Organize work into themes, backbone items, and rib items with inline editing and drag-to-reorder</li>
            <li><strong>Release planning:</strong> Kanban board with drag-and-drop assignment, split allocations across releases, and column reordering</li>
            <li><strong>Progress tracking:</strong> Sprint-by-sprint progress entry with burn-up charts and delta tracking</li>
            <li><strong>Insights:</strong> Analytics dashboard with core/non-core breakdown, sizing distribution, release charts, and attention items</li>
          </ul>
          <p><Title /> is part of the SPERT<R /> Suite of project management tools.</p>
        </section>

        <section>
          <h2>How it works</h2>
          <ol>
            <li>Create a product, or load the sample</li>
            <li>On Structure, organize its work into themes, backbone items and rib items</li>
            <li>On Sizing, size the rib items</li>
            <li>On Releases, assign rib items to releases, splitting an item across releases where it needs to</li>
            <li>On Progress, record each sprint’s progress</li>
            <li>On Map and Insights, see the whole map, the burn-up charts and what needs attention</li>
          </ol>
        </section>

        <section>
          <h2>Connect AI</h2>
          <p>Pair a compatible AI assistant with your story map to build and edit structure in real time.</p>
          <p>
            To connect, follow the steps for your assistant on the Help Center’s{' '}
            <ExtLink href={CONNECT_AI_SETUP_URL}>Connect AI setup page</ExtLink>. The{' '}
            <ExtLink href={CONNECT_AI_PDF}>Connect AI User Guide</ExtLink> explains what your assistant can do
            in <Title />. What it reads or changes passes through the SPERT<R /> Suite relay, whichever storage you
            use; the <ExtLink href={AI_PRIVACY_URL}>AI Privacy Notice</ExtLink> says what is kept and for how long.
          </p>
        </section>

        <section>
          <h2>Guides</h2>
          <ul className="sf-guides" data-sf="guides">
            {GUIDES.map(g => (
              <li key={g.file} className="sf-guide">
                <div className="sf-guide-body">
                  <h3 className="sf-guide-title">{g.title}</h3>
                  <p className="sf-guide-text">{g.text}</p>
                </div>
                <a className="sf-guide-open" href={g.file} target="_blank" rel="noopener noreferrer">
                  Open PDF<span aria-hidden="true"> ↗</span><span className="sf-sr">: {g.title} (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
          <p><ExtLink href={HELP_URL}>More help in the Help Center</ExtLink></p>
        </section>

        <section>
          <h2>Your data and storage</h2>
          <p>
            Unless you sign in and choose cloud storage, <Title /> keeps your products in this browser, on this device,
            and sends them to no server except through Connect AI, while an assistant is connected. Clearing this
            site’s data deletes them, so export a backup from time to time.
          </p>
          <p>
            If you sign in, with Google or with a Microsoft work or school account, and choose cloud storage, your
            products are saved to your account in Google Firebase, over encrypted (HTTPS) connections. You can then
            open them on any device and share them with other people.
          </p>
        </section>

        <section className="sf-about-legal" data-sf="about-legal">
          <h2>Version and license</h2>
          <p>Version {APP_VERSION} · <Link to="/changelog">What’s new</Link></p>
          <p>Created by William W. Davis, MSPM, PMP · <ExtLink href={SOURCE_URL}>Source code on GitHub</ExtLink></p>
          <p>
            © {copyrightYear()} William W. Davis, MSPM, PMP. <Title /> is free software: you may use, change and share
            it under the GNU General Public License, version 3, with the additional terms its{' '}
            <ExtLink href={LICENSE_URL}>LICENSE</ExtLink> adds under Section 7 of that license: attribution and legal
            notices, trademarks, the marking of modified versions, endorsement, and indemnification.
          </p>
          <p>
            SPERT<R />, Statistical PERT<R /> and Estimation Made Easy<R /> are registered trademarks of famousdavis,
            LLC. GanttApp<TM /> and MyScrumBudget<TM /> are trademarks of famousdavis, LLC.
          </p>
          <p>
            THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW. EXCEPT WHEN OTHERWISE
            STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY
            OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
            MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF
            THE PROGRAM IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY
            SERVICING, REPAIR OR CORRECTION.
          </p>
        </section>
      </div>
    </>
  );
}
