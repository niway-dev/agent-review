import json
P={x['number']:x for x in json.load(open('/tmp/kaipu-mine/prs.json'))}
def sz(n):
    x=P[n]; return {"files":x['changedFiles'],"add":x['additions'],"del":x['deletions']}
def sizes(ns): return sz(ns[0])
O4="Claude Opus 4.8 (trailer)"; O5="Claude Opus 5 (trailer)"; S5="Claude Sonnet 5 (trailer)"
NR="did-not-run"; NRN="PR merged before the AI reviewer existed (2026-10-20); no review comments in cache"
bugs=[]
def add(id,fix,fc,desc,uv,cls,ip,ic,conf,om,note,mixed,vis,rn,diff,dr,found,fixed,audit=None,fable_found=False,fable_fixed=False,size_pr=None):
    bugs.append({"id":id,"audit_id":audit,"fix_prs":fix,"fix_commits":fc,"description":desc,"user_visible":uv,"class":cls,
     "intro_prs":ip,"intro_commits":ic,"szz_confidence":conf,"omission":om,"szz_note":note,
     "intro_pr_size":sz(size_pr or ip[0]),"intro_pr_mixed":mixed,"visible_from_diff":vis,"replay_note":rn,
     "difficulty":diff,"difficulty_reason":dr,"found_by":found,"fixed_by":fixed,"fable_found":fable_found,"fable_fixed":fable_fixed,
     "prior_reviewer":NR,"prior_reviewer_note":NRN})

add("rec-aspect-ratio-squeeze",[12],["c3ec7fd0"],
 "Capture was constrained to a hardcoded 1920x1080 box, so Chromium's desktop capturer rescaled non-16:9 panels to 16:9 without keeping proportions (fix: capture native, re-frame with fitToCap).",
 "Recordings on every MacBook (3024x1964, AR 1.54) came out stretched ~15% horizontally and soft; circles became ellipses.",
 "cross-file contract",[2],["709819b2","0f639922","847f0278"],"high",False,
 "Removed lines blamed to #2 (recorder-engine.ts constraints, recording-quality.ts presets, watermark-compositor.ts); all introduced by the initial recorder import.",
 True,"partial","#2 is the 276-file initial import; poor replay. The hardcoded 1920x1080 constraints are visible, but the bug (Chromium rescales without AR) needs platform knowledge and a non-16:9 display.",
 5,"Needs knowledge of how Chromium's desktop capturer rescales constraints and a non-16:9 screen; code looks like a normal resolution cap.",
 "Owner/user report (MacBook recording) + ffprobe confirmation by Opus 4.8 during fix",O4)

add("editor-export-poster-seek-never-fires",[43],["00be53b7"],
 "captureExportThumbnail set video.currentTime = 0 on a <video> already at 0, so 'seeked' never fired; the shared 2s timeout won and the function returned null (replaced by mediabunny CanvasSink-based generateThumbnail).",
 "Every edited+exported video appeared in the Library with no thumbnail (generic film-strip icon).",
 "race/ordering",[28],["2f796102"],"high",False,
 "export-thumbnail.ts (78 removed lines) and use-video-export.ts blamed entirely to #28.",
 True,"partial","#28 is the 63-file, +8.7k video editor; poor replay. The seek-to-same-time pattern is visible in export-thumbnail.ts but requires knowing 'seeked' does not fire when time is unchanged.",
 4,"Browser-semantics trap (no seeked event when currentTime is unchanged); plausible-looking code with a timeout fallback that hides the failure.",
 "Reported by user/owner (reproduces on every edit); root cause traced by Opus 4.8",O4)

add("edited-title-hardcoded-spanish",[44],["48089ee6"],
 "Exported edit's title suffix was hardcoded '(editado)' in use-video-export instead of a localized message (fixed with videoEditor.editedTitle).",
 "Edited-video titles read '(editado)' in Spanish even when the UI language is English.",
 "UI/cosmetic",[28],["2f796102"],"medium",False,
 "use-video-export.ts lines blamed to #28 (6 strong). #32 (i18n stage 2, propagated translations) missed this string, which is a secondary contributor.",
 True,"yes","#28 is large; the literal string is plainly visible in the diff.",1,"Hardcoded Spanish string in an otherwise i18n'd app; obvious from the diff if the reviewer looks for it.",
 "Owner (called 'bonus bug' in #44 body)",O4)

# ---- #79 / #81 auth stack
add("auth-origin-csrf-403",[79],["7807c94f"],
 "Desktop auth-client's credential POSTs sent no Origin header and the server's trustedOrigins had no desktop entry; better-auth's formCsrfMiddleware (Sec-Fetch-* gated) rejects sign-in/email and sign-up/email with MISSING_OR_NULL_ORIGIN when fetched from Electron main.",
 "Sign-up and sign-in failed outright with 403 for every desktop user.",
 "cross-file contract",[68],["ce9613b1"],"medium",True,
 "Pure addition (Origin header + trustedOrigins literal), so blame is weak; auth-client.ts callCredentialEndpoint was written in #68 (task 3). Server side auth.ts trustedOrigins pre-existed from initial commit.",
 False,"partial","#68 is a small stacked PR (204 lines, 2 files) on base feat/desktop-auth-02-shared-types; replay it at its own base. The omission is only visible with knowledge of better-auth's second CSRF check (spec's adversarial review also missed it).",
 5,"Requires third-party library internals (formCsrfMiddleware, Sec-Fetch-* in Electron main-process fetch) and cross-file server/client reasoning; mocks hid it from tests.",
 "Sonnet 5 during Task 12 manual verification against live wrangler dev",S5,size_pr=68)

add("auth-panel-stale-form-mode",[79],["7807c94f"],
 "AccountPanel never reset its form `mode` to 'closed' after a successful sign-in/sign-up; fixed with a useEffect on the signed-in transition.",
 "After signing out, the stale, still-filled sign-in/sign-up form reappeared instead of the 'Sign in'/'Create account' buttons.",
 "state machine",[73],["780dbbdb"],"high",True,
 "Missing reset logic (omission); strong blame on 780dbbdb account-panel.tsx where mode state is defined.",
 False,"yes","#73 is 237 lines/3 files, base is the previous stack branch.",
 3,"Requires mentally simulating the sign-in then sign-out lifecycle across a status hook and local state; tests mocked that transition.",
 "Sonnet 5 during Task 12 manual verification",S5)

add("auth-signed-out-flash-on-load",[79],["7807c94f","2e627bca"],
 "useAuthStatus defaulted to signed-out with pending=false until the initial getAuthStatus() resolved, so AccountPanel rendered the signed-out buttons for an already-signed-in user.",
 "Brief flash of 'Sign in'/'Create account' buttons on load for signed-in users.",
 "race/ordering",[72],["997e2753","780dbbdb"],"high",False,
 "use-auth-status.ts initial pending state (997e2753, #72) and account-panel.tsx closed-branch (780dbbdb, #73).",
 False,"yes","#72 is 210 lines/2 files; initial-state default is visible. Related latent issue (initial promise has no catch so pending would stick) was found in the fix itself and not counted.",
 3,"Timing issue invisible with instant mocked promises; needs reasoning about initial-state semantics.",
 "Sonnet 5 during Task 12 manual verification",S5,size_pr=72)

add("auth-get-session-null-body",[81],["1d735e55"],
 "getSession only treated HTTP 401 as 'session gone', but better-auth /get-session answers 200 with JSON null for an expired/missing session, so data.user.email threw a TypeError.",
 "The stale token was never cleared; auth state landed on 'unknown' forever for the common expired-session case (no recovery without manual intervention).",
 "state machine",[68],["ce9613b1"],"high",False,
 "5 removed lines in auth-client.ts blamed to ce9613b1 (#68).",
 False,"partial","#68 small; visible that only 401 is handled, but the 200+null contract is third-party behaviour (verified by Opus 5 in installed better-auth@1.4.18 source).",
 5,"Needs knowledge of better-auth's undocumented-in-diff 200+null response; the code looks correct against a REST-style assumption.",
 "Claude Opus 5 whole-branch review (dispatched on opus) with source verification",O5)

add("auth-ipc-throw-loses-error-kind",[81],["a365f9f3"],
 "signIn/signUp IPC handlers threw bare {kind} object literals; Electron serializes thrown IPC errors down to .message only, so the renderer received err.kind undefined (fixed by returning a discriminated AuthAttemptResult).",
 "Every sign-in/sign-up failure showed the generic 'Something went wrong'; 3 of 4 specific error strings were unreachable.",
 "cross-file contract",[69],["c7f0d906","997e2753","111acd2e"],"high",False,
 "22 removed lines across auth-store.ts (#69), use-auth-status.ts (#72), electron-api.ts (#70); primary origin is the throw in #69's handlers.",
 False,"partial","#69 is 421 lines/2 files (auth-store + test); the bug needs the renderer consumer (#72/#73) and Electron IPC serialization knowledge. Renderer tests used mockRejectedValue, bypassing serialization.",
 5,"Needs Electron IPC error-serialization knowledge and cross-process reasoning; tests masked it by injecting errors directly.",
 "Claude Opus 5 whole-branch review (critical)",O5,size_pr=69)

add("auth-bearer-token-exposed-via-web-proxy",[81],["78865f3f"],
 "bearer() added to the shared better-auth config makes every response carry set-auth-token (raw session token) and expose it via CORS; apps/web-hono's createProxyHandler copies response headers verbatim so page JS can read it. Also requireSignature defaulted off.",
 "Web app sessions' raw token readable from page JS (same-origin XSS could steal a live session despite httpOnly cookie); security regression.",
 "security/abuse",[66],["7574138b"],"medium",False,
 "base-config.ts bearer() line blamed to #66; proxy-handler.ts pre-existed from the initial commit (weak).",
 False,"partial","#66 is a 2-line/1-file PR; the harm only appears from interaction with the existing proxy-handler in another package, so a reviewer must open that file.",
 5,"Cross-package interaction: a 2-line plugin addition is safe-looking, the leak is in unmodified code that forwards headers.",
 "Claude Opus 5 whole-branch review (Important)",O5)

add("auth-password-too-short-reported-as-email-taken",[81],["d51f8147"],
 "callCredentialEndpoint mapped every non-ok status to one hardcoded error kind per endpoint without reading the body; better-auth returns 400 PASSWORD_TOO_SHORT for <8 chars.",
 "Signing up with a 6-char password told the user 'That email is already registered.'",
 "cross-file contract",[68],["ce9613b1"],"high",False,
 "11 removed lines in auth-client.ts blamed to ce9613b1 (#68).",
 False,"partial","#68 small; needs knowing better-auth's default minPasswordLength=8 (baseConfig sets none).",
 4,"Misleading error mapping visible, but the trigger (server-side default min length) is external knowledge.",
 "Claude Opus 5 whole-branch review (Important)",O5)

add("auth-lastknownemail-not-persisted",[81],["274be6e9"],
 "lastKnownEmail came from a process-local cachedIdentity populated only after a successful call in the current process, so on restart with token on disk and server unreachable it was null; also a throwing unlink in signOut could restore a signed-out session next launch and cachedIdentity was not cleared on confirmed-gone.",
 "In the offline-after-restart case the 'unknown' account label was empty; a failed token delete could silently re-sign-in a user who signed out.",
 "state machine",[69],["c7f0d906"],"high",False,
 "15 removed lines in auth-store.ts blamed to c7f0d906 (#69).",
 False,"partial","#69 contains the whole store; the gap versus the spec's offline scenario is visible only if the spec is read alongside.",
 4,"Needs reasoning across restart/offline scenarios against the spec's intent; behaviour is internally consistent in a single process.",
 "Claude Opus 5 whole-branch review (Important)",O5)

add("auth-web-typecheck-errors-hidden",[77],["c671553a"],
 "Renderer auth code (errorCopyKey returning bare string where t() needs a literal union; test mocks typed unknown) failed typecheck:web, but every task's verification only ran typecheck:node and vitest (esbuild strips types).",
 "bun run build failed (4 TS errors); the app could not be built for manual verification.",
 "CI",[73],["780dbbdb","997e2753"],"medium",False,
 "No removed lines (type annotation fixes); errorCopyKey in #73, use-auth-status.test.ts in #72. Fix commit c671553a is the one merged via #75's stack.",
 False,"partial","#73 diff shows errorCopyKey returning string; whether t() demands a literal union depends on the typed i18n helper elsewhere.",
 3,"Type error that only a type-aware check catches; code reads fine.",
 "Sonnet 5 / orchestrator running bun run build",S5)

add("ci-e2e-missing-main-vite-server-url",[83],["ba61fc80"],
 "Commit c17f54b1 made the Electron main process throw when MAIN_VITE_SERVER_URL is unset (inlined at build time); the E2E CI job never set it.",
 "All 10 desktop E2E specs failed with firstWindow Timeout 30000ms; every PR was blocked.",
 "CI",[81],["c17f54b1"],"high",False,
 "Behavior introduced by the explicit server-URL check replacing the non-null assertion in src/main/index.ts (c17f54b1, in #81); the workflow files were not touched by it.",
 True,"partial","#81 has 17 files/+420 and mixes several unrelated fixes; the throw is visible, but the CI workflow impact needs cross-file reading.",
 4,"Cross-file: a code change fails a workflow that is not in the diff.",
 "Opus 5 while validating #83 (pipeline failure)",O5)

add("release-build-missing-main-vite-server-url",[83],["58a09066"],
 "release-desktop.yml built the signed app without MAIN_VITE_SERVER_URL (inlined at build time); since c17f54b1 the main process throws at startup when it is missing.",
 "The next signed release would have shipped a binary that throws on launch and opens no window, with build and notarization both green (caught before release).",
 "config/env",[81],["c17f54b1"],"medium",False,
 "Same introducing commit as the E2E failure; the release workflow was missing the variable since the auth wiring (#71) but only became fatal with c17f54b1.",
 True,"partial","#81 mixed. Reviewer must reason that a build-time-inlined env var is required by a new startup guard and that the release workflow does not provide it.",
 5,"Build-time env inlining plus a workflow in a different file; success signals all green.",
 "Opus 5, found while tracing the E2E breakage",O5)

add("screenshots-se-handle-dead-after-wrap",[83],["b4fdc33c"],
 "SE corner handle treated the dragged box height as the target font size, which only holds for one line (textBoxPx returns lines x fs x LH); once the east handle set a wrap width and the label wrapped to N lines the derived size was N times too large and always pinned to the largest level, emitting a no-op patch.",
 "After dragging the east edge, the text annotation's SE corner handle stopped resizing the text.",
 "UI/cosmetic",[51,50],["4a387b6d","c9018d48","7bf59ccd"],"medium",False,
 "4 removed lines in handles.ts blamed to #14 (original corner formula) but the failure needs wrapped/multi-line text: #50 (multi-line) and #51 (wrap width via E handle). #51 is the PR that makes it reachable via the UI.",
 False,"yes","#51 is 121+/35- over 7 files, a good replay target; the SE-handle formula sits in a file it touches.",
 4,"Requires reasoning that box height now scales with line count while the handle formula assumes one line.",
 "Owner/Opus 5 while using the editor",O5)

add("annotation-long-word-overflows-box",[194],["b28fb22a"],
 "textLines kept an over-long word whole, so it ran past the text box that selection outline, hit-test and export measure from (now breaks like overflow-wrap: break-word).",
 "A long unbroken word overflowed the label box in the screenshot editor, export and video overlay.",
 "UI/cosmetic",[51],["4a387b6d"],"medium",True,
 "Mostly missing logic in the wrap function added by #51 (6 strong lines in tools.ts); #189 later touched it (3 lines).",
 False,"yes","#51 introduced the word-wrap function; edge case of over-long words is checkable from the diff.",
 2,"Classic word-wrap edge case; visible to a careful reader.",
 "Owner (annotation fixes, #194)",O5)

add("annotation-handles-visible-while-editing-text",[194],["d056bd4c"],
 "Resize handles stayed drawn (and hit-tested) from the stored label geometry while the inline text editor was open, so the box deformed around the editor and an invisible corner could rescale the font mid-edit.",
 "While typing in a text label the selection box/handles drew mismatched and could be grabbed.",
 "UI/cosmetic",[52,51],["8c823850","4a387b6d"],"low",True,
 "Missing guard; blame points at #14 annotation-layer lines (handle drawing). Guess: bug appears once labels were re-editable in place (#52) with wrap-resizable boxes (#51).",
 False,"yes","#52 is 244+/47- over 8 files.",
 3,"Interaction between editing state and handle rendering/hit-test across two code paths in one file.",
 "Owner (annotation fixes, #194)",O5)

add("export-poster-from-source-not-rendered-output",[132],["191c4f57"],
 "Export hook derived the exported recording's poster by decoding the first frame of the original source blob instead of the rendered output; the export worker now encodes a JPEG of the first composed frame.",
 "Library card of an edited export showed footage the user had cut away; latent privacy leak once blur/cover regions are burned in at export.",
 "data loss",[43],["00be53b7"],"medium",False,
 "use-video-export.ts generateThumbnail(sourceBlob) lines blamed to #43 (4) and #28 (4). #43 rewired the poster to the shared primitive but kept the source blob input.",
 False,"yes","#43 is 8 files +362/-88 and replays well; it is visible that the poster input is sourceBlob, the semantic wrongness is a design judgement.",
 3,"Semantic: needs recognizing the poster should reflect the edited output; no failure signal in tests.",
 "Opus 5 during video-editor v2 audit",O5)

add("cursor-track-tail-cut-floors-duration",[143],["fb044684"],
 "recording-hub cut the cursor track at durationSeconds * 1000, but durationSeconds is Math.floor(elapsedMs/1000), discarding up to ~1 s of real samples/clicks at the end of every recording (fix: unfloored durationMs + 250 ms).",
 "Cursor/click track ended up to ~1 s before the video ends (observed 24,994 ms on a 25.9 s video), so the cursor froze before the end in the editor.",
 "data loss",[133],["2468bd10","26cfad1a"],"high",False,
 "maxMs argument lines blamed to 2468bd10 (#133) and 26cfad1a (#134, 1 line reformat/changed).",
 False,"partial","#133 is 29 files +1475; #133's body even states the cut as 'durationSeconds x 1000'. Visible if the reviewer knows durationSeconds is floored in recorder-store.",
 4,"Cross-file: units/rounding semantics of durationSeconds defined elsewhere; off-by-up-to-1s only visible on real recordings.",
 "Claude Fable 5.1 (observed with the new cursor-track inspector)","Claude Fable 5.1 (trailer)",fable_found=True,fable_fixed=True)

add("library-exported-badge-compares-clocks",[159],["0750c51b"],
 "Library decided 'exported' via newest.createdAt >= video.editSavedAt, but an export's createdAt is its birthtime (encode start) and exporting always saves the session afterwards, so editSavedAt always lands later; fixed with an exportedSavedAt stamp carried through saves.",
 "'Edited · not exported' badge appeared on every export, even directly above a populated Exports list.",
 "state machine",[156],["9abc19d2","30829639"],"high",False,
 "32 removed lines blamed to #156 (lineage.ts, edit-project-probe.ts, compose-library.ts).",
 False,"partial","#156 is 38 files/+1760; lineage.ts rule is visible. The ordering fact (export saves session after the encode, birthtime = start) lives in video-editor-page.",
 4,"Timing/ordering semantics across files (fs birthtime vs session write); tests used fixtures that agreed with the rule.",
 "User/owner prod review of #156 on the first edited recording",O5)

add("video-preview-clipped-on-short-window",[177],["45e882e4"],
 "Preview .content width came from viewport units (min(64vw, 46vh*ratio)) while height was capped by the row (max-height: min(46vh,100%)), so on short windows the box stopped matching the frame ratio and overflow:hidden clipped the bottom.",
 "On windows shorter than ~850px the bottom of the recorded screen (e.g. last terminal line) was cut off in the editor.",
 "UI/cosmetic",[141],["d491b7d4"],"high",False,
 "7 removed CSS lines in preview-stage.module.css blamed to d491b7d4 (#141); width formula originally from #28.",
 True,"partial","#141 is 43 files +981; mixed polish PR. CSS bug requires layout reasoning; jsdom cannot reproduce.",
 4,"Pure layout interaction between viewport and container constraints; invisible to unit tests.",
 "Owner (reported seeing the last terminal line missing)",O5)

add("record-page-holds-microphone-open",[181],["415f6ca6"],
 "useMicrophones opened a real getUserMedia({audio:true}) stream on every mount just to unlock device labels for enumerateDevices, then stopped it.",
 "Opening the Record page (default route, every launch) turned on the OS microphone indicator and moved the user's audio meter although nothing was recording.",
 "resource leak",[2],["d0f431c5"],"high",False,
 "11 removed lines in use-microphones.ts blamed to d0f431c5 (#2 initial record feature).",
 True,"partial","#2 is the 276-file initial import; poor replay. The always-prime behavior was deliberate and test-asserted.",
 3,"Deliberate-looking workaround; the harm is a privacy-visible OS indicator, not a failing test.",
 "Owner report ('se mueve mi audio...')",O5)

add("video-label-drawn-twice-under-editor",[185],["ae7b5150"],
 "While the inline editor was open the label kept rendering underneath the textarea (the screenshot editor skips it via a.id === editing?.id ? null : ...), and selection outline/handles were drawn on both.",
 "Editing a video label showed the same words twice a hair apart, hard to read.",
 "UI/cosmetic",[184],["2c33d5b8"],"medium",True,
 "Omission (guard not ported); #28 weak blame; the behaviour appeared when #184 made labels editable with a textarea overlay.",
 False,"yes","#184 is 238+/24- over 7 files; a reviewer comparing against the screenshot editor's pattern could catch it.",
 3,"Requires comparing with the sibling screenshot editor to notice a missing line.",
 "Owner",O5)

add("video-label-double-click-edit-broken-by-pointer-capture",[187],["347c09ae"],
 "Move branch captured the pointer on e.target; for a multi-line label that is a <tspan> which re-renders/vanishes when selection changes, so the two clicks of a dblclick no longer share a target and the dblclick never fires.",
 "After labels became movable, double-click to edit a video label stopped working.",
 "state machine",[184],["2c33d5b8"],"medium",False,
 "Old setPointerCapture(e.target) from #28 (2 strong lines), made reachable by #184 changing label content to per-line <tspan>s.",
 False,"partial","#184 diff shows the tspan change; the faulty capture line is in unmodified code, and jsdom cannot reproduce pointer capture.",
 5,"Needs DOM event semantics (dblclick target pairing, pointer capture) across a changed render shape and an untouched handler.",
 "Owner",O5)

add("video-label-hit-box-ignores-multiline",[187],["4a337db4"],
 "Hit test still used text.length*fs*0.55 by fs*1.3 (newlines counted as characters) instead of textBoxPx.",
 "A tall multi-line label could not be clicked below its first line; the click fell through and started video playback.",
 "UI/cosmetic",[184],["2c33d5b8"],"medium",False,
 "Old heuristic from #28; #184 made labels multi-line without updating the hit test.",
 False,"partial","#184 7 files; hit-test code is not in the diff, so the reviewer must grep for other copies of the geometry.",
 4,"Three copies of one geometry; the stale copy is outside the diff.",
 "Owner",O5)

add("video-label-reopen-shows-one-line",[187],["859e0080"],
 "Reopening a multi-line label showed one line because the textarea starts at rows={1} and auto-grow lives in onInput, which never fires for a prefilled value.",
 "Editing an existing multi-line label showed only the first line until the user arrowed down.",
 "UI/cosmetic",[184],["2c33d5b8"],"medium",True,
 "Omission of the sizing effect that the screenshot editor has (ported behaviour incomplete).",
 False,"yes","#184 introduced the textarea editor; missing sizing effect visible against the sibling implementation.",
 3,"Needs knowledge that onInput does not fire for prefilled values and comparison with the screenshot editor.",
 "Owner",O5)

add("landing-shortcuts-typed-glyphs-wrong",[198],["dac57728"],
 "Landing page printed typed keyboard glyphs (⌘⇧P start, ⌘⌃4 screenshot, ⌘L library) that read from nothing; real defaults are ⌘⌃C, ⌘⌃X and no library shortcut exists.",
 "Every shortcut shown on the marketing page was wrong.",
 "cross-file contract",[196],["cac1fe80","0c550495"],"high",False,
 "app-window.tsx/hero.tsx blamed to cac1fe80 and 0c550495 within #196; bindings come from desktop ipc.ts (#13/#4).",
 True,"partial","#196 is the 94-file marketing rebuild (+6211); poor replay. Wrongness requires comparing with ipc.ts default accelerators in another app.",
 4,"Needs cross-app fact-checking of copy against the desktop defaults.",
 "Owner/Opus 5 audit of the landing copy",O5)

add("web-two-headers-on-roadmap-and-legal",[126],["4df313c4"],
 "__root.tsx chose chrome with pathname === '/', but /roadmap and the legal pages bring their own LandingNav/Footer, so they rendered two headers, two footers and nested <main> (fix: route staticData shell and a PublicShell component).",
 "/roadmap showed two headers, two footers and a nested <main>; legal pages had duplicated headers and legal links.",
 "UI/cosmetic",[122,102],["b1ecd499","5f273250"],"high",False,
 "Roadmap lines blamed to #122 (20) and legal-page.tsx to #102 (52); root condition from the initial commit/#7.",
 False,"partial","#122 (12 files +464) replays well; the duplicate chrome is visible only with __root.tsx in view (unchanged by the PR).",
 3,"Interaction with an unmodified root layout file.",
 "Owner",O5)

add("web-tab-title-hardcoded-spanish",[126],["4df313c4"],
 "SITE_TITLE and legal route titles were hardcoded Spanish strings in lib/seo.ts; og:locale pinned to es_PE; default locale was es.",
 "Browser tab title stayed Spanish even with the language switcher on English.",
 "UI/cosmetic",[103],["9727b958"],"high",False,
 "seo.ts and __root.tsx lines blamed to #103 (86 strong).",
 False,"yes","#103 is 25 files +194; the hardcoded title is visible in lib/seo.ts.",
 2,"Hardcoded Spanish copy in head metadata; visible but easy to overlook.",
 "Owner",O5)

add("verification-email-state-lost-on-remount",[120],["eacc93d9"],
 "'Verification email sent' lived in React.useState inside CapacityCard (remounted on each cloud-screen visit), a failed send fell back to 'idle' indistinguishable from not clicking, and Refresh was rendered before any email was sent.",
 "Leaving and returning to the Cloud screen re-enabled the resend button and dropped the 'check your inbox' line; failed sends showed nothing.",
 "state machine",[107,111],["1e6484ae","c64f0ec8"],"medium",False,
 "13 lines blamed to 1e6484ae (#107 resend action) and 3 to c64f0ec8 (#111 refresh button, always rendered).",
 True,"partial","#107 is 42 files +1076 (transactional email); #111 is 3 files and replays well for the always-visible Refresh.",
 3,"Component lifecycle issue (unmount resets state) that needs knowing how the card is mounted.",
 "Owner",O5)

add("web-hono-dev-env-not-reaching-worker",[123],["20df0f21"],
 "web-hono's dev script injected Infisical secrets into the parent Node process (with-env.sh), but @cloudflare/vite-plugin runs SSR in workerd, which reads its own bindings, so env.parse(process.env) saw nothing.",
 "bun run dev failed immediately with ZodError: DATABASE_URL, VITE_SERVER_URL expected string, received undefined.",
 "config/env",[115],["fb69c15f"],"medium",False,
 "Dev script line blamed to fb69c15f (refactor(secrets): filter by consumer tag), which c2pr maps to #115 (console app, 30 files +12.4k mixed).",
 True,"partial","#115 is large and mixed; poor replay.",
 5,"Runtime-boundary reasoning (parent process vs workerd) with green-looking secret injection logs.",
 "Owner",O5)

add("integration-suite-silently-skipped",[125],["0a1f24cd"],
 "test:integration forwarded only TEST_DATABASE_URL under Turbo strict env while the root script fetched only DATABASE_URL; the test did `url ? describe : describe.skip`, so all 10 DB tests skipped and the command exited 0.",
 "bun run test:integration reported success without touching a database.",
 "CI",[92],["54aeff89","443d9903"],"high",False,
 "describeDb skip and turbo env both introduced in 54aeff89 (#92).",
 True,"partial","#92 is 61 files +4572; the three disagreeing pieces live in turbo.json, root package.json and the test.",
 5,"Needs three-file reasoning plus Turbo strict-mode semantics; silent success.",
 "Owner/Opus 5",O5)

add("console-dev-no-env-delivery",[125],["0a1f24cd"],
 "Console runs on workerd via @cloudflare/vite-plugin like web-hono but its dev script was a bare vite dev with no env:pull, so its config fell back to empty values (empty admin list denies everyone).",
 "Console was unusable locally with no route to configure it.",
 "config/env",[115],["fb69c15f"],"low",True,
 "Missing env delivery (omission); console app added in #115.",
 True,"partial","#115 large mixed PR (30 files +12k).",
 4,"Silent fail-closed fallback; needs workerd runtime reasoning.",
 "Owner/Opus 5",O5)

skipped=[
 {"pr":9,"reason":"Worker rename, no defect"},
 {"pr":46,"reason":"Defense-in-depth, no root cause found"},
 {"pr":75,"reason":"Test copy expectations only"},
 {"pr":95,"reason":"Settings gutter cosmetic tweak"},
 {"pr":98,"reason":"Misleading copy, no logic defect"},
 {"pr":116,"reason":"Runner macOS drift; dependency bump (electron-builder passed wrong password to security set-key-partition-list)"},
 {"pr":111,"reason":"Feature (refresh button); defect folded into #120 record"},
 {"pr":44,"reason":"Bug 1 is a feature gap (self-heal); only title record kept"},
 {"pr":194,"reason":"Drag-guard fix is latent hardening; auto-copy part is a feature"},
 {"pr":81,"reason":"Also: stale form error, missing server URL assertion are cleanups; 0f8777ff is a regression in its own fix"},
 {"pr":125,"reason":"Turbo build env declaration and db:command removal are latent/dead-script, not recorded"},
 {"pr":79,"reason":"E2E temp-dir leak and missing catch were self-review findings within the PR"},
]
json.dump({"bugs":bugs,"skipped":skipped},open('/tmp/kaipu-mine/agents/D1-early.json','w'),indent=1,ensure_ascii=False)
print(len(bugs))
