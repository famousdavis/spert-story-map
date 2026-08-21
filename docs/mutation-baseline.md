# Mutation baseline — `src/lib/**` well-covered subset

**Current: v0.52.1, 73.58%.** Superseding the v0.52.0 first baseline of 71.57%.

> ⚠️ **The v0.52.0 figures are kept throughout, not overwritten.** The delta is the finding, and a
> baseline is the one document where a silently-replaced number destroys the only evidence that a
> change did anything.

## Delta, v0.52.0 → v0.52.1

| | v0.52.0 | v0.52.1 | |
|---|---:|---:|---|
| mutation score | 71.57% | **73.58%** | +2.01pp |
| covered score | 75.12% | **77.36%** | +2.24pp |
| total mutants | 3439 | 3440 | +1 |
| killed | 1560 | 1550 | **−10** |
| survived | 517 | **454** | −63 |
| no coverage | 103 | 103 | — |
| compile error | 1258 | **1332** | +74 |
| **valid denominator** | 2181 | **2108** | **−73** |

**Only two files moved.** The scoped include (`vitest.stryker.config.ts`) and `stryker.config.mjs`
were **untouched** — verified by diff, not asserted. That is what makes this a comparison rather
than a coincidence; the other nineteen files are byte-identical across the two runs.

| file | before | after | |
|---|---|---|---|
| `themeColors.ts` | 4 / 31 / 0 / 23 | **35 / 0 / 0 / 23** | 11.43% → **100%** |
| `validateProduct.ts` | 298 / 174 / 35 / 82 | **257 / 142 / 35 / 156** | 58.78% → **59.22%** |

*(killed / survived / nocov / compileError)*

### ⚠️ Why the denominator FELL — read this before treating it as a broken run

**A denominator that drops with no recorded cause reads as a broken run forever.** This one has a
structural cause.

v0.52.1 added compile-time guards tying each field allowlist in `validateProduct.ts` to the
interface it mirrors. Those allowlists previously carried **74 valid mutants — 41 killed and 33
survived.** A mutation of an allowlist member now fails to compile (`TS2322`, *"not assignable to
type 'never'"*), so those mutants report as `CompileError` and leave the denominator entirely.

⚠️ **The guard removed KILLED mutants as well as survivors, and that is the part worth
understanding.** It does not discriminate between a mutation tests would have caught and one they
would not — it makes the whole class unmutatable. `validateProduct` lost 41 kills and 32 survivors,
almost exactly the block measured beforehand.

> **Those 41 kills were positive evidence that the tests catch allowlist corruption. That evidence
> is gone** — not because the tests got worse, but because the mutation can no longer exist to be
> caught. **A guarantee replaced a measurement.** The guarantee is strictly stronger, and the cost
> is that mutation is blind on those fields permanently.
>
> ⚠️ So a future reader comparing profiles will see 73 mutants vanish from one file. **The absence
> of mutants there is the guard working, not coverage that was lost.** The same note is recorded at
> the site in `validateProduct.ts`.

This is the sharpest instance of the three-scales finding below: mutation buys least where a rule
has a second expression, and here a second expression was *deliberately manufactured*.

### ⚠️ The score-vs-value inversion — measured

| change | effect on survivors | effect on score |
|---|---|---:|
| one `toEqual` on a palette table | 31 killed | **+1.86pp** |
| ten compile-time structural guards | 32 removed | **+0.15pp** |

**The single cheap assertion outperforms the ten structural guards by more than 12× on the metric
— while the guards are the more valuable change.** The guards make a class of bug *impossible*; the
assertion makes one *detectable*.

A reader optimising the score would write the assertion and skip the guards. **That is exactly
backwards**, and it is the clearest available statement of what this score is and is not for.

### Predictions, registered before the run

All directions correct; magnitudes landed within one mutant, against a pre-registered expectation of
missing. ⚠️ **An unnecessary hedge is also a calibration error** — a hedge that is systematically too
wide stops carrying information, and the next one gets discounted whichever way it lands.

| | predicted | measured |
|---|---|---|
| `themeColors` survivors | 31 → 0 | 31 → 0 |
| `validateProduct` survived | → ~141 | **142** |
| `validateProduct` killed | → ~257 | **257** |
| `validateProduct` denominator | → ~433 | **434** |
| repo denominator | → ~2107 | **2108** |
| repo score | → ~73.6% | **73.58%** |

---

## The original first baseline

**Recorded 2026-08-17 at v0.52.0.** First mutation measurement ever taken of this repository.

> ⚠️ **This is a BASELINE, not a gate.** `npm run mutate` carries no score threshold, is not part
> of `npm run shipgate`, and does not run in CI. Wiring it into the gate would be a separate,
> deliberate decision. **There is no score target** — the most valuable outcome of a mutation run is
> often an informed decline.

---

## Reproducing it

```bash
npm run mutate          # -> scripts/mutation-guard.mjs -> npx stryker run
```

⚠️ **Always go through `npm run mutate`.** A Stryker run that fails to *start* emits no survivors
and no score, which reads identically to a perfect result — silent and flattering at once. The
guard is the part that tells those apart; see the falsification table below.

⚠️ **Clear the incremental cache before any run intended for comparison:**
`rm -f reports/mutation/.stryker-incremental.json`. This baseline was recorded with the cache
cleared.

| setting | value | why |
|---|---|---|
| Stryker | `9.6.1` (core / typescript-checker / vitest-runner, all exact) | soaked 128 days; 10.0.0 was 3 days old |
| `tsconfigFile` | `tsconfig.app.json` | see below — verified by rejection |
| `vitest.configFile` | `vitest.stryker.config.ts` | 19 test files; see the scoped-config defect below |
| `maxTestRunnerReuse` | `1` | required; a stale reuse failure reports as a *good* score |
| `concurrency` | `2` | higher inflates `Timeout`, which counts as **detected** |
| `excludedMutations` | **none** | decision recorded below |
| elapsed | 23m 15s | |

### `tsconfigFile` is two-sided, and was verified by rejection rather than by reading

Injecting a type error into `src/lib/aiOps.ts` is caught by `tsconfig.app.json` (exit 2) and seen
by **neither** `tsconfig.json` (a pure solution file — `files: []`, checks nothing) nor
`tsconfig.node.json` (config files only).

- Point it at a config that does not cover the targets → the checker validates nothing,
  non-compiling mutants are accepted and reported as **survivors**. ⚠️ That direction makes the
  *tests* look weak rather than making the *setup* look broken, and a result that criticises your
  own work does not get audited.
- Point it at a config that *excludes* a target → the checker crashes on the first mutant
  (`no watcher is registered for it`).

⚠️ **Fragility, stated so it is not misdiagnosed as a Stryker fault:** `tsconfig.app.json` has no
`exclude`, so `src/__tests__` is inside its program, and the checker compiles the whole program
before running a single mutant. **Any type error anywhere — including in a test file — is a hard
init blocker.** This repo being at zero type errors is the enabling condition, not a permanent one.

---

## Headline

```
total mutants   3439
killed          1560     survived   517     timeout        1
no coverage      103     compile error  1258     runtime error  0     ignored  0

mutation score  71.57%          (covered: 75.12%)
```

**The denominator is 2181**, not 3439: `killed + timeout + survived + noCoverage`. `CompileError`
mutants never ran and are excluded from it, so they do not distort the score. At 2181 valid mutants
the score is far above the small-denominator threshold where a percentage stops being evidence.

`covered: 75.12%` excludes `NoCoverage` as well, and answers a different question — *of the code
tests actually reach, how much is really checked?*

---

## Per-file — CURRENT (v0.52.5), ranked by survivors

| file | score | valid | killed | timeout | survived | nocov | compileErr |
|---|---:|---:|---:|---:|---:|---:|---:|
| `validateProduct.ts` | 59.59% | 438 | 261 | 0 | 142 | 35 | 156 |
| `aiOps.ts` | 79.43% | 350 | 278 | 0 | 67 | 5 | 449 |
| `exportForExcel.ts` | 46.62% | 133 | 62 | 0 | 58 | 13 | 24 |
| `calculations.ts` | 76.14% | 264 | 201 | 0 | 53 | 10 | 152 |
| `productTransforms.ts` | 88.22% | 348 | 307 | 0 | 39 | 2 | 204 |
| `ribCardColors.ts` | 46.81% | 47 | 22 | 0 | 25 | 0 | 35 |
| `exportForForecaster.ts` | 64.38% | 73 | 47 | 0 | 14 | 12 | 38 |
| `invitationErrors.ts` | 88.31% | 77 | 68 | 0 | 9 | 0 | 23 |
| `progressMutations.ts` | 80.43% | 46 | 37 | 0 | 8 | 1 | 42 |
| `formatDate.ts` | 80.00% | 40 | 32 | 0 | 7 | 1 | 22 |
| `firestoreUtils.ts` | 61.11% | 18 | 10 | 1 | 7 | 0 | 1 |
| `migration.ts` | 62.07% | 29 | 18 | 0 | 6 | 5 | 18 |
| `ribHelpers.ts` | 85.71% | 42 | 36 | 0 | 6 | 0 | 17 |
| `aiSnapshot.ts` | 83.33% | 36 | 30 | 0 | 5 | 1 | 34 |
| `progressViewHelpers.ts` | 66.10% | 59 | 39 | 0 | 4 | 16 | 53 |
| `sortByOrder.ts` | 75.00% | 8 | 6 | 0 | 2 | 0 | 8 |
| `driverCleanupRegistry.ts` | 50.00% | 6 | 3 | 0 | 1 | 2 | 3 |
| `signOutCleanup.ts` | 87.50% | 8 | 7 | 0 | 1 | 0 | 5 |
| **`themeColors.ts`** | **100.00%** | 35 | 35 | 0 | **0** | 0 | 23 |
| `auth-name.ts` | 100.00% | 15 | 15 | 0 | 0 | 0 | 2 |
| `settingsMutations.ts` | 100.00% | 40 | 40 | 0 | 0 | 0 | 23 |
| **`schemaVersion.ts`** | **100.00%** | 14 | 14 | 0 | **0** | 0 | 9 |
| **total** | **73.80%** | **2126** | **1568** | **1** | **454** | **103** | **1341** |

⚠️ `themeColors.ts` at 100% on 35 valid mutants is a **complete** result, not a thin-denominator
one: the file *is* a lookup table, so 35 is its whole population rather than a sample of it.

### v0.52.4 → v0.52.5 delta — fully attributed

| scope | v0.52.4 | v0.52.5 | delta |
|---|---|---|---|
| whole run | 73.58% · 2108 valid · 1550 killed · **454 survived** | 73.80% · 2126 valid · 1568 killed · **454 survived** | +18 valid, +18 killed, **survivors unchanged** |
| `validateProduct.ts` | 59.22% · 434 valid · 257 killed · **142 survived** | 59.59% · 438 valid · 261 killed · **142 survived** | +4 valid, +4 killed, **survivors unchanged** |

**Every one of the 18 new valid mutants is killed, and no survivor count moved in either scope.**
The score rose only because killed mutants were added to the numerator with nothing added to the
denominator's survivor side. The +18 decomposes exactly:

- **14 from `schemaVersion.ts`**, mutate target #22 as of v0.52.5 — 100% on all four metrics, 0
  survivors, plus 9 compile errors (which is the whole of the run's +9 there, 1332 → 1341).
- **4 from `validateProduct.ts`**, all on the single new line `:548`
  (`if (d.schemaVersion !== undefined)`), all Killed: two `ConditionalExpression`, one
  `EqualityOperator`, one `BlockStatement`. That guard is load-bearing — a bare assignment
  introduces the key with value `undefined` on a legacy product — so having all four killed is the
  result that matters.
- **Nothing else moved.** No other target changed any figure.

⚠️ `schemaVersion.ts` was added to `stryker.config.mjs` only after measuring it at 100%
statements/branches/functions/lines, per the "MEASURED SUBSET" policy in that file's own comment.
`schemaVersion.test.ts` joined `vitest.stryker.config.ts` in the same change; `validatorObserver.test.ts`
remains excluded from both, which is what keeps the observer's killing power at zero.

## Per-file — v0.52.0 first baseline, kept for comparison

| file | score | valid | killed | timeout | survived | nocov | compileErr |
|---|---:|---:|---:|---:|---:|---:|---:|
| `validateProduct.ts` | 58.78% | 507 | 298 | 0 | 174 | 35 | 82 |
| `aiOps.ts` | 79.43% | 350 | 278 | 0 | 67 | 5 | 449 |
| `exportForExcel.ts` | 46.62% | 133 | 62 | 0 | 58 | 13 | 24 |
| `calculations.ts` | 76.14% | 264 | 201 | 0 | 53 | 10 | 152 |
| `productTransforms.ts` | 88.22% | 348 | 307 | 0 | 39 | 2 | 204 |
| `themeColors.ts` | **11.43%** | 35 | 4 | 0 | 31 | 0 | 23 |
| `ribCardColors.ts` | 46.81% | 47 | 22 | 0 | 25 | 0 | 35 |
| `exportForForecaster.ts` | 64.38% | 73 | 47 | 0 | 14 | 12 | 38 |
| `invitationErrors.ts` | 88.31% | 77 | 68 | 0 | 9 | 0 | 23 |
| `progressMutations.ts` | 80.43% | 46 | 37 | 0 | 8 | 1 | 42 |
| `formatDate.ts` | 80.00% | 40 | 32 | 0 | 7 | 1 | 22 |
| `firestoreUtils.ts` | 61.11% | 18 | 10 | 1 | 7 | 0 | 1 |
| `migration.ts` | 62.07% | 29 | 18 | 0 | 6 | 5 | 18 |
| `ribHelpers.ts` | 85.71% | 42 | 36 | 0 | 6 | 0 | 17 |
| `aiSnapshot.ts` | 83.33% | 36 | 30 | 0 | 5 | 1 | 34 |
| `progressViewHelpers.ts` | 66.10% | 59 | 39 | 0 | 4 | 16 | 53 |
| `sortByOrder.ts` | 75.00% | 8 | 6 | 0 | 2 | 0 | 8 |
| `driverCleanupRegistry.ts` | 50.00% | 6 | 3 | 0 | 1 | 2 | 3 |
| `signOutCleanup.ts` | 87.50% | 8 | 7 | 0 | 1 | 0 | 5 |
| `auth-name.ts` | 100.00% | 15 | 15 | 0 | 0 | 0 | 2 |
| `settingsMutations.ts` | 100.00% | 40 | 40 | 0 | 0 | 0 | 23 |
| **total** | **71.57%** | **2181** | **1560** | **1** | **517** | **103** | **1258** |

⚠️ **`firestoreUtils.ts` has a different profile from the other twenty and its survivors must be
read differently.** It has no direct test. Its coverage comes through `firestoreDriver.ts` and
`AuthProvider.tsx`, both at **zero** coverage and therefore incapable of killing anything, plus
`migration.ts`. `migration.test.ts` is its entire killing power. Its survivors indicate **absent**
tests, not weak ones.

⚠️ **`auth-name.ts` and `settingsMutations.ts` score 100% on 15 and 40 valid mutants.** A perfect
score on a thin denominator is much weaker evidence than the same number on a large one. This does
not undermine any individual *survivor* finding elsewhere — a survivor is a specific mutant a
specific suite failed to kill, and that observation is as valid at n=8 as at n=507.

---

## Scope — 21 files, enumerated rather than globbed

The files in `src/lib/**` at or above 70% branch coverage: **90.24% aggregate, 1026/1137 branches**,
measured 2026-08-16.

⚠️ **The list in `stryker.config.mjs` is written out file by file on purpose.** A glob would
silently re-include a file the day its coverage moved. This is a *measured subset*, not a rule.

The other 20 files in `src/lib/**` are excluded for **two different reasons**, and conflating them
would invite a wrong re-inclusion later:

- **13 below the coverage floor** (8 of them at exactly zero). Mutating these would mostly
  rediscover that the code is untested, which is already known.
- **7 branch-free constants modules** — `constants`, `aiConstants`, `domHelpers`, `featureFlags`,
  `firestoreCollections`, `tosConstants`, `version`. These are at **100%** coverage. They are out on
  **rule-content** grounds, not coverage grounds, so nobody should re-include them the day a test
  lands.

---

## ⚠️ The scoped-config defect — and the standing method that found it

**The first baseline run was discarded.** `vitest.stryker.config.ts` was derived from *direct*
`import` edges between test files and mutate targets, and that method missed transitive chains:
`storage.test.ts` imports `src/lib/storage.ts`, which imports `validateProduct.ts` — a mutate target
— so it is a real killer for that target while importing it nowhere.

⚠️ **The failure direction is the dangerous one.** An omitted test simply does not run, so its
mutants report as `NoCoverage` — *"untested"* rather than *"unreached by this config"*. Identical
output, opposite meanings.

**The standing method for detecting it — run this whenever the include list changes:**

```bash
npx vitest run --config vitest.stryker.config.ts --coverage \
  --coverage.include='src/lib/**/*.ts' --coverage.reporter=json-summary
```

then compare per-target branch coverage against the **full** suite's. They must match exactly.
Before the fix, `validateProduct.ts` read 88.37% here against 89.53% there, and every other target
matched to the digit. Adding `storage.test.ts` closed it precisely.
(`importUtils.test.ts` and `storageDriver.test.ts` also reach `validateProduct` transitively and add
**nothing** — they are excluded, because a file that adds no coverage adds only killing power.)

**The check paid twice, and the second result only exists because the first was corrected.** It
found the defect; and once fixed, all 21 targets match full-suite coverage exactly — which proves
the **remaining 103 `NoCoverage` mutants are real.** That code is reached by no test in either
configuration. Without this note, 103 `NoCoverage` reads as unfinished scoping forever.

Re-running rather than recording the limitation was deliberate: **before recording is the only cheap
moment to fix a baseline.** A known defect in a baseline is not a caveat but a permanent
contamination, because adding the test afterwards invalidates every comparison against it.

Three directional predictions were made before the re-run and all three held: the score could only
rise (71.39% → **71.57%**), `validateProduct`'s survivors and `NoCoverage` could only fall
(176→174, 37→35), and **exactly one file could move** — one did. The effect was small: **0.18pp**.

### ATTRIBUTED PARITY GAP — `validateProduct.ts`, from v0.52.4 onward

**The 21-target exact match above no longer holds for one target, deliberately.** As of v0.52.4:

| target | scoped config | full suite | as of |
|---|---:|---:|---|
| `validateProduct.ts` | 89.53% | 95.93% | v0.52.4 |
| `validateProduct.ts` | **89.65%** | **95.97%** | **v0.52.5** |

Every other target still matches to the digit — re-verified across all **22** targets at v0.52.5.
The v0.52.5 figures moved because that release added branches to `validateProduct.ts` and put
`schemaVersion.test.ts` into the scoped config; the *gap* is unchanged in cause and size.

**Cause.** v0.52.4 added the validator observer (CLAUDE.md #61). Its test file,
`src/__tests__/validatorObserver.test.ts`, is kept **out of `vitest.stryker.config.ts` on purpose** —
it is the one file permitted to register the observer, and excluding it is what guarantees Stryker
never registers and therefore gains no killing power over `validateProduct.ts`. The gap is that
mechanism working, not a scoping defect.

**Confirmed sole cause, re-run at v0.52.5.** The full suite with
`--exclude='**/validatorObserver.test.ts'` returns `validateProduct.ts` to **89.65%** — identical
to the scoped config, exactly as it returned **89.53%** at v0.52.4. No other test file moved.

**The eleven branches, named.** All are reached by the observer corpus's `danglingFixture`, which
populates fields no other fixture in the repo sets together:

| line | branch | why only this corpus reaches it |
|---|---|---|
| `:350`, `:351` ×2 | rib `description` present + its two `&&` operands | the fixture sets `description: ''` |
| `:355`, `:356` ×2 | rib `notes` present + its two operands | sets `notes: ''` |
| `:362` | orphan-size clear | sets `size: 'M'` against a one-entry `sizeMapping` |
| `:398`, `:399` ×2 | allocation `memo` present + its two operands | sets `memo: ''` on both allocations |
| `:411` | progress entry naming a sprint that does not exist | carries a `GHOST-SPR` `sprintId` |

**Why this does not contaminate the figures.** Stryker runs under the scoped config, so these
branches are not exercised during mutation. At v0.52.4 both recorded figures were unchanged by the
observer — `validateProduct.ts` 59.22% / 142 survived / 434 valid, whole run 73.58% / 454 survived /
2108 valid. At v0.52.5 they moved for an unrelated and attributed reason (see the delta table
above), and **the survivor counts still did not move**, which is the number this gap could have
contaminated.

**⚠️ When re-running the standing method, expect this one gap and check it is still exactly this
one.** A gap on any other target, or a different figure on this one, is unattributed and is a
failure.

---

## `excludedMutations` — nothing is excluded, deliberately

⚠️ **There is no suite convention to inherit.** Two sibling repos exclude `StringLiteral` and
`ObjectLiteral`; a third excludes nothing. The two that agree carry **byte-identical comments**, so
that is one decision replicated, not two independent ones.

**For excluding:** string-content changes often produce equivalent mutants; empty-object mutations
rarely affect behaviour. Real, and it buys a cleaner number.

**Against, and it decides it here:** this repo writes short string labels (`op`, `entity`) into
`_changeLog`, an exported provenance record. A mutated label is not an equivalent mutant — it is
silent corruption of data that leaves the app.

⚠️ **The asymmetry is what settles it.** Excluding hides a class permanently and invisibly.
Including produces equivalent mutants that can be classified EQUIV *with a stated reason, at
classification time, where the judgement is visible.* **You can always exclude later with evidence;
you cannot recover a class you never measured.**

**The cost, accepted explicitly:** a wider mutator set means decomposition shrinks the denominator,
because new helper returns are object literals. A score that *falls* after a refactor while absolute
`Survived` holds is arithmetic, not a regression. **Gate any comparison on whether the survivor
delta reconciles, never on the score alone.**

### ⚠️ The prediction behind that decision FAILED — and how it failed is the finding

The stated reason was to catch mutated `_changeLog` provenance labels in `aiOps.ts`. **There are
zero such survivors.** Of the 33 `StringLiteral` mutants on `op:`/`entity:`/`source:` lines there:

| fate | count | why |
|---|---:|---|
| `CompileError` | 22 | `op`/`entity` are string-literal **union types** — most mutations do not compile |
| `Killed` | 11 | the ones that do compile are all caught by tests |
| `Survived` | **0** | |

The class is **doubly protected** — by the type system and by the tests.

**The decision still holds, for a different reason than was given.** `StringLiteral` is live
repo-wide: **177 killed, 145 survived** across the 21 files. Excluding it would have hidden 145
survivors — just not the ones predicted.

### ⚠️ CompileError attribution — read this before concluding the exclusions were free

1258 `CompileError` reads as though the decision cost a third of the run. **It cost 359.**

| mutator | CompileError | attributable to this decision? |
|---|---:|---|
| `StringLiteral` | 170 | **yes** |
| `ObjectLiteral` | 189 | **yes** |
| `ConditionalExpression` | 375 | no |
| `BlockStatement` | 152 | no |
| `LogicalOperator` | 132 | no |
| `ArrowFunction` | 64 | no |
| everything else | 176 | no |

**899 of 1258 are inherent to mutating strict TypeScript** and would have occurred under either
configuration.

---

## ⚠️ Independent expression operates at three scales — and it makes a survivor profile readable

The candidacy gate asks whether the rules a scope encodes have an independent expression elsewhere,
as though it were one binary question. This run shows it operating at **three** scales, each with a
different observable signature:

| scale | the second expression | signature in the report |
|---|---|---|
| cross-system | a server rule or schema | mutation buys least |
| cross-layer | **the type system** | **`CompileError`**, not survivors |
| intra-function | a re-applied constraint | **`EQUIV` survivors** |

So a survivor profile can be *read*: heavy `CompileError` means strong typing — `aiOps.ts` has
**449**, by far the most, and it is the most strictly typed file in the list. `EQUIV` clusters mean
internal redundancy. **GAP-dominant means neither, and the tests are the only guard.**

For this repo specifically: the Firestore rules are a field-**name** allowlist with auth and
membership gating and **no content validation of any kind**. So `validateProduct.ts`, `aiOps.ts` and
`productTransforms.ts` state their rules exactly once at the system scale — which is why mutation
buys most here, and why `validateProduct` shows almost no EQUIV.

---

## Guard falsification

The guard was tested against all four vacuity modes plus a positive control, by shimming `npx` on
`PATH` to control its **input** — the guard itself was not modified.

| scenario | guard | message |
|---|---|---|
| no report written | **FAILED** | *"no report at reports/mutation/mutation.json"* |
| **stale report on disk + run dies** | **FAILED** | *"no report"* — proving the pre-run delete fired |
| report written, zero mutants | **FAILED** | *"the report contains ZERO mutants"* |
| mutants generated, none executed | **FAILED** | *"40 mutants were generated but NONE were executed"* |
| positive control | **PASSED** | *"the run produced real verdicts"* |

⚠️ **The stale row is the isolation test.** It *satisfies* "a report exists" — a valid one, on disk —
and defeats only the deletion. Without the pre-run `rmSync`, the guard would have read that fixture
and reported success on a run that died. A single perturbation of a multi-check guard measures its
**ordering**, not its **coverage**.

⚠️ **`scripts/mutation-guard.mjs` is byte-identical to one sibling's copy** (md5
`4dca6427d776a880ea89049ae8246180`), which is only possible because `reportsDirectory` is set to
`reports/mutation` here. **That config value is load-bearing for the guard with no compile-time link
between them** — change one and the guard reads a path that is not there. They are a hand-maintained
pair; change them together. Note this is a **two-repo** artifact; another sibling has a
differently-named script that should not be assumed equivalent.

---

## Two files classified

The remaining 517 survivors are **deliberately not classified**. A baseline's job is to exist, be
reproducible, and record enough that a future item starts from it — not to be a remediation plan.
Two files were classified to answer the one question the aggregate cannot: **is the pool mostly real
gaps or mostly equivalent-mutant noise?**

**Answer: mostly real gaps.** A remediation item is worth opening. It is not opened here.

> ✅ **CLOSED in v0.52.1.** `themeColors.ts` is now 100% (0 survivors) — one whole-table `toEqual`
> in the already-included `themeColors.test.ts`. The classification below is the v0.52.0 record of
> why. `validateProduct`'s allowlist survivors are closed by compile-time guard rather than by test;
> see the delta section at the top for what that costs.

### `themeColors.ts` — 31/31, exhaustive. The canonical finding.

**83.33% branch coverage. 11.43% kill rate.** All 31 survivors are Tailwind class strings in the
8×4 `THEME_COLOR_OPTIONS` table, each mutated to `""`. Exactly **one** cell is asserted
(`rose.solid`) and is killed; the other 31 are not. The tests *execute* the table and *discriminate*
one cell of it.

That is "is this coverage real?" answered with a number, on a file whose coverage looked fine.

⚠️ **It is also the cheapest remediation in the repo: one `toEqual` against the whole table kills all
31.** And it is not hypothetical — this palette has already been migrated once (`amber`→`orange`,
v0.38.0). A table nothing pins is exactly where the next migration breaks silently.

*Predicted 70–85% GAP; actual **100%**. Under-predicted, including an explicit hedge that some might
be unobservable — they are not.*

### `validateProduct.ts` — 25 of 174, sampled every 7th across L35–L374

| classification | ~count | examples |
|---|---:|---|
| **GAP** | 17 | field-allowlist members; validation-skip guards; null guards |
| **EDGE** | 5 | cap assertions → `true`; the `MAX_MEMO` boundary — killable only with fixtures at the cap |
| low-value | 3 | assertion *message* text — the verdict is unchanged |
| **EQUIV** | ~0 *in sample* | |

**Highest-value cluster: the field allowlists.** `KNOWN_PRODUCT_FIELDS` / `KNOWN_CHANGELOG_FIELDS`
drive `stripObject`; dropping a member means that field is **silently stripped from imported data**.
This bug has shipped here before — `seq` had to be added to `KNOWN_CHANGELOG_FIELDS` or it was
stripped on import. Nothing pins them now.

*Predicted 20–35% EQUIV; actual ~0 in the sample.* ⚠️ **The prediction required the condition whose
absence defines this file.** The EQUIV mechanism needs a second enforcement layer downstream, and
`validateProduct` is the terminal validator — there is none. The prediction was self-contradicting
given the candidacy gate's own answer.

The mechanism *does* exist, confined to where the file re-checks itself: `PROTO_KEYS` (L92) is
consumed at L102 as `PROTO_KEYS.has(key) || !allowed.has(key)`, so mutating a member is **genuinely
equivalent** — the key falls through to the allowlist clause and is stripped anyway. That is a real
EQUIV, found while verifying a sample item rather than by looking for one.

**Two classification errors were made and corrected by checking rather than asserting**, both toward
the code being *better* than first reported: `PROTO_KEYS` is not dead code, and the prototype guards
at L318/L331 are well tested (most of their ~15 mutants each are killed; 2 survive at L331), not
unpinned as first recorded.

---

## 📌 Noted, not opened — a matched pair of hand-maintained field lists

Both have no compile-time link to what the app actually writes, and **both have a prior incident**:

- **Client-side:** `KNOWN_PRODUCT_FIELDS` / `KNOWN_CHANGELOG_FIELDS` in `validateProduct.ts`. A field
  omitted from the list is silently stripped on import. Already shipped once (`seq`).
- **Server-side:** `spertStoryMapProjectFields()` in the shared `firestore.rules`. A field added to
  the schema and omitted from the allowlist fails writes with `PERMISSION_DENIED`; the rules file's
  own comments record this shipping in a sibling app.

One each side of the boundary, same structure. Recorded as a named pair so the connection is not
rediscovered.

> ✅ **The client half is CLOSED as of v0.52.1** — ten compile-time guards, one per allowlist, each
> falsified in both directions. ⚠️ **The server half is NOT, and cannot be by the same means:**
> Firestore rules have no type system, so nothing can tie `spertStoryMapProjectFields()` to what the
> app writes. It remains open, in another repository, and is not this project's to close.
>
> ⚠️ **`PROTO_KEYS` deliberately has no guard** and now reads as the one allowlist without one. It
> mirrors no interface — `__proto__` / `constructor` / `prototype` are prototype-chain names, not
> domain fields — so any guard written there would pin nothing. Recorded at the site so nobody
> "completes the set".
