=== COMMENT 4429729925 github-actions[bot] 2026-10-31T01:05:48Z review=5720271883 reply_to=null commit=e45c845 apps/kaipu-record/src/renderer/src/pages/library/library-page.tsx:117
🟡🐛 **Consider · bug: Ready cards can be retired before anyone has seen them (list view, filtered out)**

`leading` only renders in the grid branch (line 409), and only for copies that pass the current filters (line 129). Leaving the Library still calls `retireReadyCards()` for every copy with `card: true` (sidebar.tsx:102). So if the Library is in list view, or a filter hides the copy, the user never sees its "Ready to upload" card, and it is gone the next time they come back. The comment on `retireReadyCards` (ready-copies.ts:93–96) says "every card it showed has been seen", and that isn't true in these cases. You could retire only the cards that were actually rendered, or show the leading cards in list view as well.

=== COMMENT 4429737817 pullfrog[bot] 2026-10-31T01:07:57Z review=5720282169 reply_to=null commit=e45c845 apps/kaipu-record/src/renderer/src/features/status-cards/export-status-cards.tsx:202
The `aria-label` here hides what the pill says. A `button`'s children are presentational in ARIA, so the inner `role="progressbar"` and the visible "YouTube copy · 38%" are dropped, and a screen reader announces only "Show the export's progress, button". The accessible name also no longer contains the visible text (WCAG 2.5.3), so a voice command like "click YouTube copy" won't find it.

One fix: drop the `aria-label` and the inner `role`/`aria-value*`, and let the visible text be the name. Another: put the percent into the label, e.g. `t("pill", …)` plus the expand hint.

=== COMMENT 4429737820 pullfrog[bot] 2026-10-31T01:07:57Z review=5720282169 reply_to=null commit=e45c845 apps/kaipu-record/src/renderer/src/features/library/components/ready-copy-card.tsx:93
Show in Finder and the drag in this card don't call `markCopySeen`, but the same two actions in the ready toast do (they count as "acted on it"). So if the user drags the copy from this card into YouTube Studio and then leaves the Library, the copy comes back as "unseen": it keeps the pink `justReady` outline, the "1 copy ready" chip and the badge logic, even though it has already been uploaded. Either match the toast, or note when a card's copy was acted on and drop it from the unseen set when `retireReadyCards` runs. Marking it seen right away would also remove the card mid-interaction, since `markCopySeen` drops the whole entry.

=== COMMENT 4429787879 pullfrog[bot] 2026-10-31T01:23:27Z review=5720339888 reply_to=null commit=da6d41b apps/kaipu-record/src/renderer/src/pages/library/library-page.tsx:399
An Email copy is tagged "For email" only while its `ReadyCopy` entry still holds the job's destination. When the user opens the copy, `markCopySeen` drops that entry. After that, or after a relaunch (the store lives only in memory), the tag falls back to the sidecar. The sidecar reads `balanced` → `destinationOfPreset` → `chat`, so the same file now says "For chat". Email and chat share a preset, so the sidecar can't tell them apart.

<details><summary>Technical details</summary>

````markdown
# Email copy's tag changes from "For email" to "For chat"

## Affected sites
- apps/kaipu-record/src/renderer/src/pages/library/library-page.tsx:399: `copyDestinationOf(video, readyInfo.get(...)?.destination)` gets `email` only while the copy is still in the ready store
- apps/kaipu-record/src/renderer/src/features/prepare/copy-destination.ts:29: the fallback `destinationOfPreset("balanced")` returns `chat` (by design, see `destinations.ts:11-13`)

## Required outcome
- A copy keeps the same tag (and the same `MasterCopiesPanel` name) after it is opened or the app relaunches.

## Suggested approach (optional)
- Write the destination into the export sidecar next to `preset`/`fingerprint`, and have `copyDestinationOf` prefer it over the preset lookup. Or, if that is out of scope here, show `balanced` copies from the sidecar with a tag that does not claim chat.
````

</details>

