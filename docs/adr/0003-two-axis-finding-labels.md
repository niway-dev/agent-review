# ADR 0003: Finding labels have two axes, severity and topic

- **Status:** proposed
- **Date:** 2026-10-26
- **Spec:** `docs/specs/2026-10-26-finding-labels.md`

## Context

Each finding the reviewer posts opens with a label. The first version had two severities,
"Should fix" for correctness and security defects and "Note" for everything else, each followed by
one of five categories. In use, nearly every finding that was not a runtime bug arrived as
`Note (other)`: a stale documentation cell with a one-line fix, a convention violation, and a
remark that an ADR file was being edited all looked the same. The author could not tell from the
label whether to act, discuss or ignore, which is the one thing a review label exists to say.

The owner's first proposal was a flat list: urgent, critical, insecure, warning, and a system
notice for ADR edits. It names real needs (some notes are urgent; an ADR edit is information, not a
finding) but mixes two questions in one list: "insecure" is a subject, "warning" is a weight, and
"urgent" and "critical" ask the author for the same action.

## Decision

A finding label has two independent axes, each rendered as an emoji followed by a word:

- **Severity** answers "when do I act": 🔴 Blocker (before merge), 🟠 Fix (in this pull request,
  not blocking), 🟡 Consider (may decline), ⚪ Info (nothing to change). Each level is defined by a
  test the model applies, not by an adjective: a Blocker names the input or boundary that fails; a
  Fix is specific enough that the author would not argue; Consider is judgement; Info asks nothing.
- **Topic** answers "what is it about": 🐛 bug, 🔐 security, 📜 rules, 🏛️ adr, 📝 docs,
  🧪 tests, ⚡ perf, 🧹 cleanup, ❓ question. There is no `other`.

Any severity may combine with any topic, so an urgent documentation error and a minor security
nit are both expressible. `Info` is never an inline thread. The notice that a pull request edits
an ADR is produced by the engine from the changed paths, as `⚪🏛️ Info · adr`, not by the model.

## Alternatives rejected

- **A flat list (urgent, critical, insecure, warning, notice).** Mixes weight and subject; two of
  its levels ask for the same action; cannot express "urgent note".
- **Keep two severities and only rename them.** Leaves the concrete-but-not-breaking defect, the
  most common real finding, indistinguishable from a matter of taste.
- **Five or more severities.** Beyond four the model's calibration between adjacent levels is not
  reliable, and the author gains no new action to take.
- **A third emoji marking engine-generated findings.** Three symbols before the title read as
  noise, and `Info` already identifies the engine's notices in practice.
- **Emojis alone, without words.** Not searchable, not read by screen readers, and dependent on
  the reader's font.

## Consequences

- The output schema, the prompt rules and the review rendering change together in one release;
  consumers on exact tags pick it up through Dependabot.
- Reviews posted with the old labels remain valid state: incremental review reads the HTML marker
  and the author login, not the label.
- Consumers cannot add severities or topics in their focus file: a label must mean the same thing
  in every repository that runs the reviewer.
- The model is now asked to distinguish Fix from Consider. If it fails, the failure is visible in
  the labels themselves, which is better than today's `Note (other)`, where it was invisible.

## Non-goals

- The reviewer's identity (name, avatar, GitHub App) is a separate decision.
- GitHub labels on the pull request derived from the findings.
- A short-summary-plus-detail layout for long finding bodies.

## Reopen when

In the first ten reviews after release, more than a third of `Fix` findings are ones the author
would reasonably have declined (they were `Consider`), or more than a third of `Consider` findings
were concrete defects (they were `Fix`). Then either the tests in the prompt are rewritten or the
two levels are merged.
