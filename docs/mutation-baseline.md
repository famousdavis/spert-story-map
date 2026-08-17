# Mutation baseline — `src/lib/**` well-covered subset

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

## Per-file, ranked by survivors

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
rediscovered. **Neither is opened here.**
