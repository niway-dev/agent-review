# Changelog

## 1.0.0-rc.2 (hand-written, before release-please)

This section and everything below it were written by hand. From the first release-please release
(`1.0.0`) on, new sections are generated above it. Its heading is a version number on purpose:
release-please inserts each new release above the first version heading it finds.

### Release automation

- Releases are cut by release-please from Conventional Commits: merging its release PR creates the
  exact `vX.Y.Z` tag and a GitHub Release, bumps `package.json` and updates this file, then moves
  the floating `v1` tag. See `docs/releasing.md`.

### Security

- The reusable workflow checks the reviewed head out into `head/` and the engine into a sibling
  `engine/`, and runs Bun from `engine/` with `--no-env-file --config=bunfig.toml`, so a
  `bunfig.toml` `preload` or a `.env` in the head is never loaded into the process that holds the
  API key. New `--repo-dir <dir>` option (default `.`) for the head's path; the engine uses it for
  file reads and as the agent's working directory. New engine-owned `bunfig.toml`. The copy-the-files
  template uses the same flags and documents that it cannot fully separate engine and head. (#7)
- The Claude Code adapter builds the agent's environment from an allowlist (`PATH`, `HOME`,
  `TMPDIR`, `TERM`, `LANG`, `LC_*`, `ANTHROPIC_API_KEY`, `CLAUDE_CONFIG_DIR`, `CI`,
  `GITHUB_ACTIONS`) instead of the parent's environment minus two tokens. (#7)
- Hostile fixture `test/fixtures/hostile/` and tests for the Bun flags and the environment. (#7)
- The reusable workflow fails early when `operator` is empty or a template placeholder
  (`EDIT…`, `your-github-login`), and `comment` refuses the same values from
  `AGENT_REVIEW_OPERATOR`. (#12)

### Supply chain

- Workflows: `actions/checkout` and `oven-sh/setup-bun` are pinned by full commit SHA with the
  version in a trailing comment (also in `templates/caller-workflow.yml`); the actionlint image
  in CI is pinned by digest. Dependabot (`.github/dependabot.yml`) updates the action pins weekly.
- Claude Code install: the reusable workflow and the copy template no longer pipe
  `claude.ai/install.sh` into a shell. `src/install-claude-code.sh` downloads the pinned version
  and fails unless its SHA-256 matches the publisher's manifest. New optional input
  `claude_code_sha256` pins the hash independently. Default `claude_code_version` stays 2.1.304.
- Docs: how the binary is verified (`docs/providers/claude-code.md`), ruleset protection of
  `main` and `v*` tags (`docs/releasing.md`), supply-chain note (`SECURITY.md`).

## 1.0.0-rc.1 (2026-10-25)

Initial import of the review engine from a private kit. First release candidate.

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
