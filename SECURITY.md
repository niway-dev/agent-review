# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue. Use GitHub's private
vulnerability reporting: the "Report a vulnerability" button under this repository's Security tab.
It is enabled once the repository is public (GitHub does not offer it on private repositories).
Include what you did, what you expected and what happened.

This is a one-person project: reports are handled on a best-effort basis, with no SLA.

## Trust assumptions

The tool is safe to use only under these assumptions:

- **Only trusted people can push branches to a repository that runs it.** The review job holds
  your API key, and on `pull_request` GitHub runs the workflow file from the pull request's own
  branch. A person who can push can therefore change the workflow and read the key. Nothing in
  this tool defends against that.
- **Fork pull requests are excluded.** They get no secrets from GitHub, and the workflow skips
  them. The comment path checks that the pull request's head belongs to the same
  repository before it runs anything. `pull_request_target` is not used and must not be added.
- **The agent only reads.** Claude Code runs with `--restricted`, `--strict-mcp-config`,
  `--tools Read,Glob,Grep` and the adapter's own settings file (which denies `Bash` and `/proc`
  reads; see [docs/providers/claude-code.md](docs/providers/claude-code.md)). It has no shell,
  starts no MCP server, ignores the user, project and local settings of the branch under review, and gets no GitHub token in its environment. Each call has a spend cap.
- **The CLI holds the credentials.** It posts the review and refuses to post text that contains
  the API key, either the job's exact key or anything shaped like one. An encoded key would pass
  that check.
- **Only trusted people can start a run on demand.** Only the operator's `@agent-review` comment (or its `@claude` alias) starts
  an on-demand run, and only replies from `OWNER`, `MEMBER` or `COLLABORATOR` reach the agent.

This is not a sandbox. Managed Claude Code settings on the runner still apply.

## What is unverified

- Whether the `/proc` deny rules in the engine settings have any effect under `--restricted`.
- Whether the reviewed branch's `CLAUDE.md` is still loaded as memory under `--restricted`.
- The hardening flags have been checked to be accepted by the CLI, but they have not been
  exercised in a full paid review.

Claims about hardening are limited to what has been tested, and none is a guarantee against a
malicious branch.
