# Changelog

## Unreleased

Initial import of the review engine from a private kit. Nothing is tagged yet.

- `src/claude-review.ts`: the engine. Reviews a pull request with `claude -p` in batches ordered
  by risk, posts inline review comments, and answers the operator's `@claude` comments.
- `src/claude-review.test.ts`: tests for the pure functions (no network).
- `src/engine-settings.json`: the engine's own Claude Code settings (denies `Bash` and `/proc`).
- `templates/caller-workflow.yml`: the four-file workflow template.
- `docs/setup-copy.md`: setup by copying the files.
- `docs/adr/0001-distribution-and-trust.md`: why the tool is public, how it will be distributed,
  and where its trust ends.
- `README.md`, `SECURITY.md`, `LICENSE` (GNU AGPL-3.0).

### CLI contract and provider adapter

- `src/cli.ts`: the command-line entry point (`review <pr> [paths…]`, `comment <pr>`, `--help`,
  `--version`), with exit codes 0 (posted or nothing to do), 1 (engine error) and 2 (usage error).
  `package.json` gets a `bin` entry. Documented in `docs/cli.md`.
- `src/providers/`: the `ProviderAdapter` interface (`types.ts`), the Claude Code adapter
  (`claude-code.ts`, with its settings file renamed to `claude-code.settings.json`) and
  `getProvider`. The engine no longer contains any Claude Code flag or binary name. Documented in
  `docs/providers/claude-code.md`.
- `src/claude-review.ts` is renamed `src/engine.ts`; settings are read once by `src/config.ts`.
- Environment variables are now `AGENT_REVIEW_*`; each falls back to the old `CLAUDE_REVIEW_*` with
  a deprecation notice. New: `AGENT_REVIEW_PROVIDER`, `AGENT_REVIEW_MENTION`,
  `AGENT_REVIEW_OPERATOR` and, optionally, `AGENT_REVIEW_COMMENT_AUTHOR`.
- The review marker written is `<!-- agent-review sha=… -->`; the old `<!-- claude-review sha=… -->`
  is still read.
- The mention keyword is `@agent-review` (configurable); `@claude` is accepted as an alias.
- The footer names the provider and model, for example "Claude Sonnet 5.5 via Claude Code 2.1.304".
- The review focus file is `.github/agent-review.md`; `.github/claude-review.md` is still read
  with a notice.
- The workflow template and `docs/setup-copy.md` use the new names and paths.
- Tests: an end-to-end run of the batch loop against a fake provider, tests for the adapter, the
  settings, the CLI and both markers and mentions; fixtures use neutral names.
- `SECURITY.md`: reports are handled best-effort, with no SLA.

### Reusable workflow

- `.github/workflows/review.yml`: the reusable workflow (`workflow_call`). Two jobs, `review` and
  `on-demand`, that check out the head as data and the engine at the called workflow's commit.
- `templates/agent-review-caller.yml`: the short caller file consumers add.
- `docs/install.md`, `docs/releasing.md`: installation and the tag rules.
- `.github/workflows/ci.yml`: tests and actionlint for this repository.
