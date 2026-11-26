// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { Link } from 'react-router-dom';
import HeadingRow from '../components/layout/HeadingRow';

/**
 * An address no route matches (v0.57.0): inside the frame, which marks no navigation item. Before, the page was
 * empty. The words are the suite's (MyScrumBudget, Scheduler, CFD), with Story Map's noun.
 */
export default function NotFoundView() {
  return (
    <>
      <HeadingRow>Page not found</HeadingRow>
      <div className="sf-below">
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">There&apos;s no page at this address.</p>
        <Link to="/" className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
          Back to Products
        </Link>
      </div>
    </>
  );
}
