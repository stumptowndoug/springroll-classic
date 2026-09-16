# Google data and AI provider audit

**Historical audit.** The September 16 implementation supersedes the unrestricted
routing described below. See [current ZDR controls and remaining evidence](google-zdr-implementation.md).

Reviewed September 7, 2026 against the current shared-auth branch and linked
primary documentation. This is a code/policy audit, **not a compliance
certification**. No provider dashboard settings, account tiers, contracts, or
network traces from a real Google-data run have been verified. No demo was
recorded. No model account setting or Google grant was changed for this audit.

## Outcome

Do not send Google a blanket Limited Use compliance confirmation yet. The app
supports eight model connections, but currently has no enforcement that prevents
Google data or derived content reaching a training-enabled account or endpoint.
The highest-priority gaps are arbitrary OpenRouter routes, Gemini unpaid-service
terms where applicable, and unverified consumer subscription training settings.
API credentials and “Metered”/“Subscription” labels do not prove a user's tier,
training opt-out, or ZDR entitlement.

Google requires allowed use, minimum necessary access, accurate disclosures, and
Limited Use controls. Its review email specifically prohibits generalized-model
training on raw, aggregated, or derived Workspace data and asks for providers,
tiers, upstream endpoints, and routing settings. Relevant policies:
[Workspace data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)
and [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).
Restricted data sent through third-party servers can require an annual security
assessment. Remote model processing means we cannot assume the local-only
exception; applicability and cost remain to be established with Google's review.

## Observed data flow

1. Google OAuth credentials stay in the local credential store. Native HTTP tools
   fetch mail, calendar, and Drive content on the Mac.
2. Tool results enter the agent conversation. API runners send them to the chosen
   provider; Claude/Codex runners pass them to their provider-owned runtime.
3. Tool activity, reports, and chat history can retain Google content locally.
   Later model changes, report reuse, or other enabled tools can transfer raw or
   derived content to another service. There is no persistent Google-data label
   that follows this content and constrains future egress.
4. Image generation is separately selectable (OpenAI, xAI, OpenRouter). A prompt
   derived from Google data can therefore reach a second model provider.
5. The optional research distiller is another independently selected API model.
   Its current built-in scope is web research results, not direct Gmail/Drive
   tools. Google-derived queries passed to web tools can still create indirect
   exposure. Search/fetch services and user-added MCP/API tools are additional
   recipients to inventory for any Google workflow.

Evidence: `app/src/server.ts` (run/chat/image runtime selection),
`app/src/server/application.ts` (`researchDistillerRuntime`),
`kernel/src/ai-sdk-agent-runner.ts`, `kernel/src/claude-agent-runner.ts`,
`kernel/src/codex-agent-runner.ts`, and `kernel/src/research-distiller.ts`.
No self-hosted/offline model inference route was found among the eight model
connections. A locally launched CLI is still remote inference.

## Provider inventory

Endpoints below describe configured adapters, not captured production traffic.
Actual account tier and account-level settings are **unknown for every row**.
Users bring credentials; a demo account does not establish other users' settings.

| Connection | Service / main inference endpoint | Policy finding and evidence needed |
| --- | --- | --- |
| OpenAI API | Direct API; `https://api.openai.com/v1/responses`; image generation also supported | No training by default unless opted in. Confirm organization/project data sharing is off and record the actual API account. No ZDR approval verified. |
| Anthropic API | Direct API; `https://api.anthropic.com/v1/messages` | Commercial inputs/outputs not used for training by default; opt-ins and feedback matter. Verify organization/workspace and no model-improvement program enrollment. |
| Google AI | Gemini Developer API; `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent` | Paid-service terms do not use prompts/responses for product improvement. Unpaid terms permit it, with geographic exceptions. Confirm the exact API project's active billing and applicable terms; an unrelated paid Gemini subscription is not evidence. |
| xAI API | Direct API; `https://api.x.ai/v1/chat/completions`; image generation also supported | No API training without explicit permission. Standard abuse/audit retention is distinct from training. Verify no training permission and actual retention settings. |
| Groq | Hosted inference; `https://api.groq.com/openai/v1/chat/completions` | Published docs describe no inference-content retention by default, with exceptions. Verify the applicable service agreement's training limitation separately; no-retention is not itself a no-training attestation. Model authors need not be inference recipients. |
| OpenRouter | Gateway; `https://openrouter.ai/api/v1/chat/completions`; image route also supported | OpenRouter retention is opt-in, but downstream providers have their own policies. Current code does not restrict provider selection or establish the actual downstream endpoints. |
| Claude subscription | Claude Agent SDK / Claude Code with user browser sign-in; upstream networking owned by runtime | Consumer model-improvement preference can permit training; commercial terms differ. Confirm actual Free/Pro/Max/Team/Enterprise account and settings. Local SDK process is not offline inference. |
| Codex subscription | Codex app server with ChatGPT sign-in; upstream networking owned by runtime | Do not apply OpenAI API-key policy to this connection. Exact ChatGPT plan, applicable data controls, runtime destinations, and any training opt-in must be evidenced separately. |

Primary sources (each applies to its named service, not every similarly branded
subscription or upstream reseller):

- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data):
  no training by default; abuse logs and application state have distinct retention.
- [Anthropic commercial training policy](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training):
  default no training, with feedback and other opt-in exceptions.
- [Gemini API terms](https://ai.google.dev/gemini-api/terms):
  paid/unpaid data-use distinction, billing requirement, and EEA/UK/Switzerland exception.
- [xAI API security](https://docs.x.ai/developers/faq/security):
  training only with explicit permission; standard 30-day retention and ZDR controls.
- [Groq data handling](https://console.groq.com/docs/your-data) and
  [service agreement](https://console.groq.com/docs/legal/services-agreement):
  inference retention exceptions, account controls, and contractual review.
- [OpenRouter collection](https://openrouter.ai/docs/guides/privacy/data-collection),
  [upstream policies](https://openrouter.ai/docs/guides/privacy/provider-logging), and
  [routing controls](https://openrouter.ai/docs/guides/routing/provider-selection).
- [Claude Code data use](https://code.claude.com/docs/en/data-usage):
  consumer training preference, commercial defaults, feedback, and retention.
- [Codex authentication](https://learn.chatgpt.com/docs/auth):
  separate account-backed sign-in; does not establish this user's no-training settings.

## Actual controls in Springroll

| Area | Observed implementation | Consequence |
| --- | --- | --- |
| OpenRouter | API key, app name, strict SDK compatibility, usage reporting. No explicit `provider.data_collection`, `provider.zdr`, `provider.only`, or `allow_fallbacks` policy. | Cannot provide a complete finite upstream provider list or guarantee no-training routing. |
| OpenRouter built-in web tools | `webSearch({ engine: "auto" })` and web fetch bindings | Search may add another recipient; avoid assuming model provider is the only processor. |
| OpenAI Responses | No explicit store override; installed `@ai-sdk/openai` adapter uses `store: openaiOptions?.store ?? true`. | Response storage is enabled by default. `store: false` would reduce application-state retention, not disable training opt-ins or establish ZDR. |
| Anthropic | Optional `anthropic-workspace-id`; no account policy verification | Workspace header selects billing/context, not a training prohibition. |
| Gemini, Groq, xAI | API-key validation / model lookup; no tier or training-settings gate | A valid key is not a compliance check. |
| Claude/Codex | Isolated local configuration; restricted local tools; Codex ephemeral thread | These controls do not verify upstream training settings or make processing offline. |
| Persisted/derived content | Local history and reusable outputs; no Google provenance enforcement | Restricting only the initial Google tool call would leave later transfers uncontrolled. |

Code anchors: `kernel/src/model-connections/{openai,openrouter,standard,xai}.ts`;
`kernel/node_modules/@ai-sdk/openai/src/responses/openai-responses-language-model.ts`;
`kernel/src/{claude,codex}-agent-runner.ts`.
No API fine-tuning or generalized-model training implementation was found in the
model connection/runners reviewed. This does not prove downstream services never
train on submitted content.

## OpenRouter upstream inventory gap

The catalog permits multiple model families, including OpenAI, Anthropic, Google,
Mistral, DeepSeek, and Cohere. A model author's name is not proof of which company
hosts a request. The code does not pin downstream provider slugs, endpoint routes,
or permitted model IDs. We must not invent a static “complete provider list.”

One possible constrained OpenRouter design would restrict models and provider endpoints, use
`data_collection: "deny"`, consider `zdr: true` separately, and prevent fallback
outside the reviewed allowlist. Confirm the account's prompt/data-sharing settings
and retain content-free route evidence. OpenRouter documents `only` and fallback
controls; its policy tags are not a substitute for reviewing downstream terms.
The current audit changes do **not** implement these routing controls.

## Owner decision and verification preparation

The owner declined model/endpoint restrictions for verification. Keep user choice
and continue preparing an honest submission; address objections if Google raises
them. The controls discussed above and below are unimplemented design options,
not accepted implementation tasks or an established legal requirement for this
architecture.

Use one confirmed direct commercial API account for the first staging demo; the
OpenAI or Anthropic API is a simpler candidate than an unconstrained gateway.
Verify its account-level opt-ins first. Use synthetic mail/events/documents and
keep unrelated tools and model switching out of the demo. This makes the demo
reviewable, but does not solve the production-wide policy gap by itself.

Earlier proposed controls (not selected by the owner):

- Decide which routes may receive Google data; block unverified routes across
  chats, recipes, images, secondary summarizers, history reuse, and custom tools.
  Carry provenance or use complete isolation so changing models cannot bypass it.
- Obtain actual account tiers and settings evidence. For user-provided accounts,
  design enforceable eligibility rules rather than relying on a one-time demo.
- If keeping OpenRouter for Google data, build and test the restricted routing
  policy and enumerate its allowed endpoints and downstream processors.
- Confirm provider retention/feedback behavior and assessment requirements.
- Publish accurate disclosures and the Limited Use commitment only once the
  restrictions are implemented and substantiated. Draft copy is in
  [Google disclosure draft](google-data-disclosure-draft.md).

The checked-out website source currently describes the older “Drafts and organize” and Drive
write options and lacks the requested affirmative Limited Use statement. This
audit prepared replacement copy without publishing an unsupported certification.
