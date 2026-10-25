# Releasing

For the maintainer. Consumers call `review.yml@v1`, so a tag is a trust decision: whoever
controls it controls code that runs with the consumers' API key. Protect tags `v*` in the
repository settings.

Current state: the annotated tags `v1.0.0-rc.1` and `v1` exist and point at the same commit. `v1`
floats; `v1.0.0` has not been cut yet.

## Rules

- `v1` moves only for backward-compatible releases: bug fixes and additions that keep every
  input, secret and behaviour of `v1.x` working.
- A policy change (what reviews ask for, default budgets that change cost, trigger or permission
  changes) never rides a tag move. Ship it under a new major version, or as a pull request to
  each consumer.
- Exact tags (`v1.0.0`, `v1.0.0-rc.1`) and commit SHAs never move.
- Tags are annotated, on a commit of `main` whose CI passed.

## Release candidate

```sh
git checkout main && git pull
git tag -a v1.0.0-rc.1 -m "v1.0.0-rc.1" <sha>
git push origin v1.0.0-rc.1
```

Use the next `rc.N` for each further candidate. A consumer tests a candidate by pinning
`@v1.0.0-rc.N` in its caller file.

## Final release and the floating tag

```sh
git tag -a v1.0.0 -m "v1.0.0" <sha>
git push origin v1.0.0
git tag -fa v1 -m "v1" <sha>
git push -f origin v1
```

`git tag -f v1 <sha>` followed by `git push -f origin v1` is the move. The tag stays annotated
if you pass `-a`. For a later `v1.x.y`, create the exact tag first, then move `v1` to the same
commit.

## Before each release

1. Move the CHANGELOG "Unreleased" entries under the new version.
2. Confirm the release is backward compatible; if not, it is `v2`.
3. Check that the caller template in `templates/` still matches the workflow's inputs.
