// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * SPERT Release Forecaster's import limits, and the pre-flight check that stops
 * this app exporting a file Forecaster would refuse.
 *
 * ⚠️ THESE CONSTANTS ARE A COPY OF ANOTHER REPOSITORY'S RULES AND WILL DRIFT.
 * Source: `spert-forecaster/src/shared/state/import-validation.ts`, read at
 * commit `75f40e3` (Forecaster v0.40.4, 2026-08-28) — `MAX_STRING_LENGTH` :23,
 * `MAX_NUMERIC_VALUE` :24, and the milestone cap thrown at :212. The milestone
 * cap is NOT an arbitrary importer bound: Forecaster's own UI enforces
 * `MAX_MILESTONES = 10` (`src/features/forecast/constants.ts:39`), so raising it
 * here would contradict that app's product decision. The remedy is always
 * Story-Map-side.
 *
 * This duplication is a deliberate stopgap. The end state is a golden fixture
 * generated here and consumed by Forecaster's real validator, pinned in both
 * repos, which retires this table.
 */

/** Forecaster's `import-validation.ts` limits. See the file comment before editing. */
export const FORECASTER_LIMITS = {
  /** Max milestones per project. Mirrors Forecaster's own `MAX_MILESTONES`. */
  MAX_MILESTONES: 10,
  /** Max length of any name field. */
  MAX_STRING_LENGTH: 200,
  /** Upper bound on every numeric field; the lower bound is 0. */
  MAX_NUMERIC_VALUE: 999999,
} as const;

/** The subset of a built export this check reads. Structural, so it cannot drift
 *  from `buildForecasterExport`'s return type. */
interface CheckableExport {
  projects: Array<{
    name?: unknown;
    milestones?: Array<{ name?: unknown; backlogSize?: unknown }>;
  }>;
  sprints: Array<{
    sprintNumber?: unknown;
    doneValue?: unknown;
    backlogAtSprintEnd?: unknown;
  }>;
}

const { MAX_MILESTONES, MAX_STRING_LENGTH, MAX_NUMERIC_VALUE } = FORECASTER_LIMITS;

/** Describe a name for a message: quoted, and elided if it is one of the long ones. */
function label(name: string): string {
  return name.length > 40 ? `"${name.slice(0, 40)}…"` : `"${name}"`;
}

const asName = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Range check shared by the four numeric fields. Returns a reason, or null. */
function numericIssue(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'is not a number';
  if (value > MAX_NUMERIC_VALUE) {
    return `is ${Math.round(value).toLocaleString('en-US')}, above SPERT Forecaster's limit of ${MAX_NUMERIC_VALUE.toLocaleString('en-US')}`;
  }
  return null;
}

/**
 * An over-length message must identify WHICH release — a project has one name,
 * but a product can have many releases and the user has to know where to look.
 * That is why this is not shared with the project's name check.
 */
function milestoneIssues(milestone: { name?: unknown; backlogSize?: unknown }): string[] {
  const name = asName(milestone.name);
  const issues: string[] = [];
  if (!name) {
    issues.push('A release has no name. SPERT Forecaster requires one for every milestone.');
  } else if (name.length > MAX_STRING_LENGTH) {
    issues.push(
      `Release ${label(name)} has a name of ${name.length} characters, above SPERT Forecaster's limit of ${MAX_STRING_LENGTH}.`,
    );
  }
  const reason = numericIssue(milestone.backlogSize);
  if (reason) {
    issues.push(`Release ${label(name || '(unnamed)')} has a story-point total that ${reason}.`);
  }
  return issues;
}

function projectIssues(project: CheckableExport['projects'][number]): string[] {
  const issues: string[] = [];
  const name = asName(project.name);
  if (!name) {
    issues.push('The project has no name. SPERT Forecaster requires one.');
  } else if (name.length > MAX_STRING_LENGTH) {
    issues.push(
      `The project name is ${name.length} characters, above SPERT Forecaster's limit of ${MAX_STRING_LENGTH}.`,
    );
  }
  const milestones = project.milestones ?? [];
  if (milestones.length > MAX_MILESTONES) {
    issues.push(
      `This project has ${milestones.length} releases carrying story points, and SPERT Forecaster accepts at most ${MAX_MILESTONES} milestones. ` +
      'Releases with no points are not counted.',
    );
  }
  for (const milestone of milestones) issues.push(...milestoneIssues(milestone));
  return issues;
}

/** One numeric field of a sprint. Negative gets its own message — the cause is
 *  invisible at the export button, so the message has to name it. */
function sprintFieldIssues(value: unknown, sprint: number | string, negative: string, positive: string): string[] {
  if (typeof value === 'number' && value < 0) return [`Sprint ${sprint} ${negative}`];
  const reason = numericIssue(value);
  return reason ? [`Sprint ${sprint} has ${positive} that ${reason}.`] : [];
}

function sprintIssues(sprint: CheckableExport['sprints'][number]): string[] {
  const n = typeof sprint.sprintNumber === 'number' ? sprint.sprintNumber : '?';
  return [
    ...sprintFieldIssues(
      sprint.doneValue, n,
      `has negative velocity (${String(sprint.doneValue)} points), which happens when a rib item's ` +
      'progress is revised downward. SPERT Forecaster requires velocity to be 0 or more.',
      'a velocity',
    ),
    ...sprintFieldIssues(
      sprint.backlogAtSprintEnd, n,
      'has a negative remaining backlog. SPERT Forecaster requires 0 or more.',
      'a remaining backlog',
    ),
  ];
}

/**
 * Check a BUILT export against Forecaster's import limits.
 *
 * Takes the built payload rather than the `Product` on purpose. Milestones are
 * not releases — `buildForecasterExport` skips any release carrying under 0.01
 * points — so a product with 14 releases can export 8 milestones and import
 * cleanly. Re-deriving the count from `product.releases` would block that file.
 * Checking what was actually built is what keeps this in step with the export.
 *
 * @returns one message per violation, each naming the field and both numbers.
 *          Empty means the payload will import.
 */
export function checkForecasterCompatibility(data: CheckableExport): string[] {
  return [
    ...data.projects.flatMap(projectIssues),
    ...data.sprints.flatMap(sprintIssues),
  ];
}
