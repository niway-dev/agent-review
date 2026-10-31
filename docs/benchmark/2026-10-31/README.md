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

All five functional bugs that only Pullfrog caught need code **outside the file being read**:

1. **Sibling-path parity** (#464, #465, #467). A new path for an existing action skips a side
   effect that the other paths perform: `markCopySeen` on reveal and drag, or a re-list on
   `runner.ready` like library-detail does. Pullfrog found two of these by grepping the function
   the existing path calls (`export function markCopySeen`).
2. **Consumers outside the diff** (#463). Seeded ids feed a fingerprint in `export-reuse.ts`,
   which is not in the PR. Wachi's batch summary said the seeding was "correct" without tracing
   who reads it.
3. **Lifecycle** (#466, #467). Per-instance ref state that resets on a remount; a loading flag that
   unmounts the screen on every refresh.

Contributing factors seen in Wachi's coverage tables: it uses few turns per batch (3 turns for 22
files on #464), spending $0.13–$0.42 of its $0.75 batch cap, with 3 to 11 turns per batch. Budget is not the constraint; depth
of investigation is. Pullfrog used 25–45 turns per review.

## Improvements this suggests

| # | Change | Catches | Kind |
| --- | --- | --- | --- |
| 1 | **Peer call sites in the batch prompt.** For each symbol the diff newly calls or imports from unchanged code, the engine lists its other call sites with a few lines of context (`git grep`, capped). Extends the "precomputed change impact" idea in the [research note](../../research/2026-10-30-pullfrog-and-coderabbit.md) from "who uses what changed" to "who else does what this new code does" | 1 | engine |
| 2 | **Three review rules in the prompt:** a new path for an existing action keeps the side effects of the existing paths; a value that feeds an identity, hash or cache key is deterministic; state loaded once is refreshed when the background work it depends on finishes, and a refresh does not unmount what the user is editing | 1, 2, 3 | prompt |
| 3 | **A cross-batch pass.** After the batches, one engine-run pass gets the new entry points and the batch summaries and looks only for contracts that cross batches, with its own small budget | 1, 2 | engine |
| 4 | **Run on `synchronize` in kaipu-record.** Incremental review exists; Pullfrog's re-reviews found three more valid issues for $2.78. Wait for the rebase-aware rule (memory spec, decision 10) or stacked-branch rebases will re-review whole PRs | later commits | config |
| 5 | **Repository memory** (`.github/wachi/`, ADR 0006/0007). See below | 1 (repeats) | memory |
| 6 | **A docs map.** kaipu's ADRs live in `apps/documentation/src/content/docs/architecture/decisions/`, so Wachi's ADR notice (`docs/adr/` only, #5) did not fire when #463 edited ADR 0032 | docs | config |

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

Runs (niway-dev/kaipu-record Actions): Wachi 41153055286 (#463), 41153536509 (#464),
41153716355 (#465), 41153724626 (#466), 41153836694 (#467). Pullfrog first runs 41153059096,
41153540436, 41153720657, 41153729056, 41153840590; re-reviews 41154789953 (#463),
41154968488 (#464), 41154158467 (#465), 41154544455 (#466).
