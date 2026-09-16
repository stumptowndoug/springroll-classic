# Google verification demo outline

Prepared for owner discussion. No recording has started. This is a proposed
sequence, not evidence of a completed or approved integration.

## Recording setup

Use a current local build with synthetic messages, calendars, and
Drive files. Gmail sending/drafts and Calendar changes are available in normal setup. Keep the shared Google project's publishing status In production.
Confirm the recording account and selected AI account/tier before recording;
keep private account details, credentials, and the final video outside Git.

Introduce Springroll as a local integration app with granular Google permissions
and user-selected AI providers/accounts. Explain that relevant Google content
goes to the selected provider and can be retained in local conversation history.
Show the actual model choice and data-use notice. Do not suggest the demo's model
is the only supported route or that Springroll enforces provider training settings.

## Proposed sequence

| Step | Springroll demonstration | Google-side evidence |
| --- | --- | --- |
| Connect and identify account | Start from a fresh grant; show Google sign-in, account identity, and full readable permission text. Expand “Show all services” where present. | Consent and signed-in account correspond to the connected account. |
| Gmail reading | Search seeded messages, open a message/thread, inspect available draft/label reading features, and summarize the relevant content. Explain why inbox content access is needed. | Show the matching seeded messages in Gmail. |
| Optional send | Enable Send through the real incremental consent flow; send a harmless message, then demonstrate supported reply/forward actions. | Show the resulting messages in Gmail Sent. |
| Optional drafts | Enable Save drafts and show consent. Create a draft; explain that Google's compose scope also permits sending, while Springroll exposes sending as a separate action choice. | Open the saved draft in Gmail. |
| Calendar reading | Connect Calendar, show consent, list calendars, and inspect events. Explain the calendar-discovery and event-reading needs. | Show the matching calendar/events. |
| Optional event management | Enable the event permission and show consent. Create and update a test event, demonstrate RSVP where supported, then delete the test event. | Show each resulting change in Google Calendar, including deletion. |
| Drive reading | Connect Drive, show consent, search an existing seeded document, and read/download/export its contents through supported tools. Explain why selecting newly created app files alone would not serve this feature. | Open the same document in Drive and compare its contents. |

Before recording, check the current manifest for every exposed operation and add
any missing user-facing action to the sequence. Capture every submitted scope
across the real consent flows; do not request artificial extra scopes just to
create a single screenshot. Explain why narrower permissions cannot implement
the demonstrated features. Record actual failures or fix them before taking the
final video; do not imply successful operations from a scripted narration alone.

## Review package after recording

Pair the video with the saved seven-scope inventory, factual provider/data-flow
audit, and known account tiers/settings. Disclose unknown or user-dependent
OpenRouter downstream routes instead of inventing a fixed list. The owner has
chosen unrestricted model/endpoint selection; do not represent this as enforced
no-training routing. The requested affirmative Limited Use statement remains
unsubstantiated. Recording a successful feature demo does not resolve that issue.

Review the video and reply text before sending anything to Google. No reviewer
email or website publication is authorized by this outline.
