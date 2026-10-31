# Review benchmark: Wachi, Pullfrog and CodeRabbit on kaipu-record's real bugs

- **Status:** proposed 2026-10-31. The bug catalogue exists; no benchmark repository has been
  created and no bug has been verified by hand yet. One side-by-side observation on a live PR is
  recorded below.
- **Date:** 2026-10-31
- **Creates:** no ADR.
- **Refs:** #43; [bug catalogue](../benchmark/kaipu-record-bug-catalogue.md)

## In one minute

**Summary.** Replay the hardest real bugs of the public repository niway-dev/kaipu-record and
see which reviewer catches them. For each bug, find the pull request that introduced it, rebuild
that pull request on a repository whose history stops at its parent, and let each reviewer see
the exact diff a human reviewer saw. Three identical public repositories, one per provider, so
no bot reads another's comments. Clean control pull requests measure noise. A blind judge
scores every finding. The result feeds the blog post and video about why Wachi exists.

**Decisions.**

| # | Decision | Why | ADR |
| --- | --- | --- | --- |
| 1 | Replay the introducing PR at its parent commit, not reintroduce the bug into today's code | Today's code moved on; a reintroduced bug is synthetic and may not apply cleanly. The original diff is what a reviewer actually saw | none |
| 2 | Find introducing PRs with SZZ (blame the lines each fix removed, on the fix's parent). Treat SZZ output as candidates and verify each bug by hand before scoring | SZZ is the standard method (used by Greptile) but mislabels mixed PRs and refactors | none |
| 3 | Three identical public repositories, one per provider, history truncated at the parent commit | Removes the last-commenter advantage and hides the fix from `git log` | none |
| 4 | Add clean control PRs with no known bug | Without them the benchmark counts hits but not noise | none |
| 5 | Blind judging: findings exported without the bot's name and scored with the `Verdict:` convention | Vendor benchmarks disagree mostly through who counts hits and who judges | none |
| 6 | Same model for Wachi and Pullfrog. CodeRabbit's model is not selectable and is reported as is | Isolates the harness from the model | none |
| 7 | Pilot of 10 bugs from the top 15 before the full set, starting with small introducing PRs | Cheap check that the setup and the scoring hold | none |
| 8 | Score: known-bug recall, valid new findings, invalid findings (precision), cost and wall time per PR | A reviewer that finds the seeded bug and buries it in noise has not won | none |

**Open questions.**

1. Model for the run. Default: Claude Sonnet 5.5 for Wachi and Pullfrog; Opus 5.5 as a second
   pass on the pilot only if budget allows.
2. Organisation for the three repositories. Default: a separate account or organisation, so the
   apps' installs and learnings do not touch niway-dev.
3. CodeRabbit cost on public repositories. Not verified. Default: check before installing.

**Out of scope.** Private code. A public leaderboard. Tuning Wachi's prompt on the benchmark's
own bugs before the run.

## Known biases, declared up front

1. **Wachi has history on kaipu.** An earlier Wachi version reviewed kaipu from PR #301 on
   (missed 16 catalogued bugs, caught 1), and some prompt rules were tuned on those reviews.
   Most of the top 15 predate it ("did not run"), which limits the effect.
2. **Pullfrog has history on kaipu too.** Its runs seed a stored learnings file
   (`learnings seeded … (existing=yes)` in the #467 log). The benchmark repositories start
   fresh, which removes this for all three.
3. **Claude found most of the bugs.** The catalogue's finders are mostly Claude models (Fable,
   Opus, Sonnet). Selection may favour the two Claude-based reviewers over CodeRabbit. Reported
   as is.

## The catalogue

145 real bugs from about 90 fix PRs, mined read-only on 2026-10-30. By difficulty: 36 at level
5, 56 at level 4, 40 at level 3. Most common classes: state machines (33), ordering races (28),
data loss (16), cross-file contracts (15). Full table and per-bug details:
[kaipu-record-bug-catalogue.md](../benchmark/kaipu-record-bug-catalogue.md). Mining scripts and
the brief given to the mining agents: [mining/](../benchmark/mining/).

**Claude Fable** appears as finder, fixer and source:

- Its pre-tester audit found 46 confirmed bugs; 30 are in the catalogue, all fixed by Opus 4.8.
- In five cases a symptom was reported and Fable 5.1 found the cause and fixed it (#143, #414,
  #419, #423, #425). It is in the trailers of 10 fixes.
- Two of its own fixes introduced bugs: #143 caused REC-B8 (fixed in #416) and #255 caused the
  activation-policy cache bug (fixed in #366). Good cases: bugs a strong model let through.

**Top 15** (difficulty ≥ 4, introducing PR identified with medium or high confidence, ≤ 40
files, bug at least partly visible in its diff):

| Bug | Fix | Introduced | Class | Found by / fixed by | Prior reviewer |
| --- | --- | --- | --- | --- | --- |
| Spare overlay loses state before its listener | #418 | #402 | race | owner / Opus 5.5 | **missed** |
| Activation-policy cache skips restore | #366 | #255 | state | user / **Fable 5.1** | did not run |
| Auth IPC throw loses the error kind | #81 | #69 | cross-file | Opus 5 | did not run |
| `getSession` with a null body | #81 | #68 | state | Opus 5 | did not run |
| CSRF 403 from the origin | #79 | #68 | cross-file | Sonnet 5 | did not run |
| Bearer token exposed through the web proxy | #81 | #66 | security | Opus 5 | did not run |
| REC-B8: cursor tail cut uses a late wall clock | #416 | #143 | cross-file | Opus auditor / Opus 5.5 | did not run |
| Cursor tail cut floors the duration | #143 | #133 | data loss | **Fable 5.1** / **Fable 5.1** | did not run |
| A skipped required check reads green | #183 | #174 | CI | maintainer / Opus 5 | did not run |
| Ticket extend races read and release | #342 | #276 | race | Opus 5.5 | did not run |
| SHOT-B5: clearing a label deletes the wrong shape | #370 | #52 | race | Opus auditor / Sonnet 5.5 | did not run |
| SHOT-B1: save marks clean over a new edit | #360 | #18 | race | Opus auditor / Sonnet | did not run |
| "Exported" badge compares clocks | #159 | #156 | state | owner / Opus 5 | did not run |
| Label double-click broken by pointer capture | #187 | #184 | state | owner / Opus 5 | did not run |
| LIB-B12: drag-out copies the whole file | #412 | #269 | platform | Opus auditor / Opus 5.5 | did not run |

Catalogue limits: Linear tickets (NIW2-…) were not readable; fixes in #17–#25 are squash commits
split by hand; difficulty was judged by the mining agents; the app was not run. Some introducing
PRs are large (#402: 26 files, +1,820 lines).

## Field observation: kaipu-record#467 (2026-10-31)

Not part of the benchmark: one live PR where both Wachi and Pullfrog reviewed the same head. It
is recorded because it already shows the kind of difference the benchmark has to measure.

**Setup.** [niway-dev/kaipu-record#467](https://github.com/niway-dev/kaipu-record/pull/467),
"Export screen with its own rail entry (replaces Prepare)", 47 files, +2,676/−2,177, head
`b12d760`. Both ran Claude Opus 5.5. Wachi was the pre-phase-0 version on kaipu's workflow.

| | Wachi | Pullfrog |
| --- | --- | --- |
| Run | 01:08:21–01:11:24 (3 min 3 s) | 01:08:22–01:12:16 (3 min 54 s) |
| Review posted | 01:11:18 | 01:11:53 |
| Cost | $1.36 (6 batches) | $1.96 (45 turns, effort high) |
| Findings | 8 (3 fix, 5 consider) | 1 (important) |

**Did Wachi's review influence Pullfrog?** No. Pullfrog's log shows only local reads of its diff
file, greps, and its own MCP calls (`select_mode`, `checkout_pr`, `git`,
`create_pull_request_review`). It never listed the PR's reviews or comments. Its finding was
already written in its summary file at 01:11:14.9, before Wachi posted at 01:11:18. The posted
body is identical to its first draft at 01:11:34, which a coverage nudge rejected once. Wachi
reads no other bot's comments and posted first.

**Were the findings valid?** Each was checked against the code at `b12d760`, by reading, not by
running the app.

| # | Bot | Finding | Valid | Weight |
| --- | --- | --- | --- | --- |
| P1 | Pullfrog | Export never re-lists the Library when a background export finishes: no `library:changed` on `recordingFinalize`, unlike library-detail's refresh on `runner.ready`. The card never reads "Ready" and Enter encodes the same copy again. Also: `if (isLoading)` unmounts the screen on any refresh and loses the picked destination | Yes. `recording-hub.ts` finalize does not broadcast; `export-page.tsx` has no `ready` refresh; `refresh()` sets `isLoading` | **The one user-facing functional bug** |
| W1 | Wachi | "Pick from Library" stays enabled while a dropped file imports; two navigations race | Yes (`export-drop-zone.tsx`: only Browse is disabled) | minor |
| W2 | Wachi | GitHub size bar's `role="img"` label omits the fits/over verdict | Yes (`barLabel` has only from/to) | a11y |
| W3 | Wachi | Picker is `role="dialog"` without focus management | Yes | a11y |
| W4 | Wachi | Running row in Recent exports shows the title where finished rows show the destination | Yes | cosmetic |
| W5 | Wachi | "does not take a video dropped on the window" passes either way: the default `pathForFile` stub returns "" so `importVideoFiles` is never reached | Yes (`use-import-videos.ts`) | test quality |
| W6 | Wachi | Sidebar test named "with and without a video" renders only `/export/asset-1` | Yes | test quality |
| W7 | Wachi | Badge's in-progress count (`status === "exporting"`) is untested | Yes | test quality |
| W8 | Wachi | Orphaned CSS comment for the removed drop strip | Yes | docs |

**Reading.** All nine findings hold. Wachi produced more, valid ones, mostly test, accessibility
and hygiene issues, at lower cost. It missed the only finding that changes what a user sees.
That bug needs three files that were not in the same batch: the new page, the main-process
finalize handler, and the library-detail precedent. This is the case the precomputed change
impact idea (research note) and cross-batch contracts are meant to cover, and it is a concrete
input to the benchmark's cross-file class. One more possible miss by both, unverified: finished
Email copies in Recent exports are named through `destinationOfPreset("balanced")`, which
returns `chat`, so they may read "Slack · Discord".

## Sources

- [Greptile benchmarks](https://www.greptile.com/benchmarks) (SZZ-style replay of real fixes)
- [Macroscope benchmark](https://macroscope.com/content/ai-code-review-benchmark-best-models)
- [Should we trust AI code review benchmarks?](https://dev.to/izgorodin/should-we-trust-ai-code-review-benchmarks-3p6n)
- [Tenki benchmark](https://tenki.cloud/benchmarks/code-reviewer) ·
  [Entelligence benchmark-maxxing](https://github.com/Entelligence-AI/benchmark-maxxing)
- Pullfrog run log: niway-dev/kaipu-record Actions run 41153840590. Wachi run: 41153836694.
