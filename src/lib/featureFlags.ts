// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * INVITATIONS_ENABLED — bulk email invitation feature flag.
 *
 * The Landing Page invitation backend is live, so this is `true`. It is retained
 * as an emergency kill-switch: flip to `false` to disable the invitation UI and
 * claim flow across all consumers (ProjectSharingPanel, useInvitationLanding,
 * ProductList, AuthProvider) without removing code.
 */
export const INVITATIONS_ENABLED = true;
