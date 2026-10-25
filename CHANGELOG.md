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
