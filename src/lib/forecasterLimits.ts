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
 * ⚠️ THE GOLDEN FIXTURE ARRIVED AND DID NOT RETIRE THIS TABLE.
 *
 * This header used to predict that it would, and so does commit `7244d55`'s
 * body: "It is a stopgap; a golden fixture pinned in both repos is what retires
 * it." A commit body cannot be amended, so THIS is the correctable copy and it
 * contradicts that one. The end state shipped — v0.52.13/.14 publish the
 * boundary fixtures, and `spert-forecaster` v0.40.5-.8 runs them through its
 * REAL validator — and the constants below are still hand-typed, still
 * destructured into the block-message helpers, and still drive every message
 * this file emits. (No line number on purpose: a same-file citation decays on
 * the next edit to this header. The first draft of THIS correction said ":48"
 * and was wrong by 22 lines before it was ever committed.)
 *
 * WHY the prediction was wrong, and why no fixture set can ever retire this:
 * Forecaster holds all three numbers as PRIVATE constants (`MAX_STRING_LENGTH`
 * and `MAX_NUMERIC_VALUE`, declared without `export`) or as a bare literal (the
 * milestone cap, written `10` twice at `import-validation.ts:211-212`, at the
 * commit pinned above). None
 * can be imported. A fixture can therefore only probe BEHAVIOUR at the boundary
 * — 200 accepted, 201 rejected — never read the value. A fixture set and a
 * shared constant are different instruments, and only the second could retire
 * this table. Forecaster says the same from its side, in
 * `src/shared/state/storymap-contract/register.ts`.
 *
 * What the fixtures DID buy is drift DETECTION, which is not elimination:
 * change a limit here without changing Forecaster and the boundary pair fails
 * over there. Keeping the copy was then measured and DECLINED as work, not
 * merely left undone. Do not re-open this as "the fixture never landed" — it
 * landed. Re-open it only if Forecaster ever exports these constants.
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
    sprintFinishDate?: unknown;
    doneValue?: unknown;
    backlogAtSprintEnd?: unknown;
  }>;
}

const { MAX_MILESTONES, MAX_STRING_LENGTH, MAX_NUMERIC_VALUE } = FORECASTER_LIMITS;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Forecaster's date rule, mirroring `isValidIsoDate` (import-validation.ts:32-44).
 *
 * The second half is the part that matters and the part a regex alone misses:
 * `2026-13-45` satisfies the shape and is not a real day, so `new Date()`
 * auto-corrects or rejects it. Exported because the reachability register needs
 * the SAME rule — one statement of it, not two.
 */
export function isRealIsoDate(value: unknown): boolean {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === (month as number) - 1 &&
    parsed.getUTCDate() === day;
}

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

/**
 * `sprintFinishDate` is `sprint.endDate` passed through VERBATIM — the only field
 * in the payload that is neither derived nor validated on the way in
 * (`validateProduct`'s sprint block asserts id/name/order, never the date's
 * format). A regex-shaped but unreal date survives only on the LAST sprint:
 * every other position is read by `addDays` while deriving the next sprint's
 * start, which throws first. Scoped to this field for that reason —
 * `sprintStartDate` cannot arrive malformed without throwing.
 */
function finishDateIssues(value: unknown, sprint: number | string): string[] {
  if (isRealIsoDate(value)) return [];
  return [
    `Sprint ${sprint} has an invalid end date (${JSON.stringify(value)}). ` +
    'SPERT Forecaster requires a real calendar date in YYYY-MM-DD form.',
  ];
}

function sprintIssues(sprint: CheckableExport['sprints'][number]): string[] {
  const n = typeof sprint.sprintNumber === 'number' ? sprint.sprintNumber : '?';
  return [
    ...finishDateIssues(sprint.sprintFinishDate, n),
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
