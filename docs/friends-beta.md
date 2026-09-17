# Springroll friends beta

This beta is for Apple silicon Macs. Use the signed, notarized DMG for the
standard drag-to-Applications installation. A ZIP remains available as an
alternative; updates are manual.

## Install and try it

1. Download the DMG from [v0.1.5](https://github.com/stumptowndoug/springroll/releases/tag/v0.1.5) and open it.
2. Drag Springroll onto Applications in the installer window. Eject the disk image, then open Springroll from Applications.
3. Open Settings and connect a supported model provider. Choose a default model.
4. Connect Google or Microsoft from Integrations. Google access is currently
   unverified and may show a consent warning. Work accounts can require an
   organization's administrator to approve access.
5. Create a harmless read-only recipe, run it manually, then schedule a run a
   few minutes ahead. Keep the Mac awake and Springroll running for this test.
6. Check the result in Inbox, quit and reopen the app, and confirm your setup
   and recipe are still present.

The release uses separate local storage from Springroll Prototype. Existing
prototype recipes, history, and connections will not appear automatically.

## Data and limitations

Relevant email, calendar, or file content may be sent to the model provider you
select when you ask Springroll to use it. Review the website's
[privacy policy](https://tryspringroll.com/privacy) before connecting accounts.
Avoid sensitive or production data during the first beta tests.

Local recipes depend on this Mac being available. Springroll does not currently
wake a sleeping Mac to run a job. Closing the window and quitting the application
are distinct actions; lifecycle and sleep recovery remain beta acceptance items.
Use read-only workflows for initial testing; the current Google verification
request covers read-only access, not optional write upgrades.

Updates are manual: quit Springroll, then replace the app in Applications with
the newer supplied build. Local release data lives outside the app bundle.

## Send feedback

Send Doug the app version, macOS version, steps to reproduce, and expected versus
actual behavior. Screenshots are useful after hiding account details and private
content. Runtime logs can contain private data; review them before sharing.

## Ongoing beta acceptance coverage

The owner reported successful testing and approved the public
[v0.1.5 beta](https://github.com/stumptowndoug/springroll/releases/tag/v0.1.5).
The detailed scenarios below remain useful for broader tester coverage.

- [ ] Verify downloaded ZIP extraction and launch on another Mac/account.
- [ ] Complete real Google and Microsoft sign-in, credential persistence,
  disconnect/reconnect, and an actual scheduled result in the signed release.
- [ ] Verify in-app data disclosure and available scopes match the beta guidance.
- [ ] Resolve or clearly scope known model-selector and connector callback issues.
- [ ] Check sleep/restart recovery and document observed close-versus-quit behavior.
- [x] Owner approved the tested artifact; public release and download URL are available.
