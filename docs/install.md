# Install with the reusable workflow

Tags: `v1` floats and moves only for backward-compatible releases; exact tags such as `v1.0.0-rc.2`
never move; pinning a full commit SHA is the strict option. Today `v1` still points at the
release candidate `v1.0.0-rc.1` until the owner or release-please moves it. A SHA must be a commit
of `niway-dev/agent-review`, not of your own repository (see "How updates arrive").

Your repository keeps one short caller file. It owns the triggers, the secret it passes and the
permission ceiling; the reusable workflow in this repository runs the engine.

## Three steps

1. **Add the caller file.** Copy
   [`templates/agent-review-caller.yml`](../templates/agent-review-caller.yml) to
   `.github/workflows/agent-review.yml`.
2. **Add the secret.** Create an Anthropic API key at <https://console.anthropic.com> and save it
   as the repository secret `ANTHROPIC_API_KEY` (Settings, Secrets and variables, Actions).
3. **Set the operator.** Replace `operator: EDIT-THIS-github-login` with the GitHub login of the
   one person who may start reviews by comment. Only that login's `@agent-review` (or
   `@claude`) comments start a run.
   The jobs fail with a clear error while `operator` is empty or still a placeholder
   (`EDIT…`, `your-github-login`), because anyone could register a placeholder login.

Open a pull request. The automatic review runs when it opens or leaves draft.

**First install:** the pull request that adds the caller file only gets the automatic review.
`@agent-review review` and replies in review threads start working from the next pull request,
because GitHub runs `issue_comment` workflows from the default branch.

## Optional: a focus file

Add `.github/agent-review.md` to say what this repository's reviews should look at beyond the
defaults (for example "payments code must never log card data"). It is read from the reviewed
branch, so treat it like any other file a pull request can change. It cannot add severities or
topics to the finding labels (see [cli.md](cli.md#finding-labels)).

## Optional: settings

The reusable workflow takes these `with:` inputs. Only `operator` is required.

| Input | Default | Meaning |
| --- | --- | --- |
| `operator` | none | Login allowed to start on-demand runs |
| `mention` | `@agent-review` | Mention that starts a run (`@claude` is also accepted) |
| `budget_usd` | `3` | Most one pull request review may spend |
| `batch_budget_usd` | `0.75` | Most one batch may spend |
| `answer_budget_usd` | `1` | Most one on-demand question may spend |
| `batch_lines` | `1000` | Changed lines per batch |
| `batch_chars` | `140000` | Diff characters per batch |
| `model` | `claude-sonnet-5-5` | Model the agent uses |
| `provider` | `claude-code` | Agent provider |
| `claude_code_version` | `2.1.304` | Pinned Claude Code version |
| `claude_code_sha256` | empty | Optional SHA-256 of the Claude Code binary for the runner platform; empty reads it from the publisher manifest (see [providers/claude-code.md](providers/claude-code.md)) |
| `bun_version` | `1.3.4` | Pinned Bun version |
| `skip_branch_prefixes` | `release-please--` | Comma-separated head branch prefixes that are not reviewed |

Input defaults are kept in sync by hand with the defaults in `src/config.ts`. CI pins Bun
separately from the `bun_version` input. `AGENT_REVIEW_EXCLUDE` and `AGENT_REVIEW_DRY_RUN` have no
input here; they exist only in the copy-the-files install.

## Checks before enabling

- The secret `ANTHROPIC_API_KEY` exists in the repository (or the organisation, shared with it).
- The operator login is yours, spelled exactly as on GitHub.
- The repository is not expecting fork reviews: fork pull requests are skipped on purpose.
- Everyone who can push to the repository is someone you trust with the key. Read
  [SECURITY.md](../SECURITY.md).

## How updates arrive

- **Compatible fixes** arrive through the floating `v1` tag: the maintainer moves it only for
  backward-compatible releases. Each run records the exact engine commit in its job summary.
- **A policy change or a new major version** never rides a tag move. It arrives as a pull request
  to your repository (a new `@v2` in the caller, or a policy update you review).
- **Pinning by SHA.** To freeze, replace `@v1` with a full commit SHA *of this repository*
  (`niway-dev/agent-review`, not of your own repository), for example
  `uses: niway-dev/agent-review/.github/workflows/review.yml@<40-character-sha>`. The engine is
  checked out at the same commit, so engine and workflow can never differ. You then update by
  editing the SHA.

## Private repositories

- Calling a workflow across owners requires this repository to be public, and it is. If it were
  private, only repositories that are allowed to use it could call it.
- Same organisation, private use: set this repository's Settings, Actions, General, Access to
  "Accessible from repositories in the organisation".
- The workflow checks the engine out with the job's own token. A token for your repository
  cannot read another private repository, so a private engine repository is not expected to work
  without extra setup.
- Verified live: a private repository owned by a different user than this repository's
  organisation called `@v1`, and the engine checkout resolved the tag across owners with the
  job's own token.
