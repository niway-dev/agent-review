# ADR 0004: A second provider, Codex, for reviews by OpenAI models

- **Status:** accepted for the engine; the workflow integration is a follow-up
- **Date:** 2026-10-26

## Context

Every step of the owner's pipeline runs on Claude: the code is written, reviewed during
development and reviewed by this tool with Claude models. A reviewer from the same model family
shares the author's blind spots. Practitioners whose pipelines the owner follows use a second
provider for exactly this: tstack's `sol-loop` reviews every change with OpenAI's GPT Sol until both
models agree, and pstack's `/interrogate` has models from different providers try to break a diff.
The owner also finds OpenAI models better at describing issues.

The provider boundary (`src/providers/types.ts`) was drawn from one example and named its own
condition for a second adapter: it must bring its own sandbox story, its own structured-output path
and its own cost accounting.

## Decision

Add a `codex` provider that runs the Codex CLI (`codex exec`), selected with
`AGENT_REVIEW_PROVIDER=codex`, defaulting to the model `gpt-6.1-sol`.

- **Sandbox story.** Codex has no read-only tool list; its model reads through shell commands. The
  adapter uses Codex's read-only sandbox, starts the session in an empty scratch directory with
  fresh `HOME` and `CODEX_HOME` so nothing from the reviewed branch or the runner's home loads,
  keeps the environment out of the model's shell, and disables every feature that opens a network
  path, starts agents or runs hooks. Each measure is in `docs/providers/codex.md` with the test
  that showed it was needed.
- **Structured output.** `--output-schema` with the engine's schema and `--output-last-message`;
  the adapter parses the last message as JSON. The engine's schema already met the strict-schema
  rules.
- **Cost accounting.** Codex reports tokens. The adapter prices them from a per-model table, with an
  override for models not in it, and bounds each call by time because Codex has no spend cap.

The interface did not need to be redrawn. `ProviderRequest.allowedTools` is enforced as "reads
only", and `cwd` is told to the model as an absolute path instead of being the session directory.

## Alternatives rejected

- **The OpenAI Responses API directly, with our own read tools.** It would give a true tool list
  like Claude Code's, but the engine would then own an agent loop, file tools and their path
  confinement: code that runs beside the key, against ADR 0002's aim of keeping that code small.
- **"The latest Sol" instead of a pinned model.** tstack picks the newest Sol at run time. A
  reviewer whose model changes without a commit makes the precision measurements incomparable and
  a regression untraceable.
- **Starting Codex in the head, like Claude Code.** Tested: a skill planted in the branch loaded and
  was obeyed.

## Consequences

- A consumer can review with an OpenAI model once the workflow follow-up installs Codex and passes
  `OPENAI_API_KEY`. Until then the provider runs from the CLI and in the copy-the-files install only
  if the consumer installs Codex themselves.
- The Codex adapter's residual risk is higher than Claude Code's: the model can run commands, and
  the key is readable inside the sandbox. The network is closed and `leaksSecret` guards the
  answer; the caller's trust assumption still carries the rest.
- Budgets with this provider are only as accurate as the price table.

## Non-goals

- Running two providers on one pull request (an adversarial or council review). This ADR makes the
  second reviewer available; how the two are combined is a separate decision.
- Other OpenAI-compatible endpoints or local models.

## Reopen when

Codex gains a read-only tool list (then match Claude Code's posture), the Linux sandbox on GitHub
runners fails the network or environment checks, or the engine needs a provider the interface
cannot express.
