# Finding labels: severity and topic on two axes

- **Status:** draft, awaiting owner review
- **Date:** 2026-10-26
- **Creates:** ADR 0003 (two-axis finding labels)

## In one minute

**Summary.** Every finding the reviewer posts starts with a label that tells the author what to do
with it. Today that label is `Should fix (category)` or `Note (category)`, and most real findings
land as `Note (other)`, which says neither how serious the finding is nor what is expected. The new
label has two axes, each with an emoji and a word: a **severity** that answers "when do I act on
this" and a **topic** that answers "what is it about". The `other` category disappears, four
topics are added, and the notice that a pull request edits an ADR moves from the model to a
deterministic check in the engine, posted as information in the review body instead of as a thread.

**Decisions.**

| Decision | Why | ADR |
| --- | --- | --- |
| Two independent axes (severity, topic), not one flat list | A flat list mixes "how urgent" with "what kind" and cannot express an urgent documentation note or a minor security nit | 0003 (new) |
| Four severities: Blocker, Fix, Consider, Info | Two levels hide the difference between "a concrete defect that does not break at runtime" and "a matter of taste"; five or more exceed what the model calibrates reliably | 0003 |
| Severity is defined by a test the model can apply, not by an adjective | "Critical" and "urgent" are read differently by every model and author; "can you name the input that fails" is not | 0003 |
| `other` is removed; unclassifiable findings become `question` | `other` tells the author nothing; a question at least tells them to answer | 0003 |
| The ADR-edited notice is an engine check on `docs/adr/**`, not a model finding | Free, consistent, never opens a thread the author must answer; the model keeps only the real case, code that contradicts an accepted ADR | none |
| `Info` findings go to the review body, never to an inline thread | Information needs no reply; an inline thread asks for one | none |
| Emojis never stand alone: each is followed by its word | Searchable, readable by screen readers, and survives fonts that drop emoji | none |

**Open questions.**

1. Should a pull request also receive a GitHub label (`agent-review: blocker`) when at least one
   Blocker is posted? It needs no extra permission beyond `pull-requests: write`, but it is a second
   surface to keep consistent. Default: not in this change.
2. Whether the model, given the tests below, keeps `Fix` and `Consider` apart. Measured on the
   first ten reviews after release; the reopen condition of ADR 0003 depends on it.

**Out of scope.** The reviewer's identity (a GitHub App with its own name and avatar) is a
separate decision with its own ADR; this change keeps `github-actions[bot]`. A "TL;DR plus full
context" layout for long finding bodies is a later improvement on top of this label format.

## The label

```
<severity emoji><topic emoji> <Severity> · <topic>: <title>
```

Examples, as they would appear as the first line of an inline comment:

```
🔴🔐 Blocker · security: DATABASE_URL printed in the deploy log
🟠📝 Fix · docs: stale 'Read by' cell for BETTER_AUTH_SECRET
🟡🧹 Consider · cleanup: two env schemas declare the same key
🔴📝 Blocker · docs: README tells users to run the destructive migrate command
```

And in the review body, where `Info` always goes:

```
⚪🏛️ Info · adr: this pull request edits docs/adr/0001-distribution-and-trust.md
```

### Severity: when the author acts

| Emoji | Word | Meaning for the author | Test the finding must pass |
| --- | --- | --- | --- |
| 🔴 | `Blocker` | Fix before merging | The reviewer can name the input, state or trust boundary that fails if the change merges as is |
| 🟠 | `Fix` | Wrong today; fix it in this pull request; does not block the merge | The fix is specific and the author would not argue with it |
| 🟡 | `Consider` | Would be better; the author may decline | A matter of judgement, not a defect |
| ⚪ | `Info` | Nothing to change; awareness only | Asks for no reply, so it is never an inline thread |

Severity is an action, not an adjective. "Urgent", "critical" and "warning" were rejected because
two of them ask the author for the same action and the third names no action at all.

### Topic: what the finding is about

| Emoji | Word | Covers |
| --- | --- | --- |
| 🐛 | `bug` | Correctness: the code does the wrong thing for some input or state |
| 🔐 | `security` | Credentials, user data, or a trust boundary the change weakens |
| 📜 | `rules` | A violation of `CLAUDE.md`, `AGENTS.md` or a repository convention |
| 🏛️ | `adr` | Recorded decisions: the change contradicts one without superseding it, or (engine notice) edits one |
| 📝 | `docs` | Documentation or comments that are stale or contradict the code |
| 🧪 | `tests` | Missing coverage, or a test that does not test what its name says |
| ⚡ | `perf` | Cost, latency, repeated work, N+1 queries |
| 🧹 | `cleanup` | Duplication, dead code, a misleading name |
| ❓ | `question` | The reviewer could not determine something and asks the author |

`rules` and `adr` stay separate because the author's response differs: a rule violation is
corrected in the code; a contradicted decision is either corrected or superseded by a new ADR.

### Combinations the model must know

- `Blocker` is allowed with any topic. A README that tells users to run a destructive command is
  `🔴📝 Blocker · docs`.
- `Info` is produced only by the engine today (the ADR notice). The model may still return it; the
  engine moves it to the body.
- `question` takes the severity of its worst plausible answer: if the answer could be a Blocker,
  the question is a Blocker.

## Changes to the engine

All in `src/engine.ts` unless noted; every change has a test in `src/engine.test.ts`.

1. **`Finding` type and output schema.** `severity` becomes `"blocker" | "fix" | "consider" |
   "info"`; `category` is renamed `topic` and becomes `"bug" | "security" | "rules" | "adr" |
   "docs" | "tests" | "perf" | "cleanup" | "question"`. The JSON schema sent to the provider
   changes with it. `other` and `correctness` are gone; `correctness` is `bug`.
2. **`label(f)`.** Renders `<sev emoji><topic emoji> **<Severity> · <topic>: <title>**` from two
   lookup tables. The tables are the single source of the emojis; nothing else in the code holds
   one.
3. **`RULES`.** Replaced by the two tables above in prose, each severity with its test, plus the
   three combination rules. The "skip praise, formatter style, speculation" sentence stays.
4. **`buildReview`.** `info` findings go to the body under a heading `### For your information`,
   never to `comments`. The count line becomes `N finding(s): B blocker(s), F to fix, C to consider`
   and omits zero groups. The dedupe key `path:line:topic` keeps the higher severity, in the order
   blocker > fix > consider > info.
5. **ADR notice.** A new pure function `adrNotices(files)` returns one `info · adr` finding per
   changed file under `docs/adr/`, with `line: 0`, body "This pull request edits an accepted
   decision record. If the change supersedes a decision, say so in the record." The engine appends
   them to the model's findings before `buildReview`. The prompt tells the model not to report
   that an ADR file is edited, only that code contradicts one.
6. **Reading old reviews.** `lastReviewedSha` and `openBotThreads` read the HTML marker and the
   author login, not the label, so reviews posted with the old labels keep their incremental state.
   No migration.
7. **Documentation.** `README.md` line 6, `templates/caller-workflow.yml` line 5, and
   `docs/architecture.md` sections 4 and 6 describe the new labels. `docs/cli.md` gains the two
   tables. The focus-file documentation says a repository may not add severities or topics, so
   every consumer's labels mean the same thing.

## Rollout

One release of `agent-review`. Consumers pinned to an exact tag (ADR 0001 amendment) receive it
through their Dependabot pull request; nothing in the caller workflow changes. The first review
after the upgrade on `gymtrack-monorepo` is the acceptance check: its findings carry the new
labels, an edited ADR produces a body notice and no thread, and no finding carries `other`.

## References

- Current labels and rules: `src/engine.ts` (`label`, `RULES`, `buildReview`).
- The review that motivated this change: gymtrack-monorepo pull request #70, whose only finding,
  a stale documentation cell with a one-line fix, was posted as `Note (other)`.
- Decision record: `docs/adr/0003-two-axis-finding-labels.md`.
