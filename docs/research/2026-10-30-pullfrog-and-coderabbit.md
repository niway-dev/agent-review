# Pullfrog and CodeRabbit: what they do and what Wachi takes

- **Date:** 2026-10-30, updated 2026-10-31
- **Method:** Pullfrog's action source (v0.1.109, cloned 2026-10-30) was read, not run, except
  for one observed run on niway-dev/kaipu-record#467 (see the benchmark spec). CodeRabbit was
  studied from its public documentation only.
- **Used by:** [review memory spec](../specs/2026-10-30-review-memory-and-threads-design.md),
  [usage dashboard spec](../specs/2026-10-31-usage-dashboard-design.md),
  [benchmark spec](../specs/2026-10-31-review-benchmark-design.md)

## In one minute

Pullfrog and Wachi make opposite bets. In Pullfrog **the agent runs the process**: it gets a
long prompt, picks a mode through an MCP tool, reads the diff from a file, may start
subagents, and posts the review itself. Code puts guard rails around that call. In Wachi **the
model only judges**: code picks the files, orders them by risk, batches them, enforces budgets,
checks coverage and posts. For a review product the second bet gives guarantees the first only
asks for in a prompt.

CodeRabbit is a hosted service. Its useful ideas for Wachi are configuration ideas
(path-scoped instructions, a learnings-to-config PR), not its storage model.

## Where Wachi is already stronger

- **Cost.** No per-run spend cap or large-PR split was found in Pullfrog. Its prompt says there
  is no file, line or budget threshold; the only limit is a 1-hour timeout. Wachi has a
  per-batch and a per-PR budget and says when it ran out.
- **Coverage.** Pullfrog has a "diff coverage pre-flight": the first submit is rejected with a
  list of unread diff regions, and the retry is accepted whatever was read. Observed on #467:
  one nudge, then the same review body was posted. Wachi's `batchGaps` requires every file to be
  reviewed or justified and marks the review partial otherwise.
- **Security surface.**
  - Pullfrog runs Claude Code with `--dangerously-skip-permissions` and relies on deny lists in
    `managed-settings.json`; its own code comments that `--disallowedTools` only "filtered".
  - The Claude process inherits all of `process.env`.
  - The MCP server listens on loopback; no authentication was found in the code (not verified
    at runtime).
  - Wachi grants only Read, Glob and Grep, passes an allowlisted environment, and the model
    never holds a GitHub token.
- **Backend dependency.** By default Pullfrog mints GitHub tokens through pullfrog.com (OIDC),
  sends the workflow's job token to `/api/repo/.../run-context` (`utils/runContext.ts:234`) to
  fetch stored settings and secrets, and runs `npx pullfrog@^version`, a floating semver range.
  The observed run logged "1 db secret(s) loaded": the provider key came from Pullfrog's store.
  Wachi talks to no server of its own and pins exact versions.
- **Quality measurement.** Pullfrog's repository has functional and security tests but no
  review-quality evals. Wachi measures precision from the owner's `Verdict:` replies
  ([precision](../precision.md)).

## What Wachi takes from Pullfrog

| Idea | Pullfrog | Wachi's version | Where |
| --- | --- | --- | --- |
| Follow up on its own threads | On incremental review it replies "Addressed in `<sha>`" and resolves; leaves doubtful ones open; never touches human threads | Resolution only on the operator's strict verdict; the model may only say "appears addressed"; two replies per thread at most | ADR 0008 |
| Rebase-proof incremental diff | Synthetic merge-base→tip commits per PR version, compared with `git range-diff` (`utils/rangeDiff.ts`, `mcp/checkout.ts:837-867`) | Skip only with no new commits and an unchanged base under the PR's files; re-review the intersection on a base change. An empty range-diff alone is not a review | Memory spec, decision 10 |
| Retry transient 422s | Retries at 1 s and 3 s | Same delays, with a per-attempt id so a retry cannot duplicate a review; only a validation 422 moves comments to the body | #41, PR #46 |
| Precomputed change impact | `impactPath`: changed declarations and their references, hard caps (24 candidates, 6 refs, 16 KB, 60 s) | Engine-side `git grep` of changed exported identifiers, put in the batch prompt. Not designed yet | #43 backlog |
| Durable PR summary | A `pullfrog-summary.md` the next run reads before reviewing new commits | Not adopted yet; the incremental marker plus open threads cover the current need | — |

## What Wachi does not take

- **Specialist subagents** (`reviewfrog`, one "falsifiable question" each). They move spend
  control to the model. If a verification pass is ever needed, the engine runs it, only on
  `blocker`/`fix` findings, with its own budget, and only if precision numbers ask for it.
- **An approval check and auto-merge.** Wachi is advisory (ADR 0001). A blocking check is
  deferred until blocker precision is measured (memory spec, decision 13).
- **Suggestion blocks.** Pullfrog supports them (`mcp/review.ts:729`) but its prompt pushes the
  concept plus a folded "Technical details" brief for an agent. Wachi states the failing
  condition, the consequence and the fix direction, with no suggestion block (memory spec,
  decision 11). The reason is Wachi's own: on a hard fix, suggested code spends tokens on what
  may not be the best solution.
- **Hosting the Claude subscription.** Pullfrog mints a one-year OAuth token
  (`sk-ant-oat01`, scope `user:inference`, the `claude setup-token` flow) and stores it on its
  backend. Wachi lets the user set their own API key, or their own `CLAUDE_CODE_OAUTH_TOKEN`
  secret if they choose to, and never stores it.
- **A hosted analytics dashboard.** Pullfrog's console (spend, runs, spend by repo) is fed by a
  `PATCH /api/workflow-run/{id}` carrying model, tokens and `costUsd` for each run. Wachi's
  answer keeps the data in GitHub ([usage dashboard spec](../specs/2026-10-31-usage-dashboard-design.md)).

## CodeRabbit

- **Path instructions** (`path_instructions`, rules per glob). Adopted as `rules/*.md` with
  `paths` frontmatter in `.github/wachi/` (ADR 0006). Also closes #5 (the ADR directory the
  prompt names is fixed).
- **Pre-merge checks in natural language**, with who may bypass a failing one. Deferred with
  the merge check.
- **Learnings.** CodeRabbit stores them server-side per repository or organisation, and has a
  command that gathers recent learnings and opens a PR against `.coderabbit.yaml`. Wachi keeps
  only the second half: `/wachi learn` opens a draft PR into the repository (ADR 0007). Nothing
  is stored server-side.
- **Linked-issue assessment** (does the PR meet the issue's acceptance criteria). Fits Wachi;
  in the backlog.
- **Not adopted for now:** walkthrough diagrams, "chill/assertive" profiles, server-side linters
  and SAST.

Sources: [path instructions](https://docs.coderabbit.ai/configuration/path-instructions) ·
[pre-merge checks](https://docs.coderabbit.ai/pr-reviews/pre-merge-checks.md) ·
[glossary](https://docs.coderabbit.ai/reference/glossary) ·
[VS Code](https://docs.coderabbit.ai/guides/use-vscode)

## Limits

- Pullfrog's server logic (which event triggers which mode, how the reviewed SHA and summary are
  stored) is closed. It was seen only through the calls the action makes.
- Its internal wiki (`wiki/review-approval.md`, `wiki/self-hosting.md`) is not in the repository.
- Security points marked "not found" are absences in the code, not proof of an exploitable hole.
- Line references are to v0.1.109; the observed run used v0.1.110.
