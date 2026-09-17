# To-dos

Focus: ship an installable Mac beta for a small group of friends. Google and Microsoft registration setup is complete for now; next are Apple signing, production packaging, and clean-machine acceptance. Track public-launch verification separately.

Guiding principle: one agent loop, direct capability-scoped tools, and host-enforced boundaries (schemas, credentials, idempotency, audit). If a tool is available, the agent is authorized to use it. Checks are user-configured exceptions, not defaults.

Earlier backlog, partial work, and completed history are preserved in [the September 5 archive](docs/archive/todo-2026-09-05.md). That snapshot is historical, not a second active board. Hosted execution, scheduled wake, other new providers/integrations, and further design exploration are deferred unless needed for the priorities below. The public product website and Google one-click setup are explicit launch priorities.

## QA verification — September 5

- [x] QA-001: Display actual Codex dynamic tool names and recognize wrapped connector proposal validation. Verified by two failing-before/passing-after regressions, 687 passing tests, lint/typecheck/build, and the isolated app UI showing “Inspect connections” and “Correct connection proposal.” Merged and verified in the running `prototype-cp6fEL` desktop build.
- [x] QA-002: Expose connected integration management as a named link. Verified in the isolated app accessibility tree and navigation to the intended account, with 685 passing tests and lint/typecheck/build. Merged and verified in the running `prototype-cp6fEL` desktop build.
- [x] QA-005: Show “Paused” instead of a future Next run date for paused recipes. Verified in the isolated UI for both paused and enabled recipes, plus lint/typecheck/build. Merged and verified in the running `prototype-cp6fEL` desktop build.
- [x] QA-006: Distinguish stopped chat responses from successful completion. Verified with a failing-before/passing-after regression and isolated UI checks for stopped and completed chats; retry/error/approval status regressions pass. Merged and verified in the running `prototype-cp6fEL` desktop build.

## 📋 Backlog

- [ ] Replace precautionary legacy Google-data markers with provenance-backed classification
  - Deferred prototype-only cleanup: the earlier development migration marked all existing chats/recipes. The customer-upgrade backfill has been removed; the user requested leaving current test recipes alone.


- [ ] Investigate intermittent Rivet recovery test timeouts in CI
  - v0.1.2 merged-main CI initially timed out in downtime coalescing and pre-versioned state migration; both passed locally and the full CI rerun passed without code changes.

- [ ] Build and verify a dedicated production payload with an installed-size budget
  - Ship compiled frontend/backend output and explicit runtime/native assets; remove unnecessary maps, frontend dependency copies, and build tools. Leave Rivet and its dependency tree unchanged per the current scope. Measure total installed storage and validate actual scheduled execution; see [audit/options](docs/mac-bundle-size.md).


- [ ] Keep Google/Microsoft one-click configuration consistent in standalone test builds
  - Prototype packaging currently omits the release OAuth registration; separate test workspaces should isolate user state without changing connector availability.


- [ ] Resolve or document acceptance of residual dependency advisories
  - Bun audit retains elliptic (low) and esbuild (moderate/low) transitive findings; no high/critical findings remain. Cargo has unmaintained dependency warnings and a glib unsoundness warning outside the current Mac target. Track upstream fixes and verify runtime reachability before broader distribution.

- [ ] Register and validate Springroll GitHub OAuth before enabling one-click
  - Official remote MCP requires a registered client; dynamic client registration is unsupported. Registry marked non-actionable and shortcut hidden until oauthReady, including failed installed accounts. Corrected setup guidance; PAT is a separate manual alternative.

- [ ] Finish Google public-launch readiness beyond the friends beta
  - Website, domain ownership, branding, and provider registration setup are complete; see the completed setup card and [OAuth setup status](docs/oauth-setup-status.md).
  - [ ] Review actual Google-data flows, model-provider processing, in-app disclosures, retention/deletion, and support instructions.
  - [ ] Align available read/write capabilities with the scopes submitted for review; optional write scopes are outside the current read-only request.
  - Verification submission and any applicable assessment remain tracked in the separate In Progress card. Google is In production but data access remains unverified.

- [ ] Complete Microsoft publisher identity for broader distribution
  - [ ] Verify the publisher domain using the deployed website association JSON; finish applicable publisher identity prerequisites.
  - Microsoft publisher remains unverified; organizational consent restrictions must be documented from real account testing. No tenant-wide consent has been granted.

- [ ] 3. Harden the packaged app lifecycle
  - [x] Apply the selected sage Dock icon background and preserve a reproducible SVG-to-ICNS generation path.
  - [ ] Decide whether a separate menu-bar control is needed for background scheduling (none implemented today).
  - [ ] Define launch, window-close versus quit, and background scheduling behavior clearly.
  - [ ] Verify restart, forced termination, sleep/wake recovery, and single-instance/sidecar cleanup without duplicate execution.
  - [ ] Add optional idle-sleep prevention during active recipe runs; do not imply this wakes a sleeping Mac.
  - [ ] Evaluate an opt-in plugged-in availability mode and true scheduled wake as separate settings; prototype owned wake events, privileged setup, cleanup, and locked-session/lid/power constraints before promising overnight execution. See [Mac sleep options](docs/mac-sleep-options.md).
  - [ ] Show when local scheduling is unavailable and how missed runs will be handled.

- [ ] 4. Validate first-run setup end to end
  - [ ] Test fresh install → API key → model selection → recipe creation → scheduled result from a clean Mac account.
  - [ ] Test packaged Google Gmail/Calendar/Drive and Microsoft Outlook/OneDrive sign-in without a developer environment, including callback return, Keychain, refresh after restart, disconnect/reconnect, and a harmless scheduled recipe. Microsoft registration is configured; real connector sign-in is not yet verified.
  - [ ] Explain before connection which content can reach the selected model provider; document consent warnings and account restrictions for testers.
  - [ ] Fix release-blocking setup issues, including valid keys without default-model access and stale model labels after Settings changes.
  - [ ] Verify actionable failures, approval/cancellation flows, and accurate usage/limit disclosures, including search/page-reading costs and runtime-specific limitations.
  - [ ] Resolve blockers in shipped runtimes or clearly mark unsupported paths; defer provider expansion and cosmetic redesign.


## 🚧 In Progress

- [ ] Publish v0.1.5 Google data routing beta
  - [ ] Commit, pass checks, merge PR, sign/notarize artifacts, publish release and update website.

- [ ] Upload verification recordings and resubmit Google OAuth review
  - [x] User uploaded both videos as unlisted; verified URLs and prepared reply plus evidence ZIP in Downloads/Springroll-Google-Verification.
  - [ ] Send prepared reply with evidence ZIP in existing Google thread; browser actions unavailable. Cloud Console demo links not updated.
















































- [ ] Preserve conversation context after large tool-result turns
  - Fixed context selection to omit oversized completed tool details before dropping request/answer text; pending approvals and full durable history are preserved. Subscription transcript now includes dynamic-tool results when they fit.
  - Regression failed before/passed after; replay of the real saved Neon chat retains request and table summary (2,137 characters on the cadence follow-up). Full suite: 699 pass; updated focused suite including approval retention: 55 pass; typecheck/lint/diff checks pass.
  - Build 2 at `desktop/dist/release-5Xc4co/Springroll.app` is signed and notarized. Apple submission `c6425300-c7ae-4463-9f5a-279c060e5414` Accepted; stapling, ticket validation, and Gatekeeper assessment passed. Final ZIP is alongside the app. Installation remains pending; later startup-logo, starter-recipe, theme, and one-click changes are not in this artifact.

- [ ] 5. Prepare a distributable desktop alpha and source release
  - [x] Confirm installed Developer ID Application certificate for Doug Dement (Y49DF9C9JJ); inspected Shep release workflow. Release packaging/signing work started; use com.springroll.desktop with separate prototype data.
  - [x] Produce optimized Springroll.app with com.springroll.desktop identity, separate fresh data/Keychain, and allowlisted packaged Google/Microsoft OAuth values; development identity is preserved.
  - [x] Sign and notarize the Apple silicon candidate. Apple submission `c5d5fcee-04fa-40ef-9fdc-a8fe308a038c` Accepted; stapling, ticket validation, and Gatekeeper assessment passed. Artifact: `desktop/dist/release-yWUrs8/Springroll-0.1.0-arm64.zip`.
  - [ ] Verify downloaded ZIP installation on another Mac/account and persistence across replacement with a later release build.
  - Verified this session: Developer ID signatures, 1,781 contained dependency symlinks, no bundled .env, three allowlisted OAuth values, signed Keychain module loading, launch/relaunch/termination and OAuth return-page smoke without developer environment. Native first-run Settings screen opens under Springroll identity. Nine focused OAuth tests, two Rust tests, application and desktop-script typechecks, changed TypeScript lint, and diff checks pass. Different-Mac sign-in and scheduled-recipe acceptance remain open.
  - [ ] Approve and provide a private friends-beta download after acceptance. Draft install instructions, known limitations, and feedback guidance are in [friends beta](docs/friends-beta.md); public source release and automatic updates need not block this beta.
  - [ ] Refresh README, screenshots, prerequisites, local-data/security guidance, costs, scheduling limitations, and known issues.
  - Existing foundation: MIT license, contributor/security documents, GitHub templates, Dependabot configuration, and CodeQL workflow are already in place.
  - [ ] Re-scan current Git history and release artifacts for secrets/private data; run tests, typecheck, and production build in required CI.
  - [ ] Verify release-branch integration and applicable GitHub security checks.
  - [x] Owner approved publication after testing; repository and v0.1.0 prerelease are public.
  - [ ] Decide the update/distribution path after the initial package is proven; automatic updates are not a prototype prerequisite.

- [ ] Prepare and submit Google production verification
  - [x] Verify website ownership and publish approved branding; save four read-only/identity scopes, scope justifications, and private demo evidence (kept outside Git).
  - [x] Original read-only request submitted; Google replied September 7 requesting a fuller demo and AI-provider/data-use disclosures.
  - [x] Update pending request with optional Gmail sending/drafts and Calendar event management; retain read-only Drive and email identity.
  - [x] Separate Gmail drafts using gmail.compose and remove Gmail inbox modification tools/permission upgrades.
  - [x] Remove full Drive write access and gate submitted Gmail/Calendar write upgrades to explicit local staging.
  - [x] Submit the owner's replacement demo: owner uploaded the 15m21s video as Unlisted; replaced the old YouTube link and confirmed the pending-request update. Google Console displayed Data access changes saved. Scope coverage remains subject to review; private video URL kept outside Git.
  - [x] Audit supported provider code and published terms; document routing/training gaps and prepare disclosure draft.
  - [ ] Confirm actual provider plans and no-training settings; owner was asked which demo accounts/tiers to use. Do not infer these from API keys.
  - September 16: owner authorized implementing enforced OpenRouter ZDR after Google’s September 15 conditional acceptance; this supersedes the earlier decision to defer routing restrictions.
  - [x] Prepare a scope-by-scope demo outline for owner review; owner subsequently recorded and submitted a replacement. See [demo outline](docs/google-verification-demo-outline.md).
  - [ ] Complete ZDR account/tier and endpoint evidence, explicitly resolve user-account BYOK exceptions, and run the synthetic-data acceptance/demo checklist in [ZDR implementation](docs/google-zdr-implementation.md).
  - [ ] Publish substantiated disclosures/Limited Use statement, resolve applicable assessment obligations, and reply to Google's review email with verified evidence.
  - Last confirmed status: data access unverified; expanded scope configuration saved to the pending request. Replacement demo saved to the pending request. No compliance attestation, reviewer email, or production deployment completed in this update.
  - Evidence and details: [Google verification submission](docs/google-verification-submission.md).

- [ ] Fix and interactively verify the bottom chat model selector
  - Reopened after the user confirmed the overflow change did not resolve it. Previous five focused tests and build only covered code/style assertions, not actual popup interaction.
  - Prior attempted fix retained in `prototype-3LY3Ul`; reproduce against the running build before another change. This session has no enabled browser surface and native app control is disabled.

- [ ] Fix desktop integration sign-in completion, duplicate pending accounts, and removal confirmation
  - [x] Preserve the registered OAuth callback URL when the browser returns through a loopback hostname alias (`localhost` vs `127.0.0.1`); keep port/path and state/PKCE checks intact. The reported registration-change failure occurred before token exchange; Chrome's DevTools CSP warning is unrelated.
  - 67 focused tests and explicit registered-URI token-exchange regression pass, along with typecheck/lint/build. Latest bundle: `desktop/dist/prototype-eCrSwZ/Springroll Prototype.app`; real Neon retry remains outstanding.
  - Baseline app work committed as `8da7a83`; unrelated design mockups excluded.
  - [x] Replace integration Remove/Sign out browser confirmations with an app-owned modal; retain explicit confirmation and server-side recipe-use protections.
  - [x] Reuse unfinished OAuth accounts on provider-level retries and coalesce concurrent starts; expose pending sign-in status and refresh integrations on return from the browser.
  - 76 focused tests, typecheck, changed TypeScript lint, and Mac build pass. Pending-account removal, duplicate/concurrent starts, callback validation, and adding a second completed account covered.
  - [ ] Verify actual Neon approval/callback and native confirmation in the rebuilt app. Both saved Neon entries had OAuth starts but no completion audit; the original missing callback is not yet explained. No user connections removed. Follow-up implementation is uncommitted.
  - Updated bundle: `desktop/dist/prototype-Tjn7Ka/Springroll Prototype.app`.
  - [x] Give packaged OAuth a browser completion page and signal the existing native window to navigate back and regain focus. Keep browser-only deployment redirects unchanged; preserve callback errors by returning directly to `/integrations` instead of the obsolete `/connections` alias.
  - User was still running `prototype-txcR85`, which predates the confirmation fix. Latest build: `desktop/dist/prototype-DuICPb/Springroll Prototype.app`; quit the old build fully before opening it. 66 application tests, focused success/error desktop callback regression, two Rust navigation tests, typecheck, and build pass. Real Neon approval remains to be retested in the current build.

- [ ] 2. Build an unsigned Mac app prototype
  - Started on `feat/macos-app-prototype` after PRs #10 and #11 merged into main with passing macOS CI. Real-device scheduling acceptance below remains open, as agreed before moving on.
  - [x] Build a Tauri shell with bundled Bun, production runtime dependencies, assets/migrations, and an explicitly owned Rivet scheduler.
    - `bun run build:mac` creates an unsigned, current-architecture development `.app`; uses the existing logo and a separate prototype workspace/Keychain service. Initial size is about 1.2 GB; not distribution-ready.
  - [x] Separate writable application data and bundled resources from source-checkout paths.
    - Added shared `SPRINGROLL_DATA_DIR` / `SPRINGROLL_RESOURCES_DIR` resolution for launcher/server, migrations, assets, and catalog storage. Existing explicit database/catalog overrides remain supported; catalog defaults alongside the selected database.
    - Shared launcher/server paths, package builds, 675 application tests, Rust navigation test, typecheck, and changed-file lint pass. Work is uncommitted on the prototype branch.
  - [ ] Launch successfully on a clean Mac account without a terminal or development tools.
    - Packaged startup, assets, empty API, quit, and relaunch smoke passed using a temporary workspace, `/tmp` working directory, and `/usr/bin:/bin` PATH on this account. Verified bundled dependency symlinks stay inside the package. A different clean account and native visual review remain outstanding.
  - [ ] Verify application-support storage, Keychain access, and loopback OAuth callbacks.
  - [x] Record packaging constraints and acceptance checks in [desktop/README.md](desktop/README.md).
    - Native signing/notarization, size optimization, real Keychain/OAuth setup, sleep/wake, startup cancellation, forced-termination/orphan recovery, and unexpected-child-exit handling remain open. Do not present this as a public release.

- [ ] 1. Make missed-run behavior predictable and verify Mac sleep/wake recovery
  - [x] Match the existing two policies to their labels: skip missed work or catch up once; neither replays the backlog. Allow 60 seconds for ordinary delivery jitter and retain the existing default.
  - [x] Correct admission/cursor handling and add regression coverage, including persisted recovery receipts in recipe details.
  - [x] Verify 671 tests, typecheck, production build, and changed-file lint; real-engine tests cover multi-day recovery and a second restart without duplicate catch-up.
  - [ ] Test overnight/weekend sleep, multiple missed occurrences, quit/relaunch, unavailable networking, paused recipes, approval-waiting runs, and timezone/DST changes.
    - Automated coverage includes multi-day downtime, disabled recipes, all active-run states, DST, database reopen, and engine/registry restart. Real Mac sleep/wake and network-restoration acceptance still need a deliberate test session; no power settings or system clock were changed.
  - [ ] Verify explicit late/skipped reporting, no unintended duplicate side effects, and the correct next scheduled run.
    - Latest recovery receipt and future cursor verified in SQLite/API tests; visual and real-device acceptance remain. No claim of exactly-once external side effects.
  - Policy and acceptance handoff: [docs/missed-run-policy.md](docs/missed-run-policy.md). Keep this card open until device acceptance; do not silently treat simulated downtime as Mac sleep verification.

## ✅ Done

- [x] Remove the manual direct-provider confirmation gate
  - Direct API routes no longer require an attestation checkbox; Gemini billing/no-training requirements remain guidance and are not automatically verified. OpenRouter ZDR stays enforced. Removed unused UI/API handlers; legacy schema column retained for existing DB compatibility. 125 focused tests/typecheck passed; prototype rebuilt; privacy/evidence text corrected.

- [x] Fix truncated Gmail discovery and show model compatibility notices
  - Gmail search_threads now matches message/messages/list/latest-email queries; broad search ranks read/discovery tools ahead of writes and reports truncation. Search/describe return advisory Google-model availability without marking unrelated work protected. Work-log summaries show the host notice. 126 focused tests and typecheck passed; prototype rebuilt.

- [x] Enable Google-data access for confirmed no-training direct API accounts
  - Shared runtime/catalog eligibility allows confirmed OpenAI, Anthropic, xAI, Groq, and billing-enabled Gemini API accounts. Added per-account UI/API confirmation, persisted timestamp, and reset on key replacement/disconnection. 773 tests and typecheck passed; prototype reopened; privacy page updated. Owner must truthfully confirm their account before direct Google-data access; no billing status was assumed.

- [x] Clarify user-owned OpenRouter keys in the verification packet
  - Removed developer-account settings as an application-wide evidence requirement; retained the distinction between enforced request controls, demo-route evidence, and unresolved account exceptions.

- [x] Prepare Google privacy disclosures and verifiable OpenRouter routing evidence
  - Published privacy/Limited Use disclosures; prepared dated 874-endpoint inventory, enforced-payload fixture, 19 passing checks and reviewer reply draft. Account settings and live downstream-route evidence remain pending owner confirmation/recording.

- [x] Keep other providers visible when the ZDR filter is on
  - Only OpenRouter entries are filtered by ZDR availability. Google-access enforcement remains separate and OpenRouter-only. Typecheck passed; prototype rebuilt and reopened.

- [x] Polish ZDR toggle contrast and alignment
  - Solid light thumb, opaque neutral off track, theme-accent on track, and equal 3px inset in both states. CSS checked and prototype rebuilt.

- [x] Simplify the model filter to a Zero Data Retention toggle
  - Replaced the availability dropdown with a labeled on/off switch. On shows known ZDR-capable models; off shows all. Filtering does not alter routing enforcement. Typecheck and prototype rebuild passed.

- [x] Expose OpenRouter ZDR model filters and improve model search matching
  - Shared model selector exposes the custom ZDR filter outside protected contexts and labels OpenRouter availability. Search matches words across names, IDs, and providers regardless of order or punctuation. Four tests, typecheck, and prototype rebuild passed.

- [x] Repair and verify the running recipes’ persisted Google protection state
  - Backed up and cleared reviewed false markers for GitHub Trending, API Usage, College Football, and their related chats. Other protected records preserved. Live GitHub retry 04c2b942 passed the Google gate but Qwen returned upstream HTTP 429 after three attempts; report completion remains unverified.

- [x] Remove blanket Google protection from customer upgrades
  - Unreleased migration 0035 now creates empty protection tables; existing customer recipes, models, and schedules are unchanged. Upgrade and scoped-routing regressions: 19 passed; typecheck passed. Existing prototype recipes left alone as requested.

- [x] Repair the AssessorSearch recipe’s false legacy Google-data marker
  - Reviewed its Neon tool history and creation context, backed up and removed its migration-only marker. Actual Google access now refreshes marker timestamps; 18 focused tests and typecheck passed. Broader historical classification remains in Backlog.

- [x] Explain Google model-routing failures in clear user-facing language
  - Routing errors explicitly name OpenRouter, explain Google data-use policies and tell users to choose a model marked “ZDR available.” Removed backend retry/failed-tool-trace jargon from the chat notice.
  - Seven routing tests, typecheck and lint pass; rebuilt/reopened prototype.


- [x] Stop protected recipe discovery from forcing unrelated chats into ZDR
  - Traced the reported day-in-history failure to list_tasks returning precautionarily protected legacy recipes. Unprotected inventories now omit protected record contents; explicit detail access still activates protection.
  - Backed up and sanitized the affected chat's incidental recipe-list output, then removed its erroneous marker after verifying it made only discovery calls. User prompt/history otherwise preserved; no model request or scheduled recipe executed.
  - 85 focused tests pass, including the exact four-tool discovery sequence followed by explicit protected access; typecheck/lint and desktop build pass. Reopened prototype.


- [x] Scope OpenRouter ZDR to Google-data requests instead of all chats and recipes
  - Checkpoint committed first as e23c1cf. Per-request callbacks now evaluate each chat/recipe's own protection scope; Google access activates enforcement before the next inference, while unrelated work stays unrestricted.
  - Local reads protect only referenced records and protected inventory results; connection discovery no longer triggers protection solely because Google exists elsewhere.
  - 765 tests and four snapshots pass; lint/typecheck and prototype build pass. Reopened prototype. Existing legacy markers retained; provenance cleanup tracked separately.


- [x] Remove unsupported version floors from installed subscription runtime discovery
  - Corrected the prior minimum-version assumption: pinned package versions describe managed downloads, not a tested compatibility floor. Installed Claude/Codex tools now use command capability checks only.
  - Claude checks the isolation/session/permission flags actually used by the adapter; Codex checks its app-server stdio entry point. This does not claim all historical protocol versions are compatible.
  - 19 runtime/adapter tests pass, including older/newer version fixtures and missing-command rejection; local Codex/Claude detection passes without downloads. Typecheck/lint and rebuilt prototype pass.


- [x] Reuse newer installed Claude and Codex runtimes without unnecessary downloads
  - Replaced exact major/minor matching with a minimum version check plus installed CLI command capability checks; newer minor/major releases no longer require a pinned copy solely due to version number.
  - Reuse installed binaries without downloading; preserve verified managed fallback for missing/unsupported installations. Setup explains detected old/incompatible installations.
  - 17 runtime/adapter tests pass, typecheck/lint pass; real local detection reports Codex 0.154.0 and Claude 2.1.273 ready with downloads disabled. Rebuilt/reopened prototype.


- [x] Replace native model filter dropdowns with Springroll pickers
  - Reused SettingsPicker for provider and Google-data availability filters, with compact in-app menus, selected checks, keyboard support, and matching theme styling.
  - Typecheck/build pass; browser interaction verified menu opening, provider selection and filtering without closing the outer picker. Rebuilt/reopened local prototype.


- [x] Limit Google-data model feedback to affected recipes and chats
  - Removed Google/ZDR filters, labels, and tooltips from general model pickers, including Models & Limits. Protected recipe/chat pickers retain feedback; runtime Google access enforcement remains unchanged.
  - 16 focused tests, typecheck and lint pass; rebuilt/reopened the local prototype.


- [x] Remove Google write-scope staging gate from normal setup
  - Removed launch-time tool/scope filtering, staging option/environment wiring, and desktop verification markers; normal Gmail setup exposes send/drafts and Calendar event permissions.
  - Existing grants and tool approvals remain enforced. Live rebuilt prototype shows send/drafts as available permission upgrades, currently ungranted for its Gmail connection; reconnect is needed.
  - 77 OAuth/application/registry tests pass; typecheck/lint and desktop build pass. Rebuilt and reopened local Springroll Prototype; installed release unchanged.


- [x] Remove blanket external-tool restrictions from Google-data workflows
  - Removed mixed-integration recipe rejection, non-Google connector rejection, and registry bans on web/research tools; normal permissions/approvals remain.
  - Kept OAuth scope checks and AI-route controls. Image API lacks documented request-level ZDR; its protected-data error now identifies that limitation.
  - Regression coverage verifies external connector and web/research execution preserve the Google-data marker. 83 tests pass; typecheck, changed-file lint and build pass.


- [x] Show Google-data model compatibility in recipe/chat pickers and explain unavailable OpenRouter ZDR routes
  - Added live OpenRouter ZDR inventory metadata, availability dropdown, disabled incompatible selections, inherited-default warning, and actionable protected-route errors.
  - Full check: 761 tests pass, typecheck/lint pass (existing CSS warnings); production build and isolated browser interaction checks passed.
  - Direct-provider Google-data eligibility remains pending account controls; UI accurately reflects the current OpenRouter-only runtime restriction.


- [x] Replace OpenRouter endpoint whitelist with enforced ZDR routing and verify direct-provider policies
  - Removed fixed models/hosts and inventory preflight; OpenRouter selects ZDR-eligible endpoints and fallbacks. Final request enforces `provider.zdr: true`; UI shows only “OpenRouter · Zero Data Retention enforced.”
  - Direct APIs are not universally ZDR by default; documented no-training terms separately in [provider review](docs/google-provider-data-policy.md). Direct Google-data eligibility remains pending account evidence; no blanket ZDR claim.
  - Typecheck, changed-file lint, build, diff check and 18 routing/provider/isolation tests passed.

- [x] Condense Google ZDR disclosure into a compact connection detail
  - Replaced the explanatory block with an AI data protection item matching Where it runs: “OpenRouter · ZDR providers only” and one line of available hosting providers. Enforcement unchanged; typecheck/build/changed-file lint and visual browser verification passed.

- [x] Enforce OpenRouter ZDR for Google data and show eligible providers on Google connection screens
  - Branch: `feat/google-openrouter-zdr`. Added fixed model/hosting routes, live ZDR availability, final-request enforcement, persistent chat/recipe protection, secondary-title isolation, external-tool/MCP restrictions, and content-free attempted-route audit records.
  - Google screens show ZDR requirements, model/hosting-provider availability and connection guidance above technical configuration. Visually verified in an isolated browser preview; installed desktop app unchanged.
  - Validation: full check passed (758 tests), latest focused regressions passed (74 tests), typecheck/build/lint/diff checks passed. Real Google/API account runs were not performed.
  - Migration conservatively protects all older chats/recipes because they lack provenance. Shared local inventories also require protection; review these compatibility restrictions before release.
  - Remaining account evidence, BYOK exception handling, synthetic-data acceptance, privacy publication and demo submission stay in the Google verification card. See [implementation and evidence checklist](docs/google-zdr-implementation.md).


- [x] Publish v0.1.4 with connector availability and chat approval fixes
  - PR #20 merged as dc7999f; PR and main CI/CodeQL passed, with 747 local tests and four native tests passing.
  - Published build 9 DMG, ZIP, and SHA256SUMS.txt after Apple notarization, Gatekeeper, mounted installer, bundle/privacy, and isolated startup/restart checks. Uploaded sizes and hashes match. Website download updated through website PR #4.

- [x] Default email sending to Check first while preserving saved tool preferences
  - New Gmail send_message and Outlook send_mail tools default to Check first. Drafts and other tools retain the common Allow default; saved preferences take precedence. Verified 70 application tests, typecheck, and rebuilt the development app.

- [x] Keep Google verification tools available across development updates and simplify tool approvals
  - Normal development updates preserve verification mode; explicit --google-readonly opts out. Verified the rebuilt app retains the existing Gmail read/draft/send grants and all seven tools without reauthentication.
  - Chat approvals use a compact Approve/Deny control with expandable call details. Model instructions request context before checked calls without a separate verbal confirmation. New OAuth tools use the common Allow default; existing preferences are preserved.
  - 181 focused tests pass, plus typecheck, formatting, two desktop builds, and native UI checks. No email sent.

- [x] Fix empty Gmail approval requests and stale write-tool discovery after reopening the verification app
  - Validate required inputs before approval, show email recipient/subject/body, and disable approval for incomplete legacy email cards. Native tool discovery uses current availability; verification mode persists within the development bundle.
  - Verified 107 focused tests, typecheck, formatting, and the rebuilt desktop app. The existing empty draft card now identifies missing fields and disables Approve while retaining Deny; no email was sent.

- [x] Fix subscription chat approval cards and request supported Google permissions at initial connection
  - Subscription chats create durable exact-call approval cards; approval executes once, denial does not execute, and decisions survive assistant recreation. Removed unconditional Gmail/Calendar confirmation wording; user tool policies remain in effect.
  - Waiting approval now shows Waiting for approval instead of Running/background activity. Live Gemini and Codex draft tests displayed the exact card and were denied; no test draft or email was created.
  - Verification sign-in requests all supported Gmail and Calendar permissions together, including each new account. Older grants stay accurate until reconnection; Drive remains read-only. Production staging boundary remains in place.
  - Full suite: 744 passed; typecheck and desktop build passed. Rebuilt/opened verification prototype. Saved Console justifications/video describe the previous optional-upgrade flow; align them on the next review update.

- [x] Fix the local Google verification launch and confirm optional Gmail write controls
  - Added `bun run dev:mac:google-verification`; pass the staging flag and configured OAuth registration through LaunchServices. Normal `dev:mac` explicitly disables staging.
  - Rebuilt and opened the app; verified Google connectors and Gmail Save drafts / Send mail Add controls in the native UI. Existing account still has read access only; leave consent upgrades for the user's recording.

- [x] Finish Google launch scope cleanup and audit AI data handling
  - Removed broad Drive writes. Default startup exposes only Google read tools; Gmail/Calendar write tools and permission upgrades require explicit local staging.
  - Added production/staging regression tests, including HTTP rejection of send upgrades outside staging; 740 tests, typecheck, and frontend build pass. Lint has only pre-existing warnings.
  - Completed code/published-policy inventory of eight model connections, actual controls, retention defaults, gateway routing gaps, and derived-data risks in [AI-data audit](docs/google-ai-data-audit.md).
  - Added factual in-app disclosure and prepared [privacy/statement draft](docs/google-data-disclosure-draft.md). Account tiers/settings and compliance enforcement remain unresolved on the verification card.
  - No provider settings, external privacy pages, or production release changed. Demo recording remains explicitly deferred until owner review.

- [x] Narrow Gmail draft access to compose and remove inbox modification
  - Save drafts requests gmail.compose while retaining readonly; sending remains separately gated. Gmail trash operation and organize permission were removed.
  - Regression coverage verifies draft/send isolation and rejects legacy organize upgrades. Existing broad Google grants are not revoked by this change.
  - Build/typecheck and changed-file lint pass. Full suite found one stale organize-label expectation (735 passed); corrected it and reran all 69 local-app tests successfully. No deployment.

- [x] Restore shared Google OAuth and update launch verification scopes
  - [x] Preserve personal setup on `feat/google-personal-oauth-setup` at `d1d6798`; restore original shared-auth source on `feat/google-shared-oauth-launch` from `5970090`.
  - [x] Save Gmail send/compose and Calendar events alongside existing read/identity scopes in the shared Google project; Console confirmed the pending verification request was updated.
  - [x] Restored frontend build and typecheck pass; 19 OAuth/catalog tests pass (236 assertions). Scope alignment and new demo remain on the verification card.

- [x] Publish v0.1.3 with verified integrations and clearer chat setup
  - PR #19 merged as `809aa82`; PR and merged-main CI/CodeQL passed, with 734 tests and four native tests passing locally.
  - Build 8 in `desktop/dist/release-kM2wYO` passed app/DMG notarization, stapling, Gatekeeper, runtime startup/restart, installer inspection, and uploaded checksum verification.
  - Published the signed Apple silicon DMG, ZIP, and SHA256SUMS.txt as the v0.1.3 friends-beta release; website download updated through website PR #3.

- [x] Put connection cards after commentary, replace the composer during repair, and stop automatic follow-up after setup succeeds
  - [x] Verified 12 workflow tests, WebKit card ordering and Stop/composer recovery, lint, typecheck, and build

- [x] Show background connection repair clearly and support explicit Bearer authentication
  - Added a visible activity block above the composer, stopped marking previous answers as Writing, and verified Stop restores input. Added explicit bearer/raw credential formats; proposals require an Authorization scheme, transports honor it, and agent diagnostics show the effective scheme. Verified browser interaction, 733 tests, lint (existing warnings), typecheck, and build. Live Umami key validity has not been verified; its existing raw-header proposal needs replacement with the corrected scheme after rebuild.

- [x] Require integration connection tests and report verified results to the user and agent
  - API proposals require a read-only test; setup runs it before saving credentials or completing. Cards use Test connection, show recorded results, and keep failures retryable. Sanitized test evidence reaches the agent on success/failure. Existing unverified APIs show Not tested; saved keys can be retested without reentry. MCP testing is explicitly labeled server/tool discovery. Verified the card flow in WebKit, 726 tests, lint (existing warnings), typecheck, and build.

- [x] Tailor empty integration and recipe chats with centered guidance and blank composers
  - Each creation intent has its own centered explainer; canned drafts and empty-state metadata/Delete are removed, while specific prompts are preserved. Verified actual React screens in WebKit at desktop/mobile sizes; 20 focused tests, lint (existing warnings), typecheck, and build passed.

- [x] Give chat titles a compact heading and metadata layout
  - Replaced display-scale chat titles with a 20px heading and moved the date into the compact context/status row. Verified short and long titles at desktop and mobile widths in WebKit; lint (existing warnings), typecheck, and build passed.

- [x] Fix chat bar collapsing when clicking the model picker or recipe context controls
  - Reproduced both failures in WebKit: button clicks blur without a related focus target, collapsing the bar before click. Track pointer interaction separately from keyboard focus exits. Verified repeated model selection and context removal/restoration, draft preservation, outside clicks, Escape, Tab, and keyboard selection in WebKit and Chromium; 22 focused tests, lint (existing warnings), typecheck, and build passed.

- [x] Remove the hard-coded chat step limit and verify responses beyond 20 steps
  - Chats default to unlimited steps across API and subscription runtimes; zero is accepted as unlimited. Time and context safeguards remain. Verified 25-tool-call completion, 126 focused tests, lint (existing warnings), and typecheck.

- [x] Investigate chat 20-step stops after resetting app limits
  - Confirmed chats use a hard-coded 20-step cap independently of recipe settings; resetting settings cannot remove it. Runtime behavior unchanged.

- [x] Publish v0.1.2 with smaller bundles and Settings reset
  - PR #18 merged as 54f2636. Build 7 signed/notarized; DMG, ZIP, and checksums published on GitHub. Installed app about 451 MB; DMG 145 MB. CI and CodeQL passed; isolated runtime/reset and installer checks passed.

- [x] Add an environment-scoped Reset Springroll action
  - Settings → Data & reset follows the side-tab layout. Requires typed RESET, stops owned processes, clears local data/credentials/subscription support and browser state, then restarts. Test workspaces have isolated Keychain services and browser storage.
  - Verified cancellation, exact confirmation, fresh restart, scoped database/artifact/Keychain deletion, and preservation of unrelated files and credentials using disposable fixtures. All 719 app tests and four native tests passed; released in v0.1.2.

- [x] Trim remaining duplicate browser packages and unused icon catalog bundles
  - Signed candidate now 450.8 MB installed, down 37.2 MB from the prior cleanup and 224.4 MB / 33.2% from v0.1.1. Preserve Rivet's full dependency tree, compiled browser chunks, icon JSON/SVGs, and notices. Candidate `desktop/dist/release-l5HAmt/Springroll.app` is signed but not notarized/published.
  - 10 focused tests, typechecks/lint, native and signed-runtime smoke, packaged logo lookup, actual app navigation/reload, Mermaid mind-map rendering, and 1,728 contained links pass. [Size evidence](docs/mac-bundle-size.md).

- [x] Remove packaged source maps, stale browser chunks, and duplicate Mermaid dependency files
  - Signed production-mode candidate is 488.1 MB versus 675.2 MB installed (187.2 MB / 27.7% saved). Licenses and compiled diagram assets retained; Rivet unchanged. Candidate `desktop/dist/release-8Cu1RR/Springroll.app` is signed but not notarized/published; prototype `desktop/dist/prototype-9wAqgk/Springroll Prototype.app` passed native smoke.
  - 12 report/bundle/real-engine recovery tests, desktop types/lint, native and signed-runtime startup/restart, six one-click entries, subscription endpoints, packaged Mermaid rendering, and contained-link checks pass. Documented [Rivet usage](docs/rivet-usage.md) and [size evidence](docs/mac-bundle-size.md).

- [x] Explain app-state persistence and starter recipe/theme defaults
  - Read-only inspection confirmed running `/Applications/Springroll.app` build 4 includes both defaults. Release SQLite survives app replacement, contains no starter recipe, and currently saves `springroll-dark-glass` (Springroll Glass). Starter initialization skips existing databases; saved appearance takes priority over defaults. No user data or settings changed; reported visual theme discrepancy is not established as a persistence bug.

- [x] Audit remaining Mac bundle dependencies for size savings
  - Confirmed 675.2 MB installed: 144.9 MB maps, 121.8 MB Rivet native binaries, 61.9 MB Bun, 27.9 MB shell/built UI, and 318.8 MB remaining files. Identified duplicate frontend packages, four esbuild binaries, and Rivet agent-OS dependencies as cleanup candidates. Backend compile-only sizing probe produced 2.1 MB excluding native/runtime SDK dependencies; not yet a deployable replacement.
  - Documented packaging-first options, a provisional 250–350 MB installed target, and architectural tradeoffs in [bundle sizing](docs/mac-bundle-size.md). No released artifacts changed.

- [x] Publish the slimmed-down v0.1.1 Mac beta
  - [v0.1.1](https://github.com/stumptowndoug/springroll/releases/tag/v0.1.1) is public as a friends-beta prerelease at `bd25266` (PR #17). Signed/notarized app and DMG, ZIP, and SHA256SUMS are uploaded; remote digests and anonymous download access verified.
  - DMG 200.4 MB (53% smaller); ZIP 236.2 MB (49% smaller). 717 tests, CI/CodeQL, packaged runtime startup/restart, Google/Microsoft one-click configuration, mounted-app ticket/signature, and Gatekeeper checks pass. Details: [launch readiness](docs/launch-readiness.md) and [size breakdown](docs/mac-bundle-size.md).

- [x] Download optional Codex and Claude runtimes on first connection
  - Reuse compatible installed CLIs; otherwise show explicit download, progress, cancel, and retry before sign-in. Verify pinned official archives and vendor signatures, preserve license files, and cache atomically outside the app with separate authentication directories. Removed native payloads and duplicate Rivet executable from desktop packaging.
  - Real Codex/Claude downloads verified on Apple Silicon. Full suite 715 pass; 72 focused tests pass after adding startup-retry and HTTP origin/provider checks. Typechecks and native launch/relaunch/termination pass; Settings visually confirms installed CLI reuse. Development ZIP is 243.7 MB versus 461.2 MB (about 47% smaller). See [bundle sizing](docs/mac-bundle-size.md).
  - Shipped in v0.1.1. The earlier prototype was `desktop/dist/prototype-qJoY3G/Springroll Prototype.app`; different-Mac subscription sign-in/scheduled runs remain acceptance work.

- [x] Add a standard drag-to-Applications DMG
  - Wrap the existing notarized v0.1.0 app in a signed/notarized disk image with an Applications shortcut, verify the Finder layout, and add it to the release.



  - DMG published on v0.1.0 with separate checksum. Finder layout, mounted-app signature/ticket, outer DMG notarization/stapling/Gatekeeper and GitHub asset digest verified.

- [x] Prepare the first GitHub beta release and public source checkpoint
  - [x] Commit checkpoint (`97ae3f2`), fix pinned public-web transport (`a95463e`), and merge PR #12 into main (`279b591`). 708 tests and both PR/main CI pass; updated history scan has no matches.
  - [x] Candidate 3 in `desktop/dist/release-tsD6yJ/` is signed and notarized (`a8a6dea0-66ae-48a3-8cb6-a524f3e7cadc` Accepted); stapling and Gatekeeper pass. Final ZIP and SHA256SUMS uploaded to private v0.1.0 draft; GitHub asset digest matches the local ZIP. Owner reported successful testing and approved public release; detailed coverage continues during beta.
  - [x] Review checkpoint changes, refresh README, keep private OAuth evidence outside Git, and document [GitHub release steps](docs/releasing.md). CI now checks the frontend build; generated Tauri files and design mocks are excluded from app linting.
  - [x] Owner approved publication after testing. Repository is public and [v0.1.0](https://github.com/stumptowndoug/springroll/releases/tag/v0.1.0) is published as a prerelease, tagged at tested revision `279b591`, with ZIP and verified checksum.
  - Validation: frontend build, typecheck, two Rust tests, lint (existing warnings only), and secret-pattern scan across current files/3,041 history blobs. Full suite had 701 passes and one stale SharePoint expectation; corrected that expectation and reran the affected application suite successfully. Pattern scanning is not a full security audit.


- [x] Close the public-web DNS rebinding gap before app distribution
  - Direct web reads connect to the validated literal IP with original Host/TLS hostname verification, fresh sockets, and manual redirects. Reject unsolicited compression and cancel discarded bodies. Five local transport tests cover DNS bypass, redirects, aborts, IPv6, and TLS trust/hostname rejection; existing web policy and body limits remain covered. See [review](docs/security-review-2026-09-06.md).

- [x] Clear chat composers immediately when sending
  - Thread composer clears text/attachments before awaiting the streamed reply. New-chat launcher clears during session creation and restores the draft if creation fails. Typecheck, changed-file lint, frontend build, and 10 existing composer/layout tests pass; no interactive UI verification in this pass.

- [x] Audit security and clean the public repository before release
  - [Security review](docs/security-review-2026-09-06.md): no Gitleaks findings in 352 scanned commits/current public tree; patched high-severity dependency findings, restricted private response caching/external images, and tightened new workspace/database permissions. Remaining findings have separate backlog cards; public distribution is not cleared.
  - Rewrote product README and public data/setup guidance, added docs index, retired 64 superseded mockup/screenshot files with local backup/history preserved, and explicitly ignored private editor state. Repository remains private.
  - Upgraded Homebrew/project Bun from 1.3.14 to 1.4.2, pinned CI/release packaging, added high-severity audit gate and Cargo Dependabot updates. Validation: 703 tests pass, typecheck/lint pass (existing warnings), 2 Rust tests pass, native/frontend build and isolated launch/relaunch/termination smoke pass. No performance benchmark or new signed release in this pass.

- [x] Remove SharePoint one-click and make GitHub logo theme-aware
  - SharePoint is excluded from one-click eligibility, including account variants; installed-account management remains available. GitHub stays available and uses theme foreground ink via the existing SVG mask. 17 catalog/logo tests, typecheck, frontend build, lint, and diff checks pass. Included in the next desktop build.

- [x] Make Springroll Glass the default and first glass theme
  - Renamed the display label and moved it before the other glass themes. Fresh/missing preferences default to Springroll Glass; existing saved selections and the stable theme ID are preserved. 23 theme/appearance tests, typecheck, lint, and frontend build pass.

- [x] Add a paused Morning Brief example recipe on fresh installs
  - Three recent technology/science stories with summaries, significance, and links. Uses built-in search/reader tools and the default model; suggested 8 AM local schedule stays paused. Card offers setup/run/edit guidance, then scheduling after success.
  - Fresh-database initialization retries interruptions without duplication; existing/legacy databases stay untouched and deleted examples do not return. Updated desktop smoke expectations.
  - 70 application/starter tests pass, plus typecheck, frontend build, changed-file lint, and diff checks. Included in the next desktop build; installed releases unchanged.

- [x] Replace startup copy with a quiet centered logo
  - Startup page now shows only the existing green leaf mark, centered at 64px, with no loading copy or animation. The status region remains hidden until a startup error is supplied. Included in the next desktop build; installed release unchanged.

- [x] Configure Google and Microsoft OAuth registrations for friends-beta testing
  - Marked complete for the current beta scope at the user's request on September 6; packaged-app acceptance and public verification remain separate open tasks.
  - Google: verified website ownership and branding, existing Desktop client and APIs, External/In production audience, and four saved read-only/identity review scopes. Earlier setup used eight declared scopes and Testing; the current saved review is narrower.
  - Microsoft: configured branding, 16 delegated Graph permissions, and four desktop callbacks; deployed publisher-domain association JSON. Publisher verification and actual connector sign-in remain open.
  - Website homepage, privacy, and terms are live at https://tryspringroll.com/ and saved in both registrations. No tenant-wide Microsoft consent performed.
  - Detailed state: [OAuth setup status](docs/oauth-setup-status.md). Apple Developer/signing setup is next.

- [x] Sequence Google verification, source publication, README refresh, and official Mac release
  - Added ordered milestones to [launch readiness](docs/launch-readiness.md), including public-site routing verification, parallel Google/Apple setup, README/history review before source publication, and production identity/data migration before signed app distribution. No external settings or visibility changed.

- [x] Restore visible page titles alongside the native app header
  - Restored the shared title/eyebrow and title/action layout for Inbox, Recipes, Integrations, and Settings; retained compact native top navigation. Removed obsolete compact-heading CSS. Typecheck, changed TypeScript lint, diff check, and desktop build pass; reopened stable app and confirmed Inbox heading in native UI state. Title restoration remains uncommitted after checkpoint `9fc29d2`.

- [x] Create the separate Springroll website repository and planning docs
  - Initialized `../springroll-website` on `main` with a README, Astro website brief, Google/publication checklist, TODO board, and .gitignore. No scaffold, remote, commit, or deployment requested.

- [x] Research optional sleep prevention and scheduled Mac wake for recipes
  - Documented [Mac sleep options](docs/mac-sleep-options.md) using official Codex/Apple guidance and local power-management manuals. Codex keeps remote hosts awake rather than waking sleeping hosts. Added implementation evaluation under lifecycle; no machine settings changed or wake tests executed.

- [x] Apply the sage Dock icon and update the desktop app
  - Added the selected vector source and native generation script, regenerated PNG/multiresolution ICNS, visually checked the rendered asset, and rebuilt/reopened the stable dev app. Sage tile `#DCE8D9`, existing green leaf, transparent outer corners; build and diff check pass.

- [x] Preview three Dock icon backgrounds using the existing logo
  - Created charcoal, cream, and sage SVG options plus a visually checked comparison with small Dock-size previews in `docs/design/dock-icon-options/`. Awaiting user choice; installed icon unchanged.

- [x] Review launch gaps, Google setup priorities, and desktop icon behavior
  - Added [launch readiness](docs/launch-readiness.md) and a priority Google/website checklist with verification dependencies. Confirmed transparent Dock artwork is packaged directly and no separate menu-bar icon is implemented. Documentation review only; no Cloud or release actions performed.

- [x] Show search result counts instead of metadata character counts
  - Prefer structured collection counts over text-preamble size in the shared chat/run formatter, including zero and singular results. Reproduced the 363-character bug before the fix; 50 focused tests, typecheck, changed-file lint, diff check, and desktop build pass. Updated and reopened the stable dev app. Previously persisted run labels are not rewritten.

- [x] Document future customization options and integration flexibility
  - [Future options](docs/future-customization.md) records BB lessons and defers broad app extensibility. [Integration flexibility](docs/integration-flexibility.md) documents existing paths, custom-code options, and the boundaries to preserve; linked from connector manifests. Documentation only, with no implementation commitment.

- [x] Persist theme and text size across desktop restarts and port changes
  - Store appearance in workspace SQLite with a migration and validated PATCH API; restore before rendering, migrate browser choices, serialize settings saves, and show persistence failures. Browser storage remains a cache.
  - 86 focused tests, typecheck, changed TypeScript lint, diff check, and Mac build pass. Preserved the user’s Springroll Dark Glass/medium choice and verified it visually after a full native restart from port 50565 to 50612.

- [x] Implement native inline header with centered navigation and logo on the right
  - Overlay Mac title bar, retain native controls, place navigation and logo in a single 54px row, reduce page top spacing, and visually hide redundant top-level headings while retaining accessible headings. Page actions remain above content.
  - Window dragging/zoom permissions are scoped to the current main-window server origin and port. Seven focused UI tests, two Rust navigation tests, typecheck, changed TypeScript lint, diff check, and desktop build pass.
  - Native UI checked on Inbox/Settings, navigation clicks, title-bar zoom/restore, and resizing to the 720px minimum. Updated app is running at `desktop/dist/dev/Springroll Prototype.app`.

- [x] Explore integrated app and page headers with interactive HTML options
  - `docs/design/app-header-options.html` compares a compact page toolbar, single header, and navigation rail across five page previews, with light/dark appearances. Added recommended native inline header after user feedback: traffic lights left, centered navigation, logo right. Production layout unchanged.
  - Opened and visually checked all three layouts and page switching in Chrome.

- [x] Fix blue broken-image artifacts inside monochrome provider logos
  - Render monochrome SVG masks on decorative spans instead of a placeholder GIF image; preserve logo sizing and isolated SVG resources.
  - Seven focused tests, typecheck, changed TypeScript lint, diff check, and Mac build pass. Verified Exa and Parallel show clean white marks in the native Settings page after relaunch.

- [x] Link directly to recipes after successful creation or updates in chat
  - Successful create/update tool results show a named receipt with View recipe linking to that record. Supports standard and wrapped subscription results, including stored conversations; no automatic redirect.
  - 34 focused tests, typecheck, changed TypeScript lint, diff check, and desktop build pass. Updated app through `dev:mac`; live recipe creation was not run for this UI change.

- [x] Standardize deletion controls with a shared trash icon and clear labels
  - Runs, conversations, recipes, and integration removal share DeleteButton with a 14px trash icon, accessible labels, and disabled states. Removed navigation arrows from deletion actions; sign-out/disconnect and attachment dismissal retain their meanings.
  - Five component tests, typecheck, TypeScript lint, diff check, and desktop rebuild pass. Existing stylesheet specificity warnings remain. Updated running app through `dev:mac`.

- [x] Add one-command desktop development updates with a stable app location
  - `bun run dev:mac` and `desktop/Start Springroll.command` build before gracefully stopping old checkout builds, replace `desktop/dist/dev`, retain one previous build, and reopen with existing data. Standalone packaging remains available.
  - Verified first launch and repeat update through both entry points, native inbox/data preservation, typecheck, changed-file lint, shell syntax, and diff checks.

- [x] Fix deletion confirmation for inbox runs, recipes, and conversations in the Mac app
  - Replaced browser prompts with app-owned dialogs. 71 tests, typecheck, lint, and Mac build pass. Verified run/recipe dialogs and Cancel/Escape in the native app; no user records deleted. Running bundle: `prototype-HAZu12`.

- [x] Restore setup cards and durable workflows for wrapped subscription tool results, including existing conversations
  - Shared normalization handles dynamic tool names and structured results in both UI projection and workflow persistence/backfill. Existing Clarity conversation parses as a ready proposal without repeating research; live setup still requires user approval and credentials.
  - 83 focused tests, changed-file lint, typecheck, and Mac build pass. Bundle: `desktop/dist/prototype-Ar42J5/Springroll Prototype.app`.

- [x] Make the chat stop control neutral grey and icon-only
  - Chat composer uses the square stop icon with neutral theme colors, including hover/focus; accessible label and tooltip retained. Run controls unchanged.
  - Two component tests, changed TypeScript lint, typecheck, and Mac build pass. Bundle: `desktop/dist/prototype-LA7QJF/Springroll Prototype.app`.

- [x] Hide unavailable one-click shortcuts while preserving in-app integration setup and installed accounts
  - Shortcuts requiring operator OAuth registration are hidden; ready providers and installed accounts remain. Add integration continues into the existing in-app setup conversation. Removed disabled shortcut styling and clarified empty-state guidance.
  - 76 focused tests, typecheck, changed TypeScript lint, and Mac build pass. Updated bundle: `desktop/dist/prototype-txcR85/Springroll Prototype.app`; native visual review remains with the user.

- [x] Default recipe turn limits to Off without changing saved limits or chat safeguards
  - Updated execution/configuration/UI fallbacks and SQLite default to zero; migration preserves saved turn and cost limits. Chat safeguards unchanged.
  - 68 focused tests, typecheck, changed-file lint, and Mac build pass. Updated bundle: `desktop/dist/prototype-93RCLf/Springroll Prototype.app`.

- [x] Keep the setup reminder visible through provider and default-model setup with an accented action link
  - Reminder says to add a provider key, then switches to selecting a default model; clears only when both are ready. Preserve the last status on refresh errors. Only the action link uses the theme accent.
  - Four readiness tests, typecheck, changed-file lint, and Mac build pass. Updated bundle: `desktop/dist/prototype-iqS4Il/Springroll Prototype.app`; visual review remains with the user.

- [x] Replace the setup wizard with Settings-first startup and a quiet setup reminder
  - Removed the standalone flow and launcher setup card. Startup opens AI providers or Models & limits when needed; a compact header reminder links to the remaining setting and disappears when ready. Browsing is not repeatedly redirected.
  - 12 focused readiness/navigation tests, typecheck, and Mac build pass. Updated bundle: `desktop/dist/prototype-a5imD3/Springroll Prototype.app`. Native visual review remains with the user.

- [x] Guide first-run model setup and gate chat until a connected default is ready
  - Added `/setup` using secure provider controls and the existing model picker, explicit default confirmation, and chat/recipe entry points. Launcher, composer, pending sends, and retries respect readiness; Settings/provider changes refresh the shared model state.
  - 677 tests, typecheck, changed TypeScript lint, rebuilt Mac app, and packaged launch/relaunch smoke passed. Native visual review and real provider onboarding remain part of the open acceptance work.
  - Updated prototype: `desktop/dist/prototype-kKcuY0/Springroll Prototype.app`; earlier bundles are unchanged.

- [x] Refocus the board on the five desktop-alpha priorities and archive earlier work
  - Preserved the previous backlog, partially completed work, and full Done history in [the September 5 archive](docs/archive/todo-2026-09-05.md).
