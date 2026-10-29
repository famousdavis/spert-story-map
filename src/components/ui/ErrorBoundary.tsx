// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { Component } from 'react';
import { Link } from 'react-router-dom';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Render a compact in-page fallback instead of the full-screen one. Used
   * around the project view, so the header, the tabs and the way back to the
   * project list survive a view that cannot render.
   */
  inline?: boolean;
  /** When this changes, a caught error is cleared (e.g. the route path). */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.inline) {
      return (
        <div role="alert" className="max-w-md mx-auto text-center py-12">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">This view could not be displayed</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{this.state.error.message}</p>
          <Link to="/" className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
            Back to projects
          </Link>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center max-w-md px-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{this.state.error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
