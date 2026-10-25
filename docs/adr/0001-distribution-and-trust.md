# ADR 0001: Distribution and trust

- **Status:** accepted as the direction. **Implementation pending:** the reusable workflow and the
  tags are not built yet. The command-line contract and the provider adapter boundary are in
  place (`docs/cli.md`); the copy-the-files template is the only install today.
- **Date:** 2026-10-25

## Context

The tool began as a kit that was copied by hand into each repository that wanted reviews. Copies
drift, and every fix has to be applied once per repository. The tool also runs with a model API
key, so anything that decides what code it runs is a security decision, not only a packaging one.

Claude Code's help documents `--restricted` (removes the built-in tools that run commands or
code, and `WebFetch`, unless `--tools` names them; ignores user, project and local settings,
while managed settings and an explicit `--settings` still apply), `--strict-mcp-config` and
`--max-budget-usd`. That is documentation, not a tested sandbox. The decisions below do not rely
on it being one.

## Decision

1. **A public repository with a clean history.** The engine, the workflow, the policy, the tests
   and these decisions are published here. Review quality and trust both benefit from the code
   being readable by the people who give it their key.
2. **A reusable workflow is the recommended GitHub integration; copying the files stays
   supported.** A consumer keeps a short caller workflow that owns the triggers, the secrets it
   passes and the `permissions` ceiling, and calls the reusable workflow, which runs the engine.
   A composite action is not built unless a concrete need appears that the reusable workflow
   cannot meet. A reusable workflow gives a job boundary and one place where the engine is
   checked out.
3. **Distribution is by Git ref: a floating major tag plus exact tags.** A tag such as `v1` moves
   only for backward-compatible releases; exact release tags and commit SHAs never move. Behaviour
   changes that are not backward compatible ship under a new major tag, which a consumer adopts by
   editing its caller workflow. A consumer that wants immutability pins a full commit SHA. Every
   review should record the exact engine commit it ran.
4. **The review policy is versioned separately from the engine.** The engine never picks a
   policy for the consumer; the consumer declares which policy and version it uses, and an update
   is a pull request to the consumer that shows the difference. An engine release or a floating
   tag never changes what reviews ask for.
5. **No `pull_request_target`.** It would give fork pull requests secrets, which is the usual
   route to running untrusted code with a key. Review triggers stay `pull_request` plus the
   operator's `@claude` comment.
6. **Fork and untrusted pull requests are excluded.** The tool is meant for repositories where
   everyone who can push is trusted. That boundary is a documented assumption, not a feature the
   engine enforces against a person who can edit the workflow. The consequence is that the
   reusable workflow accepts no operational limits (budgets, batch sizes) from the pull request.
7. **The agent is behind a provider adapter boundary.** The code that launches the agent is one
   function with one result type. Only Claude Code is implemented. A second provider has to bring
   its own sandbox (no shell, no network beyond the model, no credentials in its environment),
   its own structured output and its own cost accounting before it can be added; the engine does
   not assume that another agent CLI offers these.
8. **License: GNU AGPL-3.0-only.**

## Alternatives rejected

- **Keep copying the kit.** Acceptable for two repositories, but fixes would need a pull request
  in each one.
- **A composite action as the main integration.** It adds a second distribution surface and runs
  as steps inside the caller's job, with the caller's permissions and workspace, so the reviewed
  code and the engine share a job.
- **An npm package now.** Publishing brings an account, provenance and release overhead before the
  contract is stable. Deferred, not refused.
- **Pin by commit SHA only, with no floating tag.** The safest against supply-chain changes, but
  every fix needs a change in every consumer. It remains available to consumers who want it.
- **One version for engine and policy.** A bug fix in the engine would silently change what
  reviews ask for.
- **A policy fetched from a URL at run time.** A moving, unreviewed input to a job that holds the
  key.
- **`pull_request_target`.** Rejected in decision 5.

## Consequences

- The floating tag is a trust dependency on this repository's maintainers and its tag and branch
  protections. Whoever controls the tag controls code that runs with the consumers' API key.
- A fix lands once; consumers receive backward-compatible fixes through the floating tag, and
  policy or major-version changes only through their own pull requests.
- Two release lines (engine, policy) need a changelog each and a compatibility note.
- The published code includes the engine's prompts. Everything here is English.

## Residual risk

- On `pull_request`, GitHub runs the caller workflow from the pull request's own merge commit,
  so a pull request can edit the caller and the job holds the key. The only defence is the trust
  assumption above.
- `--restricted`, `--strict-mcp-config` and an explicit settings file reduce what a reviewed
  branch can make Claude Code load or run. They are claimed only for behaviours that tests show,
  never as a sandbox. Managed settings still apply, and self-hosted runners with managed settings
  are unsupported until tested.

## Non-goals

- Reviewing fork or otherwise untrusted pull requests.
- A hosted service, a queue, a Marketplace listing.
- Policy from external URLs, arbitrary executable extensions, or policy updates without a pull
  request.
- Making the review blocking.

## Reopen if

- A second maintainer or an outside user appears: revisit the npm package, release provenance and
  the trust model together. That is also the point to design public and fork pull requests, in a
  separate ADR.
- The reusable workflow cannot meet a real need: build a composite action and record the need.
- The floating major tag causes an unwanted behaviour change in a consumer: pin by commit SHA by
  default.
- Tests show that `--restricted` does not hold the properties this design relies on: shrink the
  security claims to what the tests show.
