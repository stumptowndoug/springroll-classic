# Mac desktop app

The default development commands create an unsigned prototype. The separate
[release workflow](#signed-friends-beta-build) builds and notarizes a beta candidate.
The existing UI runs in a Tauri webview; the native shell owns a bundled Bun
application and a separately owned Rivet engine. The unified 54px title bar
keeps native traffic lights, centered navigation, and the logo on the right.
Only window dragging and title-bar double-click zoom are exposed to the main
webview, scoped at runtime to the exact local server origin and port. External HTTPS navigation opens the default browser, while the
app window stays on its own loopback origin.

## Build and smoke-test

For everyday development, run `bun run dev:mac` from the repository root,
or double-click `desktop/Start Springroll.command` in Finder. Each invocation
builds current source, gracefully quits desktop builds running from this
checkout, and opens `desktop/dist/dev/Springroll Prototype.app`. Wait for
ongoing work to finish before updating. This is an explicit rebuild/restart,
not automatic hot reload. It uses the same prototype workspace and Keychain.

Normal builds expose Gmail sending/drafts and Calendar event permissions. Existing
read-only accounts need to **Reconnect** and grant those permissions before their
write tools become active. `bun run dev:mac:google-verification` remains an alias
for the normal development launcher; there is no separate write-scope mode.

The launcher keeps one previous development build in `desktop/dist/dev-previous`.
Build failures leave the running app and last good build intact. If an update
process is interrupted and leaves `desktop/dist/.dev-update-lock`, check that
no update is running before removing that directory and retrying.

Use the command or double-click launcher to pick up code changes; opening the
`.app` directly only launches its existing compiled version. Older numbered
prototype folders are standalone snapshots created by the packaging command
below; they are no longer needed for the everyday development loop.

On a Mac with the project's Bun version, Rust/Cargo, and Xcode tooling:

```sh
bun install --frozen-lockfile
bun run build:mac
bun desktop/smoke.ts '/absolute/path/from/build/Springroll Prototype.app'
```

Each standalone `build:mac` creates a new directory inside `desktop/dist`; it never overwrites
a previous app. The first prototype uses the current Mac architecture and a
debug Rust build. Production dependencies are installed with a frozen lockfile
and lifecycle scripts disabled. The bundle is deliberately large (roughly 1.2 GB
in the initial arm64 build). Dependency pruning, release optimization, universal
builds, signing, notarization, and updates are follow-up work.

The package is assembled from an explicit allowlist of application/kernel
sources, assets, migrations, package manifests, lockfile, and license. It does
not copy `.env`, `.local`, Git history, or design studies. Runtime dependencies
are installed inside the package; symlinks must resolve within that directory.
Both Bun and the engine are copied into the package. Native modules and agent
executables remain in their installed package layouts.

## Data and lifecycle

- Data lives in `~/Library/Application Support/com.springroll.desktop.prototype`.
- The prototype uses its own Keychain service, with legacy credential adoption
  disabled. It does not import development recipes, credentials, or history.
- `runtime.log` contains startup/provider diagnostics. Treat it as private; do
  not include it in a public issue without reviewing it for sensitive content.
- A filesystem lock prevents a second instance from opening the same workspace.
  The second instance currently shows an explanation rather than focusing the
  first window.
- The HTTP server binds to a dynamically assigned loopback port. The shell waits
  for its child process to announce readiness before navigating the window.
- Scheduler ports are selected from a separate local range. Port reservation
  races and crash/orphan recovery need further lifecycle hardening.
- Quit/termination drains the app before stopping the engine, with bounded
  cleanup. This is not a guarantee against interrupted external side effects.
- The debug-only `SPRINGROLL_DESKTOP_TEST_DATA_DIR` override lets the smoke script
  create an isolated temporary workspace. Smoke data is retained for diagnosis.

## Acceptance still required

- Visual review of the native window, menus, dialogs, external links, and icon.
- A separate clean Mac account: Keychain prompts, provider sign-in, OAuth return,
  native modules, and a real harmless scheduled recipe.
- Sleep/wake, network restoration, closing the window versus Quit, force kill,
  startup cancellation, unexpected child death, and no orphaned processes.
- Confirm security posture of the loopback API and signing of every nested
  executable before distributing outside a development environment.
- Local MCP integrations may require user-installed tools. Packaging the core
  app does not make every user-supplied integration self-contained.

Tauri resource conventions: https://v2.tauri.app/develop/resources/

## Signed friends-beta build

`bun run release:mac` creates a current-architecture release build named
`Springroll.app`, signs its Mach-O executables with Developer ID and hardened
runtime, submits a ZIP to Apple, staples an accepted ticket, checks Gatekeeper,
and produces ZIP and drag-to-Applications DMG downloads in a unique `dist/release-*`
directory. A failed submission stops the workflow; inspect `notarization.json`
in that build directory. No upload to the website or GitHub is performed.

Supply these environment variables through your private local configuration:

- `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific password),
  and `APPLE_TEAM_ID`. The certificate and private key must be in Keychain.
- `SPRINGROLL_GOOGLE_OAUTH_CLIENT_ID`, `SPRINGROLL_GOOGLE_OAUTH_CLIENT_SECRET`
  (the installed Desktop client), and `SPRINGROLL_MICROSOFT_OAUTH_CLIENT_ID`.
- Optional numeric `SPRINGROLL_BUILD_NUMBER` (default `1`; increment for releases).

Run with your private local configuration:

```sh
bun --env-file=.env run release:mac
```

Release packaging requires the exact Bun version pinned in root `package.json`.
The packaged application includes that runtime; end users do not install Bun.

Only the three listed installed-app OAuth values are written into the runtime's
`oauth-clients.json`. Those installed-client values are extractable from the app;
they are not a place for server secrets. Signing credentials, user tokens, and
the developer `.env` are not copied into the bundle.

Release identity is `com.springroll.desktop`, with its own Application Support
directory and `com.springroll.desktop.credentials` Keychain service. The release
starts fresh: prototype recipes/history/credentials are not migrated or removed.
Development commands retain the prototype identity. The debug-only smoke data
override is intentionally unavailable in release builds; use a clean account for
release acceptance. The workflow produces a ZIP and DMG with manual installation
and updates; it does not implement an updater or Intel/universal cross-build.

Signing references: [Apple notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
and [Bun's JIT signing entitlement](https://bun.sh/guides/runtime/codesign-macos-executable).

Fresh workspaces receive one paused Morning Brief example using built-in web
research. It requires model and web-research setup before running. Its suggested
schedule is daily at 8 AM in the startup timezone; scheduling stays off until the
user enables it. An initialization marker beside the database retries interrupted
seeding, then is removed. Existing databases (including empty ones and adopted
legacy databases) are not seeded; edits and deletions survive restarts.

## Drag-to-Applications installer

Install the packaging prerequisite with `brew install create-dmg` (validated with
1.3.0). `bun run release:mac` now creates the ZIP and a signed/notarized DMG.
The DMG has a saved Finder layout with the app and `/Applications` shortcut.
Creating that layout requires a logged-in macOS desktop and Finder automation.

To wrap an existing signed/stapled app without rebuilding or modifying it:

```sh
bun --env-file=.env desktop/release-dmg.ts /path/to/Springroll.app
```

The same private Apple signing/notarization environment is required. Output files
are versioned alongside the app; an existing DMG is not silently overwritten.
For local unsigned layout work only, use `bun desktop/dmg.ts /path/to/Springroll.app`.
`dmg-notarization.json` records the outer disk image's submission, separately from
the app's existing notarization. Validate the mounted app signature/ticket and
inspect the Finder layout before uploading the DMG. Keep the original ZIP hash
unchanged when adding a DMG to an existing release.

Bundle measurements and optional-runtime plans: [Mac bundle size](../docs/mac-bundle-size.md).

### Installed subscription tools

Springroll reuses installed Codex and Claude CLIs when they expose the integration
commands the adapters use. There is no numeric version floor for installed tools;
the managed download version is not a compatibility minimum. Older and newer
versions are not rejected simply for differing from the managed download.
Discovery checks version/help output without downloading or making model calls.
The checks establish CLI entry-point support; protocol errors during actual use
still surface normally. Missing/unsupported installations can use an explicitly
downloaded, verified managed copy.
