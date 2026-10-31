import json
P={x['number']:x for x in json.load(open('/tmp/kaipu-mine/prs.json'))}
def mc(n):
    m=P[n]['mergeCommit']; return (m['oid'] if isinstance(m,dict) else m)[:8]
def sz(f,a,d): return {"files":f,"add":a,"del":d}
DNR="did-not-run"
bugs=[]
def B(**k):
    d=dict(audit_id=None,omission=False,intro_pr_mixed=False,fable_found="unknown",fable_fixed=False,prior_reviewer=DNR,prior_reviewer_note="AI reviewer started 2026-10-20; introducing PR merged earlier (rev cache has no bot comments).")
    d.update(k)
    if "fix_commits" not in d: d["fix_commits"]=[mc(d["fix_prs"][0])]
    bugs.append(d)

# ---------- upload abuse / ticket window
B(id="upload-quota-released-while-ticket-live",fix_prs=[276],fix_commits=["f34df723"],
 description="cancelUpload/deleteCloudCopy released the account's quota and deleted the R2 object while the presigned PUT ticket could still write, so a client could store bytes no revision accounts for (audit F-1).",
 user_visible="Abuse: a client can store objects beyond its quota after cancel/delete; no end-user symptom.",
 **{"class":"security/abuse"},intro_prs=[92],intro_commits=["af036542f","a3a3e273"],szz_confidence="medium",omission=True,
 szz_note="Fix is mostly additions (ticketWindowClosed guard in cancel/delete/retry); weak blame on cancel-upload.ts/delete-cloud-copy.ts/retry-pending-deletes.ts written in PR 92 (af036542f). The cloud-data model already stated 'a reservation must not expire while a valid ticket can still write' but cancel/delete ignored it.",
 intro_pr_size=sz(61,4572,171),intro_pr_mixed=True,visible_from_diff="partial",
 replay_note="PR 92 is large (plan 01 Tasks 0-9: quotas, revisions, tickets). Bug spans cancel-upload, delete-cloud-copy and ticket signing; needs the invariant from the data-model doc.",
 difficulty=5,difficulty_reason="Cross-file temporal invariant: a presigned URL cannot be revoked, so release/delete order vs ticket expiry matters; nothing in one file shows it.",
 found_by="API security audit 2026-10-12 (finding F-1, ticket NIW2-323); auditor model unknown",fixed_by="Claude Opus 5.5 (trailer on WIP commit f34df72)",fable_found="unknown")
B(id="legacy-recordings-upload-no-controls",fix_prs=[276],fix_commits=["f34df723"],
 description="Legacy POST /api/v1/recordings upload + confirm routes stayed live with none of the v2 controls (quota, entitlement, verified email, kill switch, content-type allowlist, size-bound ticket) and no client calling them (audit F-2).",
 user_visible="Abuse: unauthenticated-by-quota upload path to R2.",**{"class":"security/abuse"},
 intro_prs=[53,92],intro_commits=["ff47ef515","274848df6","cc0055b98"],szz_confidence="medium",omission=True,
 szz_note="Strong blame (195 removed lines) is PR 53, which created the legacy flow; the 'bug' is that PR 92 added the guarded v2 flow without retiring or guarding v1. PR 53 is the code that exists; PR 92 is the omission.",
 intro_pr_size=sz(60,2168,77),intro_pr_mixed=True,visible_from_diff="partial",
 replay_note="Replay PR 92 (the PR that should have closed v1) or PR 53 (the PR that opened it; whole feature). In PR 53 alone the flow is a feature, not a defect.",
 difficulty=4,difficulty_reason="Needs whole-surface thinking: new controls added on one route while an older sibling route remains unguarded.",
 found_by="API security audit 2026-10-12 (F-2)",fixed_by="Claude Opus 5.5 (trailer)")
B(id="asset-cursor-unvalidated",fix_prs=[276],fix_commits=["f34df723"],
 description="GET assets cursor was z.string() and reached the DB layer unvalidated, so a malformed cursor produced a driver error instead of a 400 (audit F-9).",
 user_visible="500/driver error on a crafted cursor.",**{"class":"cross-file contract"},
 intro_prs=[97],intro_commits=["a6db5b7c4"],szz_confidence="high",omission=False,
 szz_note="cloud.contract.ts line `cursor: z.string().optional()` blamed to a6db5b7c4 (PR 97).",
 intro_pr_size=sz(14,472,158),visible_from_diff="yes",replay_note="Small PR; contract and repository decodeCursor in one diff.",
 difficulty=2,difficulty_reason="Opaque cursor accepted as free string; low severity, visible by reading the contract.",
 found_by="API security audit 2026-10-12 (F-9)",fixed_by="Claude Opus 5.5 (trailer)")
B(id="ticket-extend-between-read-and-release-race",fix_prs=[342],fix_commits=["8ded5c29"],
 description="cancelUpload and sweepExpiredReservations read the revision, checked the ticket window in app code, then ran release() as a second statement; a resumed intent could extendTicket and sign a fresh PUT URL in between, so release deleted the object and the new ticket pointed at an unreserved key (reopens F-1).",
 user_visible="Abuse/data accounting: object written after quota release via a client-controlled race.",**{"class":"race/ordering"},
 intro_prs=[276],intro_commits=["f34df723"],szz_confidence="high",
 szz_note="Removed/changed lines are the WIP cancel-upload.ts/sweep-expired-reservations.ts written in f34df72 (PR 276, an unreviewed WIP commit); release() guard in repository from PR 92.",
 intro_pr_size=sz(19,641,357),intro_pr_mixed=True,visible_from_diff="yes",
 replay_note="PR 276 carries the WIP + spec; the TOCTOU (read, check, then unconditional UPDATE) is visible in cancel-upload.ts of that diff. Mixed with legacy-route removal and cursor schema.",
 difficulty=4,difficulty_reason="Classic check-then-act across two statements; requires knowing extendTicket exists and the client controls both requests.",
 found_by="Opus 5.5 reviewing the WIP in PR 342 (owner session)",fixed_by="Claude Opus 5.5 (trailer)",
 prior_reviewer_note="PR 276 merged 2026-10-19, before the AI reviewer (2026-10-20). PR 342 cache has no bot comments either.")
B(id="retry-pending-deletes-starvation",fix_prs=[342],fix_commits=["8ded5c29"],
 description="retryPendingDeletes listed `deleting` rows with a limit and only then skipped rows whose ticket window was open; enough deferred deletes filled every page so nothing settled, including deletes whose R2 call had really failed.",
 user_visible="Cloud copies stay in 'deleting' forever; storage not freed.",**{"class":"state machine"},
 intro_prs=[276],intro_commits=["f34df723"],szz_confidence="high",
 szz_note="Filter-after-limit introduced in retry-pending-deletes.ts change of the WIP commit f34df72.",
 intro_pr_size=sz(19,641,357),intro_pr_mixed=True,visible_from_diff="yes",
 replay_note="Same PR 276 as the race above.",difficulty=3,difficulty_reason="Pagination then filter is visible, but the starvation scenario needs thinking about queue fill.",
 found_by="Opus 5.5 reviewing the WIP in PR 342",fixed_by="Claude Opus 5.5 (trailer)")

# ---------- CI
B(id="ci-required-check-skips-reads-green",fix_prs=[183],
 description="The release-candidate gate had `if` conditions (draft, event type) so its job could be skipped; GitHub counts a skipped required check as passed, so an `edited` run's skipped gate turned the merge button green while the real run was pending.",
 user_visible="0.8.1 release candidate showed 'All checks have passed, 5 skipped' while verification still ran.",**{"class":"CI"},
 intro_prs=[174],intro_commits=["a8988fea6"],szz_confidence="high",
 szz_note="Removed lines in pr-checks.yml/check-workflow-eligibility.ts blamed to a8988fea6 (PR 174), plus a8292e42c (PR 176).",
 intro_pr_size=sz(7,1020,146),visible_from_diff="partial",replay_note="Workflow + ADR + harness in one PR; the false belief 'skipped = unsatisfied' is written in ADR 0005 inside the same diff.",
 difficulty=5,difficulty_reason="Needs GitHub branch-protection semantics (skipped counts as success); the code looks like a careful guard.",
 found_by="Maintainer observation on PR #178 (0.8.1 RC)",fixed_by="Claude Opus 5 (trailer)")
B(id="ci-gate-reports-per-run-worst-conclusion",fix_prs=[190],
 description="After #183 the gate always ran and failed closed; two runs on the same commit (synchronize + edited, fired together by release-please) produced a permanent failure check run next to a later success, and GitHub resolves a required check to the worst conclusion, so the PR could not merge.",
 user_visible="Desktop 0.9.0 PR (#178) unmergeable for three revisions although verification passed.",**{"class":"CI"},
 intro_prs=[183,174],intro_commits=["433ab5ef7","a8988fea6"],szz_confidence="medium",
 szz_note="433ab5ef7 (PR 183) 40 lines, a8988fea6 (PR 174) 14. Fix-of-a-fix: defect created by PR 183's fail-closed design on top of 174's multi-trigger workflow.",
 intro_pr_size=sz(3,106,36),visible_from_diff="partial",replay_note="Replay PR 183 (small). The multi-run behaviour is not derivable from the diff; measured on the live repo in PR 190 body.",
 difficulty=5,difficulty_reason="Depends on undocumented GitHub rollup behaviour measured empirically.",
 found_by="Maintainer observation (#178 blocked)",fixed_by="Claude Opus 5 (trailer)")
B(id="ci-preview-wrangler-npm-catalog",fix_prs=[208],
 description="preview-web.yml ran wrangler-action without installing wrangler; the action falls back to npm, which cannot parse bun's `catalog:` protocol (EUNSUPPORTEDPROTOCOL), so the preview never reached Cloudflare.",
 user_visible="Preview Web workflow failed on its first run.",**{"class":"CI"},
 intro_prs=[207],intro_commits=["5d73a4719"],szz_confidence="high",omission=True,
 szz_note="Missing step; release-web.yml already carried the `bun add -g wrangler` step. Blame on preview-web.yml lines from 5d73a4719.",
 intro_pr_size=sz(34,1599,609),intro_pr_mixed=True,visible_from_diff="partial",
 replay_note="PR 207 is titled docs(frontend) (web-vitals baseline) and bundles the new workflow commit; the review would have to compare with release-web.yml.",
 difficulty=4,difficulty_reason="Needs knowledge of wrangler-action's npm fallback and the catalog protocol; the sibling workflow is the only hint.",
 found_by="First real workflow run (run 36938226183)",fixed_by="Claude Opus 5 (trailer)")
B(id="ci-preview-environment-says-production",fix_prs=[208],
 description="preview-web.yml declared `environment: production`, so the GitHub run page announced 'Deploying to production' for a job that only runs `wrangler versions upload`.",
 user_visible="Misleading safety signal on a non-deploying job.",**{"class":"CI"},
 intro_prs=[207],intro_commits=["5d73a4719"],szz_confidence="high",
 szz_note="environment line from 5d73a4719.",intro_pr_size=sz(34,1599,609),intro_pr_mixed=True,visible_from_diff="yes",
 replay_note="Low severity; visible in workflow.",difficulty=2,difficulty_reason="Misleading label, visible but judgement call.",
 found_by="First real workflow run",fixed_by="Claude Opus 5 (trailer)")
B(id="ci-web-preview-no-version-url",fix_prs=[209],
 description="kaipu-web wrangler config has routes and no workers_dev; wrangler resolves workers_dev=false, so Version URLs (hosted on workers.dev) cannot exist and the preview workflow grepped output for a URL that was ruled out by config.",
 user_visible="Preview Web run green but reported 'URL: not found'.",**{"class":"config/env"},
 intro_prs=[207],intro_commits=["5d73a4719"],szz_confidence="low",
 szz_note="Workflow grep for URL from 5d73a4719 (PR 207); config side (wrangler.jsonc) predates (PR 7 / Initial commit).",
 intro_pr_size=sz(34,1599,609),intro_pr_mixed=True,visible_from_diff="partial",replay_note="Needs wrangler.jsonc in repo context.",
 difficulty=4,difficulty_reason="Cross-file: workflow expectation vs wrangler default resolution.",
 found_by="Preview Web run #2",fixed_by="Claude Fable 5 + Opus 5 (trailers)",fable_fixed=True)
B(id="ci-e2e-playwright-runs-under-bun",fix_prs=[219],
 description="`bunx playwright test`/`playwright test` under bun loaded Playwright twice, so tests registered on an instance the runner never read: 'No tests found', a release gate testing nothing.",
 user_visible="Desktop E2E gate (pr-checks, release-desktop) ran zero tests.",**{"class":"CI"},
 intro_prs=[176,162],intro_commits=["a8292e42c","9e211fd05"],szz_confidence="low",
 szz_note="bunx playwright lines in pr-checks.yml (PR 176) and release-desktop.yml (PR 162); package.json script from PR 30 (8cab0cf3e). Exact trigger (bun/Playwright version change) unknown.",
 intro_pr_size=sz(4,338,36),visible_from_diff="no",replay_note="Runtime behaviour of bun's node shim; not derivable from diff.",
 difficulty=5,difficulty_reason="Platform/runtime knowledge: bun run shadows node on PATH.",
 found_by="CI run showing 'No tests found'",fixed_by="Claude Opus 5 (trailer)")
B(id="ci-worker-secrets-before-deploy",fix_prs=[246],
 description="Release jobs passed secrets through wrangler-action `secrets:` (wrangler secret bulk BEFORE deploy); once preview-web uploaded a non-deployed version, Cloudflare refused the secret edit; it was also non-atomic (new secrets with old code).",
 user_visible="web-v0.9.0 deploy failed: 'latest version of your Worker isn't currently deployed'.",**{"class":"race/ordering"},
 intro_prs=[207,7],intro_commits=["5d73a4719","1007ad2cc"],szz_confidence="low",
 szz_note="SZZ top: PR 7 (1007ad2cc release-api.yml, 13 lines), Initial commit, PR 208/105. Trigger was preview-web upload (PR 207/208); the secrets-before-deploy pattern predates it.",
 intro_pr_size=sz(34,1599,609),intro_pr_mixed=True,visible_from_diff="no",
 replay_note="Interaction between two workflows and Cloudflare version state; no single diff shows it.",
 difficulty=5,difficulty_reason="Cross-workflow, external platform state.",
 found_by="Failed deploy run 37523401905",fixed_by="Claude Fable 5.1 + Opus 5.5 (trailers)",fable_fixed=True)
B(id="ci-ondemand-review-owner-vs-member",fix_prs=[365],
 description="on-demand review job required author_association == 'OWNER', but on an organization repo GitHub reports the owner as MEMBER, so every @claude comment was skipped.",
 user_visible="@claude comments never started a review.",**{"class":"CI"},
 intro_prs=[355],intro_commits=["4668b1c14"],szz_confidence="high",
 szz_note="Condition line blamed to 4668b1c14.",intro_pr_size=sz(8,1361,1),visible_from_diff="partial",
 replay_note="PR 355 adds the whole review workflow (+1361). Needs GitHub semantics of author_association in orgs.",
 difficulty=4,difficulty_reason="Platform knowledge (OWNER vs MEMBER in org repos).",
 found_by="Maintainer: run 39648100277 skipped on #364",fixed_by="Claude Opus 5.5 (trailer)",
 prior_reviewer="missed",prior_reviewer_note="PR 355 reviewed by its own advisory review (4 notes: docs/adr path, unpinned installer, PR-head script with key, cancel-in-progress); none about author_association.")
B(id="ci-verify-runs-empty-scripts-test",fix_prs=[394],
 description="PR 375 deleted scripts/claude-review.test.ts, the only test under scripts/, but check-workflows still ended with `bun test ./scripts/`, which exits 1 when no files match.",
 user_visible="bun run verify and every release gate failed on main at its first step.",**{"class":"CI"},
 intro_prs=[375],intro_commits=["534d6c98"],szz_confidence="high",omission=True,
 szz_note="Deleted-test side effect; the surviving script line is untouched by 375.",intro_pr_size=sz(7,32,1266),visible_from_diff="partial",
 replay_note="Pure deletion PR; the stale caller is in package.json, outside the diff.",difficulty=3,difficulty_reason="Needs grep for remaining users of the deleted test.",
 found_by="Failing verify on main",fixed_by="Claude Opus 5.5 (trailer)",
 prior_reviewer="caught",prior_reviewer_note="PR 375 review: 'Should fix (correctness): Deleting the only scripts/ test breaks check-workflows' (listed under Outside the diff).")

# ---------- UI/desktop
B(id="stylex-light-theme-class-never-applied",fix_prs=[232],
 description="StyleX tokens are generated dark-by-default with light values under a createTheme class; applyTheme only flipped [data-theme=light], never applied the lightTheme class, so every @kaipu/ui component rendered dark on a light desktop.",
 user_visible="Light theme: shared buttons, cards, nav rail, recording controls stay dark.",**{"class":"cross-file contract"},
 intro_prs=[212,215],intro_commits=["5c5ffd374"],szz_confidence="low",omission=True,
 szz_note="Strong blame only the old apply-theme.ts (PR 42, 5c5ffd374) which predates StyleX. Real cause is the StyleX token stage (PR 212) plus first shared component (PR 215) without the matching theme hook.",
 intro_pr_size=sz(17,745,140),visible_from_diff="partial",replay_note="Replay PR 215 (Button atom) or PR 212 (tokens).",
 difficulty=4,difficulty_reason="Needs StyleX compile output knowledge (hashed variable class).",
 found_by="Owner visual check",fixed_by="Claude Opus 5.5 (trailer)",prior_reviewer_note="PRs 212/215 merged before 2026-10-20.")
B(id="stylex-hover-null-erases-fill",fix_prs=[233],
 description="Hover layers used backgroundColor { default: null, ':hover': x }; in StyleX a later style naming a property replaces it whole, so null erased the variant's fill. Enabled Buttons, Modal buttons and SourceCard action lost their background/border/text colour.",
 user_visible="Every enabled primary/danger/ghost/outline button rendered white with only the glow.",**{"class":"UI/cosmetic"},
 intro_prs=[215,221,226],intro_commits=["f46a419d8","461d0c7b7","b22954b49"],szz_confidence="high",
 szz_note="Same pattern in three PRs: button.tsx (215), modal.tsx (221), source-card.tsx (226).",
 intro_pr_size=sz(17,745,140),visible_from_diff="partial",replay_note="Replay PR 215 first (Button).",
 difficulty=5,difficulty_reason="Needs StyleX merge semantics; reads like harmless null default.",
 found_by="Owner visual check",fixed_by="Claude Opus 5.5 (trailer)")
B(id="dock-show-on-every-policy-call",fix_prs=[255],fix_commits=["78e20a25"],
 description="forceRegularPolicy/applyDockPolicy called app.dock.show() on every call; on macOS that re-transforms the process and orders windows out and back in, so camera-on re-assertions produced a blur-hide-show cycle.",
 user_visible="Main window disappears when it loses focus (macOS) after enabling camera.",**{"class":"platform-specific"},
 intro_prs=[4,2],intro_commits=["c372abd69","780d81d1a"],szz_confidence="medium",
 szz_note="forceRegularPolicy (c372abd69, PR 4) and applyDockPolicy (780d81d1a, PR 2).",intro_pr_size=sz(44,6129,82),intro_pr_mixed=True,visible_from_diff="no",
 replay_note="Large early PRs; macOS runtime behaviour.",difficulty=5,difficulty_reason="Native AppKit side effect of an innocuous call.",
 found_by="Owner report + diagnosis log (agent-work-queue#9)",fixed_by="Claude Fable 5.1 (trailer)",fable_fixed=True)
B(id="activation-policy-cache-skips-restore",fix_prs=[366],
 description="After #255 the policy setter skipped calls matching its cache, but floating control-bar/camera windows called setVisibleOnAllWorkspaces(visibleOnFullScreen) without skipTransformProcessType so Electron ran dock.hide(); cache said 'regular', so forceRegularPolicy/applyDockPolicy became no-ops and the Dock/Cmd+Tab entry never came back.",
 user_visible="Kaipu drops out of Dock and Cmd+Tab after first recording and every camera toggle (macOS, 0.14.1).",**{"class":"state machine"},
 intro_prs=[255],intro_commits=["78e20a253"],szz_confidence="high",
 szz_note="Cache early-return (78e20a253, PR 255) is the regression; the missing skipTransformProcessType in control-bar/camera-bubble windows dates to PR 2 (81c60546a, 65473b531), masked until 255.",
 intro_pr_size=sz(5,319,13),visible_from_diff="partial",replay_note="Small, replayable. Reviewer must reason that the cache can diverge from real AppKit state.",
 difficulty=5,difficulty_reason="Cache diverging from external OS state; fix PR 255 itself looks correct in isolation.",
 found_by="User report on desktop 0.14.1",fixed_by="Claude Fable 5.1 (trailer)",fable_fixed=True,
 prior_reviewer_note="Introducing PR 255 merged 2026-10-13 (no reviewer). On the fix PR 366 the reviewer noted 'isVisible() probe may lag right after dock.show()', a related caveat.")
B(id="capture-overlay-keyboard-focus-last-painted",fix_prs=[352],
 description="Each capture opens one overlay per display and show() makes each window key, so the overlay that painted last held the keyboard even when the frame was on another display; Enter and Cmd+C were ignored.",
 user_visible="Enter/Cmd+C sometimes ignored with multiple displays; auto save/copy looked broken.",**{"class":"race/ordering"},
 intro_prs=[303],intro_commits=["7b74d86a2","c590bec88"],szz_confidence="medium",
 szz_note="capture-overlay-windows.ts show calls from 7b74d86a2 (PR 303); c590bec88 attempted a partial fix.",
 intro_pr_size=sz(69,6830,318),intro_pr_mixed=True,visible_from_diff="partial",
 replay_note="PR 303 is titled docs(design) but is a stacked 69-file code PR (GitHub shows 7 files +675).",
 difficulty=4,difficulty_reason="Depends on Electron show() key-window semantics and multi-display paint order.",
 found_by="User report (two displays)",fixed_by="Claude Opus 5.5 (trailer)")
B(id="capture-never-opens-editor-when-autosave",fix_prs=[354],
 description="decideAfterCapture opened the editor only when screenshotSave was 'manual' while the default is 'auto', so a Capture showed the toast instead of the editor.",
 user_visible="Capture shortcut shows a toast, not the editor, with default settings.",**{"class":"state machine"},
 intro_prs=[309],intro_commits=["8c8404ca4"],szz_confidence="medium",
 szz_note="after-capture-policy.ts / capture-handler.ts 8c8404ca4 (PR 309); setting default in PR 155.",
 intro_pr_size=sz(86,7540,1376),intro_pr_mixed=True,visible_from_diff="partial",replay_note="PR 309 is huge: poor replay.",
 difficulty=3,difficulty_reason="Branch on setting vs default is visible but intent unclear without spec.",
 found_by="Production audit of capture flow (v0.14.0)",fixed_by="Claude Opus 5.5 (trailer)")
B(id="toast-edit-opens-editor-stale-list",fix_prs=[354],
 description="The toast's Annotate opened the editor without the image because the route resolved the asset id against a library list read before the new shot existed.",
 user_visible="Editor opens empty after toast action.",**{"class":"race/ordering"},
 intro_prs=[309],intro_commits=["983a0a009"],szz_confidence="low",
 szz_note="Guess: toast + route resolution added in PR 309 (983a0a009); blame not isolated.",
 intro_pr_size=sz(86,7540,1376),intro_pr_mixed=True,visible_from_diff="partial",replay_note="PR 309 huge.",
 difficulty=4,difficulty_reason="Ordering between save, list read and navigation across main/renderer.",
 found_by="Production audit v0.14.0",fixed_by="Claude Opus 5.5 (trailer)")
B(id="capture-panel-new-space-over-fullscreen",fix_prs=[291],
 description="The capture panel was a plain always-on-top window; macOS cannot place it over a full-screen Space, so it created a new black Space, and because the panel is prewarmed the Space stuck until restart.",
 user_visible="Clicking the menu-bar icon over a full-screen app switches to a black Space.",**{"class":"platform-specific"},
 intro_prs=[2],intro_commits=["7ac9f84a8"],szz_confidence="medium",omission=True,
 szz_note="Window creation in capture-panel-window.ts from initial import.",intro_pr_size=sz(276,15860,1161),visible_from_diff="no",
 replay_note="Initial import; not replayable.",difficulty=5,difficulty_reason="macOS Spaces behaviour, only observable on device.",
 found_by="Owner (NIW2-380)",fixed_by="Claude Opus 5.5 (trailer)")
B(id="plan-capacities-disagree-with-spec",fix_prs=[273],
 description="deriveEntitlements granted Free 1 GB and Pro 25 GB while the accepted spec says Free 250 MB and Pro 15 GB; plan info was duplicated across server, desktop, web and copy.",
 user_visible="Quota and plan copy disagree with the product decision.",**{"class":"cross-file contract"},
 intro_prs=[92,84],intro_commits=["7ac18652c","56bd84a9f","adad8c76c"],szz_confidence="low",
 szz_note="Constants in cloud-limits.ts/subscription.ts (PR 92); entitlements.ts (PR 84). May be a product decision change rather than a defect: guess.",
 intro_pr_size=sz(61,4572,171),intro_pr_mixed=True,visible_from_diff="partial",replay_note="Needs the spec.",
 difficulty=4,difficulty_reason="Spec-vs-code number mismatch.",found_by="Maintainer (NIW2-232)",fixed_by="Claude Opus 5.5 (trailer)")
B(id="web-ui-ships-duplicate-tailwind",fix_prs=[214],fix_commits=[mc(214)],
 description="@kaipu/web-ui packaged its own full Tailwind build (side-effect CSS import + libInjectCss + tailwindcss plugin) on top of the app's, duplicating utilities (~52 KB) and letting the package's later base copy override the app's responsive variants.",
 user_visible="Landing downloads utilities twice; responsive variants can lose.",**{"class":"config/env"},
 intro_prs=[],intro_commits=["3a06e76f8"],szz_confidence="high",szz_note="Initial commit (template); not a PR.",
 intro_pr_size=None,visible_from_diff="no",replay_note="Not replayable (Initial commit).",difficulty=4,difficulty_reason="Build-pipeline interaction.",
 found_by="Perf investigation (Fable 5 trailer)",fixed_by="Claude Fable 5 (trailer)",fable_fixed=True)

# ---------- hidden
B(id="cursor-track-tail-cut-floors-duration",fix_prs=[143],fix_commits=["fb044684"],
 description="recording-hub cut the cursor track at durationSeconds*1000 where durationSeconds is Math.floor(elapsed/1000), discarding up to ~1 s of real samples/clicks at the end of each recording; now durationMs + 250.",
 user_visible="Cursor track ends up to a second early (observed 24 994 ms on a 25.9 s video).",**{"class":"data loss"},
 intro_prs=[133],intro_commits=["2468bd10"],szz_confidence="high",
 szz_note="Line `meta.durationSeconds * 1000` added in 2468bd10 (PR 133); PR 134 touched adjacent lines.",
 intro_pr_size=sz(29,1475,27),visible_from_diff="yes",replay_note="Medium PR; floor visible by tracing meta.durationSeconds.",
 difficulty=3,difficulty_reason="Unit mismatch (floored seconds) reachable by following the field's definition across files.",
 found_by="Fable 5.1 (observed track timing)",fixed_by="Claude Fable 5.1 (trailer)",fable_found=True,fable_fixed=True,
 prior_reviewer_note="Fix inside non-fix PR 143 (feat cursor-track inspector). Introducing PR 133 merged 2026-09-22.")
B(id="quit-leaves-ghost-process-prewarm",fix_prs=[422],fix_commits=["ad43588c","f46b4fbf"],
 description="app.quit() only closes existing windows; windows created after the quit began (3 s overlay/shade prewarm, overlay re-warm after a pick) or a renderer that never answers left a process with no window and no tray; no shutdown sequence existed.",
 user_visible="Ghost Kaipu process after Quit; E2E teardown hang on five release-candidate runs (NIW2-548).",**{"class":"resource leak"},
 intro_prs=[393,402],intro_commits=["aa9cfed67","110206638"],szz_confidence="medium",omission=True,
 szz_note="Weak blame: prewarm in PR 393 (aa9cfed67 overlay hidden preload) and 402 (110206638 shade preload); strong lines tiny. Fix PR 422 is titled test(e2e).",
 intro_pr_size=sz(26,1820,504),visible_from_diff="partial",replay_note="Replay PR 402 or 393 (both merged 2026-10-27).",
 difficulty=5,difficulty_reason="Lifecycle/shutdown ordering across many window classes and Electron quit semantics.",
 found_by="E2E teardown hang",fixed_by="Claude Fable 5.1 (trailer)",fable_fixed=True,
 prior_reviewer="missed",prior_reviewer_note="PR 393 review: 2 Consider findings (record-timing label control chars; constant placement), none on quit. PR 402 review: 0 findings.")
B(id="ci-edited-event-skipped-gate-passes",fix_prs=[238],fix_commits=["dc095d4a"],
 description="`edited` was a pr-checks trigger; when release-please edits the PR body at force-push time, the edited run verified nothing and reported checks skipped, which GitHub counts as passing, so the merge button read green while the real run was pending.",
 user_visible="Desktop 0.10.0 (#195) read 'All checks have passed' during verification.",**{"class":"CI"},
 intro_prs=[174],intro_commits=["a8988fea6"],szz_confidence="medium",
 szz_note="`edited` trigger and gate wiring from a8988fea6 (PR 174); PR 190 later changed the gate. Fix is inside ci-titled PR 238 (speed + this hole), after the fixes in 183/190 did not fully close it.",
 intro_pr_size=sz(7,1020,146),visible_from_diff="partial",replay_note="Same PR 174 as the ci-required-check record.",
 difficulty=5,difficulty_reason="GitHub event/skip semantics.",found_by="Maintainer observation on #195",fixed_by="Claude Opus 5.5 (trailer)")
B(id="annotation-long-word-overflows-box",fix_prs=[194],fix_commits=["b28fb22a"],
 description="textLines kept a word wider than the text box whole (documented as overflowing on its own line), so the text escaped the box that outline, hit-test and export measure from.",
 user_visible="Text label spills outside its frame in editor and export.",**{"class":"UI/cosmetic"},
 intro_prs=[51],intro_commits=["4a387b6d"],szz_confidence="high",
 szz_note="Doc comment and logic in tools.ts textLines from 4a387b6d (PR 51); PR 189 touched adjacent code.",
 intro_pr_size=sz(7,121,35),visible_from_diff="partial",replay_note="Small PR; behaviour is stated in a code comment, so a reviewer would see it as intentional.",
 difficulty=3,difficulty_reason="Design choice stated explicitly; defect only appears with later consumers.",
 found_by="Opus 5 during annotation work",fixed_by="Claude Opus 5 (trailer)")
B(id="vault-sidecar-write-not-atomic",fix_prs=[244],fix_commits=["8ca010e2"],
 description="writeMeta overwrote the sidecar in place, so a crash mid-write truncated it; truncated sidecar reads back as {} and loses title, identity and tags.",
 user_visible="Rare loss of item title/identity/tags after a crash.",**{"class":"data loss"},
 intro_prs=[90],intro_commits=["e1637cfd"],szz_confidence="low",
 szz_note="writeMeta lines from e1637cfd (PR 90) and 64b109f4 (PR 2). Same commit also fixes tags accepting unknown/path-like ids, but that code is in PR 244 itself.",
 intro_pr_size=sz(91,10300,475),visible_from_diff="partial",replay_note="PR 90 is huge: poor replay.",
 difficulty=3,difficulty_reason="Non-atomic write pattern, visible on read.",
 found_by="Opus 5.5 review of PR 244",fixed_by="Claude Opus 5.5 (trailer)")
skipped=[
 {"pr":253,"reason":"New feature, icon generation"},
 {"pr":302,"reason":"Owner-approved behaviour change"},
 {"pr":311,"reason":"Disables feature behind flag"},
 {"pr":312,"reason":"Overlay UX/tint design tweak"},
 {"pr":314,"reason":"Windows key labels, copy only"},
 {"pr":343,"reason":"Layout width tweak"},
 {"pr":363,"reason":"Latent devDependency; template-origin"},
 {"pr":330,"reason":"Fixes for dependency upgrade, same PR"},
 {"pr":"hidden","reason":"~100 fix commits fix code from same PR; not replayable (e.g. 449, 384, 399, 377, 309, 303)"},
]
json.dump({"bugs":bugs,"skipped":skipped},open('/tmp/kaipu-mine/agents/D2-mid-hidden.json','w'),indent=1)
print(len(bugs))
