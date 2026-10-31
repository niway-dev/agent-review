=== COMMENT 4429739191 github-actions[bot] 2026-10-31T01:08:24Z review=5720283823 reply_to=null commit=b2705a9 apps/kaipu-record/src/main/recording/recording-ready-window.ts:146
🟡🐛 **Consider · bug: `show()` returns true before the card can paint, so a renderer that never loads loses the card**

`show()` returns true as soon as `ensureWindow()` creates the BrowserWindow (line 146). The window only appears later, in `present()`, once the card sends `recording-ready:card-ready`. `load()` throws away the `loadURL`/`loadFile` promise (lines 261/265), and nothing watches `did-fail-load` or `render-process-gone`. So if the bundle fails to load or the card renderer crashes, `useFloatingReadyCard` has already received `true` and never turns on `inApp`. The user sees no card at all, which contradicts the hook's comment that the card is "never lost".

The same gap exists after a renderer crash on a window that already exists. `rendererReady` stays true, so `present()` sends to a dead renderer and still calls `showInactive()` on a blank transparent window.

One option: resolve the invoke only after `card-ready`, or after a short timeout, and answer false on a load failure. Another: reset `rendererReady` and drop the window on `render-process-gone`.

=== COMMENT 4429739195 github-actions[bot] 2026-10-31T01:08:24Z review=5720283823 reply_to=null commit=b2705a9 apps/kaipu-record/src/main/recording/recording-ready-window.ts:104
🟡🔐 **Consider · security: `recording-ready:show` accepts any renderer, unlike the card channels**

The three card channels check `isOwnSender` (lines 109, 114, 123). The `recording-ready:show` handler does not check who sent it. Any window that loads the shared preload can invoke `showRecordingReady` and float an always-on-top card with an arbitrary `assetId`: the card window itself, the capture toast, the overlay, the panels. Pressing that card then makes the main window navigate to that id.

The payload is validated and `generatePath` encodes the id, so the impact is small. Still, it widens what non-main windows can do across the bridge. Checking that `event.sender` is the main window's `webContents` would keep the channel to the caller the docs describe ("Main window → main").

=== COMMENT 4429744840 pullfrog[bot] 2026-10-31T01:10:07Z review=5720290019 reply_to=null commit=b2705a9 apps/kaipu-record/src/renderer/src/features/recording-ready/use-floating-ready-card.ts:18
The floating card comes back after the user has already answered it. After TikTok, More places or Edit first, the main window pushes Prepare or the editor, and `LibraryDetailPage` unmounts. When the user presses Back, the page remounts on the same history entry, with the same `location.key` and `fromRecording` state. This ref starts empty again, so main is asked a second time and the always-on-top card pops up on the desktop again. The in-app card already reappeared on Back before this PR, but a floating window over every app is much more intrusive. It also goes against this hook's "once per arrival" docstring.

<details><summary>Technical details</summary>

````markdown
# Floating card re-asks on remount of the same history entry

## Affected sites
- apps/kaipu-record/src/renderer/src/features/recording-ready/use-floating-ready-card.ts:18 — `asked` is per component instance, so it resets on remount
- apps/kaipu-record/src/renderer/src/pages/library-detail/library-detail-page.tsx:141 — passes `location.key`, which stays the same on Back/Forward to the same entry

## Required outcome
- A given history entry (`location.key`) asks main to show the floating card at most once for the renderer's lifetime, even when `LibraryDetailPage` unmounts and remounts (Prepare → Back, editor → Back).

## Suggested approach (optional)
- Keep the keys that were already asked in a module-level `Set<string>`, not a `useRef`. That also covers StrictMode's second effect run, which is what the ref is for today.
````

</details>

=== COMMENT 4429744845 pullfrog[bot] 2026-10-31T01:10:07Z review=5720290019 reply_to=null commit=b2705a9 apps/kaipu-record/src/main/recording/recording-ready-window.ts:18
The 16 DIP padding does not leave room for the card's shadow. `StatusCard`'s shadow is `0 30px 80px -30px`, so it reaches about 40px below the card, and the window cuts it off with a hard edge at 16px, at roughly 25–30% opacity. That edge will show on light backgrounds. You could give the window more room below the card (the window height and the body padding in `main.css`), or use a smaller shadow for the floating variant. Either way, this comment is inaccurate right now.

