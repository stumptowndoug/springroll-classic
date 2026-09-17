<p align="center">
  <img src="./logo.svg" width="96" alt="Springroll logo">
</p>

<h1 align="center">Springroll</h1>
<p align="center"><strong>A little less on your to-do list.</strong></p>
<p align="center">Schedule AI tasks with the models and tools you choose.</p>
<p align="center">
  <a href="https://tryspringroll.com/">Website</a> ·
  <a href="https://github.com/stumptowndoug/springroll/releases">Releases</a> ·
  <a href="docs/README.md">Documentation</a>
</p>

Springroll is a free, open source Mac app for recurring AI work. Describe a job
in plain language, connect the tools it needs, and save it as a **recipe**.
Run it now or on a schedule, then read the result in your Springroll inbox.

Use it for a morning briefing, a weekly business report, or a recurring research
question—without building a script for each one.

> **Public beta:** [Download v0.1.5 for Apple silicon Macs](https://github.com/stumptowndoug/springroll/releases/download/v0.1.5/Springroll-0.1.5-arm64.dmg).
> The app is signed and notarized. See [launch readiness](docs/launch-readiness.md)
> for known limitations and ongoing follow-ups.

## What you can do

- **Describe the work.** “Every Monday, pull last week's API usage and summarize
  the trend.” Springroll helps turn the request into a recipe you can review.
- **Bring your models and tools.** Choose a model provider, connect your everyday
  apps or database, or add a reviewed MCP server or HTTP API integration.
- **Get a useful report.** Results come back as readable Markdown, with tables,
  source links, and charts when they help explain the answer.
- **See the work behind the answer.** Inspect tool calls, execution history,
  token usage, and available cost information in Inbox.
- **Make it yours.** Edit recipes, pause schedules, choose light/dark/glass themes,
  and adjust the text size.

A recipe runs on your Mac. Springroll must be running and the Mac available;
it does not currently wake a sleeping computer to execute a job.

## Try the Mac app

Download the [Apple silicon DMG](https://github.com/stumptowndoug/springroll/releases/download/v0.1.5/Springroll-0.1.5-arm64.dmg),
open it, and drag **Springroll** onto **Applications** in the installer window.
Eject the disk image, then open Springroll from Applications. A ZIP is also
available on [GitHub Releases](https://github.com/stumptowndoug/springroll/releases/tag/v0.1.5).

1. Open Settings, connect a model provider, and choose a default model.
2. Configure Web researcher or connect the services your recipe needs.
3. Try the included **Morning Brief** example: three recent technology/science
   stories with summaries and sources. It starts paused and runs only when asked.
4. Review the result, edit the recipe to suit your interests, and enable its
   schedule when you are ready.

Initial updates are manual: quit Springroll and replace the app in Applications.
Your release settings and recipes live outside the app bundle. Development and
release apps use separate workspaces. See [beta instructions](docs/friends-beta.md).

## Models and integrations

Model API connections include OpenRouter, OpenAI, Anthropic, Google AI, xAI, and
Groq. Claude and Codex subscription connections are experimental. Provider
accounts, usage charges, and provider limits are your own. Springroll reuses a
compatible Codex or Claude CLI if installed; otherwise Settings offers a one-time
support download before sign-in. API-key users do not need those downloads.

Built-in connector support includes Google Workspace, Microsoft 365, Slack, and
Neon. Availability depends on the provider registration and your account's consent
policies. Google data-access verification is incomplete; work accounts may need
administrator approval. GitHub one-click is unavailable pending its OAuth app
setup, and SharePoint is excluded from the one-click row.

For other systems, Springroll can research and propose local/remote MCP and
HTTP API connections for you to review. Connecting a local MCP package can run
third-party code on your Mac; review the package and access before approving it.
See [integration runtime](docs/integration-runtime.md) and
[OAuth setup status](docs/oauth-setup-status.md).

## Your data and costs

Recipes, chats, reports, and schedules are stored locally. Integration credentials
and model API keys use macOS Keychain. Subscription sign-ins are managed by their
provider runtimes in separate Springroll directories.

**Local storage does not mean offline processing.** Prompts and relevant connected
content can be sent to the model and integration providers you choose. There is
no Springroll cloud account, sync service, or hosted scheduler today.

Springroll records provider-reported or estimated costs when available. Optional
run limits are safeguards, not a replacement for provider-side spending limits;
requests already in flight can exceed a configured cost target. Subscription
runtime limits differ from metered API calls.

Read [security and data flow](docs/security-and-data.md), the
[privacy policy](https://tryspringroll.com/privacy), and
[terms](https://tryspringroll.com/terms) before connecting accounts.
Report suspected vulnerabilities privately through [SECURITY.md](SECURITY.md).

## Develop Springroll

Use macOS and **Bun 1.4.2** (the version pinned in `package.json`). Native desktop
builds additionally require Rust/Cargo and Xcode tooling.

```sh
git clone https://github.com/stumptowndoug/springroll.git
cd springroll
bun install --frozen-lockfile
bun run dev:app
```

Open the loopback URL printed by the server, normally
[127.0.0.1:4117](http://127.0.0.1:4117). No `.env` is required just to start;
provider credentials and application-owned OAuth configuration are separate setup.

| Command | Purpose |
| --- | --- |
| `bun run dev:app` | Browser development; server code restarts on changes |
| `bun run build` | Rebuild the browser UI; refresh the page afterward |
| `bun run dev:mac` | Rebuild and open the unsigned native development app |
| `bun run check` | Lint, typecheck, and tests |
| `bun run release:mac` | Build, sign, and notarize a Mac candidate with private release configuration |

`dev:mac` currently rebuilds the package; it is not a native hot-reload command.
Use [desktop setup](desktop/README.md) for requirements, workspace locations,
and [release instructions](docs/releasing.md) for distribution.

| Directory | Responsibility |
| --- | --- |
| `app/` | React interface, local HTTP API, and integration setup |
| `kernel/` | Agent execution, tools, scheduling, credentials, and persistence |
| `desktop/` | Native Mac shell, icons, development and release packaging |
| `cli/` | Development command-line interface |
| `drizzle/` | Database migrations; required for existing user data |
| `spikes/` | Isolated Rivet recovery experiments and tests |
| `docs/` | User, contributor, architecture, and release documentation |

See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute and [TODO.md](TODO.md) for the
active board. The app is experimental and assumes a trusted user on their own Mac;
it is not an internet-facing or multi-user service.

## License

MIT. See [LICENSE](LICENSE).
