// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The register's own guard.
 *
 * The point is C3: a `basis` nobody has broken is a comment. Every basis
 * therefore carries a `counterexample`, and this file asserts BOTH directions
 * for all of them — holds on the real export, fails on the mutant. That makes
 * non-vacuousness mechanical rather than a matter of picking one to break.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildForecasterExport } from '../lib/exportForForecaster';
import { checkForecasterCompatibility } from '../lib/forecasterLimits';
import {
  BASES, PRE_VALIDATOR_BASES, REGISTER, PRE_VALIDATOR_REGISTER, PINNED_FORECASTER,
  type Basis,
} from '../lib/forecasterReachability';
import {
  CANONICAL_PRODUCT, BOUNDARY_PAIRS, normaliseExport, withSizedReleases, makeProduct,
  vendoredPayloads, serialise, FIXTURE_DIR, VENDORED_MANIFEST, VENDORED_MANIFEST_SHA256,
  type VendoredEntry,
} from './fixtures/forecasterFixtures';

const built = () => buildForecasterExport(CANONICAL_PRODUCT);

// ── C1: completeness, against the stated pin ────────────────────────────────
describe('register completeness', () => {
  it('has one row per Forecaster throw site', () => {
    expect(REGISTER).toHaveLength(PINNED_FORECASTER.throwCount);
  });

  it('numbers rows F01..Fnn with no gaps or duplicates', () => {
    expect(REGISTER.map((r) => r.id)).toEqual(
      Array.from({ length: PINNED_FORECASTER.throwCount }, (_, i) => `F${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('lists rows in ascending Forecaster line order', () => {
    const lines = REGISTER.map((r) => r.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });

  // C2: the message is the anchor, so it must never be blank or duplicated.
  it('gives every row a distinct, non-empty transcribed message', () => {
    const messages = REGISTER.map((r) => r.message);
    expect(messages.every((m) => m.length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it('resolves every basis reference, and uses every declared basis', () => {
    const referenced = new Set(REGISTER.map((r) => r.basis).filter((b): b is string => !!b));
    for (const key of referenced) expect(Object.keys(BASES)).toContain(key);
    // An unreferenced basis is dead weight that still looks like coverage.
    const preRefs = new Set(PRE_VALIDATOR_REGISTER.map((r) => r.basis));
    for (const key of Object.keys(BASES)) {
      expect(referenced.has(key) || preRefs.has(key)).toBe(true);
    }
  });

  it('gives SHIPPED and REACHABLE rows a note, and no basis', () => {
    for (const row of REGISTER) {
      if (row.status === 'SHIPPED' || row.status === 'REACHABLE') {
        expect(row.basis, `${row.id} must not claim a basis`).toBeNull();
        expect(row.note, `${row.id} must say what covers it`).toBeTruthy();
      } else {
        expect(row.basis, `${row.id} must name a basis`).toBeTruthy();
      }
    }
  });
});

// ── C3: THE load-bearing check ──────────────────────────────────────────────
describe('every basis is load-bearing', () => {
  const cases: Array<[string, Basis]> = [
    ...Object.entries(BASES),
    ...Object.entries(PRE_VALIDATOR_BASES),
  ];

  it.each(cases)('%s holds for the real export', (_name, basis) => {
    expect(basis.check(built())).toBe(true);
  });

  // If this passes for a basis whose counterexample does not really break it,
  // that basis is a comment and the row it backs is unguarded.
  it.each(cases)('%s FAILS for its counterexample', (_name, basis) => {
    expect(basis.check(basis.counterexample(built()))).toBe(false);
  });

  it('leaves the payload untouched when building a counterexample', () => {
    const original = built();
    const snapshot = JSON.stringify(original);
    for (const basis of Object.values(BASES)) basis.counterexample(original);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

// ── C3 again, end-to-end: break a basis for real, not just its mutant ───────
describe('a real exporter change breaks the named basis', () => {
  it('singleProject fails if the export ever emits two projects', () => {
    const twoProjects = { ...built(), projects: [built().projects[0], built().projects[0]] };
    expect(BASES.singleProject!.check(twoProjects)).toBe(false);
    // and P03's gate rides the same basis
    expect(PRE_VALIDATOR_REGISTER.find((r) => r.id === 'P03')?.basis).toBe('singleProject');
  });

  it('constantUnitOfMeasure fails if unitOfMeasure becomes product-derived', () => {
    const derived = built();
    derived.projects[0]!.unitOfMeasure = CANONICAL_PRODUCT.name;
    expect(BASES.constantUnitOfMeasure!.check(derived)).toBe(false);
  });

  it('noCustomFinishDate fails the moment the field is emitted', () => {
    const withField = built();
    (withField.sprints[0] as Record<string, unknown>).customFinishDate = '2026-01-14';
    expect(BASES.noCustomFinishDate!.check(withField)).toBe(false);
  });
});

// ── C5 + C6: fixture stability ──────────────────────────────────────────────
describe('committed fixture', () => {
  const COMMITTED = 'src/__tests__/fixtures/canonical-export.json';

  // Deep equality, NOT string comparison: project key order varies with content
  // (firstSprintStartDate is absent when a product has no dated sprints), so a
  // byte comparison would fail a perfectly valid fixture.
  it('matches what buildForecasterExport produces today', () => {
    const committed = JSON.parse(readFileSync(COMMITTED, 'utf8')) as unknown;
    expect(normaliseExport(built())).toEqual(committed);
  });

  it('has no exportedAt, and that is the only thing normalisation removed', () => {
    const raw = built() as unknown as Record<string, unknown>;
    const normalised = normaliseExport(raw);
    expect(normalised).not.toHaveProperty('exportedAt');
    expect(raw).toHaveProperty('exportedAt');
    // C6 — nothing else was stripped.
    expect(Object.keys(normalised).sort())
      .toEqual(Object.keys(raw).filter((k) => k !== 'exportedAt').sort());
    // and no nested value changed
    const rawMinus = { ...raw };
    delete rawMinus.exportedAt;
    expect(normalised).toEqual(rawMinus);
  });

  it('is deterministic apart from exportedAt', () => {
    expect(normaliseExport(buildForecasterExport(CANONICAL_PRODUCT)))
      .toEqual(normaliseExport(buildForecasterExport(CANONICAL_PRODUCT)));
  });

  it('still carries the source discriminator Forecaster keys on', () => {
    const committed = JSON.parse(readFileSync(COMMITTED, 'utf8')) as { source?: string };
    expect(committed.source).toBe('spert-story-map');
  });
});

// ── C4: boundary PAIRS ──────────────────────────────────────────────────────
describe('boundary pairs', () => {
  it('covers every SHIPPED row', () => {
    const shipped = REGISTER.filter((r) => r.status === 'SHIPPED').map((r) => r.id);
    const paired = new Set(BOUNDARY_PAIRS.map((p) => p.row));
    // F07/F18 (empty names) and F30 (backlogAtSprintEnd) share a mechanism with
    // their paired sibling; the rest must each have an explicit pair.
    const needPair = shipped.filter((id) => !['F07', 'F18', 'F30'].includes(id));
    expect(needPair.every((id) => paired.has(id))).toBe(true);
  });

  it.each(BOUNDARY_PAIRS.map((p) => [p.label, p] as const))(
    '%s: at the limit exports cleanly', (_label, pair) => {
      expect(checkForecasterCompatibility(buildForecasterExport(pair.at()))).toEqual([]);
    });

  it.each(BOUNDARY_PAIRS.map((p) => [p.label, p] as const))(
    '%s: one past the limit is blocked and names both numbers', (_label, pair) => {
      const issues = checkForecasterCompatibility(buildForecasterExport(pair.over()));
      expect(issues.length).toBeGreaterThan(0);
      for (const token of pair.names) expect(issues.join(' ')).toContain(token);
    });
});

// ── F32: found REACHABLE by this register in v0.52.11, blocked in v0.52.12 ──
describe('F32 — the gap this register found, now closed', () => {
  const lastSprint = (endDate: string) => makeProduct({
    ...withSizedReleases(1),
    sprints: [
      { id: 'sp-1', name: 'Sprint 1', order: 1, endDate: '2026-01-14' },
      { id: 'sp-2', name: 'Sprint 2', order: 2, endDate },
    ],
  });

  it('is recorded as SHIPPED', () => {
    expect(REGISTER.find((r) => r.id === 'F32')?.status).toBe('SHIPPED');
  });

  // The mechanism, pinned: the malformed date still REACHES the payload — the
  // export is unchanged. What changed is that the compatibility check now
  // refuses to hand it over.
  it('still emits the malformed date, but the check now blocks it', () => {
    const out = buildForecasterExport(lastSprint('2026-13-45'));
    // `toBe` fails on undefined, so the optional chain stays a real assertion.
    expect(out.sprints[out.sprints.length - 1]?.sprintFinishDate).toBe('2026-13-45');
    const issues = checkForecasterCompatibility(out);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Sprint 2');
    expect(issues[0]).toContain('2026-13-45');
  });

  it('lets a real last-sprint date through', () => {
    expect(checkForecasterCompatibility(buildForecasterExport(lastSprint('2026-01-28')))).toEqual([]);
  });

  it('throws instead when the malformed date is NOT last', () => {
    // The asymmetry is the whole mechanism: addDays reads every endDate except
    // the last one's, so only the last could ever escape into the payload.
    expect(() => buildForecasterExport(makeProduct({
      ...withSizedReleases(1),
      sprints: [
        { id: 'sp-1', name: 'Sprint 1', order: 1, endDate: '2026-01-14' },
        { id: 'sp-2', name: 'Sprint 2', order: 2, endDate: '2026-13-45' },
        { id: 'sp-3', name: 'Sprint 3', order: 3, endDate: '2026-03-11' },
      ],
    }))).toThrow(RangeError);
  });
});

// ── Vendoring: the only signal either repo has that the far copy went stale ──
describe('vendored fixtures', () => {
  const sha = (body: string) => createHash('sha256').update(body).digest('hex');
  const manifestBody = () => readFileSync(VENDORED_MANIFEST, 'utf8');
  const manifest = () => JSON.parse(manifestBody()) as { entries: VendoredEntry[] };

  it('lists every vendored payload, and nothing else', () => {
    expect(manifest().entries.map((e) => e.file))
      .toEqual(vendoredPayloads().map((e) => e.file));
  });

  // Regenerates each payload and compares BYTES. This is what makes the
  // spert-forecaster copies meaningful: they are this exporter's real output.
  it.each(vendoredPayloads().map((e) => [e.file, e] as const))(
    '%s is exactly what the exporter produces today', (file, entry) => {
      expect(readFileSync(`${FIXTURE_DIR}/${file}`, 'utf8')).toBe(serialise(entry.payload));
    });

  it('records a correct SHA-256 for every file', () => {
    for (const entry of manifest().entries) {
      expect(sha(readFileSync(`${FIXTURE_DIR}/${entry.file}`, 'utf8')), entry.file)
        .toBe(entry.sha256);
    }
  });

  // ⚠️ THE PIN. C5 stays green when the exporter and the fixture change
  // together — the normal way this contract evolves, and exactly when the
  // vendored copies in spert-forecaster go stale. This is what fails then.
  it('matches the pinned manifest SHA — if this fails, RE-VENDOR to spert-forecaster', () => {
    expect(sha(manifestBody())).toBe(VENDORED_MANIFEST_SHA256);
  });

  // The far side asserts its real validator accepts/rejects per this field, so
  // a wrong value there would make a green run over there prove the opposite.
  it('agrees with our own checker about which payloads are exportable', () => {
    for (const entry of manifest().entries) {
      const payload = JSON.parse(readFileSync(`${FIXTURE_DIR}/${entry.file}`, 'utf8')) as never;
      const blocked = checkForecasterCompatibility(payload).length > 0;
      expect(blocked, `${entry.file} expected ${entry.forecasterShould}`)
        .toBe(entry.forecasterShould === 'reject');
    }
  });

  it('covers both halves of every boundary pair', () => {
    for (const pair of BOUNDARY_PAIRS) {
      const files = manifest().entries.filter((e) => e.row === pair.row);
      expect(files.map((f) => f.forecasterShould).sort(), pair.row)
        .toEqual(['accept', 'reject']);
    }
  });
});
