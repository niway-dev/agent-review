=== github-actions[bot] apps/kaipu-record/src/renderer/src/pages/export/export-drop-zone.tsx:45
🟡🐛 **Consider · bug: "Pick from Library" stays enabled while a dropped file is importing**

"Browse files" is disabled while `importing` is true (line 51), but the `VideoPicker` trigger is not. If the user picks a Library video during an import, `openVideo` sends them to that video. Then the import finishes, and `usePrepareImport` sends them to the imported one. One navigation overwrites the other. You could pass `disabled={importing}` to the trigger `Button` here too, so both ways in act the same.

=== github-actions[bot] apps/kaipu-record/src/renderer/src/pages/export/export-stage.tsx:312
🟡🐛 **Consider · bug: GitHub size bar's accessible label leaves out the 10 MB limit it is drawn against**

For GitHub, `scale` is `max(copyBytes, GITHUB_FREE_LIMIT_BYTES)` (line 297), so the bar shows the copy measured against the 10 MB free limit, and the visible tag says "fits" or "over" that limit. But the section is `role="img"` with `aria-label={t("barLabel", { from, to })}`, which en.json:925 renders as "Your recording {from}, the copy {to}". Because `role="img"` hides the children, screen-reader users never get the fits/over verdict. Consider adding the `tag` text to the label, or a separate label for the limited case.

=== github-actions[bot] apps/kaipu-record/src/renderer/src/pages/export/video-picker.tsx:69
🟡🐛 **Consider · bug: Picker is a `role="dialog"` but focus stays on the trigger and isn't restored on Escape**

When the panel opens, focus stays on the trigger. Escape (line 51) and a click outside close the panel without moving focus anywhere. A keyboard user has to Tab into the list, and assistive tech announces a dialog that never took focus. Consider moving focus to the first (or `aria-current`) item when the panel opens and back to the trigger on Escape. Another option is to drop `role="dialog"` and treat the panel as a disclosure list.

=== github-actions[bot] apps/kaipu-record/src/renderer/src/pages/export/recent-exports.tsx:54
🟡🧹 **Consider · cleanup: The in-progress row puts the video title in the slot where finished rows show the destination name**

The running row puts `running.sourceTitle` in `styles.name` and the percentage in `meta`. Finished rows (lines 71–73) put the destination name (`t(EXPORT_NAME[destination])`) in `name` and size · title in `meta`. In the same three-row strip, the bold line therefore means two different things. Consider showing the destination name in `name` for the running row as well, with the title next to the percentage.

=== github-actions[bot] apps/kaipu-record/src/renderer/src/pages/library/library-page.test.tsx:80
🟠🧪 **Fix · tests: "does not take a video dropped on the window" would pass even if Library still handled drops**

This test now runs on the default stub `pathForFile: () => ""` from `src/test/setup.ts:156`. The test that used to override it (`/Users/me/Movies/...`) was removed in this PR. In `use-import-videos.ts:102-111`, a file whose path comes back empty is moved to `skipped` and the function returns before it calls `importVideoFiles`. So if `LibraryPage` still mounted `useFileDrop` and the drop import, `importVideoFiles` would still never be called, and the test would still pass. It also asserts right after `fireEvent.drop`, before the async import could resolve.

To make it test the claim, stub `window.electronAPI.pathForFile = vi.fn((f: File) => `/Users/me/Movies/${f.name}`)`. Then, more directly, assert that nothing intercepted the drop: `expect(fireEvent.drop(document.body, …)).toBe(true)`, since `useFileDrop` calls `preventDefault` on drop (`use-file-drop.ts:42`). You could also assert that `getToasts()` is empty.

=== github-actions[bot] apps/kaipu-record/src/renderer/src/shell/sidebar.test.tsx:39
🟠🧪 **Fix · tests: "with and without a video" only renders the with-video URL**

The test is named "is active on Export with and without a video", but it only renders `/export/asset-1`. It never checks `/export` (`ROUTES.exportNew`). The rail item's `to` is `ROUTES.exportNew` (sidebar.tsx:53), and `isActive` matches it with `end: false`. So the bare `/export` case is the main one, and nothing asserts it. Render `ROUTES.exportNew` as well and check `aria-current="page"` there too.

=== github-actions[bot] apps/kaipu-record/src/renderer/src/shell/sidebar.test.tsx:48
🟡🧪 **Consider · tests: The badge's "in progress" count is not tested**

`useExportBadge` (sidebar.tsx:121-122) now adds 1 while `useExportRunner().status === "exporting"`. That is why the label changed to "copy in progress or ready". These tests only use `noteFinishedCopy`, so the running part of the count and the label it produces are never checked. You could add a case that puts the export runner in the `exporting` state and asserts that the badge counts it.

=== github-actions[bot] apps/kaipu-record/src/renderer/src/pages/library/library-page.module.css:108
🟠📝 **Fix · docs: Orphaned comment for the removed import drop strip**

The `.importZone` rule was removed, but its comment `/* NIW2-579: the "Drop a video here" strip, between the header and the toolbar. */` is still there. It now sits right above the `.stickyBar` comment, so it reads as if it describes the sticky bar. The Library no longer has a drop strip, so delete line 108.

=== pullfrog[bot] apps/kaipu-record/src/renderer/src/pages/export/export-page.tsx:70
This page never re-reads the Library when a background export finishes. Main sends no `library:changed` when `recordingFinalize` saves the copy, so only an explicit `refresh()` brings it into `videos`. `library-detail-page.tsx` does that when `runner.ready` changes; this page doesn't. Prepare left the screen once an export started (`onStarted={() => navigate(recordingPath)}`), so it didn't matter there. Export now stays, so after the copy lands:

- the card never reads "Ready";
- the primary button still says "Export for …" instead of "Open the copy you have";
- Enter encodes the same copy again;
- on `/export`, "Recent exports" drops the running row and doesn't show the finished copy until you navigate away and back.

The existing tests seed the finished copy before mount, so they don't catch this.

<details><summary>Technical details</summary>

````markdown
# Export screen does not see a copy that finishes while it is open

## Affected sites
- apps/kaipu-record/src/renderer/src/pages/export/export-page.tsx:70 — `useLocalLibrary()` is never refreshed when `useExportRunner().ready` changes, so `lineage.exportsOf`, `reusable`, `existing` and `RecentExports` stay stale.
- apps/kaipu-record/src/renderer/src/pages/export/export-page.tsx:117 — `if (isLoading) return …` unmounts `ExportScreen` during any `refresh()`. It remounts with `initialDestination={urlDestination}`, so the destination picked on screen, the 1440p / 4K choice and Fill / Fit are lost. The cloud-catalog refresh on mount already triggers this today. A refresh added on `ready` would trigger it right after every export.
- Reference: apps/kaipu-record/src/renderer/src/pages/library-detail/library-detail-page.tsx:136-140 already refreshes on `runner.ready?.recording.id`.

## Required outcome
- While Export is open, a copy that finishes makes its card read "Ready", makes the primary action open it, and stops Enter from encoding it again.
- "Recent exports" on `/export` lists the copy once it finishes.
- A Library re-list does not reset the screen's selected destination or options.

## Suggested approach
- In `ExportPage`, refresh when `useExportRunner().ready?.recording.id` changes, the same way library-detail does.
- Show the loading screen only for the first load (`isLoading && !video`), so a re-list doesn't unmount `ExportScreen`.
- Add a test: start a copy, then resolve the runner's ready state with the new item returned from `listLibraryItems`, and check that the card reads "Ready".
````

</details>

