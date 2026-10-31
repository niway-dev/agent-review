=== REVIEW 5720283119 github-actions[bot] 2026-10-31T01:08:12Z commit=dac8318
**Agent review** of the whole pull request, at `dac8318`: all 14 files reviewed.

2 finding(s): 2 to consider; 2 on their lines. Reply in a comment's thread to answer it.

### Summary

**Batch 1 of 2.** Part 1 (the destinations panel, the copies panel and the library detail page) looks correct. These checks found no problems: `showDestinations` and `hasCopies` gating, the "Not now" dismissal keyed by asset id, the saved notice and master note never showing together, the heavy banner now covering masters that have copies, the drag button skipped for copies with no local file, and the use of the existing `startFileDrag` preload API. The preload boundary is not widened. Two test findings, both "consider": the Open in Export test never checks the button is absent without the prop, and the drag test overwrites the shared `electronAPI` stub without restoring it.

**Batch 2 of 2.** No findings in part 2. I checked these files against `library-detail-page.tsx`, `destinations-panel.tsx` and `master-copies-panel.tsx`:

- **Stylesheets:** every class the two panel components use exists in the new stylesheets. The classes removed from `master-copies-panel.module.css` (`.empty`, `.list`, `.size`, `.progress`) and the deleted strip stylesheet are no longer used anywhere.
- **Messages:** the i18n keys that are still used are still present. `sendTo` stays because the Library's card and row components still use it, and `sendToHint` stays because the Export a copy button uses it as its tooltip. The keys that were removed have no remaining callers.
- **Tests:** the tests match how the page renders now:
  - The title row really contains only the back link, the title and the tag.
  - The page shows "Where is it going?" only when the recording has no copies, and Export a copy waits until that panel is gone.
  - The saved notice hides the master note until it is dismissed.
  - `cleanup()` is now called before the second render. That is why the copy page now correctly expects no master tag at all.
  - Dropping the "file isn't read" assertion matches the page now reading the file for every local recording.
- **Docs:** the backlog entry and the prepare-screen doc describe what the code does: the metadata line, the destinations panel driven by `DESTINATION_IDS`, the copies list, and where the heavy-to-send hint goes.

<details><summary>Coverage by batch</summary>

| Batch | Files | Lines | Highest risk | Status | Turns | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| Batch 1 of 2 | 5 | 852 | 4 | reviewed | 7 | $0.24 |
| Batch 2 of 2 | 9 | 763 | 2 | reviewed | 5 | $0.25 |

</details>

<sub>Claude Opus 5.5 via Claude Code 2.1.304 · 2 batches · $0.48</sub>

<!-- agent-review sha=dac8318b631e64780f65ce94b4aaa57261d7d63d -->

=== REVIEW 5720287173 pullfrog[bot] 2026-10-31T01:09:20Z commit=dac8318
> ℹ️ No critical issues. One minor suggestion inline.

**Reviewed changes**

I reviewed the full relayout of the recording detail page, the new `DestinationsPanel`, the reworked `MasterCopiesPanel`, and the i18n and backlog doc updates.

- **Title row**: `← Library`, the title and the master tag now share the top row, and the metadata, tags and lineage moved under it. The resolution and a copy count were added to the metadata line.
- **Actions**: the row holds only buttons and wraps. "Export a copy" replaces "Send to…" and stays hidden while the destinations panel is showing.
- **`DestinationsPanel`**: replaces `WhereIsThisGoingStrip`. It shows one equal card per `DESTINATION_IDS` entry with its estimate from `planCopy`, and shows only before the first copy. "Not now" hides it until the page is left.
- **`MasterCopiesPanel`**: renders only when copies exist, two to a row. Each row shows the picture size worked out from the probe and the preset, plus a progress bar, a Drag handle (`startFileDrag`) and "Open in Export →".
- **Saved notice**: a dismissable green notice appears on `fromRecording` arrivals and replaces the "original never changes" line while it is visible.
- **Probe**: `useSourceProbe` now reads every preparable recording, not only heavy ones.
- **Heavy banner**: the condition moved from `!master` to `!showDestinations`, so a heavy master with copies, or one whose panel was dismissed, now shows the banner.

<!--
Pullfrog review metadata. These findings were written against dac8318;
if commits have landed on feature/recording-detail-title-and-copies since, treat every specific bug, file, or
line callout as POTENTIALLY STALE and re-diff before acting on it.

- Mode: Review (initial)
- Files reviewed: 14
- Commits reviewed: 1
- Base: feature/niw2-587-prepare-drop-zone (13b7ff5d)
- Head: feature/recording-detail-title-and-copies (dac8318)
- Reviewed commits:
  - dac8318 — feat(desktop): recording detail — title on top, destinations, copies from this original
- Prior pullfrog review: none
-->


<!-- PULLFROG_DIVIDER_DO_NOT_REMOVE_PLZ -->
<sup><a href="https://pullfrog.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://pullfrog.com/logos/frog-white-full-18px.png"><img src="https://pullfrog.com/logos/frog-green-full-18px.png" width="9px" height="9px" style="vertical-align: middle; " alt="Pullfrog"></picture></a>&nbsp;&nbsp;｜ [Fix all ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/465?action=fix&review_id=5720287173) ｜ [Fix 👍s ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/465?action=fix-approved&review_id=5720287173) ｜ [View workflow run](https://github.com/niway-dev/kaipu-record/actions/runs/41153720657/job/124395791467) ｜ Using `claude-opus-5-5` ｜ [𝕏](https://x.com/pullfrogai)</sup>

=== REVIEW 5720305192 pullfrog[bot] 2026-10-31T01:14:13Z commit=4b83525
> ℹ️ No new code issues. The merge left one doc note stale; see the inline comment.

**Reviewed changes**

Since the last review, the only new commit merges `feature/export-screen` into the branch, and the PR is now based on it.

- **Email destination picked up**: `DESTINATION_IDS` now has seven entries, so `DestinationsPanel` renders an Email card automatically. The card has its logo, copy strings, Balanced preset and teal `keep-light` tone. The page test now checks for seven cards and the `?to=email` row.
- **Export routes**: `preparePath` now builds `/export/:assetId`, and every navigation assertion in `library-detail-page.test.tsx` moved from `/prepare/asset-b` to `/export/asset-b`.
- **Backlog index**: the merge added the Export screen row next to this PR's updated Prepare row.

The earlier thread about the Drag handle not calling `markCopySeen` (`master-copies-panel.tsx:174`) is still open, because this push didn't change that code.

<!--
Pullfrog review metadata. These findings were written against 4b83525;
if commits have landed on feature/recording-detail-title-and-copies since, treat every specific bug, file, or
line callout as POTENTIALLY STALE and re-diff before acting on it.

- Mode: IncrementalReview (delta against prior pullfrog review)
- Files reviewed: 14
- Commits reviewed: 2
- Base: feature/export-screen
- Head: feature/recording-detail-title-and-copies (4b83525)
- Reviewed commits:
  - 4b83525 — Merge branch 'feature/export-screen' into feature/recording-detail-title-and-copies
  - dac8318 — feat(desktop): recording detail — title on top, destinations, copies from this original
- Prior pullfrog review: dac8318 (https://github.com/niway-dev/kaipu-record/pull/465#pullrequestreview-5720287173)
-->


<!-- PULLFROG_DIVIDER_DO_NOT_REMOVE_PLZ -->
<sup><a href="https://pullfrog.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://pullfrog.com/logos/frog-white-full-18px.png"><img src="https://pullfrog.com/logos/frog-green-full-18px.png" width="9px" height="9px" style="vertical-align: middle; " alt="Pullfrog"></picture></a>&nbsp;&nbsp;｜ [Fix all ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/465?action=fix&review_id=5720305192) ｜ [Fix 👍s ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/465?action=fix-approved&review_id=5720305192) ｜ [View workflow run](https://github.com/niway-dev/kaipu-record/actions/runs/41154158467/job/124397162487) ｜ Using `claude-opus-5-5` ｜ [𝕏](https://x.com/pullfrogai)</sup>

