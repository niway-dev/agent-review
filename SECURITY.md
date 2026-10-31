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
- **The engine never runs inside the reviewed head.** The reusable workflow checks the head out
  into `head/` and the engine into a sibling `engine/`, and starts Bun with `engine/` as its
  working directory, `--no-env-file` and `--config=bunfig.toml` (the engine's own file). Bun
  therefore does not load a `bunfig.toml` (whose `preload` runs code) or a `.env` file (which could
  set `ANTHROPIC_BASE_URL` or a proxy) from the head. The head's path is passed with `--repo-dir`.
  The agent CLI gets an allowlisted environment: no GitHub token, base URL, proxy or runtime
  option (see [docs/providers/claude-code.md](docs/providers/claude-code.md)).
- **The agent only reads.** Claude Code runs with `--restricted`, `--strict-mcp-config`,
  `--tools Read,Glob,Grep` and the adapter's own settings file (which denies `Bash` and `/proc`
  reads; see [docs/providers/claude-code.md](docs/providers/claude-code.md)). It has no shell,
  starts no MCP server, ignores the user, project and local settings of the branch under review, and gets no GitHub token in its environment. Each call has a spend cap.
- **The CLI holds the credentials.** It posts the review and posts nothing at all (it stops with an error) if any text it would post contains
  the API key, either the job's exact key or anything shaped like one. An encoded key would pass
  that check.
- **Only trusted people can start a run on demand.** Only the operator's `/wachi` comment (or its `@agent-review` and `@claude` aliases) starts
  an on-demand run, and only replies from `OWNER`, `MEMBER` or `COLLABORATOR` reach the agent.

- **Supply chain.** A consumer pins this reusable workflow to an exact release tag, which the
  `v*` tag ruleset forbids moving, and receives each release as a Dependabot pull request; the
  floating `v1` tag is not recommended (see [docs/install.md](docs/install.md)). Third-party
  actions in this repository's workflows are pinned by full commit SHA and updated by Dependabot. The Claude Code binary is downloaded at a pinned version and
  checked against a SHA-256 before it is installed; a consumer can pin that hash itself
  (see [docs/providers/claude-code.md](docs/providers/claude-code.md)).

This is not a sandbox. Managed Claude Code settings on the runner still apply.

## What from the head is executed, and what is read

Never executed by the engine: the head's Bun configuration and environment files, and its Claude
Code settings and hooks (see above). Still read as data: the head's files through the agent's read
tools, its `CLAUDE.md` (the prompt asks the agent to read it), and the focus file
`.github/agent-review.md`, whose text is appended to the prompt. Content the agent reads can still
try to steer the review (prompt injection); that is what the read-only tools, the budget caps and
the trust assumption are for.

The model's text cannot forge the engine's state: HTML comments in everything it writes are
neutralised, so it cannot write the incremental marker (which would make the next run skip
unreviewed commits) or the hidden signatures the engine uses to tell its reviews and threads from
other `github-actions[bot]` workflows. Until reviews posted before signatures existed are gone,
an unsigned review or thread in the old format is still accepted, and another workflow in the
same repository could imitate it.

The "copy the files" install cannot separate engine and head: the copied engine sits in the
consumer repository, so on `pull_request` it is the pull request's own copy. It uses the same Bun
flags, but the reusable workflow is the preferred install.

## What is unverified

- That Bun's `--no-env-file` and `--config=` keep out every runtime file. Only `bunfig.toml`
  `preload` and `.env` are tested (Bun 1.3.4, `test/bun-isolation.test.ts`); other files Bun can
  read from a working directory are avoided by never using the head as one, not by a test.
- The new workflow layout has not been exercised in a full paid run.

- Whether the `/proc` deny rules in the engine settings have any effect under `--restricted`.
- Whether the reviewed branch's `CLAUDE.md` is still loaded as memory under `--restricted`.
- The hardening flags have been checked to be accepted by the CLI, but they have not been
  exercised in a full paid review.

Claims about hardening are limited to what has been tested, and none is a guarantee against a
malicious branch.
