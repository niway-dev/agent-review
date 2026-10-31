=== COMMENT 4429714659 github-actions[bot] 2026-10-31T01:01:08Z review=5720253880 reply_to=null commit=3ec7a13 apps/kaipu-record/src/renderer/src/features/recording/recorder-store.ts:952
🟡🐛 **Consider · bug: When the camera can't reopen, the face goes into the same parked window, not a new one**

Say the camera is turned on again mid-take. The hub sees `takeRecordsWebcam()` still true and calls `show()` on the parked window. That window is protected and left out of the running capture (recording-hub.ts:304-305). If `turnWebcamOn` then returns "unavailable", the engine ends the file and main only runs `bubbleProtection.webcamEnded` + `applyProtection()` (recording-hub.ts:456-459). Main's own docs call that best effort: it is unverified whether a running ScreenCaptureKit stream picks up a window that drops its protection (camera-bubble-window.ts:140-144).

The hub handles the parked case differently. When the file ends while the window is parked, it destroys the window and creates a new one (line 304), because a new unprotected window is "the one a running capture is known to record". The reopen-failure path, which this PR adds, gets no such replacement. The face can then be missing from both the webcam file and the screen. Meanwhile this comment says "main put the bubble back in the capture", and `webcamReopenFailed` sets `webcamUnavailable`, which tells the user the face is in the screen.

You could have the `recordingWebcamEnded` handler recreate a visible bubble during a take the same way. Or reword this comment and the user message so they don't promise the face is in the screen.

=== COMMENT 4429714662 github-actions[bot] 2026-10-31T01:01:09Z review=5720253880 reply_to=null commit=3ec7a13 apps/kaipu-record/src/renderer/src/features/recording/recorder-store.ts:938
🟡📝 **Consider · docs: Comment says a following off waits on the queue, but off runs synchronously**

The comment reads "On the queue, so an off that follows waits for this camera to open and releases it". But the off branch (lines 924-934) calls `handle.turnWebcamOff()` synchronously, outside `queue`. What actually releases a camera that was opened late is the engine's `cameraRequest` counter (recorder-engine.ts:790-793 and 810). The behavior is correct; only the explanation is wrong. Suggest rewording it: the on is queued after earlier mic changes, and an off that comes while the camera is still opening supersedes it through the engine's request counter.

=== COMMENT 4429714665 github-actions[bot] 2026-10-31T01:01:09Z review=5720253880 reply_to=null commit=3ec7a13 apps/kaipu-record/src/main/recording/recording-hub.test.ts:2099
🟡🧪 **Consider · tests: Test name says it covers the hub reset, but only abort is tested**

"a bubble parked when the take is aborted or the hub reset is destroyed too" only calls `recordingAbort`. The reset path (`releaseParkedBubble()` after `bubbleProtection.reset()`, recording-hub.ts:1022) and the stop path (`applyStopWindowState`, line 846) have no test. Either add those cases or rename the test to cover abort only.

=== COMMENT 4429714666 github-actions[bot] 2026-10-31T01:01:09Z review=5720253880 reply_to=null commit=3ec7a13 apps/kaipu-record/src/renderer/src/features/recording/webcam-relay.test.ts:87
🟡🧪 **Consider · tests: The "dropped (and closed)" path for a cut camera's late frame never runs**

The comment says a frame the old camera still delivers after `cut()` is "dropped (and closed), not relayed". In practice `cut()` cancels the reader (`webcam-relay.ts:69`), so `first.push(late)` throws inside the `try` and the frame never reaches the pump. That means the `current !== reader` branch that calls `value.close()` (`webcam-relay.ts:91-93`) is not exercised, and nothing checks `late.close`.

The `written` assertion passes either way. To cover the branch, have a frame already queued before the cut so it is read after `current` changes, for example by pushing it before calling `relay.cut()` without flushing. Then assert `expect(late.close).toHaveBeenCalled()`. If you'd rather not, change the comment so it doesn't claim a close the test never checks.

=== COMMENT 4429722868 pullfrog[bot] 2026-10-31T01:03:38Z review=5720263597 reply_to=null commit=3ec7a13 apps/kaipu-record/src/renderer/src/features/video-editor/webcam/webcam-model.ts:155
`crypto.randomUUID()` makes the seeded layer different on every call, and Share's fingerprint hashes that layer, ids included: `wholeFingerprint(scene.webcam)` → `stableStringify(webcam)` in `export-reuse.ts:81`. Each time `ShareRecording` mounts it gets a new `whole:<hash>`, so `findReusableExports` never finds the earlier Share file and re-encodes the take whenever it has a gap. Takes without gaps are not affected, because they seed `segments: []`. The PR body says the fingerprint is "covered automatically", but that only holds if seeding is deterministic. The ids only need to be unique within the scene, and `validateWebcamSegment` accepts any string, so ids derived from the gap are enough.

<details><summary>Technical details</summary>

````markdown
# Seeded gap segments must have deterministic ids

## Affected sites
- apps/kaipu-record/src/renderer/src/features/video-editor/webcam/webcam-model.ts:155 — `id: crypto.randomUUID()` in `gapSegments`
- apps/kaipu-record/src/renderer/src/library/components/share-recording.tsx:126-130 — `initialScene(...)` → `wholeFingerprint(scene.webcam)` → reuse lookup at :183
- apps/kaipu-record/src/renderer/src/features/video-editor/scene.ts:153 — `reconcileWebcam` seeds again for sessions that have no saved webcam layer; the editor's post-export stamp check (`video-editor-page.tsx:712`) compares `editFingerprint` against that reseeded scene

## Required outcome
- `seedWebcamScene` returns the same ids for the same sidecar, so `wholeFingerprint` is stable across Share mounts and the reuse lookup matches.
- Add a test: seeding the same `WebcamTrackMeta` twice gives equal `wholeFingerprint` values.

## Suggested approach
- e.g. `id: `gap-${segments.length}`` (or derive from `gap.startMs`). User-created segments use UUIDs, so these cannot collide.
````

</details>

```suggestion
    segments.push({ id: `gap-${segments.length}`, start, end, mode: "hidden" });
```

=== COMMENT 4429779689 pullfrog[bot] 2026-10-31T01:20:44Z review=5720330077 reply_to=4429722868 commit=3ec7a13 apps/kaipu-record/src/renderer/src/features/video-editor/webcam/webcam-model.ts:155
Addressed in 29395c3 — seeded ids now derive from the segment start, with a `wholeFingerprint` stability test.

<!-- PULLFROG_DIVIDER_DO_NOT_REMOVE_PLZ -->
<sup><a href="https://pullfrog.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://pullfrog.com/logos/frog-white-full-18px.png"><img src="https://pullfrog.com/logos/frog-green-full-18px.png" width="9px" height="9px" style="vertical-align: middle; " alt="Pullfrog"></picture></a>&nbsp;&nbsp;｜ [View workflow run](https://github.com/niway-dev/kaipu-record/actions/runs/41154789953/job/124399098677) ｜ via [Pullfrog](https://pullfrog.com) ｜ Using `claude-opus-5-5` ｜ [𝕏](https://x.com/pullfrogai)</sup>

=== COMMENT 4429785440 pullfrog[bot] 2026-10-31T01:22:39Z review=5720337044 reply_to=null commit=b2219de apps/kaipu-record/src/renderer/src/features/recording/recorder-store.ts:944
Nothing re-checks whether the camera was turned off again before this queued on reaches the engine, and an off is not queued. Take off → on1 (still opening) → off → on2 (queued behind on1) → off. The last off reaches the engine while on1 is still opening, and on2 runs after that. The engine's `cameraWanted` is `false` at that point, so `turnWebcamOn()` opens the camera and feeds the file. The light stays on while the Camera toggle shows off, until the take stops or the camera is turned on again. The gap stays open, so the editor hides those frames, but the user's "off" was not honoured. The comment above says the engine drops a camera that is turned off while it opens, but an on still waiting in the store's queue never reached the engine, so it cannot be dropped.

<details><summary>Technical details</summary>

````markdown
# A queued turn-on must not reach the engine after a newer off

## Affected sites
- apps/kaipu-record/src/renderer/src/features/recording/recorder-store.ts:943-944 — the queued closure calls `handle.turnWebcamOn()` without checking `webcamOn` / `request`
- apps/kaipu-record/src/renderer/src/features/recording/recorder-engine.ts:829-833 — `turnWebcamOn` treats `cameraWanted === false` as "open it", which is correct for its own contract

## Required outcome
- An on whose request is no longer the newest, or that runs after the camera was turned off again, does not call the engine. The engine already has the newer state: off was applied directly, and a newer on is queued behind this one.
- Add a store test: `onOffOnWhileOpening()` followed by `broadcast({ isCameraEnabled: false })` before `answers[0]` resolves. Expect `turnWebcamOn` to be called only once, and the gap to stay open until the stop.
````

</details>

```suggestion
      queue = queue.then(async () => {
        // Turned off again, or on again by a newer on, before this one reached the engine: the
        // engine already has the newer state, and opening the camera would light it.
        if (!webcamOn || request !== webcamOnRequest) return;
        const result = await handle.turnWebcamOn();
```

