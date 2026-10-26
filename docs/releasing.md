# Releasing

For the maintainer. Consumers call `review.yml@v1`, so a tag is a trust decision: whoever
controls it controls code that runs with the consumers' API key.

Releases are automated with [release-please](https://github.com/googleapis/release-please). Your
job is to merge the release pull request. Nothing is published to npm; that stays deferred.

Both `main` and the `v*` tags are protected by repository rulesets. `main` requires pull
requests, so every change, including a release, lands through one. Tags `v*` cannot be moved or
deleted except through a repository admin bypass; the alias step below needs that bypass.

Current state: the exact tags `v1.0.0-rc.1` and `v1.0.0-rc.2` exist (rc.2 is at `2646cdd` and passed
a live run in a consumer). `v1` still points at rc.1 until the owner moves it or release-please
does; `v1.0.0` has not been cut yet.

## How a release happens

1. Changes land on `main` with Conventional Commit titles (see README, "Commit messages").
2. On every push to `main`, `.github/workflows/release-please.yml` opens or updates one pull
   request titled `chore: release X.Y.Z`. It bumps `package.json` and adds a section to
   `CHANGELOG.md` from the commits since the last release. `feat:` is a minor bump, `fix:` and
   `perf:` a patch, `feat!:` or a `BREAKING CHANGE:` footer a major one.
3. You review the notes and merge that pull request.
4. On the merge, release-please creates the exact tag `vX.Y.Z` (immutable) and a GitHub Release
   with the same notes.
5. The last workflow step moves the floating major tag (`v1`) to the release commit.

Configuration: `release-please-config.json` and `.release-please-manifest.json`.

## The alias step

After a stable release of `1.x.y` the workflow runs, with `RELEASE_TAG_TOKEN`:

```sh
git tag -f v1 <release-sha>
git push -f origin v1
```

It skips pre-releases (a tag containing `-`). Consumers who pin `@v1` get the new release; the
exact tag `v1.x.y` and the SHA never move. If the secret is missing, or the push fails, the step
does not fail the run: it prints a warning and the two commands above in the run summary. Run
them as a repository admin. This is also the only manual tag instruction left.

## Secrets (in the `production` environment, created by the owner)

| Secret | Used for | Without it |
| --- | --- | --- |
| `RELEASE_PLEASE_TOKEN` | Opens the release PR and creates the tag and Release, so that CI runs on the release PR (events made with `GITHUB_TOKEN` do not start workflows) | Falls back to `GITHUB_TOKEN`: the release PR still opens, but CI does not run on it, so close and reopen it, or push to it, to start checks |
| `RELEASE_TAG_TOKEN` (optional) | Overrides the token used to move the `v1` tag, for owners who want a separate, narrower one. When absent, `RELEASE_PLEASE_TOKEN` moves the tag | Nothing changes: `RELEASE_PLEASE_TOKEN` is used |

One secret, `RELEASE_PLEASE_TOKEN`, is all that is needed; it is the same personal access token the maintainer's other repositories use. Create a fine-grained personal access token owned by a repository
admin (who is a bypass actor of the `v*` tag ruleset), with:

- Resource owner and repository access: only `niway-dev/agent-review`.
- Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**
  (**Metadata: Read** is added automatically).
- A short expiry; put the renewal date in your calendar. An expired token shows up as the alias
  warning, not as a failed release.

Settings, Environments, `production` (create it if missing), "Add environment secret". The release job declares `environment: production`; repository-level secrets are still readable, but an environment secret with the same name takes precedence. Do not add required reviewers or a wait timer to this environment: the job runs on every push to `main` and would block on them. The same personal access token can back both secrets, and the one already used by the maintainer's other repositories works here once its repository access includes this repository.

## Rules

- `v1` moves only for backward-compatible releases: bug fixes and additions that keep every
  input, secret and behaviour of `v1.x` working. A breaking change is `feat!:` and makes the
  next release `2.0.0`, which does not move `v1`; the alias step then creates and moves `v2`.
- A policy change (what reviews ask for, default budgets that change cost, trigger or permission
  changes) never rides a tag move. Ship it under a new major version, or as a pull request to
  each consumer.
- Exact tags (`v1.0.0`) and commit SHAs never move.
- Never create or edit `v*.*.*` tags by hand: release-please owns them.

## Pinning: `@v1` versus a SHA

- `@v1` follows every compatible release. Consumers use it to receive fixes without editing.
- `@v1.2.3` is immutable and readable.
- `@<40-character-sha>` is the strongest pin and what to use when freezing. The engine is checked
  out at the same commit as the workflow. To find a release's SHA: `git rev-parse v1.2.3^{commit}`.

## Hotfix

1. Branch from `main`, fix, and open a pull request titled `fix: ...`.
2. Merge it. The release pull request updates itself to the next patch version.
3. Merge the release pull request. `v1` moves to the fix.

If `main` has unreleased work that must not ship yet, hold the release PR unmerged only if the
other changes are already acceptable to ship, because it contains everything on `main`. There is
no maintenance branch: if one is ever needed, add a second release-please configuration for it.

## First release: `1.0.0`

The tags `v1.0.0-rc.1` and `v1.0.0-rc.2` already exist (and `v1` currently points at rc.1). The config sets
`"release-as": "1.0.0"` and the manifest says `1.0.0-rc.1`, so the first release pull request is
`chore: release 1.0.0`, built from the commits after the `v1.0.0-rc.1` tag. Merging it creates
`v1.0.0` and moves `v1`. The rc tags stay as history and are never deleted.

After that release, remove `"release-as"` from `release-please-config.json` in a normal pull
request (`ci: drop release-as after 1.0.0`); otherwise every later release would try to be
`1.0.0`.

The hand-written sections of `CHANGELOG.md` (everything under `1.0.0-rc.2` and below) stay as history;
release-please writes each new section above the first version heading, which is why the former
"Unreleased" heading is now `1.0.0-rc.2`.

## Before merging a release pull request

1. Confirm the release is backward compatible; if not, it is `2.0.0`.
2. Check that the caller template in `templates/` still matches the workflow's inputs.
3. Check that CI is green on the release pull request.
