# Bug-mining scripts (throwaway)

These produced [the bug catalogue](../kaipu-record-bug-catalogue.md) on 2026-10-30. They are kept
for provenance, not as part of Wachi: they are Python, assume a read-only clone of
niway-dev/kaipu-record under `/tmp/kaipu-mine/repo`, and use `gh` for reads only. `BRIEF.md` is
the shared brief the mining agents worked from. Run any of them with `python3 -I`.

- `szz.py`: SZZ for a commit range (blame the lines a fix removed or changed, on its parent).
- `c2pr.py`: map each commit to the PR that brought it to `main`.
- `fetchrev.sh`, `revsum.py`, `showrev_c.py`: cache and summarise a PR's review comments.
- `body.py`: print PR bodies.
- `gen_C.py`, `d1_build.py`, `d2_build.py`, `assemble.py`, `runall.py`: per-batch catalogue
  builders and the final assembly.
