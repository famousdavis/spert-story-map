// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { APP_VERSION } from '../lib/version';
import { TOS_URL, PRIVACY_POLICY_URL, LICENSE_URL } from '../lib/tosConstants';
import { AI_PRIVACY_URL } from '../lib/aiConstants';

export default function ChangelogView() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/CHANGELOG.md')
      .then(res => res.ok ? res.text() : Promise.reject('Not found'))
      .then(text => { setContent(text); setLoading(false); })
      .catch(() => { setContent(''); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-6 py-12 flex-1 w-full">
        <div className="mb-8">
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">← Back to Products</Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Changelog</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          Version history for SPERT® Story Map. Current version: <strong>v{APP_VERSION}</strong>
        </p>
        {loading ? (
          <p className="text-gray-400 dark:text-gray-500">Loading...</p>
        ) : content ? (
          <div className="prose prose-sm max-w-none">
            <MarkdownRenderer content={content} />
          </div>
        ) : (
          <p className="text-gray-400 dark:text-gray-500">No changelog available.</p>
        )}
      </div>
      <Footer />
    </div>
  );
}

// Render inline **bold** and `code` spans within a line of changelog text.
// Plain text outside those spans is returned verbatim (React escapes it).
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      parts.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    } else {
      parts.push(
        <code key={k++} className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em] dark:bg-gray-800">
          {tok.slice(1, -1)}
        </code>
      );
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Minimal block renderer for the CHANGELOG.md subset: headings (## / ###),
// bullet lists (incl. 2-space-indented sub-bullets), hard-wrapped bullet
// continuations (lines indented under a bullet), `>` blockquotes (consecutive
// lines merged), and plain paragraphs / bold section headers. Blank lines
// separate blocks. Exported for unit testing.
export function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: ReactNode[] = [];
  let listItems: { indent: number; text: string }[] = [];
  let quoteLines: string[] = [];
  let paraLines: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems;
    listItems = [];
    elements.push(
      <ul key={key++} className="list-disc pl-6 space-y-1 mb-6 text-sm text-gray-600 dark:text-gray-400">
        {items.map((it, i) => (
          <li key={i} className={it.indent >= 2 ? 'ml-6' : ''}>{renderInline(it.text)}</li>
        ))}
      </ul>
    );
  };
  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    const text = quoteLines.join(' ');
    quoteLines = [];
    elements.push(
      <blockquote key={key++} className="border-l-4 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 pl-4 pr-3 py-2 mb-6 text-sm italic text-gray-600 dark:text-gray-400">
        {renderInline(text)}
      </blockquote>
    );
  };
  const flushPara = () => {
    if (paraLines.length === 0) return;
    const text = paraLines.join(' ');
    paraLines = [];
    elements.push(
      <p key={key++} className="text-sm text-gray-600 dark:text-gray-400 mb-4">{renderInline(text)}</p>
    );
  };
  const flushAll = () => { flushList(); flushQuote(); flushPara(); };

  for (const line of lines) {
    if (line.startsWith('# ')) {
      flushAll();
      // Skip the top-level heading — we render our own
    } else if (line.startsWith('## ')) {
      flushAll();
      elements.push(
        <h2 key={key++} className="text-lg font-semibold text-blue-600 dark:text-blue-400 mt-8 mb-2">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      flushAll();
      elements.push(
        <h3 key={key++} className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-1">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith('> ')) {
      flushList();
      flushPara();
      quoteLines.push(line.slice(2));
    } else if (/^\s*- /.test(line)) {
      flushQuote();
      flushPara();
      const trimmed = line.trimStart();
      listItems.push({ indent: line.length - trimmed.length, text: trimmed.slice(2) });
    } else if (line.trim() === '') {
      flushAll();
    } else if (/^\s+\S/.test(line) && listItems.length > 0) {
      // Hard-wrapped continuation of the current bullet.
      const prev = listItems[listItems.length - 1];
      if (prev) prev.text += ' ' + line.trim();
    } else {
      // Plain paragraph line — intro text or a bold section header.
      flushList();
      flushQuote();
      paraLines.push(line.trim());
    }
  }
  flushAll();

  return <>{elements}</>;
}

export function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-3 text-sm text-gray-500 dark:text-gray-400">
      <div className="mx-auto w-full max-w-7xl px-4 text-center">
        <div>
          &copy; {new Date().getFullYear()} William W. Davis, MSPM, PMP |{' '}
          <Link to="/changelog" className="text-blue-600 hover:text-blue-700">
            Version {APP_VERSION}
          </Link>{' '}
          | Licensed under GNU GPL v3
        </div>
        <div className="mt-1">
          <a href="https://spertsuite.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">
            SPERT® Suite
          </a>
          {' | '}
          <a href={TOS_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">
            Terms of Service
          </a>
          {' | '}
          <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">
            Privacy Policy
          </a>
          {' | '}
          <a href={AI_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">
            AI Privacy Notice
          </a>
          {' | '}
          <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">
            License
          </a>
        </div>
      </div>
    </footer>
  );
}
