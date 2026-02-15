import { Link } from 'react-router-dom';
import { APP_VERSION } from '../lib/version';
import { Footer } from './ChangelogView';

const R = () => <sup className="text-[0.45em] text-gray-400 font-normal tracking-wide align-super">®</sup>;

export default function AboutView() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">← Back to Projects</Link>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">About This App</h1>

        {/* Purpose */}
        <Section title="Purpose">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            <strong>SPERT<R /> Story Map</strong> is a browser-based agile release planning tool that
            replaces spreadsheet-driven story mapping workflows. It provides a three-level hierarchy
            (Theme → Backbone → Rib Item) for organizing project work, with features for:
          </p>
          <ul className="mt-2 ml-6 list-disc text-sm text-gray-600 dark:text-gray-400 leading-relaxed space-y-1">
            <li><strong>Story map structure:</strong> Organize work into themes, backbone items, and rib items with inline editing and drag-to-reorder</li>
            <li><strong>Release planning:</strong> Kanban board with drag-and-drop assignment, split allocations across releases, and column reordering</li>
            <li><strong>Progress tracking:</strong> Sprint-by-sprint progress entry with burn-up charts and delta tracking</li>
            <li><strong>Insights:</strong> Analytics dashboard with core/non-core breakdown, sizing distribution, release charts, and attention items</li>
          </ul>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mt-3">
            SPERT Story Map is part of the <strong>SPERT<R /> suite</strong> of project management tools.
          </p>
        </Section>

        {/* Your Data & Security */}
        <Section title="Your Data & Security">
          <ul className="ml-6 list-disc text-sm text-gray-600 dark:text-gray-400 leading-relaxed space-y-1">
            <li>Stored locally in your <strong>browser</strong> (not in any cloud database)</li>
            <li><strong>Your data never leaves your device</strong></li>
            <li>No external database servers, no third-party access, no data governance concerns</li>
            <li>Safe for corporate/organizational data — all data stays within your network</li>
            <li>Use <strong>Export</strong> to back up your data to your file system anytime</li>
            <li>Use <strong>Import</strong> to restore from a backup or share with colleagues</li>
            <li><strong>Note:</strong> If you clear your browser cache/data, you will lose all stored projects unless you've exported a backup</li>
          </ul>
        </Section>

        {/* Version Updates */}
        <Section title="Version Updates">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            When new versions are released, your data remains safe in localStorage. We recommend
            exporting a backup before major updates as a precaution. Current version: <Link to="/changelog" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">v{APP_VERSION}</Link>
          </p>
        </Section>

        {/* Author & Source Code */}
        <Section title="Author & Source Code">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-3">
            Created by <strong>William W. Davis, MSPM, PMP</strong>
          </p>
          <a
            href="https://github.com/famousdavis/spert-story-map"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            View Source Code on GitHub
          </a>
        </Section>

        {/* License */}
        <Section title="License">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            This software is licensed under the <strong>GNU General Public License v3.0 (GPL-3.0)</strong>.
            You are free to use, modify, and distribute this software under the terms of the GPL-3.0 license.
          </p>
        </Section>

        {/* No Warranty Disclaimer */}
        <Section title="No Warranty Disclaimer">
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW. EXCEPT WHEN
            OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM
            &ldquo;AS IS&rdquo; WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT
            NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.
            THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU. SHOULD THE PROGRAM
            PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY SERVICING, REPAIR OR CORRECTION.
          </p>
        </Section>
      </div>
      <Footer />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h3 className="text-base font-semibold text-blue-600 dark:text-blue-400 mb-3">{title}</h3>
      {children}
    </div>
  );
}
