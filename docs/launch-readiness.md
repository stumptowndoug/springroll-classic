# Launch readiness

Reviewed 2026-09-17. The active checklist is [TODO.md](../TODO.md); this note
explains sequencing and dependencies. Open board items are unverified, not
proof that every underlying behavior is broken.

## Current Mac release: v0.1.5

Build 10 is based on PR #22, merged as `0402223`. It adds Google-scoped OpenRouter
ZDR enforcement, direct API access without a manual confirmation gate, model
filter/search improvements, Gmail discovery fixes and installed subscription
runtime compatibility checks. Google OAuth verification remains pending.
PR and merged-main CI/CodeQL passed. Local checks passed 774 tests, four snapshots,
four Rust tests, lint, types, frontend build and high-severity dependency audit.

Artifact directory: `desktop/dist/release-vLasUT/`. The release tree matches the
merged revision. Apple accepted app submission
`c0733bec-2ec9-409c-8c24-05da3093ceb3` and DMG submission
`3b5faf01-737c-45fa-83ce-5810fa98c39e`. Both tickets were stapled/validated and
Gatekeeper accepted both. Mounted app signature/ticket, app identity, icon,
layout metadata and Applications shortcut passed inspection. The signed packaged
runtime passed isolated startup/restart, paused starter recipe, assets and
subscription setup endpoint checks. Different-Mac and live scheduled-run
acceptance remain open; these checks made no live provider calls.

All 1,728 dependency links resolve within the bundle. The production identifier
remains `com.springroll.desktop`. Private evidence and workspace files are excluded;
only allowlisted installed-client OAuth configuration is packaged. Credential
pattern scans of tracked source, Git history and packaged first-party source found
no matches; these scans are not a guarantee that every secret format is detected.

- DMG: 145,392,827 bytes; SHA-256 `465e59cc4aaf45a8a66118fd90ec2581899cb49206855f5d9e55598109995a2f`.
- ZIP: 175,415,629 bytes; SHA-256 `4292a234326d079687514ad11b092f7b4c04f65a04bca3f567abba3218f46d17`.

[v0.1.5 downloads](https://github.com/stumptowndoug/springroll/releases/tag/v0.1.5)
provide the DMG, ZIP and SHA256SUMS.txt. Uploaded sizes and SHA-256 digests match
the local artifacts. Website PR #5 updates downloads and identifies
v0.1.5 as the first public build containing the documented routing controls.

## Previous v0.1.4 release

Build 9 is based on PR #20, merged as `dc7999f`. It adds compact chat approvals,
durable subscription decisions, incomplete-call validation, and current native
tool discovery. Google write tools stay in verification builds; OpenRouter ZDR
is not implemented. PR and merged-main CI/CodeQL passed. Local checks passed
747 tests, four native tests, lint, types, frontend build, and the high-severity
dependency audit.

Artifact directory: `desktop/dist/release-IlGm3c/`. Apple accepted app submission
`2ac41bb6-153a-407f-9640-92b531a513ac` and DMG submission
`d96ba04e-d433-4649-ac9b-14c3a8d361e9`. Both tickets were stapled/validated and
Gatekeeper accepted both. Mounted app signature/ticket, app icon, and Applications
shortcut passed inspection. The signed runtime passed isolated startup/restart,
paused starter recipe, Google/Microsoft setup availability, and subscription setup
endpoint checks. Different-Mac and live scheduled-run acceptance remain open.

All 1,728 dependency links resolve within the bundle. The release identifier is
unchanged; the verification marker and private workspace files are absent. Only
the three allowlisted installed-client OAuth values are packaged. Packaged
first-party source scan found no credentials. History/current scans flag only
the documented minified-chart-code example, not a credential.

DMG: 145,366,385 bytes; ZIP: 175,398,333 bytes. Uploaded sizes and SHA-256 hashes
match local artifacts:

- DMG: `7c6179fbb7893f9a0356f5654bda0d86a80881a5001ed74ba482a15fc9b0fc06`
- ZIP: `46ea417340122335180553dbb9800adc2927c064b5d11f21dcbcacbb130e56a4`

[v0.1.4 downloads](https://github.com/stumptowndoug/springroll/releases/tag/v0.1.4)
include the DMG, ZIP, and SHA256SUMS.txt. Website PR #4 updates the download link.

## Previous v0.1.3 release

Build 8 is based on PR #19, merged as `809aa82`. It adds required API connection
tests, diagnostic repair, explicit Bearer authentication, clearer setup chats,
and removes the hardcoded chat step cap. PR and merged-main CI and CodeQL passed.
Local validation passed 734 tests, four native tests, lint, types, frontend build,
and the high-severity dependency audit. WebKit checks covered card ordering,
repair progress, Stop/input recovery, and composer controls.

Artifact directory: `desktop/dist/release-kM2wYO/`. Apple accepted app submission
`914f7190-7afa-43b2-8111-1655e293bdc9` and DMG submission
`7dafe2df-2db9-4f10-bfbd-2c4f096590fb`. Both tickets were stapled and validated;
Gatekeeper accepted both artifacts. The mounted installer app's signature/ticket,
app icon, and Applications shortcut passed inspection. The signed packaged runtime
passed isolated startup/restart, paused starter recipe, Google/Microsoft setup
availability, and subscription setup endpoint checks.

All 1,728 dependency links resolve inside the bundle. The production identifier
and credential service are unchanged. Only the three allowlisted installed-client
OAuth values are packaged; no developer .env or workspace database is included.
The packaged first-party source scan found no credentials. Git history and current
files have one previously documented minified-chart-code false positive.

DMG: 145,371,022 bytes; ZIP: 175,398,594 bytes; installed app: 451,010,845 logical
bytes. Uploaded asset sizes and SHA-256 checksums match the local artifacts:

- DMG: `d7dde3d03299c38d86b3255f516bc198e810434652405bb0d3c80d780b8693e7`
- ZIP: `ac828b529744c6b4fb668487ccdde2f8549cae5627d7417cdf9d2f40582e40ab`

[v0.1.3 downloads](https://github.com/stumptowndoug/springroll/releases/tag/v0.1.3)
include the DMG, ZIP, and SHA256SUMS.txt. This remains a friends-beta prerelease.
The different-Mac and live scheduled-run acceptance items remain open; this
release's packaged smoke checks do not replace those scenarios.

## Previous v0.1.2 release

Build 7 is based on PR #18, merged as `54f2636`, and includes the smaller
installed bundle and Settings → Data & reset. PR CI and CodeQL passed. Merged-main
CI initially hit two Rivet recovery timeouts; all eight recovery tests passed
locally and the full 719-test CI rerun passed without code changes. Track that
intermittency on the board. Four native tests also passed.

Artifact directory: `desktop/dist/release-MO9HRT/`. The app's Apple submission
`bbee6c5a-96eb-4fe8-af8f-50ab8326ae0f` was accepted, stapled, and Gatekeeper-checked.
The signed packaged runtime passed startup/restart, paused starter recipe,
all six Google/Microsoft connector availability checks, and subscription setup
endpoints. All 1,728 dependency links resolve inside the bundle; the production
identifier is unchanged. The artifact contains only the three allowlisted
installed-client OAuth values and no developer .env or workspace database.

Reset was exercised in a disposable native test workspace, including cancellation,
exact typed confirmation, database/artifact/Keychain cleanup, restart, and
preservation of unrelated files and credentials. No real workspace was reset.
Different-Mac and live subscription scheduled-run acceptance items remain open.

The DMG submission `d7146a73-24db-48ee-9a77-bfcde25303fe` was also accepted;
both tickets were stapled and validated, and Gatekeeper accepted both artifacts.
The mounted app signature/ticket and Applications shortcut passed inspection.
Final DMG: 145,371,142 bytes; ZIP: 175,393,848 bytes;
installed app: 450,989,155 logical bytes. Checksums:

- DMG: `b5efab3fefe68a9e9589416882359d0a90131c47172ea2e71ad23e1ab944ca35`
- ZIP: `6a2ae4e605d1c6d9f85fe7fc8127d6b48c35527d35e14320a17a8359eb136a36`

[v0.1.2 downloads](https://github.com/stumptowndoug/springroll/releases/tag/v0.1.2)
include the DMG, ZIP, and SHA256SUMS.txt. This remains a friends-beta prerelease.

## Previous v0.1.1 release

The slimmed-down build 4 is based on PR #17, merged as `bd25266`. The owner
reported testing successful and authorized release. Local checks passed 717
tests; PR and merged-main CI and CodeQL passed.

Artifact directory: `desktop/dist/release-2ItAYw/`. The signed app passed Apple
notarization (`810d7d4c-b7ee-4c39-99c0-0c5737b1fa87`), and the DMG passed its
own review (`90b7553d-acdc-471a-99d9-908c9a795fea`). Both tickets were stapled
and validated, and Gatekeeper accepted both. The mounted installer app's
signature/ticket and Applications shortcut passed inspection.

The DMG is 200,351,740 bytes and the ZIP is 236,189,322 bytes, reductions of
52.9% and 48.8% respectively. SHA-256 values:

- DMG: `01a003d656c429377206b62533840ec62c06ada63ff42cc9b9b9120808f32275`
- ZIP: `07b203bcf44e844d75dc873ee5b0dc2adab1d29285680e34b4d808e902d6310e`

The signed packaged runtime passed startup/restart with isolated data and
credentials, the paused starter recipe, all six Google/Microsoft one-click
entries, and subscription setup endpoints. All 1,777 dependency links stay
inside the bundle; no .env or workspace data is packaged, and only the three
allowlisted installed-client OAuth values are included. Real optional Codex and
Claude downloads passed integrity/signature checks and isolated account probes.
The existing different-Mac and live subscription scheduled-run acceptance items
remain relevant; automated checks do not replace those scenarios.

See [v0.1.1 on GitHub](https://github.com/stumptowndoug/springroll/releases/tag/v0.1.1)
and [bundle sizing](mac-bundle-size.md). Existing release application identity
and credential locations are unchanged.

## Previous v0.1.0 release

Candidate 3 is built from merged revision `279b591` (PR #12), with Bun 1.4.2,
the current UI/setup fixes, and the DNS-fetch security fix. Local checks passed
708 tests; PR and merged-main CI passed. The repository is public.

Artifact directory: `desktop/dist/release-tsD6yJ/`. Apple submission
`a8a6dea0-66ae-48a3-8cb6-a524f3e7cadc` was Accepted. Signing, stapling, ticket
validation, and Gatekeeper checks passed. The final archive is
`Springroll-0.1.0-arm64.zip`, with a `SHA256SUMS` file alongside it. The public
[GitHub v0.1.0 prerelease](https://github.com/stumptowndoug/springroll/releases/tag/v0.1.0)
targets this exact revision; both assets are uploaded. GitHub reports the same ZIP SHA-256 as the local file:
`2f18af735d97e4566088d01032c71a188f8099b3a82001f49423828ea129303d`.

A drag-to-Applications DMG wraps the same app without changing the original ZIP.
DMG submission `20ed369e-bdbc-4607-a550-befae7e8a136` was Accepted; stapling,
Gatekeeper, mounted-app signature/ticket, and Finder layout checks passed.
It is available on the same release with a separate `.dmg.sha256` file. Its SHA-256:
`c321a5cd054534773ee6d7dad65557369a238a721d321056b5cdf13d7f580f4d`.

The signed bundled Bun runtime passed a public HTTPS read through the pinned
transport. The packaged first-party scan had one reviewed false positive in
minified chart code (`q.keyCount,L=q.atlasCount`); no credential was present.
The installed-client OAuth allowlist and absence of developer workspace/env
files were checked. The latest history scan covered 354 commits with no matches.

The owner reported testing was successful and explicitly approved public release
on September 6. The ZIP was published as a prerelease with its verified checksum.
That is owner-reported acceptance, not an independent record that each scenario
below was individually observed by the coding agent. Keep covering these cases
as the beta expands:

- Installation on another Mac or a separate macOS user account.
- Model/web setup and a manual Morning Brief run.
- Google/Microsoft sign-in, restart/refresh, and disconnect/reconnect.
- Harmless scheduled recipes and sleep recovery.
- Settings, recipes, and credentials surviving app replacement.

GitHub's old Drizzle alerts cleared after merge; a glib warning remains in the
cross-platform lockfile. Other lower-severity dependency follow-ups remain open.
See [security review](security-review-2026-09-06.md), [desktop setup](../desktop/README.md),
and [friends beta](friends-beta.md).

## Friends-beta release sequence

The immediate target is a small invite-only beta, not a broad public launch.
Google and Microsoft registration setup is complete for this milestone. The
website is live; Google website ownership and branding are verified. Google
data-access verification was last confirmed saved at its final questionnaire,
not submitted. Microsoft publisher verification remains open. See
[OAuth setup status](oauth-setup-status.md) for registration details.

1. **Set up Apple distribution.** Confirm the existing Apple Developer membership
   used for Shep, signing access, and a stable Springroll bundle identifier.
2. **Build the distributable app.** Replace prototype/debug packaging with a
   release configuration. Decide prototype data and Keychain migration versus
   separation. Supply application-owned Google and Microsoft OAuth configuration
   without relying on a developer shell or bundling a developer `.env`. Sign
   shipped executables, notarize, and test the downloaded artifact under Gatekeeper.
3. **Run clean-machine acceptance.** Install without development tools, connect a
   model, test Google Gmail/Calendar/Drive and Microsoft Outlook/OneDrive, create
   a recipe, and receive a scheduled result. Verify restart, credentials,
   disconnect/reconnect, sleep recovery, and close-versus-quit behavior. Resolve
   the open model-selector issue and verify connector callback fixes in the
   current build; earlier test results do not replace these acceptance checks.
4. **Distribute the approved friends beta.** Provide a private download, short
   installation instructions, known scheduling/account restrictions, clear
   disclosure of content sent to model providers, and a feedback route. Choose
   a simple manual update process for the initial beta.

Source publication is a separate milestone: refresh README/screenshots, review
history and artifacts for secrets/private examples, reconcile the release branch,
and run release checks before making the repository public. Public Google
verification and Microsoft publisher identity remain follow-ups; do not describe
either as approved. Optional wake-from-sleep features, a menu-bar control,
automatic updates, and more integrations need not block the friends beta.

“Official app” here means a signed/notarized direct Mac download; Mac App Store
submission is not part of this plan. See
[Apple's direct distribution guidance](https://help.apple.com/xcode/mac/current/en.lproj/dev033e997ca.html).

## Google prerequisites

The native Gmail, Calendar, and Drive adapters and application-owned Desktop
OAuth configuration path exist. Google Cloud registration and demo account flows
have been verified; clean-machine packaged acceptance remains open. Follow
[one-click connectors](one-click-connectors.md) for the technical setup.

Two milestones should be separate:

1. **Dogfood sign-in:** configure the Google project, APIs, Desktop client,
   scopes, and named test users; get a real Google recipe working in the packaged
   app. This can proceed while the public website is prepared. External Testing
   authorizations and offline refresh tokens for these data scopes expire after
   seven days, so this is not a durable production scheduling test.
2. **Public availability:** ship consistent branding and public product/legal
   pages, verify domain ownership, provide scope justification/demo evidence,
   and complete applicable Google verification. Publishing status and verification
   are distinct; do not treat a website or a production toggle as approval.

The website should explain the product and link to privacy, terms, support,
and data-deletion instructions. The privacy disclosures must reflect actual
behavior: what Google data is accessed, what reaches the selected model provider,
where results/logs are retained, and how disconnect and deletion differ. Do not
describe all Google data as staying on the Mac merely because credentials are
stored locally. Audit model-provider processing and Google's Limited Use
requirements before writing final claims.

Review the minimum scopes for the first release. Gmail read/modify and broad
Drive access introduce restricted-scope concerns; access to restricted data
through third-party servers can require an annual security assessment. Establish
applicability for Springroll's actual model-provider and hosting flows with the
verification process rather than assuming a desktop exemption. If necessary,
evaluate launching a narrower Google capability first without dropping the
broader integration goal.

The packager deliberately excludes `.env`, while the connector configuration
currently reads application-owned OAuth values from its environment. A release
must supply the intended desktop client configuration deliberately, not depend
on the developer's shell. Installed-app client values are not confidential
server secrets; user credentials and unrelated development secrets must remain
out of the bundle.

Official references checked for this review:

- [OAuth policies: homepage, terms/privacy, and domain requirements](https://developers.google.com/identity/protocols/oauth2/policies)
- [Sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Restricted-scope verification and security assessment](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Testing audience and seven-day token expiry](https://support.google.com/cloud/answer/15549945?hl=en)

## Other release gates

- **Scheduling on a real Mac:** sleep overnight, restore networking, quit/reopen,
  and force termination; verify skip/catch-up behavior and no unintended duplicate
  writes. Automated recovery tests already exist; device acceptance remains open.
- **Desktop lifecycle:** define window close versus Quit, background execution,
  startup failure handling, single-instance behavior, and child-process cleanup.
  Decide how users can see that scheduling is active or unavailable.
- **Clean installation:** test on a separate Mac account without development
  tools, including Keychain, model setup, first recipe, actual scheduled result,
  and Google OAuth. Finish the outstanding Neon callback acceptance as well.
- **Known UI issues:** reproduce and close the open bottom model-selector issue
  in the current app. Older board entries identify historical builds; they do
  not establish the current build's outcome.
- **Distribution:** produce an optimized release build, sign/notarize the app
  and nested executables, choose supported architectures, and test installation.
  Choose a download/update process; automatic updates need not block an alpha.
- **Release review:** run release checks, scan artifacts/history for secrets,
  document supported runtimes, costs, local scheduling limitations, and recovery,
  and obtain publication approval before distribution or making the repo public.

Broad UI plugins, arbitrary app customization, additional connector expansion,
and hosted scheduling are not prerequisites for a local desktop alpha.

## Dock icon versus menu-bar icon

The current package copies `desktop/icons/icon.icns` and sets `CFBundleIconFile`
to that asset. The selected artwork now places the green leaf on a pale sage
`#DCE8D9` rounded tile, with transparency outside the tile. The background is
part of the artwork, not a debug-mode effect. Regenerate the PNG and ICNS from
`desktop/icons/icon.svg` with `swift desktop/icons/generate.swift`.

There is no separate tray/menu-bar implementation in the current desktop source.
The app's Dock icon and a future menu-bar status icon are separate assets and
behaviors. The user selected the sage Dock background after comparing three
previews. If background scheduling warrants a
menu-bar control, design a small monochrome transparent status mark plus useful
Open/Status/Quit behavior separately.
