# agent-review

Advisory pull request reviews by an agent CLI, run inside your own GitHub Actions with your own
API key.

Each finding arrives as an inline review comment on its line, labelled "Should fix" or "Note",
and you can answer it in its thread. The review never approves, requests changes or blocks a
merge. For a large pull request the files are grouped into batches ordered by a risk score
computed from their paths, riskiest first, and each batch is one agent call with a spend cap, so
money bounds the run rather than pull request size. If some files are not reviewed, the first
line of the review says so.

Today the only agent is [Claude Code](https://claude.com/claude-code) (`claude -p`), behind a
small provider interface. The key stays in
your repository's secrets, and nothing is sent to a service run by this project.

## Status

**Release candidate: `1.0.0-rc.1` is tagged, and `v1` floats to it.** The reusable workflow has
run live in a private consumer across owners. The command-line contract is done: one
CLI (`src/cli.ts`, with a `bin` entry) and a provider adapter boundary, documented in
[docs/cli.md](docs/cli.md) and [docs/providers/claude-code.md](docs/providers/claude-code.md).
The reusable workflow is written against that contract. Until `v1.0.0` is cut, the CLI contract
may still change; the old `CLAUDE_REVIEW_*` variables,
the `<!-- claude-review sha=… -->` marker, `.github/claude-review.md` and the `@claude` mention
keep working, with a notice, so older installed copies can migrate gradually.

## Install

There are three ways. The first two work today; the third is deferred.

1. **Reusable workflow (recommended).** A short caller workflow in your repository
   calls a reusable workflow here. You choose the triggers, the secret and the permission
   ceiling; fixes arrive through a version tag.
2. **Copy the files .** Copy the `src/` folder and the workflow template into
   your repository and run `bun scripts/agent-review/cli.ts`. See
   [docs/setup-copy.md](docs/setup-copy.md).
3. **npm (later).** `package.json` already has a `bin` entry, so publishing is a step and not a
   restructure, but it is deferred until the contract is stable.

## Usage

```sh
bun --no-env-file --config=bunfig.toml src/cli.ts review <pr> [paths…] --repo-dir <head>
bun --no-env-file --config=bunfig.toml src/cli.ts comment <pr> --repo-dir <head>   # the comment is in $REQUEST
```

Settings, environment and exit codes: [docs/cli.md](docs/cli.md). The agent behind it, and what
its hardening covers: [docs/providers/claude-code.md](docs/providers/claude-code.md).

## Install with the reusable workflow

**Release candidate:** the tags `v1.0.0-rc.1` and `v1` exist. `v1` floats to compatible fixes; to
freeze, pin a full commit SHA instead.

Add this file as `.github/workflows/agent-review.yml`, save `ANTHROPIC_API_KEY` as a repository
secret and set your login as `operator`:

```yaml
name: Agent review
# Get the key at https://console.anthropic.com and save it as the repository secret ANTHROPIC_API_KEY.
# `v1` floats to compatible fixes; to freeze, replace it with a full commit SHA of this repository.
# First install: the installing pull request gets only the automatic review. `@agent-review review`
# and thread replies work from the next pull request, because `issue_comment` runs from the default branch.
on:
  pull_request: { types: [opened, ready_for_review] }
  issue_comment: { types: [created] }
permissions: { contents: read, pull-requests: write, issues: read }
jobs:
  review:
    uses: niway-dev/agent-review/.github/workflows/review.yml@v1
    with:
      operator: EDIT-THIS-github-login
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Full steps, settings and updates: [docs/install.md](docs/install.md). Maintainers:
[docs/releasing.md](docs/releasing.md).

## Security model

The agent can only read: Claude Code runs with `--restricted`, `--strict-mcp-config` and
`--tools Read,Glob,Grep`, so it has no shell and no MCP servers, ignores the reviewed branch's own
`.claude/` settings and hooks, and receives no GitHub token. The script, not the agent, holds the
tokens, posts the review, and refuses to post text containing your API key.

This is not a sandbox. You must trust everyone who can push to a repository that runs it, because
the workflow holds your key and a pull request can edit workflow files. Fork pull requests are
skipped. Do not use it to review code from people you do not trust. Details and what is still
unverified: [SECURITY.md](SECURITY.md).

## Design

[ADR 0001: distribution and trust](docs/adr/0001-distribution-and-trust.md); [ADR 0002: TypeScript on Bun, no runtime dependencies](docs/adr/0002-typescript-on-bun-zero-dependencies.md).
How the pieces fit together: [docs/architecture.md](docs/architecture.md).

## License

GNU Affero General Public License v3.0 only. See [LICENSE](LICENSE).
