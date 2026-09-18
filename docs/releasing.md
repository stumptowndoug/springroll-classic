# GitHub releases

[v0.1.5](https://github.com/stumptowndoug/springroll/releases/tag/v0.1.5) is published as Mac friends-beta build 10. It adds Google-scoped OpenRouter
ZDR enforcement, clearer Gmail discovery, a model filter, and compatibility checks
for installed subscription runtimes. Direct API providers remain available without
a manual confirmation gate. Google OAuth verification remains pending.
Release identity remains `com.springroll.desktop`; existing release data stays in
place. v0.1.4 remains available for rollback.
Reserve v1.0.0 for a later stability milestone.

## Before publication

1. Commit the reviewed changes on the working branch, integrate through a pull
   request into `main`, and require passing CI (lint, types, tests, frontend build).
2. Review the full Git history, tracked files, documentation, licenses, and final
   artifact for secrets and private examples. Private OAuth account details and
   verification video references belong outside Git. A current-file pattern scan
   is not a substitute for reviewing history.
3. Build from the intended clean release revision with `SPRINGROLL_BUILD_NUMBER=10`
   and `bun run release:mac`, supplying private signing/OAuth environment values
   as described in [desktop README](../desktop/README.md#signed-friends-beta-build).
   Build 2 contains the context fix but predates the later startup, sample recipe,
   theme, and one-click changes; do not publish it as the complete checkpoint.
4. Test the new ZIP on a clean Mac/account: first launch, paused Morning Brief,
   model/web setup, Google/Microsoft sign-in, a manual and scheduled result,
   restart, and sleep recovery. Also replace the existing release and verify its
   data, preferences, and credentials survive. Resolve or scope known blockers
   listed in [launch readiness](launch-readiness.md).
5. Review the proposed public repository and downloadable artifact with the
   project owner, then make the repository public and publish the prerelease.

## GitHub assets and website

Use GitHub Releases on `stumptowndoug/springroll`. Attach the final stapled
`Springroll-0.1.5-arm64.dmg` as the recommended installer, the ZIP alternative,
SHA-256 checksums, and short release notes describing
supported Macs, setup, local scheduling limitations, provider verification status,
and known issues. Do not attach the temporary notarization ZIP, signing materials,
OAuth `.env`, runtime logs, databases, or private verification evidence.

Tag the exact tested commit as `v0.1.5`. Prepare the release as a draft first;
publish only after acceptance. Link the website Download button to the specific
published beta release or its asset. Do not rely on `/releases/latest` selecting
a prerelease. The website Download
button should use the current beta release URL.

For initial updates, users quit Springroll and replace the app in Applications.
The stable `com.springroll.desktop` identity keeps release data outside the app.
Unlike Shep, Springroll has no Tauri updater integration or updater feed yet;
GitHub hosting alone does not install updates automatically.

## Suggested release notes

Springroll's first Apple silicon Mac beta: create scheduled AI recipes, inspect
results in Inbox, and connect model providers and supported integrations. Fresh
installs include a paused Morning Brief research recipe and Springroll Glass.

Google data access remains unverified; organizational Google/Microsoft policies
may restrict consent. GitHub one-click is unavailable pending its app registration,
and SharePoint is excluded from the one-click row. Recipes run locally and do not
wake sleeping Macs. Relevant connected content can reach the chosen model provider.

See [friends-beta instructions](friends-beta.md) for installation and feedback.
