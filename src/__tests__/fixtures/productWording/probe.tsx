// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// productWording.test.ts's control: four shown strings it must report, and names it must pass.
type Kind = 'projects' | 'other';
const storymap_get_project = 'spertstorymap_projects';
export function Probe({ kind }: { kind: Kind }) {
  const title = `Open the project ${storymap_get_project}`;
  return (<button type="button" name="projectName" title="Delete project" aria-label={title}>
    {kind === 'other' ? 'projects' : null}
    Old Project
  </button>);
}
console.warn('a project in a console call is not shown');
