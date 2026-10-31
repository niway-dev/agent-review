# Field benchmark, 2026-10-31: Wachi and Pullfrog on kaipu-record #463–#467

- **What:** every kaipu-record PR where both reviewers reviewed the same head on 2026-10-31.
  Five PRs, opened between 00:59 and 01:08 UTC.
- **Reviewers:** Wachi v1.2.0 (`github-actions[bot]`, before the phase-0 fixes) and Pullfrog
  v0.1.110 (`pullfrog[bot]`). Both on Claude Opus 5.5.
- **Scoring:** each finding was checked against the code at the reviewed head, by reading, not by
  running the app. #463–#466 were scored by one Claude Sonnet 5.5 subagent per PR; #467 by the
  orchestrating session (Opus 5.5). Three key claims were re-checked by hand (#463 `b0f028c`,
  #465's missing `markCopySeen`, all of #467).
- **Not a controlled benchmark:** no seeded bugs, no blind judge, no control PRs. See the
  [benchmark spec](../../specs/2026-10-31-review-benchmark-design.md) for the controlled design.

## Result

| PR | Size | Wachi cost | Pullfrog cost | Wachi valid / invalid | Pullfrog valid / invalid | Most important finding |
| --- | --- | --- | --- | --- | --- | --- |
| [#463](pr-463.md) camera off/on mid-take | 26 files, +1,899/−67 | $0.62 | $2.20 | 4 / 0 | 1 / 0 | **Both caught one functional bug each, both fixed by the author** (Wachi: face lost when the camera cannot reopen, `b0f028c`; Pullfrog: random gap ids break Share reuse, `29395c3`) |
| [#464](pr-464.md) ready copy in the Library | 31 files, +1,171/−127 | $0.36 | $1.23 | 1 / 0 | 2 / 0 | Pullfrog: the card's Show in Finder and drag skip `markCopySeen` |
| [#465](pr-465.md) recording detail | 14 files, +1,059/−559 | $0.48 | $1.15 | 2 / 0 | 1 / 0 | Pullfrog: the new drag handle skips `markCopySeen` |
| [#466](pr-466.md) floating ready card | 28 files, +1,284/−13 | $0.46 | $1.14 | 2 / 0 | 2 / 0 | Pullfrog: Back re-shows the always-on-top card |
| [#467](pr-467.md) Export screen | 47 files, +2,676/−2,177 | $1.36 | $1.96 | 8 / 0 | 1 / 0 | Pullfrog: Export never re-lists the Library when an export finishes |
| **Total** | | **$3.28** | **$7.68** | **17 / 0** | **7 / 0** | |

- **No invalid finding from either reviewer**, by reading.
- **Wachi: 2.4× the findings at 43% of the cost.** Most are test quality, accessibility, stale
  comments and edge cases. About five are functional; one of them (#463) was the PR's most serious bug.
- **Pullfrog: fewer findings, almost all functional.** It caught the top user-facing bug on four
  of five PRs.
- **Author fixes after review** (only #463 had fix commits): two Wachi findings and one Pullfrog
  finding were fixed. The author's own review later found two more bugs neither bot caught.
- **No influence.** In no first run did Pullfrog list the PR's reviews or comments, and its
  findings never overlap Wachi's. Wachi reads no other bot's comments. Pullfrog's learnings file
  was updated by #464's run at 01:09:38, after #465's run had already read it (01:07:43), so its
  two `markCopySeen` catches were independent.

### Re-reviews (Pullfrog only)

Wachi runs only on `opened` and `ready_for_review` in kaipu-record, so it did not see later
commits. Pullfrog re-reviewed all four PRs that got new commits, for $2.78 in total. It found
three more valid issues: a queued camera turn-on after a newer off (#463, unfixed), an Email copy
tag that falls back to "chat" (#464), and stale doc text after a merge (#465). On #463 it resolved
its own thread with "Addressed in `29395c3`".

## Where Wachi misses, and why

Revised after an independent analysis by GPT-6.1 Sol, which reconstructed Wachi's batches with
v1.2.0's `planBatches` and read Pullfrog's tool calls in order.

**It is not mainly a batching problem.** On #464 the new card (`ready-copy-card.tsx`), the
precedent (the toast in `export-status-cards.tsx`) and the contract (`ready-copies.ts`) were all
in the same batch. On #465 and #467 the precedent and the contract were in no batch at all: they
are unchanged files outside the diff (`export-status-cards.tsx` and `ready-copies.ts` on #465;
`use-local-library.ts`, `export-runner.ts`, `recording-hub.ts` and `library-detail-page.tsx` on
#467).

**The difference is the question each reviewer asks.** Wachi checked that the new code was
locally valid ("uses existing preload APIs", "hooks run in the same order"). Pullfrog followed an
action to its effect on the app's state and kept one functional question open across several
reads: "what does the other UI do when the user drags this same copy?", "when the copy finishes,
how does this screen find out?". Its logs show the sequence: read the precedent, grep the function
it calls (`markCopySeen`, `library:changed`), read the contract, then write the finding.

Turn count is not the explanation either: Wachi used 7 turns on #465's batch and 8 to 11 on
#467's. Budget is not the constraint: no batch spent more than $0.42 of its $0.75 cap.

## What Pullfrog misses, and why

The other direction matters as much. Pullfrog's first reviews overlap none of Wachi's 17 valid findings, including
one of #463's two serious bugs.

- **It reviews depth-first and stops.** It follows a few functional questions to the end and
  posts only what it confirmed ("bug-only, high-confidence" in its own words on #463). Whatever it
  did not go looking for, it does not see.
- **It skips tests, comments and docs as review targets.** None of Wachi's test-quality findings
  (a test that passes either way, a test named for a case it never runs, an untested badge path) or
  stale comments appear in Pullfrog's reviews.
- **It checks the happy path of what it traces.** On #464 it checked the sidebar's
  `wasOnLibrary` ref and judged the lifecycle fine, without trying list view or a filter (Wachi's
  finding). On #463 it checked the camera reopen failure at the store level and never followed it
  into the main-process hub, where Wachi found the face lost from the recording.

**What it represents.** The two reviewers make opposite trade-offs. Pullfrog spends on depth
along a few paths; Wachi spends on breadth, because its engine guarantees every file is read.
Neither covers the other. The improvements below keep Wachi's breadth and add the one question
that gave Pullfrog its depth, instead of turning Wachi into an explorer.

## Improvements this suggests

Ranked, after Sol's review of the first list.

| # | Change | Catches | Kind |
| --- | --- | --- | --- |
| 1 | **A contract check per new action or flow.** For each one the batch answers: what does it change, which equivalent path already exists, and how does the result reach the visible state; for persistent or local state, also what happens on refresh and on leave-and-return. The engine checks that each answer cites code and lists open questions; the model still decides what is a bug | #464, #465, #466, #467 | prompt + engine |
| 2 | **Precomputed peers for those questions.** The engine finds other call sites of what the new code calls, including qualified calls such as `window.electronAPI.startFileDrag` (not imported, so an import graph misses them) and hooks such as `useLocalLibrary`, with the lines before each call. Shown as candidates to compare, never as rules to copy | #464, #465, part of #467 | engine |
| 3 | **Small repository memory in the existing focus file.** `.github/agent-review.md` is already in the prompt: add confirmed contracts with the code that proves them (ready-copy actions and `markCopySeen`; Library refresh after an export). The full `.github/wachi/` can come later | repeats of #464, #465, #467 | memory |
| 4 | **Run on `synchronize`, rebase-aware.** Continuity and fix checking, not a fix for first-review misses. Pullfrog's re-reviews found three more valid issues for $2.78 | later commits | config |
| 5 | **Align the engine's ADR notice with the docs path.** The focus file already told the model where kaipu's ADRs live; only the engine's notice is anchored to `docs/adr/` (#5), so it did not fire when #463 edited ADR 0032 | docs | engine |

Not recommended now:

- **A cross-batch pass over summaries.** The summaries state the pieces are correct without naming
  the missed contract; re-reasoning over them can ratify the gap. If 1–3 are not enough, try a
  flow-investigation pass with tools and access to unchanged code instead.
- **A minimum number of turns.** It rewards activity, not investigation. Log the tools used, the
  unchanged files read and the open contracts instead.
- **Rules worded as universal truths.** "Every identity must be deterministic" is false; ask
  whether the same content must keep the same identity for reuse, dedup or a cache.

**How to measure:** replay the five PRs at the same heads with model, effort and limits fixed,
v1.2.0 as baseline, each change alone and combined, several runs per variant. Score detection of
these bugs, false positives, cost and latency, and whether the model retrieved the right precedent
and completed the causal chain. Memory written from these reviews is not prior knowledge on these
same PRs; add new PRs before claiming the change generalises.

## Would the memory files help?

Partly, and only where a pattern repeats in one repository.

- **Yes for repository invariants.** "Every action on a ready copy (open, reveal, drag) calls
  `markCopySeen`" showed up on two PRs in a row. As an intentional rule in `rules/` it would have
  pointed both batches at the toast's behaviour. As a learned lesson it qualifies under ADR 0007
  once the owner replies `Verdict: correct` on both threads (two agreeing verdicts). The same holds
  for "a page that stays during a background export re-lists on `runner.ready`".
- **No for new bug shapes.** The random-id fingerprint (#463) and the remount (#466) are general
  engineering rules, not facts about kaipu. They belong in the engine's rules (improvement 2),
  where every repository gets them.
- **Risk:** each lesson adds prompt text to every batch it matches. Lessons stay scoped to paths
  and are examples with no authority (ADR 0006), so they cannot mute a finding.

## Data

Raw reviews, inline comments and Pullfrog's tool calls (the `» ` lines of each run log,
cut at 400 characters) are kept in [raw/](raw/), because GitHub expires Actions logs.


Runs (niway-dev/kaipu-record Actions): Wachi 41153055286 (#463), 41153536509 (#464),
41153716355 (#465), 41153724626 (#466), 41153836694 (#467). Pullfrog first runs 41153059096,
41153540436, 41153720657, 41153729056, 41153840590; re-reviews 41154789953 (#463),
41154968488 (#464), 41154158467 (#465), 41154544455 (#466).
