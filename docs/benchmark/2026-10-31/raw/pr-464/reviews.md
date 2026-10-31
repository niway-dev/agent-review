=== REVIEW 5720271883 github-actions[bot] 2026-10-31T01:05:48Z commit=e45c845
**Agent review** of the whole pull request, at `e45c845`: all 31 files reviewed.

1 finding(s): 1 to consider; 1 on their lines. Reply in a comment's thread to answer it.

### Summary

**Batch 1 of 2.** Part 1 looks right. The new i18n keys (dragTo, pill, destinationTag, readyCardLabel and the others) are in en.json, and every ICU select has an `other` branch. `copyPresetOf` now strips the `#revision` suffix, which fixes destination lookup for real sidecar fingerprints, and tests cover it. The minimized-widget store and the pill/error rendering logic are consistent. The ready card uses existing preload APIs only, so the Electron boundary is not widened. One finding, at consider level: ready cards are retired when the user leaves the Library even if list view or a filter kept them from being shown.

**Batch 2 of 2.** I found no problems in part 2 (stylesheets, backlog docs and i18n messages).

- **Messages:** the removed keys `backgroundCopy.hide` and `backgroundCopy.readyDragToUpload` no longer appear anywhere under `apps/kaipu-record/src/renderer`, so dropping them breaks nothing. The new keys are the same in en and es.
- **Tags without a colour or wording of their own:** an `archive` copy falls back to the default grey `#2a2a30` in the stylesheet and to the `other` branch ("Archive copy") in `destinationTag`.
- **Stylesheets:** every colour variable they use is defined except `--bg-hover`. `--tone-saving` and `--accent-primary-ring` are in `assets/base.css` and already used elsewhere. `--bg-hover` comes with a fallback colour, so it still works if missing. The destination tag colours match `destination-logo.module.css`, as its comment says.
- **Docs:** the new backlog page, the index row and the update note on the background-copies page agree with the new message wording ("YouTube copy · N%", "Drag to TikTok or Reels", "FOR GITHUB / FOR CHAT").

<details><summary>Coverage by batch</summary>

| Batch | Files | Lines | Highest risk | Status | Turns | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| Batch 1 of 2 | 22 | 835 | 4 | reviewed | 3 | $0.22 |
| Batch 2 of 2 | 9 | 427 | 1 | reviewed | 5 | $0.13 |

</details>

<sub>Claude Opus 5.5 via Claude Code 2.1.304 · 2 batches · $0.36</sub>

<!-- agent-review sha=e45c845143ba72f35fea4fac2f9d62a186dff986 -->

=== REVIEW 5720282169 pullfrog[bot] 2026-10-31T01:07:58Z commit=e45c845
> ℹ️ No critical issues — two rough edges inline.

**Reviewed changes**

Initial review of the whole PR: the Library's "Ready to upload" card, destination tags on the grid, the bottom-right export widget that minimizes to a pill, and the fix for reading a copy's destination through its encode revision.

- **Ready to upload card**: each finished copy leads the grid across two columns, newest first. Grid view only, and only for copies the current filters show. It goes away when the copy is opened, its ✕ is clicked, or the user leaves `/library` (`retireReadyCards`, triggered from `useLibraryBadge`'s route watch).
- **Destination tags**: copies that aren't masters carry a `DestinationTag`, taken from the runner's job or from the sidecar through `copyDestinationOf`.
- **Encode-revision fix**: `copyPresetOf` compares only the part of the fingerprint before `#`. `MasterCopiesPanel` now names YouTube, GitHub and chat copies by destination.
- **Export widget**: the runner's `progressHidden` / `hideExportProgress` are replaced by a session-wide minimized flag stored in `sessionStorage` (`export-widget-state.ts`). `ExportProgressPill` shows a ring, and the export cards moved to their own bottom-right stack.
- **i18n**: the `backgroundCopy` copy was rewritten in `en`/`es`, adding `dragTo`, `pill`, `destinationTag` and `readyToUpload`.

I checked that every route renders under `AppShell`, so the sidebar's `wasOnLibrary` ref is never reset by an unmount, and that the Library grid has a fixed three columns, so `span 2` cannot overflow.

<!--
Pullfrog review metadata. These findings were written against e45c845;
if commits have landed on feature/ready-copy-in-library since, treat every specific bug, file, or
line callout as POTENTIALLY STALE and re-diff before acting on it.

- Mode: Review (initial)
- Files reviewed: 31
- Commits reviewed: 3
- Base: feature/niw2-587-prepare-drop-zone (13b7ff5)
- Head: feature/ready-copy-in-library (e45c845)
- Reviewed commits:
  - ddcbe059 — fix(desktop): read a copy's destination through its encode revision
  - 3d1ae697 — feat(desktop): ready copy shows up in the Library; minimizable export widget
  - e45c8451 — docs(backlog): ready copy in the Library and the minimizable export widget
- Prior pullfrog review: none
-->


<!-- PULLFROG_DIVIDER_DO_NOT_REMOVE_PLZ -->
<sup><a href="https://pullfrog.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://pullfrog.com/logos/frog-white-full-18px.png"><img src="https://pullfrog.com/logos/frog-green-full-18px.png" width="9px" height="9px" style="vertical-align: middle; " alt="Pullfrog"></picture></a>&nbsp;&nbsp;｜ [Fix all ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/464?action=fix&review_id=5720282169) ｜ [Fix 👍s ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/464?action=fix-approved&review_id=5720282169) ｜ [View workflow run](https://github.com/niway-dev/kaipu-record/actions/runs/41153540436/job/124395226470) ｜ Using `claude-opus-5-5` ｜ [𝕏](https://x.com/pullfrogai)</sup>

=== REVIEW 5720339888 pullfrog[bot] 2026-10-31T01:23:27Z commit=da6d41b
> ℹ️ No critical issues. There is one small inconsistency inline, and both earlier threads are still open.

**Reviewed changes**

This review covers what changed since the review at `e45c845`: the merge of `feature/floating-ready-window` and the Email wording fix.

- **Merged the Export screen base:** the rail badge moved from Library to Export (`useExportBadge`). It now counts the export that is running plus unseen copies. Leaving `/library` still calls `retireReadyCards`, and opening `/export*` announces ready copies the same way the Library does.
- **Named Email copies:** added `email` branches to `progressTitle`, `readyTitle`, `pill`, `dragTo` and `destinationTag` in both `en` and `es`, plus a blue `.tag[data-destination="email"]`. Tests now check the progress card, the ready toast and the grid tag.

The two earlier threads, on the pill's `aria-label` and on the ready card not calling `markCopySeen`, are not touched by these commits, so I left them open.

<!--
Pullfrog review metadata. These findings were written against da6d41b;
if commits have landed on feature/ready-copy-in-library since, treat every specific bug, file, or
line callout as POTENTIALLY STALE and re-diff before acting on it.

- Mode: IncrementalReview (delta against prior pullfrog review)
- Files reviewed: 31
- Commits reviewed: 5
- Base: feature/floating-ready-window (c171b3d)
- Head: feature/ready-copy-in-library (da6d41b)
- Reviewed commits:
  - da6d41b — fix(desktop): name Email copies in the export cards and the copy tag
  - 1e1128b — Merge branch 'feature/floating-ready-window' into feature/ready-copy-in-library
- Prior pullfrog review: e45c845 (https://github.com/niway-dev/kaipu-record/pull/464#pullrequestreview-5720282169)
-->


<!-- PULLFROG_DIVIDER_DO_NOT_REMOVE_PLZ -->
<sup><a href="https://pullfrog.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://pullfrog.com/logos/frog-white-full-18px.png"><img src="https://pullfrog.com/logos/frog-green-full-18px.png" width="9px" height="9px" style="vertical-align: middle; " alt="Pullfrog"></picture></a>&nbsp;&nbsp;｜ [Fix all ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/464?action=fix&review_id=5720339888) ｜ [Fix 👍s ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/464?action=fix-approved&review_id=5720339888) ｜ [View workflow run](https://github.com/niway-dev/kaipu-record/actions/runs/41154968488/job/124399635645) ｜ Using `claude-opus-5-5` ｜ [𝕏](https://x.com/pullfrogai)</sup>

