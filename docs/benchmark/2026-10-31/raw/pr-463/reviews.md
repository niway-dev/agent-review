=== REVIEW 5720253880 github-actions[bot] 2026-10-31T01:01:08Z commit=3ec7a13
**Agent review** of the whole pull request, at `3ec7a13`: all 23 files reviewed.

4 finding(s): 4 to consider; 4 on their lines. Reply in a comment's thread to answer it.

### Summary

**Batch 1 of 2.** Part 1 turns the camera off and on mid-take without ending the webcam file. The bubble window is parked instead of destroyed, and the encoder reads from a relay track, so the file keeps running and gaps are recorded. Each step checks the others' state consistently: main's `takeRecordsWebcam` and the engine's `webcamLive`/relay checks. Cleanup is done in order: `recordingStop` reaches main only after `recordingFinalize`, so `placedBounds` still reads the parked bubble's position. Gap segments are seeded and merged correctly. No blockers. One consider-level bug: if the camera can't be reopened, the face falls back to the same re-shown window, which may not be captured. That relies on main's best-effort unprotect, while the parked path creates a new window. There is also a misleading comment about the queue, and a test name that claims coverage of the hub reset it doesn't test. mediabunny isn't installed in this checkout, so I couldn't confirm that its `sizeChangeBehavior` and `frameRate` options exist.

**Batch 2 of 2.** Part 2 has one minor finding and nothing that blocks the merge.

- **Shared code:** `webcam-track.ts` has only relative imports, so nothing new reaches the preload bundle. The new gap sanitizer handles bad input from the renderer: it drops malformed, empty and backwards gaps, clamps starts before 0, sorts, merges overlaps and caps the list at 1000.
- **Tests:** they match how the gap log, the relay and the seeding code actually behave.
- **Docs:** the ADR 0032 decision 6 and the spec item 7 agree with the engine and store behaviour shown in the tests. That covers the fallback without a relay, refusing "off" before the take begins, trailing gaps, and a camera that can't be reopened.
- **Finding (consider):** one relay test comment claims a late frame from a cut camera is closed, but that code path never runs in the test and no assertion checks it.

<details><summary>Coverage by batch</summary>

| Batch | Files | Lines | Highest risk | Status | Turns | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| Batch 1 of 2 | 14 | 851 | 5 | reviewed | 10 | $0.42 |
| Batch 2 of 2 | 9 | 606 | 4 | reviewed | 6 | $0.21 |

</details>

<sub>Claude Opus 5.5 via Claude Code 2.1.304 · 2 batches · $0.62</sub>

<!-- agent-review sha=3ec7a138c3a878b38284fd13c801ab7226a34abb -->

=== REVIEW 5720263597 pullfrog[bot] 2026-10-31T01:03:38Z commit=3ec7a13
> [!IMPORTANT]
> One concrete regression: seeded gap segments get random ids, so Share's export reuse never matches for a take that has a camera-off gap. Everything else checks out.

**Reviewed changes**

Reviewed the full PR (4 commits): keeping one webcam file through a camera turned off and on mid-take, from the hub's park-vs-destroy down to editor seeding.

- **Park instead of destroy (main)** — During a take with a live webcam file, camera off now hides and keeps the protected bubble window, and camera on shows the same native window again. A webcam file that ended while the bubble was parked falls back to a new unprotected window. Parked windows are released at stop, finalize, abort and reset. The other hub paths (`raise`, `anchorTo`, `applySize`, restore after a screenshot) never re-show a parked window.
- **Bubble preview follows the toggle** — `useCameraOn` lets the hidden bubble release its camera, so the in-use light goes off.
- **Relay track in the recorder engine** — The encoder reads a `MediaStreamTrackGenerator` that the current camera feeds. I checked this against mediabunny 1.61.4's `MediaStreamVideoTrackSource._start`: with an explicit `frameRate`, output frames come from a 4 ms `tick` that repeats `_lastVideoFrame` at `first + count/rate`. So the file holds its last frame through a gap, and the new camera's own timestamps don't matter. The old code was already constant frame rate, because the rate came from the track's settings.
- **Gap log in the store** — A gap opens on the toggle and closes when the first frame is back or the file ends. A gap still open at the stop closes at `durationMs`. A failed reopen sets the existing "camera wasn't available" notice. I traced supersession (off → on → off while the camera is opening) through the engine's `cameraRequest` and the store's queue, and it behaves correctly.
- **Sidecar `webcam.gaps`** — Sanitized: malformed gaps are dropped, starts are clamped to 0, gaps are sorted and merged, and at most 1000 are kept.
- **Editor seeding** — Each gap becomes a hidden webcam segment. Gaps shorter than `WEBCAM_MIN_SEGMENT_SECONDS` are stretched to it, and overlapping ones are merged.

<!--
Pullfrog review metadata. These findings were written against 3ec7a13;
if commits have landed on feature/webcam-camera-toggle-mid-take since, treat every specific bug, file, or
line callout as POTENTIALLY STALE and re-diff before acting on it.

- Mode: Review (initial)
- Files reviewed: 23
- Commits reviewed: 4
- Base: feature/niw2-581-webcam-recorder-followups (c58b68f)
- Head: feature/webcam-camera-toggle-mid-take (3ec7a13)
- Reviewed commits:
  - 7d1a4c6 — fix(desktop): the webcam sidecar keeps the camera-off gaps and the editor hides the face there
  - 0add032 — fix(desktop): a camera turned off mid-take parks the bubble instead of destroying it
  - 355c5b6 — fix(desktop): the recorder keeps one webcam file through a camera turned off and on
  - 3ec7a13 — docs(desktop): ADR 0032 and the webcam spec describe hide-not-destroy and the gaps
- Prior pullfrog review: none
-->


<!-- PULLFROG_DIVIDER_DO_NOT_REMOVE_PLZ -->
<sup><a href="https://pullfrog.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://pullfrog.com/logos/frog-white-full-18px.png"><img src="https://pullfrog.com/logos/frog-green-full-18px.png" width="9px" height="9px" style="vertical-align: middle; " alt="Pullfrog"></picture></a>&nbsp;&nbsp;｜ [Fix all ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/463?action=fix&review_id=5720263597) ｜ [Fix 👍s ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/463?action=fix-approved&review_id=5720263597) ｜ [View workflow run](https://github.com/niway-dev/kaipu-record/actions/runs/41153059096/job/124393741539) ｜ Using `claude-opus-5-5` ｜ [𝕏](https://x.com/pullfrogai)</sup>

=== REVIEW 5720330077 pullfrog[bot] 2026-10-31T01:20:44Z commit=b2219de


=== REVIEW 5720337044 pullfrog[bot] 2026-10-31T01:22:40Z commit=b2219de
> [!IMPORTANT]
> One supersession gap is left in the store: a queued turn-on can open the camera after the user has already turned it off again. Everything else in the new commits checks out, and the random-id finding from the last review is fixed.

**Reviewed changes**

Reviewed the 7 commits pushed since the last Pullfrog review (`3ec7a13`): fallbacks for a webcam file that ends or stalls, supersession of the camera toggle, deterministic seeding, and docs.

- **Bubble window replaced when the webcam file ends mid-take**: `bubbleRejoinsCapture` destroys a protected bubble that is on screen and recreates it unprotected at the same corner, because a running capture is known to record a new window. This also fixes the reopen-failure path from the earlier agent review: at turn-on the window is shown protected, so it gets replaced once the reopen fails. If a screenshot has the bubble hidden, the replacement waits for `restoreCameraBubbleAfterCapture`.
- **Relay reports a lost camera**: `feed(camera, onLost)` reports a read error, write error or end that comes after the first frame, and does not report `cut`, a new `feed` or `stop`. The engine ends the file in that case, so it never holds a frame with no gap to hide it.
- **First-frame and reopen deadlines**: the take's own camera now has 3 s after `webcam.output.start()` to deliver a frame. Turning the camera on uses one `deadlineIn` for both opening it and getting its first frame.
- **Only the newest turn-on closes a gap**: `webcamOnRequest` stops a superseded on from closing the gap early.
- **Deterministic gap ids, duration-aware `reconcileWebcam`**: ids derive from the segment start, so Share's `wholeFingerprint` is stable (covered by a test). Saved sessions reseeded through `reconcileWebcam` now keep trailing gaps inside the recording.
- **Bubble preview waits for the toggle**: `useCameraOn` starts off until main answers, so a window parked before ready never lights the camera.

<!--
Pullfrog review metadata. These findings were written against b2219de;
if commits have landed on feature/webcam-camera-toggle-mid-take since, treat every specific bug, file, or
line callout as POTENTIALLY STALE and re-diff before acting on it.

- Mode: IncrementalReview (delta against prior pullfrog review)
- Files reviewed: 26
- Commits reviewed: 11
- Base: feature/niw2-581-webcam-recorder-followups (c58b68f)
- Head: feature/webcam-camera-toggle-mid-take (b2219de)
- Reviewed commits:
  - b0f028c — fix(desktop): a webcam file that ends mid-take replaces the protected bubble window
  - 7155941 — fix(desktop): a webcam relay that stops copying frames ends the webcam file
  - 8609fab — fix(desktop): only the newest camera turned on mid-take closes its gap
  - 29395c3 — fix(desktop): seeded camera-off gap segments get ids from where they start
  - 4e58bc6 — fix(desktop): a saved session seeded with the webcam keeps its gaps inside the recording
  - a5e31ec — fix(desktop): the camera bubble waits for the Camera toggle before opening the camera
  - b2219de — docs(desktop): ADR 0032 and the webcam spec describe the replaced bubble and the lost relay
- Prior pullfrog review: 3ec7a13 (https://github.com/niway-dev/kaipu-record/pull/463#pullrequestreview-5720263597)
-->


<!-- PULLFROG_DIVIDER_DO_NOT_REMOVE_PLZ -->
<sup><a href="https://pullfrog.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://pullfrog.com/logos/frog-white-full-18px.png"><img src="https://pullfrog.com/logos/frog-green-full-18px.png" width="9px" height="9px" style="vertical-align: middle; " alt="Pullfrog"></picture></a>&nbsp;&nbsp;｜ [Fix all ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/463?action=fix&review_id=5720337044) ｜ [Fix 👍s ➔](https://pullfrog.com/trigger/niway-dev/kaipu-record/463?action=fix-approved&review_id=5720337044) ｜ [View workflow run](https://github.com/niway-dev/kaipu-record/actions/runs/41154789953/job/124399098677) ｜ Using `claude-opus-5-5` ｜ [𝕏](https://x.com/pullfrogai)</sup>

