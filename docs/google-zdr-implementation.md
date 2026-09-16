# Google data protection via OpenRouter

Implementation branch: `feat/google-openrouter-zdr`, September 16, 2026.
Google's September 15 reply conditionally accepted enforced ZDR routing. This
implementation is not an approval, verification submission, or deployment.

## OpenRouter inference routing

Springroll enforces `provider.zdr: true` at the final inference HTTP boundary,
after SDK options are merged. OpenRouter maintains endpoint eligibility and routes
the user's selected model only to eligible endpoints. There is no Springroll model
or hosting-provider whitelist and no dependency on a separate inventory preflight.
ZDR applies to eligible provider/model fallbacks too; Springroll never retries with
ZDR disabled. The boundary also forces `data_collection: "deny"` and `store: false`.
Plugins and hosted web search remain blocked because the inference ZDR setting
does not cover them.

The compact Google connection detail says “OpenRouter · Zero Data Retention
enforced.” It does not list Azure, Bedrock or Vertex as required providers.

`google_data_route_audit` records the selected model and OpenRouter gateway URL for
each attempted protected inference, without prompt/response content or credentials.
It does not claim to identify the actual downstream host. Downstream-provider
inventory and actual routing evidence remain part of Google's verification package.

## Model selection feedback

Recipe model pickers use connected Google tools or the persistent protection marker;
chat pickers use the persistent marker. Incompatible choices remain visible but
cannot be selected, including an incompatible inherited default. Recipe execution
preview and explicit model updates also validate the protected provider policy.

OpenRouter availability comes from its public `/api/v1/endpoints/zdr` inventory,
cached for five minutes (failed lookups for 30 seconds). The picker has filters for
available, unavailable, and unknown routes. Missing/malformed inventory and dynamic
`openrouter/auto` routing are shown as unknown, not claimed compatible or blocked
solely due to inventory failure. Actual inference always enforces ZDR; a 404/503
response explains that the model could not be served with ZDR and asks the user to
choose another model or retry. Inventory is advisory, not proof of account-specific
availability. Non-OpenRouter Google-data routes remain disabled pending account
eligibility controls; this change does not represent direct APIs as ZDR.

Validation: full check (761 tests, four snapshots), production build, and isolated
browser interaction checks of disabled selections, inherited-default warning,
available selection, and unavailable filter. No customer Google data or paid AI
requests were used for this validation.

## Persistent isolation

`google_data_protection` records `chat:<sessionId>` and `task:<taskId>` before
Google data is read or derived recipe instructions are saved. Changing models,
restarting, disconnecting Google, editing a recipe, or clearing visible history
does not remove protection. Failed calls may conservatively protect a conversation.

- Google connector calls require a host-created eligible execution scope. Calls
  from unrestricted models and external MCP clients are rejected before the tool
  operation. Custom manifests using recognized Workspace API endpoints are also guarded;
  Google AI endpoints are not treated as Workspace connectors.
- Protected chats and recipes must use an OpenRouter route with enforced ZDR. Protection
  covers subsequent turns, retries, recipe history, notes and scheduled runs.
- Background titles from protected conversations use the protected runtime;
  they cannot use the independently configured research distiller.
- Google-data workflows may combine Google tools with other integrations, web
  search, and integration research. Existing per-tool permissions and approvals
  still apply; the Google-data marker is not a blanket external-tool prohibition.
  New or updated recipes inherit AI-route protection before mutation.
- Separate AI-processing routes still need the applicable data controls. Image
  generation remains unavailable for protected content because the current image
  API schema does not expose request-level ZDR. Independently configured research
  distillation remains disabled for protected content; ordinary research itself
  works without that secondary model. OpenRouter hosted plugins remain excluded
  because their data handling is outside inference ZDR coverage.
- Shared local lists can contain Google-derived account labels, recipe names,
  prompts and summaries. These reads conservatively require and persist protection
  whenever Google connections or protected content exist. Consequently, unrelated
  workspace-management requests may also require an OpenRouter model with enforced ZDR.
- Older chats and recipes have no trustworthy provenance, including after a Google
  account was removed. Migration 0035 conservatively protects **all existing chats
  and recipes**. New separate work can use other providers. This compatibility cost
  should be reviewed before release; do not silently remove protection to improve UX.
- Ordinary user exports and manual copying outside Springroll are outside this
  automatic boundary. The app does not control independent external software or
  retrospectively erase data sent by older builds.

The production server enables the source guards. The LocalApplication test/library
constructor retains an explicit enforcement option; alternate embedders must enable
it and provide the same protected runtime and registry wiring.

## Account evidence and remaining verification work

The app does not manage or attest users' OpenRouter account tiers/settings. Before
claiming verification readiness, record the actual API plan, prompt logging and
sharing settings, and downstream contractual evidence. OpenRouter allows BYOK ZDR
self-declarations; a declaration is not proof of the underlying agreement. Establish
and document how these account-specific exceptions will be excluded or verified
for the intended distribution. A key being valid is not that evidence.

Review downstream terms and the current
[ZDR documentation](https://openrouter.ai/docs/guides/features/zdr),
[routing controls](https://openrouter.ai/docs/guides/routing/provider-selection), and
[privacy policy](https://openrouter.ai/privacy/).
OpenRouter's ZDR definition allows implicit in-memory prompt caching and does not
cover plugins. Avoid claiming all processing is offline or absolutely unretained.

Before replying to Google:

1. Review the compatibility restrictions above and complete account/endpoint evidence.
2. Verify real synthetic-data Google → OpenRouter runs, including unavailable routes,
   provider switching, restarted conversations, scheduled recipes and derived titles.
3. Publish the reviewed privacy disclosure and affirmative Limited Use statement
   from `google-data-disclosure-draft.md`. Public website publication remains separate.
4. Record an updated video showing expanded consent scopes, Gmail/Calendar/Drive
   functionality, the provider list, protected routing and blocked unsupported actions.
5. Reply with the complete inventory, actual plans/settings, evidence and video.
   Scope matching and any applicable assessment remain subject to Google's review.

## Direct API provider findings

See [provider training and retention review](google-provider-data-policy.md).
ZDR and no-training are separate properties. Google's review prohibits generalized
model training; it does not categorically require every direct API to be ZDR.
The direct-provider assumption was not sufficient to enable every account: API
training opt-ins, Gemini paid-service status, and endpoint features must be handled
before expanding Google-data eligibility. Direct providers remain available for
non-Google work; this revision only removes the OpenRouter whitelist.
