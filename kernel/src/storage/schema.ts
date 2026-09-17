import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  AssistantWorkflowKind,
  AssistantWorkflowStatus,
  ChatSessionContext,
  ChatSubjectKind,
} from "../assistant.ts";
import type { ConnectorManifest } from "../connector-manifest.ts";
import type { ExecutionLocation, RunResultV1 } from "../contracts.ts";
import type {
  RecipeKnowledgeDocument,
  RecipeKnowledgeStatus,
} from "../recipe-knowledge.ts";
import type { JsonObject } from "../tools.ts";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
};

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    tag: text("tag"),
    prompt: text("prompt").notNull(),
    contract: text("contract").notNull().default(""),
    schedule: text("schedule").notNull(),
    scheduleTimezone: text("schedule_timezone").notNull().default("UTC"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    catchUpPolicy: text("catch_up_policy", {
      enum: ["catch_up", "skip_to_next"],
    })
      .notNull()
      .default("skip_to_next"),
    modelProviderId: text("model_provider_id"),
    modelId: text("model_id"),
    imageModelProviderId: text("image_model_provider_id"),
    imageModelId: text("image_model_id"),
    // Legacy compatibility column. Runtime policy no longer reads or writes it.
    maxToolCallsPerRun: integer("max_tool_calls_per_run").notNull().default(12),
    nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull(),
    lastScheduleRecovery: text("last_schedule_recovery", {
      mode: "json",
    }).$type<{
      outcome: "caught_up" | "skipped_missed" | "skipped_active";
      scheduledTime: string;
      recoveredAt: string;
    }>(),
    ...timestamps,
  },
  (table) => [index("tasks_due_idx").on(table.enabled, table.nextRunAt)],
);

export const modelProviderConnections = sqliteTable(
  "model_provider_connections",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    catalogProviderId: text("catalog_provider_id").notNull(),
    credentialRef: text("credential_ref").notNull(),
    googleDataConfirmedAt: integer("google_data_confirmed_at", {
      mode: "timestamp_ms",
    }),
    availableIn: text("available_in", { mode: "json" })
      .$type<ExecutionLocation[]>()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("model_provider_catalog_unique").on(table.catalogProviderId),
  ],
);

export const modelSettings = sqliteTable("model_settings", {
  id: text("id").primaryKey(),
  providerId: text("provider_id"),
  modelId: text("model_id"),
  ...timestamps,
});

export const executionSettings = sqliteTable("execution_settings", {
  id: text("id").primaryKey(),
  maxSteps: integer("max_steps").notNull().default(0),
  maxCostUsdMicros: integer("max_cost_usd_micros"),
  ...timestamps,
});

export const appearanceSettings = sqliteTable("appearance_settings", {
  id: text("id").primaryKey(),
  theme: text("theme"),
  textSize: text("text_size"),
  ...timestamps,
});

export const integrationManifests = sqliteTable("integration_manifests", {
  id: text("id").primaryKey(),
  manifest: text("manifest", { mode: "json" })
    .$type<ConnectorManifest>()
    .notNull(),
  ...timestamps,
});

export const connections = sqliteTable(
  "connections",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    sourceId: text("source_id").notNull(),
    manifestId: text("manifest_id"),
    credentialRef: text("credential_ref").notNull(),
    config: text("config", { mode: "json" })
      .$type<JsonObject>()
      .notNull()
      .default(sql`'{}'`),
    availableIn: text("available_in", { mode: "json" })
      .$type<ExecutionLocation[]>()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    index("connections_source_idx").on(table.sourceId),
    index("connections_manifest_idx").on(table.manifestId),
  ],
);

export const taskTools = sqliteTable(
  "task_tools",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    inputSchemaHash: text("input_schema_hash").notNull(),
    // Legacy compatibility column. Runtime policy no longer reads or writes it.
    maxCallsPerRun: integer("max_calls_per_run").notNull().default(8),
    riskEffect: text("risk_effect", {
      enum: ["read", "write", "destructive"],
    }).notNull(),
    riskOpenWorld: integer("risk_open_world", { mode: "boolean" }).notNull(),
    riskIdempotent: integer("risk_idempotent", {
      mode: "boolean",
    }).notNull(),
    approval: text("approval", {
      enum: ["never", "before_call", "off"],
    }).notNull(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    primaryKey({
      columns: [table.taskId, table.connectionId, table.name],
    }),
    index("task_tools_task_idx").on(table.taskId),
  ],
);

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    scheduledTime: integer("scheduled_time", {
      mode: "timestamp_ms",
    }).notNull(),
    manualRequestId: text("manual_request_id"),
    status: text("status", {
      enum: [
        "claimed",
        "running",
        "waiting_for_approval",
        "succeeded",
        "failed",
      ],
    })
      .notNull()
      .default("claimed"),
    executionLocation: text("execution_location", {
      enum: ["local", "hosted"],
    }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    durationMs: integer("duration_ms"),
    transcriptSummary: text("transcript_summary"),
    transcriptBody: text("transcript_body"),
    resultJson: text("result_json", { mode: "json" }).$type<RunResultV1>(),
    modelProvider: text("model_provider"),
    modelId: text("model_id"),
    modelBilling: text("model_billing", {
      enum: ["metered", "subscription", "unknown"],
    }),
    catalogRevision: text("catalog_revision"),
    inputUsdPerMillionTokens: real("input_usd_per_million_tokens"),
    outputUsdPerMillionTokens: real("output_usd_per_million_tokens"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    totalTokens: integer("total_tokens"),
    costUsdMicros: integer("cost_usd_micros"),
    actualCostUsdMicros: integer("actual_cost_usd_micros"),
    estimatedCostUsdMicros: integer("estimated_cost_usd_micros"),
    costSource: text("cost_source", {
      enum: ["provider_reported", "catalog_estimate"],
    }),
    webSearchRequests: integer("web_search_requests"),
    failureCategory: text("failure_category", {
      enum: [
        "authentication",
        "rate_limit",
        "timeout",
        "network",
        "policy",
        "invalid_response",
        "unknown",
      ],
    }),
    error: text("error"),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    uniqueIndex("runs_task_occurrence_unique").on(
      table.taskId,
      table.scheduledTime,
    ),
    uniqueIndex("runs_task_manual_request_unique").on(
      table.taskId,
      table.manualRequestId,
    ),
    index("runs_task_time_idx").on(table.taskId, table.scheduledTime),
  ],
);

export const runCheckpoints = sqliteTable("run_checkpoints", {
  runId: text("run_id")
    .primaryKey()
    .references(() => runs.id, { onDelete: "cascade" }),
  messages: text("messages", { mode: "json" })
    .$type<readonly JsonObject[]>()
    .notNull(),
  ...timestamps,
});

// Physical table/column names stay stable for existing local databases.
export const taskRecipeKnowledge = sqliteTable(
  "task_execution_profiles",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    status: text("status", {
      enum: [
        "ready",
        "superseded",
      ] as const satisfies readonly RecipeKnowledgeStatus[],
    }).notNull(),
    knowledge: text("profile", { mode: "json" })
      .$type<RecipeKnowledgeDocument>()
      .notNull(),
    sourceRunId: text("source_run_id").references(() => runs.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.revision] }),
    index("task_execution_profiles_task_status_idx").on(
      table.taskId,
      table.status,
    ),
    uniqueIndex("task_execution_profiles_source_run_unique").on(
      table.sourceRunId,
    ),
  ],
);

export const runEvents = sqliteTable(
  "run_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type", {
      enum: [
        "run_started",
        "schedule_catch_up_skipped",
        "stub_output",
        "tool_call",
        "lifecycle",
        "message",
        "source",
        "tool_result",
        "policy_decision",
        "model_selection",
        "model_turn",
        "model_retry",
        "usage",
        "agent_output",
        "run_succeeded",
        "run_failed",
      ],
    }).notNull(),
    payload: text("payload", { mode: "json" }).$type<JsonObject>().notNull(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    uniqueIndex("run_events_run_sequence_unique").on(
      table.runId,
      table.sequence,
    ),
  ],
);

export const chatSessions = sqliteTable(
  "chat_sessions",
  {
    id: text("id").primaryKey(),
    title: text("title"),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    context: text("context", { mode: "json" }).$type<ChatSessionContext>(),
    contextKey: text("context_key"),
    modelProviderId: text("model_provider_id"),
    modelId: text("model_id"),
    activeTurnId: text("active_turn_id"),
    lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    index("chat_sessions_status_updated_idx").on(table.status, table.updatedAt),
    index("chat_sessions_context_idx").on(
      table.status,
      table.contextKey,
      table.updatedAt,
    ),
  ],
);

export const chatTurns = sqliteTable(
  "chat_turns",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: [
        "queued",
        "streaming",
        "waiting_for_user",
        "completed",
        "failed",
        "cancelled",
      ],
    })
      .notNull()
      .default("queued"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    error: text("error"),
    ...timestamps,
  },
  (table) => [
    index("chat_turns_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);

export const artifacts = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").references(() => runs.id, { onDelete: "cascade" }),
    chatTurnId: text("chat_turn_id").references(() => chatTurns.id, {
      onDelete: "cascade",
    }),
    captureKey: text("capture_key").notNull(),
    origin: text("origin", { enum: ["generated", "attachment"] })
      .notNull()
      .default("generated"),
    sha256: text("sha256").notNull(),
    mediaType: text("media_type", {
      enum: ["image/png", "image/jpeg", "image/webp"],
    }).notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    title: text("title").notNull().default("Generated image"),
    alt: text("alt"),
    providerId: text("provider_id"),
    modelId: text("model_id"),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    check(
      "artifacts_one_owner",
      sql`(${table.runId} IS NOT NULL) <> (${table.chatTurnId} IS NOT NULL)`,
    ),
    uniqueIndex("artifacts_run_capture_unique").on(
      table.runId,
      table.captureKey,
    ),
    uniqueIndex("artifacts_chat_turn_capture_unique").on(
      table.chatTurnId,
      table.captureKey,
    ),
    index("artifacts_run_idx").on(table.runId),
    index("artifacts_chat_turn_idx").on(table.chatTurnId),
    index("artifacts_sha_idx").on(table.sha256),
  ],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    turnId: text("turn_id").references(() => chatTurns.id, {
      onDelete: "set null",
    }),
    sequence: integer("sequence").notNull(),
    role: text("role", { enum: ["system", "user", "assistant"] }).notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    parts: text("parts", { mode: "json" })
      .$type<readonly JsonObject[]>()
      .notNull(),
    metadata: text("metadata", { mode: "json" })
      .$type<JsonObject>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    uniqueIndex("chat_messages_session_sequence_unique").on(
      table.sessionId,
      table.sequence,
    ),
    index("chat_messages_turn_idx").on(table.turnId),
  ],
);

/**
 * One row per tool call in a chat turn, measured at execution. Runs infer
 * step durations by pairing consecutive events; chat measures them directly,
 * which also stays correct when the model issues calls in parallel.
 */
export const chatToolCalls = sqliteTable(
  "chat_tool_calls",
  {
    id: text("id").primaryKey(),
    turnId: text("turn_id")
      .notNull()
      .references(() => chatTurns.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed"] })
      .notNull()
      .default("running"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    uniqueIndex("chat_tool_calls_turn_call_unique").on(
      table.turnId,
      table.toolCallId,
    ),
    index("chat_tool_calls_turn_started_idx").on(table.turnId, table.startedAt),
  ],
);

export const assistantWorkflows = sqliteTable(
  "assistant_workflows",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    sourceMessageId: text("source_message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    sourceToolCallId: text("source_tool_call_id").notNull(),
    kind: text("kind").$type<AssistantWorkflowKind>().notNull(),
    status: text("status")
      .$type<AssistantWorkflowStatus>()
      .notNull()
      .default("proposed"),
    schemaVersion: integer("schema_version").notNull().default(1),
    payload: text("payload", { mode: "json" }).$type<JsonObject>().notNull(),
    outcome: text("outcome", { mode: "json" }).$type<JsonObject>(),
    subjectKind: text("subject_kind").$type<ChatSubjectKind>(),
    subjectId: text("subject_id"),
    error: text("error"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("assistant_workflows_source_unique").on(
      table.sessionId,
      table.sourceToolCallId,
    ),
    index("assistant_workflows_session_updated_idx").on(
      table.sessionId,
      table.updatedAt,
    ),
  ],
);

export const toolApprovals = sqliteTable(
  "tool_approvals",
  {
    id: text("id").primaryKey(),
    contextKind: text("context_kind", { enum: ["chat", "run"] }).notNull(),
    contextId: text("context_id").notNull(),
    messageId: text("message_id").references(() => chatMessages.id, {
      onDelete: "set null",
    }),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    input: text("input", { mode: "json" }).$type<JsonObject>().notNull(),
    riskEffect: text("risk_effect", {
      enum: ["read", "write", "destructive"],
    }).notNull(),
    status: text("status", {
      enum: [
        "pending",
        "approved",
        "denied",
        "executing",
        "succeeded",
        "failed",
        "interrupted",
      ],
    })
      .notNull()
      .default("pending"),
    reason: text("reason"),
    outcome: text("outcome", { mode: "json" }).$type<JsonObject>(),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    executionStartedAt: integer("execution_started_at", {
      mode: "timestamp_ms",
    }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tool_approvals_context_call_unique").on(
      table.contextKind,
      table.contextId,
      table.toolCallId,
    ),
    index("tool_approvals_context_idx").on(
      table.contextKind,
      table.contextId,
      table.createdAt,
    ),
    index("tool_approvals_status_idx").on(table.status, table.updatedAt),
  ],
);

export const credentialAuditEvents = sqliteTable(
  "credential_audit_events",
  {
    id: text("id").primaryKey(),
    connectorId: text("connector_id").notNull(),
    credentialKind: text("credential_kind", {
      enum: ["oauth", "api-key", "none"],
    }).notNull(),
    action: text("action", {
      enum: [
        "test",
        "oauth_start",
        "oauth_complete",
        "hosted_enable",
        "hosted_disable",
        "revoke",
        "remove",
      ],
    }).notNull(),
    status: text("status", { enum: ["succeeded", "failed"] }).notNull(),
    failureCategory: text("failure_category", {
      enum: [
        "authentication",
        "rate_limit",
        "timeout",
        "network",
        "policy",
        "invalid_response",
        "unknown",
      ],
    }),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    index("credential_audit_connector_created_idx").on(
      table.connectorId,
      table.createdAt,
    ),
  ],
);

export const modelCalls = sqliteTable(
  "model_calls",
  {
    id: text("id").primaryKey(),
    contextKind: text("context_kind", {
      enum: ["proposal", "run", "chat", "distill"],
    }).notNull(),
    contextId: text("context_id").notNull(),
    sequence: integer("sequence").notNull(),
    status: text("status", {
      enum: ["started", "succeeded", "failed", "cancelled"],
    }).notNull(),
    provider: text("provider"),
    modelId: text("model_id"),
    operation: text("operation", { enum: ["image_generation"] }),
    imageCount: integer("image_count"),
    billing: text("billing", {
      enum: ["metered", "subscription", "unknown"],
    })
      .notNull()
      .default("unknown"),
    catalogRevision: text("catalog_revision"),
    inputUsdPerMillionTokens: real("input_usd_per_million_tokens"),
    outputUsdPerMillionTokens: real("output_usd_per_million_tokens"),
    finishReason: text("finish_reason"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    totalTokens: integer("total_tokens"),
    costUsdMicros: integer("cost_usd_micros"),
    actualCostUsdMicros: integer("actual_cost_usd_micros"),
    estimatedCostUsdMicros: integer("estimated_cost_usd_micros"),
    costSource: text("cost_source", {
      enum: ["provider_reported", "catalog_estimate"],
    }),
    webSearchRequests: integer("web_search_requests"),
    providerToolCalls: integer("provider_tool_calls"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    durationMs: integer("duration_ms"),
    error: text("error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("model_calls_context_sequence_unique").on(
      table.contextKind,
      table.contextId,
      table.sequence,
    ),
    index("model_calls_context_idx").on(table.contextKind, table.contextId),
  ],
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type ToolApprovalRow = typeof toolApprovals.$inferSelect;
export type CredentialAuditEventRow = typeof credentialAuditEvents.$inferSelect;
export type TaskToolRow = typeof taskTools.$inferSelect;
export type TaskRecipeKnowledgeRow = typeof taskRecipeKnowledge.$inferSelect;
export type ModelProviderConnectionRow =
  typeof modelProviderConnections.$inferSelect;
export type IntegrationManifestRow = typeof integrationManifests.$inferSelect;
export type ConnectionRow = typeof connections.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type RunEventRow = typeof runEvents.$inferSelect;
export type ChatSessionRow = typeof chatSessions.$inferSelect;
export type ChatTurnRow = typeof chatTurns.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type ChatToolCallRow = typeof chatToolCalls.$inferSelect;
export type AssistantWorkflowRow = typeof assistantWorkflows.$inferSelect;
export type ModelCallRow = typeof modelCalls.$inferSelect;
export type ExecutionSettingsRow = typeof executionSettings.$inferSelect;
export type NewExecutionSettingsRow = typeof executionSettings.$inferInsert;

export const googleDataProtection = sqliteTable("google_data_protection", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const googleDataRouteAudit = sqliteTable("google_data_route_audit", {
  id: text("id").primaryKey(),
  modelId: text("model_id").notNull(),
  endpoint: text("endpoint").notNull(),
  requestedAt: integer("requested_at", { mode: "timestamp_ms" }).notNull(),
});
