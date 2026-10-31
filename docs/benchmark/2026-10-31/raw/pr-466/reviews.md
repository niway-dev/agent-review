=== REVIEW 5720283823 github-actions[bot] 2026-10-31T01:08:24Z commit=b2705a9
**Agent review** of the whole pull request, at `b2705a9`: all 28 files reviewed.

2 finding(s): 2 to consider; 2 on their lines. Reply in a comment's thread to answer it.

### Summary

**Batch 1 of 2.** I reviewed all 15 files in part 1 and found no blockers or fixes, only two suggestions.

1. **The card can disappear entirely** (`recording-ready-window.ts:146`). `show()` reports success as soon as the window exists, before the card has rendered. If the page fails to load or the card crashes, the recording page never falls back to its in-app card, so the user sees nothing.
2. **Any window can ask for the card** (`recording-ready-window.ts:104`). The card's own channels check that the message comes from the card window, but `recording-ready:show` accepts a request from any window that loads the shared preload, not only the main window. The impact is small because the payload is validated, but it widens what other windows can trigger.

The rest checks out:
- **No value imports from workspace packages:** `shared/types/recording-ready.ts` has none, so it is safe to reach from the preload.
- **Card input is validated:** actions from the card are parsed and checked against the sender, and resize messages are range-checked.
- **Recorded display:** the hub's `lastTakeDisplayId` handles area recordings, countdown regions and screen sources correctly.
- **Tests:** they assert what their names say.

**Batch 2 of 2.** Part 2 has no findings. The recording page asks for the floating card once per history entry. useFloatingReadyCard guards this with a ref, so StrictMode does not ask twice, and it waits until the source probe has finished, successfully or not. The page shows the in-app card only when main answers false or the IPC call throws, so the card never shows twice. The tests cover both outcomes, the Settings toggle being off, and a visit from the Library. The window root subscribes before it signals ready, which its test also checks. The new `openFloatingHint` string is used only when `onOpen` is passed, which only the floating window does. It has entries in both en and es. The CSS padding (16 px around the 420 px card) matches the documented 452 DIP window. The backlog doc matches the code and states its own limits (a window that fails to load its renderer does not fall back to the in-app card, and nothing has been run in Electron yet).

<details><summary>Coverage by batch</summary>

| Batch | Files | Lines | Highest risk | Status | Turns | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| Batch 1 of 2 | 15 | 998 | 8 | reviewed | 5 | $0.26 |
| Batch 2 of 2 | 13 | 297 | 4 | reviewed | 9 | $0.20 |

</details>

<sub>Claude Opus 5.5 via Claude Code 2.1.304 · 2 batches · $0.46</sub>

<!-- agent-review sha=b2705a9ce2593b29ae50235312a4226955bbbb36 -->

=== REVIEW 5720290019 pullfrog[bot] 2026-10-31T01:10:07Z commit=b2705a9
> ℹ️ No critical issues — two rough edges inline.

**Reviewed changes**

I reviewed the whole PR. It moves "Your video is ready" out of the main window into a floating, always-on-top window and keeps the in-app card as a fallback.

- **Floating window manager**: `RecordingReadyWindow` follows the capture toast's pattern. It is a frameless, transparent, content-protected panel shown with `showInactive`, and it has a validated IPC contract for show, card-ready, resize and action.
- **Take's display**: `RecordingHubHandle.lastTakeDisplayId()` resets on every start. It comes from the area or the countdown display, then from the source lookup when no area is set.
- **Hand-off to the main window**: an action closes the card, then calls `showMainWindow()` and `sendToRenderer(recording-ready:open)`. That send is queued until `appReady` when the main window is recreated. `AppRoot` navigates through `preparePath` and `editorPathFor`.
- **Recording page**: `useFloatingReadyCard` asks main once the probe settles. The in-app `PostRecordingCard` renders only when main answers `false` or the IPC rejects.
- **Shared contract**: `shared/types/recording-ready.ts` holds the payload and action parsers plus `handOffFor`. The preload imports it type-only, and `post-recording-card.tsx` pins the chip IDs to `DestinationId` with `satisfies`.

<!--
Pullfrog review metadata. These findings were written against b2705a9;
if commits have landed on feature/floating-ready-window since, treat every specific bug, file, or
line callout as POTENTIALLY STALE and re-diff before acting on it.

- Mode: Review (initial)
- Files reviewed: 28
- Commits reviewed: 2
- Base: feature/niw2-587-prepare-drop-zone (13b7ff5)
- Head: feature/floating-ready-window (b2705a9)
- Reviewed commits:
  - db49e4b — feat(desktop): float "Your video is ready" outside the app window
  - b2705a9 — docs(backlog): "Your video is ready" floats on the desktop
- Prior pullfrog review: none
-->


<!-- PULLFROG_DIVIDER_DO_NOT_REMOVE_PLZ -->
<sup><a href="https://pullfrog.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://pullfrog.com/logos/frog-white-full-18px.png"><img src="https://pullfrog.com/logos/frog-green-full-18px.png" width="9px" height="9px" style="vertical-align: middle; " alt="Pullfrog"></picture></a>&nbsp;&nbsp;｜ [Fix all ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/466?action=fix&review_id=5720290019) ｜ [Fix 👍s ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/466?action=fix-approved&review_id=5720290019) ｜ [View workflow run](https://github.com/niway-dev/kaipu-record/actions/runs/41153729056/job/124395818103) ｜ Using `claude-opus-5-5` ｜ [𝕏](https://x.com/pullfrogai)</sup>

