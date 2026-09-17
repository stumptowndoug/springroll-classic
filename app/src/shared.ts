import type {
  ChatSessionContext,
  ChatSessionEntryMode,
  ConnectionToolPolicyMode,
  ConnectorManifest,
  RecipeKnowledgeDocument,
  RecipeKnowledgeStatus,
  RunFailureCategory,
  RunResultArtifact,
  RunResultV1,
} from "@springroll/kernel";
import type { UIMessage } from "ai";

export type { WebProviderId, WebReaderId } from "@springroll/kernel";
export interface WebResearchSettingsDto {
  readonly searchProvider: import("@springroll/kernel").WebProviderId;
  readonly readerProvider: import("@springroll/kernel").WebReaderId;
  readonly providers: readonly {
    readonly id: import("@springroll/kernel").WebProviderId;
    readonly name: string;
    readonly logoSvg?: string | undefined;
    readonly description: string;
    readonly keyCreationUrl: string;
    readonly connected: boolean;
    readonly credentialConfigured: boolean;
  }[];
}

export function recipeIsLocalOnly(
  availableIn: readonly ("local" | "hosted")[],
): boolean {
  return !availableIn.includes("hosted");
}

export function recipeHostedBlockCopy(names: readonly string[]): string {
  if (names.length === 0) {
    return "Hosted cloud runs coming soon";
  }
  if (names.length === 1) {
    return `Uses ${names[0]}, which only runs on this Mac.`;
  }
  const last = names[names.length - 1];
  return `Uses ${names.slice(0, -1).join(", ")} and ${last}, which only run on this Mac.`;
}

export function isHeadingOnlyMarkdown(markdown: string): boolean {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .every((line) => line.length === 0 || /^#{1,6}\s+\S/.test(line));
}

/** Inbox receipts and duplicate-dek checks need the words, not the markers. */
export function markdownPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The model often copies the Result paragraph into `summary`. The letter
 * already prints that paragraph in the body, so the dek should not repeat it.
 */
export function markdownSummaryDuplicatesBody(
  summary: string,
  body: string,
): boolean {
  const plainSummary = markdownPlainText(summary)
    .replace(/[.…]+$/u, "")
    .trim();
  if (plainSummary.length < 12) return false;
  const firstGraf = markdownPlainText(body.split(/\n\s*\n/)[0] ?? "");
  return firstGraf.startsWith(plainSummary);
}

export type RunStatus =
  | "claimed"
  | "running"
  | "waiting_for_approval"
  | "succeeded"
  | "failed";
export type CatchUpPolicy = "catch_up" | "skip_to_next";
export type TaskCapabilityMode = ConnectionToolPolicyMode;
export type ConnectorToolMode = ConnectionToolPolicyMode;
export const modelProviderIds = [
  "openrouter",
  "openai",
  "xai",
  "anthropic",
  "google",
  "groq",
  "claude",
  "codex",
] as const;
export type ModelProviderId = (typeof modelProviderIds)[number];

export interface ModelSelectionDto {
  readonly providerId: ModelProviderId;
  readonly modelId: string;
}

export interface ModelToolRouteDto {
  readonly capability: "web.fetch" | "web.search";
  readonly profile: "managed-auto" | "native" | "portable";
  readonly service: import("@springroll/kernel").WebReaderId | ModelProviderId;
}

export interface ModelExecutionDto extends ModelSelectionDto {
  readonly selectedBy: "automatic" | "default" | "task";
  readonly toolRoutes: readonly ModelToolRouteDto[];
}

export interface ModelOptionDto extends ModelSelectionDto {
  readonly googleDataCompatibility?: "available" | "unavailable" | "unknown";
  readonly googleDataReason?: string;
  readonly name: string;
  readonly description?: string;
  readonly contextTokens?: number;
  readonly inputUsdPerMillionTokens?: number;
  readonly outputUsdPerMillionTokens?: number;
  readonly reasoning: boolean;
  readonly toolCall: boolean;
  readonly inputModalities: readonly string[];
}

export interface ModelProviderDto {
  readonly id: ModelProviderId;
  readonly name: string;
  readonly kind: "aggregator" | "direct_api" | "subscription";
  readonly status: "connected" | "not_connected";
  readonly keyCreationUrl: string;
  readonly keyPlaceholder: string;
  readonly logoSvg?: string;
  readonly accountLabel?: string;
  readonly planLabel?: string;
}

export interface CodexLoginDto {
  readonly authUrl: string;
  readonly loginId: string;
}

export interface ClaudeLoginDto {
  readonly completed: true;
}

export interface ExecutionSettingsDto {
  /** Zero disables the recipe turn limit. */
  readonly maxSteps: number;
  readonly maxCostUsdMicros?: number;
}

export interface ModelSettingsDto {
  readonly providers: readonly ModelProviderDto[];
  readonly models: readonly ModelOptionDto[];
  readonly recipeModels: readonly ModelOptionDto[];
  readonly imageModels: readonly ModelOptionDto[];
  readonly defaultSelection?: ModelSelectionDto;
  readonly researchDistillerSelection?: ModelSelectionDto;
  readonly imageSelection?: ModelSelectionDto;
  readonly execution?: ExecutionSettingsDto;
  readonly catalogUpdatedAt?: string;
  readonly catalogStale: boolean;
}

export interface RunSummaryDto {
  readonly id: string;
  readonly taskId: string;
  readonly taskName: string;
  readonly status: RunStatus;
  readonly scheduledTime: string;
  readonly summary?: string;
  readonly error?: string;
  readonly needsAttention: boolean;
}

export interface RunDistillerUsageDto {
  readonly modelIds: readonly string[];
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly costUsdMicros?: number;
  readonly costSource?: "provider_reported" | "catalog_estimate";
}

export interface RunDetailDto extends RunSummaryDto {
  readonly body?: string;
  readonly result?: RunResultV1;
  readonly executionLocation: "local" | "hosted";
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly durationMs?: number;
  readonly modelProvider?: string;
  readonly modelId?: string;
  readonly modelBilling?: "metered" | "subscription" | "unknown";
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly cachedInputTokens?: number;
  readonly totalTokens?: number;
  readonly costUsdMicros?: number;
  readonly actualCostUsdMicros?: number;
  readonly estimatedCostUsdMicros?: number;
  readonly costSource?: "provider_reported" | "catalog_estimate";
  readonly webSearchRequests?: number;
  readonly catalogRevision?: string;
  /** Aggregate usage of the research-distiller model, kept separate from the main model's totals. */
  readonly distiller?: RunDistillerUsageDto;
  readonly toolCalls: number;
  readonly approvals: readonly ToolApprovalDto[];
  readonly requiredApprovalIds: readonly string[];
  /** A one-off run exhausted bounded retries and may be started again by the user. */
  readonly canRetry: boolean;
}

export interface RecipeConversationRunDto {
  readonly id: string;
  readonly taskId: string;
  readonly taskName: string;
  readonly status: RunStatus;
  readonly scheduledTime: string;
  readonly executionLocation: "local" | "hosted";
  readonly report?: string;
}

export interface RunStartDto {
  readonly id: string;
}

export type RunEventKind =
  | "status"
  | "model"
  | "tool"
  | "source"
  | "usage"
  | "policy"
  | "output";

export interface RunEventDto {
  readonly id: string;
  readonly sequence: number;
  readonly kind: RunEventKind;
  readonly title: string;
  readonly occurredAt: string;
  readonly detail?: string;
  readonly tone?: "neutral" | "success" | "error";
  readonly sourceUrl?: string;
  /** Present on tool-call events so the live status line can speak product language. */
  readonly toolName?: string;
  /** Present on model-turn events so run work can count model calls separately from tools. */
  readonly modelTurn?: number;
  /** Snapshotted on model selection so historical runs keep their original denominator. */
  readonly maxTurns?: number;
  /** Present on usage events so the shared turn fold can show live token totals. */
  readonly usage?: RunEventUsageDto;
}

export interface RunEventUsageDto {
  readonly operation?: "image_generation";
  readonly provider?: string;
  readonly modelId?: string;
  readonly imageCount?: number;
  readonly totalTokens?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly cachedInputTokens?: number;
  readonly webSearchRequests?: number;
  readonly providerToolCalls?: number;
  readonly costUsdMicros?: number;
  readonly costEstimated?: boolean;
  readonly subscription?: boolean;
}

export interface RunEventPageDto {
  readonly runId: string;
  readonly runStatus: RunStatus;
  readonly events: readonly RunEventDto[];
  readonly nextCursor: number;
  readonly hasMore: boolean;
}

export const starterRecipeId = "example-morning-brief-v1";

export interface TaskSummaryDto {
  readonly googleDataProtected?: boolean;
  readonly id: string;
  readonly name: string;
  /** Optional single organizing tag, e.g. "news". */
  readonly tag?: string;
  /** Complete recipe instructions in GitHub-flavored Markdown. */
  readonly prompt: string;
  readonly contract: string;
  readonly schedule: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly catchUpPolicy: CatchUpPolicy;
  readonly nextRunAt: string;
  readonly lastScheduleRecovery?: {
    readonly outcome: "caught_up" | "skipped_missed" | "skipped_active";
    readonly scheduledTime: string;
    readonly recoveredAt: string;
  };
  readonly connectionNames: readonly string[];
  /** Locations this recipe's pinned integrations can actually run. */
  readonly availableIn: readonly ("local" | "hosted")[];
  /** Integration names that keep the recipe off hosted / run-anywhere. */
  readonly hostedBlockedBy: readonly string[];
  readonly capabilities: readonly {
    readonly connectionId: string;
    readonly connectionName: string;
    readonly toolName: string;
    readonly effect: "read" | "write" | "destructive";
    readonly mode: TaskCapabilityMode;
  }[];
  /** Statuses of the most recent runs, oldest first, at most seven. */
  readonly recentRunStatuses: readonly RunStatus[];
  readonly modelOverride?: ModelSelectionDto;
  readonly imageModelOverride?: ModelSelectionDto;
}

export interface TaskRecipeKnowledgeDto {
  readonly taskId: string;
  readonly revision: number;
  readonly status: RecipeKnowledgeStatus;
  readonly knowledge: RecipeKnowledgeDocument;
  readonly sourceRunId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProposalToolDto {
  readonly name: string;
  readonly description: string;
  readonly effect: "read" | "write" | "destructive";
  readonly approval: "never" | "before_call";
}

export interface TaskProposalDto {
  readonly title: string;
  /** Complete recipe instructions in GitHub-flavored Markdown. */
  readonly prompt: string;
  readonly schedule: string;
  readonly scheduleLabel: string;
  readonly timezone: string;
  readonly connectionId: string;
  readonly connectionName: string;
  readonly toolNames: readonly string[];
  readonly tools: readonly ProposalToolDto[];
  readonly contract: string;
  readonly executionMode: "local";
  readonly catchUpPolicy: CatchUpPolicy;
  readonly modelExecution?: ModelExecutionDto;
}

export interface DegradedConnectionDto {
  readonly id: string;
  readonly name: string;
}

export type TaskProposalOutcomeDto =
  | {
      readonly status: "ready";
      readonly proposal: TaskProposalDto;
      /** Connected entries the host could not open while building this proposal. */
      readonly degradedConnections?: readonly DegradedConnectionDto[];
    }
  | {
      readonly status: "needs_integration";
      readonly title: string;
      readonly explanation: string;
      readonly missingCapability: string;
      readonly suggestedIntegration?: string;
      readonly supportedAlternative?: string;
      /** Connected entries the host could not open while building this proposal. */
      readonly degradedConnections?: readonly DegradedConnectionDto[];
      /** Degraded connection IDs structurally matched to the user's request. */
      readonly degradedConnectionIds?: readonly string[];
    }
  | {
      readonly status: "unsupported";
      readonly title: string;
      readonly explanation: string;
      readonly supportedAlternative?: string;
      /** Connected entries the host could not open while building this proposal. */
      readonly degradedConnections?: readonly DegradedConnectionDto[];
    };

export interface TaskToolRepairProposalDto {
  readonly taskId: string;
  readonly taskName: string;
  readonly changes: readonly {
    readonly connectionId: string;
    readonly connectionName: string;
    readonly sourceId: string;
    readonly toolName: string;
    readonly description: string;
    readonly previousInputSchemaHash: string;
    readonly proposedInputSchemaHash: string;
    readonly inputSchema: Readonly<Record<string, unknown>>;
    readonly previousRisk: {
      readonly effect: "read" | "write" | "destructive";
      readonly openWorld: boolean;
      readonly idempotent: boolean;
    };
    readonly proposedRisk: {
      readonly effect: "read" | "write" | "destructive";
      readonly openWorld: boolean;
      readonly idempotent: boolean;
    };
  }[];
}

export type TaskToolRepairProposalOutcomeDto =
  | {
      readonly status: "ready";
      readonly proposal: TaskToolRepairProposalDto;
    }
  | {
      readonly status: "not_found" | "not_needed" | "unavailable";
      readonly title: string;
      readonly explanation: string;
    };

export type ConnectionAction = "reconnect" | "disconnect" | "remove";

export interface ConnectorCredentialFieldDto {
  readonly name: "username" | "password";
  readonly label: string;
  readonly secret: boolean;
  readonly autoComplete: "username" | "current-password";
}

export interface ConnectorCredentialInputDto {
  readonly apiKey?: string | undefined;
  readonly fields?:
    | {
        readonly username?: string | undefined;
        readonly password?: string | undefined;
      }
    | undefined;
}

export interface ConnectionActionProposalDto {
  readonly connectionId: string;
  readonly connectionName: string;
  readonly action: ConnectionAction;
  readonly expectedStatus: "connected" | "not_connected";
  readonly credentialKind: "oauth" | "api-key" | "none";
  readonly credentialConfigured: boolean;
  readonly removable: boolean;
  readonly toolCount: number;
}

export type ConnectionActionProposalOutcomeDto =
  | {
      readonly status: "ready";
      readonly proposal: ConnectionActionProposalDto;
    }
  | {
      readonly status: "not_found" | "unavailable";
      readonly title: string;
      readonly explanation: string;
    };

export interface ConnectorPermissionSetDto {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly required: boolean;
  readonly granted: boolean;
}

export interface ConnectionTestDto {
  readonly status: "passed" | "failed";
  readonly kind: "api-read" | "mcp-discovery";
  readonly authentication?: string;
  readonly tool?: string;
  readonly method?: string;
  readonly endpoint?: string;
  readonly checkedAt: string;
}

export interface ConnectionCardDto {
  readonly connectionTest?: ConnectionTestDto;
  readonly id: string;
  /** Provider manifest backing this specific account connection. */
  readonly manifestId?: string;
  /** Provider name, which remains stable when the account is renamed. */
  readonly providerName?: string;
  readonly name: string;
  readonly description: string;
  readonly status: "connected" | "not_connected" | "coming_soon";
  readonly category?: "capability" | "connector" | "web-search";
  readonly connectionType?: "mcp" | "api" | "local";
  readonly custom?: boolean;
  readonly installed?: boolean;
  readonly removable?: boolean;
  readonly tags?: readonly string[];
  readonly endpoint?: string;
  readonly toolCount?: number;
  readonly activeToolCount?: number;
  readonly tools?: readonly {
    readonly name: string;
    readonly description?: string;
    readonly effect: "read" | "write" | "destructive";
  }[];
  readonly credentialKind?: "oauth" | "api-key" | "none";
  readonly credentialPlaceholder?: string;
  readonly credentialFields?: readonly ConnectorCredentialFieldDto[];
  readonly operator?: string;
  readonly oauthReady?: boolean;
  /** This provider can authorize another independent account/workspace. */
  readonly canAddAnother?: boolean;
  readonly permissionSets?: readonly ConnectorPermissionSetDto[];
  readonly featured?: boolean;
  readonly actionable?: boolean;
  readonly setupVariantId?: string;
  readonly availableIn?: readonly ("local" | "hosted")[];
  /** The transport can run hosted once this connection's credential is escrowed. */
  readonly hostedEligible?: boolean;
  /** This specific account's credential has been explicitly copied to the vault. */
  readonly hostedCredentialEscrowed?: boolean;
  /** This build has an authenticated hosted vault configured. */
  readonly hostedCredentialEscrowAvailable?: boolean;
  readonly keyCreationUrl?: string;
  readonly credentialConfigured?: boolean;
  readonly connectionIssue?:
    | "credential_missing"
    | "credential_invalid"
    | "verification_required";
  readonly oauthPending?: boolean;
  readonly logoSvg?: string;
  readonly logoUrl?: string;
  readonly logoSource?: "github-registry" | "github-repository" | "provider";
  /** Display identity for this account, such as an email or workspace name. */
  readonly accountLabel?: string;
}

/** Display identity for a connected account, when Springroll has one. */
export function connectionAccountLabel(
  card: Pick<ConnectionCardDto, "name" | "providerName" | "accountLabel">,
): string | undefined {
  const stored = card.accountLabel?.trim();
  if (stored) return stored;
  const provider = card.providerName?.trim();
  if (!provider) return undefined;
  const prefix = `${provider} · `;
  if (!card.name.startsWith(prefix)) return undefined;
  const rest = card.name.slice(prefix.length).trim();
  return rest || undefined;
}

/** Card title: provider for default labels, custom name after rename. */
export function connectionCardTitle(
  card: Pick<ConnectionCardDto, "name" | "providerName" | "accountLabel">,
  isAccount: boolean,
): string {
  if (!isAccount) return card.providerName ?? card.name;
  const provider = card.providerName ?? card.name;
  const account = connectionAccountLabel(card);
  const composed = account ? `${provider} · ${account}` : provider;
  if (card.name !== composed && card.name !== provider) return card.name;
  return provider;
}

/** Provider id for starting a new account; instance id reconnects one. */
export function connectorProviderId(
  card: Pick<ConnectionCardDto, "id" | "manifestId">,
): string {
  return card.manifestId ?? card.id;
}

export interface ConnectionTransportDetailsDto {
  readonly kind:
    | "mcp-remote"
    | "mcp-local"
    | "openapi"
    | "http-api"
    | "builtin";
  readonly protocolLabel: string;
  readonly endpoint?: string;
  readonly copySnippet?: string;
  readonly copySnippetLabel?: string;
  readonly clientConfigSnippet?: string;
  readonly transportLabel?: string;
  readonly authLabel?: string;
  readonly executionScope: "local-and-hosted" | "local-only";
  readonly executionScopeLabel: string;
  readonly operationsCount?: number;
  readonly packageName?: string;
  readonly packageVersion?: string;
  readonly args?: readonly string[];
}

export interface ConnectionToolDto {
  readonly name: string;
  readonly description?: string;
  readonly effect: "read" | "write" | "destructive";
  readonly mode: ConnectorToolMode;
  readonly method?: string;
  readonly path?: string;
  readonly parameters?: readonly {
    readonly name: string;
    readonly location?: "path" | "query" | "body";
    readonly type?: string;
    readonly required?: boolean;
    readonly description?: string;
  }[];
}

export interface ConnectionDetailDto extends ConnectionCardDto {
  readonly googleDataProtection?: {
    readonly enforced: boolean;
    readonly openRouterConnected: boolean;
  };
  readonly catalogSource: "live" | "last-discovered" | "unavailable";
  readonly transportDetails?: ConnectionTransportDetailsDto;
  readonly tools: readonly ConnectionToolDto[];
  readonly agentAccess?: {
    readonly mode: "on-demand";
    readonly policySource: "connection";
    readonly catalogIncludes: "names-and-effects";
    readonly detailIncludes: "descriptions-and-schemas";
  };
  readonly credentialAudit: readonly {
    readonly id: string;
    readonly action:
      | "test"
      | "oauth_start"
      | "oauth_complete"
      | "hosted_enable"
      | "hosted_disable"
      | "revoke"
      | "remove";
    readonly status: "succeeded" | "failed";
    readonly failureCategory?: RunFailureCategory;
    readonly createdAt: string;
  }[];
}

export type ConnectorOAuthStartDto =
  | {
      readonly status: "redirect";
      readonly authorizationUrl: string;
      readonly connectionId: string;
    }
  | { readonly status: "connected"; readonly connection: ConnectionCardDto };

export type ConnectionWorkflowActionDto =
  | {
      readonly status: "declined";
    }
  | {
      readonly status: "awaiting_api_key";
      readonly connection: ConnectionCardDto;
    }
  | {
      readonly status: "redirect";
      readonly authorizationUrl: string;
      readonly connection: ConnectionCardDto;
    }
  | {
      readonly status: "connected";
      readonly connection: ConnectionCardDto;
    };

export interface IntegrationVariantDto {
  readonly id: string;
  readonly label: string;
  readonly recommended: boolean;
  readonly credentialKind: "oauth" | "api-key" | "none";
  readonly guidance: {
    readonly summary: string;
    readonly steps: readonly string[];
    readonly docsUrl: string;
  };
}

export interface IntegrationProposalDto {
  readonly templateId: string;
  readonly name: string;
  readonly description: string;
  readonly operator: string;
  readonly trust?:
    | "curated"
    | "registry-verified"
    | "provider-verified"
    | "package-verified"
    | "openapi-verified"
    | "user-reviewed";
  readonly registryName?: string;
  readonly registryVersion?: string;
  readonly packageName?: string;
  readonly packageVersion?: string;
  readonly packageArgs?: readonly string[];
  readonly sources?: readonly {
    readonly title: string;
    readonly url: string;
  }[];
  readonly tools?: readonly {
    readonly name: string;
    readonly description?: string;
    readonly effect: "read" | "write" | "destructive";
  }[];
  readonly api?: {
    readonly specUrl: string;
    readonly baseUrl: string;
    readonly operationCount: number;
    readonly verification?: {
      readonly tool: string;
      readonly note: string;
    };
    readonly notes?: readonly string[];
  };
  /** Validated, secret-free setup data retained for durable researched proposals. */
  readonly manifest?: ConnectorManifest;
  readonly variants: readonly IntegrationVariantDto[];
}

export type IntegrationProposalOutcomeDto =
  | { readonly status: "ready"; readonly proposal: IntegrationProposalDto }
  | {
      readonly status: "candidate";
      readonly title: string;
      readonly explanation: string;
      readonly candidate: {
        readonly kind: "local-mcp";
        readonly name: string;
        readonly operator: string;
        readonly description: string;
        readonly packageName: string;
        readonly repositoryUrl: string;
        readonly registryUrl: string;
        readonly credentialRequired: boolean;
        readonly logo?: {
          readonly url: string;
          readonly source: "github-registry" | "github-repository";
          readonly kind: "preferred" | "owner-avatar" | "opengraph" | "asset";
          readonly format: "svg" | "raster";
        };
      };
      readonly instruction: string;
    }
  | {
      readonly status: "unavailable";
      readonly title: string;
      readonly explanation: string;
      readonly userAction?: "none" | "provide_source" | "retry";
    }
  | {
      readonly status: "not_found";
      readonly title: string;
      readonly explanation: string;
      readonly userAction?: "none" | "provide_source" | "retry";
    };

export interface AppSnapshotDto {
  readonly runs: readonly RunSummaryDto[];
  readonly tasks: readonly TaskSummaryDto[];
  readonly connections: readonly ConnectionCardDto[];
}

export interface AssistantMessageMetadataDto {
  readonly createdAt?: string;
  readonly turnId?: string;
  readonly provider?: string;
  readonly modelId?: string;
}

export type AssistantMessageDto = UIMessage<AssistantMessageMetadataDto>;

export type ChatSessionContextDto = ChatSessionContext;

export interface ChatSessionEntryDto {
  readonly title?: string;
  readonly mode?: ChatSessionEntryMode;
  readonly context: ChatSessionContextDto;
  readonly modelSelection?: ModelSelectionDto | null;
}

export interface ChatSessionDto {
  readonly id: string;
  readonly title: string | null;
  readonly status: "active" | "archived";
  readonly context: ChatSessionContextDto | null;
  readonly modelOverride?: ModelSelectionDto;
  readonly activeTurnId: string | null;
  readonly latestTurnStatus:
    | "queued"
    | "streaming"
    | "waiting_for_user"
    | "completed"
    | "failed"
    | "cancelled"
    | null;
  readonly snippet?: string | null;
  readonly lastMessageAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ChatUsageDto {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cachedInputTokens: number;
  readonly totalTokens: number;
  readonly actualCostUsdMicros: number;
  readonly estimatedCostUsdMicros: number;
  readonly webSearchRequests: number;
  readonly providerToolCalls: number;
  readonly imageGenerations: readonly {
    readonly provider?: string;
    readonly modelId?: string;
    readonly imageCount: number;
    readonly totalTokens?: number;
    readonly costUsdMicros?: number;
    readonly costEstimated?: boolean;
    readonly subscription?: boolean;
  }[];
}

/**
 * When each tool call in a turn ran. Measured at execution, so the trail can
 * size a tick by duration the way a run letter's can.
 */
export interface ChatToolCallDto {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: "running" | "succeeded" | "failed";
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

export interface ChatTurnDto {
  readonly id: string;
  readonly sessionId: string;
  readonly status:
    | "queued"
    | "streaming"
    | "waiting_for_user"
    | "completed"
    | "failed"
    | "cancelled";
  readonly error: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly usage: ChatUsageDto;
  readonly toolCalls: readonly ChatToolCallDto[];
}

export interface AssistantWorkflowDto {
  readonly id: string;
  readonly sessionId: string;
  readonly sourceMessageId: string;
  readonly sourceToolCallId: string;
  readonly kind: "connection_setup";
  readonly status:
    | "proposed"
    | "in_progress"
    | "waiting_for_user"
    | "completed"
    | "failed"
    | "cancelled";
  readonly schemaVersion: 1;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly outcome: Readonly<Record<string, unknown>> | null;
  readonly subjectKind: "connection" | "task" | "run" | null;
  readonly subjectId: string | null;
  readonly error: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ToolApprovalDto {
  readonly id: string;
  readonly contextKind: "chat" | "run";
  readonly contextId: string;
  readonly messageId: string | null;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly riskEffect: "read" | "write" | "destructive";
  readonly status:
    | "pending"
    | "approved"
    | "denied"
    | "executing"
    | "succeeded"
    | "failed"
    | "interrupted";
  readonly reason: string | null;
  readonly outcome: Readonly<Record<string, unknown>> | null;
  readonly decidedAt: string | null;
  readonly executionStartedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ChatDetailDto {
  readonly googleDataProtected?: boolean;
  readonly session: ChatSessionDto;
  readonly messages: readonly AssistantMessageDto[];
  readonly turns: readonly ChatTurnDto[];
  readonly workflows: readonly AssistantWorkflowDto[];
  readonly approvals: readonly ToolApprovalDto[];
  readonly artifacts: readonly (RunResultArtifact & {
    readonly turnId: string;
  })[];
  readonly usage: ChatUsageDto;
}
export interface AppearanceSettingsDto {
  readonly theme: string | null;
  readonly textSize: string | null;
}

export type {
  SubscriptionRuntimeId,
  SubscriptionRuntimeStatus,
} from "@springroll/kernel";
