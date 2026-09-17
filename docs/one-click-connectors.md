# One-click connectors

How Springroll ships Grok-style connectors, what is ready now, and what you
need to configure on Google Cloud or Slack so Sign in actually opens.

## Grok's model, mapped onto Springroll

Grok splits connectors into three kinds. Springroll follows that split.

| Grok kind | What the user does | Springroll route |
| --- | --- | --- |
| Built-in | Sign in with the vendor. xAI owns the OAuth app and talks to the stable API. | Native `http-api` adapters. Springroll owns the OAuth client. |
| Catalog | Sign in. The provider hosts MCP and usually supports dynamic client registration. | Curated `mcp-remote` manifests. No Springroll OAuth app. |
| Custom MCP | Paste a server URL. | Existing researched / custom MCP path. |

Grok's built-in set is Gmail, Google Calendar, Google Drive, Outlook Mail &
Calendar, OneDrive, Microsoft Teams, SharePoint, and Salesforce. Its catalog
covers Notion, Slack, GitHub, Linear, and similar. Grok keeps Gmail and
Calendar as **separate** connectors with their own OAuth consent and a
read-then-write permission ladder.

Springroll now matches that for Google and Microsoft. Gmail, Calendar, and
Drive are native REST adapters on **one** Google OAuth Desktop client. Outlook,
OneDrive, Teams, and SharePoint are native Microsoft Graph adapters on **one**
Entra ID OAuth client. Every service still has its own Sign in, account
instances, read-only starting permission, and optional write upgrade. GitHub,
Jira, Linear, Notion, Stripe, and Neon stay on the provider's official MCP
OAuth. Slack stays on Slack's official MCP server, but Slack refuses dynamic
client registration, so Springroll's Slack app has to exist first.

Salesforce remains a catalog placeholder until Springroll stores each org's
OAuth-issued instance URL and has a Salesforce Connected App. Do not treat
that card as working sign-in.

## Ready without extra operator setup

These use the provider's OAuth (dynamic client registration). Click **Sign in**
in Integrations. You do not create a Springroll OAuth app.

- **GitHub** — `https://api.githubcopilot.com/mcp/`. Official remote MCP with
  OAuth. A personal access token is not required. GitHub hosts this URL on the
  Copilot MCP hostname; you still sign in as a normal GitHub user.
- **Jira** — Atlassian remote MCP at `https://mcp.atlassian.com/v1/mcp/authv2`.
- **Linear** — official read-write MCP at `https://mcp.linear.app/mcp`. If an
  older Linear connection was created against the readonly URL, reconnect it.
- **Notion** — `https://mcp.notion.com/mcp`.
- **Stripe** — `https://mcp.stripe.com`. Review write tools before use.
- **Neon** — Sign in with Neon, or paste one API key.

## Google Workspace (Gmail, Calendar, Drive)

Public-launch prerequisites and sequencing are tracked in
[launch readiness](launch-readiness.md) and the active Google checklist in
[TODO.md](../TODO.md). Test-user setup and public verification are separate milestones.

Springroll already has the native connectors. They become one-click as soon as
the application-owned Google OAuth Desktop credential is configured. The same
credential powers Gmail, Calendar, and Drive; end users never create a Google
project or paste credentials.

During development, the project still needs the APIs, scopes, and test users
needed by the accounts being exercised.

### 1. Enable APIs

In the same Google Cloud project as Gmail:

1. Enable **Gmail API**, **Google Calendar API**, and **Google Drive API**.
2. Leave other Google APIs off unless a later connector needs them.

### 2. Create the desktop client

Auth platform → Clients → Create client → **Desktop app**. Installed apps use
a loopback callback handled by Springroll itself. Do not create a Web client
and do not register connector-specific redirect URIs.

At runtime Springroll sends Google back to its local server (default port
`4117`):

```text
http://127.0.0.1:4117/api/connectors/gmail/oauth/callback
http://127.0.0.1:4117/api/connectors/google-calendar/oauth/callback
http://127.0.0.1:4117/api/connectors/google-drive/oauth/callback
```

### 3. Data Access scopes

The shared project's Data Access list contains the scopes below. Keep its
audience External and publishing status In production while verification is
pending. App staging is separate from Google's Testing publishing status.

| Connector | Requested on Sign in in verification mode |
| --- | --- |
| Gmail | `gmail.readonly`, `gmail.compose`, `gmail.send` |
| Google Calendar | `calendar.readonly`, `userinfo.email`, `calendar.events` |
| Google Drive | `drive.readonly`, `userinfo.email` |

New accounts request supported permissions together. Existing grants are not
expanded locally: reconnect an older read-only account to authorize the full set.
Normal production startup remains read-only until the write-scope release.

### 4. Publishing status and staging accounts

Keep the existing shared project In production. Google may still show an
unverified-app warning and enforce its unverified user cap. Record only with
controlled staging accounts after the owner reviews the demo plan.

For a separate project deliberately left in External/Testing, add each test
account to Test users. Testing can cause access-denied errors for unlisted users
and seven-day authorization expiry for these scopes. Do not switch the shared
production project to Testing as a way to stage the app.

### 5. Restart Springroll

Repo-root `.env`:

```dotenv
SPRINGROLL_GOOGLE_OAUTH_CLIENT_ID=....apps.googleusercontent.com
SPRINGROLL_GOOGLE_OAUTH_CLIENT_SECRET=...
```

`dev:app` loads `../.env`. Restart after changing the file. Use both values from
Google's downloaded Desktop credential. Desktop apps cannot keep the secret
confidential, but Google's token endpoint still requires it. Gmail, Calendar,
and Drive should leave Coming soon and show Sign in. A packaged Springroll
release should provide both application-owned values so an end user only sees
the Sign in action.

A public/production Google project still needs Google's restricted-scope
verification before anyone outside the test-user list can connect Gmail.

## Slack

Slack's MCP server (`https://mcp.slack.com/mcp`) does **not** support dynamic
client registration. Springroll must be a Slack app with a fixed client ID,
but Slack now supports PKCE for public desktop clients so the packaged app does
not need a client secret or hosted OAuth broker.

Until the app exists, Slack stays Coming soon.

### Create the Slack app

1. Create an **internal** Slack app at [api.slack.com/apps](https://api.slack.com/apps)
   for dogfooding. Enable the Slack MCP Server feature under **Agents**. Slack
   MCP allows internal or Marketplace-published apps; unlisted distributed apps
   are not accepted.
2. Under **OAuth & Permissions**, enable **PKCE**. This permanently marks the
   app as a public client. Slack MCP uses user tokens, and desktop redirects
   cannot request bot scopes.
3. Redirect URL:

   ```text
   http://localhost:4117/api/connectors/slack/oauth/callback
   ```

4. Under **User Token Scopes**, add the scopes Springroll currently requests
   (do not add them as bot scopes):

   ```text
   channels:history
   channels:read
   files:read
   groups:history
   groups:read
   im:history
   im:read
   mpim:history
   mpim:read
   search:read.files
   search:read.im
   search:read.mpim
   search:read.private
   search:read.public
   search:read.users
   users:read
   users:read.email
   ```

   Keep this list aligned with Slack's current
   [MCP authentication guidance](https://docs.slack.dev/ai/slack-mcp-server/).
5. Install the app to the dogfood workspace. Workspace admins may still have to
   approve the MCP client.
6. Put the public client ID in `.env` and restart:

   ```dotenv
   SPRINGROLL_SLACK_OAUTH_CLIENT_ID=...
   ```

Sign in with Slack should then appear in the one-click row. Live consent still
needs a real Slack workspace and that app. Springroll uses PKCE for the initial
exchange and Slack's public-client refresh flow, neither of which sends a
client secret. Before public release, publish the app in the Slack Marketplace
so people can connect workspaces other than the internal dogfood workspace.

## Microsoft 365 (one Entra app)

Outlook, OneDrive, Microsoft Teams, and SharePoint already use native Microsoft
Graph adapters. They become one-click when one Entra ID public desktop app is
configured. End users only see Sign in with Microsoft; they never create an app
or paste a token.

### 1. Register the app

In Microsoft Entra admin center → App registrations:

1. Create one app named Springroll.
2. Choose supported account types to match dogfood. `common` in Springroll
   supports personal plus work/school accounts; a tenant ID restricts sign-in.
3. Authentication → Add platform → **Mobile and desktop applications**, then
   add these custom local callbacks. Register them without a port; Microsoft
   accepts Springroll's runtime loopback port:

   ```text
   http://localhost/api/connectors/outlook/oauth/callback
   http://localhost/api/connectors/onedrive/oauth/callback
   http://localhost/api/connectors/microsoft-teams/oauth/callback
   http://localhost/api/connectors/sharepoint/oauth/callback
   ```

4. Under Advanced settings, set **Allow public client flows** to **Yes**. Do
   not create a client secret; Springroll uses authorization code + PKCE.

### 2. Add delegated Microsoft Graph permissions

Springroll requests the read set on first sign-in and the write set only when
the user chooses Add on that account's permission card.

| Connector | First sign-in | Optional write upgrade |
| --- | --- | --- |
| Outlook | `User.Read`, `Mail.Read`, `Calendars.Read`, `offline_access` | `Mail.Send`, `Calendars.ReadWrite` |
| OneDrive | `User.Read`, `Files.Read`, `offline_access` | `Files.ReadWrite` |
| Teams | `User.Read`, `Chat.Read`, `offline_access` | Channel reading: `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All`; sending: `ChatMessage.Send`, `ChannelMessage.Send` |
| SharePoint | `User.Read`, `Sites.Read.All`, `offline_access` | `Sites.ReadWrite.All` |

Teams and SharePoint require a work or school account for organization data.
Some tenants disable user consent or require an administrator to approve the
broader Teams permissions; that is a tenant policy, not another Springroll
setup step.

### 3. Configure Springroll

Repo-root `.env`:

```dotenv
SPRINGROLL_MICROSOFT_OAUTH_CLIENT_ID=your-application-client-id
# Optional; defaults to common
SPRINGROLL_MICROSOFT_OAUTH_TENANT=common
```

Restart Springroll. All four cards should leave Coming soon and show Sign in.
The tenant variable can be omitted for `common`. Use a tenant ID when the app is
single-tenant.

## Salesforce (not ready)

Salesforce still needs:

1. Connected App with OAuth, PKCE, and refresh tokens.
2. Callback per connector.
3. Instance URL handling — Salesforce tokens are org-specific, so the native
   adapter cannot use a single hardcoded REST host the way Gmail can.

Do not create this app until the native adapter lands; unused redirect URIs
just rot.

## What you should do now

1. In the existing Google Cloud project, enable Calendar API and Drive API,
   create a Desktop app OAuth client, and add the Calendar/Drive scopes plus
   `userinfo.email` to Data Access.
2. Add every Google account you will test as a test user (this unblocks Gmail
   too).
3. Restart Springroll and click Sign in on Gmail, Calendar, and Drive.
4. Optionally create the internal Slack app and set `SPRINGROLL_SLACK_OAUTH_*`.
5. Create one Entra app, add its four callbacks, set
   `SPRINGROLL_MICROSOFT_OAUTH_*`, and click through Outlook, OneDrive, Teams,
   and SharePoint.
6. Click through GitHub, Linear, Notion, Jira, Stripe, or Neon whenever you
   want to dogfood a catalog MCP provider — no extra Cloud setup.


### Google permissions

Normal setup exposes the submitted Gmail sending/draft and Calendar event-management
permissions. Existing read-only accounts must reconnect and consent before using
those tools. Drive remains read-only. The former write-staging flag and bundle
marker no longer control available tools. Removing that gate does not represent
Google verification approval or change AI data-policy controls.
