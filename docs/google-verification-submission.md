# Google verification handoff

Updated September 7, 2026. Website ownership and branding are verified; data
access is **not verified**. The original read-only request was submitted. Google
replied requesting stronger scope demonstrations and AI-provider/data-use details.

The owner chose to resume the shared Google connection. Personal-credential setup
is preserved on `feat/google-personal-oauth-setup` at `d1d6798`. The active
`feat/google-shared-oauth-launch` branch starts from the original shared-auth
version, `5970090`. Switching branches does not migrate existing personal-account
tokens or change installed releases; reconnect affected development accounts via
the shared client if necessary. No stored credentials were deleted.

## Saved Google scope request

Google Console confirmed “Data access changes saved!” after warning that saving
would update the pending verification request. The configured scopes are:

| Scope suffix (all use `https://www.googleapis.com/auth/`) | Intended feature |
| --- | --- |
| `userinfo.email` | Identify connected accounts |
| `gmail.readonly` | Search/read emails, threads, drafts, and labels |
| `gmail.send` | Optional sending, replies, and forwards without draft management |
| `gmail.compose` | Optional Gmail drafts; Google also permits sending with this scope |
| `calendar.readonly` | Discover calendars and read events |
| `calendar.events` | Optional event creation, updates, RSVP, and deletion |
| `drive.readonly` | Search/read/download/export existing Drive documents |

Sensitive and restricted scope justifications were updated to explain granular
permissions, actual data flows to user-selected remote model providers, and the
need for a replacement demo. The owner subsequently recorded and uploaded an
unlisted replacement (15m21s). Its link replaced the original demo in Data Access;
Google confirmed that saving updates the pending verification request and then
displayed “Data access changes saved!” The video is submitted evidence, not an
approval or a claim that every scope is fully demonstrated. No reviewer email
was sent or compliance attestation made. The private video URL stays outside Git.

## Required before the new demo and release

- Gmail drafts now use a separate `drafts` permission with `gmail.compose`;
  sending remains gated by the separate `send` choice. Inbox trashing was removed.
  Existing `organize` grants do not automatically enable the new drafts choice;
  reconnect/authorize Save drafts. This does not revoke previously issued broad
  Google tokens; revoke the old Google grant before reconnecting to remove them.
- Drive write operations and the broad `drive` scope have been removed.
- September 16 owner update: the write-scope staging gate has been removed.
  Normal setup exposes Gmail sending/drafts and Calendar event permissions;
  existing read-only accounts still require fresh consent. This is an app change,
  not evidence of Google approval.
- Show granular sending, drafts, and event-management permissions. OAuth scope overlaps must be disclosed:
  app-level action choices do not narrow the Google token's capabilities.
- Follow Google's review instruction: trigger new unverified scopes only in
  staging/hidden test routes; do not deploy them to production traffic. Keep the
  shared project's publishing status In production.
- Record full readable consent and every requested feature. Show messages in
  Gmail Sent, saved drafts in Gmail, and changed events in Google Calendar.
  Demonstrate Drive document reading/export, not only folder listing.
- Inventory every AI provider, tier, gateway, upstream endpoint, and training
  restriction used for Google data. Audit actual behavior before affirming
  compliance. Relevant content can leave the Mac for remote model processing.
- Complete the Limited Use disclosure and determine applicable restricted-scope
  security-assessment obligations; local credential storage is not an exemption
  for remote processing.
- Reply to the existing Google review thread with the new evidence when ready.

Private reviewer evidence, account identifiers, and recording details stay outside
Git. See [OAuth setup status](oauth-setup-status.md).


## AI-data audit handoff

The owner chose to continue verification while preserving user choice of models,
endpoints, and accounts. Provider allowlists and training-based routing gates are
not planned. Describe the local, user-directed architecture and its limitations
accurately; do not claim that downstream training settings are enforced or that
Google has accepted this architecture. Address review objections when received.

The [demo outline](google-verification-demo-outline.md) is ready for owner review.
The owner subsequently recorded and uploaded a replacement, now saved in Console.

The [provider/data-flow audit](google-ai-data-audit.md) is complete at code and
published-policy level. It identifies unresolved account tiers, training opt-ins,
OpenRouter downstream routing, and Google-derived-content isolation. The
[disclosure draft](google-data-disclosure-draft.md) is prepared, but the affirmative
compliance statement must not be published until these gaps are resolved. An
accurate remote-processing notice is present on Google account pages in the app.
The owner supplied a replacement recording, now saved to the pending request.

## Subsequent connection UX change

After the replacement video was submitted, the owner requested supported Google
permissions together on initial sign-in. Verification builds now request Gmail
read/send/compose and Calendar read/events together. Existing accounts retain
their actual stored grants until reconnection. Drive remains read-only. Console
justifications and the submitted video still describe the earlier optional-upgrade
flow; update that evidence when presenting this revised UX to Google. No new
scopes were added by this code change.
