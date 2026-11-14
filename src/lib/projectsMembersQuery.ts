// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { collection, query, where } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { PROJECTS_COL } from './firestoreCollections';

/**
 * Every product the user is a member of: the dashboard's list (`loadProductIndex`) and, since
 * v0.55.14, the upload's read of the cloud tile order. ONE query for both, not a copy.
 *
 * ⚠️ This filter's SHAPE is a security boundary, not a convenience.
 * firestore.rules constrains `list` on this collection to
 * members[request.auth.uid] in ['owner', 'editor', 'viewer'], and Firestore
 * permits a list query ONLY when its filter PROVES that constraint. Drop or
 * change this filter and you do not get more rows — you get
 * PERMISSION_DENIED, and no project loads at all.
 * Until 2026-08-19 the rule was `allow list: if isAuth()`, which let any
 * signed-in SPERT user read every project in this collection.
 * ⚠️ The rule and this query are pinned together by
 * rules-tests/project-collections-list.test.ts in the spert-landing-page
 * repo (`npm run test:rules`). That test encodes this query AS WRITTEN and
 * lives in a DIFFERENT repository, so it will NOT fail when you edit this
 * line. Change one, change the other.
 */
export function projectsMembersQuery(database: Firestore, uid: string) {
  return query(
    collection(database, PROJECTS_COL),
    where(`members.${uid}`, 'in', ['owner', 'editor', 'viewer']),
  );
}
