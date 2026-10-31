=== COMMENT 4429738634 github-actions[bot] 2026-10-31T01:08:12Z review=5720283119 reply_to=null commit=dac8318 apps/kaipu-record/src/renderer/src/features/prepare/components/master-copies-panel.test.tsx:140
🟡🧪 **Consider · tests: "shows only where…" never checks the button is absent**

The test name says Open in Export → appears *only* where there is an export screen, but it only renders with `onOpenExport` and clicks the button. It never renders without the prop to check the button is missing, and that missing case is the one `library-detail-page.tsx:513` relies on for a non-preparable copy. Add `renderPanel([copy({})])` followed by `expect(within(panel).queryByRole("button", { name: "Open in Export →" })).toBeNull()`.

=== COMMENT 4429738638 github-actions[bot] 2026-10-31T01:08:12Z review=5720283119 reply_to=null commit=dac8318 apps/kaipu-record/src/renderer/src/features/prepare/components/master-copies-panel.test.tsx:100
🟡🧪 **Consider · tests: Overwrites the shared electronAPI stub without restoring it**

`window.electronAPI.startFileDrag = startFileDrag` replaces the stub that `test/setup.ts:109` builds once for each file, and nothing puts it back. Every later test in this file then runs against the mock. `export-status-cards.test.tsx:143-152` handles the same API with `vi.spyOn(window.electronAPI, "startFileDrag")` and `mockRestore()`. Use that pattern here too.

=== COMMENT 4429742113 pullfrog[bot] 2026-10-31T01:09:19Z review=5720287173 reply_to=null commit=dac8318 apps/kaipu-record/src/renderer/src/features/prepare/components/master-copies-panel.tsx:174
The ready card's Drag calls `markCopySeen(recording.assetId)` before `startFileDrag` (`export-status-cards.tsx:234`), and `ready-copies.ts` says a copy stays unseen until the user opens it or drags it out. This new Drag handle skips that step. So a copy dragged straight from the master's page keeps its outline and the "copy ready" chip on the Library page.

```suggestion
                    markCopySeen(copy.assetId);
                    window.electronAPI.startFileDrag(copy.id!, copy.title);
```

=== COMMENT 4429758167 pullfrog[bot] 2026-10-31T01:14:12Z review=5720305192 reply_to=null commit=4b83525 apps/documentation/src/content/docs/backlog/prepare-screen.md:114
Since the `feature/export-screen` merge, this note is wrong: `DESTINATION_IDS` now includes `email`, and the panel renders seven cards (the page test asserts `toHaveLength(7)`). Line 100 has the same problem: it says a card "opens Prepare", but `preparePath` now goes to `/export`. The PR description's "Six destinations, not seven" note is stale for the same reason.

<details><summary>Technical details</summary>

````markdown
# Stale destination count and screen name after the export-screen merge

## Affected sites
- apps/documentation/src/content/docs/backlog/prepare-screen.md:114-116 — says the code has six destinations; it has seven (`destinations.ts` adds `email`)
- apps/documentation/src/content/docs/backlog/prepare-screen.md:100 — "A card opens Prepare on that destination"; `preparePath` now builds `/export/:assetId`
- PR #465 description, "Six destinations, not seven" bullet

## Required outcome
- The doc and the PR body describe seven destinations (Email as its own card over the Balanced preset, as `export-screen.md` explains) and say that the cards open Export.
````

</details>

