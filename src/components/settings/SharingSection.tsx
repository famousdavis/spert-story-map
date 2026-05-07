// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import ProjectSharingPanel from './ProjectSharingPanel';

interface SharingSectionProps {
  productId: string;
}

/**
 * Settings-page sharing entry point. All logic lives in ProjectSharingPanel
 * (which is also reused by the homepage ShareDialog modal). Setting
 * `withSectionWrapper` here gives the Settings page its expected
 * "Sharing" Section heading; ShareDialog renders the panel without it.
 */
export default function SharingSection({ productId }: SharingSectionProps) {
  return <ProjectSharingPanel productId={productId} withSectionWrapper />;
}
