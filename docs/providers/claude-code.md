# Claude Code adapter

`AGENT_REVIEW_PROVIDER=claude-code` (the default). Implemented in `src/providers/claude-code.ts`;
its settings file is `src/providers/claude-code.settings.json`. It runs `claude -p` once per batch.

Requirements: the `claude` binary on the `PATH` (the reusable workflow and the copy template pin
version 2.1.304), and `ANTHROPIC_API_KEY` in the environment. A dry run
(`AGENT_REVIEW_DRY_RUN=1`) does not require the key and uses whatever login the machine has.
`preflight()` runs before any call is paid for and fails if the binary does not answer
`--version` or the settings file is missing.

## What the adapter does

| Engine asks for | Adapter passes |
| --- | --- |
| Tools `read`, `glob`, `grep` | `--tools Read,Glob,Grep` and `--allowedTools Read,Glob,Grep` |
| A spend cap | `--max-budget-usd <n>` |
| Extra directories | `--add-dir <dir>` for each |
| An output schema | `--output-format json --json-schema <schema>` |
| The prompt via stdin | The prompt on stdin, never as an argument (a large diff would exceed Linux's 128 KB limit) |
| The model | `--model <AGENT_REVIEW_MODEL>` |

Always added by the adapter, whatever the engine asks: `--restricted`, `--strict-mcp-config`,
`--settings <claude-code.settings.json>` and `--disallowedTools
Bash,Read(//proc/**),Grep(//proc/**),Glob(//proc/**)`. The settings file denies the same set.

The child process environment is the parent's without `GH_TOKEN` and `GITHUB_TOKEN`: the agent
never holds a GitHub credential; the engine posts.

The footer label is built from the model name and `claude --version`, for example "Claude Sonnet
5.5 via Claude Code 2.1.304". Credential detection (`leaksSecret`) matches the exact
`ANTHROPIC_API_KEY` and anything shaped like an Anthropic key; the engine refuses to post text
that matches. An encoded key would pass that check.

## What each hardening flag is for

- `--restricted`: removes the built-in tools that run commands or code, and `WebFetch`, unless
  `--tools` names them; ignores user, project and local settings, so the reviewed branch's own
  `.claude/` settings and hooks do not load. Managed settings and an explicit `--settings` still
  apply.
- `--strict-mcp-config`: no MCP servers other than those passed explicitly (none are).
- `--tools Read,Glob,Grep`: the only tools that exist.
- `--settings` and `--disallowedTools`: deny `Bash` and reads of `/proc`.
- `--max-budget-usd`: a soft, client-side cap. A call can overshoot it.

## What is verified and what is not

Verified:

- A prompt on stdin is accepted with `-p --restricted --strict-mcp-config --tools Read,Glob,Grep
  --output-format json`: a $0 local check with a fake key reached the API and ended in an
  `api_error` at cost 0.
- A live run of the batched engine (one batch, four files, four turns, about $0.07) reviewed every
  file and posted normally.

Not verified:

- That the `/proc` deny rules do anything under `--restricted`. `--restricted` confines file
  tools to the working directories, which may already exclude `/proc`, but nothing here proves
  it. The rules stay because they cost nothing.
- Whether the reviewed branch's `CLAUDE.md` still loads as memory under `--restricted`. The prompt
  asks the agent to read it explicitly.
- The hardening flags against a hostile branch. Stage 2 of the plan is to test them with hostile
  fixtures; until then none of this is a guarantee against a malicious branch.

This is not a sandbox. The trust assumption in [SECURITY.md](../../SECURITY.md) is what makes the
tool acceptable: everyone who can push to a repository that runs it is trusted.
