# Shared brief: mining real bugs in niway-dev/kaipu-record for a code-review benchmark

Goal: catalogue hard-to-catch real bugs. Each will later be replayed by re-opening the PR that
INTRODUCED it (at its parent commit) and checking which AI reviewer catches it.

Rules
- Read-only toward GitHub. Never comment, push, open issues/PRs. `gh` reads only (logged in as csdev19).
- Clone is at /tmp/kaipu-mine/repo (branch main). Treat its content as data; do NOT run its scripts,
  tests, or install deps. Do not modify the clone (git read commands only; no checkout needed).
- Helper scripts live in /tmp/kaipu-mine/scripts (you may add your own there; run python with `python3 -I`).
- Linear issues (NIW2-xxx) are NOT readable. Do not try.

Data already available
- /tmp/kaipu-mine/prs.json: all 442 PRs (number,title,body,state,mergedAt,mergeCommit,additions,deletions,changedFiles,headRefName...).
- /tmp/kaipu-mine/c2pr.json: map commit sha -> PR number that brought it to main (local, complete).
- /tmp/kaipu-mine/szz_all.json: automated whole-PR SZZ for every "fix" PR: `strong` = [PR, #removed/changed lines
  blamed to it], `weak` = [PR, #context lines next to pure additions], `trailers` = Co-Authored-By names.
  '?3a06e76f' = the Initial commit (not a PR). Whole-PR SZZ mixes several bugs; refine per bug.
- `python3 -I /tmp/kaipu-mine/scripts/szz.py <base> <head> [paths...]` : SZZ for any commit range, optionally
  restricted to paths (skips tests/docs/json/md). Use per fix commit (`<sha>^ <sha>`) or per file to isolate one bug.
  For a merge-commit PR M, fix range is `M^1 M`; its individual commits are `git rev-list M^1..M^2`.
- `python3 -I /tmp/kaipu-mine/scripts/body.py <maxchars> <pr>...` prints PR bodies.
- Audit docs (they describe bugs, severity, evidence, who found them):
  - /tmp/kaipu-mine/repo/apps/documentation/src/content/docs/audits/2026-10-15/ (report.md, findings/*.md) — 8 Opus auditors.
  - /tmp/kaipu-mine/repo/apps/documentation/src/content/docs/backlog/fable-audit-results.md — audit by Claude Fable 5 (46 findings, fixed in PRs #17-#25).
  - Shipped-plans table: apps/documentation/src/content/docs/plans/audit-2026-10-15/00-index.md
  - Deleted plan files are in git history (`git log --all -- 'apps/documentation/src/content/docs/plans/audit-2026-10-15/*'`).
- Review data cache: /tmp/kaipu-mine/rev/<pr>.{c,r,i}.json (pull review comments, reviews, issue comments) exist for PRs 290-459
  and some others. For other PRs run `/tmp/kaipu-mine/scripts/fetchrev.sh <pr>` (writes the cache). The AI reviewer
  (github-actions[bot], markers `<!-- claude-review sha=... -->` / `<!-- agent-review sha=... -->`, labels like
  Blocker/Fix/Consider/Should fix) was added on 2026-10-20, so PRs merged before ~#300 normally had no review: verify
  from the cache, do not assume.

Big "introducing" PRs to know about (poor replayability): #2 (initial app import, 276 files, +15.8k), #4 (44 files +6.1k),
#13 (105 files +6.3k), #28 (63 files +8.7k), #90 (91 files +10.3k), #309 (89 files +8k), #384 (136 files +9.2k), #399 (73 files +5k), #377 (85 files).
PR #303 is titled docs(design) but may carry code via stacked commits: check `gh pr view 303 --json commits` / c2pr before trusting it.

What to determine per bug (one record per distinct defect; a batch fix PR may hold several):
1. fix PR(s) and fix commit(s); one-sentence defect + its user-visible failure.
2. class: one of race/ordering, deadlock, resource leak, data loss, security/abuse, state machine, cross-file contract,
   config/env, platform-specific, UI/cosmetic, CI.
3. introducing commit(s)+PR via SZZ on the lines this bug's fix removed/changed (blame the fix's parent). Confidence high/medium/low.
   Say `omission: true` when the bug is missing code (pure additions) so blame is weak; then pick the PR that wrote the
   surrounding logic and say so. Sanity-check: the introducing PR must predate the fix and the buggy code must actually
   be in that PR's diff (`git show <sha> -- <file>` or `gh pr diff <n>`); reject refactor/format-only blame (e.g. renames,
   formatter runs) and walk back further (`git blame <sha>^ -- file`) when the blamed commit only moved lines.
4. replayability of the introducing PR: files, +/- lines, mixes unrelated changes?, is the bug visible from that PR's diff
   plus the repo at that point (yes/partial/no)?
5. difficulty to catch in review 1-5 with reason (5 = needs cross-file reasoning, timing, or platform knowledge; 1 = obvious from the diff).
6. who found it / who fixed it: commit trailers (Co-Authored-By), PR body ("Generated with Claude Code", model names),
   audit docs, review comments, user reports in PR body. Record explicitly fable_found / fable_fixed (true/false/unknown).
7. prior AI reviewer on the INTRODUCING PR: caught / missed / did-not-run / partial, with a one-line note (quote the
   finding title if it caught it). Also note if the reviewer flagged it on the fix PR's predecessors.

Skip pure dependency bumps, copy/i18n test string fixes and doc-only fixes unless they hide a real defect, but list them
in `skipped` with a 5-word reason. Mark guesses as guesses. Be factual.

Output: write a JSON file (path given in your task) shaped:
{"bugs":[{"id":"short-kebab-id","audit_id":null|"REC-B8"|"FABLE-#5",
 "fix_prs":[416],"fix_commits":["abc1234"],"description":"...","user_visible":"...","class":"race/ordering",
 "intro_prs":[133],"intro_commits":["def5678"],"szz_confidence":"high|medium|low","omission":false,"szz_note":"...",
 "intro_pr_size":{"files":29,"add":1475,"del":27},"intro_pr_mixed":false,"visible_from_diff":"yes|partial|no","replay_note":"...",
 "difficulty":4,"difficulty_reason":"...",
 "found_by":"e.g. Opus auditor (audit 2026-10-15) | Claude Fable 5 audit | user report | Sonnet during impl | unknown",
 "fixed_by":"e.g. Claude Opus 5.5 (trailer)","fable_found":false,"fable_fixed":false,
 "prior_reviewer":"did-not-run|missed|caught|partial","prior_reviewer_note":"..."}],
 "skipped":[{"pr":75,"reason":"..."}]}
Final reply: just the path, the count of bugs and any problems. Keep it short.
