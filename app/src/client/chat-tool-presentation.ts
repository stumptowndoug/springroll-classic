import {
  toolPartName,
  toolPartOutput,
} from "@springroll/kernel/tool-part-result";
import { summarizeToolOutput } from "@springroll/kernel/tool-result-summary";
import type {
  IntegrationProposalOutcomeDto,
  IntegrationVariantDto,
} from "../shared.ts";

/** Use the SDK's actual tool name while preserving stored parts and call IDs. */
function normalizedToolType(part: {
  readonly type: string;
  readonly toolName?: unknown;
}): string {
  const name = toolPartName(part);
  return name ? `tool-${name}` : part.type;
}

export interface ChatToolPresentation {
  readonly label: string;
  readonly detail?: string;
}

export interface ChatToolResultSummary {
  readonly text: string;
  readonly tone: "neutral" | "danger";
}

/** Only persisted recipe results can produce a navigation receipt. */
export function savedRecipeFromToolPart(part: {
  readonly type: string;
  readonly [key: string]: unknown;
}):
  | { readonly label: string; readonly name: string; readonly href: string }
  | undefined {
  const type = normalizedToolType(part);
  if (
    (type !== "tool-create_task" && type !== "tool-update_task") ||
    part.state !== "output-available"
  )
    return undefined;
  const task = asRecord(toolPartOutput(part.output));
  if (
    task?.error ||
    task?.isError === true ||
    typeof task?.id !== "string" ||
    !task.id.trim() ||
    typeof task.name !== "string" ||
    !task.name.trim() ||
    typeof task.enabled !== "boolean"
  )
    return undefined;
  return {
    label: type === "tool-create_task" ? "Recipe created" : "Recipe updated",
    name: task.name,
    href: `/recipes/${encodeURIComponent(task.id)}`,
  };
}

export interface ChatToolValidationIssue {
  readonly path: string;
  readonly message: string;
}

export function connectorProposalValidationIssuesFromToolPart(part: {
  readonly type: string;
  readonly [key: string]: unknown;
}): readonly ChatToolValidationIssue[] | undefined {
  const type = normalizedToolType(part);
  if (
    type !== "tool-propose_connection" &&
    type !== "tool-propose_local_mcp" &&
    type !== "tool-propose_openapi_connection"
  ) {
    return undefined;
  }
  const output = asRecord(toolPartOutput(part.output));
  if (output?.status !== "invalid_input" || !Array.isArray(output.issues)) {
    return undefined;
  }
  const issues = output.issues.flatMap((value) => {
    const issue = asRecord(value);
    return typeof issue?.path === "string" && typeof issue.message === "string"
      ? [{ path: issue.path, message: issue.message }]
      : [];
  });
  return issues.length ? issues : undefined;
}

export interface ToolApprovalRiskPresentation {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly approveLabel: string;
  readonly className: "write" | "destructive";
}

export function toolApprovalRiskPresentation(
  effect: "write" | "destructive",
): ToolApprovalRiskPresentation {
  return effect === "destructive"
    ? {
        eyebrow: "Destructive approval required",
        title: "This action may be irreversible",
        description:
          "This connector call may delete data or cause an irreversible external change. Review the exact call before allowing it to run.",
        approveLabel: "Approve destructive action",
        className: "destructive",
      }
    : {
        eyebrow: "Write approval required",
        title: "This action changes external data",
        description:
          "This connector call can create or modify external data. Review the exact call before allowing it to run.",
        approveLabel: "Approve and run",
        className: "write",
      };
}

export function connectionResearchOutcomeFromToolPart(part: {
  readonly type: string;
  readonly [key: string]: unknown;
}): IntegrationProposalOutcomeDto | undefined {
  if (
    ![
      "research_connection",
      "propose_connection",
      "propose_local_mcp",
      "propose_openapi_connection",
    ].includes(toolPartName(part) ?? "") ||
    part.state !== "output-available"
  ) {
    return undefined;
  }
  return parseIntegrationOutcome(toolPartOutput(part.output));
}

export function visibleConnectionResearchOutcomeFromToolPart(
  part: { readonly type: string; readonly [key: string]: unknown },
  messageParts: readonly {
    readonly type: string;
    readonly [key: string]: unknown;
  }[],
  pending: boolean,
): IntegrationProposalOutcomeDto | undefined {
  const outcome = connectionResearchOutcomeFromToolPart(part);
  if (!outcome) return undefined;
  if (outcome.status === "ready") {
    const partIndex = messageParts.lastIndexOf(part);
    const signature = JSON.stringify(outcome.proposal);
    const hasLaterDuplicate = messageParts.some((candidate, index) => {
      if (index <= partIndex) return false;
      const later = connectionResearchOutcomeFromToolPart(candidate);
      return (
        later?.status === "ready" &&
        JSON.stringify(later.proposal) === signature
      );
    });
    return hasLaterDuplicate ? undefined : outcome;
  }
  // Discovery misses and unverified candidates are work-trace progress, not
  // requests for user input. Only an explicit blocker belongs in the thread;
  // the assistant can ask a contextual question after researching alternatives.
  if (outcome.status === "candidate" || !outcome.userAction) return undefined;
  if (pending) return undefined;
  const partIndex = messageParts.lastIndexOf(part);
  const hasLaterResearchOutcome = messageParts.some(
    (candidate, index) =>
      index > partIndex && connectionResearchOutcomeFromToolPart(candidate),
  );
  return hasLaterResearchOutcome ? undefined : outcome;
}

export function describeChatToolPart(part: {
  readonly type: string;
  readonly [key: string]: unknown;
}): ChatToolPresentation {
  const type = normalizedToolType(part);
  const input = asRecord(part.input);
  if (type === "tool-list_connections") {
    return { label: "Inspect connections" };
  }
  if (type === "tool-list_approvals") {
    return withDetail("Inspect approvals", detailFromInput(input));
  }
  if (type === "tool-get_usage") {
    return withDetail("Inspect usage", detailFromInput(input));
  }
  if (type === "tool-get_application_state") {
    return { label: "Inspect application state" };
  }
  if (type === "tool-research_connection") {
    return withDetail("Research connection", detailFromInput(input));
  }
  if (type === "tool-inspect_connector_source") {
    return withDetail("Inspect official source", detailFromInput(input));
  }
  if (type === "tool-propose_connection") {
    return withDetail(
      connectorProposalValidationIssuesFromToolPart(part)
        ? "Correct connection proposal"
        : "Verify connection",
      detailFromInput(input),
    );
  }
  if (type === "tool-propose_local_mcp") {
    return withDetail(
      connectorProposalValidationIssuesFromToolPart(part)
        ? "Correct local MCP proposal"
        : "Verify local MCP package",
      detailFromInput(input),
    );
  }
  if (type === "tool-propose_openapi_connection") {
    return withDetail(
      connectorProposalValidationIssuesFromToolPart(part)
        ? "Correct API proposal"
        : "Verify official API",
      detailFromInput(input),
    );
  }
  if (type === "tool-discover_openapi") {
    return withDetail("Discover official API", detailFromInput(input));
  }
  if (type === "tool-create_task") {
    return withDetail("Create recipe", detailFromInput(input));
  }
  if (type === "tool-update_task") {
    return withDetail("Update recipe", detailFromInput(input));
  }
  if (type === "tool-repair_task_tools") {
    return withDetail("Repair recipe tools", detailFromInput(input));
  }
  if (type === "tool-run_task_now") {
    return withDetail("Run recipe", detailFromInput(input));
  }
  if (type === "tool-pause_task") {
    return withDetail("Pause recipe", detailFromInput(input));
  }
  if (type === "tool-resume_task") {
    return withDetail("Resume recipe", detailFromInput(input));
  }
  if (type === "tool-delete_task") {
    return withDetail("Delete recipe", detailFromInput(input));
  }
  if (type === "tool-reconnect_connection") {
    return withDetail(
      "Reconnect connection",
      typeof input?.connectionId === "string"
        ? input.connectionId
        : detailFromInput(input),
    );
  }
  if (type === "tool-disconnect_connection") {
    return withDetail(
      "Disconnect connection",
      typeof input?.connectionId === "string"
        ? input.connectionId
        : detailFromInput(input),
    );
  }
  if (type === "tool-remove_connection") {
    return withDetail(
      "Remove connection",
      typeof input?.connectionId === "string"
        ? input.connectionId
        : detailFromInput(input),
    );
  }
  if (type === "tool-search_connection_tools") {
    return withDetail("Search connection tools", detailFromInput(input));
  }
  if (type === "tool-describe_connection_tools") {
    return withDetail(
      `${humanize(input?.connectionId) || "Connection"} · Inspect tools`,
      detailFromInput(input),
    );
  }
  if (type === "tool-activate_connection_tools") {
    return withDetail(
      `${humanize(input?.connectionId) || "Connection"} · Activate tools`,
      detailFromInput(input),
    );
  }
  if (type === "tool-search_web") {
    return withDetail("Search web", detailFromInput(input));
  }
  if (type === "tool-fetch_public_url") {
    const host = hostFromInput(input);
    return withDetail(
      host ? `Read ${host}` : "Read page",
      pageDetailFromInput(input),
    );
  }
  if (type === "tool-call_read_connection_tool") {
    const toolInput = asRecord(input?.input);
    return withDetail(
      `${humanize(input?.connectionId) || "Connection"} · ${humanize(input?.toolName) || "Read tool"}`,
      detailFromInput(toolInput),
    );
  }
  if (type === "tool-call_connection_tool") {
    const toolInput = asRecord(input?.input);
    return withDetail(
      `${humanize(input?.connectionId) || "Connection"} · ${humanize(input?.toolName) || "Change data"}`,
      detailFromInput(toolInput),
    );
  }
  if (type === "tool-call_checked_connection_tool") {
    const toolInput = asRecord(input?.input);
    return withDetail(
      `${humanize(input?.connectionId) || "Connection"} · ${humanize(input?.toolName) || "Checked tool"}`,
      detailFromInput(toolInput),
    );
  }
  return withDetail(
    humanize(type.replace(/^tool-/, "")) || "Tool",
    detailFromInput(input),
  );
}

/**
 * Scheduled runs call pinned tools by their real names (`run_sql`,
 * `search_web`), not the chat wrappers. Reuse the chat labels when the
 * name is an app tool; otherwise `{Source} · {Tool}`.
 */
export function describeRunToolCall(input: {
  readonly toolName?: string;
  readonly sourceId?: string;
  readonly input?: unknown;
}): ChatToolPresentation {
  const toolName = input.toolName?.trim();
  if (!toolName) return { label: "Calling a tool" };
  if (toolName === "update_task_notes") return { label: "Save recipe notes" };
  const described = describeChatToolPart({
    type: `tool-${toolName}`,
    input: input.input,
  });
  const generic = described.label === (humanize(toolName) || "Tool");
  if (!generic) return described;
  const source = displaySource(input.sourceId);
  return withDetail(
    source ? `${source} · ${described.label}` : described.label,
    described.detail ??
      detailFromInput(asRecord(input.input)) ??
      detailFromInput(asRecord(asRecord(input.input)?.input)),
  );
}

/** Narrated status-line verb for a run tool, matching chat. */
export function runToolProgressLabel(input: {
  readonly toolName?: string;
  readonly sourceId?: string;
  readonly label?: string;
  readonly input?: unknown;
}): string {
  const toolName = input.toolName?.trim();
  if (toolName === "update_task_notes") return "Saving recipe notes";
  if (toolName) {
    const progress = chatToolProgressLabel({
      type: `tool-${toolName}`,
      input: input.input,
    });
    const generic = progress === (humanize(toolName) || "Working");
    if (!generic) return progress;
    const source =
      displaySource(input.sourceId) ?? sourceFromLabel(input.label);
    return source ? `Querying ${source}` : progress;
  }
  return progressFromRunLabel(input.label) ?? "Working";
}

function displaySource(sourceId: string | undefined): string | undefined {
  if (!sourceId || looksLikeOpaqueId(sourceId)) return undefined;
  return humanize(sourceId) || undefined;
}

function looksLikeOpaqueId(value: string): boolean {
  return (
    /^[0-9a-f]{8}-/i.test(value) || (value.length > 24 && !/[._-]/.test(value))
  );
}

function sourceFromLabel(label: string | undefined): string | undefined {
  if (!label?.includes(" · ")) return undefined;
  const source = label.split(" · ")[0]?.trim();
  return source || undefined;
}

function progressFromRunLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const lower = label.toLowerCase();
  if (lower.startsWith("search web")) return "Searching the web";
  if (lower.startsWith("read ")) return `Reading ${label.slice(5)}`;
  if (lower.includes("notes")) return "Saving recipe notes";
  const source = sourceFromLabel(label);
  if (source) return `Querying ${source}`;
  if (lower.startsWith("using ")) return label.slice(6);
  return label;
}

function withDetail(
  label: string,
  detail: string | undefined,
): ChatToolPresentation {
  return detail ? { label, detail } : { label };
}

/**
 * The single narrated line shown while a turn runs. It speaks product
 * language ("Querying Neon", "Reading neon.tech") rather than tool ids,
 * because it is the only progress signal the transcript carries.
 */
export function chatToolProgressLabel(part: {
  readonly type: string;
  readonly [key: string]: unknown;
}): string {
  const type = normalizedToolType(part);
  const input = asRecord(part.input);
  const connection = humanize(input?.connectionId);
  switch (type) {
    case "tool-list_connections":
      return "Checking connections";
    case "tool-list_approvals":
      return "Checking approvals";
    case "tool-get_usage":
      return "Checking usage";
    case "tool-get_application_state":
      return "Checking the app";
    case "tool-list_tasks":
      return "Checking recipes";
    case "tool-get_task":
      return "Reading the recipe";
    case "tool-list_runs":
      return "Checking runs";
    case "tool-get_run":
      return "Reading the run";
    case "tool-research_connection":
      return "Researching the integration";
    case "tool-inspect_connector_source":
    case "tool-fetch_public_url": {
      const host = hostFromInput(input);
      return host ? `Reading ${host}` : "Reading the page";
    }
    case "tool-search_web":
      return "Searching the web";
    case "tool-discover_openapi":
      return "Discovering the API";
    case "tool-propose_connection":
    case "tool-propose_local_mcp":
    case "tool-propose_openapi_connection":
      return "Verifying the integration";
    case "tool-create_task":
      return "Creating the recipe";
    case "tool-update_task":
      return "Updating the recipe";
    case "tool-update_task_notes":
      return "Saving recipe notes";
    case "tool-repair_task_tools":
      return "Repairing recipe tools";
    case "tool-run_task_now":
      return "Running the recipe";
    case "tool-pause_task":
      return "Pausing the recipe";
    case "tool-resume_task":
      return "Resuming the recipe";
    case "tool-delete_task":
      return "Deleting the recipe";
    case "tool-reconnect_connection":
      return "Reconnecting";
    case "tool-disconnect_connection":
      return "Disconnecting";
    case "tool-remove_connection":
      return "Removing the connection";
    case "tool-search_connection_tools":
      return "Searching tools";
    case "tool-describe_connection_tools":
      return connection ? `Inspecting ${connection} tools` : "Inspecting tools";
    case "tool-activate_connection_tools":
      return connection ? `Activating ${connection} tools` : "Activating tools";
    case "tool-call_read_connection_tool":
      return connection ? `Querying ${connection}` : "Querying the connection";
    case "tool-call_connection_tool":
    case "tool-call_checked_connection_tool":
      return connection ? `Calling ${connection}` : "Calling the connection";
    default:
      return humanize(type.replace(/^tool-/, "")) || "Working";
  }
}

/**
 * What the call returned, not that it returned. The dot already carries
 * success or failure, so this reports rows, results, size, or the real
 * error text.
 */
export function chatToolResultSummary(part: {
  readonly type: string;
  readonly [key: string]: unknown;
}): ChatToolResultSummary | undefined {
  const state = typeof part.state === "string" ? part.state : "";
  if (state.includes("error")) {
    const text =
      typeof part.errorText === "string" && part.errorText.trim()
        ? clamp(part.errorText.trim().replace(/\s+/g, " "), 240)
        : "failed";
    return { text, tone: "danger" };
  }
  if (connectorProposalValidationIssuesFromToolPart(part)) {
    return { text: "needs correction", tone: "danger" };
  }
  if (state === "approval-requested") {
    return { text: "waiting for you", tone: "neutral" };
  }
  const output = part.output;
  if (output === undefined || output === null) return undefined;
  const record = asRecord(output);
  const notice = asRecord(
    (asRecord(record?.structuredContent) ?? record)?.googleDataAccess,
  );
  if (notice?.status === "unavailable" && typeof notice.message === "string") {
    return { text: clamp(notice.message, 240), tone: "danger" };
  }

  const text = summarizeToolOutput(output);
  return text ? { text, tone: "neutral" } : undefined;
}

/**
 * How much of a call's input the step preview carries. Long enough to read
 * a whole SQL statement or research query; the CSS line clamp decides how
 * much of it is shown before the row is opened.
 */
const DETAIL_PREVIEW_LIMIT = 2_000;

function clamp(value: string, limit: number): string {
  return value.length <= limit
    ? value
    : `${value.slice(0, limit - 1).trimEnd()}…`;
}

function hostFromInput(
  input: Record<string, unknown> | undefined,
): string | undefined {
  for (const key of ["url", "providerUrl", "specUrl"] as const) {
    const value = input?.[key];
    if (typeof value !== "string") continue;
    try {
      return new URL(value).hostname.replace(/^www\./, "");
    } catch {}
  }
  return undefined;
}

function pageDetailFromInput(
  input: Record<string, unknown> | undefined,
): string | undefined {
  const focus = input?.focus;
  if (typeof focus === "string" && focus.trim()) {
    return clamp(focus.trim().replace(/\s+/g, " "), DETAIL_PREVIEW_LIMIT);
  }
  const url = input?.url;
  if (typeof url !== "string") return detailFromInput(input);
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    return path === "/" ? undefined : clamp(path, DETAIL_PREVIEW_LIMIT);
  } catch {
    return detailFromInput(input);
  }
}

function detailFromInput(input: Record<string, unknown> | undefined) {
  if (!input) return undefined;
  for (const key of [
    "intent",
    "request",
    "packageName",
    "name",
    "query",
    "sql",
    "url",
    "providerUrl",
    "status",
    "contextKind",
    "taskId",
    "runId",
  ] as const) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return clamp(value.trim().replace(/\s+/g, " "), DETAIL_PREVIEW_LIMIT);
    }
  }
  return undefined;
}

function humanize(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.replaceAll(/[-_]+/g, " ").trim();
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word.toLocaleLowerCase(),
    )
    .join(" ");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isTrustedGithubLogoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      [
        "avatars.githubusercontent.com",
        "opengraph.githubassets.com",
        "raw.githubusercontent.com",
      ].includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function parseIntegrationOutcome(
  value: unknown,
): IntegrationProposalOutcomeDto | undefined {
  const outcome = asRecord(value);
  if (!outcome || typeof outcome.status !== "string") return undefined;
  if (outcome.status === "candidate") {
    const candidate = asRecord(outcome.candidate);
    const logo = asRecord(candidate?.logo);
    const validLogo =
      candidate?.logo === undefined ||
      (typeof logo?.url === "string" &&
        isTrustedGithubLogoUrl(logo.url) &&
        (logo.source === "github-registry" ||
          logo.source === "github-repository") &&
        (logo.kind === "preferred" ||
          logo.kind === "owner-avatar" ||
          logo.kind === "opengraph" ||
          logo.kind === "asset") &&
        (logo.format === "svg" || logo.format === "raster"));
    return typeof outcome.title === "string" &&
      typeof outcome.explanation === "string" &&
      typeof outcome.instruction === "string" &&
      validLogo &&
      candidate?.kind === "local-mcp" &&
      typeof candidate.name === "string" &&
      typeof candidate.operator === "string" &&
      typeof candidate.description === "string" &&
      typeof candidate.packageName === "string" &&
      typeof candidate.repositoryUrl === "string" &&
      typeof candidate.registryUrl === "string" &&
      typeof candidate.credentialRequired === "boolean"
      ? {
          status: "candidate",
          title: outcome.title,
          explanation: outcome.explanation,
          instruction: outcome.instruction,
          candidate: {
            kind: "local-mcp",
            name: candidate.name,
            operator: candidate.operator,
            description: candidate.description,
            packageName: candidate.packageName,
            repositoryUrl: candidate.repositoryUrl,
            registryUrl: candidate.registryUrl,
            credentialRequired: candidate.credentialRequired,
            ...(logo
              ? {
                  logo: {
                    url: logo.url as string,
                    source: logo.source as
                      | "github-registry"
                      | "github-repository",
                    kind: logo.kind as
                      | "preferred"
                      | "owner-avatar"
                      | "opengraph"
                      | "asset",
                    format: logo.format as "svg" | "raster",
                  },
                }
              : {}),
          },
        }
      : undefined;
  }
  if (outcome.status === "unavailable" || outcome.status === "not_found") {
    return typeof outcome.title === "string" &&
      typeof outcome.explanation === "string"
      ? {
          status: outcome.status,
          title: outcome.title,
          explanation: outcome.explanation,
          ...(outcome.userAction === "none" ||
          outcome.userAction === "provide_source" ||
          outcome.userAction === "retry"
            ? { userAction: outcome.userAction }
            : {}),
        }
      : undefined;
  }
  if (outcome.status !== "ready") return undefined;
  const proposal = asRecord(outcome.proposal);
  if (
    !proposal ||
    typeof proposal.templateId !== "string" ||
    typeof proposal.name !== "string" ||
    typeof proposal.description !== "string" ||
    typeof proposal.operator !== "string" ||
    !Array.isArray(proposal.variants)
  ) {
    return undefined;
  }
  const variants: IntegrationVariantDto[] = [];
  for (const value of proposal.variants) {
    const variant = asRecord(value);
    const guidance = asRecord(variant?.guidance);
    const credentialKind = variant?.credentialKind;
    if (
      !variant ||
      typeof variant.id !== "string" ||
      typeof variant.label !== "string" ||
      typeof variant.recommended !== "boolean" ||
      (credentialKind !== "oauth" &&
        credentialKind !== "api-key" &&
        credentialKind !== "none") ||
      !guidance ||
      typeof guidance.summary !== "string" ||
      !Array.isArray(guidance.steps) ||
      !guidance.steps.every((step) => typeof step === "string") ||
      typeof guidance.docsUrl !== "string"
    ) {
      return undefined;
    }
    variants.push({
      id: variant.id,
      label: variant.label,
      recommended: variant.recommended,
      credentialKind,
      guidance: {
        summary: guidance.summary,
        steps: guidance.steps,
        docsUrl: guidance.docsUrl,
      },
    });
  }
  if (variants.length === 0) return undefined;
  const sources = Array.isArray(proposal.sources)
    ? proposal.sources.flatMap((value) => {
        const source = asRecord(value);
        return source &&
          typeof source.title === "string" &&
          typeof source.url === "string"
          ? [{ title: source.title, url: source.url }]
          : [];
      })
    : undefined;
  const tools: Array<{
    name: string;
    description?: string;
    effect: "read" | "write" | "destructive";
  }> = [];
  if (Array.isArray(proposal.tools)) {
    for (const value of proposal.tools) {
      const item = asRecord(value);
      const effect = item?.effect;
      if (
        item &&
        typeof item.name === "string" &&
        (effect === "read" || effect === "write" || effect === "destructive")
      ) {
        tools.push({
          name: item.name,
          ...(typeof item.description === "string"
            ? { description: item.description }
            : {}),
          effect,
        });
      }
    }
  }
  const apiValue = asRecord(proposal.api);
  const verificationValue = asRecord(apiValue?.verification);
  const api =
    apiValue &&
    typeof apiValue.specUrl === "string" &&
    typeof apiValue.baseUrl === "string" &&
    typeof apiValue.operationCount === "number"
      ? {
          specUrl: apiValue.specUrl,
          baseUrl: apiValue.baseUrl,
          operationCount: apiValue.operationCount,
          ...(verificationValue &&
          typeof verificationValue.tool === "string" &&
          typeof verificationValue.note === "string"
            ? {
                verification: {
                  tool: verificationValue.tool,
                  note: verificationValue.note,
                },
              }
            : {}),
          ...(Array.isArray(apiValue.notes) &&
          apiValue.notes.every((note) => typeof note === "string")
            ? { notes: apiValue.notes }
            : {}),
        }
      : undefined;
  return {
    status: "ready",
    proposal: {
      templateId: proposal.templateId,
      name: proposal.name,
      description: proposal.description,
      operator: proposal.operator,
      ...(proposal.trust === "curated" ||
      proposal.trust === "registry-verified" ||
      proposal.trust === "provider-verified" ||
      proposal.trust === "package-verified" ||
      proposal.trust === "openapi-verified" ||
      proposal.trust === "user-reviewed"
        ? { trust: proposal.trust }
        : undefined),
      ...(typeof proposal.registryName === "string"
        ? { registryName: proposal.registryName }
        : undefined),
      ...(typeof proposal.registryVersion === "string"
        ? { registryVersion: proposal.registryVersion }
        : undefined),
      ...(typeof proposal.packageName === "string"
        ? { packageName: proposal.packageName }
        : undefined),
      ...(typeof proposal.packageVersion === "string"
        ? { packageVersion: proposal.packageVersion }
        : undefined),
      ...(Array.isArray(proposal.packageArgs) &&
      proposal.packageArgs.every((value) => typeof value === "string")
        ? { packageArgs: proposal.packageArgs }
        : undefined),
      ...(sources ? { sources } : undefined),
      ...(Array.isArray(proposal.tools) ? { tools } : undefined),
      ...(api ? { api } : undefined),
      variants,
    },
  };
}
