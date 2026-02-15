import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_VERSION } from '../lib/version';

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">← Back to Products</Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Changelog</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          Version history for Release Planner. Current version: <strong>v{APP_VERSION}</strong>
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

function MarkdownRenderer({ content }) {
  const lines = content.split('\n');
  const elements = [];
  let currentList = [];
  let key = 0;

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc pl-6 space-y-1 mb-6 text-sm text-gray-600 dark:text-gray-400">
          {currentList.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      );
      currentList = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith('# ')) {
      flushList();
      // Skip the top-level heading — we render our own
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={key++} className="text-lg font-semibold text-blue-600 dark:text-blue-400 mt-8 mb-2">
          {line.replace('## ', '')}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={key++} className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-1">
          {line.replace('### ', '')}
        </h3>
      );
    } else if (line.startsWith('- ')) {
      const text = line.replace('- ', '');
      const boldMatch = text.match(/^\*\*(.+?)\*\*(.*)$/);
      if (boldMatch) {
        currentList.push(<><strong>{boldMatch[1]}</strong>{boldMatch[2]}</>);
      } else {
        currentList.push(text);
      }
    } else if (line.trim() === '') {
      flushList();
    }
  }
  flushList();

  return <>{elements}</>;
}

export function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 mt-12 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
      <span>&copy; {new Date().getFullYear()} William W. Davis, MSPM, PMP</span>
      {' | '}
      <Link to="/changelog" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
        v{APP_VERSION}
      </Link>
      {' | '}
      <span>Licensed under GNU GPL v3</span>
    </footer>
  );
}
