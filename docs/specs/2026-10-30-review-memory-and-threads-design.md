# Repository memory, thread follow-up and rebase-aware incremental review

- **Status:** proposed 2026-10-30. Nothing here is implemented on `main`; the prerequisites
  (#39, #40, #41, #42, #10) are being fixed in a separate stack.
- **Date:** 2026-10-30
- **Creates:** ADR 0006 (repository review policy), ADR 0007 (learned memory), ADR 0008 (thread
  follow-up authority)
- **Refs:** #43

## In one minute

**Summary.** Wachi learns what a repository cares about from files in that repository. It never
learns from a server. A folder, `.github/wachi/` by default, holds a reference config, the rules
a tech lead writes on purpose, and the lessons Wachi proposes from the owner's verdicts. All of
it is read from the pull request's **base** commit, so a pull request cannot rewrite the rules
it is reviewed under.

- **Rules.** Rules can add criteria but never lower a severity. A deliberate downgrade has one
  explicit, reasoned place in the config.
- **Lessons.** They arrive as one draft pull request, the way release-please proposes a release.
  The diff is readable Markdown, and the description links every source thread.
- **Threads.** Wachi follows up on its own threads. Resolving one stays the operator's call:
  the operator's verdict resolves it deterministically, and the model only says "this appears
  addressed".
- **Incremental review.** A rebase with no new commits and an unchanged base costs nothing. A
  rebase onto a changed base re-reviews only the files where the base's change meets the pull
  request.

**Decisions.**

| # | Decision | Why | ADR |
| --- | --- | --- | --- |
| 1 | Repository policy lives in `.github/wachi/` by default. The location is a workflow input, not a repository file | Tracked, reviewable, owned by the consumer, no server. A repository file that named the folder could be pointed elsewhere by a pull request | 0006 (new) |
| 2 | Every policy file, plus `CLAUDE.md` and `AGENTS.md`, is read from the exact base commit. The head's copies are content under review | A pull request must not choose its own review rules (#10). ADR 0001 decision 4 says policy changes arrive by pull request | 0006; reuses 0001 |
| 3 | Authority order: engine constraints > intentional rules > learned lessons. Lessons are examples with no authority | A lesson drawn from one verdict must not override the engine's severity tests or a tech lead's rule | 0006 |
| 4 | No rule or lesson lowers a severity. Downgrades exist only as `severity_overrides` in `wachi.yml`, each with paths, a ceiling and a written reason. A downgrade attempted in prose gets a notice that points to the key | A downgrade hidden in prose is invisible in review. One reasoned key is easy to audit. The future problem is silently muted findings | 0006 |
| 5 | Zero learned knowledge on install. `CLAUDE.md` and `AGENTS.md` from base are the day-one rules | Fast start without a learning backlog. Those files already describe the repository | 0006 |
| 6 | `/wachi learn` opens or updates one draft PR, `chore(wachi): learn from N verdicts`. A lesson needs at least two agreeing operator verdicts, is scoped to paths, and is written as an example. It is never a prohibition | One verdict is one case, not a rule. A draft PR makes poisoning visible and stops it from being silent | 0007 (new) |
| 7 | A thread is resolved by the engine only on the operator's strict `Verdict:` (#42). For a fix the model sees, it replies "appears addressed" with code links and leaves the resolve to the owner | A false "fixed" hides the warning the reviewer exists to keep. Measure first, automate later | 0008 (new) |
| 8 | At most two Wachi replies per thread over its lifetime. After that the thread carries a "waiting for the owner" note and Wachi stays silent | Stops a loop with the owner's reply agent. Subjective disagreements need a human | 0008 |
| 9 | Thread follow-up has its own path. It runs even when no file changed since the last review | Today the pipeline returns before it reads threads when nothing changed (`src/engine.ts:872`) | 0008 |
| 10 | Incremental review is skipped only when the head has no new commits since the reviewed head and the base tree under the PR's files is unchanged. On a base change, only the PR files that intersect the base's changed files are re-reviewed | An identical patch on a changed base can behave differently. Patch equivalence alone is not a review | none |
| 11 | Inline comments state the failing condition, the consequence and the direction of the fix. No GitHub suggestion blocks, enforced in rendering | A wrong one-click fix is worse than none, and hard fixes are where suggested code is most often wrong | none |
| 12 | Doc/code disagreement uses normal severities (ADR 0003). It cites the doc sentence and the code line and does not decide which side is wrong. It stays off by default until the benchmark measures it | A fixed `consider` would contradict ADR 0003. An unmeasured judgment must not be on for everyone | reuses 0003 |
| 13 | The merge check is deferred | It would supersede ADR 0001's non-goal "making the review blocking". Blocker precision is not measured yet | reuses 0001 |

**Open questions.**

1. Can `severity_overrides` cap findings on the `security` topic? Default: no. A security
   finding keeps its severity whatever the config says.
2. Lesson file granularity. Default: one file per area (`learned/<area>.md`) with entries that
   carry their source, so the learn PR's diff groups by area.
3. `/wachi learn` on a schedule. Default: on demand only, until a few manual runs show the PR is
   worth reading.

**Out of scope.** A hosted memory service (ADR 0001 non-goal; the reasoning is under "Rejected:
server-side memory"). Apply-ready suggestion blocks. Automatic resolution of model-judged fixes.
A blocking check. The benchmark itself, which is its own project, linked from #43.

**Failures this must protect against.**

- A pull request edits `.github/wachi/rules/*.md`, `CLAUDE.md` or `AGENTS.md` to tell the
  reviewer a class of finding is out of scope, and gets reviewed under that rule.
- A lesson such as "auth changes here are intentional" mutes security findings without
  touching a severity word.
- A reply from a non-operator, a quoted verdict, or a verdict inside a code block resolves a
  thread.
- Wachi and the owner's reply agent answer each other indefinitely.
- A rebase onto a base that changed a contract the pull request calls is skipped as "no change".
- A stacked pull request whose base is another unmerged pull request reads that branch's
  unreviewed policy as accepted policy.
- Model text forges the incremental marker or the Wachi signature (#39, #40).
- A missing or malformed policy file makes the engine fall back to the head's copy.
- `wachi.yml` references a path outside the repository, a symlink, or an enormous file.

**Acceptance criteria.**

- [ ] A pull request that edits `.github/wachi/rules/x.md` is reviewed with the base's version,
      and its review body says the change takes effect after merge.
- [ ] `CLAUDE.md` and `AGENTS.md` reach the prompt from the base commit. The prompt no longer
      tells the model to read the head's copy.
- [ ] A rule whose text lowers a severity is not applied, and the review body points to
      `severity_overrides`.
- [ ] A `severity_overrides` entry without `reason` fails config validation and names the entry.
- [ ] For a stacked pull request whose base is not the default branch, policy is read from the
      default branch's merge-base, and the review says so.
- [ ] `/wachi learn` with one verdict proposes no lesson. With two agreeing operator verdicts on
      the same area it opens or updates one draft PR, and the description links both threads.
- [ ] The learn job's model has no write credentials. Only the engine writes files under the
      learned folder, and only there.
- [ ] An operator reply `Verdict: wrong` resolves the thread. The same text from another user,
      in a quote or in a code block does not.
- [ ] A thread with two Wachi replies gets no third. The "waiting for the owner" note counts as
      one of the two.
- [ ] A force-push that only rebases onto an unchanged base posts no review and spends nothing.
- [ ] A rebase onto a base that changed a file the pull request calls re-reviews that file only.
- [ ] No posted comment contains a ```` ```suggestion ```` block, even when the model writes one.

## Detail

### Folder layout

```
.github/wachi/            # default; the reusable workflow input `policy_dir` changes it
  wachi.yml               # reference config (below); never budgets or batch sizes
  rules/*.md              # intentional rules; frontmatter: paths (globs), title
  learned/*.md            # lessons proposed by /wachi learn; frontmatter: paths, sources
```

`wachi.yml` is parsed with Bun's built-in `Bun.YAML`, so ADR 0002 (no runtime dependencies)
holds. It is validated against a strict schema, and unknown keys are errors:

```yaml
rules: [rules/*.md]                  # defaults shown
learned: [learned/*.md]
docs:                                # doc → code map for decision 12
  - doc: docs/adr/*.md
    code: [src/**]
exclude: [fixtures/**]               # shown in the review body with the file count it removed
severity_overrides:
  - paths: [scripts/**]
    topic: cleanup
    max: consider
    reason: "Throwaway scripts; cleanup findings are noise here."
```

Limits: at most 64 files, 64 KB per file and 256 KB in total. Paths are relative and stay
inside the repository. Symlinks are not followed. Anything over a limit is skipped with a
notice, and the head's copy is never used in its place.

### Which base

The base is the exact `base.sha` from the pull request event. If the pull request targets
another pull request's branch (a stack), that branch is not accepted policy yet. Policy is
read at the merge-base with the default branch instead, and the review body says so.

### Learning flow (ADR 0007)

The input is the operator's strict verdicts (#42) on merged pull requests since the head of
the last merged learn PR. The model groups agreeing verdicts by area and proposes lesson
entries. Each entry is an example ("in `src/ipc/**`, a missing null check on X was correct
because Y; see thread …"), never a rule of the form "do not report X". The engine checks
paths and sizes, writes `learned/*.md` and pushes the branch `wachi/learn`. It opens or
updates the draft PR the same way release-please does. A closed learn PR leaves its
verdicts unconsumed, so the next run proposes them again. That job runs with
`contents: write` and `pull-requests: write`, and the model call inside it has the same
read-only tools as a review.

### Thread follow-up (ADR 0008)

On each run, before the file pipeline and independently of it:

1. Read the threads that carry the Wachi signature (#40), with full pagination.
2. For each open thread, take the operator's latest strict verdict. If there is one, resolve
   the thread deterministically, with no model call.
3. Otherwise, if the code at the thread's lines changed, ask the model in a capped batch. It
   may reply "appears addressed in `<file:line>`" or "still applies because …". It never
   resolves.
4. Count Wachi's replies per thread from the thread itself. Do not use a stored counter,
   which can drift after a cancelled run.

The automatic and on-demand jobs share one concurrency group per pull request once this
exists, so two runs cannot both reply.

### Incremental review (decision 10)

The engine records the base SHA as well as the head in the marker (`sha=… base=…`). On the
next run:

- **Same head and same base:** threads only.
- **New commits:** the existing path (`compareFiles`).
- **Head rewritten, no new commits:** compare the old and new patches file by file, using
  `git diff` of merge-base..head for both, not `git range-diff`, whose output Git calls
  unstable. If the patches match and the base did not change under the PR's files, review
  nothing. If the base changed, re-review the PR files whose diff touches a file the base
  changed. The base contract case is caught at file granularity.
- **Old head unreachable:** fall back to a full review, as today.

### Rejected: server-side memory

If memory ever had to live on a server, the safest form would have these properties:

- encrypted on the client with a key held in the consumer's Actions secrets, so the server
  stores ciphertext it cannot read;
- authenticated by GitHub OIDC, with no static keys;
- one Durable Object with SQLite per installation;
- rules text only, never code;
- a delete endpoint.

It is still a hosted service, with availability, breach and data-protection duties. ADR 0001
lists that as a non-goal. The repository already gives the consumer storage, history, review
and access control.

## Sources and unverified claims

- Pullfrog, source read at commit `096274d`. Agent-posted reviews with server-side hunk
  validation (`mcp/review.ts`), and thread resolution in incremental reviews (`modes.ts`:
  "False-positive resolutions erode trust faster than false negatives"). Range-diff
  incremental review (`utils/rangeDiff.ts`). Suggestion blocks are supported
  (`mcp/review.ts:729`), but its prompt does not push them.
- CodeRabbit: learnings stored on its side, and a command that turns recent review feedback
  into a pull request against `.coderabbit.yaml`
  ([docs](https://docs.coderabbit.ai/configuration/path-instructions)).
- Git documents `range-diff` output as unstable
  ([docs](https://git-scm.com/docs/git-range-diff#_output_stability)).
- An adversarial critique by GPT-6.1 Sol shaped decisions 3, 7, 9, 10 and 12, and the
  prerequisite issues.
- Unverified: how long GitHub keeps a force-pushed-away head fetchable by SHA. The fallback
  covers it.
