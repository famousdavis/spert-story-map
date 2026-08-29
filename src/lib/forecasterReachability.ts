// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * A reachability register for SPERT Release Forecaster's rejection surface.
 *
 * One row per way Forecaster can refuse an import, each recording whether
 * `buildForecasterExport` can actually produce a payload that trips it — and,
 * when it cannot, the property of THIS repository that makes it so.
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────
 * v0.52.10 found six mismatches by hand: probe an input, see whether Forecaster
 * refuses it. That worked and it does not compose — nothing made the seventh
 * announce itself. (There was a seventh. See F32.) Several exclusions in that
 * release were reached by REASONING rather than probe — "one project, so no
 * duplicate IDs"; "unitOfMeasure is a constant" — and every one of those rests
 * on a property of this repo that nothing asserted. Emit two projects, make
 * unitOfMeasure configurable, and a dead rejection goes live with nothing red.
 *
 * Each `basis` therefore carries an executable `check`, and a `counterexample`
 * that must break it. A basis nobody has broken is a comment.
 *
 * ── ⚠️ THIS FILE IS NOT SELF-VALIDATING. READ BEFORE TRUSTING IT ────────────
 * The row count is a STATED fact pinned to a stated commit, not a derived one.
 * Story Map's CI cannot see Forecaster's source, so if a 34th throw is added
 * over there, this register is silently short and NOTHING HERE GOES RED.
 * Closing that needs a consumer inside `spert-forecaster` running these
 * fixtures through its real validator — the other direction, deliberately not
 * in this release.
 *
 * A second limit, smaller but real: a `basis` guard pins the PROPERTY, not the
 * INFERENCE. It can pass while the reasoning that connected it to the throw was
 * wrong from the start. It is a regression detector, not a proof.
 *
 * ── MAINTENANCE ─────────────────────────────────────────────────────────────
 * Match rows on `message`, never on `line`: a cross-repo line number decays on
 * the other repo's next edit, and the thrown string is the stable symbol.
 */

import { isRealIsoDate } from './forecasterLimits';

/** The Forecaster commit every `line` and `message` below was transcribed from. */
export const PINNED_FORECASTER = {
  commit: '75f40e3',
  version: '0.40.4',
  file: 'src/shared/state/import-validation.ts',
  /** Derived, not assumed: `grep -c "throw new Error"` at the pinned commit. */
  throwCount: 33,
} as const;

/** Status of a rejection with respect to what this app can emit. */
export type ReachabilityStatus =
  /** Reachable, and v0.52.10 blocks it before download. */
  | 'SHIPPED'
  /** Reachable and NOT blocked — an open gap this register names. */
  | 'REACHABLE'
  /** The export structurally cannot produce a payload that trips it. */
  | 'UNREACHABLE'
  /**
   * Only tripped by input on which `buildForecasterExport` THROWS first, so the
   * payload never exists. Distinct from UNREACHABLE on purpose: it is contingent
   * on that throw, and would go live if the throwing code became tolerant.
   */
  | 'PRECLUDED';

/** A property of THIS repo that makes one or more rejections unreachable. */
export interface Basis {
  /** What must stay true, in prose. */
  readonly description: string;
  /** Does the property hold for this payload? */
  readonly check: (payload: unknown) => boolean;
  /** A mutation that MUST break `check` — proves the guard is not vacuous. */
  readonly counterexample: (payload: unknown) => unknown;
}

export interface RegisterRow {
  readonly id: string;
  /** Line at PINNED_FORECASTER.commit. A pointer that decays — match on `message`. */
  readonly line: number;
  /** Transcribed verbatim, with `${...}` interpolations left in place. */
  readonly message: string;
  readonly status: ReachabilityStatus;
  /** Key into BASES. Null for SHIPPED (a runtime block guards it) and for REACHABLE. */
  readonly basis: string | null;
  /** For SHIPPED, the test that covers it. For REACHABLE, what is missing. */
  readonly note?: string;
}

// ── Payload helpers ─────────────────────────────────────────────────────────
// Deliberately defensive: `check` receives mutated payloads, so nothing here
// may assume a well-formed shape.

const asObj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const projectsOf = (p: unknown): Record<string, unknown>[] => {
  const raw = asObj(p)?.projects;
  return Array.isArray(raw) ? raw.map(asObj).filter((x): x is Record<string, unknown> => !!x) : [];
};
const sprintsOf = (p: unknown): Record<string, unknown>[] => {
  const raw = asObj(p)?.sprints;
  return Array.isArray(raw) ? raw.map(asObj).filter((x): x is Record<string, unknown> => !!x) : [];
};
const milestonesOf = (p: unknown): Record<string, unknown>[] =>
  projectsOf(p).flatMap((proj) => {
    const raw = proj.milestones;
    return Array.isArray(raw) ? raw.map(asObj).filter((x): x is Record<string, unknown> => !!x) : [];
  });
const nonEmptyStr = (v: unknown): boolean => typeof v === 'string' && v.length > 0;
/** Forecaster's date rule — imported, not restated. See forecasterLimits.ts. */
const realIsoDate = isRealIsoDate;
/** Structured-clone a payload so a counterexample never mutates the caller's object. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const withProject = (p: unknown, edit: (proj: Record<string, unknown>) => void): unknown => {
  const c = clone(p) as Record<string, unknown>;
  const proj = (c.projects as Record<string, unknown>[])[0];
  if (proj) edit(proj);
  return c;
};
const withSprint = (p: unknown, edit: (s: Record<string, unknown>) => void): unknown => {
  const c = clone(p) as Record<string, unknown>;
  const s = (c.sprints as Record<string, unknown>[])[0];
  if (s) edit(s);
  return c;
};

// ── The bases ───────────────────────────────────────────────────────────────

export const BASES: Record<string, Basis> = {
  envelope: {
    description: 'The export is an object literal whose `projects` and `sprints` are always arrays, ' +
      'and every project is an object.',
    check: (p) => {
      const o = asObj(p);
      if (!o) return false;
      if (!Array.isArray(o.projects) || !Array.isArray(o.sprints)) return false;
      return o.projects.every((x) => !!asObj(x));
    },
    counterexample: (p) => ({ ...(asObj(p) ?? {}), projects: 'not-an-array' }),
  },

  singleProject: {
    description: 'The export emits EXACTLY ONE project (`projects: [project]`), so no two project ' +
      'ids can collide and the array is never empty.',
    check: (p) => projectsOf(p).length === 1,
    counterexample: (p) => {
      const c = clone(p) as Record<string, unknown>;
      const first = (c.projects as unknown[])[0];
      c.projects = [first, clone(first)];
      return c;
    },
  },

  projectIdFromProduct: {
    description: 'Project id is `product.id` passed through, and `validateProduct` requires a ' +
      'non-empty id on every product it admits.',
    check: (p) => projectsOf(p).every((proj) => nonEmptyStr(proj.id)),
    counterexample: (p) => withProject(p, (proj) => { proj.id = ''; }),
  },

  constantUnitOfMeasure: {
    description: "`unitOfMeasure` is the hardcoded literal 'Story Points' — not derived from the " +
      'product, so it can be neither absent nor over-length.',
    check: (p) => projectsOf(p).every((proj) => proj.unitOfMeasure === 'Story Points'),
    counterexample: (p) => withProject(p, (proj) => { proj.unitOfMeasure = 'x'.repeat(201); }),
  },

  cadenceBounded: {
    description: 'Cadence is absent, or a number in 1..52. The Settings control is a <select> ' +
      'offering 1-4, and `validateProduct` clamps an imported value to 1..52.',
    check: (p) => projectsOf(p).every((proj) => {
      const c = proj.sprintCadenceWeeks;
      return c === undefined || (typeof c === 'number' && Number.isFinite(c) && c >= 1 && c <= 52);
    }),
    counterexample: (p) => withProject(p, (proj) => { proj.sprintCadenceWeeks = 100; }),
  },

  derivedDatesAreReal: {
    description: 'Every date the export DERIVES (`firstSprintStartDate`, `sprintStartDate`) comes ' +
      'from `addDays`, which builds YYYY-MM-DD from a Date and throws RangeError rather than ' +
      'emit a malformed one. ⚠️ Contingent on that throw — see the PRECLUDED rows.',
    check: (p) => {
      const projOk = projectsOf(p).every((proj) =>
        proj.firstSprintStartDate === undefined || realIsoDate(proj.firstSprintStartDate));
      const sprintOk = sprintsOf(p).every((s) =>
        s.sprintStartDate === undefined || realIsoDate(s.sprintStartDate));
      return projOk && sprintOk;
    },
    counterexample: (p) => withSprint(p, (s) => { s.sprintStartDate = '2026-13-45'; }),
  },

  milestonesArray: {
    description: '`milestones` is absent, or an array assembled by the export itself.',
    check: (p) => projectsOf(p).every((proj) =>
      proj.milestones === undefined || Array.isArray(proj.milestones)),
    counterexample: (p) => withProject(p, (proj) => { proj.milestones = 'nope'; }),
  },

  milestoneShape: {
    description: 'Every milestone is an object literal built by the export with a non-empty id ' +
      '(the release id), a non-empty `color` from a constant palette, and `showOnChart: true`.',
    check: (p) => milestonesOf(p).every((m) =>
      nonEmptyStr(m.id) && nonEmptyStr(m.color) && typeof m.showOnChart === 'boolean'),
    counterexample: (p) => withProject(p, (proj) => {
      const ms = proj.milestones as Record<string, unknown>[] | undefined;
      if (ms?.[0]) ms[0].showOnChart = 'yes';
    }),
  },

  milestoneIdsUnique: {
    description: 'Milestone ids are release ids, one per release, so they are unique by construction.',
    check: (p) => {
      const ids = milestonesOf(p).map((m) => m.id);
      return new Set(ids).size === ids.length;
    },
    counterexample: (p) => withProject(p, (proj) => {
      const ms = proj.milestones as Record<string, unknown>[] | undefined;
      if (ms?.[0]) proj.milestones = [ms[0], clone(ms[0])];
    }),
  },

  sprintShape: {
    description: 'Every sprint record is an object literal with a non-empty id (the Story Map ' +
      'sprint id) and a non-empty `projectId` (the product id).',
    check: (p) => sprintsOf(p).every((s) => nonEmptyStr(s.id) && nonEmptyStr(s.projectId)),
    counterexample: (p) => withSprint(p, (s) => { s.projectId = ''; }),
  },

  sprintIdsUnique: {
    description: 'Sprint ids come from the product, one record per sprint; `validateProduct` ' +
      'admits no duplicate sprint ids.',
    check: (p) => {
      const ids = sprintsOf(p).map((s) => s.id);
      return new Set(ids).size === ids.length;
    },
    counterexample: (p) => {
      const c = clone(p) as Record<string, unknown>;
      const first = (c.sprints as unknown[])[0];
      if (first) c.sprints = [first, clone(first)];
      return c;
    },
  },

  sprintNumberIsIndex: {
    description: '`sprintNumber` is `i + 1` over the dated sprints, so it is always a positive ' +
      'integer. ⚠️ PARTIAL basis for the upper bound: exceeding Forecaster\'s 10000 needs 10001 ' +
      'dated sprints. `validateProduct` caps an IMPORT at 200, but `addSprint` has no cap, so ' +
      'the UI is not bounded — only the import path is.',
    check: (p) => sprintsOf(p).every((s) =>
      typeof s.sprintNumber === 'number' && Number.isInteger(s.sprintNumber) &&
      s.sprintNumber >= 1 && s.sprintNumber <= 10000),
    counterexample: (p) => withSprint(p, (s) => { s.sprintNumber = 1.5; }),
  },

  noCustomFinishDate: {
    description: 'The export never emits `customFinishDate` — it is a Forecaster-native field ' +
      'with no Story Map representation.',
    check: (p) => sprintsOf(p).every((s) => !('customFinishDate' in s)),
    counterexample: (p) => withSprint(p, (s) => { s.customFinishDate = '2026-13-45'; }),
  },
};

// ── Pre-validator gates ─────────────────────────────────────────────────────
// `handleFileChange` refuses a file on three content-dependent conditions
// BEFORE `validateImportData` runs. They are not throws, so they are outside
// the 33 — but they are Forecaster rejections, and the register's promise is
// about rejections, not about throws.

export const PRE_VALIDATOR_BASES: Record<string, Basis> = {
  jsonExtension: {
    description: '`downloadForecasterExport` names the file `*.json`, so the extension gate passes.',
    check: (p) => typeof (p as { __filename?: unknown })?.__filename === 'string'
      ? String((p as { __filename: string }).__filename).endsWith('.json') : true,
    counterexample: (p) => ({ ...(asObj(p) ?? {}), __filename: 'export.txt' }),
  },
  underSizeCap: {
    description: 'The export carries no rib data — only the project, its milestones and one record ' +
      'per dated sprint. At `validateProduct`\'s import cap of 200 sprints it measures ~70 KB, ' +
      'far under the importer\'s 10 MB limit.',
    check: (p) => JSON.stringify(p, null, 2).length <= 10 * 1024 * 1024,
    counterexample: (p) => ({ ...(asObj(p) ?? {}), __pad: 'x'.repeat(10 * 1024 * 1024 + 1) }),
  },
};

// ── The register ────────────────────────────────────────────────────────────

export const REGISTER: readonly RegisterRow[] = [
  { id: 'F01', line: 155, message: 'Import data must be a JSON object.', status: 'UNREACHABLE', basis: 'envelope' },
  { id: 'F02', line: 161, message: 'Import data is missing a valid "projects" array.', status: 'UNREACHABLE', basis: 'envelope' },
  { id: 'F03', line: 164, message: 'Import data is missing a valid "sprints" array.', status: 'UNREACHABLE', basis: 'envelope' },
  { id: 'F04', line: 173, message: 'Project at index ${i} is not a valid object.', status: 'UNREACHABLE', basis: 'envelope' },
  { id: 'F05', line: 176, message: 'Project at index ${i} is missing a valid "id".', status: 'UNREACHABLE', basis: 'projectIdFromProduct' },
  { id: 'F06', line: 179, message: 'Duplicate project ID "${p.id}" found at index ${i}.', status: 'UNREACHABLE', basis: 'singleProject' },
  { id: 'F07', line: 184, message: 'Project at index ${i} is missing a valid "name".', status: 'SHIPPED', basis: null,
    note: 'forecasterLimits.test.ts — "project name > blocks an empty name"' },
  { id: 'F08', line: 187, message: 'Project at index ${i} has a name exceeding ${MAX_STRING_LENGTH} characters.', status: 'SHIPPED', basis: null,
    note: 'forecasterLimits.test.ts — "project name" boundary pair (200 / 201)' },
  { id: 'F09', line: 190, message: 'Project at index ${i} is missing a valid "unitOfMeasure".', status: 'UNREACHABLE', basis: 'constantUnitOfMeasure' },
  { id: 'F10', line: 193, message: 'Project at index ${i} has a unitOfMeasure exceeding ${MAX_STRING_LENGTH} characters.', status: 'UNREACHABLE', basis: 'constantUnitOfMeasure' },
  { id: 'F11', line: 198, message: 'Project at index ${i} has invalid sprintCadenceWeeks (must be 1-52).', status: 'UNREACHABLE', basis: 'cadenceBounded' },
  { id: 'F12', line: 203, message: 'Project at index ${i} has invalid firstSprintStartDate (must be YYYY-MM-DD format).', status: 'PRECLUDED', basis: 'derivedDatesAreReal',
    note: 'A malformed first-sprint endDate makes addDays throw RangeError before any payload exists.' },
  { id: 'F13', line: 209, message: 'Project at index ${i} has invalid "milestones" (must be an array).', status: 'UNREACHABLE', basis: 'milestonesArray' },
  { id: 'F14', line: 212, message: 'Project at index ${i} has more than 10 milestones.', status: 'SHIPPED', basis: null,
    note: 'forecasterLimits.test.ts — "milestone count" boundary pair (10 / 11), plus the 14-releases/8-milestones case' },
  { id: 'F15', line: 218, message: 'Project ${i}, milestone at index ${j} is not a valid object.', status: 'UNREACHABLE', basis: 'milestoneShape' },
  { id: 'F16', line: 221, message: 'Project ${i}, milestone at index ${j} is missing a valid "id".', status: 'UNREACHABLE', basis: 'milestoneShape' },
  { id: 'F17', line: 224, message: 'Project ${i}, duplicate milestone ID "${m.id}" at index ${j}.', status: 'UNREACHABLE', basis: 'milestoneIdsUnique' },
  { id: 'F18', line: 228, message: 'Project ${i}, milestone at index ${j} is missing a valid "name".', status: 'SHIPPED', basis: null,
    note: 'forecasterLimits.test.ts — "release name > blocks an empty release name"' },
  { id: 'F19', line: 231, message: 'Project ${i}, milestone at index ${j} has a name exceeding ${MAX_STRING_LENGTH} characters.', status: 'SHIPPED', basis: null,
    note: 'forecasterLimits.test.ts — "release name" boundary pair (200 / 201), asserts WHICH release' },
  { id: 'F20', line: 238, message: 'Project ${i}, milestone at index ${j} has invalid backlogSize (must be >= 0 and <= ${MAX_NUMERIC_VALUE}).', status: 'SHIPPED', basis: null,
    note: 'forecasterLimits.test.ts — "numeric ceiling" boundary pair (999999 / 1000000)' },
  { id: 'F21', line: 241, message: 'Project ${i}, milestone at index ${j} is missing a valid "color".', status: 'UNREACHABLE', basis: 'milestoneShape' },
  { id: 'F22', line: 244, message: 'Project ${i}, milestone at index ${j} has invalid "showOnChart" (must be a boolean).', status: 'UNREACHABLE', basis: 'milestoneShape' },
  { id: 'F23', line: 256, message: 'Sprint at index ${i} is not a valid object.', status: 'UNREACHABLE', basis: 'sprintShape' },
  { id: 'F24', line: 259, message: 'Sprint at index ${i} is missing a valid "id".', status: 'UNREACHABLE', basis: 'sprintShape' },
  { id: 'F25', line: 262, message: 'Duplicate sprint ID "${s.id}" found at index ${i}.', status: 'UNREACHABLE', basis: 'sprintIdsUnique' },
  { id: 'F26', line: 267, message: 'Sprint at index ${i} is missing a valid "projectId".', status: 'UNREACHABLE', basis: 'sprintShape' },
  { id: 'F27', line: 272, message: 'Sprint at index ${i} has invalid sprintNumber (must be ${MIN_SPRINT_NUMBER}-${MAX_SPRINT_NUMBER}).', status: 'UNREACHABLE', basis: 'sprintNumberIsIndex',
    note: 'Upper bound rests on a PARTIAL basis — see the basis description.' },
  { id: 'F28', line: 275, message: 'Sprint at index ${i} has non-integer sprintNumber.', status: 'UNREACHABLE', basis: 'sprintNumberIsIndex' },
  { id: 'F29', line: 280, message: 'Sprint at index ${i} has invalid doneValue (must be 0-${MAX_NUMERIC_VALUE}).', status: 'SHIPPED', basis: null,
    note: 'forecasterLimits.test.ts — "negative velocity" (a downward revision) and the numeric ceiling' },
  { id: 'F30', line: 285, message: 'Sprint at index ${i} has invalid backlogAtSprintEnd (must be 0-${MAX_NUMERIC_VALUE}).', status: 'SHIPPED', basis: null,
    note: 'forecasterLimits.test.ts — "numeric ceiling"' },
  { id: 'F31', line: 290, message: 'Sprint at index ${i} has invalid sprintStartDate (must be YYYY-MM-DD format).', status: 'PRECLUDED', basis: 'derivedDatesAreReal',
    note: 'sprintStartDate is always addDays output or firstSprintStartDate; a bad source date throws first.' },
  {
    id: 'F32', line: 293, message: 'Sprint at index ${i} has invalid sprintFinishDate (must be YYYY-MM-DD format).',
    status: 'SHIPPED', basis: null,
    note: 'Found by this register as REACHABLE in v0.52.11 and blocked in v0.52.12. ' +
      '`sprintFinishDate: sprint.endDate` is the payload\'s only verbatim, unvalidated ' +
      'passthrough — `validateProduct`\'s sprint block asserts id/name/order, never the ' +
      'format. A regex-shaped but unreal date ("2026-13-45") survives ONLY on the last ' +
      'sprint: every other position is read by addDays while deriving the next start, and ' +
      'throws RangeError first. Covered by forecasterLimits.test.ts "sprint end date" and ' +
      'the F32 boundary pair.',
  },
  { id: 'F33', line: 296, message: 'Sprint at index ${i} has invalid customFinishDate (must be YYYY-MM-DD format).', status: 'UNREACHABLE', basis: 'noCustomFinishDate' },
];

/** Gates in `useImportState.handleFileChange` that refuse a file before the validator runs. */
export const PRE_VALIDATOR_REGISTER: readonly RegisterRow[] = [
  { id: 'P01', line: 215, message: 'Import failed: Please select a JSON file (.json)', status: 'UNREACHABLE', basis: 'jsonExtension' },
  { id: 'P02', line: 220, message: 'Import failed: File exceeds the 10 MB limit', status: 'UNREACHABLE', basis: 'underSizeCap' },
  { id: 'P03', line: 247, message: 'The file contains no projects to import.', status: 'UNREACHABLE', basis: 'singleProject' },
];
