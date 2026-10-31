# Architecture

This document describes `main` after PR #6 and PR #13 (both merged): the engine runs from a
sibling `engine/` checkout, the reviewed head is passed as `--repo-dir`, and the agent gets an
allowlisted environment. Decisions and their reasons are in the ADRs
([0001](adr/0001-distribution-and-trust.md), [0002](adr/0002-typescript-on-bun-zero-dependencies.md));
this page is how the system works and what a change has to keep true.

## Thesis

The model only judges. Everything that code can decide, code decides, before and after the call.
A model that is handed a whole pull request chooses what to read, rations its own effort, and
posts in an inconsistent shape: some files get read closely, some not at all, and nobody can tell
which. So the engine picks the files, orders them by risk, cuts them into batches the model can
read completely, puts the numbered diff in front of it, forces a structured answer, checks that
every file is accounted for, spends a budget it controls, and does the posting itself. The model
returns findings and a list of what it read; the code turns that into a GitHub review.

## The flow

```
 review <pr>                                   comment <pr>  ($REQUEST)
     |                                              |
     |                              operator check, author check, parseCommand
     |                                      |                    |
     |                                  "review ..."         anything else
     v                                      v                    v
 listFiles --> since last marker? --> filterFiles --> planBatches     answer(): 1 call,
 (gh api)      (compareFiles)        (exclude, scope)  (risk, modules)  free text
                                                          |                |
              per batch, riskiest first, until budget ends|                |
                  buildBatchPrompt --> provider.run --> batchGaps          |
                  (diff in stdin)      (read-only,       |-- gaps: one     |
                                        JSON schema,     |   retry         |
                                        per-batch cap)   v                 |
                                              mergeOutputs --> buildReview |
                                                                  |        |
                              refuseLeak --> postReview (COMMENT) <+-------+
                                             inline + body + coverage + marker
```

## The pipeline, stage by stage

All names are in `src/engine.ts` unless a file is given.

1. **Filter.** `listFiles` reads the changed files from GitHub. `lastReviewedSha` finds the last
   `<!-- agent-review sha=... -->` marker (the old `claude-review` marker is still read) in the
   tool's own reviews. A review is the tool's only if `github-actions[bot]` wrote it and it
   carries the `<!-- wachi:review -->` signature, because every workflow of the repository posts
   as that same account. The marker counts only as the last line of the body, right after the
   signature (`readSignedMarker`); one anywhere else is ignored. Reviews posted before signatures
   existed (marker right after `</sub>`) are read only while they come before the first signed
   review and were created before `LEGACY_CUTOFF` (2026-11-01); if that commit is behind the head, `compareFiles` narrows the review to what
   changed since (`status === "ahead"`), otherwise it reviews the whole pull request. `resolveScope`
   turns `review <paths>` words into paths and ignores words that name no changed file.
   `filterFiles` then drops `DEFAULT_EXCLUDE` (lockfiles, build output, snapshots, source maps,
   generated files) plus `AGENT_REVIEW_EXCLUDE`. *Why:* paying a model to read a lockfile buys
   nothing, and re-reading commits it already saw buys less. Binary and very large files are not
   dropped here: GitHub sends no patch for them, and the prompt tells the model to read the file
   itself or record a closed skip reason (`SKIP_REASONS`).

2. **Risk score.** `riskScore` gives each path a weight: the highest matching rule in `RISK_RULES`
   (workflows, process boundaries, credentials and access control, dependencies, migrations,
   scripts, shell, infrastructure), else a base weight by `fileKind` (code 4, tests 2, docs 1).
   *Why:* when money runs out, the part that was read must be the part where a defect costs most.

3. **Batching.** `planBatches` groups files by `moduleKey` so a module's code, tests and docs share
   a call, orders modules by their riskiest file, and packs them into batches of at most
   `AGENT_REVIEW_BATCH_LINES` changed lines and `AGENT_REVIEW_BATCH_CHARS` characters of diff. A
   file over either limit gets a batch of its own. Inside a batch, code comes before tests before
   docs. *Why:* a batch the model can read in full keeps it from skimming, and risk order makes the
   budget cut-off land on the least important files.

4. **Prompt assembly.** `buildBatchPrompt` writes, in order: the pull request and commit, the
   instruction to read `CLAUDE.md` and the ADRs first, the full file list for orientation, the
   batch's own file list, the line-number convention, the review instruction, the thread
   instruction when open threads exist, the label rules (`RULES`: each severity with the test a
   finding must pass, each topic, the combination rules, and the instruction not to report that a
   decision record is edited, since the engine does that, and the evidence rules: cite the line
   behind every premise of a "blocker" or "fix" or ask it as a "question", suggest a fix only for
   the failure shown, search all callers of a shared contract, no escape clauses), the
   repository's focus file
   (`repoFocus`, `.github/agent-review.md`) and last the diff. `annotateDiff` prefixes each diff
   line with its line number in the file at the head, so a finding's `line` is one GitHub can anchor
   a thread to. The prompt goes to the provider through stdin because a large diff would exceed
   the argument-length limit. It includes the no-rationing sentence: "You do not manage a budget:
   the harness that runs you enforces its own limits, so never shorten your reading to save
   effort." The review instruction also asks the model to read a file in full before reporting a
   finding on it. *Why of the evidence rules:* in a real review the model stated a premise as fact
   that a line outside the diff's hunks disproved, and extended a correct fix to a code path whose
   comment said why it must not change; both cost the owner more than the extra reading costs.
   Precision is measured from the owner's verdict replies (`docs/precision.md`). *Why of the
   no-rationing sentence:* the model reasons about effort it cannot see; the harness owns the budget, so
   the model should not trade coverage for it.

5. **The provider call.** `reviewBatch` writes `pr.json` and `threads.json` to a scratch directory
   and calls `deps.provider.run` with the read-only tools (`read`, `glob`, `grep`), `SCHEMA` as the
   output schema (files reviewed, files skipped with a closed reason, findings, thread replies,
   summary), the head as the working directory and a per-batch spend cap. *Why:* a structured
   answer is what makes coverage checkable; read-only tools are what make the call safe to run
   with the key (see the harness below).

6. **Coverage check and retry.** `batchGaps` returns the files of the batch the model did not list
   as reviewed. A skip counts only with a closed reason and only for a file GitHub sent no diff
   for. If there are gaps and budget remains, the batch runs once more with only those files
   (`retry: true` in the prompt). Files still unaccounted for after that make the review partial.
   *Why:* silence about a file is the failure that cannot be seen from the outside, so the code
   asks again once and then reports honestly.

7. **Budget arithmetic.** `review` tracks `spent` across the whole pull request. Each call is
   capped at `min(AGENT_REVIEW_BATCH_BUDGET_USD, remaining)`. A batch is not started when less
   than `MIN_BATCH_USD` (0.05) remains; its files are listed as "not reached: the pull request's
   budget was spent". `attempt` catches a call that died without a result and counts it at its
   cap, because what it spent is unknown. The cap passed to Claude Code is soft, so `spent` can
   exceed the total slightly. If every batch ran out of budget, the review is a short body saying
   so. *Why:* money, not pull request size, bounds the run, and an unknown cost is assumed to be
   the worst case.

8. **Merge and posting.** `mergeOutputs` joins the batches: `dedupeFindings` keeps one finding
   per path, line and topic (the higher severity wins, blocker > fix > consider > info), it merges
   skips, and treats a file reviewed in a retry as reviewed. `adrNotices` then adds one
   `⚪🏛️ Info · adr` finding for every reviewed file under a `docs/adr/` directory, deduplicated with
   the model's findings the same way. `buildReview` labels each finding with `label` (two emojis,
   then severity, topic and title in words, from the `SEVERITY` and `TOPIC` tables, the only place
   the emojis live), turns findings on commentable lines (`commentableLines`: added and context
   lines of the patch) into inline comments, puts the rest under "Outside the diff", and puts every
   `info` finding under "For your information", never inline, because information needs no reply.
   The count line (`countLine`) reads "N finding(s): B blocker(s), F to fix, C to consider" and
   omits empty groups.
   It writes a first line saying whether coverage is complete or partial, the summary, a "Coverage
   by batch" table, a footer with the model label, batch count and cost, and, only for a complete,
   unscoped review, the marker for the next incremental run. Every piece of model text (summary,
   finding titles and bodies, thread replies, answers) and every repository-controlled string
   (file names in the lists and the moved findings, batch labels, skip reasons) goes through
   `neutralise`, which turns `<!--` and `-->` into entities, so neither the model nor a file name
   can write a marker or a signature. The engine
   adds the signatures itself: `<!-- wachi:review -->` in the review body, `<!-- wachi:finding -->`
   in each inline comment, `<!-- wachi:reply -->` in each thread reply. The body is kept under
   `MAX_BODY_CHARS`, shortening only the list of unreviewed files (`fitList`). `refuseLeak` asks
   the provider's `leaksSecret` about every piece of text about to be posted and aborts the
   whole post if one matches. `postReview` sends one review with `event: "COMMENT"`. `gh` failures
   are `GhError`s carrying the HTTP status and GitHub's message. A 422 saying "An internal error
   occurred, please try again" is transient: the same review is retried after 1 s and 3 s, and
   before each retry the engine looks for a review signed `<!-- wachi:review -->` at the same
   commit, because the POST may have landed. Only a validation 422 (a line GitHub cannot anchor)
   makes `moveCommentsToBody` post the comments in the body, cut to `MAX_BODY_CHARS` with an
   "N more not shown" note. Any other error (auth, permission, rate limit, network) is rethrown:
   no degraded review is posted. Replies to
   open threads are posted only for comment ids the engine itself handed over. *Why:* the model
   cannot approve, request changes, invent a thread id or move the incremental marker past a file
   nobody read.

9. **The conversation path.** `comment` (called by `src/cli.ts comment`) first runs
   `operatorProblem` (an empty or template-placeholder operator is an error), then ignores a
   comment whose author is not `AGENT_REVIEW_OPERATOR`, then `parseCommand` looks for the mention
   (`/wachi` by default; `@agent-review` and `@claude` always). `review [paths]` runs the pipeline above;
   anything else goes to `answer`: one provider call with `AGENT_REVIEW_ANSWER_BUDGET_USD`,
   free-text output, the pull request metadata and full diff in a scratch directory, the same leak
   check, posted as a pull request comment. Thread replies work through the review path: with a
   previous marker, `openThreads` fetches the tool's unresolved threads (first comment by `github-actions` and
   carrying the finding signature, or, until `LEGACY_CUTOFF`, an unsigned comment in the
   old label format created before that date) and `openBotThreads` keeps only replies from `OWNER`, `MEMBER` or `COLLABORATOR`, so a stranger's reply on a public
   repository never reaches the model. `assignThreads` hands each thread to the batch that holds
   its file. *Why:* the operator gate is enforced twice (workflow and CLI) because only one of
   them can fail loudly.

## The execution harness

`.github/workflows/review.yml` is a reusable workflow (`workflow_call`) with two jobs.

| Job | Runs when | What it does |
| --- | --- | --- |
| `review` | `pull_request`, not a draft, head repository equals the calling repository, actor is not Dependabot | Checks the operator input, skips branches with a prefix in `skip_branch_prefixes`, then runs `cli.ts review` |
| `on-demand` | `issue_comment` on a pull request, commenter login equals `operator`, body contains the mention, `@agent-review` or `@claude` | Checks the operator input, refuses a pull request whose head repository is not the calling repository, then runs `cli.ts comment` |

Both have a 30-minute timeout and a concurrency group per pull request (not per workflow, so a
skipped `on-demand` never cancels a review). Both run with `contents: read` and
`pull-requests: write` (`issues: read` for `on-demand`).

**Sibling checkout layout.** The head goes into `head/` with `persist-credentials: false`. The
engine goes into `engine/`, checked out from `job.workflow_repository` at `job.workflow_sha`, so
the engine version always equals the called workflow's version. Bun is started with `engine/` as
its working directory:

```
bun --no-env-file --config=bunfig.toml src/cli.ts review "$PR" --repo-dir "$GITHUB_WORKSPACE/head"
```

*Why:* Bun reads `bunfig.toml` (whose `preload` runs code) and `.env` from the working directory.
If the head were the working directory, a pull request could run code, or point
`ANTHROPIC_BASE_URL` at another host, inside the process that holds the key. With `engine/` as the
working directory, `--no-env-file` and `--config=` (the engine's own minimal `bunfig.toml`; write
it with the equals sign, `-c <path>` did not replace the working directory's config in Bun 1.3.4),
nothing from the head is loaded. `test/bun-isolation.test.ts` checks this with a hostile fixture.

**Environment.** The workflow passes inputs to the engine as `AGENT_REVIEW_*` variables and the
comment text as `REQUEST`; untrusted text is never interpolated into a `run:` script. The Claude
Code adapter builds the agent's environment from `CHILD_ENV_ALLOWLIST` (`PATH`, `HOME`, `TMPDIR`,
`TERM`, `LANG`, `LC_*`, `ANTHROPIC_API_KEY`, `CLAUDE_CONFIG_DIR`, `CI`, `GITHUB_ACTIONS`), so the
agent never receives `GH_TOKEN`, a base URL, a proxy, `NODE_OPTIONS`, `BUN_*` or `LD_PRELOAD`.

**Claude Code flags** (`buildClaudeArgs` in `src/providers/claude-code.ts`; details in
[providers/claude-code.md](providers/claude-code.md)):

| Flag | What it removes |
| --- | --- |
| `--restricted` | Built-in tools that run commands or code, `WebFetch`, and the user, project and local settings of the head (its `.claude/` hooks do not load) |
| `--strict-mcp-config` | Any MCP server the head's configuration would start |
| `--tools Read,Glob,Grep` | Every tool except these three |
| `--settings` and `--disallowedTools` | `Bash` and reads of `/proc` (the second is unverified) |
| `--max-budget-usd` | Unbounded spend per call (a soft cap) |

The binary itself is installed by `src/install-claude-code.sh` at a pinned version and checked
against a SHA-256. Third-party actions are pinned by commit SHA.

**What from the head is read as data, and what is never executed.** The engine reads the focus
file `.github/agent-review.md` from the head and appends it to the prompt. The agent reads the
head's files and `CLAUDE.md` through its read tools. Both can try to steer the review (prompt
injection); the read-only tools, the budget caps and the trust assumption are the answer. The
engine never executes the head's Bun configuration, `.env`, Claude Code settings or hooks.

**Still unverified** (from [SECURITY.md](../SECURITY.md)): that `--no-env-file` and `--config=`
keep out every runtime file (only `bunfig.toml` `preload` and `.env` are tested, on Bun 1.3.4);
that the new layout has been through a full paid run; whether the `/proc` deny rules do anything
under `--restricted`; whether the head's `CLAUDE.md` still loads as memory under `--restricted`;
and the hardening flags against a hostile branch beyond the fixtures. None of this is a sandbox,
and the assumption that everyone who can push is trusted is what holds it together.

## The provider adapter boundary

`src/providers/types.ts` defines `ProviderAdapter`:

| Member | Contract |
| --- | --- |
| `name` | The value of `AGENT_REVIEW_PROVIDER` that selects it |
| `preflight()` | Throws before any call is paid for when the binary, settings or credential is missing |
| `modelLabel()` | Text for the review footer |
| `leaksSecret(texts)` | True when any text holds a credential of this provider; the engine throws and posts nothing |
| `run(request)` | One call to completion: returns structured output or text, cost, turns, duration and a terminal reason (`success`, `budget`, `error`); throws when there is no result at all |

The request carries the prompt, the working directory, extra readable directories, neutral tool
names (`read`, `glob`, `grep`), the spend cap, an optional output schema and whether the prompt
goes through stdin. `getProvider` in `src/providers/index.ts` maps a name to an adapter and
rejects unknown names as a usage error.

Engine-owned: filtering, risk, batches, retries, coverage, budgets, posting, threads. Adapter-owned:
the binary and its flags, the settings file, the child environment, tool-name mapping, cost and
terminal-reason extraction, the credential shape.

**Rule for a second provider.** It is added only when a consumer needs it or a measured comparison
is wanted, and it must bring its own sandbox story (no shell, no network beyond the model, no
credentials in its environment), its own structured-output path and its own cost accounting.
There is no plugin system. The interface is drawn from one example, so expect to redraw it when
the second adapter does not fit.

## Configuration

Settings are read once by `loadConfig` in `src/config.ts`; each `AGENT_REVIEW_X` falls back to the
deprecated `CLAUDE_REVIEW_X` with a notice. Full descriptions are in [cli.md](cli.md).

| Variable | Default | Where the default lives |
| --- | --- | --- |
| `AGENT_REVIEW_BUDGET_USD` | `3` | `src/config.ts`; workflow input `budget_usd` |
| `AGENT_REVIEW_BATCH_BUDGET_USD` | `0.75` | `src/config.ts`; input `batch_budget_usd` |
| `AGENT_REVIEW_ANSWER_BUDGET_USD` | `1` | `src/config.ts`; input `answer_budget_usd` |
| `AGENT_REVIEW_BATCH_LINES` | `1000` | `src/config.ts`; input `batch_lines` |
| `AGENT_REVIEW_BATCH_CHARS` | `140000` | `src/config.ts`; input `batch_chars` |
| `AGENT_REVIEW_MODEL` | `claude-sonnet-5-5` | `src/config.ts`; input `model` |
| `AGENT_REVIEW_PROVIDER` | `claude-code` | `src/config.ts` and `DEFAULT_PROVIDER` in `src/providers/index.ts`; input `provider` |
| `AGENT_REVIEW_MENTION` | `/wachi` | `src/config.ts` and `DEFAULT_MENTION`; input `mention`; `@agent-review` and `@claude` are `MENTION_ALIASES` |
| `AGENT_REVIEW_OPERATOR` | none (required by `comment`) | no default; validated by `operatorProblem`; input `operator` is required |
| `AGENT_REVIEW_EXCLUDE` | none | `src/config.ts`; no workflow input |
| `AGENT_REVIEW_DRY_RUN` | off | `src/config.ts`; no workflow input |
| `AGENT_REVIEW_COMMENT_AUTHOR` | none | read in `src/cli.ts`; set by the `on-demand` job |

The built-in exclude list (`DEFAULT_EXCLUDE`), risk rules (`RISK_RULES`), label rules (`RULES`,
`SEVERITY`, `TOPIC`),
the output schema (`SCHEMA`) and `MIN_BATCH_USD` are constants in `src/engine.ts`, not settings.
When the engine runs through the reusable workflow, the workflow always passes its inputs, so the
workflow defaults are the ones consumers get; the `src/config.ts` defaults apply to direct CLI use
and the copy-the-files install. The two sets must stay equal.

## Invariants a change must keep

- No `pull_request_target` trigger, anywhere, and no caller template that adds one.
- No `secrets: inherit`: the caller passes `ANTHROPIC_API_KEY` explicitly.
- Fork pull requests never run: the `review` job checks the head repository, the `on-demand` job
  checks it before it reads the head.
- Untrusted text (a comment body, a branch name, a pull request title) is never interpolated into
  a `run:` script; it goes through `env:`.
- The model never approves or requests changes. The review event is always `COMMENT`.
- The incremental marker is written only when the review is complete and unscoped, that is, when
  every file is accounted for.
- Model text is neutralised (`neutralise`) before it is posted, and ownership of a review or a
  thread is the `github-actions[bot]` login plus an engine-written signature, never the login
  alone. The unsigned legacy branches (`lastEngineMarker`, `isWachiFinding`, `precision.ts`) are a
  deprecation window for items created before `LEGACY_CUTOFF` (2026-11-01); an unsigned item after
  it is treated as another workflow's imitation. Delete the branches once the date has passed.
- The reviewed head is never the engine's working directory, and the engine never executes
  anything from it.
- The agent gets read tools only, an allowlisted environment and no GitHub token.
- Budgets and batch sizes come from the caller's inputs or the environment, never from the pull
  request.
- Only the operator can start an on-demand run, and only replies from `OWNER`, `MEMBER` or
  `COLLABORATOR` reach the agent.
- Text containing the key or something shaped like one is not posted.
- Third-party actions stay pinned by full commit SHA, and the Claude Code binary stays pinned and
  hash-checked.

## Known limits and open issues

- Open issues: [#5](https://github.com/niway-dev/wachi-reviewer/issues/5) (the ADR directory the
  prompt names is fixed), [#8](https://github.com/niway-dev/wachi-reviewer/issues/8) (one account
  moving the floating `v1` tag changes the code every consumer runs with its key),
  [#10](https://github.com/niway-dev/wachi-reviewer/issues/10) (the focus file and `CLAUDE.md` are
  read from the pull request head), [#11](https://github.com/niway-dev/wachi-reviewer/issues/11)
  (posted output is checked only for the key's exact value and shape, so an encoded key passes).
  Issue [#9](https://github.com/niway-dev/wachi-reviewer/issues/9) (pin actions by SHA) is still
  open although the workflows are pinned on `main`.
- The review is advisory and trusts everyone who can push to the repository.
- Two adapters exist, Claude Code and Codex (ADR 0004). The reusable workflow installs only Claude Code so far.
- Thread context is bounded: the first 100 review threads and 30 comments per thread.
- The risk rules and `moduleKey` encode path conventions that fit some repository layouts
  (`apps/*/src`, `ipc`, `preload`, `main`) better than others.
- An on-demand answer is one call over the whole diff with no batching or coverage check.
- Neither workflow job has been exercised end to end in a full paid run on a hosted runner.
