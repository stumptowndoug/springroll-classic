# Google data disclosure draft

Updated September 16, 2026 for the implementation branch. Review copy; public
publication remains pending account/endpoint evidence and acceptance testing.
See [implemented controls and remaining work](google-zdr-implementation.md).

## Website Google-data section replacement

Springroll connects Gmail, Google Calendar, and Google Drive using a shared Google
OAuth client. Sign-in returns to a local listener on your Mac. Google access is
not yet verified. Normal connections request reading access; optional Gmail
sending/drafts and Calendar event changes are currently limited to verification
staging. Drive access is read-only.

When you use Google data in a chat or recipe, relevant emails, events, files, and
metadata are sent through OpenRouter to supported Zero Data Retention inference
endpoints. Springroll sets OpenRouter's ZDR routing flag on each applicable request;
OpenRouter selects eligible endpoints for the user's chosen model. Springroll does
not impose a fixed model or hosting-provider list and never retries without ZDR
when eligible routes are unavailable. Local execution does not mean AI processing stays on your Mac.

Credentials, reports, conversation history, and activity can be stored on your Mac.
Protection persists for Google-derived chats and recipes: they cannot switch to
unrestricted AI providers or unverified image-generation routes. External integrations, web search and integration research remain available under normal tool permissions and approvals.
Shared workspace lists and legacy conversations are conservatively protected because
they may contain Google-derived information. Other model connections can still be
used for separate work that does not access protected content.

OpenRouter account settings and applicable agreements also govern processing.
Prompt logging and data sharing must remain off. Provider-specific exceptions,
including bring-your-own-key agreements, require separate verification. OpenRouter's
ZDR definition permits implicit in-memory prompt caching. The routing flag does not
make every feature or setting in a user's OpenRouter account ZDR.

Google access does not authorize generalized-model training. Springroll does not
sell Google data or use it for advertising. Disconnecting an account stops future
access through that connection; use Google's account controls to revoke existing
grants. Deleting local reports does not delete copies previously processed or
retained by an external service.

## Proposed affirmative statement — not substantiated for publication

Springroll's use of raw or derived user data received from Google Workspace APIs
will adhere to the Google API Services User Data Policy and the Google Workspace
API User Data and Developer Policy, including the Limited Use requirements.
Springroll will not use or transfer this data to create, train, or improve
foundational or generalized AI/ML models, or to services that use it for those
purposes.

## Publication checklist

- Confirm actual API plans, no-training terms, logging/sharing settings and BYOK exceptions.
- Complete real synthetic-data acceptance checks and collect the exact route evidence.
- Publish the final section and affirmative statement at the privacy-policy URL.
- Include the live URL, provider/model/endpoint inventory, plan details, controls,
  and updated demo in the reviewer reply.

No provider account settings were changed and no website update or reviewer email
was published as part of this implementation.
