# agent-review

Advisory pull request reviews by an agent CLI, run inside your own GitHub Actions with your own
API key.

Each finding arrives as an inline review comment on its line, labelled "Should fix" or "Note",
and you can answer it in its thread. The review never approves, requests changes or blocks a
merge. For a large pull request the files are grouped into batches ordered by a risk score
computed from their paths, riskiest first, and each batch is one agent call with a spend cap, so
money bounds the run rather than pull request size. If some files are not reviewed, the first
line of the review says so.

Today the agent is [Claude Code](https://claude.com/claude-code) (`claude -p`). The key stays in
your repository's secrets, and nothing is sent to a service run by this project.

## Status

**Pre-release; the reusable workflow is in progress.** Nothing is tagged yet, and names
(environment variables, the review marker, the `@claude` mention) may still change before the
first release. The command-line contract (`src/cli.ts`) is the next piece of work, so there is no
`bin` entry in `package.json` yet.

## Install

There will be three ways. Only the second works today.

1. **Reusable workflow (recommended; coming).** A short caller workflow in your repository calls
   a reusable workflow here. You choose the triggers, the secret and the permission ceiling;
   fixes arrive through a version tag.
2. **Copy the files (documented today).** Copy the engine, its settings file and the workflow
   template into your repository. See [docs/setup-copy.md](docs/setup-copy.md).
3. **npm (later).** Deferred until the command-line contract is stable.

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

[ADR 0001: distribution and trust](docs/adr/0001-distribution-and-trust.md)

## License

GNU Affero General Public License v3.0 only. See [LICENSE](LICENSE).
