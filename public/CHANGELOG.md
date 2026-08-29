# Changelog

## Version 0.52.18 (2026-08-29)

### Fixed — a check now enforces the citation rule that three hand-fixes in a row got wrong

No change to how the app behaves. The last two releases corrected notes in the source
that pointed at SPERT Release Forecaster. Reviewing 0.52.17 found the same class of
mistake inside the correction itself, for the third time running.

The note said a constant lives at `constants.ts:39`, meaning Forecaster's file. This app
has its own `constants.ts`, and line 39 of it holds a real setting — so anyone following
that reference opens the obvious local file and lands somewhere that looks right and
isn't. That is the version of the mistake that does not announce itself, and it is why
reading more carefully kept failing to catch it.

Reading is now not what catches it. A test derives which files talk to the other app —
any file mentioning Forecaster — and requires every reference in them to carry a full
path. A file pointing at its own lines is exempt, because that cannot be mistaken for
anything. Five references were rewritten to comply, and the test fails if a bare one comes
back.

The rule is narrower than the one a person would state, deliberately. "Use a full path
whenever the name is ambiguous" cannot be checked by a machine, because deciding which
references are ambiguous is the judgment that keeps going wrong. Twenty-six of this app's
twenty-seven references are short names, and almost all of them are fine. Only the ones
crossing between the two apps are the problem, and those can be identified without
guessing.


## Version 0.52.17 (2026-08-29)

### Fixed — a note added in 0.52.16 gave the wrong reason for its own conclusion

No change to how the app behaves. Yesterday's release corrected three notes that had gone
out of date. One of those corrections closed by saying the question should only be
reopened "if SPERT Release Forecaster ever exports these constants" — and Forecaster
already exports one of the three. The same note cites that exact line thirty lines above.

The conclusion was right and is unchanged: this app cannot read those numbers from
Forecaster and has to keep its own copy. But the reason is that the two apps are separate
projects with separate builds, so neither can reach into the other's code at all. Whether
a value is exported has nothing to do with it. As written, the note would have sent the
next person who checked it off to reopen a settled question.

The note now says the boundary is the reason, and records the wrong version underneath it,
since this is a note whose whole purpose is to stop that from happening.


## Version 0.52.16 (2026-08-29)

### Fixed — three notes about the SPERT Release Forecaster handoff that had gone out of date

No change to how the app behaves. These are notes in the source code, and all three
described a future that had already arrived. That makes them worse than no note at all,
because each one quietly tells the next person not to look.

**One note promised that a set of shared samples would retire a hand-copied table of
Forecaster's import limits.** Those samples shipped in 0.52.13 and 0.52.14, and the table
is still hand-copied and still decides every message this app shows when it blocks an
export. Looking into why turned up something better than the correction: it could never
have worked that way. Forecaster keeps those three numbers private to its own file, so a
shared sample can only prove the behaviour at a limit is right — it can never read the
number itself. Samples and a shared constant are different tools, and only the second
could have retired the table. The note now says so, and says what the samples did buy
instead, which is real: change a limit on one side without the other and a check fails.

**A second note called the matching check on the Forecaster side future work.** It shipped
the following day. The gap it was written about is still open, because that check was never
the thing that would close it — Forecaster counts its own rejection points automatically,
so a new one shows up over there and stays invisible here. That asymmetry is now written
down plainly, along with a measurement: as of Forecaster 0.41.0 the count still matches, so
the list in this app is accurate today. What it cannot do is notice the day that changes.

**A third note called a number "derived, not assumed."** It was derived once, by hand, when
it was written, and then frozen. Nothing in this app re-derives it and nothing can, because
this app's tests cannot read the other app's source. It now reads as what it is: a
transcription with a date on it.

One of the three was also written into a commit message, which cannot be edited after the
fact. The note in the file now quotes that claim and contradicts it directly, so whichever
one a reader finds first, they end up in the right place.

## Version 0.52.15 (2026-08-29)

### Fixed — a project name, release name, or sprint name can no longer be left blank

Clearing one of those three fields and clicking away used to save the blank. The project
kept working, but it could no longer be read back in: importing a project requires all
three to have a name, so a project could reach a state where exporting it and importing
it again would fail. Blanking a field now simply restores what was there, the same as
pressing Escape.

Theme, backbone and rib item names are deliberately unchanged — those are allowed to be
blank, and nothing downstream objects.

This only prevents new blanks. A name already saved as blank stays blank until you type
one in; the field will not invent a name you never entered.

## Version 0.52.14 (2026-08-28)

### Fixed — three gaps in the SPERT Forecaster export samples

No change to how the app behaves. The samples added in 0.52.13 are what SPERT Release
Forecaster checks its importer against, and reviewing them from that side found three
things wrong with them.

**A sample meant to sit exactly at a limit was sitting just inside it.** The sprint
velocity sample was built one point above the floor rather than on it, so it passed for
the wrong reason and the pair only really tested one side. Corrected, and — more
usefully — every sample now has to prove it sits *on* its limit, not merely under it.
That check is what was missing; without it, correcting the one value would have left the
next one free to drift the same way.

**A limit had no sample of its own.** The check on remaining backlog was only ever
exercised by a sample that also broke a different limit and reported that one instead. It
now has a pair built so no release milestones exist at all, which is the only way to
reach it on its own.

**A date sample was testing the shallower half of the rule.** `2026-13-45` is not a date
at all and gets rejected immediately, so it never reached the part of the check that
catches dates that *look* real and quietly shift — like February 29th in a non-leap year.
A second pair now covers that, using a genuine leap day as its valid half.

Also recorded: some of Forecaster's rejections can never be reached by anything this app
exports — that is what makes them unreachable — so their absence from the sample set is
permanent by construction and not a gap to be closed. That is now written down where
somebody would otherwise file it as work.

## Version 0.52.13 (2026-08-28)

### Added — the SPERT Forecaster export contract is now pinned on both sides

No change to how the app behaves. SPERT Release Forecaster now runs a copy of this
app's real export files through its own importer, and this release supplies them and
keeps them honest.

Twelve new export samples are committed alongside the existing one — a matched pair for
each limit the two apps share, one sample sitting exactly at the limit and one just past
it. Forecaster checks that it accepts every sample on one side and refuses every sample
on the other. Previously Forecaster had only a single sample that sat at no limit at
all, so both halves of every boundary had to be hand-written over there rather than
being real output from this app.

A checksum now covers the whole set. It exists to catch the case the previous release
could not: when the export format changes and the samples are regenerated **together**,
every other check stays green — and that is precisely the moment Forecaster's copies go
stale. The checksum fails then, and updating it is the step that says "copy these over".

Nothing automated can keep the two copies in step — neither app's tests can read the
other's files — so this is a deliberate manual step at each contract change, and it is
now written into the files themselves rather than living in somebody's memory.

## Version 0.52.12 (2026-08-28)

### Fixed — an invalid sprint end date no longer produces an export SPERT Forecaster refuses

Exporting to SPERT Release Forecaster now checks that every sprint's end date is a
**real calendar date**, not merely something date-shaped.

What you would have seen before: the export downloads normally, and then Forecaster
refuses the whole file with a raw technical message — long after the moment you could
connect it to anything. The export now blocks up front and names the sprint and the
offending value.

The gap was narrow and easy to miss, which is why it survived the previous release.
A sprint's end date is the one value copied into the export untouched, and Story Map
has never checked its format — only that it is present. Every sprint's date *except the
last* is read while working out the next sprint's start date, so a bad one is normally
caught there. The last sprint has no next sprint, so its date was never examined by
anything. A date like `2026-13-45` — right shape, no such day — went straight through.

Reachable only for a project imported from a hand-edited file; the date picker in
Settings cannot produce one.

This was found by the reachability register added in 0.52.11, on its first run, which
is what that register is for. Its entry for this rejection flips from *reachable* to
*blocked* in the same change.

## Version 0.52.11 (2026-08-28)

### Added — a reachability register for the SPERT Release Forecaster handoff

No change to how the app behaves. This release adds the test scaffolding that makes
the previous one hold.

Version 0.52.10 fixed six ways a Story Map export could be refused by SPERT Release
Forecaster. Each was found by hand — try an input, see whether Forecaster rejects it.
That worked, and it does not compose: nothing made a seventh announce itself.

`src/lib/forecasterReachability.ts` now records **one row for every way Forecaster can
refuse an import** — 33 of them, plus 3 further checks the importer applies before
validation. Each row says whether this app can actually produce a file that trips it,
and when it cannot, records the property of Story Map that makes it so. Those
properties are executable and each one is paired with a deliberate counterexample that
must break it, so a change to the exporter that quietly re-opens a gap now fails a test
that names the property it broke.

**It found a seventh mismatch on its first run.** A sprint end date that *looks* like a
date but is not a real one — `2026-13-45` — passes straight through to Forecaster
unchecked, but only on the **last** sprint: every other sprint's date is read while
calculating the next sprint's start, which catches it. Story Map never validates the
format of a sprint end date, so a project imported from a hand-edited file can carry
one. **This is recorded, not yet fixed** — the export is unchanged in this release, and
blocking it is a behaviour change that belongs in its own.

The export is also now pinned to a committed fixture, so a change to its shape has to
be a deliberate edit rather than a silent one.

**What this does not do:** the register is not self-validating. Its row count is a
recorded fact, checked against SPERT Release Forecaster at a stated version — not
something this app can re-derive on its own. If Forecaster adds a new rejection, nothing
here goes red. Closing that needs matching work in Forecaster, which is deliberately a
separate piece.

## Version 0.52.10 (2026-08-28)

### Fixed — the SPERT Release Forecaster handoff

**Story Map exports now identify themselves to Forecaster.** Forecaster has always
carried a dedicated code path for Story Map files, keyed on a `source` field this app
never sent. Every export therefore arrived as an unrecognised "legacy" file, which
pre-selected Forecaster's *replace entire workspace* mode and hid the per-project merge
controls behind a toggle the user had to find. Exports now send
`source: "spert-story-map"`, so Forecaster shows the merge controls directly and the
workspace-wide replace path is no longer offered for these files. Forecaster's audit
trail also records the file's true origin instead of logging it as a generic upload.

**The export is now checked against Forecaster's import limits before it downloads.**
The two apps disagree about several limits, and every disagreement produced a file
Forecaster refused whole — with the failure surfacing as a raw error in the other app,
long after the download. The export button now blocks and explains, naming the field
and both numbers:

| | Story Map allowed | Forecaster accepts |
|---|---|---|
| Releases carrying story points | 100 | **10** |
| Project and release names | 1,000 characters | **200** |
| Story-point totals | unbounded | **999,999** |
| Sprint velocity | may be negative | **0 or more** |

Blocking rather than warning is deliberate: a file over these limits is one Forecaster
is guaranteed to reject, so downloading it only moves the failure. Truncating to fit
would silently discard data.

Two of these are reachable with ordinary data, not just large projects. **Negative
velocity** occurs whenever a rib item's progress is revised *downward* between sprints —
a routine re-assessment, previously invisible at the export button. And releases with
no story points are **not** counted toward the 10-milestone limit, so a project can
carry more than ten releases and still export cleanly.

Also fixed: an export could fail silently with no message if a sprint carried a
malformed end date. It now reports the problem and points at the Sprints settings.

## Version 0.52.9 (2026-08-25)

**Project list only.** Nothing about how you build a story map changed.

### A project card could show today's date for a project you had not touched in months

Each project card carries an "Updated" date. If the stored date was missing or in a shape this app
could not read, the card quietly filled the gap with the current date. There was no error and nothing
looked wrong — the card simply told you the project had been updated today, and there was no way to
tell that apart from a project that genuinely had been.

A wrong date that looks right is worse than a visibly missing one, so cards now show a dash when
there is no real date to show, and never invent one.

### Some cards showed the literal words "Invalid Date"

The same field could also arrive in shapes left behind by earlier versions of the cloud storage, or
written by the invitation system when someone shares a project with you. Those did not get replaced
with today's date — they printed the words "Invalid Date" onto the card instead. Those now show the
same dash.

### Importing a project without a date no longer produces a made-up one

This was the way to reach the problem without any cloud storage involved at all. A project file
exported without an "Updated" date imported perfectly happily, and its card then showed the day you
imported it as though that were when the work was last changed.

## Version 0.52.8 (2026-08-24)

**Cloud storage only.** Nothing about how you build a story map is different, and nothing about
locally-stored projects changed.

### Projects now record when they changed as plain text, like the rest of the suite

When a project is saved to the cloud, the time it was last changed used to be recorded by asking the
database to stamp the moment it received the write. That produces a database-specific object rather
than plain text — and this app's own description of a project says that field holds text. The two
have disagreed since cloud storage shipped.

The disagreement was not harmless elsewhere in the suite. Another SPERT® app reads the same field
and formats it as a date, and formatting refuses rather than shrugs when handed an object, so that
app's project list could fail to draw a row after someone was invited to a shared project.

All four places this app writes that time now write plain text.

### The fourth place was nearly missed, and it is the one that would have been silent

Three of the four are in the cloud storage code. The fourth is in the one-off upload that moves
locally-stored projects into the cloud, and it was missed in the first pass of this work while its
exact counterpart in SPERT® Scheduler was caught. Had it stayed as it was, everything would have
looked converted while a user moving their projects to the cloud quietly re-acquired the old shape —
no error, no visible symptom, and nothing to notice until the same crash reappeared somewhere else.

### What was verified

- Each of the four is checked separately rather than one check per file. A single check per file
  passes while one of two places in that file is still wrong, which is the shape of the original
  defect.
- The checks were run against the old code first and all four failed. They were then run with only
  the local-to-cloud upload left unconverted, and **exactly one** failed — which is what shows they
  test four separate places rather than four times reading the same one.
- The temporary connection used by the AI features writes the same kind of stamp deliberately and is
  untouched. It was confirmed still present afterwards, so the count of zero in the changed files
  means the search worked rather than that it found nothing.

## Version 0.52.7 (2026-08-22)

**Development tooling only.** No application code changed and nothing about how the app behaves is
different.

### The mutation-testing safety check no longer passes the run it exists to catch
Mutation testing makes small deliberate changes to the code and asks whether any test notices. A
wrapper around it exists to refuse a run that produced no real results but reports a clean-looking
one, because that failure is silent and flattering — the worst combination.

The wrapper counted "no test reaches this code" as a real result. So a run in which every single
change went unchecked — a score of zero per cent, nothing actually tested — was reported as having
produced real verdicts. The precise failure it was written to prevent, surviving inside it.

The fix separates two questions that had been sharing one sum. Whether a change was left untested is
a real fact about the code, and still counts towards the score exactly as before. Whether the test
suite ever ran at all is a different question, and an untested change is silence rather than
evidence. Only the second question changed.

### The cause originally recorded for this was wrong, and that matters more than the fix
This project's own notes, and the suite rule they came from, said the all-unchecked state came from
one specific misconfiguration — omitting the setting that tells the runner which test configuration
to use. Five attempts were made to produce that state deliberately, across two projects.

None produced it. This project is the strongest test of the claim, because its test configuration is
at a non-standard filename and there is no standard one to fall back on, so omitting the setting
should do the most damage here. It scored 79.49 per cent, with thirty-one changes caught.

What actually happens is one of two things, never anything between them: if no test covers the
changed code, the runner finds no tests and stops before writing any result at all; and if it is
told not to narrow the tests it runs, it runs the whole suite and reports the changes as surviving
rather than as unchecked.

So the replacement note describes the state being refused and names no cause for it. A note that
explains a fault by pointing at one trigger stops being true when the trigger changes; a note that
describes what is being refused does not. The hole was real however a run reaches it.

### What was verified, and what was not
Four hand-built cases were run through the real checking script, before and after the change: the
faulty case now fails and says why, an ordinary run containing some unchecked code still passes, and
two already-failing cases are unchanged. Running them against the unfixed script too is what makes
this evidence rather than assertion — only the first case changes.

Every stored measurement still passes, with an identical score. This project's stored measurement is
one of only two that contain unchecked code, which is the case the change had to leave alone.

## Version 0.52.6 (2026-08-22)

**Development and release tooling only.** No application code changed and nothing about how the app
behaves is different.

### The release-checking script no longer says there is no automated checking
The script that checks a release before it ships is deliberately the same file in all nine SPERT®
Suite projects. The note at the top of it said there was no automated checking anywhere in the
suite — that a green tick on a proposed change meant only that a preview copy had been built, and
that nothing ran the tests.

That has not been true since the script existed. Automated checking runs on every one of the nine
projects, on every proposed change and on every merge, and what it runs is this very script.

The statement did not go out of date. It was untrue on the day it was written: the same set of edits
that added the script also switched the automated checking on, so the file contradicted a change
sitting beside it. That distinction decides the remedy, which is why it is recorded here. A statement
that decays can be helped by writing down when it was made; a statement that was never true cannot.
What went wrong was that a claim about the projects was written into an explanation without being
checked against them, and an explanation is read as background rather than as an assertion somebody
has to verify.

The danger was specific: the note told a reader that a green check means nothing. Anyone reading it
would discount a real signal, or repeat work already checked — a correct-looking pause resting on a
false premise, which produces no error and simply spends a round trip.

### Two explanations were added to the same file
The first records that automated checking and a check run by hand are complementary rather than
ranked. The automated one works from a clean copy, so it catches anything that quietly depends on a
file existing only on the author's own machine; but it also has less of the project to look at, so
certain checks step aside there and only a hand-run finds what those cover.

The second explains how the code-style step is judged. That step compares the number of reported
issues against an agreed figure instead of reading pass or fail, and it does so for opposite reasons
in different projects: here the step reports failure at the agreed figure of twenty-two, so reading
pass-or-fail would be too strict; in one sibling project it reports success at its figure, because
those findings are all advisories, so reading pass-or-fail would be too lenient and would let new
issues through unnoticed. The note also warns that the figure counts every kind of issue rather than
the one kind a project set it for, and that when it reaches zero the setting must be removed rather
than set to zero — at zero the tool prints no count at all, and the step then fails asking for a
number that was never printed.

### Two notes in this project stopped pointing at line numbers
Adding lines to the top of the shared script moved every reference to a position inside it. Two
notes in this project — one in the release-gate configuration, one in the code-style configuration —
cited a line number there. Both now name the part of the script they mean.

They were converted rather than renumbered. A renumbered pointer reproduces the fault on a delay,
and its failure mode is that a stale pointer lands on a real line: a reader follows it, finds
plausible code, and concludes the reference was sound. Landing on something reads as success.

## Version 0.52.5 (2026-08-21)

**A data-loss bug fix.** It affects cloud projects whose internal version marker had been corrupted —
rare, but the consequence was silent and permanent, so the fix is worth stating plainly.

### Progress history could be wiped when a cloud project loaded
Every project carries an internal marker recording which data format it uses. Projects created before
release planning gained per-release progress are upgraded automatically the first time they load.

If that marker held a value that was neither a number nor empty — something only corruption or hand
editing produces — the browser disagreed with itself about what to do. Loading from the cloud ran the
upgrade; loading from this browser's own storage, or importing from a file, did not. Running that
upgrade on a project that did not need it **cleared the recorded progress for every item not assigned
to a release**, and the loss was permanent once the project saved again.

All four places that make this decision now share one answer, and the answer is the cautious one: a
marker that cannot be read is left alone rather than treated as old data needing an upgrade.

### A malformed project no longer takes the whole project list down with it
Loading the project list read every project in turn. A project whose internal structure was damaged
threw an error that stopped the entire list from loading — so one bad project hid all the others.
Damaged projects are now skipped over, and the rest of the list loads normally.

### Importing a file with a damaged version marker
The marker is repaired on import instead of the file being rejected, so a damaged file still opens.

## Version 0.52.4 (2026-08-21)

**Nothing changes in how the app works.** This release adds an internal diagnostic that is switched
off by default, and touches no feature, screen or stored file.

### Why it exists
Projects are checked for structural problems when you import one from a file, but not when they are
loaded from your browser's storage or from the cloud. This release adds an observer that runs the
same check against loaded projects and reports what it finds, so the gaps can be measured on real
data before anything starts acting on them.

### What it does not do
The observer never modifies a project. It works from a copy, reports to the developer console, and
writes nothing anywhere. It stays completely inactive unless it is deliberately switched on, and it
is off for everyone by default — so for every user this release is a no-op.

## Version 0.52.3 (2026-08-19)

**Nothing changes in how the app works**, unless you sign in with a personal Microsoft account.

### Microsoft sign-in now requires a work or school account
Personal Microsoft accounts — outlook.com, hotmail.com, live.com — are no longer accepted. Microsoft
itself enforces this, so such an account is refused at the sign-in screen before any password is
entered. The change was made for institutions evaluating the Suite, who reasonably expect "sign in
with Microsoft" to mean an organisational account rather than any account at all.

Nothing changes for personal use: Google still accepts personal accounts, and the Settings page now
says so rather than letting you pick Microsoft and discover the restriction from an error message.

## Version 0.52.2 (2026-08-19)

**Nothing changes in how the app works.** One security header value.

### This app can no longer be embedded in a frame on another site
The `X-Frame-Options` header goes from `SAMEORIGIN` to `DENY`. `SAMEORIGIN` already blocked other
sites from embedding the app; it additionally permitted the app to embed *itself*, which it never
does — nothing in this codebase creates a frame, and neither does any other SPERT® Suite app.

The value was set in v0.46.2, when this was the first Suite app to get security headers at all. The
six apps that followed chose `DENY`, so this brings the app into line with the rest of the Suite and
removes a difference that had no reason behind it.

## Version 0.52.1 (2026-08-17)

**Nothing changes in how the app works.** Two safety fixes — one test, one compile-time check — and
no runtime behaviour change of any kind.

### The check that caught something while it was being written
Importing a project file strips any field the app doesn't recognise, using hand-maintained lists of
known field names. If a field is added to the app but not to its list, **that field is silently
discarded from every imported file.** That has happened before: `seq` shipped missing from one list
and was quietly stripped on import until it was noticed.

This release ties each of those ten lists to the data shape it is supposed to mirror, so the
mismatch now stops the build instead of shipping. **The check found a real gap the moment it was
switched on** — two fields (`_owner`, `_members`) that were missing from the exclusion list because
their declarations sit below a long comment and were missed by eye. Both carry account permissions,
which is exactly the category that must never be accepted from an imported file.

### The theme palette is now pinned
`themeColors.ts` holds the eight theme colours and their styling. Its tests checked that the table
had eight entries with the right field names — and never checked a single value. **31 of its 32
styling strings could have been emptied without any test failing.** One assertion against the whole
table now covers all of them.

That is not hypothetical: this palette was already changed once, in v0.38.0. A table nothing checks
is exactly where the next change breaks quietly — every colour still renders, just unstyled.

### ⚠️ Worth stating plainly: the cheap fix scored better than the valuable one
Measured against the mutation baseline:

- the **one-line table assertion** improved the score by **1.86 points**
- the **ten compile-time checks** improved it by **0.15 points**

The assertion outperformed the ten structural checks by more than twelvefold on the metric — while
the checks are the more valuable change. **The checks make a whole class of bug impossible; the
assertion makes one kind of bug detectable.** Anyone treating the score as the goal would write the
assertion and skip the checks, and that would be exactly backwards. It is the clearest illustration
we have of what that number is and is not for.

### Fixed
- **Ten field lists in `validateProduct.ts` are now tied to their data shapes at build time.** Adding
  a field without adding it to its list fails the build, naming the field.
- **`themeColors.ts` has every styling value asserted**, closing all 31 gaps the baseline found.

Full record, including what the compile-time checks cost in measurement terms, is in
`docs/mutation-baseline.md`.

## Version 0.52.0 (2026-08-17)

**Nothing changes in how the app works.** This release adds a measurement tool and records what it
found. No functional, data or interface changes.

Test coverage answers *"was this line run by a test?"* — which is a weaker question than it sounds,
because a line can run without anything checking what it did. **Mutation testing asks the harder
one: if this code were quietly changed, would any test notice?** It works by making thousands of
small deliberate changes — flipping a comparison, emptying a string, deleting a condition — and
recording how many the suite catches.

Run once over the 21 best-tested files in the shared logic layer: **3,439 changes made, 71.6%
caught.**

### Added
- **`npm run mutate`** — runs the measurement and refuses to report a result it cannot stand behind.
  ⚠️ A run that fails to *start* produces no failures and no score, which looks exactly like a
  perfect result; the wrapper exists to tell those two apart, and was itself tested against four
  distinct ways a run can be hollow.
- **`docs/mutation-baseline.md`** — the full record: every file's score, how to reproduce it, what
  was decided and why, and two findings examined in detail.

### The most useful thing it found
`themeColors.ts` — the theme colour palette — sits at **83% line coverage but only 11% of changes
caught.** The tests run the whole 8×4 table of colour values and check exactly one cell of it. The
other 31 values could each be silently emptied and nothing would fail.

That matters concretely rather than theoretically: this palette was already changed once, in
v0.38.0. A table nothing checks is exactly where the next change breaks quietly. It is also the
cheapest thing to fix in the codebase — a single assertion against the whole table would cover all
31.

### What this is not
**This is a baseline, not a gate.** It does not run on every build, it has no pass mark, and it
cannot fail a release. There is no score target: a low score on a given file is a prompt to look,
not an instruction to change anything. The point of recording it now is to have a fixed reference
for later, not to start work.

## Version 0.51.0 (2026-08-16)

**Nothing changes in how the app works.** This release adds a code-quality measurement to the
build, and a command for inspecting it. No functional, data or interface changes.

A new check measures **cognitive complexity** — roughly, how much of a function you have to hold
in your head at once to follow it. It is not a line count: a long flat sequence of steps scores
low, while a short function with nested conditions inside a loop scores high. Anything above 15 is
reported. Across the project, **22 functions** are.

### Why this is being added now, and why it covers everything

Parts of this app have not yet been used in earnest. They will be over the coming months, and that
is expected to bring a steady stream of tweaks, fixes and enhancements — to which parts, nobody can
currently say. The check exists to give confidence in *those* changes.

An earlier plan limited the check to `src/lib/`, the well-tested core, on the reasoning that
findings in untested code are not safe to act on. That was rejected. It assumed the untested parts
of the app were static, so a check there would guard code nobody was going to change. The opposite
is true — **untested code that is about to be edited is exactly where this earns its keep, because
nothing else is watching it.**

For context rather than justification: `src/lib/` sits at 68.78% branch coverage against 16.51%
everywhere else, and 72 of the 97 files outside it are never executed by any test. That describes
the state being guarded. It is not the reason for guarding it.

### ⚠️ A finding is not an instruction to refactor
**Zero is explicitly not the target**, and this matters most where the code is untested. **9 of the
22 findings — 41% — are in files where no test executes a single statement.** Rewriting one of
those to get under the threshold, with nothing in place to catch a behaviour change, is the wrong
trade in the direction that ships bugs.

For those, the correct response is to **add tests first**. The check's job is to stop complexity
getting *worse* during the work ahead, not to demand that it get better. Declining to change an
individual function, with the reasoning recorded at the site, is a legitimate outcome. The nine
files are named in `eslint.config.ts`.

### Added
- **`eslint-plugin-sonarjs` 4.0.3**, with a single rule enabled: `sonarjs/cognitive-complexity` at
  a threshold of 15. The plugin's wider recommended set is deliberately not adopted. This matches
  the version already used by the other projects in the suite.
- **`npm run cc`** — reports every function's complexity, not only those over the threshold, and
  can measure what a block of code *would* cost if it were pulled out into its own function. Useful
  before moving any code, rather than after.

### Changed
- **`npm run lint` now exits non-zero, by design.** The release gate reads the *number* of findings
  and holds it steady at 22; it does not read the exit code. The check fails in both directions —
  a new finding must be fixed rather than accepted, and a resolved one must be accounted for by
  lowering the recorded number, so an improvement cannot be quietly absorbed.

### On the dependency gap v0.50.9 left open
The previous release pinned every directly-declared dependency but noted it could do nothing about
packages that arrive underneath them, which still re-resolve on every install. Installing the new
plugin was the first real install since, and so the first chance to observe that gap in practice.

Nothing moved: thirteen packages were added, none removed, and none changed version — including the
four named last time. That is not reassurance. It is npm declining to re-resolve four ranges it had
no reason to touch, which is a different thing from those ranges being safe. **A clean diff here
accumulates no evidence, and I'd resist reading two of them as a trend.** Checking after every
install remains necessary.

## Version 0.50.9 (2026-08-16)

**Nothing changes for anyone using the app, and no installed version moved.** This release edits
twelve lines in `package.json` and the twelve lines in `package-lock.json` that mirror them. Every
package in the project resolves to exactly the version it resolved to before.

Twelve dependencies were declared with a caret — `^19.2.4` rather than `19.2.4` — which permits
`npm install` to fetch any later compatible release. This project only adopts a dependency release
after it has been published for sixty days, and a caret has no way to know that. An ordinary
install could therefore pull a version nobody had reviewed, on a day nobody had chosen. All twelve
are now pinned to the exact version already in use.

### Why exact rather than a narrower range
A range wider than exact does not buy convenience under a policy like this one; it buys violations
that then have to be caught. Under `~19.2.4`, a `19.2.5` published this morning is installed this
afternoon — sixty days early — so every install needs its lockfile inspected and the change backed
out. Backing a change out is not a durable fix, so the same version arrives again on the next
install.

**The two options also fail in opposite directions, which is what settles it.** A missed revert
under a caret or tilde **fails open**: an unreviewed version ships. A missed edit under an exact
pin **fails closed**: the project stays on the version it was already running, which is safe and
shows up in the next dependency review. These are not equivalent risks.

This is also not a new convention here — the project was already fifteen exact to twelve caret
before this change, and the dependencies that move most often (ESLint, Vitest, TypeScript,
Tailwind, jsdom, Firebase) were among those already pinned. This makes an existing practice
consistent rather than introducing one.

### Changed
- **Pinned to their installed versions:** `exceljs` 4.4.0, `react` 19.2.4, `react-dom` 19.2.4,
  `recharts` 3.8.0, `@testing-library/dom` 10.4.1, `@testing-library/jest-dom` 6.9.1,
  `@testing-library/react` 16.3.2, `@testing-library/user-event` 14.6.1, `@types/react` 19.2.14,
  `@types/react-dom` 19.2.3, `@vitejs/plugin-react` 5.1.4, `eslint-plugin-react-refresh` 0.5.2.

### What this does not do
Three qualifications, because the change is narrower than "dependency versions are now controlled".

- **It closes the direct hole completely and the indirect one not at all.** Packages that arrive
  underneath another dependency — `postcss`, `nanoid`, `rollup` and `picomatch` among them — have
  no line in `package.json` to pin, and still re-resolve on every install. All four moved during
  the previous release. **Inspecting the lockfile after every install remains necessary.**
- **`npm update` no longer does anything for these twelve.** That is the intended behaviour, not a
  fault: an exact version has nothing to update to. Updating one is now a deliberate edit on a
  chosen date. Indirect dependencies are unaffected and `npm update <package>` still works for them.
- **The real cost is that staleness stops announcing itself.** Under carets, a project drifts
  forward on its own and you notice. Under exact pins nothing moves and nothing complains, so a
  project can sit on old-but-safe dependencies indefinitely without anyone noticing. Keeping the
  dependency review on a regular cadence is what replaces the drift, and it is now the only thing
  that will surface an ageing dependency.

This is a decision for this project, not a general recommendation.

## Version 0.50.8 (2026-08-16)

**A dependency security release. Nothing changes in how the app works** — no functional, data or
interface changes, and the app behaves identically to v0.50.7.

Nineteen of the twenty-two published security advisories affecting this project's dependency tree
are now closed. Seven packages moved. Three of them reach users as part of the shipped app:
`react-router-dom`, which the app depends on directly, and `protobufjs` and `brace-expansion`,
which arrive underneath Firebase and ExcelJS. The remaining four — `vite`, `postcss`, `nanoid` and
`undici` — are build and test tooling and never reach a browser.

### Security
- **`react-router-dom` 7.16.0 → 7.18.0**, closing four advisories: an unauthenticated denial of
  service via inefficient path matching (high); an open redirect via backslashes in `<Link>` and
  `useNavigate` (moderate); a missing protocol validation in error handling (moderate); and an
  arbitrary constructor injection during route error deserialisation (moderate).
- **`brace-expansion` → 1.1.18, 2.1.4 and 5.0.9** across all three major lines present in the tree,
  closing three denial-of-service advisories (all high). It is reached through ExcelJS in the
  shipped app and through ESLint in the toolchain.
- **`undici` 7.28.0 → 7.29.0**, closing five advisories: cross-user information disclosure (high),
  and response desynchronisation, cookie attribute injection, CRLF injection and whitespace-based
  disclosure (all moderate). Test tooling only.
- **`postcss` 8.5.15 → 8.5.26**, closing a path traversal in source-map auto-loading (high) and an
  incomplete fix for an earlier issue (moderate). Build tooling only.
- **`nanoid` 3.3.15 → 3.3.18**, closing two advisories in which non-secure and custom generators
  could loop indefinitely (both high). Build tooling only.
- **`vite` 7.3.2 → 7.3.5**, closing a `server.fs.deny` bypass on Windows alternate paths (high) and
  an NTLMv2 hash disclosure via UNC path handling (moderate). Both affect the development server.
- **`protobufjs` 7.6.4 → 7.6.5**, closing a denial of service via an infinite loop when parsing
  `.proto` option values (moderate). Reached through Firebase.

`react-router-dom` and `vite` are now pinned to exact versions rather than caret ranges.

### Known remaining
Three advisories stay open, and a security scan of this project will still report them.

The one worth explaining is **GHSA-qwww-vcr4-c8h2** (high), a CSRF bypass in React Router's RSC
mode. Its fix ships in 7.18.2, which is still inside this project's sixty-day window for adopting
a new dependency release. **It is not reachable here:** React Server Components are not compiled
into this app. The router is mounted as a plain `<BrowserRouter>`, the build produces no server
bundle, and none of the entry points the advisory describes exist anywhere in the source. It will
be closed when 7.18.2 clears the window.

The other two are unchanged from previous releases: a low-severity development-server file read in
`esbuild`, whose fix is not yet compatible with the Vite release adopted here, and a moderate
bounds-check issue in `uuid` reached through ExcelJS, for which no compatible fix is published.

## Version 0.50.7 (2026-08-16)

**Nothing changes for anyone using the app.** Tooling only — no functional, data, or interface
changes. The app behaves identically to v0.50.6.

The tool that measures how much of this project the test suite actually exercises,
`@vitest/coverage-v8`, was never declared as a dependency. It appeared in `package-lock.json` only
as an *optional peer* of `vitest` — a note about what `vitest` can work with, not an instruction to
install anything. So `npm ci` did not install it, and a fresh checkout of this repository could not
measure coverage at all.

Undeclared dependencies do not stay put, either. Installing it by hand worked until the next
`npm install`, which pruned it away again as a package nothing had asked for. Any coverage figure
produced in between rested on a package that a clean checkout did not have.

### Fixed
- **`@vitest/coverage-v8` is now a declared devDependency, pinned to the exact version `4.1.5`.**
  A clean `npm ci` produces a working coverage instrument, and it survives subsequent installs.
  The pin is exact rather than a caret range because `vitest` names its coverage peer as an exact
  version, so the two have to move together or not at all.

## Version 0.50.6 (2026-08-02)

**The licence gains two conditions, and one that asked too much was rewritten.** Licensing only —
no functional, data, or interface changes. The app behaves identically to v0.50.5.

`LICENSE` remains a byte-for-byte copy of the canonical file in the SPERT® Suite landing-page
repository, differing only in the project repository URL on line 4. It goes from 726 lines to 756.
What the licence permits is unchanged: anyone may still use, study, modify and share this software
freely. What changed is the set of conditions attached to it, which now number six rather than
four, and each now follows the wording of the GPL v3 Section 7 subsection that authorises it.

That wording matters more than it sounds. Section 7 lists the kinds of additional term a project
may attach, and its closing paragraph lets whoever receives the software **delete** any condition
that strays outside that list. A condition worded too ambitiously does not merely fail — it
evaporates, silently, in the hands of the one reader it was written for.

### Added
- **The author's name may not be used to endorse or promote a product built from this software**
  without permission (Section 7(d)). Nothing else in the licence covered this. The project's
  trademarks are protected whether the licence mentions them or not, but a personal name has no
  such protection — and another condition requires that name to stay in the source code, so anyone
  forking the project already has it in hand.
- **Anyone who resells this software with a warranty or support contract of their own covers any
  liability those promises impose on the original author** (Section 7(f)). The standard licence
  already permits a reseller to make such promises; this makes clear they are theirs to stand
  behind.

### Changed
- **The condition covering on-screen credit was rewritten.** It used to require any modified
  version with a user interface to *display* a notice. Section 7(b) authorises requiring that
  existing notices be *preserved*, not that new ones be created, and Section 5(d) says outright
  that a modified work need not add such notices where the original had none. It now requires that
  where a modified version already displays Appropriate Legal Notices, the original author's name
  is preserved among them — and the repository link is conditional on the original displaying one,
  so the same defect is not reintroduced by the back door.
- **A modified version may no longer misrepresent where this software came from**, claiming
  Section 7(c)'s previously unused first half.
- **The trademark condition gains a narrow carve-out**: naming this project in order to describe
  honestly what a fork was derived from is not itself prohibited, provided it does not suggest this
  project endorses the result. This resolves the tension where the trademark condition granted no
  rights to the marks while the marking condition required a fork to distinguish itself from them.
- **The registration recital is now date-stamped**, since asserting live USPTO registration as bare
  present fact acquires a shelf life, and the preamble now says "terms" rather than "restrictions"
  — the noun Section 7 reserves for the deletable category.

## Version 0.50.5 (2026-07-31)

**Six files were asserting plain GPL, and a test now makes that impossible.** Comments and tooling
only — no functional, data, or interface changes. The app behaves identically to v0.50.4.

The copyright header carried by every source file in this project is three lines, and the third one
is load-bearing. It points at `LICENSE`. That file adds four additional terms under GPL v3
Section 7 — attribution preservation, UI notice preservation, trademark reservation, and marking of
modified versions — and Section 7 requires that a source file carrying such terms either state them
or say where they are found. The third line is that notice.

Six files added on 2026-05-06 stopped after the second line. A header that ends at "Licensed under
the GNU General Public License v3.0." asserts plain GPL and leaves a recipient no route to those
clauses. The six were `InvitationBanner.tsx`, `useInvitationLanding.ts`, `useSignInWithTosGate.ts`,
`auth-name.ts`, `firestoreUtils.ts` and `invitationErrors.ts`. Each now carries the pointer.

The reason it went unnoticed for three months is that nothing checked. `license-conformance.test.ts`
verifies the `LICENSE` file itself and never opens a source file, and no other check in the suite
looked at per-file headers at all. The standing instructions in this project's own notes were the
only enforcement, and a written instruction is not enforcement.

`src/__tests__/copyright-headers.test.ts` replaces it. It walks every file in scope, strips comment
framing so one comparison covers `//`, `/* */` and `<!-- -->`, and requires all three lines. It also
requires the comment to actually close — `index.html` is parsed by neither TypeScript nor Vite, so
an unclosed `<!--` would otherwise swallow the entire document silently. It reads untracked files as
well as committed ones, so a missing header fails before the commit rather than after it, and it
asserts both a file-count floor and the exact set of directory categories it expects to find, so it
cannot quietly start checking nothing.

Every failure path was exercised by mutation before the guard was accepted: a removed header, a
two-line header, a deleted scope category, a stale exemption and an unclosed HTML comment each fail
it, and each names the file and the reason.

### Fixed
- **Six source files carried a two-line copyright header** missing the `LICENSE` pointer that GPL v3
  Section 7 requires. All six now carry the full three-line form.

### Added
- **`src/__tests__/copyright-headers.test.ts`** — asserts the suite-standard header on every source
  file, with the correct comment framing for its type, including untracked files.
- **`vite.config.*.timestamp-*` gitignored.** Vite leaves these at the project root if it is killed
  while bundling a TypeScript config; the new guard would have scoped one as a root config file and
  failed for a reason the message could not explain.

## Version 0.50.4 (2026-07-31)

**The release checks now cover the copy of this changelog that readers actually see.** Tooling
only — no functional, data, or interface changes. The app behaves identically to v0.50.3.

The ship gate could only ever be told about one changelog file, and in this project it was told
about the wrong one. `src/pages/ChangelogView.tsx` fetches `/CHANGELOG.md` when a reader opens
the version history, which resolves to the served copy under `public/`. That copy is the surface
users read; the file the gate was watching is the one nothing renders.

Had the two drifted apart, readers would have been shown the stale copy while every check
reported success. `shipgate.config.json` now declares the served copy as a
`changelog.extraSurfaces` entry in `identical` mode, so the gate fails if they differ by a single
byte.

Each failure path was verified by mutation before the change was accepted — a drifted copy, a
removed entry and a deleted file each fail the gate. SPERT® Scheduler's served copy had already
gone five months stale from exactly this cause.

### Changed
- **The ship gate now checks `public/CHANGELOG.md`.** `changelog.extraSurfaces` added to
  `shipgate.config.json`; `scripts/shipgate.mjs` gains support for it and stays byte-identical
  across all nine suite repositories.

## Version 0.50.3 (2026-07-31)

**The release checks now read this project's own Node version.** Tooling only — no functional,
data, or interface changes. The app behaves identically to v0.50.2.

The ship gate was told to run on "Node 24", written directly into the workflow file. That is not
the same as the version this repository pins: it resolves to whichever 24.x release the runner
happens to have on hand, and the `.nvmrc` kept alongside the source was never read. The workflow
now reads that file, so the version is stated in exactly one place rather than two that were free
to drift apart.

The version actually selected here is unchanged, because this `.nvmrc` names the `24` line rather
than an exact release; that line-level pin is deliberate, so each build takes the newest secure
patch in the line. What changes is that `spert-admin-tool`, which caps at `24.15.x - 24.17.x` on
purpose to avoid a Node ≥24.18 regression that breaks server-rendered pages, will have that cap
honoured when it gains the same gate instead of silently overridden.

### Changed
- **CI resolves Node from `.nvmrc` rather than a hardcoded major.** `shipgate.yml` stays
  byte-identical across all nine suite repositories — `setup-node` resolves the path per
  repository, so no per-repo divergence was needed.

## Version 0.50.2 (2026-07-30)

**The type checker now runs as part of every build, so this can never happen again.** No functional,
data, or interface changes.

This is the last step of the work described in the previous four entries. The whole problem was that
the build never checked types — it stripped them out and carried on — so mistakes could accumulate
unnoticed for four months and reach 2,183 before anyone counted. Every one of those has now been
fixed, which finally makes it safe to do the obvious thing: have the build refuse to produce output
if the types are wrong.

From this release, a type error stops the deployment. Previously it would have shipped.

The temporary safety net built while the backlog was being cleared — a recorded count that was
allowed to fall but never rise — has been removed along with it. It existed only to stop the number
growing while it was still large. A recorded number and the compiler can drift apart; the compiler
is the one that matters, and it is now the thing being asked.

Nothing about the app changes. All 944 tests pass.

## Version 0.50.1 (2026-07-30)

**Zero.** Every type error in the project is gone — application code and tests alike. No functional,
data, or interface changes; the app behaves identically to v0.50.0.

Two days ago this project had 2,183 of them. They had accumulated because the type checker was never
once run against the code in the four months after the project was converted to TypeScript — the
build strips type information without checking it, so nothing ever complained. The first run, in
v0.49.5, found all 2,183 at once.

This release clears the last 283, all of which were in the test suite. Most were not errors in any
meaningful sense: they were test fixtures that described a project, a rib item or a drag operation
only partially, because nothing had ever required them to be complete. Completing them means the
tests now exercise the same shapes the real app produces.

A handful were more than that. Several helper functions asked for a whole project when they only
ever read one field of it; those now ask for what they use, which let the tests that deliberately
pass a minimal object keep doing so instead of being padded out with irrelevant data. One test was
found to be checking a legacy data shape on purpose, and has been marked as such so nobody
"corrects" it later. One intermittently failing test — it had a genuine timing flaw, and had been
failing roughly one run in twenty — was fixed along the way.

The practical effect is that the type checker can now be wired into the build itself, which is the
next and final step of this work. Once that lands, this class of problem cannot silently accumulate
again.

All 944 tests pass. `tsc` reports nothing at all.

## Version 0.50.0 (2026-07-30)

**A milestone release: every type error in the application code is now gone.** No functional, data,
or interface changes — the app behaves identically to v0.49.24.

Some background, because the number is the story. In March 2026 this project was converted to
TypeScript, but nothing ever ran the type checker against it — the build strips types without
checking them. When the checker was finally run for the first time in v0.49.5, it reported 2,183
problems, 461 of them in the application code itself. Those were not crashes; the app worked. They
were four months of type annotations that had never once been verified.

This release takes the application-code count from 57 to **zero**. Twenty-two files improved; all of
them are now clean. What remains — 283 — is entirely in the test suite, and is the last phase before
the type checker can be wired into the build permanently so this can never accumulate again.

Most of the work was reconciling places where two parts of the app described the same thing
differently and had quietly drifted apart. The progress table, the story map cards, the release
board columns and the structure rows each had a second, hand-written description of data that is
produced elsewhere; each now refers to the real one, so they cannot drift again. Several values that
are legitimately absent — a sprint with no end date yet, a release column with no release, a project
still loading — are now described that way rather than being asserted to always exist.

Two genuine defects surfaced along the way. Both were reported and fixed on their own, separately
from this cleanup, and have already shipped: an import failure for projects containing an assessment
note without a percentage (v0.49.23), and a Delete button on release columns that did nothing
(v0.49.24). A third was investigated and turned out to be a false alarm.

Three small pieces of dead code were removed: two settings passed to components that never declared
them, and one unused parameter.

All 944 tests pass. Every file was measured individually before and after; none regressed.

## Version 0.49.24 (2026-07-30)

**Fixes the Delete button on release columns, which did nothing.**

On the Release Planning board, each release column has a Delete button that is enabled once the
column is empty. Clicking it was supposed to raise a confirmation dialog. Instead nothing happened
at all — no dialog, no error, no deletion — and there was no way to remove a release from that
screen. Clicking it repeatedly had no effect either.

The cause was a missing setting on the confirmation dialog that told it whether to be visible. It
was never passed, so the dialog always evaluated to "hidden" and rendered nothing, even though the
button had correctly asked for it.

Clicking Delete now opens the confirmation as intended, with working Delete and Cancel buttons, and
the dialog can also be dismissed with Escape or by clicking outside it. Deleting a release from the
project Settings screen was unaffected and continues to work as before.

Three tests now cover this path — that the dialog appears, that confirming deletes the release, and
that cancelling does not — each verified to fail against the previous code. All 944 tests pass.

## Version 0.49.23 (2026-07-30)

**Fixes a bug that could stop a project file from being imported.**

If anyone on a project wrote an assessment note against a rib item without also entering a
percentage, that project could not be re-imported. The import failed outright and took the whole
file with it — not just the affected note — with the message "Progress percentComplete must be a
number".

Writing a note without a percentage is a normal, supported thing to do. Clearing the percentage on
an item that has a note deliberately keeps the note and leaves the percentage empty, and adding a
note to an item that has no percentage yet creates exactly the same shape. The import check
disagreed with the rest of the app and rejected it.

Anyone affected does not need to do anything. The same file that failed before will now import
correctly, with notes and percentages intact — no re-export needed, and nothing was lost from the
original file, which was never modified.

Two related corrections came with it. An entry that carries no percentage at all is now recorded
consistently as "empty" when a file is imported, rather than being left in an in-between state. And
the historical "progress as of this sprint" calculation used to return a non-number for such an
entry, which turned any total containing it into a blank figure; it now reads as zero, matching the
equivalent current-progress calculation it had drifted apart from.

Seven tests were added covering the note-without-a-percentage case, including a full export-and-
re-import round trip, and each was confirmed to fail against the previous code. All 941 tests pass.
The type-error baseline goes from 342 to 339.

## Version 0.49.22 (2026-07-30)

Test-suite integrity fix — no functional, data, or interface changes. The app behaves identically to
v0.49.21.

An audit of the type cleanup shipped in v0.49.16 found three tests that could pass without actually
checking anything.

The cause is a subtlety in how those tests were rewritten. Where a value might be absent, they use a
"read it only if it is there" form. That is safe when the check that follows would fail on a missing
value — but three of the checks would have *passed* on a missing value, so the safeguard quietly
turned them into tests that could never fail.

The most serious covered project duplication. When a project is copied, every internal reference —
releases, sprints, allocations, progress history — has to be renumbered to point at the copy. That
test was the only thing guarding it, and it would have passed even if copying had dropped all of
them entirely. It now requires each value to be present before comparing, and reports by name which
one is missing. Confirmed by deliberately breaking the copy step and checking that the test catches
it, which it now does and previously did not.

The other two — one covering the AI change-history summary, one covering how cards stack on the
sizing board — had the same flaw and were corrected the same way.

No behaviour changed and no test was added or removed; three existing tests went from unable to fail
to able to fail. All 934 tests pass. The type-error baseline is unchanged at 342.

## Version 0.49.21 (2026-07-30)

Type cleanup in the application code — no functional, data, or interface changes. The app behaves
identically to v0.49.20.

Application-code errors go from 82 to 57, and the repository baseline from 367 to 342. Fourteen files
improved; ten of them are now clean.

Three shared causes accounted for most of it.

The tooltip helper described the element it attaches to as "any HTML element", which React will not
accept when the thing it is actually attached to is a button or a div — so every component using a
tooltip reported a mismatch. The helper now takes the element type from whoever uses it.

The palette of theme colours was being indexed directly in three places to get a fallback colour.
There is now a named default, which is both clearer at the call sites and correct.

The account-migration code passed its database handle to the cloud service without checking it
exists, in four places — the same thing corrected in the storage layer in v0.49.18. It now uses the
same guard, so both places behave identically.

The rest were individual: the forecaster export and the sizing board each walked a list by position
and read fields off entries the compiler could not confirm were there; the same for the keyboard
navigation in the ⋮ menus, the "add release here" positions on the map, and the size picker. Two
declarations that nothing used were removed.

All 934 tests pass, unchanged. No file in the repository regressed.

Verified with the full ship gate.

## Version 0.49.20 (2026-07-30)

Type cleanup in the application code — no functional, data, or interface changes. The app behaves
identically to v0.49.19.

Application-code errors go from 121 to 82, and the repository baseline from 406 to 367. Seven files
improved; five of them are now clean.

Almost all of this release is one recurring shape. Throughout the codebase there are places that
check a value exists and then use it a few lines later inside a callback — inside a list transform,
or inside the function that produces the next version of a project. The check does not reach that
far. In every one of those places the code was relying on a guard that did not actually cover the
use.

The most consequential instance was in the map's move-a-rib-between-columns logic. It confirmed it
had found the rib, then, inside a transform, copied it into its new home. Because the check did not
reach inside, the copy was of something the compiler still considered possibly missing — and the
result was a rib with every field optional. That was the true source of three separate errors in the
callers, which had looked unrelated. All such places now capture the checked value first.

The same treatment was applied to: writing, clearing, and commenting on progress entries, which each
read an existing entry out of a list before rewriting it; undo and redo, which take the top item off
a stack; the sample project builder, which cross-references releases and sprints by position; and
reordering releases by dragging.

One case was more than tidying. The function that applies every change to a project accepted a
transform to run against the current project, without establishing that a project had actually
loaded yet. It cannot happen — nothing that calls it renders before loading finishes — but had it
happened, the transform would have been handed nothing and failed on its first line. That path is
now explicit and does nothing instead.

All 934 tests pass, unchanged. No file in the repository regressed.

Verified with the full ship gate.

## Version 0.49.19 (2026-07-30)

Type cleanup in the Progress Tracking screen, plus new test coverage for it — no functional, data, or
interface changes. The app behaves identically to v0.49.18.

Application-code errors go from 137 to 121, and the repository baseline from 422 to 406.

The Progress screen describes each table row three separate times — once where the rows are built,
once in the row component, and once in the comment panel — and the three descriptions disagreed about
what can be empty. Rows grouped by backbone or theme have no single release to edit against, so the
screen marks them read-only and leaves their release empty; the row component, meanwhile, described
that release as always present. The same disagreement applied to the selected sprint, which is
genuinely absent until a project has sprints.

All three now say the same thing, and they say what is actually true rather than what would be
convenient. The three functions that write progress, remove progress, and save a note accept the
empty cases and decline them, instead of the screen quietly promising they cannot happen.

**This screen had no test coverage at all, which is the real reason a change here was uncomfortable.**
It now has some: four tests covering editing a percentage, clearing one, rejecting a value above the
row's allocation, and confirming a read-only row offers no editor. Those were written to fail first
against a deliberately broken version, so they are known to catch the thing they are meant to catch.

The test suite is now 934 tests across 38 files, all passing.

Verified with the full ship gate, and by exercising the screen in a running browser: the table
renders, the editor opens, and an edited percentage commits.

## Version 0.49.18 (2026-07-30)

Type cleanup in the application code — no functional, data, or interface changes. The app behaves
identically to v0.49.17.

This is the first instalment of the harder half of this work. The earlier releases were mostly about
telling the compiler what values are; this one is about places where the code and its own
descriptions disagreed. Application-code errors go from 200 to 137, and the repository baseline from
486 to 422.

**Two real inaccuracies in the data model were found and corrected.** A release's target date was
described as either text or absent, but both places that create a release set it to null explicitly.
Everything that reads it already copes, so the description was simply wrong, and is now right. And
the two functions that add a rib item were building it with a category the compiler read as "any
text at all" rather than one of the two categories the app defines, which meant the resulting item
did not actually satisfy its own type. Neither was a live fault; both were places where the type
system had been prevented from checking anything.

**A shared list-reordering helper was fixed rather than worked around.** It was written to accept
"any object with string keys", which none of the project's own types satisfy, so every use of it
reported an error. It is now described by what it actually needs — something with an identifier and
an ordering — and an unused parameter that no caller had ever passed was removed.

**The cloud storage layer was passing its database handle to Firebase without checking it exists**,
in eleven places, while three other places in the same file already checked. Those eleven now go
through one small guard that reports the same message the file already used. The situation cannot
arise in practice, because the cloud layer is only built once the database is available.

Also: the map's drag-insertion lines and its canvas now handle the "nothing there" cases the
compiler had been pointing at, and four loops that walked a list by position were rewritten to walk
it directly, which is both safer and easier to read.

All 930 tests pass, unchanged. Nine files improved and none regressed.

Verified with the full ship gate: 930 tests, lint clean, and a per-file typecheck.

## Version 0.49.17 (2026-07-30)

Type-annotation cleanup in the test suite — no functional, data, or interface changes, and no change
to the application code. Only test files were touched.

The repository baseline moves from 525 to 486. Since this work began the total has come down from
2,183, a reduction of about 78%.

This release concentrated on the sizing board's tests, which went from 41 errors to 2. Their sample
data builder was producing projects that were missing several fields, and describing a rib's size as
any text at all rather than as one of the sizes the application actually defines. Correcting the
input description turned out to matter more than anything else: it removed the need for an override
that had been telling the compiler to accept the result regardless, and it left fewer problems behind
than the override had. Every size these tests use is a real one, so nothing about what they exercise
changed.

The remainder of that file's errors — comparisons and arithmetic between two list positions, and
lookups in a map built on the fly — now go through the same small helper introduced in the previous
release, which fails immediately and by name if something genuinely is not there.

All 930 tests pass, unchanged.

What is left is the last category, and it needs judgement rather than a sweep: sample objects written
inline inside individual tests. Some are incomplete by accident and some are incomplete on purpose —
there are tests that deliberately pass a bare object to check the code copes with missing fields, and
filling those in would quietly change what is being tested. They are being left for case-by-case
attention rather than a mechanical pass.

Verified with the full ship gate: 930 tests, lint clean, and a per-file typecheck confirming no file
in the repository regressed and the application code is untouched at 200 errors.

## Version 0.49.16 (2026-07-30)

Type-annotation cleanup in the test suite — no functional, data, or interface changes, and no change
to the application code. Only test files were touched.

**641 errors removed**, taking the repository baseline from 1,166 to 525. Since this work began the
total has come down from 2,183 — a reduction of about three quarters.

This release cleared what had been the single largest remaining category: tests that reach into a
list by position and read a field off the result, without first establishing that anything is there.
The first theme, the first backbone, the first rib. There were around 650 such places.

Two tools, chosen so that the checks are genuinely satisfied rather than switched off. Where a test
reads a value once inside an assertion, the read is now written so that a missing element produces
no value rather than an error — and the assertion around it then fails, which is the correct
outcome and a clearer one than a crash. Where a test pulls something out of a list and then makes
several assertions about it, the extraction now goes through a small shared helper that fails
immediately and says exactly what was missing, leaving every assertion below it untouched and
perfectly readable.

Both are deliberately not the shortcut. There is a one-character way to tell the compiler "trust me,
this is here", and it would have closed all 650 in an afternoon — but it removes the check rather
than satisfying it, and would have left the suite looking verified while being less safe than
before.

Two cases were handled by hand because the mechanical approach would have been wrong for them:
assertions that check something is *absent* (where a missing element would have made the assertion
pass for the wrong reason), and one line that assigns a new value rather than reading one.

All 930 tests pass, unchanged. Nothing about what any test asserts was altered.

What remains is a different and final category: sample objects written inline inside individual
tests that are missing a field or two, or that describe a mock loosely. Those are one-at-a-time
edits with no shared fix.

Verified with the full ship gate: 930 tests, lint clean, and a per-file typecheck confirming no file
in the repository regressed and the application code is untouched at 200 errors.

## Version 0.49.15 (2026-07-30)

Type-annotation cleanup in the test suite — no functional, data, or interface changes, and no change
to the application code. Only test files were touched.

The repository baseline moves from 1,226 to 1,166.

**With this release, there is no longer a single place anywhere in this project — application code or
tests — where the compiler does not know what a value is.** That was the specific problem this whole
effort set out to fix. When it started there were 2,183 type errors and roughly 630 of them were
values the compiler could say nothing at all about, which meant it was also checking nothing around
them. That category is now empty.

This release closed the last of it in the tests: the fake browser storage both the storage and
migration suites run against, a mocked document used by the export tests, three collection variables,
two more sets of sample-data helpers, and a single error variable in a catch block.

| test file | before | after |
|---|---|---|
| storage | 110 | 96 |
| progress mutations | 54 | 41 |
| migration | 24 | 5 |
| card colors | 18 | 12 |
| rib helpers | 13 | 9 |
| product mutations | 161 | 158 |
| import validation | 66 | 65 |

All 930 tests pass, unchanged.

What remains is now clearly two things, and worth stating plainly. About two thirds of the remaining
errors are tests that reach into a list by position — the first theme, the first backbone, the first
rib — without first establishing that anything is there. The rest are sample objects written inline
in individual tests that are missing a field or two. Neither is a missing label; both are per-case
work, and the first would be actively made worse by a mechanical fix, so both are left for a
deliberate pass rather than rushed here.

Verified with the full ship gate: 930 tests, lint clean, and a per-file typecheck confirming seven
test files improved, no file regressed, and the application code is untouched at 200 errors.

## Version 0.49.14 (2026-07-30)

Type-annotation cleanup applied to the test suite — no functional, data, or interface changes, and
no change to the application code at all. Only test files were touched.

This is the largest single reduction so far: **624 errors removed**, taking the repository baseline
from 1,850 to 1,226. Combined with the eight earlier instalments, the total has come down from 2,183.

The project's tests build their sample data through small helper functions — make a rib item, make a
backbone, make a theme, make a product. Those helpers had never described what they accept or
return, and because they start from empty lists, the compiler concluded those lists could never
contain anything. Every test that then put real data into one, or read a field back out, was
therefore unchecked. That single pattern accounted for roughly half the errors in the entire
repository.

Describing four sets of those helpers resolved 624 errors:

| test file | before | after |
|---|---|---|
| map mutations | 435 | 187 |
| calculations | 279 | 48 |
| forecaster export | 185 | 90 |
| product mutations | 211 | 161 |

All 930 tests pass, unchanged. Nothing about what the tests assert was altered — the helpers now
also fill in the few product fields they had been omitting, which the tests never looked at.

One file's count improved less than the others, and deliberately so. Describing its helpers cleared
34 errors but revealed 37 places where a test reaches into a list by position without first checking
there is anything there. Those gaps were always present; they were simply invisible while the helper
returned an unchecked value. They are left visible rather than papered over, and are the main
remaining category across the suite.

Verified with the full ship gate: 930 tests, lint clean, and a per-file typecheck confirming four
test files improved, no file regressed, and the application code is untouched at 200 errors.

## Version 0.49.13 (2026-07-30)

Type-annotation cleanup, eighth instalment — and the completion of this pass. No functional, data,
or interface changes. The app behaves identically to v0.49.12.

Sixteen remaining files are annotated, taking the repository baseline from 1,881 to 1,850.

**This completes the annotation work begun in v0.49.6.** Across eight releases the repository has
gone from 2,183 type errors to 1,850, and the specific problem this pass set out to fix — code where
the compiler had no idea what a value was, and so was checking nothing around it — is now entirely
gone from the application source. Every function parameter, every piece of component state, and
every lookup table in the shipped code now has a declared type. At the start of this work 461 of the
errors were in application code; 200 remain, and all of them are a different and more considered kind
of problem.

This release covers the last of the small cases: keyboard and pointer handlers across the map, the
sizing board, the detail panels and the inline editor; the release drag-and-drop; the import
validator; the Firestore project loader; and two small presentational components on the About page
that had no described properties at all. Two internal hooks that receive the map and sizing layouts
now use the definitions written in v0.49.9 and v0.49.10 rather than accepting anything.

One pattern was fixed in four places. Several keyboard handlers check what kind of element a keypress
came from, so they do not steal typing from text fields. That element was read without first
establishing that it was there or that it was the kind of thing with a tag name. All four now handle
its absence, with no change to behaviour in any reachable case.

What remains is genuinely different work: places where the code allows something to be absent and the
thing receiving it does not, and places where the same object is described in two files in two
slightly different ways. Those are decisions about interfaces rather than missing labels, and they
are scheduled separately.

Verified with the full ship gate: 930 tests, lint clean, and a per-file typecheck confirming sixteen
files improved and no file in the repository regressed.

## Version 0.49.12 (2026-07-30)

Type-annotation cleanup, seventh instalment — no functional, data, or interface changes. The app
behaves identically to v0.49.11.

Five more files are annotated, taking the repository baseline from 1,904 to 1,881: the Insights page,
the allocation dialog, the story map canvas, the story map page, and the size mapping settings.

Twenty-nine never-annotated parameters and component properties across those files are annotated.
The story map's click handler now knows it receives a positioned card, using the definitions written
in v0.49.9 — the first place those layout types have been reused outside the layout system itself.

One small piece of unchecked work was made explicit: the map canvas reads the tag name off whatever
element a keypress came from, to avoid stealing keystrokes from text fields. That element was
previously assumed rather than checked, and is now handled as something that might be absent.

Verified with the full ship gate: 930 tests, lint clean, and a per-file typecheck confirming five
files improved and no file in the repository regressed.

## Version 0.49.11 (2026-07-30)

Type-annotation cleanup, sixth instalment — no functional, data, or interface changes. The app
behaves identically to v0.49.10.

The Settings and Release Planning pages are annotated, taking the repository baseline from 1,931 to
1,904. Settings goes from 18 errors to 3 and Release Planning from 15 to 3.

Fourteen never-annotated parameters across the two pages are annotated, and the states behind the
release drag-and-drop, the delete confirmation, and the allocation dialog now have declared shapes.

Two small pieces of genuine fragility were found and closed, neither of which changes behaviour.
Reordering releases by dragging removes the dragged release from the list and re-inserts it, without
first confirming the removal produced anything; that check is now made. And the Settings delete
confirmation read its target inside a handler that can, in principle, run when there is no target;
that read is now guarded.

One component interface was corrected to describe what it is actually given. The release column
accepts a drag-over handler that the Release Planning page deliberately omits while a whole column is
being dragged, because a different handler takes over in that case. The component's description said
the handler was always provided. It now says it is optional, which is what the calling code has
always done, and the two places that use it are guarded accordingly.

Verified with the full ship gate: 930 tests, lint clean, and a per-file typecheck confirming two
files improved and no file in the repository regressed.

## Version 0.49.10 (2026-07-30)

Type-annotation cleanup, fifth instalment — no functional, data, or interface changes. The app
behaves identically to v0.49.9.

The sizing board's layout engine now gets the same treatment the story map's received in v0.49.9,
finishing that pair. The repository baseline moves from 1,945 to 1,931.

The sizing engine's output — the size columns, the unsized grid, and every positioned card — is now
described rather than merely produced, and the sizing board component reads that description instead
of carrying its own.

That last part turned out to matter more than expected. The board was already declaring what it
thought the layout looked like, privately, and those private copies had fallen behind the engine:
three fields the engine produces were missing from them entirely. Those absences were the direct
cause of several of the board's own errors — it was reading fields its own description said did not
exist. There is now one definition, owned by the engine, and the drift is structurally impossible.

The sizing engine went from 13 errors to 0 and the board from 10 to 4.

One test file moved the other way, from 50 to 55, and the increase is reported honestly rather than
hidden. Describing the engine's output means the tests that read it are now checked too, and 25 of
their assertions index into a list without first establishing that the element is there. Those are
genuine gaps in the assertions, not noise, but the fix is a per-assertion judgement across the file
and doing it mechanically would amount to switching the check off rather than satisfying it. They
are left for the pass that handles that category properly. Twenty errors in the same file were
resolved, so the file's own total rose by five while the repository total fell by fourteen.

Verified with the full ship gate: 930 tests, lint clean, and a per-file typecheck confirming no
production file in the repository regressed.

## Version 0.49.9 (2026-07-30)

Type-annotation cleanup, fourth instalment — no functional, data, or interface changes. The app
behaves identically to v0.49.8.

The story map's layout engine — the code that decides where every card, column, swim lane and header
goes — is now fully described to the compiler. This is the largest single improvement so far:
**119 errors removed**, bringing the repository baseline from 2,064 to 1,945. Since this work began
the baseline has come down from 2,183.

The layout engine returns one large object describing the whole map. That object had never been
described, only produced, so every consumer of it was working blind: the components that draw the
columns, the theme bands, the release lanes, the cards and the drag insertion lines all received it
as an unchecked value, and nothing verified that what they read was what the engine actually
produces. There are now proper definitions for each part — columns, theme spans, release lanes, the
unassigned lane, the positioned cards and the hover "+ Rib" zones — and the two components that
consume the layout are declared as receiving that shape.

This had a large knock-on effect. The layout engine's own test suite was also unchecked, because it
built its test projects from untyped helpers; with the engine's output described, those tests are
checked for the first time and dropped from 143 errors to 72. The drag-insertion component and the
map content component together lost 15 more.

Two errors in the map content component are newly reported and deliberately kept. Describing the
layout revealed that two of the components it feeds — the card and the release divider — carry their
own separate, and slightly different, descriptions of the same objects. That disagreement was
invisible while the layout was unchecked. It is real, it is worth fixing, and it is a decision about
those components' interfaces rather than something to paper over here, so it is recorded and
scheduled with the rest of that work. The file's total still fell, from 13 to 6.

This reverses an earlier project decision to leave the layout objects undescribed as
over-engineering. The equivalent work for the sizing board's layout has not been done yet.

Verified with the full ship gate: 930 tests, lint clean, and a per-file typecheck confirming six
files improved and no file in the repository regressed.

## Version 0.49.8 (2026-07-30)

Type-annotation cleanup, third instalment — no functional, data, or interface changes. The app
behaves identically to v0.49.7.

The Structure page goes from **48 errors to 4**, bringing the repository baseline from 2,108 to
2,064. Across the three instalments so far the baseline has come down from 2,183 to 2,064, and the
three largest concentrations of type debt in the codebase are now dealt with.

Twenty-two never-annotated function parameters on this page are annotated, and the two states that
drive its dialogs and drag-and-drop now have declared shapes. The delete confirmation previously
carried an untyped object, so the code that reads it back to decide whether it is deleting a theme,
a backbone item, or a rib item was unchecked; it is now described as three distinct alternatives, and
the deletion logic reads the one it has rather than a merged shape where every identifier is
optional. The collapsed-section map and the rib drag state are typed likewise.

One real class of latent fragility was found and fixed. Two rib drag-and-drop handlers checked that
a dragged item existed and then used it inside a nested callback, which is a place the check does not
reach — so the code was relying on a guard that did not actually cover the use. This is now the
explicit capture the rest of the codebase already uses for the same situation. No behaviour changed,
because in practice the values were always present; the guard now genuinely guards.

The 4 errors left all come from a single shared helper used to move an item up or down a list. It is
written to accept any plain keyed object, which the project's own theme and backbone types do not
satisfy, so every call reports a mismatch. The helper needs a narrower description of what it
actually requires. That changes a signature shared across mutation code, so it is handled on its own
rather than folded in here.

Verified with the full ship gate: 930 tests, lint clean, and a per-file typecheck confirming exactly
one file changed and every other file in the repository is unmoved.

## Version 0.49.7 (2026-07-30)

Type-annotation cleanup, second instalment — no functional, data, or interface changes. The app
behaves identically to v0.49.6.

The Progress Tracking page, the largest single concentration of type debt in the codebase, goes from
**64 errors to 22**, bringing the repository baseline from 2,150 to 2,108. Every remaining error in
that file is a different kind of problem, described below.

Most of the page's progress table was invisible to the compiler. The grouped rows it builds — the
collapsible Release / Backbone / Theme sections — were assembled into an untyped object, so the
compiler treated each group as an unknown value and checked nothing about the rows inside it, the
sort comparisons between them, or the fields read out of them when rendering. Two sprint lookup
tables had the same problem. Those now have declared shapes, and with them the row type the table
actually passes around is written down for the first time. Fourteen function parameters that had
never been annotated — row and group keys, rib and release identifiers, percentages, comments — are
annotated too.

Nothing about the page changed. No sorting, grouping, expansion, or progress-entry behaviour was
touched; the work was describing structures that were already there.

The 22 errors left are deliberately left. They are one real design question, not annotation debt:
the page allows "no sprint selected" and "no single release to edit" as legitimate states, and
represents both as null, while the components and helpers it hands them to were declared as though
neither could happen. The same row shape is currently declared three separate ways across the page,
the table row, and the comment panel, and the three disagree about null. Reconciling that is a
decision about the component contract rather than a matter of adding types, so it is scheduled with
the rest of the strict-null work instead of being papered over here.

Verified with the full ship gate: 930 tests, lint clean, and a per-file typecheck confirming this
release changed the error count of exactly one file and left every other file in the repository
untouched.

## Version 0.49.6 (2026-07-30)

Type-annotation cleanup — no functional, data, or interface changes. The app behaves identically to
v0.49.5.

v0.49.5 recorded that this repository carries 2,183 TypeScript errors, none of which had ever been
reported because `build` is a bare `vite build` that strips types without checking them. This is the
first instalment of paying that down. It closes out `ProductList.tsx`, the project-list screen:
**33 errors to 0**, bringing the repository baseline from 2,183 to 2,150.

Nothing here changes what the app does. The work was annotating values the compiler previously knew
nothing about — six function parameters, five pieces of component state, and one ref. The project
list's `products` state, for example, was declared as `useState([])`, which TypeScript reads as an
array that can never contain anything; every read of a project's `id` or `name` off that array was
therefore unchecked. Seventeen of the file's thirty-three errors came from that single pattern, and
they resolved as a group once the state was given a type.

One genuine gap in the data model was found and closed while doing this. The Firestore driver
attaches `_owner` and `_members` to every project it loads — the Sharing UI reads them to work out
who owns a project and what role each collaborator has — but the `Product` type never declared
either field, so no use of them was ever checked. They are declared now, with a note explaining
that the compiler's suggestion to rewrite `_owner` as `owner` is wrong: the raw `owner` field is
deliberately removed when a project loads, and following that advice would quietly break ownership
checks and collaborator roles. Both fields remain stripped on import, as before.

Also in this release: `projectOrder` state now uses `undefined` rather than `null` for "no saved
order", matching the two places that produce and consume it. The saved-order helper's only test is
`if (!order || order.length === 0)`, so both values behave identically.

Verified with the full ship gate: 930 tests, lint clean, and a typecheck confirming 33 errors fixed
and no new ones introduced anywhere in the codebase.

## Version 0.49.5 (2026-07-29)

Release-process hardening — no functional, data, or interface changes. The app behaves identically
to v0.49.4.

This repository had never been type-checked. Its `build` script is a bare `vite build`, which strips
TypeScript types without checking them; there was no `typecheck` script, and no CI. So no build, no
test run, no lint pass and no deploy had ever run `tsc` against this code. The first run found
**2,183 errors across 77 files** — roughly 1,720 in `src/__tests__` and about 460 in production
source. `tsconfig.app.json` turns on `strict`, `noUnusedLocals`, `noUnusedParameters` and
`noUncheckedIndexedAccess`, an aspirational configuration the code was never actually held to
because nothing enforced it.

That backlog is not fixable in a release whose purpose is to install a gate, and wiring `tsc` into
`build` today would fail every Vercel deploy. So this release stops the bleeding instead: a
**typecheck ratchet** records the current count and fails if it grows. It is the same discipline
already used for ESLint in SPERT Scheduler — gate on the number, not the exit code. The ratchet
only turns one way: fixing errors also fails the check, with a message telling you to lower the
number, so progress gets recorded rather than quietly leaving headroom for regressions. It proved
itself immediately by catching 14 errors in the very guard files added by this release.

Also adds the SPERT® Suite ship gate — `npm run shipgate` locally, and the same script in CI on
every pull request and push to `main`. This is the first continuous integration this repository has
ever had; until now a green check meant Vercel had built a preview, not that the 923 tests had run,
because nothing ran them.

### Added
- **`npm run shipgate` — the release gate.** Verifies that `package.json`, both version fields in
  `package-lock.json`, `APP_VERSION` and the newest `CHANGELOG.md` entry all agree, then runs lint,
  the typecheck ratchet, the tests and a production build. It reports every disagreement in one run
  rather than stopping at the first.
- **Continuous integration** (`.github/workflows/shipgate.yml`), running the same `npm run shipgate`
  on every pull request and push to `main`, so the local gate and the automated one cannot drift
  apart. It installs with `npm ci`, which refuses to run at all if the lockfile and `package.json`
  disagree.
- **`npm run typecheck`** for the full report, and **`npm run typecheck:baseline`** for the ratchet.
- **A guard that `public/CHANGELOG.md` stays byte-identical to the root file.** This matters more
  here than anywhere else in the suite: the changelog page does not import data at build time, it
  performs a runtime `fetch('/CHANGELOG.md')`. The public copy is the only thing users ever see, so
  a drifted copy renders a confidently out-of-date changelog and a missing one renders
  "No changelog available." The guard also checks that every version heading matches the exact
  `## Version X.Y.Z (YYYY-MM-DD)` form the renderer needs to display it as a heading.
- **A guard that `LICENSE` matches the canonical suite licence** — one SHA-256 of the licence body,
  normalised for the repository URL on line 4, the only line that legitimately differs across the
  nine repositories.
- **A guard that every static asset linked from source exists in `public/`** — the Quick Reference
  Guide and Connect AI Guide PDFs, the favicons, and the changelog itself.

### Changed
- **`tsconfig.app.json` now includes `"types": ["node"]`.** The repo-hygiene guards read from disk,
  and without it they cannot see `node:fs`, `process` or `Buffer`. `@types/node` was already a
  devDependency; this only brings its globals into scope. Verified to change nothing else — the
  typecheck error count is identical with and without it.
- **`build` remains a bare `vite build`, deliberately.** Adding `tsc -b` to it would fail the
  deploy on every push until the 2,183 errors are paid down. The ratchet covers types in the
  meantime.

## Version 0.49.4 (2026-07-29)

Licensing only — no functional, data, or interface changes. The app behaves identically to v0.49.3.
The `LICENSE` file now reserves the SPERT® brand explicitly, and this repository's copy has been
brought back into line with the rest of the suite.

**Added: trademark reservation and modified-version marking**

- **The license now reserves the brand.** It has always required that the original author
  attribution be preserved, but it said nothing at all about the brand, which left room to read
  the GNU GPL v3's redistribute-and-modify freedom as carrying the *name* along with the code.
  That was never the intent. A new **Trademark Reservation** clause under GPL v3 §7(e) names
  "SPERT", "Statistical PERT" and "Estimation Made Easy" as trademarks registered with the USPTO,
  and "GanttApp" and "MyScrumBudget" as unregistered common-law marks, and grants no right to use
  any of them — whether alone, in combination with other words such as "SPERT Suite", or as a logo.
- **Modified versions must be renamed.** A companion clause under GPL v3 §7(c) requires any fork
  to adopt a name that cannot reasonably be confused with those marks. Between them the two
  clauses draw the line the license always meant to draw: the code is free to take, change and
  redistribute, the author attribution has to travel with it, and the brand stays behind.
- **Both clauses are non-removable.** They fall inside the categories GPL v3 Section 7 permits,
  which matters — Section 7's closing paragraph lets a recipient strip any additional term that
  falls *outside* that list, as a "further restriction". The section header and its opening
  sentence now cite Section 7 rather than Section 7(b), because the terms draw on 7(b) for
  attribution, 7(c) for renaming modified versions and 7(e) for the trademark reservation.

**Fixed: this repository's license had drifted from the suite original**

- **The heading carried a retired brand name.** Line 1 read "Statistical PERT® Software Suite" —
  the pre-v1.4 name — rather than "SPERT® Suite". This is the drift that prompted the audit, first
  spotted when following the GNU GPL v3 link out of SPERT Scheduler.
- **The additional terms were an older, weaker wording.** This repository still carried the
  original numbered `1.`/`2.` form of the attribution and UI-notice terms, predating the lettered
  `a)`/`b)` rewrite. The older wording omitted two things of substance: the prohibition on
  removing, obscuring or *replacing* the author attribution with another name, and the requirement
  that the user-interface notice appear in a visible and accessible location with a link to the
  original repository where feasible. Both are now present.
- **The GNU GPL v3 text itself was already correct** — verbatim and complete — and is unchanged by
  this release. The file is now a byte-for-byte copy of the canonical license in the SPERT® Suite
  landing-page repository, which is its single source of truth, differing only in the project
  repository URL on line 4. Of the nine suite repositories audited, only MyScrumBudget was an
  exact copy beforehand.

## Version 0.49.3 (2026-07-28)

Bug fix — the Share Project member list showed a raw internal account ID instead of a person's name or email address.

**Fixed: member list rendered a raw account ID**

- **Fixed: shared project members now show a name or email** — when someone was added to a
  project through an emailed invitation, the member list could display a long string of
  random-looking characters (for example `nT5V5xk8pcNHpHE7IjMxJtmQBPa2`) instead of their
  name. This happened whenever the person had used another SPERT® Suite app but had never
  personally signed into SPERT Story Map: the invitation system knew who they were, but
  Story Map had no profile of its own to draw a name from, and fell back to showing the
  raw identifier. The member list now falls back to the shared suite-wide profile, so the
  name or email address appears immediately — including for members who were added before
  this release. No action is needed and nothing has to be re-invited.
- **Internal:** `MemberRow` in `ProjectSharingPanel.tsx` now reads `spertsuite_profiles/{uid}`
  when `spertstorymap_profiles/{uid}` is absent. Both are written with the same payload by
  `AuthProvider` on sign-in, and `firestore.rules` already permits `get` on the suite mirror
  for any authenticated user, so no security-rules change was required. The lookup is
  strictly a fallback — the per-app profile still wins, and the suite mirror is not read at
  all when it is present. Guarded by a new four-case test file,
  `src/__tests__/memberRowProfileFallback.test.tsx`; three of the four fail without the fix.
  Full suite now 34 files / 923 tests, lint clean with zero warnings, production build passes.

## Version 0.49.2 (2026-07-26)

Internal repository maintenance only. No functional, data, or interface changes — the app behaves identically to v0.49.1. Removes this repository's local copy of `firestore.rules`, along with the `firebase.json` whose only content was a pointer to it. Firestore security rules are deployed from the Firebase Console and mirrored in the SPERT® Suite landing-page repository, which is their single source of truth; the copy kept here was never deployed from and could only drift out of date. Neither file was ever bundled into the app, so cloud behaviour is unchanged. Version surfaces resynchronised: `package-lock.json` had been stranded at 0.46.10 while `package.json` read 0.49.1 — both now read 0.49.2.

## Version 0.49.1 (2026-07-23)

Documentation — the Connect AI prompt now teaches assistants the non-destructive notes-append tools. No data-model or behavior changes.

**Connect AI: prompt guidance for appending rib notes**

- **Improved: Connect AI prompt** — the copyable AI instructions now route "add a note"
  requests through storymap_append_rib_note / storymap_bulk_append_rib_notes (which preserve
  existing notes) and reserve the overwriting update tools (storymap_update_rib /
  storymap_bulk_update_ribs) for explicit replace/rewrite/clear requests. Adds an
  APPEND-vs-REPLACE decision guide with verb cues, the read-mode framing for the append
  tools, the 2000-character-per-rib and 100-per-call caps, and honest not-idempotent re-run
  semantics — and corrects the prior guidance that claimed storymap_get_project could not
  return notes (it now does, when notesIncluded is true).
- **Internal:** Prose-only change to `copyPrompt.ts`. The full test suite (33 files, 919
  tests) and the production build pass unchanged, and linting is clean with zero warnings.

## Version 0.49.0 (2026-07-23)

Add to rib notes with AI — append text without overwriting what you already wrote, and let the AI read notes to verify its work.

**Connect AI: non-destructive rib notes (browser-side capability)**

- **New: append_rib_note operation** — adds text to a rib item's notes without touching the
  existing content. The new text is appended after a blank line; the previous notes are always
  preserved. This replaces the only prior path, which overwrote the whole field. An append that
  would push a rib past the 2,000-character notes cap is skipped for that rib (never truncated
  mid-sentence). Locked (in-progress) ribs can still have notes appended — notes carry no
  scheduling math.
- **New: bulk_append_rib_notes operation** — applies up to 100 note-appends in one call with
  per-entry validation: a skipped entry (unknown rib, or one that would exceed the cap) never
  affects the others, and the audit log records one summary entry per batch. Appending is not
  idempotent — running the same call twice adds the text twice.
- **New: rib notes in the AI project snapshot** — each rib now carries its `notes` in the
  read-only snapshot (gated behind Read Mode, like the rest of the snapshot), so an AI client can
  read existing notes before writing, verify an append landed, and gauge remaining length against
  the cap. A positive top-level `notesIncluded` flag keeps the snapshot's contents unambiguous. On
  very large maps the snapshot drops notes (rather than failing to update) to stay within storage
  limits, signalled by `notesIncluded: false`.
- **Internal:** new pure transforms `appendRibNoteInProduct` in `productTransforms.ts` and
  `selectSnapshotForWrite` in `aiSnapshot.ts` (bounded full/lean/skip snapshot selection). 33 new
  tests (33 files, 919 tests), production build and lint clean, and no new type errors against the
  strict-mode baseline.

> Note: the storymap_append_rib_note and storymap_bulk_append_rib_notes tools become available
> once the Connect AI service update is deployed. Until then, the existing (overwriting) notes
> update continues to work.

## Version 0.48.0 (2026-07-16)

User interface — the Story Map rib cards get a cleaner, roomier layout.

**Rib card redesign: full-width names + a single actions menu**

- **Changed: rib item names now use the card's full width.** Previously each card reserved a
  fixed right-hand column for the Core/Non-Core label and a cluster of hover-only icons, which
  narrowed the name on every line it wrapped to — even while those icons were invisible. The
  card is now a single vertical stack: the name owns its own full-width row (wrapping to two
  lines), with a compact footer row beneath it holding the size, points, allocation percentage,
  and Core/Non-Core label.
- **Changed: color, clone, and delete moved into a "⋮" actions menu.** The three separate
  hover-only icons are replaced by a single kebab (⋮) menu offering Color…, Clone rib item, and
  Delete… — the same pattern already used on the Sizing tab. The menu stays revealed on hover
  and on keyboard focus, and remains visible while its color picker is open. Deleting still asks
  for confirmation. Dragging, double-click-to-rename, and click-to-open-details are unchanged.
- **Internal:** `RibCell.tsx` restructured from a two-column grid to a flex stack reusing the
  shared `KebabMenu` component; the Story Map canvas's pan-exclusion selector now also ignores
  the menu portal (`[role="menu"]`). The full test suite (33 files, 886 tests) and the
  production build pass, and linting is clean with zero warnings.

## Version 0.47.1 (2026-07-03)

Documentation — the Connect AI prompt now teaches assistants the new move capability. No data-model or behavior changes.

**Connect AI: prompt guidance for moving rib items**

- **Improved: Connect AI prompt** — the copyable AI instructions now route "move a rib"
  requests through storymap_move_rib / storymap_bulk_move_ribs (one call, replacing the
  old unassign-then-allocate two-step for eligible ribs), including a new MOVING RIB ITEMS
  section covering: per-leg independence (backbone and release changes apply
  independently), locked-rib behavior (backbone changes allowed, release changes blocked),
  the split/partial pre-check via the snapshot's releaseIds and partial fields,
  cross-theme backbone targets, create-backbones-before-moving ordering, a post-move
  staleness warning for storymap_update_rib, honest re-run semantics for bulk moves, and
  client guidance for the bulk tool's payload shape.
- **Internal:** Prose-only change to `copyPrompt.ts`. The full test suite (33 files,
  885 tests) and the production build pass unchanged, and linting is clean with zero
  warnings.

## Version 0.47.0 (2026-07-03)

Move story map cards with AI — relocate rib items across backbones and releases in one call.

**Connect AI: move rib items (browser-side capability)**

- **New: move_rib operation** — moves a rib item to a different backbone and/or reassigns
  its release allocation in a single operation. The two changes apply independently: an
  invalid target for one never blocks the other, and the target backbone may belong to
  any theme. Locked (in-progress) ribs can still change backbones, but their release
  assignment is protected. A rib whose current allocation is a percentage split — or a
  single allocation under 100% — keeps that allocation untouched; unassign it first to
  replace it.
- **New: bulk_move_ribs operation** — applies up to 500 moves in one call with per-entry
  validation: an invalid entry is skipped without affecting the others, and the audit log
  records one summary entry per batch.
- **New: per-rib `partial` field in the AI project snapshot** — true when a rib has a
  single release allocation under 100%, letting an AI client determine ahead of time
  whether a move's release change will apply.
- **Internal:** New pure transform `moveRibInProduct` in `productTransforms.ts` with
  per-leg guard semantics; moved ribs append to the end of their destination backbone and
  re-sort to the end of their release column on the Release Planning board. 49 new tests
  (33 files, 885 tests), production build and lint clean, and no new type errors against
  the strict-mode baseline.

> Note: the storymap_move_rib and storymap_bulk_move_ribs tools become available once the
> Connect AI service update is deployed. Until then, the existing unassign-then-allocate
> workflow continues to work.

## Version 0.46.12 (2026-06-30)

User interface — a small visual refinement to the Story Map backbone headers.

**Backbone delete control revealed on hover**

- **Changed: the "×" delete control on each backbone header is now hidden until you hover over that backbone.** Previously every backbone displayed a faint, always-on "×", adding persistent visual clutter across the map. The control now fades in only when the pointer is over its backbone block — and still appears when focused via the keyboard, for accessibility — matching the reveal-on-hover pattern used elsewhere in the app. Delete behavior is unchanged.
- **Internal:** A presentation-only change in `BackboneHeader.tsx` — the header container gained a `group` class and the button switched from `opacity-30 hover:opacity-100` to `opacity-0 group-hover:opacity-100 focus-visible:opacity-100`. No logic was touched. The full test suite (33 files, 836 tests) and the production build pass unchanged, and linting is clean with zero warnings.

## Version 0.46.11 (2026-06-30)

User interface — a small visual refinement to the Story Map theme bar.

**Theme bar rendered as a single contiguous block**

- **Fixed: faint vertical lines inside the theme bar** — the subtle column divider guides on the Story Map previously ran the full height of the canvas, painting faint gray lines across the colored theme header and visually splitting it into per-backbone segments. The guides now begin just below the theme bar (at the backbone-header row), so each theme renders as one solid, contiguous filled rectangle spanning the backbones underneath it. The card-area guides are unchanged.
- **Internal:** A one-line layout change in `MapContent.tsx` — the column divider now starts at `THEME_HEIGHT` instead of the canvas top. The full test suite (33 files, 836 tests) and the production build pass unchanged, and linting is clean with zero warnings.

## Version 0.46.10 (2026-06-26)

Infrastructure — adoption of the Node.js 24 LTS runtime, with no functional or behavioral changes.

**Node.js runtime: 22 → 24 LTS**

- **Adopted: Node.js 24 LTS** — the declared runtime was advanced to Node.js 24 LTS: `@types/node` updated from 25.5.0 to 24.12.2 (aligning the type definitions with the Node 24 LTS line), `engines.node` from 22.x to 24.x, and `.nvmrc` from 22 to 24. The Vercel build runtime is set to Node 24 to match. No application logic or runtime dependencies were changed; the full test suite and production build were validated on Node 24.
- **Internal:** The full test suite (33 files, 836 tests) and the production build pass unchanged on Node 24, and linting is clean with zero warnings.

## Version 0.46.9 (2026-06-26)

Maintenance — routine dependency updates within the project's stability window, with no functional or behavioral changes.

**Dependency updates**

- **Updated: tailwindcss 4.2.1 → 4.2.4** — a routine patch update to the CSS engine, with @tailwindcss/vite updated to the same version (these two packages are released in lockstep). No styling or layout changes.
- **Updated: globals 17.4.0 → 17.5.0** — a routine update to the ESLint global-identifier definitions used during linting.
- **Internal:** The TypeScript React type definitions (@types/react, @types/react-dom) were reviewed and are already at their current stable versions, so no change was needed. The full test suite (33 files, 836 tests) and the production build pass unchanged, and linting is clean with zero warnings.

## Version 0.46.8 (2026-06-26)

Development tooling — test-environment and test-runner updates with no functional or behavioral changes.

**Dependency updates: test environment and test runner**

- **Updated: jsdom 26.1.0 → 29.1.0** — the browser-like DOM environment used by the test suite was updated across three major versions, which transitions its internal HTTP stack from ws to undici. This affects only the local/CI test environment and has no impact on the deployed application; no test logic was changed.
- **Updated: vitest 4.1.4 → 4.1.5** — a minor update to the test runner.
- **Internal:** The full test suite (33 files, 836 tests) and the production build pass unchanged, and linting is clean with zero warnings.

## Version 0.46.7 (2026-06-26)

Development tooling — major-version updates to the linter and TypeScript compiler, with small source adaptations for compatibility and no behavioral change.

**Dependency updates: linting and type system**

- **Updated: eslint 9.39.4 → 10.2.1** — the linter was updated to its current major version, paired with @eslint/js 10.0.1 and eslint-plugin-react-hooks 7.1.1 (which adds eslint 10 peer support).
- **Updated: typescript 5.9.3 → 6.0.3** — the TypeScript compiler was updated to its current major version, with typescript-eslint updated to 8.59.0 to lift the TypeScript 6 peer ceiling. The project's tsconfig target (ES2020) requires no compatibility workarounds, and the production build (esbuild) is unaffected by the compiler update.
- **Source adaptations (no behavioral change):** the major-version updates surfaced new linter and compiler diagnostics, resolved without altering runtime behavior — pruned one now-unused eslint-disable directive, removed two redundant variable initializers flagged by eslint 10's no-useless-assignment rule, added seven targeted eslint-disable comments for intentional setState-in-effect patterns newly detected by eslint-plugin-react-hooks 7.1.1, adjusted a tooltip timer-handle type for TypeScript 6's stricter null/undefined distinction, and added an ambient module declaration (vite-env.d.ts) so TypeScript 6 resolves the side-effect CSS import.
- **Internal:** A normalized type-check comparison confirms no new type-error sites after the update. The full test suite (33 files) and the production build pass unchanged, and linting is clean with zero warnings.

## Version 0.46.6 (2026-06-26)

Security maintenance — dependency updates with no intended behavioral changes.

**Security: full lockfile regeneration**

- **Lockfile regenerated** — a full regeneration of the dependency tree floats critical- and high-severity transitive advisories (the protobufjs and @grpc/grpc-js families) to their patched versions within the existing declared dependency ranges. This closes a critical protobufjs advisory and high-severity @grpc/grpc-js advisories with no intended behavioral changes.
- **Updated: firebase 12.10.0 → 12.12.1** — a routine currency update included alongside the regeneration. Drop-in, with no intended behavioral changes.
- **Internal:** All other direct dependencies are held at their previously installed versions via pre-pinning, so this release changes only the resolved transitive tree and firebase. The full test suite (33 files) and the production build pass unchanged, and linting is clean with zero warnings.

## Version 0.46.5 (2026-06-19)

Security maintenance — development-tooling dependency updates with no functional or behavioral changes.

**Security: build and test tooling updates**

- **Updated: vite 7.3.2** — the build tool and local development server was updated from 7.3.1 to 7.3.2 to close three security advisories that affect only the local development server: arbitrary file read via the dev-server WebSocket (GHSA-p9ff-h696-f583, High), a server.fs.deny access-control bypass via crafted query strings (GHSA-v2wj-q39q-566r, High), and a path-traversal issue in optimized-dependency .map handling (GHSA-4w7w-66w2-5vf9, Moderate). Vite is a development and build-time tool; these advisories have no impact on the deployed application or your data.
- **Updated: vitest 4.1.4** — the test runner was updated from 4.0.18 to 4.1.4 to close a critical advisory in the Vitest UI server that allowed arbitrary file read and execution while that server is listening (GHSA-5xrq-8626-4rwp, Critical). Vitest runs only in the local test environment and is never part of the deployed application.
- **Deferred:** Two remaining vite advisories (GHSA-fx2h-pf6j-xcff, High, and GHSA-v6wh-96g9-6wx3, Moderate) apply only to Windows development environments and are fixed in vite 7.3.5; that update is held until 7.3.5 clears the project's 60-day dependency-stability window and will ship in a follow-up release. No user-facing impact.
- **Internal:** Both updates are drop-in; the full test suite (836 tests) and the production build pass unchanged, and linting is clean with zero warnings.

## Version 0.46.4 (2026-06-19)

Security maintenance — dependency update with no functional or behavioral changes.

**Security: routing library update**

- **Updated: react-router-dom 7.16.0** — the application's routing library (react-router-dom and its react-router core) was updated from 7.13.1 to 7.16.0 to close a security vulnerability. This is a drop-in update with no changes to application behavior, navigation, or your data; the full test suite and production build pass unchanged.
- **Internal:** The remaining dependency security advisories were reviewed; the affected packages are transitive dependencies with low practical exposure in this client-side app, and their updates are deferred to a future release pending the project's dependency-stability policy. No user-facing impact.

## Version 0.46.3 (2026-06-18)

The changelog page now displays every entry in full.

**Fix: changelog page rendering**

- **Fixed: changelog rendering** — the version history page now renders the complete content of each entry. Previously, wrapped (multi-line) bullet text, deployment callout notes, indented sub-bullets, intro paragraphs, bold section headings, and inline code were silently omitted; all now display correctly. No changelog content was changed — only how it is rendered, plus a regression test so it stays fixed.

## Version 0.46.2 (2026-06-18)

Security hardening — defense-in-depth improvements with no functional or behavioral changes for valid inputs.

**Security: HTTP response headers and Connect AI input validation**

- **New: HTTP security headers** — production responses now send X-Frame-Options: SAMEORIGIN (clickjacking protection), X-Content-Type-Options: nosniff (MIME-sniffing protection), Referrer-Policy: strict-origin-when-cross-origin, and a restrictive Permissions-Policy that disables geolocation, microphone, and camera access.
- **Hardened: Connect AI edit operations** — every field applied by a Connect AI build or edit operation (bulk import; create and update for themes, backbones, and rib items) is now strictly type-checked before it reaches your data, so a value of the wrong type or an invalid category is dropped rather than stored. This closes a defense-in-depth gap and also prevents an invalid category value from ever being written.
- **Internal:** A full security review pass across authentication, sign-out and session teardown, local storage, import validation, the Connect AI surface, dependencies, and error handling; findings are tracked privately. No changes to your data, the storage format, or Connect AI behavior for valid inputs.

## Version 0.46.1 (2026-06-18)

Internal code-quality refactor — no functional or behavioral changes.

**Maintenance: module extraction and type hardening**

- **Refactor:** Pure product-transform functions moved into a dedicated
  `productTransforms` module shared by the mutation hook and the Connect AI op
  applier; Firestore collection names centralized; Connect AI connectivity helpers
  split into a separately tested module.
- **Internal:** Stronger Excel-export types, a shared rib-naming helper for
  split/clone, and assorted consistency fixes. No changes to your data, the storage
  format, or Connect AI behavior.

## Version 0.46.0 (2026-06-17)

Enrich and update story map cards in bulk — one call instead of hundreds.

**Connect AI: bulk update rib descriptions, categories, and notes**

- **New: storymap_bulk_update_ribs** — updates the description, category, and notes
  fields of multiple rib items in one call. Fields you omit are left unchanged; an
  empty string clears a field. Locked (in-progress) ribs can still have their text
  fields updated. Read Mode required.
- **Improved: Connect AI prompt** — new BULK CONTENT UPDATES section explains replace
  semantics for text fields, including the note that existing notes values are not
  readable via storymap_get_project.

> Note: storymap_bulk_update_ribs becomes available once the Connect AI service update
> is deployed. Until then, use individual storymap_update_rib calls for text edits.

## Version 0.45.0 (2026-06-17)

Unassign stories from releases in bulk — one call instead of hundreds.

**Connect AI: bulk unassign for re-planning**

- **New: storymap_bulk_unassign** — removes all release allocations from a batch of stories in one call. Already-unassigned and in-progress stories are skipped. Read Mode required.
- **Improved: Connect AI prompt** — the move-ribs workflow now has a bulk path: storymap_bulk_unassign then storymap_bulk_allocate.

> Note: storymap_bulk_unassign becomes available once the Connect AI service update is deployed. Until then, use individual storymap_unassign_rib calls.

## Version 0.44.0 (2026-06-16)

Allocate and size large story maps in bulk — one call instead of hundreds.

**Connect AI: bulk tools for release planning and sizing**

- **New: storymap_bulk_create_releases** — creates all your named releases in a single call; no Read Mode needed.
- **New: storymap_bulk_allocate** — assigns batches of stories to releases in one call. Already-allocated and in-progress stories are skipped. Read Mode required.
- **New: storymap_bulk_size** — sizes a whole map in one call. Already-sized and in-progress stories are skipped. Validates every label against your size scale. Read Mode required.
- **Improved: Connect AI prompt** — now chains tool calls back-to-back within a single response, without stopping to narrate between them.
- **Improved: size validation in AI manual updates** — storymap_update_rib now validates size labels against your project's size scale.

> Note: the three new bulk tools become available once the Connect AI service update is deployed. If a bulk tool is unavailable, fall back to the individual tools.

## Version 0.43.0 (2026-06-15)

Connect AI can now size your stories — not just build and plan them.

**Connect AI: assign t-shirt sizes to stories**

- **Your AI assistant can now assign a t-shirt size to each unsized story** through Connect AI, as an optional step after the map is built. Ask it to size your stories and it reads your project's size scale, then sizes each story from its name and description.
- **It uses your size scale, not a generic one.** The assistant sizes against the exact labels and point values you defined in Settings — whether that's the default XS–XXXL or your own custom labels. If you haven't defined any sizes yet, it will tell you to set them up first.
- **Sizing is opt-in and additive.** The assistant only sizes when you explicitly ask, and it never changes a story that already has a size. Re-running is safe; already-sized stories are simply skipped. To change or clear a size, use the Sizing board in the app.
- **Stories already in progress are protected.** A story with recorded progress has its size frozen — the assistant can't change it, and neither can the Sizing board, so historical progress math stays intact.
- **The "Copy Prompt" instructions now include a sizing section** so a compatible assistant knows exactly how to size safely.

> Note: the AI sizing tool becomes available once the Connect AI service update is deployed. Until then, building, editing, and release planning work as before; asking for sizing may report that a tool is unavailable.

## Version 0.42.0 (2026-06-15)

Connect AI can now help plan releases — not just build the map.

**Connect AI: create releases and assign stories to them**

- **Your AI assistant can now create releases and place stories into them** through Connect AI, as an optional second phase after the story map structure is built. Ask it to plan releases once your map is ready, and it can add the releases you want and assign whole stories to each one.
- **Release planning is opt-in and additive.** The assistant only touches releases when you explicitly ask. It creates every release first, then assigns stories — and it never overwrites a story that is already assigned. Re-running is safe; already-assigned stories are simply skipped.
- **One story, one release, 100%.** From Connect AI a story goes entirely into a single release. Splitting a story across releases by percentage stays a manual action on the Release Planning board.
- **Stories already in progress are protected.** A story with recorded progress cannot be reassigned or unassigned by the assistant — it must be changed manually, so historical progress math stays intact.
- **The "Copy Prompt" instructions now include a release-planning section** so a compatible assistant knows exactly how to drive this safely.

> Note: the AI release-planning tools become available once the Connect AI service update is deployed. Until then, building and editing the map works as before; asking for release planning may report that a tool is unavailable.

## Version 0.41.8 (2026-06-15)

A stronger Connect AI prompt for assistants that build maps step by step.

**Clearer guidance for Microsoft Copilot Chat and larger maps**

- **The "Copy Prompt" instructions are now more direct for assistants that can't build a whole map in one shot.** Assistants such as Microsoft Copilot Chat are now told to skip the all-at-once method from the start and build the map piece by piece — instead of trying the fast path, hitting an error, and recovering. They're also told never to retry the all-at-once method after it errors.
- **Added guidance for maps that are too big for a single import.** The fast all-at-once method supports up to 5 themes, 10 backbones per theme, and 10 stories per backbone. If your map is larger, the assistant will either ask you to trim it to fit or switch to building it piece by piece — and it will never silently drop part of your map to squeeze it in.

## Version 0.41.7 (2026-06-15)

A Connect AI compatibility fix for more AI assistants.

**Connect AI now works with assistants that build maps step by step**

- **Fixed an issue where some AI assistants would fail when building a whole story map at once.** A few assistants — such as Microsoft Copilot Chat — couldn't handle the fast "build the entire map in one shot" request and stopped with an error partway through. The "Copy Prompt" instructions now tell the assistant to fall back to building the map one piece at a time (the theme, then each backbone, then each story) whenever the all-at-once path isn't supported by that assistant.
- **The fast path is still the default.** Assistants that support it keep building maps in a single step; only the ones that need it switch to the step-by-step approach, and they do so automatically. Either way you end up with the same finished map.

## Version 0.41.6 (2026-06-15)

A quicker way to rename a project.

**Rename projects right from the project list**

- **Added a rename (pencil) button to each project card**, between the Duplicate and Delete icons. Click it to make the project's name editable right where it sits.
- **You can also just double-click a project's name** to start renaming — whichever feels more natural.
- **To save, click away from the box** (or press Enter); press Escape to cancel. An empty name is ignored, so you can't accidentally blank one out. Renaming was previously tucked away under a project's Settings tab — that still works too, but you no longer have to go looking for it.

## Version 0.41.5 (2026-06-14)

A documentation refresh on the About page.

**New: Connect AI guide + updated Quick Reference Guide**

- **Added a "Connect AI Guide" download to the About page**, just below the Quick Reference Guide. It's a printable walkthrough of pairing a compatible AI assistant with your story map to build and edit structure in real time.
- **Refreshed the Quick Reference Guide PDF** with the latest features and workflow.

## Version 0.41.4 (2026-06-14)

A Connect AI reliability fix.

**More reliable AI session pairing**

- **Fixed an issue where some AI assistants would stop partway through building a map and ask you for a new pairing code.** The "Copy Prompt" instructions now make clear that the assistant should claim your session only once, at the start of the conversation. The pairing code is single-use, and some assistants were re-checking it before each step and treating the expected failure as an expired session. Your session now stays active for the entire conversation, so the build continues uninterrupted.

## Version 0.41.3 (2026-06-13)

A capacity bump for AI-built story maps.

**More backbones per theme**

- **The Connect AI assistant can now create up to 10 backbones per theme** when building a map from scratch (previously 5). The limits on themes (5) and rib items per backbone (10) are unchanged, so a single AI-built map can now span up to 500 rib items. Existing maps and the build flow are otherwise unchanged.

## Version 0.41.2 (2026-06-13)

A footer link addition.

**AI Privacy Notice link**

- **Added an "AI Privacy Notice" link to the footer**, alongside the existing Terms of Service, Privacy Policy, and License links. It points to the SPERT Suite AI privacy notice, which covers the Connect AI feature.

## Version 0.41.1 (2026-06-13)

A Connect AI prompt refinement.

**Better starter prompt for editing**

- **The "Copy Prompt" text in the Connect AI panel now guides your assistant through editing an existing map**, not just building a new one. It tells the assistant to read your current structure first (with Read Mode enabled) and then make targeted changes one item at a time — renaming a theme, adding a backbone, revising a rib item. If you're starting fresh, the build-from-scratch flow is unchanged.

## Version 0.41.0 (2026-06-13)

The Connect AI assistant can now refine an existing story map, not just build one from scratch.

**New: AI-assisted editing**

- **Your connected AI assistant can now make targeted changes to a map you've already started** — rename a theme, update a backbone's name or description, or revise a rib item's name, description, category, notes, or size. Previously the assistant could only build a complete map in one pass; now it can adjust individual items as you refine your plan together. Turn on Read Mode so the assistant can see your current structure before it edits.
- **Sizing is protected on work in progress.** If a rib item already has recorded progress, the assistant won't change its size — the same safeguard the Sizing tab uses — so your historical points and forecast math stay intact. Names, descriptions, and notes remain editable.

**Reliability**

- **More reliable sync while the app is loading** — structure the assistant sends before your project finishes opening is now applied correctly once it's ready.

## Version 0.40.0 (2026-06-13)

Connect an AI assistant to build your story map.

**New: "Connect AI"**

- **A new "Connect AI" button in the project header pairs your AI chatbot (ChatGPT, Claude, and others) with SPERT Story Map so it can build a story map for you.** Click Connect AI, choose what the assistant may do, and you'll get a short pairing code (like `CRANE-7842`) plus a ready-to-paste prompt for your chatbot. The assistant asks what product you're planning and which modeling approach fits *before* building anything — then themes, backbones, and rib items appear on your map as it works.
- **You control access.** Write Mode (the assistant can add structure to the project you have open) is required; Read Mode (the assistant can see your current map for context) is optional and off by default. Toggle Read Mode any time from the session panel, or Disconnect to end the session immediately.
- **Privacy-conscious.** Pairing codes are single-use and expire after 15 minutes; the assistant only ever works on the project you have open, with only the permissions you grant. See the in-app AI privacy notice for details.

## Version 0.39.3 (2026-06-08)

A Sizing-tab convenience for card colors.

**Set a card's color from the Edit dialog**

- **The "Edit Rib Item" dialog on the Sizing tab now has a Card Color picker**, so you can recolor a card while you're already editing its name, size, or notes — no need to close the dialog and reopen the card's "⋮" menu just to change the color. The color you pick is staged along with your other edits and applied when you click Save (and reverted if you discard). The "⋮ → Color…" menu shortcut on each card still works exactly as before.
- **The same picker also appears when adding a card with the "+ Rib" button**, so you can set a color as you create it.
- **Colors stay editable on locked cards** (cards with recorded progress). Color is an organizational flag, independent of work status, so it remains changeable even though the size stays locked to protect historical points math.

## Version 0.39.2 (2026-06-04)

A small Dashboard icon fix.

**Clearer "Share" icon**

- **The Share button on each project card now uses a person-with-a-plus icon** instead of the old upload-box shape, which was easy to mistake for an import/upload action. The new icon matches the Share icon used in SPERT Forecaster, so sharing looks consistent across the SPERT Suite. (Shown only in cloud mode, to the project owner — unchanged.)

## Version 0.39.1 (2026-06-03)

Two small Map/Sizing usability fixes.

**Less eager card tooltips**

- **The full-name tooltip on a rib card now waits until you actually dwell, instead of popping the instant your pointer passes over.** The hover delay before a card's full-name tooltip appears was increased from 200ms to 500ms on **both** the Map and Sizing tabs, so sweeping the pointer across cards no longer flashes tooltips you didn't ask for. Other tooltips (e.g. the release delete button's) keep their original quick timing.

**Clearing a multi-selection**

- **Moving a group of selected cards now deselects them once the move lands.** Previously a multi-selection stayed highlighted after a drag, and the only way to clear it was to click a different card. After a bulk move the group is automatically deselected.
- **Click any empty spot on the Map to deselect.** Clicking the empty canvas now clears the current selection (and closes the detail panel) — a general escape hatch so you can drop a selection without moving it, and the mouse equivalent of the Escape key (which already cleared the selection).

## Version 0.39.0 (2026-06-03)

Cards now move the same way on both the Map and Sizing tabs, and release lanes on the Map can be collapsed.

**Unified card gesture (Map + Sizing tabs)**

- **Click a card to open it; click-and-hold anywhere to move it — identical on both tabs.** Previously the Map tab required grabbing a small "⠿" handle to move a card, while the Sizing tab let you drag from anywhere but had no click action. Now both behave the same: a single click opens the card's editor (the detail panel on the Map, the edit dialog on Sizing), and pressing and dragging anywhere on the card body moves it. You no longer have to remember which tab you're on to know how a card behaves.
- **The Map card grip is gone, and the layout was tidied to fit more of the title.** With whole-card dragging, the drag handle was redundant, so it's been removed. The color swatch moved to the top-right corner alongside the clone and delete icons, freeing the left column so longer rib names show a little more before truncating.
- **Locked Sizing cards are now clickable to edit.** Cards with progress still can't be dragged (to protect historical points/percentage math), but you can now click one to open its editor and adjust the name, description, category, or notes.
- An 8px click-vs-drag threshold keeps a normal click from being mistaken for a move, and a click immediately after a drag won't accidentally open the editor. Inline double-click-to-rename on Map cards still works (a sloppy double-click that drifts more than 8px becomes a move instead — undo with Ctrl+Z).

**Collapsible release lanes (Map tab)**

- **Collapse a release lane to hide its cards; expand it to show them again.** Each release label now has a ▸/▾ toggle. When you're populating later releases, collapse the earlier ones you've already filled so the Unassigned lane sits right under the backbone column headers — making it far easier to line up unassigned items with the right backbone without scanning past everything.
- **A collapsed lane shows its name and card count** (e.g. "Release 2 (12)") so you still know what's inside at a glance.
- **A "Collapse releases" / "Expand all" button** in the top-right controls collapses every release lane at once (the Unassigned lane always stays open). It appears only when you have two or more releases.
- **Drag-and-drop still works with collapsed lanes:** drop a card onto a collapsed lane and it automatically expands so you can see where the card landed. The "+ Release" and delete controls are hidden on a collapsed lane — expand it first to use them. Collapsing a lane closes the detail panel if its card was open.
- Collapse state is remembered per project as you move between tabs (it resets when you close the browser).

**Under the hood**

- A shared `isInteractiveChild` helper (`src/lib/domHelpers.ts`) gates both tabs' card gestures so presses on buttons, the inline-edit field, or the kebab menu never start a drag or open the editor. The color-picker popover now stops click propagation, fixing a latent case where picking a color could also open the card behind it.
- Map layout (`computeLayout`) takes an optional list of collapsed release ids; collapsed lanes get a fixed 30px height and emit no cells or "+ Rib" buttons, and the existing cumulative-Y layout reflows everything below automatically. Drop-to-expand reads the drop target from the live drag state and batches the expand with the move (no flicker); selection cleanup and the bulk toggle are small pure helpers (`collapseHelpers.ts`). New unit tests cover the gesture guard, the collapse helpers, and the collapsed-lane layout math.

## Version 0.38.0 (2026-06-02)

Card color palette fix — the gold "amber" flag was too close to yellow to tell apart.

**Amber replaced with a true orange**

- **The card color palette is now red / orange / yellow / green / blue / purple / gray.** The previous "amber" swatch rendered as a gold tone almost identical to yellow, which made two color-coded meanings hard to distinguish in the legend and on cards (reported during a live sizing session). Amber has been replaced with a clearly distinct orange, so every pair in the 7-color palette is now unmistakable. (The green option — emerald — was always there; it only shows in the legend once you apply it to a card.)
- **Your existing amber cards become orange automatically — nothing is lost.** Any card you'd already flagged amber is migrated to orange on load, and the legend label you typed for amber carries over to orange. The conversion is idempotent and applies in both local and cloud storage, as well as on JSON import (legacy amber files normalize to orange). If a project somehow had both an amber and an orange label, the orange one wins.
- **Under the hood.** `ribCardColors.ts` now exports a `LEGACY_CARD_COLOR_ALIASES` map (`amber → orange`), a `resolveCardColorKey` helper, and a pure idempotent `migrateCardColors(product)` that rewrites rib `cardColor` flags and `cardColorLabels` keys. It runs at the two `useProduct` state boundaries (initial load + cloud echo) and inside `validateProduct` for imports. Alias lookups are own-property-guarded so `constructor` / `__proto__` keys can't resolve to prototype members. The Tailwind classes for amber elsewhere (e.g. the Sizing tab's "L" size-column header) are unrelated and unchanged.

## Version 0.37.0 (2026-06-02)

A dynamic color legend for the Map and Sizing tabs, plus a fix for modals closing when you drag outside them.

**Card color legend (Map + Sizing tabs)**

- **A legend now appears when you color-code cards, and you can name each color.** During sizing exercises you may use card colors to mean different things — e.g. one color for "defer for later discussion," another for "might not be needed at all." A small legend now floats in the bottom-right corner of both the Map and Sizing tabs, listing every color currently applied to at least one card with an editable text field next to each. Type the meaning of a color once and it shows in the legend on both tabs.
- **Shared across tabs.** Labels are stored on the project (`cardColorLabels`), so a label you set on the Sizing tab appears on the Map tab and vice-versa. Edit-in-place: click a label, type, and it commits on blur (or Enter). Escape reverts the current edit.
- **Dynamic and self-hiding.** The legend only lists colors actually in use — color a card and its row appears; remove the last card of a color and that row disappears. When no card is colored at all, the legend is hidden entirely. It's collapsible (click the × to shrink it to a small "Legend" pill; click the pill to expand), and the open/collapsed state is remembered per project as you navigate between tabs.
- **Under the hood.** New shared `CardColorLegend` component in `src/components/ui/`, rendered as a sibling of the canvas so it stays fixed in the corner instead of panning/zooming with the map. Labels are committed via a new `setCardColorLabel` mutation and buffered with `useBufferedField` so cloud-sync echoes can't scramble mid-type input. The new field is allowlisted and sanitized in `validateProduct` (known color keys only, non-empty strings, capped at 80 chars, prototype-pollution keys rejected).

**Bug fix — modals no longer close when a drag ends outside them**

- **Resizing the Notes box or selecting text in a modal no longer makes the modal vanish.** In the Sizing tab's Edit dialog (and every other modal), if you grabbed the Notes textarea's resize handle and dragged past the edge of the dialog, or started selecting text inside a field and released the mouse button outside the dialog, the whole modal would disappear — losing your resize or your selection. The cause: a browser `click` event fires on the nearest common ancestor of where the mouse went *down* and *up*, so a drag that started inside the card but ended on the dark backdrop resolved its click to the backdrop and triggered "click outside to close." The shared `Modal` now tracks where the press *started* and only closes when both the press and release happen on the backdrop itself. Resized boxes keep their shape and text selections survive a release outside the modal. Fixed once in `Modal.tsx`, so it applies to every dialog in the app.

## Version 0.36.1 (2026-05-28)

Bug fix — Sizing tab insertion indicator was rendering in the wrong vertical position.

**Fix**

- **Insertion indicator in the unsized zone now lands between cards instead of inside the Excel-style header strip.** When dragging a card into the unsized grid, the blue horizontal line that shows where the card will land was using zero as its origin — but the cells themselves render below the column-letter strip and to the right of the row-number gutter. The result: the indicator was offset by the full strip height vertically (above the column letters) and by the full gutter width horizontally. The bug was introduced silently in v0.35.0 when the Excel-style headers were added (16px strip / 28px gutter, so the misalignment was easy to overlook) and became visibly worse in v0.36.0 when the headers were enlarged (24px strip / 36px gutter). Indicator coordinates now include the `LETTER_STRIP_HEIGHT` and `NUMBER_GUTTER_WIDTH` offsets, mirroring how `useSizingLayout` places the cells themselves. The sized-column branch of the same component was already correct (it uses `col.x` and `sizeColumnsY`, which carry the offsets) and is unchanged. While I was in the function, collapsed two identical `else` branches into a single ternary — no behavior change.

## Version 0.36.0 (2026-05-28)

UX polish — conventional zoom button order, drag-edge auto-scroll on Map and Sizing tabs, and larger Excel-style headers on the Sizing grid.

**Zoom controls**

- **Minus on the left, plus on the right.** Swapped the order of the `−` / `+` zoom buttons on both Map and Sizing tabs to match the conventional left-to-right "less → more" arrangement most apps use. Keyboard shortcuts (`+` / `−` / `0` for fit) and the percentage label between the buttons are unchanged. Single edit in `MapCanvas`, which both tabs share.

**Drag-edge auto-scroll on Map and Sizing tabs**

- **Drag a card to the edge of the canvas and it scrolls automatically.** Previously when you grabbed a rib / backbone / theme / release card and dragged it toward the edge of the viewport, you hit a brick wall — to drop the card somewhere currently off-screen you had to first release, pan the canvas, then start the drag over. Now when the pointer enters a 60-pixel band along any edge during an active drag, the canvas pans automatically in that direction, scaled to how close to the edge you are: a slow creep at 60px in, faster the deeper you go, capped at 20 pixels per frame. Both axes work independently — diagonal corner drags pan in both X and Y. The instant the pointer leaves the edge zone or you release the card, panning stops. Applies to all four Map drag types (rib, backbone, theme, release) and the Sizing tab's rib drag.
- **How it works.** New `useEdgeAutoPan` hook in `src/hooks/`. While drag is active, runs a `requestAnimationFrame` loop that reads the latest pointer position (kept fresh in a `dragPointerRef` exposed from both `useMapDrag` and `useSizingDrag`), measures distance from each edge of the canvas container, and updates `pan` via the existing setter. After each pan tick the hook synthesizes a `pointermove` event on the container so the drag hook re-runs hit-testing against the new pan — drop-target indicators stay accurate even when the user holds the pointer still in the edge zone. Pure delta math (`computeEdgeAutoPanDelta`) is exported separately for unit testing.
- **Release Planning unchanged.** Release Planning still uses native HTML5 DnD (a different mechanism); edge-scroll there will be a separate follow-up if requested.

**Sizing tab — bigger Excel-style headers**

- **Column letters (A, B, C…) and row numbers (1, 2, 3…) are now legible at a glance.** Previously the letter strip was 16px tall and the gutter was 28px wide, both using 10px font. The letters/numbers were physically smaller than the 14px card titles next to them, which made them hard to read on standard-DPI displays. Bumped letter strip height `16 → 24px`, gutter width `28 → 36px`, and header font from 10px to 14px semibold — same size as the card title text so the grid address is as readable as the card itself. Color stays neutral (`gray-500` / `dark:gray-400`) so the headers read as structure, not content. The "Unsized (n)" label tracks the strip's new height and gets a small bump in max-width to accommodate longer counts.

**Tests**

- `sizingLayout.test.ts` — updated `totalWidth` expectations from 644 → 652 (gutter went from 28 → 36, so `36 + 616 = 652` at minimum).

## Version 0.35.0 (2026-05-28)

UX polish — Sizing board canvas utilization, card color coding, Excel-style grid addressing, editable Description on the Map tab's detail panel, and quality-of-life fixes for the Sizing filter.

**Sizing tab — make better use of the canvas**

- **Sized columns now expand to fill the canvas.** Previously each size column was a fixed 200px-wide vertical strip — with only a few sizes (e.g. S/M/L) and many ribs, you got tall narrow columns and wasted horizontal canvas. Each size column zone now expands to fill its proportional share of the available width, and cards inside flow in a grid (multiple sub-columns) just like the unsized zone has always done. `computeSizingLayout` accepts a new optional `targetWidth` parameter; the hook reads container width via `ResizeObserver` and feeds it in. When `targetWidth` is unset or below the minimum stacked width, the layout falls back to the legacy 1-card-wide behavior (preserves back-compat for tests / SSR).
- **Grid-aware insertion indicator inside sized zones.** When dragging into a sized column, the blue insertion line now snaps to the grid position (row, sub-col) instead of vertical-only. Mirrors the unsized zone math for consistency.
- **Excel-style A/B/C column letters + 1/2/3 row numbers on the unsized grid.** With many unsized cards, you can now reference a specific card by its grid address (e.g. "B3"). Column letters render above each grid column in a 16px strip, row numbers render in a 28px gutter on the left. Letters use Excel-style addressing (`A`–`Z`, then `AA`, `AB`, …). The "Unsized (n)" label moves from the upper-left to the right edge of the letter strip so it doesn't fight for the `A` column position.
- **Card color coding on Sizing cards.** Each Sizing card gets a new `Color…` entry in its kebab menu (`Edit / Color / Split / Delete`). Selecting it opens the same `RibCardColorPicker` used on the Map tab; when a color is set, the card background is tinted via `RIB_CARD_COLOR_BG`. Color is an organizational flag independent of work state, so locked cards still get tinted.
- **Filter panel closes on outside click.** Clicking anywhere outside the Sizing filter panel (canvas, `+ Rib` button, a card) now collapses it — no more required re-click of the Filter button to dismiss. Same pattern as `RibCardColorPicker` and `KebabMenu`.

**Map tab — RibDetailPanel polish**

- **Description is now editable in the side panel.** Previously the field was only read-only when present (and entirely hidden when empty), so there was no signal that the field existed. The panel now has a collapsible `Description` section: header always visible (so the field is discoverable), expanded by default if the rib has a description, collapsed when empty. When collapsed-with-content, a single-line truncated preview shows next to the label. Uses `useBufferedField` for cloud-echo safety — same hook the v0.33.0 SettingsView fields use.
- **Panel widened from `w-80` to `w-96`** (320 → 384px) so Description and Notes both get meaningful room without one crowding the other.
- **Notes textarea migrated to `useBufferedField`** (drive-by) — same cloud-echo scramble fix the SettingsView fields got in v0.33.0.

**Tests**

- `sizingLayout.test.ts` — added 3 cases for the targetWidth-driven expansion: legacy 1-sub-col stacking at `targetWidth=0`, multi-sub-col packing at `targetWidth=1300`, and `totalWidth` clamping math (accounts for the 28px row-number gutter).

## Version 0.34.0 (2026-05-28)

UX polish — clickable logo home navigation and broader `+ Rib` affordance coverage on the Map tab.

**Navigation**

- **Logo links to home.** The SPERT favicon in both the homepage and per-project headers is now a `Link` to `/`. Clicking it returns to the projects list and scrolls to top — works as expected even on the homepage itself, where it acts as a refresh-and-scroll. Includes a focus-visible ring for keyboard users and an `aria-label` for screen readers.

**Map tab — `+ Rib` affordance**

- **`+ Rib` button now appears in every empty release×column cell.** Previously the hover affordance only rendered in an empty cell if the entire backbone column was empty across all lanes — meaning a half-filled column would leave its empty release rows with no way to add a rib without scrolling to the unassigned lane. Every empty cell under a release divider now hosts a `+ Rib` button at the top of the cell.
- **Longest column in the unassigned lane is no longer excluded.** The unassigned lane's height used to be sized exactly to fit its tallest column, leaving zero pixels below the last rib for a `+ Rib` button. The lane now reserves `ADD_BUTTON_RESERVED` (24px) below the rib stack when at least one rib is present, so the longest column gets the same affordance every other column gets.
- **Release lanes get the same treatment.** Release-lane heights also reserve 24px below the longest column's rib stack, so a `+ Rib` button sits below the last card in every column — including the one that determines lane height.
- **Simpler layout code.** The `emptyBackboneColIdx` exclusion set and `availableGap` / `MIN_GAP_HEIGHT` runtime guard are removed from `computeLayout`. Lane heights now guarantee room, so the gap-button loop just emits one entry per `(lane × column)` cell unconditionally — top of cell when empty, below last card when populated. New `ADD_BUTTON_RESERVED` constant is exported alongside the other layout constants.

**Tests**

- `computeLayout.test.ts` — updated lane-height expectation to account for the reserved button padding; added a new case asserting that a `+ Rib` button is emitted for every `(lane × column)` cell, including the longest unassigned column and empty release cells inside a partially-filled backbone.

## Version 0.33.0 (2026-05-24)

Cloud storage remediation — sign-out safety, debounce reduction, buffered inputs, per-user localStorage namespacing, Firestore mergeFields + atomic changelog, multi-subscriber error surface, and permission-denied recovery.

**Reliability**

- **Sign-out safety.** Driver teardown (cancel pending saves + detach Firestore listeners) now runs through a single-slot registry, guaranteed to complete before Firebase credentials are revoked. Prevents `PERMISSION_DENIED` toasts after a successful sign-out and prevents trailing writes from landing on the user's cloud doc after they believed they signed out. All three sign-out paths (UI button, ToS-stale, ToS-error) go through the same sequence.
- **Delete is now atomic.** `deleteProduct` (both local and cloud) cancels any pending debounced save for the product before deleting — a trailing write would otherwise resurrect the just-deleted doc. The local driver also cancels the products-index timer in the same atomic step.
- **Driver-swap flush.** `useProduct` now flushes pending saves to the outgoing driver on mode/uid changes — typing-in-progress when switching local↔cloud no longer disappears.
- **`pagehide` + `beforeunload`.** Mobile browsers fire `pagehide` reliably where `beforeunload` does not; both are now wired so up-to-200ms of typing is preserved on tab close.

**Performance**

- **Save latency cut by ~60%.** The old 500ms outer debounce in `useProduct` stacked on top of the driver's 500ms inner debounce produced ~1s of perceived input latency. The outer timer is removed and the inner debounce is reduced to 200ms; `lastSaved` is now mode-aware (optimistic for local, server-timestamped for cloud — no flash).
- **Batch export reads prefs once.** `exportAllProducts` now hoists a single Firestore preferences read and threads it through to each per-product `exportProduct` call via a `cachedPrefs` parameter (a cloud user exporting N projects used to incur N reads). Single-product export callers are unchanged.

**Input handling**

- **Buffered text inputs (`useBufferedField`).** Project name, description, release name, and sprint name in Settings now commit on blur, not on every keystroke. Mid-type cloud echoes can no longer scramble cursors or wipe pending characters. Date pickers and selects are intentionally unbuffered (their native commit semantics differ).
- **`InlineEdit` mid-edit sync fix.** External value updates no longer overwrite the editing draft — sync is gated on `!editing`.
- **`onProductChange` invariant documented.** Echoes are wholesale tree replacements; components that buffer user input must gate sync on focus state.

**Storage isolation**

- **Per-user localStorage namespacing.** Keys are now `rp:{uid}:product_<id>` / `rp:{uid}:products_index` / `rp:{uid}:preferences` (and `rp:local:*` when anonymous). The same browser can hold multiple users' caches without collision. `rp_workspace_id` is never namespaced (per-browser academic-integrity token must survive sign-outs).
- **One-time legacy migration.** Pre-v0.33.0 data at `rp_product_*` / `rp_products_index` / `rp_app_preferences` is migrated to `rp:local:*` in a top-level `await` before React mounts. Uses `navigator.locks` when available (exclusive across tabs); falls back to a 30s timestamp lock. Corrupt JSON preserves the old key and logs a warning rather than silently dropping data.
- **Sign-out clears only the active namespace.** A signed-out cloud user's anonymous-session data at `rp:local:*` survives — they get it back if they keep using the app without signing in.

**Firestore write semantics**

- **`mergeFields` replaces `merge: true`.** Saves now whitelist exactly which top-level keys can be written. Side-write fields (`_storageRef`, `_exportedBy`, `_exportedById`, `owner`/`members`/`_owner`/`_members` aliases) can no longer leak into Firestore via a routine save.
- **Atomic changelog (`arrayUnion`).** `_changeLog` is now excluded from `mergeFields` and written via a separate `updateDoc(_changeLog: arrayUnion(...newEntries))` that appends only entries new to the server. A smaller local log can no longer truncate the server's history.
- **`seq` nonce on every changelog entry.** A per-entry uniqueness token distinguishes same-second writes (notably bulk-deletes that share `op: 'delete'` / `entity: 'rib'` and omit `id`/`uid`/`source`) so `arrayUnion`'s structural dedupe doesn't collapse them. Validator allowlist updated; backward-compatible with pre-v0.33.0 imports.
- **Listener echo re-attaches `_members`.** Without this, the Sharing UI lost owner/editor/viewer discrimination 1-3s after every save when the snapshot arrived.

**Error surface**

- **Multi-subscriber `onSaveError`.** Both `ProductLayout` and `ProductList` can register independently — previously the second registration silently replaced the first. Returns an unsubscribe function so unmounting components don't leak setState targets.
- **Mode-aware save error banner.** Cloud failures show "Changes may not have saved. Check your connection." instead of the quota-focused localStorage message.

**Access denied recovery**

- **Cold-load and live `permission-denied`.** Both paths now redirect to the project list with a one-shot "You no longer have access to that project." banner. The live path unsubscribes the listener immediately so it can't keep firing. The cold-load path falls through to the existing "Project not found" UI for non-permission errors.
- **`onProductChange` accepts an optional `onError` callback.** Routes Firestore listener errors per-call when provided; falls back to the save-error subscribers when omitted.

## Version 0.32.1 (2026-05-24)

About page polish — renames the QRG download button to match the canonical label shared across all SPERT® Suite apps.

**About page**
- Renamed the QRG download button from `Quick Reference Guide (PDF)` to `Open Quick Reference Guide (PDF)` so the label matches the convention used by SPERT® Forecaster, MyScrumBudget, and SPERT® AHP.

## Version 0.32.0 (2026-05-20)

Level 4 Import — multi-project preview, conflict resolution, and import-as-copy.

**New features**

- **Multi-project import preview.** Pick a file on the project list homepage and review every project before anything changes. ID conflicts (definite match — same project ID) and name conflicts (probable match — same name, different origin) are detected with per-project resolution choices: skip, replace existing, or import as copy.
- **Bundle file import (bug fix).** "Export All Projects" previously produced a file that the Import button rejected with "Product must be a JSON object". Bundled exports are now fully importable via the project list homepage. Using a bundled file in Settings → Data → Import now shows a targeted message directing you to the homepage importer.
- **Import as copy.** Creates a new project with a disambiguated name, fully regenerated IDs for all nested entities (themes, backbones, rib items, releases, sprints, allocations, progress entries, card order maps), and a preserved audit history from the source file (matching the 'add' path).

**Improvements**

- **Cloud-mode import readiness.** Import button gated on Firestore data hydration, not just authentication. Prevents false "no conflicts" results during workspace loading.
- **Mid-write protection.** The Import button is disabled while an import is being applied, and the hook rejects file picks while writes are in flight.
- **Applying state.** Spinner shown while imports write. Cloud imports can take 1–3 seconds per project.
- **Result banners.** Confirms counts of added, replaced, copied, skipped. All-skip shows "N skipped" rather than silently doing nothing. Workspace-changed skips reported separately with the conflicting project's name.
- **Import failures surface in the banner.** Write errors during add, replace, and copy now appear in the import result banner (per-project), not silently in a separate global banner. Both local and cloud modes report failures correctly. Driver-level `createProduct` gained a `throwOnError` option for this path; existing callers retain best-effort semantics.
- **Replace protection (Firestore).** Cloud replace uses `runTransaction`, eliminating a concurrent-edit race. Original creation date (`createdAt`) and workspace fingerprint (`_originRef`) are preserved.
- **Identity field preservation (local).** Local replace reads the existing project before overwriting, preserving `createdAt` and `_originRef` so academic-integrity provenance is not laundered through a re-import.
- **DataSection cleanup.** Per-project replace (Settings → Data → Import) no longer forces a full page reload. Errors shown inline. Bundle files show a targeted message. Driver write failures surface as errors.

**Tests:** 23 new tests across 3 new files (`importUtils.test.ts`, `useImportState.test.ts`, `dataSection.test.tsx`) covering the parse → conflict → apply pipeline, the hook state machine, and the per-project replace surface. Total 554 → 577.

**Known limitations**

- Cloud mode always shows the preview — no one-click fast path even for conflict-free files (intentional: Firestore may still be loading).
- For multi-project cloud imports, writes are sequential and span several seconds. A concurrent peer edit during that window is not detected after the Layer 2 re-read.
- The per-project import in Settings → Data is not gated on cloud hydration (only the homepage importer is). Importing immediately after sign-in via this surface could theoretically overwrite stale data.
- After enabling cloud sync, wait for the dashboard to load your existing projects before importing. The homepage Import button enables once your projects are loaded.

## Version 0.31.3 (2026-05-14)

Bug fix: refreshing the browser on a deep route (e.g. `/product/<id>` or any nested tab like `/product/<id>/storymap`) no longer returns Vercel's generic `404: NOT_FOUND` page. The repo had no `vercel.json` and no SPA fallback, so Vercel treated parameterized routes as literal file requests and 404'd before React Router ever got a chance to resolve the URL. Added `vercel.json` with a catch-all rewrite to `/index.html` so all routes deliver the app shell and React Router takes over. Refresh now reloads cleanly on whatever route you're on — no need to bounce back to the project dashboard.

## Version 0.31.2 (2026-05-14)

Bug fix: name-tooltips no longer get stuck after using the color picker. The card's hover tooltip is dismissed via `mouseLeave` on the card div — but when the color-picker portal opens, the cursor never physically leaves the card's bounding box during picker interaction, so `mouseLeave` never fired and the tooltip stayed visible. Repeated across cards, the screen would accumulate a stack of stuck tooltips. Now the swatch click explicitly dismisses any visible tooltip and suppresses it while the picker is open.

## Version 0.31.1 (2026-05-14)

Selected rib card now stays visually anchored while its detail panel is open. Previously the blue border + ring only appeared for multi-selected cards (drag-select), so clicking a single card to edit it left no visual cue tying the open detail panel back to its source. Now the card whose detail panel is open keeps the same selection styling for the duration of the edit. No data changes; UI-only patch.

## Version 0.31.0 (2026-05-14)

Rib-card layout reshuffle + per-card color flagging on the Map tab.

- **New 3-column card layout.** Drag grip on the left now has a color-swatch button stacked below it (hover-only, like the clone/delete icons). Clone and delete icons moved to a vertical stack in the top-right corner, with clone on top (it's the more frequently used of the two). "Core" / "Non-Core" label is now anchored at the bottom-right corner, freeing the bottom row for points and percentage.
- **Per-card color flag.** Clicking the color-swatch button opens a small popover with 7 mid-tone colors (rose, amber, yellow, emerald, sky, violet, slate) plus a "clear" option. The chosen color shades the entire rib card so flagged cards stand out across the whole map — useful for triaging cards suspected of being unneeded so the team can locate them quickly at the next meeting. Cloning a colored rib carries the color over (matches the existing "shares everything" clone semantics; clear it manually if the slice no longer needs the flag).
- **Schema:** new optional `RibItem.cardColor` field. Validator allowlist updated; unknown color values are cleared non-destructively (matches the existing `size` validator pattern). No data migration needed — existing ribs default to no color.

4 new tests (clone inherits cardColor, clone omits when none, validator accepts known values, validator clears unknown values). Total 539 → 543.

## Version 0.30.0 (2026-05-14)

Map tab affordance overhaul.

- **Empty backbones now show a hover "+ Rib" affordance in every release lane and the unassigned lane.** Previously, a backbone with no rib items had no contextual way to add the first one — you had to scroll to the bottom of the map and click a persistent footer button. Now hovering any empty cell under such a column reveals "+ Rib" right there.
- **Persistent column-bottom "+ Rib" buttons removed.** The hover-reveal affordance (both the existing below-last-card variant and the new empty-cell variant) now covers every case, so the always-visible row at the map's footer was redundant clutter.
- **Clone icon on every rib card.** Hovering a rib card reveals a small "two squares" clone icon to the left of the delete ×. Click it to duplicate the rib in place — same size, category, description, notes, and release allocations as the original, with progress history starting fresh. The clone sits immediately below the original in every release lane it inhabits (and in the same size bucket on the Sizing tab). Smart naming: "Foo" → "Foo (1)", clone "Foo" again → "Foo (2)", clone "Foo (3)" → "Foo (4)". The new card opens in the detail panel with the name field focused, ready to tweak. Designed for the slice-a-rib-into-smaller-pieces workflow.

14 new tests covering `cloneRibInProduct` (525 → 539 total).

## Version 0.29.3 (2026-05-09)

Security audit wrap-up — bundles every remaining non-deferred audit finding (M1, M2, M3, L1, L3, L4) into a single Story Map release plus a companion canonical-rules patch (M4) in the Landing Page repo. No user-visible behavior change. Test count grows from 510 → 524.

### Security
- **XLSX formula-injection neutralizer in `exportForExcel.ts` (audit M1, CWE-1236).** A user naming a theme `=HYPERLINK(…)` previously produced a workbook that, when opened by a colleague, would evaluate the formula. New `safeCell()` helper prefixes any string starting with `=`, `+`, `-`, `@`, TAB, or CR with a single quote — Excel's documented opt-out for formula evaluation. Applied at every user-controlled string cell across both worksheets (project name, theme group header, theme/backbone/rib/notes/release-string in the data row, release name in the summary).
- **Per-entity field allowlists + prototype-pollution key rejection in `validateProduct.ts` (audit M2 + L4).** The previous validator only stripped unknown fields at the top level; nested objects (themes, backbones, ribs, releases, sprints, allocations, progress entries, changelog entries, sizeMapping rows) accepted arbitrary keys, and only `releaseCardOrder` / `sizingCardOrder` were guarded against `__proto__` / `constructor` / `prototype`. New `stripObject(obj, allowed)` helper applies a per-entity allowlist (`KNOWN_THEME_FIELDS`, `KNOWN_BACKBONE_FIELDS`, `KNOWN_RIB_FIELDS`, `KNOWN_RELEASE_FIELDS`, `KNOWN_SPRINT_FIELDS`, `KNOWN_ALLOCATION_FIELDS`, `KNOWN_PROGRESS_FIELDS`, `KNOWN_CHANGELOG_FIELDS`, `KNOWN_SIZEMAPPING_FIELDS`) and rejects prototype-pollution keys on every object. Changelog entries also now bound `op`/`entity`/`id`/`uid`/`source` strings to 128 chars; oversized values are dropped rather than rejected. 14 new test cases (510 → 524) cover unknown-field stripping per entity and `__proto__`/`constructor`/`prototype` rejection on theme, rib, and release.
- **Runtime role allowlist in `callSendInvitationEmail` (audit L1).** TypeScript types are erased at runtime, so `'editor' | 'viewer'` on `SendInvitationEmailInput.role` does not prevent a future code path or DOM-tampered call from sending `'owner'` or arbitrary strings. Added a synchronous validation step in the callable wrapper that throws `Invalid invitation role` before forwarding. Defense-in-depth: the CF must (and is assumed to) independently validate.
- **Driver-managed listener teardown (audit L3).** `firestoreDriver` now tracks every active `onProductChange` subscription in an internal `Set<Unsubscribe>` and exposes `tearDownListeners()`. `signOutCleanup` calls it after `cancelPendingSaves` and before `firebaseSignOut`, so listeners cannot fire `permission-denied` against a logged-out auth state and surface a misleading toast on the post-sign-out screen. The wrapped unsubscribers are idempotent — both `tearDownListeners()` and the consumer's React-effect-cleanup path remove the same listener exactly once. New no-op implementation in the local driver. New tests verify the call-order (`cancelPendingSaves` → `tearDownListeners` → `firebaseSignOut`) and the local-driver no-op shape.
- **Resend-cap dual-layer documentation (audit M3 — docs only).** No behavior change. `callables.ts` JSDoc now spells out that the 5/5 resend cap is enforced exclusively by the `resendInvite` Cloud Function, and that Firestore rules deny direct client writes to `spertsuite_invitations` (`allow write: if false`) so a UI bypass cannot increment `emailSendCount`. The matching `disabled={inv.emailSendCount >= 5}` site in `ProjectSharingPanel.tsx` gets a comment explaining "UX gate only — CF enforces" so a future maintainer doesn't strip the redundant check.

### Companion canonical-rules patch (Landing Page repo)
- **M4 — `spertstorymap_projects` field allowlist + payload size cap.** Adds `request.resource.data.keys().hasOnly([...])` to both `create` and `update` and a coarse `request.resource.data.size() < 900_000` guard on update. Same pattern as `spertscheduler_settings` (v0.22.2) and `users` (v0.22.2). See the Landing Page PR for the diff.

## Version 0.29.2 (2026-05-09)

Security audit hardening — Story Map app-side prerequisite for the suite-parity Firestore rules tightening landing in the Landing Page repo. No user-visible behavior change in production (the path under change is gated behind `INVITATIONS_ENABLED === false`, which is currently `true`).

### Security
- **Legacy single-add email lookup now bounded by `limit(1)` (audit L6/L7).** The flag-off "add member by email" form in `ProjectSharingPanel.tsx` previously issued an unbounded `query(collection(db, PROFILES_COL), where('email', '==', …))`. The companion canonical `firestore.rules` change restricts `spertstorymap_profiles` `list` permission to `request.query.limit <= 1` — matching the suite-wide pattern already in place for `spertahp_profiles` and `spertsuite_profiles` — to block bulk profile enumeration by any signed-in SPERT user. This commit adds `limit(1)` to the query so the legacy path remains rule-compliant if the feature flag is ever toggled. With `INVITATIONS_ENABLED = true` (current state) the legacy path is unreachable, so no production behavior change. Pairs with M5 (project create rule binds top-level `owner` to caller) in the same Landing Page rules patch.

## Version 0.29.1 (2026-05-09)

Maintenance refactor — no behavior change. Targeted decomposition of the Sharing panel and a small batch of type-annotation and signature cleanups. All 510 tests remain green.

### Internal
- **`InvitationSection` extracted from `ProjectSharingPanel.tsx`.** The flag-on bulk-invitation subsystem (8 state hooks, the `listPendingInvites` effect, `handleSendInvitations` / `handleRevoke` / `handleResend`, and the revoke `ConfirmDialog`) is now a self-contained sub-component declared below `MemberRow` in the same file. The parent retains member-CRUD state and handlers (`handleAddMember`, `handleRemoveMember`, `handleRoleChange`), the members-loading effect, all render gates, and the legacy single-email-input form for the flag-off path. Communication contract: `InvitationSection` receives `productId`, `driver`, `ownerStatus`, `members`, `onMembersUpdate`, and `onOwnerStatusError`. The post-send members-refresh failure path still hides the panel — `onOwnerStatusError()` advances the parent's `ownerStatus` to `'error'`, identical observable behavior to the previous inline `setOwnerStatus('error')`. Invitation-flow errors are now displayed via a local `inviteError` state inside the section; the parent's `error` state continues to serve member-CRUD failures only.
- **Explicit generics on `useState(null)` calls.** `members` (`Record<string, string> | null`), `owner` (`string | null`), `error` (`string | null`) in `ProjectSharingPanel`; `profile` (`{ displayName?: string; email?: string } | null`) in `MemberRow`.
- **Type annotations in `mapMutations.ts`.** `let ribData: RibItem | null = null` in `moveRibBetweenBackbones`; `let backboneData: Backbone | null = null` in `moveBackboneToTheme`; `const ids = new Set<string>()` in `getColumnRibIds`. Added `Backbone` to the type import.
- **Collapsed `enrichProduct` redundant dual-parameter signature in `ProductList.tsx`.** Was `enrichProduct(entry, full)` always called as `enrichProduct(p, p)`; now `enrichProduct(product)` with a single argument.

## Version 0.29.0 (2026-05-09)

Bulk-sharing retrograde audit — six confirmed gaps closed across the sharing UI, callable wrapper layer, invitation landing hook, and banner shell. PR 1 (driver hardening, v0.28.0 → unreleased) landed `removeCollaborator` three-guard `runTransaction` and `onProductChange` `_owner` re-attach. This release ships the correctness + hygiene pass.

### Fixed
- **OwnerStatus four-state enum in the Sharing panel (Lesson 60).** `ProjectSharingPanel` previously used a nullable `owner` string with a derived `isOwner` boolean; transient Firestore read failures silently rendered nothing, so a network blip during the initial load made the entire Sharing section disappear with no signal to the user. Replaced with `OwnerStatus = 'loading' | 'owner' | 'not-owner' | 'error'`. The `'error'` branch now surfaces a visible "Couldn't load sharing details. Refresh the page to try again." message inside the optional Section wrapper. Non-cloud mode still short-circuits before the status branches; non-owners and the loading window still render nothing.
- **Post-send refresh uses `Promise.allSettled` (Lesson 64).** The members + pending-invites refresh after a successful bulk-invite send was sequential `await`s — a rejection in the second call lost the first call's update. Now both calls run concurrently via `Promise.allSettled`; a members-fetch rejection sets `ownerStatus = 'error'` so the user sees the visible message, and a pending-fetch rejection only logs (the success chips remain visible). Single refresh site — `handleRevoke` and `handleResend` are single-fetch and were not affected.
- **Bulk-invite textarea preserved when no address is delivered (Lesson 43).** v0.27.1 cleared the textarea on any CF-success response, which included the case where every valid address came back in `result.failed[]` (CF rate-limited, all already-invited, etc.) — the user had to re-type every address to retry. New predicate gates the clear on `added.length + invited.length > 0` — only an actual delivery resets the field.
- **Centralized `requireFunctions()` callable guard (Lesson 61).** The four lazy callable getters (`getSendInvitationEmail`, `getClaimPendingInvitations`, `getRevokeInvite`, `getResendInvite`) returned `null` when `functionsInstance` was unavailable; downstream `await` on a null produced the SDK's opaque `TypeError: Cannot read properties of null (reading 'name')`. Replaced with a new `src/lib/callables.ts` module exporting async wrappers (`callSendInvitationEmail`, `callClaimPendingInvitations`, `callRevokeInvite`, `callResendInvite`) that go through `requireFunctions()`, which throws a meaningful `'Firebase Functions not initialized.'` error. Callers' existing `.catch` handlers now see the canonical message uniformly. `functionsInstance` is exported from `firebase.ts` for the new module.
- **Lazy `useState` initializer in `useInvitationLanding` (Lesson 66).** React 19 flagged the previous `useState('idle')` + `setState`-in-effect restoral as a `react-hooks/set-state-in-effect` violation. Replaced with a lazy initializer that reads `SESSION_KEY` synchronously on first render, eliminating the double-render on fresh page load with an invite token. Effect 1 (URL capture, strip, sessionStorage write, mode flip) cannot collapse — it performs DOM and storage side effects — and remains. Effect 2 narrowed to handle the `firebaseAvailable=false→true` async transition only. Canonical patterns A3 (SESSION_KEY gate, Effect 3), A4 (30-second grace timer, Effect 4), and `dismiss()` are unchanged.
- **InvitationBanner compact card width (Lesson 56).** Inner content wrapper changed from `max-w-4xl` (1024px strip) to `max-w-lg` (512px primary-CTA card). The outer color strip stays full-width by design. Both `pre_auth` and `claimed` render paths flow through the same shell.
- **`handleRemoveMember` surfaces the driver's guard messages (paired with PR 1 / Lesson 50).** PR 1 added the three-guard `runTransaction` to `removeCollaborator` and re-throws guard errors; this release replaces the generic "Failed to remove member. Please try again." catch with `err.message`, so users now see "Cannot remove yourself from a project.", "Cannot remove the project owner.", or "Only the project owner can remove members." directly.

### Internal
- New `src/lib/callables.ts` (Lesson 61): four async wrappers + `requireFunctions()` guard. Story Map has no voting model, so there is no `callUpdateInvite`.
- `src/lib/firebase.ts` exports `functionsInstance` and no longer exports the four `getXxx` factories. The `httpsCallable` import and the four invitation type imports moved to `callables.ts`.
- Test mocks updated in `migration.test.ts`, `storageDriver.test.ts`, `signOutCleanup.test.ts`: dropped the four `getXxx: vi.fn(() => null)` lines; added `functionsInstance: null` to the firebase mock; added a `vi.mock('../lib/callables')` factory with rejecting wrappers for module resolution.
- F4 ↔ A8 parity: `loadProductIndex` now uses `data.owner ?? null` for the same field shape as the new `onProductChange` re-attach.

## Version 0.28.0 (2026-05-07)

Project tile actions get a visual refresh, and Share lands as a cloud-mode owner-only affordance — extending the just-merged owner-gating audit (CFD v0.10.2, Forecaster v0.27.1) to Story Map.

### Added
- **Share icon on the Projects homepage**, visible only when the user is in cloud mode AND owns the project. Opens a new `ShareDialog` modal that reuses the existing sharing logic (members list, bulk email invitations, pending-invitation management) without duplication. Editors and viewers don't see the Share affordance — consistent with GanttApp/CFD/Forecaster.
- **`src/components/settings/ProjectSharingPanel.tsx`** — extracted from `SharingSection.tsx`. All sharing logic, state, effects, handlers, and JSX moved verbatim into this new component, plus a `withSectionWrapper` prop that controls whether the `<Section title="Sharing">` heading is rendered. The early-return guard for non-owners fires before any wrapper is constructed, so non-owners never see an empty "Sharing" header card. SharingSection (Settings page) sets `withSectionWrapper`; ShareDialog (homepage modal) doesn't, so its body has no nested heading.
- **`src/components/product/ShareDialog.tsx`** — thin modal wrapper around `ProjectSharingPanel`. Uses the existing `Modal` component with `wide` and renders the project name as a subtitle below the modal header.

### Changed
- **Project tile action buttons: text → SVG icons (16×16)**. `src/components/product/ProjectCard.tsx` replaces three `group-hover:opacity-100` text buttons (Export, Duplicate, Delete) with always-visible icon buttons. Final left-to-right order: Share, Export, Duplicate, Delete. Each is gray by default and color-tinted on hover (Share: blue, Export: emerald, Duplicate: violet, Delete: red). Tile no longer requires a hover to expose its actions, matching the CFD/Forecaster project-tile pattern.
- **`SharingSection.tsx` collapsed to a one-line passthrough** — `<ProjectSharingPanel productId={productId} withSectionWrapper />`. All logic now lives in the extracted panel; `SharingSection` is preserved as the import name `SettingsView` already uses.
- **`Modal.tsx` is now stack-aware.** A module-level `openModalCount` plus a per-instance `myDepth` ensures Escape closes only the topmost modal and body-scroll lock is released only when the last modal closes. This fixes the cascade and scroll-restoration race that the new ShareDialog would otherwise expose by nesting a `ConfirmDialog` (Revoke confirmation) inside its outer `Modal`. The existing `ConfirmDialog` consumer inherits the fix automatically — no callsite changes.

### Internal
- `useEffect` in Modal: two effects (body-overflow + Escape listener) consolidated into one stack-aware effect. Behavior preserved for the single-modal case; nesting now works correctly.
- `MemberRow` component and `MemberRowProps` interface relocated from `SharingSection.tsx` to `ProjectSharingPanel.tsx`.
- `appId: 'spertstorymap'` literal in `getSendInvitationEmail` preserved verbatim through the extraction (Lesson 15).

## Version 0.27.1 (2026-05-06)

Two bulk-invitation UX fixes surfaced by first-day production use.

### Fixed
- **Invalid email addresses in the bulk textarea are now reported.** Previously, a malformed address like `yourmama@gmailcom` (missing dot before `com`) was silently filtered out client-side before the Cloud Function call, so the user saw no signal it had been dropped. The result chip set now includes a red "Skipped: <addr> (invalid-format)" entry for each malformed token, alongside the existing CF-side failure reasons (`already-invited`, `already-member`, etc.). If the entire input is invalid, the CF is not called at all and only the format errors are shown.
- **Bulk-invite textarea now clears on a successful send.** Previously, all addresses (including the ones that just succeeded) stayed in the textarea, leaving the user unsure whether re-clicking Send would re-dispatch them. The textarea now empties on a successful send response; result chips remain visible until the user types into the empty textarea (matching the existing chip-clear-on-edit behavior).

### Internal
- `parseBulkEmails` signature changed from `(string) => string[]` to `(string) => { valid: string[]; invalid: string[] }`. Sole consumer (`SharingSection`) updated. Tests expanded from 13 to 16 cases covering the dedup/lowercase behavior on both sides of the split.

## Version 0.27.0 (2026-05-06)

Bulk Email Invitations — feature flag off in this release. The full implementation lands behind `INVITATIONS_ENABLED = false`; cross-app profile infrastructure activates immediately on merge. A subsequent single-line ship-gate commit flips the flag once the Landing Page PR deploys.

### New feature (INVITATIONS_ENABLED = false — not yet active)
- **Bulk invitations.** Project owners can invite multiple collaborators by email in one operation. Existing SPERT Suite users are added immediately; others receive an invitation email and are added automatically when they sign in.
- **Pending invitations panel.** Project Settings → Sharing now shows outstanding invitations with Resend (up to 5×) and Revoke actions, gated by a confirmation dialog for revoke.
- **Invitation landing banner.** When a user navigates from an invitation email link, a banner appears prompting sign-in (with Google / Microsoft buttons and ToS consent gate), then transitions to a success confirmation when the claim resolves. Auto-flips storage mode to cloud only when the user has zero local projects (Lesson 28 guard).

### Active in this release regardless of invitation flag
- **Suite-wide `spertsuite_profiles` dual-write** added to AuthProvider. Every sign-in now populates the cross-app profile required for invitation email lookup, alongside the existing per-app `spertstorymap_profiles` write.
- **Display-name normalization fix.** Microsoft Entra ID "Last, First" displayName format now correctly becomes "First Last" in profile writes and all display contexts. Multi-part names (e.g., "Smith, Jane Ann") are also correctly handled. Implementation delegates to a new `denormalizeLastFirst` helper that mirrors the canonical Cloud Functions implementation in the Landing Page repo (`functions/src/mailHeaders.ts`).
- **`photoURL`** included in all profile writes.
- **Profile email stored lowercased** for cross-app lookup consistency.
- **Profile timestamp renamed** from `lastLogin` to `updatedAt`.
- **Removing a project collaborator** now routes through the `StorageDriver` interface (`driver.removeCollaborator`) instead of writing directly to Firestore.

### Internal refactors (no UX change)
- `sanitizeForFirestore` extracted from `firestoreDriver.ts` into a new `firestoreUtils.ts` module so it can be shared with AuthProvider's profile writes without circular imports.
- `GoogleIcon` / `MicrosoftIcon` extracted to `src/components/auth/AuthProviderLogos.tsx` and shared between StorageSection and InvitationBanner.
- New `useSignInWithTosGate` hook captures the consent-gate sign-in flow that StorageSection had inlined; InvitationBanner reuses it.
- New `useInvitationLanding` hook owns the invite-token capture, URL stripping, mode flip, and claim-event listener.

### Tests
- New pure-function tests for `parseBulkEmails`, `mapInvitationError`, and `denormalizeLastFirst` (38 new assertions across 2 files). Hook and component tests for `useInvitationLanding` and `InvitationBanner` are deferred to a follow-up chore PR — they require `jsdom` + `@testing-library/react`.

## Version 0.26.4 (2026-05-03)

Form-hygiene cleanup — silences Chrome DevTools Issues warnings around `id`/`name` on form fields and `<label>` association.

### Fixed
- **All form fields now carry a `name` attribute.** 35 inputs / textareas / selects across 21 files lacked any `id` or `name`, triggering Chrome's "form field element should have an id or name attribute" warning. Each field now has a stable, semantic `name` (e.g. `projectName`, `ribName`, `releaseName`, `sprintAssessmentNote`). No real `<form>` elements wrap these inputs — React owns state directly — so the names are purely advisory; reusing the same name across visually distinct inputs (e.g. `releaseName` in `ReleaseColumn`, `ReleaseDetailPanel`, and `ReleaseDivider`'s left + right labels) is intentional and harmless.
- **All standalone `<label>` elements now associate with their input.** 7 bare `<label>` tags across `CreateProjectModal`, `CommentPanel`, `AppSettingsModal`, `SettingsView`, and the `Field` component (`Section.tsx`) gained `htmlFor` pointing at a `useId()`-generated stable id on the matching input. The `Field` component now accepts an optional `htmlFor` prop for callers that want explicit association — non-breaking; existing callers passing no `htmlFor` continue to render unchanged.

### Why this wasn't caught in v0.26.2
The previous patch's Category 3 sweep was scoped strictly to `autoComplete` attributes per the original prompt's rules, even though I had eyes on every field that lacks `name`/`id` while doing it. Adjacent form-hygiene warnings (id-or-name, label association) are separate Chrome DevTools rules and weren't in scope. Lesson logged: when fixing one class of form-hygiene warning, scan the same fields for the related ones.

## Version 0.26.3 (2026-05-03)

Insights tab console-warning cleanup.

### Fixed
- **Recharts `width(-1)/height(-1)` warning on Insights.** The Core vs Non-core pie chart was wrapping a fixed-size 160×160 container in `<ResponsiveContainer width="100%" height="100%">`. The percentage-string sizing forces Recharts to wait for its `ResizeObserver` to fire before it can compute dimensions, and during that one-frame window it logs a console warning with `-1` placeholders. Since the parent dimensions are already known and fixed, the `ResponsiveContainer` was redundant — replaced with a direct `<PieChart width={160} height={160}>`. Visual output is identical; warning is gone. The other three charts on the tab (`Sizing Distribution`, `Release Breakdown`, `Burn-up`) already pass numeric heights and were not affected.

## Version 0.26.2 (2026-05-03)

Three-category bug sweep — surfaces silent Firestore write failures on shared projects, hardens the real-time listener, and clears the one active browser warning on `<input type="email">`.

### Fixed
- **Sharing errors are no longer silent.** `Remove member` and `Change role` failures in `SharingSection` previously logged to console only. They now surface inline through the existing `setError(...)` UI that `Add member` already used — same red text below the add-member input, identical pattern, no new infrastructure. Both handlers also clear stale errors at the top of the call.
- **`onSnapshot` listener has an error callback.** The single `onProductChange` subscription in `firestoreDriver.ts` was passing only a success callback. A permission-denied or sustained network drop on the live-sync stream would have thrown unhandled. Added the third-arg error handler — logs to console using the same shape as `handleWriteError`, and invokes the driver-level `_onSaveError` callback so the existing red save-error banner in `ProductLayout` covers a sync interruption with the same surface as a write failure.
- **`<input type="email">` warning silenced.** The email-entry input in `SharingSection` for adding collaborators now carries `autoComplete="off"` — Chrome flags `type="email"` without `autoComplete` unconditionally. The field collects another user's email (for sharing), never the signed-in user's own credential, so `"off"` is the right value.

### Hygiene
- **Export Attribution Name field carries `autoComplete="name"`.** The `Name` input in App Settings → Export Attribution is the user's own name (per `CLAUDE.md`, students fill in their own name and identifier before exporting). Adding `autoComplete="name"` enables browser autofill suggestions on a field whose semantics match the standard `name` token. Preemptive only — `type="text"` is not browser-flagged when `autoComplete` is missing.

### Out of scope
- `AuthProvider` profile upsert and `tosHelpers.writeTosAcceptance` errors remain console-only. They run inside `onAuthStateChanged` before any product page mounts; the existing banner is per-route and `ProductList` does not subscribe to `onSaveError`. Wiring them in would require a new global notification surface, which is explicitly deferred.
- The Identifier field in Export Attribution (placeholder `"e.g., student ID, email, or team name"`) intentionally does not get an `autoComplete` value — the field accepts mixed personal-identifier formats and the prompt's hygiene rules name this exact case as a skip.

## Version 0.26.1 (2026-04-30)

Branding polish — replaces the default Vite SVG favicon with the SPERT Story Map indigo mark and surfaces the icon in both header surfaces.

### Added
- **Branded favicon.** New `public/spert-favicon-storymap.png` (192×192, indigo `#4f46e5` panels with rounded corners) replaces the Vite SVG placeholder in the browser tab.
- **Dark-mode favicon variant.** `public/spert-favicon-storymap-dark.png` swaps the source PNG's near-black center pixels (`R<20 & G<20 & B<20 & A>200`) for charcoal `#2a2a2a` so the icon stays legible against dark backgrounds.
- **Header icon on the homepage.** `ProductList` now renders a 28×28 rounded icon immediately to the left of the `SPERT® Story Map` title. Source switches between light and dark variants based on `useDarkMode()`'s `isDark` flag — honors the user's explicit light/dark toggle, not just `prefers-color-scheme`.
- **Header icon on per-project pages.** `ProductLayout` adds a 24×24 rounded icon at the start of the top header (before the `← Projects` link) so branding stays consistent when drilling into a project.

### Internal
- No new runtime dependencies. Pillow-based dark-variant generation is a one-off dev script. No schema changes.

## Version 0.26.0 (2026-04-26)

Sizing tab becomes a self-sufficient triage surface: persisted filters, per-card kebab menu, and in-tab create / edit / split / delete. Five user-facing features plus shared infrastructure (kebab menu, modal, sessionStorage hook). Architecture decisions resolved up front in the implementation plan; gates ran clean after every step.

### Added
- **Filter persists across tab navigation.** The Sizing filter (themes, releases, hide-locked) now survives switching to Map / Releases / Settings and back. Stored in `sessionStorage` keyed by product ID — clears on browser refresh or tab close. A one-pass orphan strip in `SizingView` drops `themeIds` and `releaseIds` that no longer exist in the current product, so deleting a filtered theme in another tab self-heals on return.
- **+ Rib button in the Sizing overlay.** Sibling to the filter panel (not nested inside it, since the panel is collapsible). Opens a create modal with cascading theme → backbone → name selectors. Smart defaults frozen at click time: a single-theme filter pre-selects the theme; a single-backbone theme pre-selects the backbone; both pre-resolved and the selectors are hidden, leaving only the name field. Name is always required — the placeholder `"New Rib Item"` is never committed silently.
- **Edit from a per-card kebab menu (`⋮`).** Each Sizing card now exposes a kebab in the top-right with Edit / Split / Delete. Edit opens the same modal in edit mode, prefilled with current values, allowing changes to name, description, category, size, and notes. Release allocations are intentionally out of scope for this modal — manage those from the Releases tab.
- **Split a rib in place.** The Split action creates a new sibling rib in the same backbone. Naming follows a `(N)` suffix convention with collision avoidance: scans all siblings sharing the same prefix and uses `max(existing N) + 1`. Splitting `"Foo"` produces `"Foo (1)"` + `"Foo (2)"`; splitting `"Foo (1)"` while `"Foo (2)"` already exists produces `"Foo (3)"`, never a duplicate. New rib starts fresh — `size: null`, no allocations, no progress, copied category, cleared description and notes. Inserted into the parent backbone immediately after the original; `sizingCardOrder['unsized']` updated to keep the two adjacent in the unsized zone.
- **Delete from the kebab.** Confirmation dialog with the rib's name in the prompt. Standard recovery path is Ctrl+Z — no toast, no soft-delete. Existing `deleteRib` mutation already cleans `sizingCardOrder` and `releaseCardOrder` for the deleted ID.
- **Locked-card editing with size protection.** Cards with `percentComplete > 0` are considered locked. The Edit modal disables size editing for locked cards (rendered as a static badge with `"Size locked: progress recorded"` tooltip) so historical points-vs-progress math is preserved. Name, description, category, and notes remain editable. Split and Delete are still available on locked cards.
- **Unsaved-changes protection on the modal.** Closing via X, Cancel, Escape, or backdrop click while the form has unsaved changes now shows an in-modal prompt: Keep editing / Discard changes / Save. Save is disabled (with explanation tooltip) when required fields are missing in create mode.

### Changed
- **`ChangeLogOp` extended with `'split'`.** The audit-log entry for a split rib uses `op: 'split'` with `source` holding the originating rib's ID, symmetric with how `'duplicate'` records the originating product's ID at `storage.ts:305`. Distinguishing splits from generic adds is useful for the academic-integrity audit trail.
- **Rib hover tooltips no longer leak through modals.** Tooltip portal z-index dropped from `z-[9999]` to `z-40`, so the Modal's `z-50` backdrop now correctly covers any leftover tooltips. Additionally, when a card's kebab opens, the card's own tooltip is dismissed proactively, so it never persists into the menu / modal flow regardless of pointer-event timing.
- **`NOTES_MAX = 2000` exported from `src/lib/constants.ts`.** Previously a file-local constant in `RibDetailPanel.tsx`; now imported from the shared module by both `RibDetailPanel.tsx` and the new `SizingRibModal.tsx`. The validation-layer `MAX_MEMO` in `validateProduct.ts` is left intact — it's a broader cap covering description, allocation memo, and progress comments, distinct concern.

### Internal
- **`src/hooks/useSessionState.ts`** — generic `useSessionState<T>(key, defaultValue)` hook plus pure `readSessionValue` / `writeSessionValue` helpers. Hook composes the helpers; tests target the helpers directly so they run cleanly in the project's `node` test environment without a DOM.
- **`src/components/ui/KebabMenu.tsx`** — reusable kebab menu component. Trigger is `<button aria-haspopup="true" aria-expanded={…}>⋮</button>`. Popover renders via `ReactDOM.createPortal(…, document.body)` with `position: fixed` against the trigger's `getBoundingClientRect()` so it never inherits the Sizing canvas's `transform: scale()` zoom. Closes on outside click (capture-phase), Escape, scroll, resize, and focus loss. Full keyboard navigation: Enter/Space to open, Arrow keys to cycle enabled items, Enter to invoke, Escape to close and return focus to trigger, Tab to close-and-advance. ARIA roles `menu` / `menuitem` and `aria-disabled` on disabled items.
- **`src/components/sizing/SizingRibModal.tsx`** — discriminated `mode: { kind: 'create' | 'edit' }` modal. Edit mode runs a defensive lookup against `product.themes → backboneItems → ribItems`; if the rib was deleted concurrently in another tab (cloud mode race), the modal closes silently via `onClose()` rather than rendering against a stale reference. Form state seeded via lazy `useState` initializers; parent passes a `key` that changes per target so each open gets fresh seed values without a reset effect. Initial-value snapshot for dirty detection uses lazy `useState` (not `useRef`) to comply with React 19's `react-hooks/refs` rule.
- **`useProductMutations` exposes `splitRib(themeId, backboneId, ribId): string` and `addNamedRib(themeId, backboneId, attrs): string`.** Both hook callbacks are thin wrappers that call new exported pure transformations `splitRibInProduct` and `addNamedRibToProduct`, allowing direct unit tests in the existing `node` test env without a React runtime. `addNamedRib` is atomic — one `updateProduct` call, one changelog entry, no `"New Rib Item"` placeholder flash that the old `addRib` + `updateRib` two-step pattern produced.
- **`SizingCell` interface extended with `themeId` and `backboneId`** (already populated by `useSizingLayout` enrichment; previously not declared in the public interface). Required by all four kebab actions to address the rib through `mutations.<op>(themeId, backboneId, ribId)`.
- **Locked-state size-omission lives in the caller, not the modal.** `SizingRibModal.onSave` always sends the full payload including `size`. `SizingView.handleEditSave` is the boundary that strips `size` from the `mutations.updateRib` call when `editingCell.locked === true`. Single source of truth for the rule, easy to inspect, easy to test.
- **SessionStorage key namespacing.** `sizing-filter:${product.id}` so per-project filters don't leak across projects in the same session.
- **Test coverage.** 30 new tests added (`useSessionState` × 8, `splitRib` × 11 including collision-avoidance cases, `addNamedRib` × 7, `SizingCell` cell-identity × 2, plus existing-deleteRib `sizingCardOrder` cleanup confirmation). Total suite: 473 tests, all green.

### Known follow-ups
- Component-render tests for `KebabMenu` and `SizingRibModal` were deferred — the project's test env is `node` with no jsdom or RTL. Both components are exercised end-to-end via integration with `SizingView` and manual verification. Adding `jsdom` + `@testing-library/react` as devDeps and backfilling these test files is a candidate for v0.26.1.

## Version 0.25.0 (2026-04-26)

Cloud Storage modal unification. Targeted UX refinement — no schema, provider, or driver changes.

### Changed
- **Unified chip click behavior across all three auth states.** Previously, clicking the storage status pill did three different things depending on state: cloud-signed-in opened an inline "Account" modal, signed-in-local opened a popover with "Switch to Cloud Storage" and "Sign Out" buttons, and signed-out opened App Settings. All three states now open the same Cloud Storage modal. Sign-out and storage-mode switching are reached through the modal's identity card, not through divergent chip behaviors.
- **Modal renamed from "App Settings" to "Cloud Storage".** Reflects the modal's actual primary purpose — managing storage mode, sign-in, and migration. Export Attribution and Notifications remain second-class sections within the same modal.
- **Identity card display name now normalized.** Microsoft Entra ID returns `displayName` as `"Last, First MI"`, which read awkwardly as the primary identity label. The card now shows `"First MI Last"` reading order. Google sign-ins (already in `"First Last"` order) pass through unchanged. Pulled from a new shared utility so the chip and the identity card always agree.
- **Voluntary popup-dismiss is now silent.** Closing the Google or Microsoft sign-in popup yourself (`auth/popup-closed-by-user`) no longer surfaces a "Sign-in was cancelled." message — the user explicitly dismissed the popup, so an error label was redundant. Popup-blocked and other auth errors still surface their recovery message.

### Added
- **"Keep using local storage" button (signed-in + local mode only).** When you sign in but have not yet switched to cloud storage, the modal now shows an outline button below the identity card that closes the modal without changing storage mode. Previously the only ways out without switching were ×, Esc, or backdrop click — discoverable, but not obvious. The button is intentionally hidden when already on cloud storage (Sign Out and the Local radio already cover that case).
- **Auto-close after sign-out.** Clicking the red "Sign out" link in the identity card now closes the Cloud Storage modal automatically once `signOutCleanup` resolves. The chip updates to the signed-out variant in place, no page reload.

### Internal
- New module `src/lib/userDisplay.ts` exports `normalizeDisplayName` (comma-detection swap for Microsoft `"Last, First MI"` format) and `getFirstName` (first token, falling back to email local-part). Replaces duplicated inline parsing that previously lived in both `StorageStatusPill` and `AccountPopoverLocal`.
- `StorageStatusPill` reduced to a pure visual component. All click handling collapses to a single `onClick` prop call — no internal modals, no inline popover, no `signOutCleanup` import, no refs. Three visual variants and the `onClick: () => void` interface are unchanged, so `ProductList` and `ProductLayout` need no updates.
- `AppSettingsModal` now passes `onClose` through to `StorageSection`, which uses it for both the new "Keep using local storage" button and post-sign-out auto-close. The prop is optional; `StorageSection` consumers that render it without a parent modal continue to work.
- `AccountPopoverLocal.tsx` deleted. Its functionality (display name + email + sign-out + switch-to-cloud) is now subsumed by the unified Cloud Storage modal.

### Test & lint baseline restored
The ship gate caught a backlog of pre-existing failures on `main` that had accumulated and were blocking clean releases. Fixed in this delta so v0.25.0 ships against a green baseline.
- `useSizingLayout` no longer crashes when a caller passes a `SizingFilter` without a `releaseIds` field. The interface still types `releaseIds` as required, but the runtime now guards with `(filter.releaseIds?.length ?? 0) > 0` to match how older test fixtures construct filters. Restores 6 sizing-layout tests.
- `computeLayout.test.ts` `totalWidth` assertions updated to include `RIGHT_LABEL_WIDTH`. The mirrored release-label column was added in v0.21 but the two affected expectations were not migrated. Restores 2 layout tests.
- `ReleaseDivider.tsx` destructures `useInlineEdit` and `useTooltip` returns at the top of the component to comply with the React 19 `react-hooks/refs` rule, which flags `someHook.refField` access during render. Behavior is identical; this is a zero-cost lint fix following the project's standing pattern.
- `useMapDrag.ts` adds `layout.releaseLanes` to the `handleDragMove` `useCallback` dep array — it is read inside the callback body via `buildReleaseMoveState` but was missing from the dep list. Resolves both `react-hooks/exhaustive-deps` and `react-hooks/preserve-manual-memoization`.
- `StoryMapView.tsx` removes the unused `handleAddRelease` from the `useMapHandlers` destructure (only `handleAddReleaseAfter` is wired to the canvas).

## Version 0.24.0 (2026-04-19)

Privacy and correctness bug-fix release. No new features, no schema changes, no Firestore rule changes.

### Fixed
- **Sign-out now clears local storage (privacy fix — critical).** Previously, `firebaseSignOut` was the entire sign-out implementation, leaving `rp_products_index`, `rp_product_*` keys, and `rp_app_preferences` (which holds the Export Attribution `exportName` / `exportId` fields) in localStorage. On a shared browser, a second user inheriting the same session would see the first user's local projects and, critically, export files stamped with the first user's identity. Sign-out now clears all of those keys. `rp_workspace_id` (the per-browser academic-integrity token) and non-sensitive UI preferences (`spert-theme`, `spert_firstRun_seen`, `spert_map_hint_dismissed`) are deliberately preserved.
- **Pending Firestore writes are canceled on sign-out (data-integrity fix — critical).** A 500ms-debounced save scheduled just before a sign-out click could fire after Firebase revoked credentials, producing either a spurious `PERMISSION_DENIED` error (surfaced to the just-signed-out user as a "Storage full" banner) or, in the revocation race window, a successful stale write committed to the user's cloud doc after they believed they had signed out. A new `cancelPendingSaves` method was added to the storage driver interface and both implementations; sign-out now invokes it as the first step of cleanup, before credentials are revoked.
- **Sign-out sequence is now correctly ordered.** The correct order is: (1) cancel pending writes, (2) clear local user data, (3) reset the persisted storage mode to `'local'`, (4) revoke the Firebase session. All sign-out paths — user-initiated from the pill popover, user-initiated from the Settings storage section, and automatic from the ToS-version mismatch branches in `AuthProvider` — now route through a single `signOutCleanup` helper and follow this order.
- **ToS-failure sign-out now resets storage mode (consistency fix).** The two branches in `AuthProvider` that sign a user out for ToS version mismatch or verification failure previously called `firebaseSignOut` but never called `switchMode('local')`. This left `spert-storage-mode` as `'cloud'` in localStorage. The new centralized cleanup helper writes `'local'` directly in this case so the state is consistent with user-initiated sign-out.
- **Cloud→Local mode switch no longer leaves the user on "Project not found".** Switching from Cloud to Local while viewing a cloud-only project swapped the driver to local, `loadProduct` returned `null`, and `ProductLayout` rendered a dead-end "Project not found" view. The Settings storage section now navigates to the project list (`/`) immediately after the cloud→local switch, and `ProductLayout` has a safety-net effect that redirects to `/` whenever the current product is unresolvable in local mode — covering any other path that might reach the same state.
- **Sign-in popup-blocked errors now show a recovery message (UX fix).** Previously, all sign-in errors except `auth/popup-closed-by-user` fell through to a generic "Sign-in failed. Please try again." message, giving users on popup-blocking browsers no recovery path. `auth/popup-blocked` and `auth/cancelled-popup-request` now show: "Your browser blocked the sign-in popup. Please allow popups for this site and try again." The error object is also now properly type-guarded instead of accessing `.code` on `unknown`. `signInWithRedirect` was intentionally not added in this release.
- **Pill now correctly reflects signed-in + local mode.** The `StorageStatusPill` previously had only two render branches: cloud-signed-in, or signed-out. A user who was signed in but had toggled storage mode to Local saw the signed-out pill displaying "Sign in", which was wrong — they were already signed in. A new third branch renders a split pill with avatar + first name on the left and a lock icon on the right, mirroring the cloud pill with the cloud icon replaced by a lock. Clicking opens a small popover with display name, email, a "Switch to Cloud Storage" button, and a Sign Out button.

### Internal
- New module `src/lib/signOutCleanup.ts` is now the single source of truth for sign-out cleanup. Every sign-out path calls it. No other file in the codebase calls `firebaseSignOut` directly.
- New component `src/components/ui/AccountPopoverLocal.tsx` backs the new signed-in + local pill state. It reuses the existing comma-detection / first-name extraction logic used for Microsoft `"Last, First"` displayNames.
- New `cancelPendingSaves` method on the `StorageDriver` interface. The local driver delegates to a new `cancelPendingSaves` export in `src/lib/storage.ts` that clears the shared debounce map without writing. The Firestore driver clears its `productTimer` and `prefsTimer` without invoking `doSaveProduct` / `doSavePrefs`.

## Version 0.23.9 (2026-04-10)

### Improved
- **Sign-in buttons in App Settings** now show Google and Microsoft brand icons with solid blue styling.

## Version 0.23.8 (2026-04-10)

### Fixed
- **First-run banner placement** — The ToS/Privacy Policy first-run banner now appears below the app header instead of above it, on both the home page and product views.

## Version 0.23.7 (2026-04-09)

### Improved
- **Unified click-to-logout auth chip** — The entire storage status pill is now a single clickable button. When signed into cloud storage, clicking anywhere on the chip (avatar, first name, or cloud icon) opens a lightweight Account modal showing the user's display name and email with a Sign Out button. Sign Out signs out of Firebase and switches back to local mode in place — no page reload, no detour through the Settings tab. The button shows "Signing out…" and is disabled during the await to prevent double-fire. When signed out, clicking the chip continues to open App Settings (unchanged).

## Version 0.23.6 (2026-04-05)

### Legal
- Updated Terms of Service and Privacy Policy to v04-05-2026
- Added SPERT® AHP to list of covered apps
- Updated effective date to April 5, 2026

## Version 0.23.5 (2026-04-05)

### Improved
- **Standardized auth chip (Option C split pill)** — Replaced the colored storage status pill with a split pill design matching the SPERT Suite standard. Signed-in cloud mode shows a 26px avatar circle with first initial (white on `#0070f3`) + first name, a vertical divider, and a cloud icon button that opens Settings. Local/signed-out mode shows a lock icon + "Local only" with a "Sign in" action in the right segment. Uses `#0070f3` suite-standard blue across all states. Dark mode supported.

## Version 0.23.4 (2026-04-05)

### Added
- **Storage status pill in header** — A pill-shaped indicator now appears in the upper-right corner of both the home page and per-project headers showing the current storage mode and sign-in state. Local mode shows a gray "Local" pill with a database icon. Cloud mode shows a blue pill with the user's initial, display name, and cloud icon. Cloud mode without sign-in shows an amber "Sign in" pill. Clicking the pill opens App Settings. Matches the pattern used in GanttApp, MyScrumBudget, and SPERT Forecaster.

## Version 0.23.3 (2026-04-02)

### Added
- **Export All Projects button** — New "Export All Projects" button on the home page (between Import and Load Sample) downloads every project as a single bundled JSON file named `spert-story-map-<datetime>.json`. Disabled when no projects exist.

### Improved
- **localStorage warning banner revamp** — The startup caution banner for local-storage users now reads: "**Your data exists only in this browser** and can be lost without warning. Export at the end of every session to protect your work." Banner initializes hidden and appears only after preferences load, preventing a flash for users who have suppressed it.
- **Suppress warning toggle in App Settings** — New "Notifications" section in App Settings with a "Warn me on startup when using local storage" toggle. Default: on. Toggling it off persists `suppressLocalStorageWarning` in preferences so the banner stays hidden across sessions. The session-dismiss (× button) behavior is unchanged.
- **Standardized export filenames** — All JSON exports now use the `spert-story-map-<project-name>-<datetime>.json` naming convention for consistency and easier identification.

## Version 0.23.2 (2026-04-01)

### Improved
- **Whole-card drag on Sizing tab** — Sizing cards can now be grabbed and dragged from anywhere on the card, not just the small grip handle. The grip icon is removed; unlocked cards show a grab cursor on hover. Locked cards remain non-draggable.
- **Core/Non-core toggle in Allocation Modal** — The category (Core / Non-core) can now be changed directly in the allocation modal on the Release Planning tab. Previously it was display-only in that modal.
- **License footer link** — Added a License link to the footer (Terms of Service | Privacy Policy | License) pointing to the GitHub LICENSE file, matching SPERT Scheduler.

## Version 0.23.1 (2026-04-01)

### Added
- **Contextual hover "+ Rib" buttons on Story Map** — An invisible `+ Rib` button appears on hover below the last rib card in each column×release lane, wherever there is gap space. Clicking it in a release lane creates a new rib with 100% allocation to that release. In the Unassigned lane, creates an unallocated rib. Buttons only appear when there is visual room below the last card (not in the tallest column), and never in empty cells. Hidden during drag operations.

## Version 0.23.0 (2026-04-01)

### Added
- **Mirrored release labels on Story Map** — Release names now appear on both the left and right edges of the map, so you never lose lane context when scrolling a wide map. Both labels are editable via double-click.
- **Release add/delete on Story Map** — `+ Release` and `×` delete buttons at the bottom of each release lane on both sides. `+ Release` inserts after that release. Delete is blocked (with tooltip) when the release has rib items allocated to it.
- **Drag-to-reorder releases on Story Map** — Grab handle (`⠿`) next to each release label on both sides. Drag vertically to reorder release lanes with a blue insertion line showing the drop position. The Unassigned lane stays anchored at the bottom.

### Removed
- Removed the `+ Release` button from the Unassigned lane (redundant now that each release has its own `+ Release` at the bottom).
- Removed the far-right `+ Release` buttons on release divider lines (replaced by the per-lane bottom buttons).

## Version 0.22.2 (2026-04-01)

### Added
- **Release filter on Sizing tab** — The sizing filter panel now includes release chips alongside the existing theme filter. Select one or more releases to show only ribs allocated to those releases. Unallocated ribs are hidden when any release filter is active. Filter badge count reflects all active filters (themes + releases + hide completed).

## Version 0.22.1 (2026-04-01)

### Improved
- **Two-line rib names on Sizing tab** — Sizing cards now display up to two lines of the rib item name (matching the Map tab), replacing single-line truncation. Card height increased from 52px to 68px to accommodate the extra line.

## Version 0.22.0 (2026-03-31)

### Improved
- **Per-theme "Add Backbone" button on Story Map** — Each theme header now has a `+` button that adds a new backbone directly to that theme. Previously, the only way to add a backbone was via the global `+ Backbone` button at the far right of the map (which always targets the last theme), requiring a drag to reposition it under the correct theme. The global button is still available as a shortcut.

## Version 0.21.1 (2026-03-31)

### Maintenance
- Updated Terms of Service and Privacy Policy to v03-31-2026
- Updated canonical legal document URLs to spertsuite.com
- Updated consent UI text to SPERT® Suite branding

## Version 0.21.0 (2026-03-30)

### Added
- **Excel export** — Export any project to a formatted `.xlsx` file from Settings → Data. Generates a two-sheet workbook: **Rib Items** (Theme, Backbone, Rib Item, Category, Size, Points, % Complete, Release(s), Notes — one row per rib item, preceded by a color-coded theme group header row) and **Release Summary** (Release, Total Points, % Complete, Core Points, Non-Core Points, Target Date — one row per release sorted by order). % Complete cells are conditionally filled: light green at 100%, light yellow for partial progress. Theme group header rows are filled with the theme's color tint. Both header rows are frozen. Notes column (width 80) uses wrap text with top alignment. ExcelJS is loaded via dynamic import so it does not affect initial bundle size.

## Version 0.20.0 (2026-03-30)

### Added
- **Sizing filter panel** — Filter the sizing board by theme and/or completion status. A collapsible filter panel sits below the zoom controls with two controls: theme chips (multi-select; all unselected = show all) and a "Hide completed" toggle that excludes ribs with progress > 0%. The view auto-fits to the filtered card set when filters change. Filter state is ephemeral (not persisted).
- **MapCanvas overlay slot** — `MapCanvas` now accepts an optional `overlayControls` prop for view-specific controls that stack below the zoom bar via flexbox. Used by the sizing filter panel; available to any view that shares `MapCanvas`.

## Version 0.19.0 (2026-03-30)

### Added
- **Rib item notes** — Free-form notes field (up to 2,000 characters) on rib items. Click any rib card on the Story Map to open the detail panel; a Notes section at the bottom supports multi-line text for requirements, acceptance criteria, reference content, or any other per-item context. Notes save automatically on blur. Character counter turns amber at 1,800 and red at 2,000 characters.

### Improved
- **Rib card text wrapping** — Rib item names on the Story Map now wrap up to 2 lines (ellipsis after line 2) instead of truncating at 1 line. Card height increased from 52px to 68px. All cards remain a fixed height so columns stay visually aligned regardless of name length.
- **Backbone header text wrapping** — Backbone names now wrap up to 2 lines (ellipsis after line 2) instead of truncating at 1 line. Header height increased from 28px to 40px.
- **+ Rib auto-open** — Clicking **+ Rib** now immediately opens the detail panel with the name field focused and pre-selected, so the user can type the new item name directly without additional clicks.

### Fixed
- **Right-click no longer triggers panning** — Map panning now responds to left-click only; right-click and middle-click are ignored.
- **Browser context menu suppressed on map canvas** — Right-clicking the Story Map background no longer shows the OS context menu.
- **Text selection during pan eliminated** — Backbone names, theme labels, and rib text can no longer be accidentally highlighted while dragging to pan the map.
- **Grabbing cursor during background pan** — The cursor now correctly shows a closed-hand (`grabbing`) while actively panning the map background, not only during card drags.
- **Pan/zoom discoverability hint** — A subtle "Drag to pan · Scroll to zoom" hint appears in the bottom-left corner of the Story Map for new users. It auto-dismisses after the first successful pan or can be closed with ×. Dismissal is persisted to localStorage.

## Version 0.18.0 (2026-03-22)

### Changed
- **Full TypeScript migration** — Migrated entire codebase from JavaScript/JSX to TypeScript/TSX. All 104 source files (85 source + 18 tests + 1 new types module) are now strictly typed with zero `any` workarounds that lack justification. Brings SPERT Story Map into consistency with the other five apps in the Statistical PERT Suite.
- **TypeScript infrastructure** — Added `tsconfig.json` (project references), `tsconfig.app.json` (strict mode, ES2020, react-jsx, bundler resolution), and `tsconfig.node.json`. Renamed `vite.config.js` → `vite.config.ts` and `eslint.config.js` → `eslint.config.ts`.
- **Centralized domain types** — New `src/types/index.ts` with 28 type/interface definitions covering the full data model: `Product`, `Theme`, `Backbone`, `RibItem`, `Release`, `Sprint`, `SizeMapping`, `ProgressEntry`, `ReleaseAllocation`, `ChangeLogEntry`, `StorageDriver`, `OutletContextValue`, and more.
- **ESLint TypeScript integration** — Switched to unified `typescript-eslint` package with `tseslint.config()`. Removed redundant individual `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` packages.
- **Entry point** — Updated `index.html` script src from `main.jsx` to `main.tsx`.

### Added
- `typescript`, `typescript-eslint`, `@types/node` dev dependencies
- `src/types/index.ts` — centralized domain type definitions
- `OutletContextValue` type shared between `ProductLayout` and all page views via `useOutletContext<OutletContextValue>()`
- Drag state interfaces (`RibDragState`, `BackboneDragState`, `ThemeDragState`, `LayoutCell`, `Column`, `ThemeSpan`) in `mapDragHelpers.ts`
- `UpdateProduct` type alias used consistently across hooks and mutation files
- Props interfaces for all 44 React components

### Hardened
- **Console error sanitization** — All 17 `console.error` call sites now sanitize error objects to `e.message` instead of logging raw Firebase/system error objects that could expose internal details
- **Import file type validation** — `readImportFile()` now checks `.json` file extension before reading, in addition to the existing UI-level `accept=".json"` filter
- **Closed `any` types** — Replaced migration-pragmatic `any` with proper types where clean replacements exist: `UserSettings` for preferences, `StorageDriver` for export driver, `Record<string, unknown>` for generic constraints, `unknown` for raw JSON parse returns
- **Intentional `any` documented** — All remaining `any` types have inline `--` comments explaining why they are necessary (Firestore heterogeneous data, complex layout/drag state objects)

### Removed
- All `.js` and `.jsx` source files (replaced by `.ts`/`.tsx`)
- `allowJs: true` and `checkJs: false` from `tsconfig.app.json` (migration complete)

## Version 0.17.4 (2026-03-16)

### Changed
- **First-run banner** — Updated notification text to clarify browsewrap agreement on app use and added linked Terms of Service and Privacy Policy references

## Version 0.17.3 (2026-03-11)

### Changed
- **Node 22 LTS pinning** — Added `engines` field (`>=22.12.0`) to `package.json` and `.nvmrc` for Vercel deployment targeting ahead of Node 20 EOL (April 30, 2026)

## Version 0.17.2 (2026-03-11)

### Fixed
- **AuthProvider ToS bypass** — Firestore error during returning-user ToS verification now correctly signs the user out instead of falling through and granting access without verified ToS acceptance
- **Import error message sanitization** — JSON parse errors no longer leak raw file content snippets to the UI; replaced with a generic format error message

### Hardened
- **Import validation** — Strengthened `validateProduct.js` schema validation:
  - Rib item `category` field now validates against enum (`"core"` | `"non-core"`) instead of accepting any string
  - Release and sprint `order` fields are clamped to 0–10,000 and floored to integers
  - `sprintCadenceWeeks` upper-bounded to 52 (was unbounded)
  - Changelog entry timestamps validated to positive range (0 < t < year 2100)
  - `releaseCardOrder` and `sizingCardOrder` strip `__proto__`, `constructor`, and `prototype` keys to prevent prototype pollution via crafted imports

## Version 0.17.1 (2026-03-11)

### Improved
- **Dependency updates** — Updated 9 packages to latest stable minor/patch versions within existing semver ranges
  - `react-router-dom` 7.13.0 → 7.13.1 (double-slash normalization fix)
  - `recharts` 3.7.0 → 3.8.0 (new axis scale hooks)
  - `firebase` 12.9.0 → 12.10.0 (bug fixes)
  - `tailwindcss` 4.1.18 → 4.2.1 (Oxide scanner performance improvements)
  - `@tailwindcss/vite` 4.1.18 → 4.2.1
  - `eslint` 9.39.3 → 9.39.4, `@eslint/js` 9.39.3 → 9.39.4
  - `eslint-plugin-react-refresh` 0.5.0 → 0.5.2
  - `globals` 17.3.0 → 17.4.0

## Version 0.17.0 (2026-03-11)

### Added
- **Terms of Service & Privacy Policy compliance** — Legal framework for Cloud Storage users
  - Persistent footer with Terms of Service and Privacy Policy links on all pages (browsewrap notice)
  - First-run informational banner for new visitors explaining that no account is required and Cloud Storage requires agreement
  - Clickwrap consent modal that intercepts Cloud Storage sign-in — users must agree to ToS and Privacy Policy before Firebase Authentication fires
  - Post-authentication Firestore write records acceptance with version, timestamp, auth provider, and originating app ID
  - Returning user verification on app load checks acceptance version; signs out users with outdated or missing acceptance
  - Firestore security rule for `users/{uid}` ToS acceptance records
  - Reference copies of legal documents in `/legal` directory
  - Updated README with legal document links

### Fixed
- **Pre-existing lint errors** — Resolved all ESLint warnings and errors across the codebase
  - Removed unused imports and variables in migration tests, ProgressRow, RibDetailPanel, MapContent, validateProduct
  - Fixed refs-during-render errors in ReleaseColumn by destructuring `useInlineEdit` and `useTooltip` return values
  - Prefixed unused destructured variables in firestoreDriver, removed unused params in storageDriver and useSizingDrag
  - Added missing `mode` dependency in ProductList useCallback
  - Suppressed unavoidable `set-state-in-effect` warnings in useProduct and StorageProvider (async data loading pattern)

## Version 0.16.5 (2026-03-09)

### Added
- **Copyright headers** — All source files now include a copyright and license notice header (96 files across `src/`, plus root config files and `index.html`)
- **LICENSE file** — Added GPL v3 license with author attribution block and Section 7 additional terms (attribution preservation and UI notice preservation)

## Version 0.16.4 (2026-03-09)

### Fixed
- **Structure view text overflow** — Long rib item names no longer bleed into adjacent columns (Size, Points, etc.) in the Structure table. Names now truncate properly within the Name column.

### Improved
- **Structure view width** — Widened from 768px to 1024px max width, giving the Name column ~256px more space to display long rib item names before truncation

## Version 0.16.3 (2026-03-09)

### Fixed
- **Cloud import silently fails** — Importing a project in cloud mode failed silently because Firestore security rules deny `getDoc` on non-existent documents (`resource.data` is null, so `isProjectMember` check fails). The collision check now catches this error and generates a new ID, matching the pattern used by the migration flow
- **Cloud import overwrites stale fields** — Importing a project over an existing cloud project now performs a full document overwrite instead of a merge, preventing stale fields (e.g., old `releaseCardOrder` or `sizingCardOrder`) from surviving the import and referencing deleted entities
- **Cloud import missing ownership** — Importing a new project (no collision) in cloud mode now correctly sets `owner` and `members` fields, preventing the imported project from being invisible in the project list
- **Stale debounced save after import** — `replaceProduct` now cancels any pending debounced save before writing, preventing a queued save of the old product data from overwriting the import
- **Preferences overwrite on re-migration** — Uploading local projects to cloud on re-sign-in no longer overwrites existing cloud preferences (e.g., `projectOrder`); local and cloud preferences are now merged

### Technical
- Added `replaceProduct(product)` to both storage drivers — cancels pending debounce, reads existing `owner`/`members`, then writes a full `setDoc` (no `merge: true`) to eliminate stale field retention on import
- `ProductList.handleImport` collision check wrapped in try/catch — on permission error (non-existent or inaccessible doc), generates a new UUID and creates the product, mirroring `migrateLocalToCloud` collision handling
- Changed `ProductList.handleImport` (no-collision path) from `saveProductImmediate` to `createProduct` to set ownership fields
- Changed `ProductList.confirmImport` and `DataSection.confirmImport` from `saveProductImmediate` to `replaceProduct`
- Changed `migrateLocalToCloud` preferences write from `setDoc` to `setDoc` with `merge: true`

## Version 0.16.2 (2026-03-09)

### Added
- **Quick Reference Guide** — Downloadable PDF overview of SPERT Story Map's features and workflow, available on the About page

### Improved
- **About page — Your Data & Security** — Updated to describe both local and cloud storage modes, replacing the previous local-only description
- **Theme toggle** — Icon now shows the current mode (sun = light, moon = dark, monitor = system) instead of the mode it would switch to. Adds a third "system default" option that follows the OS preference

## Version 0.16.1 (2026-03-08)

### Fixed
- **Cloud sync data guard** — Switching to cloud mode no longer silently hides local projects when the cloud account is empty. A warning banner now tells users to upload their local projects or switch back to local mode
- **Unsafe cloud mode switch** — Removed the "Skip" button that let users switch to cloud without uploading data, which stranded them with an empty project list. Cancel now stays in local mode
- **Cloud connectivity check** — Switching to cloud mode with no local projects now verifies Firestore is reachable before completing the switch, preventing users from being stranded in cloud mode when offline

## Version 0.16.0 (2026-03-04)

### Added
- **Incremental map rendering** — Story map now shows each element as soon as it's created. Themes appear immediately (even with no backbones), with inline `+ Backbone` buttons. Backbones appear with `+ Rib` buttons. Users can build the entire Theme → Backbone → Rib hierarchy directly from the Map tab without switching to Structure view
- **Empty theme placeholders** — Themes with no backbones render as placeholder slots in the layout, reserving space and displaying a `+ Backbone` button inside the theme's column area
- **Always-visible unassigned lane** — The unassigned lane and its `+ Release` button now render even when no rib items exist, so users can create releases directly from the Map tab during incremental map building
- **Full-bleed canvas views** — Map and Sizing tabs now use the full browser width on large monitors instead of being capped at 1600px. Other tabs retain the constrained layout for readability

### Improved
- **Editable rib detail panel** — Click a rib card on the Map to toggle category (Core / Non-core) and change t-shirt size directly from the slide-out panel, without switching to Structure view
- **Release label wrapping** — Long release names on the story map now wrap to multiple lines instead of truncating with an ellipsis

### Fixed
- **Invisible backbone headers** — Fixed `+ Rib` button overlapping backbone header text when a backbone had no rib items, making the backbone name unreadable

### Technical
- `computeLayout()` now emits placeholder `themeSpan` entries with `isEmpty: true` for themes with no backbones, advancing `colIdx` to preserve correct positioning of subsequent themes
- Rib placement loops changed from index-based iteration to `for (const col of columns)` to skip placeholder slots
- `MapContent` empty state guard changed from `themeSpans.length === 0` to `!themes?.length` so themes are visible immediately after creation
- `unassignedLane` is now always emitted by `computeLayout()` (not just when unassigned ribs exist), ensuring the `+ Release` button is always accessible
- `ProductLayout` conditionally removes `max-w-[1600px]` and hides footer for canvas views (Map, Sizing) via `isCanvasView` route detection
- 5 new tests for empty theme and always-present unassigned lane scenarios (397 total tests across 18 files)

## Version 0.15.2 (2026-02-22)

### Security
- **Import race condition fix** — `saveProductImmediate` is now awaited before page reload in DataSection, preventing potential data loss
- **Email enumeration prevention** — Member lookup error message changed to a generic response that doesn't reveal whether an email exists in the system
- **Dangling reference cleanup** — Import validation now strips release allocations and progress history entries that reference non-existent releases or sprints, instead of silently allowing them

## Version 0.15.1 (2026-02-22)

### Improved
- **Codebase refactoring** — Decomposed `ProductList.jsx` (418→321 lines) by extracting `CreateProjectModal` and `ProjectCard` components
- **Shared utilities** — Moved `formatRelativeTime` from `ProductLayout.jsx` to `formatDate.js` for reuse; consolidated duplicate `sanitize` function in `migration.js` with `sanitizeForFirestore` from `firestoreDriver.js`
- **New test coverage** — Added 8 tests for `parseDate` and `formatRelativeTime` (392 total tests)

### Fixed
- **Firestore date display** — All Firestore-sourced dates now use `formatDate()` helper (fixed `ReleaseColumn` and `ReleaseDetailPanel` showing raw ISO strings or "Invalid Date")

## Version 0.15.0 (2026-02-21)

### Changed
- **Cloud as source of truth** — Eliminated bidirectional migration to prevent data duplication. Cloud-to-local migration (`migrateCloudToLocal`) removed entirely. Switching from cloud to local is now a simple mode toggle with no data transfer.
- **Smart re-upload detection** — On re-sign-in, existing Firestore collision check skips products already in cloud (existence-based dedup). `_hasUploadedToCloud` boolean flag tracks whether user has uploaded before.
- **Post-upload cleanup** — After uploading local projects to cloud, users are offered the option to clear local copies to prevent stale data on future sign-ins.

### Added
- **Download All Projects as JSON** — New button in Storage settings (cloud mode) exports all cloud projects as individual JSON files for data portability.
- **`clearAllLocalProducts()`** — New storage helper that removes all local product data and index.
- **`exportAllProducts(driver)`** — Batch export all projects via the storage driver with staggered downloads.
- **ConfirmDialog enhancements** — Added `cancelLabel` and `onCancel` props for custom cancel button behavior.

## Version 0.14.3 (2026-02-21)

### Security
- **Firestore rules**: Added field-level protection preventing editors from modifying `owner`/`members` fields (privilege escalation fix)
- **Firestore rules**: Version-controlled `firestore.rules` and `firebase.json` added to repository
- **Import validation**: Comprehensive schema validation on import — checks types, string lengths, numeric ranges, strips unknown fields, enforces size limits (5 MB max)
- **Query filtering**: `loadProductIndex` and `migrateCloudToLocal` now use server-side `where()` filter instead of full collection scan
- **Error handling**: Import errors shown inline in UI instead of `alert()` (prevents information disclosure)
- **parseInt radix**: Fixed `parseInt` without radix in AllocationModal
- **Dependencies**: Fixed moderate `ajv` vulnerability via `npm audit fix`

## Version 0.14.2 (2026-02-21)

### Added
- **Drag-to-reorder projects** — Reorder projects on the homepage by dragging the grip handle (⠿). Order persists in preferences across sessions and syncs to cloud.

### Improved
- **Codebase refactoring** — Decomposed 5 large files into smaller, focused modules for better maintainability and token efficiency:
  - `ProgressTrackingView.jsx` (415→339 lines): Extracted `progressViewHelpers.js` (pure helper functions) and `ProgressHeader.jsx` (header bar component)
  - `SettingsView.jsx` (357→210 lines): Extracted `SizeMappingSection.jsx` and `DataSection.jsx`
  - `ReleasePlanningView.jsx` (356→176 lines): Extracted `useReleaseDrag.js` hook (all DnD state and handlers)
  - `storage.js` (365→282 lines): Extracted `importExport.js` (export/import/readImportFile)
  - `storageDriver.js` (327→96 lines): Extracted `firestoreDriver.js` (Firestore driver + helpers)
- **New test coverage** — Added 19 tests for `progressViewHelpers` and 8 tests for `sortByOrder` (353 total tests)
- **Cleanup** — Deleted 5 duplicate macOS Finder files, removed trailing blank lines

## Version 0.14.1 (2026-02-21)

### Improved
- **Global settings modal** — Storage mode and Export Attribution moved from per-project Settings to a global App Settings modal, accessible via gear icon on both the homepage and per-project header. These settings apply to all projects, not individual ones.
- **Per-project Settings cleanup** — Settings tab now shows only per-project configuration (name, description, sizes, releases, sprints, sharing, data import/export). Global settings removed to avoid confusion.

### Technical
- New `AppSettingsModal.jsx` component wrapping `StorageSection` + Export Attribution in a `Modal`
- Gear icon added to `ProductList.jsx` header and `ProductLayout.jsx` header
- `SettingsView.jsx` cleaned up: removed `StorageSection`, Export Attribution section, and related `prefs` state/`useEffect`/`updatePref`

## Version 0.14.0 (2026-02-21)

### Added
- **Firebase Cloud Integration** — Full Firestore cloud storage backend with real-time sync, replacing the skeleton driver from v0.13.0
- **Data migration** — Bidirectional local↔cloud migration with collision detection (skip if user already has project, generate new ID if belongs to someone else)
- **Project sharing** — Share cloud projects with other users by email; member management with owner/editor/viewer roles
- **Shared project badge** — Purple "Shared" badge on ProductList for projects owned by other users

### Fixed
- **Migration changelog bug** — `appendChangeLogEntry` returns a `_changeLog` array, not a product object; migration now correctly applies the returned array back to the product

### Technical
- `createFirestoreDriver(uid)` fully implemented: CRUD via `setDoc`/`getDoc`/`deleteDoc`, debounced saves (500ms product, 200ms prefs), real-time sync via `onSnapshot` with `hasPendingWrites` echo prevention
- Ownership safety: `saveProduct`/`saveProductImmediate` never include `owner`/`members`; new `createProduct` method sets ownership only during creation
- `sanitizeForFirestore()` recursively strips `undefined` values before Firestore writes
- New `migration.js` with `migrateLocalToCloud(uid)` and `migrateCloudToLocal(uid)` — collision-aware upload, owned-only download, changelog entries
- New `SharingSection.jsx` — reads/writes Firestore directly for member management, profile lookup by email
- `StorageSection` wired with real migration logic, progress indicators, result messages
- Fingerprinting adaptations: `createNewProduct`, `duplicateProduct`, `exportProduct` accept optional workspace ID override for cloud mode (Firebase UID vs localStorage UUID)
- Uniform `loadProductIndex` — both drivers return full product data, eliminating per-product `loadProduct` calls in ProductList
- 5 new tests (migration), 6 new tests (storage optional params), 326 total across 15 files

## Version 0.13.0 (2026-02-21)

### Added
- **Cloud storage architecture** — Storage abstraction layer with async driver interface supporting both localStorage and future Firestore backends
- **Authentication provider** — Firebase Auth integration with Google and Microsoft SSO (activated when Firebase environment variables are configured)
- **Storage provider** — Auth-aware storage context with mode switching (local/cloud), loading gate to prevent flash of stale data
- **Storage settings** — New section in Settings for toggling storage mode, signing in, and viewing account info (hidden when Firebase is not configured)

### Technical
- New `storageDriver.js` with `createLocalStorageDriver()` (async wrapper over localStorage) and `createFirestoreDriver()` (skeleton for v0.14.0)
- `AuthProvider` + `StorageProvider` context hierarchy wrapping the app
- `useProduct` hook refactored from synchronous init to async loading via driver, with cloud sync subscription support
- `ProductList` refactored to async loading via driver with mode-aware data warning
- `ProductLayout` uses driver for save error subscription
- `SettingsView` uses driver for preferences load/save and product import
- Extracted reusable `Section` and `Field` components to `src/components/ui/Section.jsx`
- 24 new tests for storage driver abstraction (321 total)

## Version 0.12.0 (2026-02-18)

### Added
- **Export attribution** — New section in Settings for attaching name and identifier to JSON exports for team workflow traceability
- **Workspace reconciliation tokens** — Exports include `_originRef` and `_storageRef` for cross-session data provenance tracking and localStorage hydration recovery
- **Export pipeline diagnostics** — Products maintain a lightweight `_changeLog` of structural operations for client-side telemetry

### Technical
- New localStorage key `rp_workspace_id` for deterministic workspace binding
- `_originRef` set at product creation, preserved across imports for data lineage
- `_storageRef` injected at export time from workspace token
- `appendChangeLogEntry()` utility with 500-entry cap
- Audit trail logging in `useProductMutations` (add/delete operations)

## Version 0.11.3 (2026-02-16)

### Fixed
- **Size picker truncation** — Size dropdown in Structure view was clipped by the theme card's `overflow-hidden`. Dropdown now renders via portal to `document.body` with viewport-aware positioning (flips above when near bottom edge)

### Added
- **Release rename on Release Planning** — Double-click a release column header to rename it inline. Uses the same `useInlineEdit` hook as the Story Map. Dragging remains on single-click; editing disables drag while active

## Version 0.11.2 (2026-02-15)

### Improved
- **Import warnings** — Both dashboard and Settings import now use a proper confirmation dialog instead of browser `confirm()`. Dashboard warns when overwriting an existing project by ID; Settings warns that all project data (themes, backbones, rib items, releases, sprints, progress history) will be permanently replaced
- **Import/export labeling** — Dashboard button renamed to "Import Project"; Settings button renamed to "Import Project from JSON" with a subtitle clarifying scope: "Export and import this project's data"

## Version 0.11.1 (2026-02-15)

### Fixed
- **Settings dark mode** — Description textarea was missing dark mode classes, appearing as a white box in dark theme

### Refactored
- **DRY mapMutations.js** (443 → ~310 LOC) — Extracted `transferAllocation`, `moveRibBetweenBackbones`, and `applyAllocationTransfer` helpers, eliminating 4× duplication of allocation-transfer logic across `moveRibToRelease`, `moveRib2D`, `moveRibs2D`, and `ReleasePlanningView`
- **Extracted GroupSummaryHeader** — Moved from inline definition in `ProgressTrackingView.jsx` to `src/components/progress/GroupSummaryHeader.jsx`
- **Extracted formatDate utility** — Moved to `src/lib/formatDate.js`, imported directly by `SprintSummaryCard`, `ProgressRow`, and `CommentPanel` instead of prop drilling through 3 layers
- **Unified stats computation** — Extracted `computeItemStats` in `calculations.js`, shared by `getThemeStats` and `getBackboneStats`
- **Improved formatDate** — Added `isNaN` guard for invalid date strings

### Technical
- New file: `src/lib/formatDate.js` — shared date formatting utility
- New file: `src/components/progress/GroupSummaryHeader.jsx` — extracted collapsible group header component
- New test file: `src/__tests__/formatDate.test.js` (4 tests)
- Added `transferAllocation` tests in `mapMutations.test.js` (5 tests)
- Added `computeItemStats` tests in `calculations.test.js` (2 tests)
- 281 tests total across 13 test files

## Version 0.11.0 (2026-02-15)

### Added
- **Export for SPERT Forecaster** — One-click export from Settings transforms Story Map data into the SPERT Release Forecaster's import format. Maps releases to milestones (incremental backlog sizes), computes per-sprint velocity via delta-percent math, and outputs a ready-to-import JSON file
- **Collapsible group summaries (Progress tab)** — Group headers now show item count, total points, % done, and a mini progress bar. Click to collapse/expand groups for focused scanning. Stats use allocation-weighted percent for release groups and item-weighted average for backbone/theme groups
- **Release column progress bars** — Release Planning tab column headers now display a progress bar with % complete for each release

### Technical
- New file: `src/lib/exportForForecaster.js` — pure transformation functions (`buildForecasterExport`, `downloadForecasterExport`) + date utilities
- New test file: `src/__tests__/exportForForecaster.test.js` (39 tests) covering milestones, sprint mapping, delta-percent velocity, edge cases, and full integration scenario
- `ProgressTrackingView.jsx` — Added `GroupSummaryHeader` component with `collapsedGroups` Set state (resets on groupBy/sprint change)
- `ReleaseColumn.jsx` — Added `ProgressBar` in column header (guarded by `stats.percentComplete !== undefined`)
- `ReleasePlanningView.jsx` — Passes `percentComplete` via `getReleasePercentComplete` in release stats
- `SettingsView.jsx` — Added emerald "Export for SPERT Forecaster" button
- 270 tests total across 12 test files

## Version 0.10.0 (2026-02-15)

### Added
- **User-selectable theme colors** — Click the color swatch next to a theme name in Structure view to choose from 8 colors (blue, teal, violet, rose, amber, emerald, indigo, orange). Colors apply to theme and backbone headers on the story map
- **Delete release in Release Planning** — Delete button on release column headers with same constraint as the Map tab (must move all items out first). Disabled state shows fast 200ms tooltip explaining why
- **Progress table improvements** — Sprint column values display with `%` suffix; Points column shows done/total fraction (e.g. `18/20`); "Target" column renamed to "Alloc" for clarity
- **Settings date labels** — Sprint dates labeled "Finish" and release dates labeled "Target" to clarify their purpose

### Fixed
- **Map rib card reorder** — Rib cards on the story map can now be reordered within a release lane and placed precisely when dragged across columns/releases. Fixed layout not respecting `releaseCardOrder`, per-column vs global index translation in card order mutations, and layout instability when `releaseCardOrder` was previously empty or sparse
- **Sizing board card placement** — Rib cards on the sizing board now land exactly where the insertion indicator shows. Added `sizingCardOrder` to persist ordering within size columns and the unsized zone; same-column reorders and cross-column moves both respect insertion position

### Refactored
- Decomposed `StructureView` (413→228 LOC) — extracted `BackboneSection` and `RibRow` into `src/components/structure/`
- Centralized theme color definitions in `src/lib/themeColors.js` — single source of truth for 8-color palette used across Structure view, story map headers, and backbone dots

### Technical
- New file: `src/lib/themeColors.js` — `THEME_COLOR_OPTIONS`, `getThemeColorClasses()`, `DEFAULT_THEME_COLOR_KEYS`
- New files: `src/components/structure/RibRow.jsx`, `src/components/structure/BackboneSection.jsx`
- `mapMutations.js` — Added `spliceCardOrderByColumn` and `getColumnRibIds` helpers for backbone-aware card order insertion
- `useMapLayout.js` — `computeLayout` now sorts cells by `releaseCardOrder`
- Added `themeColors.test.js` (9 tests) for color palette and fallback logic
- Added `reorderTheme` tests (5 tests) and rib drag placement tests (18 tests) in `mapMutations.test.js`
- Added end-to-end rib drag tests verifying full flow: computeLayout → computeInsertIndex → mutation → computeLayout → verify
- `useSizingLayout.js` — `computeSizingLayout` now sorts cells by `sizingCardOrder`
- `useSizingDrag.js` — Drag end commits both size change and card order in a single `updateProduct` call
- Added `sizingLayout.test.js` (7 tests) for sizing card order sorting and cell placement
- 231 tests total across 11 test files

## Version 0.9.0 (2026-02-14)

### Added
- **Dark mode** — Full dark mode support across all views, components, and charts with appropriate contrast ratios
- **Theme toggle** — Sun/moon icon button on the homepage and inside product views to switch between light and dark modes
- **System preference detection** — Defaults to the user's OS-level `prefers-color-scheme` setting on first visit
- **Theme persistence** — User's light/dark preference saved to localStorage and restored on subsequent visits
- **FOUC prevention** — Synchronous inline script in `<head>` applies the `.dark` class before React renders, preventing flash of unstyled content

### Technical
- Tailwind CSS 4 dark mode via `@custom-variant dark (&:where(.dark, .dark *))` with `.dark` class on `<html>`
- 2 new files: `src/hooks/useDarkMode.js`, `src/components/ui/ThemeToggle.jsx`
- 38 files updated with `dark:` Tailwind variants across all UI components, page views, and layout files
- Recharts components use conditional hex colors via `useDarkMode()` hook (grid, axis, tooltip, fill colors)

## Version 0.8.0 (2026-02-14)

### Added
- **Sizing View** — New tab for bulk-sizing rib items via drag-and-drop into t-shirt size columns (XS–XXXL). Unsized items live in a top grid zone; sized items stack in labeled columns with point values and count badges
- **Locked sizing cards** — Rib items with progress (in-progress or done) are visually dimmed and cannot be re-sized, preventing accidental changes to active work
- **Release management on Map** — `+ Release` buttons on each release divider and the unassigned lane; releases insert at the clicked position with correct ordering
- **Delete release on Map** — Single-click a release label to open the detail panel; "Delete Release" button is disabled while rib items are allocated (must move them out first), enabled when empty
- **Release detail panel on Map** — Single-click a release label to view progress, points breakdown, scope counts, and inline-edit the name (previously only accessible via code)
- **Inline release rename on Map** — Double-click a release label to rename it directly on the map (uses shared `useInlineEdit` hook)

### Fixed
- **Canvas panning under release labels** — Blank area below release label text no longer blocks panning (fixed with `pointer-events-none` container and `pointer-events-auto` on label only)
- **Consistent add-button styling** — All `+` buttons on the map (Theme, Backbone, Rib, Release) now use unified blue styling

### Technical
- 4 new files: `useSizingLayout.js`, `useSizingDrag.js`, `SizingContent.jsx`, `SizingView.jsx` in `src/components/sizing/` and `src/pages/`
- Sizing layout reuses `MapCanvas`, `DragGhost`, `forEachRib`, `getRibItemPoints`, `getRibItemPercentComplete`
- `addReleaseAfter(afterReleaseId)` mutation added to `useProductMutations` for positional release insertion
- `deleteReleaseFromProduct` from `settingsMutations.js` reused for map-based release deletion
- Click/double-click disambiguation on release labels (200ms timer pattern)

## Version 0.7.0 (2026-02-14)

### Added
- **Map CRUD** — Create and delete themes, backbones, and rib items directly on the story map without switching to the Structure tab
- **Delete with confirmation** — All × delete buttons (rib, backbone, theme) show a confirmation dialog before deleting; theme/backbone dialogs warn about cascading child deletion
- **Multi-select keyboard delete** — Shift+click to select multiple rib cards, then Delete/Backspace to remove all at once (no confirmation, undoable with Cmd/Ctrl+Z)
- **Add buttons on map** — `+ Theme` and `+ Backbone` buttons after the last column; `+ Rib` button at bottom of each backbone column
- **Backbone drag insertion bar** — Vertical blue line shows where backbone will be placed when dragging between positions
- **Theme drag-and-drop** — Grab handle on theme headers to reorder themes left/right with insertion indicator

### Fixed
- **Release lane labels** — Labels now use the shared `LANE_LABEL_WIDTH` constant (widened to 160px) instead of a hardcoded 106px that truncated release names
- **Rib card category label** — Changed "N-C" to "Non-Core" for clarity

### Refactored
- Centralized delete logic (`deleteTheme`, `deleteBackbone`, `deleteRib`, `deleteRibs`) in `useProductMutations` hook — StructureView now delegates to shared methods

## Version 0.6.0 (2026-02-14)

### Added
- **Error Boundary** — Wraps the app router; catches render crashes and shows a reload button instead of white-screening
- **Save flush on tab close** — `flushPendingSaves()` fires on `beforeunload`, preventing data loss from the 500ms debounce window
- **Storage quota awareness** — Red banner appears in ProductLayout when localStorage writes fail ("Storage full — export your data")

### Refactored
- Created `forEachRib` / `reduceRibs` utilities — replaces 12+ manual triple-nested loops across the codebase
- Rewrote 10 functions in `calculations.js` (458→320 LOC) using `reduceRibs`
- Extracted `ReleaseColumn` component from `ReleasePlanningView` (429→355 LOC)
- Decomposed `ProgressTrackingView` (606→395 LOC) — extracted `SprintSummaryCard`, `BurnUpChart`, and `ProgressRow` into `src/components/progress/`
- Extracted `CollapsibleSection` into reusable `src/components/ui/CollapsibleSection.jsx`
- Moved `addRelease` and `addSprint` into `useProductMutations` hook — eliminates duplication across 3 views
- Extracted `readImportFile()` shared utility to deduplicate file import in ProductList and SettingsView
- Extracted cascade deletion as pure functions in `src/lib/settingsMutations.js` (`deleteReleaseFromProduct`, `deleteSprintFromProduct`, `releaseHasAllocations`)
- Replaced manual stats loop in StructureView with `reduceRibs`

### Fixed
- **Map panning** — Switched from whitelist (`data-map-bg`) to blacklist approach so panning works when clicking release lane backgrounds, column dividers, and other non-interactive areas
- **2D rib drags** — Rib cards now move freely in both X (backbone) and Y (release) axes simultaneously using `moveRib2D`; removed axis-lock that restricted movement to one direction
- **Insertion indicator** — Wired up `InsertionIndicator` component and `insertIndex` computation so a blue line shows where cards will land during drag
- **Multi-select and bulk drag** — Shift+click to select multiple rib cards; drag any selected card's grip to move all selected items together via `moveRibs2D`; selected cards show blue ring highlight
- **Drag ghost** — Card-stack preview follows cursor during rib drags showing up to 3 names
- **Rib detail panel inline edit** — Click the rib name in the detail panel to rename it; Escape while editing cancels without closing the panel
- **Missing `onRenameRib` prop** — Restored the prop on `MapContent` so double-click rename on map rib cards works
- **Click event forwarding** — `RibCell` now passes the click event to the handler so Shift+click detection works
- `parseInt` calls missing radix parameter in SettingsView size mapping
- Sprint cadence input NaN fallback (empty input now defaults to 2 weeks)

### Technical
- Added `settingsMutations.test.js` (12 tests) for cascade deletion coverage
- Added `duplicateProduct` edge case tests (4 tests) in `storage.test.js`
- Added `getReleasePercentComplete` sprint history tests (4 tests) and `getSprintSummary` non-core breakdown tests (2 tests) in `calculations.test.js`
- Added `ribHelpers.test.js` (6 tests) for `forEachRib` / `reduceRibs`
- 156 tests total across 8 test files

## Version 0.5.0 (2026-02-14)

### Refactored
- Decomposed `ProgressTrackingView` (743→634 LOC) into `ProgressRow`, `SprintSummaryCard`, and `CollapsibleSection` sub-components
- Extracted `CommentPanel` into `src/components/progress/CommentPanel.jsx`
- Created `src/lib/progressMutations.js` — shared `updateProgress`, `removeProgress`, `updateComment` mutations eliminate triple-nested traversal duplication across views
- Shared `calculateNextSprintEndDate` helper replaces duplicated sprint date logic in ProgressTrackingView and SettingsView
- Extracted `spliceCardOrder` helper in `mapMutations.js` — consolidates 4 duplicated card-order splice patterns
- Added `moveRib2D` and `moveRibs2D` — atomic combined backbone + release move mutations for story map drag-and-drop

### Fixed
- Fixed setState-during-render bug in ProgressTrackingView comment draft initialization (replaced `setTimeout` with proper `useEffect`)

### Technical
- Added `progressMutations.test.js` test suite (15 tests); 128 tests total across 6 files
- Cleaned up 9 macOS "copy 2" duplicate files from storymap directory
- Added `.gitignore` pattern to prevent future macOS duplicates

## Version 0.4.0 (2026-02-14)

### Features
- **Interactive Story Map** — New visual story map tab with pan/zoom canvas showing themes, backbones, and rib items laid out in a 2D grid by release
- **Drag-and-drop on map** — Drag rib items between releases (Y-axis) and between backbones (X-axis) with position-aware drops; drag backbones between themes
- **Inline rename on map** — Click to rename themes and backbones directly on the story map headers
- **Rib detail panel** — Click a rib card to open a slide-out panel with size, category, allocation breakdown, progress, and click-to-edit name
- **Release detail panel** — Click a release label to view progress, points breakdown (total/core/non-core), scope counts, and inline-edit the release name
- **Undo/redo** — Ctrl+Z / Ctrl+Shift+Z (Cmd on Mac) with a 30-level in-memory snapshot stack for all map operations
- **Settings improvements** — Enhanced settings page layout and product list UX

### Bug Fixes
- **Map panning** — Fixed panning not working when clicking empty space inside the map (switched from whitelist to blacklist approach for interactive elements)
- **Release label click** — Fixed pointer capture swallowing clicks on release labels
- **Allocation modal** — UI refinements for release allocation editing

### Technical
- 14 new components in `src/components/storymap/` (MapCanvas, MapContent, RibCell, BackboneHeader, ThemeHeader, ReleaseDivider, UnassignedLane, DropHighlight, RibDetailPanel, ReleaseDetailPanel, useMapLayout, useMapDrag, useInlineEdit, mapMutations)
- Pointer-event-based drag system with axis detection and window-level event listeners
- `releaseCardOrder`-aware layout sorting for consistent card positioning
- 103 tests across 5 test files (calculations, layout, mutations, storage, product mutations)
- Vitest test runner added to project

## Version 0.3.0 (2026-02-13)

### Features
- **Per-release progress tracking** — Progress is now tracked per-release per-sprint instead of globally per-rib. Split-allocated items show separate rows for each release with target ceiling enforcement
- **Assessment notes** — Expandable rows in the progress table let teams capture reasoning for each sprint's progress assessment, with auto-timestamped history shown newest-first
- **Expand All / Collapse All** — Toggle button to open or close all comment panels at once for scanning notes across the board
- **Multi-expand** — Multiple rows can be expanded simultaneously (previously only one at a time)
- **Alphabetical sorting** — Progress table items sorted by backbone → rib name (release grouping) or rib name (backbone/theme grouping)
- **Allocation memo field** — Each release allocation line can carry a free-text memo

### Bug Fixes
- **Progress input clearing** — Clearing a sprint progress value now removes the entry entirely instead of writing 0, fixing broken delta calculations
- **Comment-preserving clear** — When clearing progress on a row with an assessment note, the note is preserved (progress set to 0 instead of deleting)

### Technical
- Schema version bumped to v2 with waterfall migration for legacy progress entries
- `progressHistory` entries now include optional `comment` and `updatedAt` fields
- `removeProgress` function for clean entry deletion
- `expandedRows` changed from single string to Set for multi-expand support
- Updated `ARCHITECTURE.md` and `CLAUDE.md` with new patterns

## Version 0.2.0 (2026-02-13)

### Features
- **About Page** — Purpose, data security, author info, GitHub link, license, and warranty disclaimer
- **App Branding** — Renamed to "SPERT® Story Map" with registered trademark symbol
- **Dismissible Warning** — localStorage warning banner can now be closed (reappears on next visit)

### Bug Fixes
- **Duplicate product** — `releaseCardOrder` now correctly remaps release and rib IDs
- **Progress history** — `getProgressOverTime` and `getReleaseProgressOverTime` now use `getRibItemPercentCompleteAsOf()` for correct sprint ordering
- **Delete cleanup** — Deleting ribs, backbones, themes, and releases now cleans stale IDs from `releaseCardOrder`
- **Progress input** — Clearing the sprint progress field now sets value to 0 instead of being ignored

### Technical
- Extracted `RibCard` and `AllocationModal` into `src/components/releases/`
- Created shared `useProductMutations` hook for DRY hierarchy updates
- Added documentation: `ARCHITECTURE.md`, `CLAUDE.md`, `CHANGELOG.md`
- Added footer with version link and changelog page (reads `CHANGELOG.md` at runtime)
- Removed unused `App.css` and `@dnd-kit` packages

## Version 0.1.0 (2026-02-13)

### Features
- **Story Map Structure** — Three-level hierarchy (Theme, Backbone, Rib Item) with inline editing, drag-to-reorder, and collapsible sections
- **Release Planning** — Kanban-style board with drag-and-drop assignment, split allocations across multiple releases, and column reordering
- **Progress Tracking** — Sprint-by-sprint progress entry with burn-up chart, release progress bars, and sprint-aware historical views
- **Insights Dashboard** — Project analytics with core/non-core breakdown, sizing distribution, release comparison charts, and attention items
- **Settings** — T-shirt size mapping, release management, sprint management, and JSON import/export
- **Product Management** — Create, duplicate, import/export, and delete products from a central home page
- **LocalStorage Persistence** — All data saved locally with debounced writes and immediate save for critical operations

### Technical
- React 19.2.4 with Vite 7.3.1 and Tailwind CSS 4.1.18
- Recharts 3.7.0 for data visualizations
- Native HTML5 drag-and-drop (no external DnD library)
- Pure calculation functions with sprint-aware progress computation
- Shared `useProductMutations` hook for DRY hierarchy updates
