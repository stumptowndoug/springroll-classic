import {
  AgentRunApprovalConflictError,
  AgentRunNotFoundError,
  type AiSdkAssistant,
  AssistantApprovalNotFoundError,
  AssistantSessionNotFoundError,
  AssistantTurnConflictError,
  type ChatSessionContext,
  chatSessionContextSchema,
  chatSessionEntryModeSchema,
  connectorManifestSchema,
  LocalMcpProcessError,
} from "@springroll/kernel";
import { type Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  type ConnectionCardDto,
  type ConnectionWorkflowActionDto,
  connectorProviderId,
  modelProviderIds,
  type TaskToolRepairProposalDto,
} from "../shared.ts";
import type { LocalApplication, UpdateTaskInput } from "./application.ts";
import type { SpringrollMcpHttpEndpoint } from "./application-mcp.ts";
import { ConnectionTestError } from "./connection-test.ts";
import { isAllowedLocalRequest } from "./local-request-boundary.ts";

export type AppApi = Partial<Pick<LocalApplication, "isGoogleDataProtected">> &
  Pick<
    LocalApplication,
    | "snapshot"
    | "appearance"
    | "updateAppearance"
    | "listRuns"
    | "getRun"
    | "cancelRun"
    | "decideRunApprovals"
    | "deleteRun"
    | "readArtifact"
    | "listRunEvents"
    | "listTasks"
    | "getTask"
    | "listTaskRuns"
    | "deleteTask"
    | "getTaskExecution"
    | "getTaskRecipeKnowledge"
    | "proposeTaskToolRepair"
    | "applyTaskToolRepairProposal"
    | "updateTask"
    | "runTaskNow"
    | "listConnections"
    | "getConnectionDetail"
    | "updateConnectionToolPolicy"
    | "renameConnection"
    | "proposeIntegration"
    | "prepareIntegrationVariant"
    | "prepareCustomRemoteMcp"
    | "prepareImportedRemoteMcp"
    | "prepareCustomOpenApi"
    | "modelConfiguration"
    | "refreshModelCatalog"
    | "connectModelProvider"
    | "disconnectModelProvider"
    | "subscriptionRuntime"
    | "installSubscriptionRuntime"
    | "cancelSubscriptionRuntimeDownload"
    | "startCodexLogin"
    | "startClaudeLogin"
    | "updateDefaultModel"
    | "updateResearchDistillerModel"
    | "updateImageModel"
    | "updateExecutionSettings"
    | "connectOpenRouter"
    | "disconnectOpenRouter"
    | "connectWebSearch"
    | "disconnectWebSearch"
    | "webResearchConfiguration"
    | "connectWebProvider"
    | "disconnectWebProvider"
    | "updateWebResearch"
    | "connectConnector"
    | "disconnectConnector"
    | "enableConnectionHosted"
    | "disableConnectionHosted"
    | "removeConnector"
    | "startConnectorOAuth"
    | "resolveConnectorOAuthCallback"
    | "connectorOAuthReturnTo"
    | "completeConnectorOAuth"
    | "connectNeon"
    | "disconnectNeon"
  >;

export interface HttpAppAssets {
  readonly indexHtml: string;
  read(path: string): Promise<Response | undefined>;
}

export type AssistantApi = Pick<
  AiSdkAssistant,
  | "createSession"
  | "createOrResumeSession"
  | "listSessions"
  | "getSession"
  | "archiveSession"
  | "cancelSession"
  | "deleteSession"
  | "deleteSessionsForSubject"
  | "renameSession"
  | "updateSessionContext"
  | "updateSessionModel"
  | "getWorkflow"
  | "recordWorkflow"
  | "updateWorkflow"
  | "restoreSession"
  | "respond"
  | "continueConnectionWorkflow"
>;

const taskToolRiskSchema = z.object({
  effect: z.enum(["read", "write", "destructive"]),
  openWorld: z.boolean(),
  idempotent: z.boolean(),
});
const taskToolRepairProposalSchema = z.object({
  taskId: z.string().trim().min(1).max(200),
  taskName: z.string().min(1).max(200),
  changes: z
    .array(
      z.object({
        connectionId: z.string().min(1).max(200),
        connectionName: z.string().min(1).max(200),
        sourceId: z.string().min(1).max(200),
        toolName: z.string().min(1).max(200),
        description: z.string().max(2_000),
        previousInputSchemaHash: z.string().min(1).max(200),
        proposedInputSchemaHash: z.string().min(1).max(200),
        inputSchema: z.record(z.string(), z.unknown()),
        previousRisk: taskToolRiskSchema,
        proposedRisk: taskToolRiskSchema,
      }),
    )
    .min(1)
    .max(100),
});
const connectionProposalWorkflowSchema = z.object({
  status: z.literal("ready"),
  proposal: z.object({
    templateId: z.string().min(1),
    name: z.string().min(1),
    manifest: connectorManifestSchema.optional(),
    variants: z.array(
      z.object({
        id: z.string().min(1),
        credentialKind: z.enum(["oauth", "api-key", "none"]),
      }),
    ),
  }),
});
const preparedConnectionWorkflowOutcomeSchema = z.object({
  phase: z.literal("prepared"),
  connectorId: z.string().min(1),
  variantId: z.string().min(1),
  credentialKind: z.enum(["oauth", "api-key", "none"]),
  ceremony: z
    .object({
      state: z.enum(["failed", "expired"]),
      retryable: z.literal(true),
    })
    .optional(),
});
const connectorCredentialInputSchema = z
  .object({
    apiKey: z.string().min(1).max(20_000).optional(),
    fields: z
      .object({
        username: z.string().min(1).max(2_000).optional(),
        password: z.string().min(1).max(20_000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const modelProviderSchema = z.enum(modelProviderIds);
const modelSelectionSchema = z.object({
  providerId: modelProviderSchema,
  modelId: z.string().min(1),
});

export function createHttpApp(
  application: AppApi,
  assets?: HttpAppAssets,
  assistant?: AssistantApi,
  mcp?: SpringrollMcpHttpEndpoint,
  desktopOAuthResult?: (path: string) => void,
): Hono {
  const app = new Hono();
  app.use("*", async (context, next) => {
    if (!isAllowedLocalRequest(context.req.raw)) {
      return context.json({ error: "Untrusted local request" }, 403);
    }
    await next();
    context.header("X-Frame-Options", "DENY");
    context.header("X-Content-Type-Options", "nosniff");
    context.header("Referrer-Policy", "no-referrer");
    const existingPolicy = context.res.headers.get("Content-Security-Policy");
    context.header(
      "Content-Security-Policy",
      [
        existingPolicy,
        "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; img-src 'self' data: blob: https://avatars.githubusercontent.com https://raw.githubusercontent.com",
      ]
        .filter(Boolean)
        .join("; "),
    );
    if (new URL(context.req.url).pathname.startsWith("/api/")) {
      // Reports and generated artifacts may contain private connected-account data.
      context.header("Cache-Control", "no-store");
    }
  });

  app.get("/api/snapshot", async (context) =>
    context.json(await application.snapshot()),
  );
  app.get("/api/appearance", (context) =>
    context.json(application.appearance()),
  );
  app.patch("/api/appearance", async (context) => {
    const input = z
      .object({
        theme: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[a-z0-9-]+$/)
          .optional(),
        textSize: z.enum(["small", "medium", "large", "xl"]).optional(),
      })
      .strict()
      .refine(
        (value) => value.theme !== undefined || value.textSize !== undefined,
      )
      .parse(await context.req.json());
    return context.json(
      application.updateAppearance({
        ...(input.theme === undefined ? {} : { theme: input.theme }),
        ...(input.textSize === undefined ? {} : { textSize: input.textSize }),
      }),
    );
  });
  app.get("/api/runs", async (context) =>
    context.json(await application.listRuns()),
  );
  app.get("/api/runs/:id", async (context) => {
    const run = await application.getRun(context.req.param("id"));
    return run
      ? context.json(run)
      : context.json({ error: "Run not found" }, 404);
  });
  app.get("/api/artifacts/:id", async (context) => {
    const artifact = await application.readArtifact(context.req.param("id"));
    if (!artifact) {
      return context.json({ error: "Artifact not found" }, 404);
    }
    return new Response(Uint8Array.from(artifact.bytes).buffer, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition":
          context.req.query("download") === "1"
            ? `attachment; filename="${artifactFilename(artifact.title, artifact.mediaType)}"`
            : "inline",
        "Content-Security-Policy": "sandbox",
        "Content-Type": artifact.mediaType,
        ETag: `"${artifact.sha256}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
  app.post("/api/runs/:id/cancel", async (context) => {
    try {
      return context.json(await application.cancelRun(context.req.param("id")));
    } catch (error) {
      if (error instanceof AgentRunNotFoundError) {
        return context.json({ error: "Run not found" }, 404);
      }
      throw error;
    }
  });
  app.post("/api/runs/:id/approvals", async (context) => {
    const input = z
      .object({
        approvals: z
          .array(
            z
              .object({
                id: z.string().trim().min(1).max(200),
                approved: z.boolean(),
                reason: z.string().trim().min(1).max(2_000).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(32),
      })
      .strict()
      .parse(await context.req.json());
    try {
      return context.json(
        await application.decideRunApprovals(
          context.req.param("id"),
          input.approvals.map(({ id, approved, reason }) => ({
            id,
            approved,
            ...(reason ? { reason } : undefined),
          })),
        ),
      );
    } catch (error) {
      if (error instanceof AgentRunNotFoundError) {
        return context.json({ error: "Run not found" }, 404);
      }
      if (error instanceof AgentRunApprovalConflictError) {
        return context.json(
          { error: "Run approval is no longer pending" },
          409,
        );
      }
      throw error;
    }
  });
  app.delete("/api/runs/:id", async (context) => {
    const runId = context.req.param("id");
    const run = await application.getRun(runId);
    if (!run) {
      return context.json({ error: "Run not found" }, 404);
    }
    if (run.status === "claimed" || run.status === "running") {
      return context.json(
        { error: "A run cannot be deleted while it is still active" },
        409,
      );
    }
    const result = await application.deleteRun(runId);
    if (result === "not_found") {
      return context.json({ error: "Run not found" }, 404);
    }
    if (result === "active") {
      return context.json(
        {
          error: "Stop this run and any active linked chat before deleting it",
        },
        409,
      );
    }
    return context.body(null, 204);
  });
  app.get("/api/runs/:id/events", async (context) => {
    const query = z
      .object({
        after: z.coerce.number().int().min(-1).optional().default(-1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(100),
      })
      .parse(context.req.query());
    const page = await application.listRunEvents(
      context.req.param("id"),
      query.after,
      query.limit,
    );
    return page
      ? context.json(page)
      : context.json({ error: "Run not found" }, 404);
  });
  app.get("/api/runs/:id/events/stream", async (context) => {
    const queryAfter = z.coerce
      .number()
      .int()
      .min(-1)
      .optional()
      .parse(context.req.query("after"));
    const headerAfter = parseEventCursor(context.req.header("last-event-id"));
    let cursor = headerAfter ?? queryAfter ?? -1;
    let page = await application.listRunEvents(context.req.param("id"), cursor);
    if (!page) {
      return context.json({ error: "Run not found" }, 404);
    }

    return streamSSE(context, async (stream) => {
      let lastWriteAt = Date.now();
      while (!stream.aborted && page) {
        for (const event of page.events) {
          await stream.writeSSE({
            id: String(event.sequence),
            event: "run_event",
            data: JSON.stringify(event),
            retry: 1_000,
          });
          lastWriteAt = Date.now();
        }
        cursor = page.nextCursor;
        if (
          !page.hasMore &&
          (page.runStatus === "succeeded" ||
            page.runStatus === "failed" ||
            page.runStatus === "waiting_for_approval")
        ) {
          await stream.writeSSE({
            id: String(cursor),
            event: "run_complete",
            data: JSON.stringify({ status: page.runStatus }),
          });
          return;
        }
        if (!page.hasMore) {
          await stream.sleep(350);
        }
        page = await application.listRunEvents(context.req.param("id"), cursor);
        if (Date.now() - lastWriteAt >= 15_000) {
          await stream.write(": keepalive\n\n");
          lastWriteAt = Date.now();
        }
      }
    });
  });
  app.get("/api/tasks", async (context) =>
    context.json(await application.listTasks()),
  );
  app.get("/api/tasks/:id", async (context) => {
    const task = await application.getTask(context.req.param("id"));
    return task
      ? context.json(task)
      : context.json({ error: "Task not found" }, 404);
  });
  app.get("/api/tasks/:id/runs", async (context) => {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(25)
      .parse(context.req.query("limit"));
    const runs = await application.listTaskRuns(context.req.param("id"), limit);
    return runs
      ? context.json(runs)
      : context.json({ error: "Task not found" }, 404);
  });
  app.delete("/api/tasks/:id", async (context) => {
    const taskId = context.req.param("id");
    if (!(await application.getTask(taskId))) {
      return context.json({ error: "Task not found" }, 404);
    }
    const result = await application.deleteTask(taskId);
    if (result === "not_found") {
      return context.json({ error: "Task not found" }, 404);
    }
    if (result === "active") {
      return context.json(
        {
          error:
            "Stop this recipe's active runs and linked chats before deleting it",
        },
        409,
      );
    }
    return context.body(null, 204);
  });
  app.get("/api/tasks/:id/execution", async (context) =>
    context.json(await application.getTaskExecution(context.req.param("id"))),
  );
  app.get("/api/tasks/:id/knowledge", async (context) => {
    const taskId = context.req.param("id");
    if (!(await application.getTask(taskId))) {
      return context.json({ error: "Task not found" }, 404);
    }
    return context.json(
      (await application.getTaskRecipeKnowledge(taskId)) ?? null,
    );
  });
  app.patch("/api/tasks/:id", async (context) => {
    const parsed = z
      .object({
        name: z.string().trim().min(2).max(80).optional(),
        prompt: z.string().trim().min(3).max(2_000).optional(),
        schedule: z.string().trim().min(5).max(100).optional(),
        timezone: z.string().trim().min(1).max(100).optional(),
        enabled: z.boolean().optional(),
        tag: z.string().max(60).nullable().optional(),
        catchUpPolicy: z.enum(["catch_up", "skip_to_next"]).optional(),
        modelSelection: modelSelectionSchema.nullable().optional(),
        imageModelSelection: modelSelectionSchema.nullable().optional(),
      })
      .parse(await context.req.json());
    const input: UpdateTaskInput = {
      ...(parsed.name === undefined ? undefined : { name: parsed.name }),
      ...(parsed.prompt === undefined ? undefined : { prompt: parsed.prompt }),
      ...(parsed.schedule === undefined
        ? undefined
        : { schedule: parsed.schedule }),
      ...(parsed.timezone === undefined
        ? undefined
        : { timezone: parsed.timezone }),
      ...(parsed.enabled === undefined
        ? undefined
        : { enabled: parsed.enabled }),
      ...(parsed.tag === undefined ? undefined : { tag: parsed.tag }),
      ...(parsed.catchUpPolicy === undefined
        ? undefined
        : { catchUpPolicy: parsed.catchUpPolicy }),
      ...(parsed.modelSelection === undefined
        ? undefined
        : { modelSelection: parsed.modelSelection }),
      ...(parsed.imageModelSelection === undefined
        ? undefined
        : { imageModelSelection: parsed.imageModelSelection }),
    };
    const task = await application.updateTask(context.req.param("id"), input);

    return task
      ? context.json(task)
      : context.json({ error: "Task not found" }, 404);
  });
  app.post("/api/tasks/:id/repair-tools", async (context) => {
    const proposal = taskToolRepairProposalSchema.parse(
      await context.req.json(),
    );
    if (proposal.taskId !== context.req.param("id")) {
      return context.json(
        { error: "Repair proposal does not match this recipe" },
        409,
      );
    }
    return context.json(
      await application.applyTaskToolRepairProposal(
        proposal as TaskToolRepairProposalDto,
      ),
    );
  });
  app.get("/api/tasks/:id/tool-repair", async (context) =>
    context.json(
      await application.proposeTaskToolRepair(context.req.param("id")),
    ),
  );
  app.post("/api/tasks/:id/run", async (context) => {
    const manualRequestId = z
      .string()
      .min(1)
      .max(200)
      .optional()
      .parse(context.req.header("idempotency-key"));
    return context.json(
      await application.runTaskNow(context.req.param("id"), manualRequestId),
      202,
    );
  });
  app.get("/api/connections", async (context) =>
    context.json(await application.listConnections()),
  );
  app.get("/api/connections/:id", async (context) => {
    const connection = await application.getConnectionDetail(
      context.req.param("id"),
    );
    return connection
      ? context.json(connection)
      : context.json({ error: "Connection not found" }, 404);
  });
  app.patch("/api/connections/:id/tools/:toolName", async (context) => {
    const input = z
      .object({ mode: z.enum(["allow", "check_first", "off"]) })
      .parse(await context.req.json());
    const connection = await application.updateConnectionToolPolicy(
      context.req.param("id"),
      {
        toolName: context.req.param("toolName"),
        mode: input.mode,
      },
    );
    return connection
      ? context.json(connection)
      : context.json({ error: "Connection not found" }, 404);
  });
  app.post("/api/integrations/propose", async (context) => {
    const input = z
      .object({ sentence: z.string().trim().min(1).max(500) })
      .parse(await context.req.json());
    return context.json(await application.proposeIntegration(input.sentence));
  });
  app.post("/api/integrations/:id/select", async (context) => {
    const input = z
      .object({ variantId: z.string().min(1).max(100) })
      .parse(await context.req.json());
    return context.json(
      await application.prepareIntegrationVariant(
        context.req.param("id"),
        input.variantId,
      ),
    );
  });
  app.get("/api/models", async (context) =>
    context.json(await application.modelConfiguration()),
  );
  app.post("/api/models/refresh", async (context) =>
    context.json(await application.refreshModelCatalog()),
  );
  app.put("/api/models/default", async (context) => {
    const input = z
      .object({ selection: modelSelectionSchema.nullable() })
      .parse(await context.req.json());
    return context.json(await application.updateDefaultModel(input.selection));
  });
  app.put("/api/models/research-distiller", async (context) => {
    const input = z
      .object({ selection: modelSelectionSchema.nullable() })
      .parse(await context.req.json());
    return context.json(
      await application.updateResearchDistillerModel(input.selection),
    );
  });
  app.put("/api/models/image", async (context) => {
    const input = z
      .object({ selection: modelSelectionSchema.nullable() })
      .parse(await context.req.json());
    return context.json(await application.updateImageModel(input.selection));
  });
  app.put("/api/models/execution", async (context) => {
    const input = z
      .object({
        maxSteps: z.union([z.literal(0), z.number().int().min(2).max(100)]),
        maxCostUsdMicros: z.number().int().min(1).optional(),
      })
      .parse(await context.req.json());
    return context.json(
      await application.updateExecutionSettings({
        maxSteps: input.maxSteps,
        ...(input.maxCostUsdMicros === undefined
          ? undefined
          : { maxCostUsdMicros: input.maxCostUsdMicros }),
      }),
    );
  });
  app.get("/api/model-providers/:id/runtime", async (context) =>
    context.json(
      await application.subscriptionRuntime(context.req.param("id")),
    ),
  );
  app.post("/api/model-providers/:id/runtime", async (context) =>
    context.json(
      await application.installSubscriptionRuntime(context.req.param("id")),
    ),
  );
  app.post("/api/model-providers/:id/runtime/cancel", async (context) =>
    context.json(
      await application.cancelSubscriptionRuntimeDownload(
        context.req.param("id"),
      ),
    ),
  );

  app.post("/api/model-providers/codex/login", async (context) =>
    context.json(await application.startCodexLogin()),
  );
  app.post("/api/model-providers/claude/login", async (context) =>
    context.json(await application.startClaudeLogin()),
  );
  app.post("/api/model-providers/:id", async (context) => {
    const providerId = modelProviderSchema.parse(context.req.param("id"));
    const input = z
      .object({
        apiKey: z.string().min(1),
        workspaceId: z.string().trim().max(128).optional(),
      })
      .parse(await context.req.json());
    return context.json(
      await application.connectModelProvider(
        providerId,
        input.apiKey,
        input.workspaceId,
      ),
    );
  });
  app.delete("/api/model-providers/:id", async (context) => {
    const providerId = modelProviderSchema.parse(context.req.param("id"));
    await application.disconnectModelProvider(providerId);
    return context.body(null, 204);
  });
  app.post("/api/connections/openrouter", async (context) => {
    const input = z
      .object({ apiKey: z.string().min(1) })
      .parse(await context.req.json());
    return context.json(await application.connectOpenRouter(input.apiKey));
  });
  app.delete("/api/connections/openrouter", async (context) => {
    await application.disconnectOpenRouter();
    return context.body(null, 204);
  });
  app.post("/api/connections/web-search", async (context) => {
    const input = z
      .object({ apiKey: z.string().min(1) })
      .parse(await context.req.json());
    return context.json(await application.connectWebSearch(input.apiKey));
  });
  app.get("/api/web-research", async (context) =>
    context.json(await application.webResearchConfiguration()),
  );
  app.put("/api/web-research", async (context) => {
    const input = z
      .object({
        searchProvider: z.enum(["exa", "parallel", "firecrawl"]),
        readerProvider: z.enum(["exa", "parallel", "firecrawl", "direct"]),
      })
      .parse(await context.req.json());
    return context.json(await application.updateWebResearch(input));
  });
  app.post("/api/web-research/providers/:id", async (context) => {
    const id = z
      .enum(["exa", "parallel", "firecrawl"])
      .parse(context.req.param("id"));
    const { apiKey } = z
      .object({ apiKey: z.string().min(1).max(20_000) })
      .parse(await context.req.json());
    return context.json(await application.connectWebProvider(id, apiKey));
  });
  app.delete("/api/web-research/providers/:id", async (context) => {
    const id = z
      .enum(["exa", "parallel", "firecrawl"])
      .parse(context.req.param("id"));
    await application.disconnectWebProvider(id);
    return context.body(null, 204);
  });
  app.delete("/api/connections/web-search", async (context) => {
    await application.disconnectWebSearch();
    return context.body(null, 204);
  });
  app.post("/api/connectors/custom", async (context) => {
    const input = z
      .object({
        name: z.string().optional(),
        endpoint: z.string().url(),
        credentialKind: z.enum(["oauth", "api-key", "none"]),
        header: z.string().optional(),
      })
      .parse(await context.req.json());
    return context.json(
      await application.prepareCustomRemoteMcp({
        endpoint: input.endpoint,
        credentialKind: input.credentialKind,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.header === undefined ? {} : { header: input.header }),
      }),
    );
  });
  app.post("/api/connectors/import/mcp", async (context) => {
    const input = z
      .object({
        configuration: z.string().trim().min(1).max(100_000),
        name: z.string().trim().min(1).max(100).optional(),
        credentialKind: z.enum(["oauth", "api-key", "none"]),
        header: z.string().trim().min(1).max(200).optional(),
      })
      .parse(await context.req.json());
    return context.json(
      await application.prepareImportedRemoteMcp({
        configuration: input.configuration,
        credentialKind: input.credentialKind,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.header === undefined ? {} : { header: input.header }),
      }),
    );
  });
  app.post("/api/connectors/custom/openapi", async (context) => {
    const input = z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        specUrl: z.string().url(),
        keyCreationUrl: z.string().url().optional(),
        credentialPlaceholder: z.string().trim().min(1).max(150).optional(),
      })
      .parse(await context.req.json());
    return context.json(
      await application.prepareCustomOpenApi({
        specUrl: input.specUrl,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.keyCreationUrl === undefined
          ? {}
          : { keyCreationUrl: input.keyCreationUrl }),
        ...(input.credentialPlaceholder === undefined
          ? {}
          : { credentialPlaceholder: input.credentialPlaceholder }),
      }),
    );
  });
  app.post("/api/connectors/:id", async (context) => {
    const input = connectorCredentialInputSchema.parse(
      await context.req.json(),
    );
    return context.json(
      await application.connectConnector(context.req.param("id"), input),
    );
  });
  app.post("/api/connectors/:id/disconnect", async (context) => {
    await application.disconnectConnector(context.req.param("id"));
    return context.body(null, 204);
  });
  app.post("/api/connectors/:id/hosted-credential", async (context) =>
    context.json(
      await application.enableConnectionHosted(context.req.param("id")),
    ),
  );
  app.delete("/api/connectors/:id/hosted-credential", async (context) =>
    context.json(
      await application.disableConnectionHosted(context.req.param("id")),
    ),
  );
  app.delete("/api/connectors/:id", async (context) => {
    await application.removeConnector(context.req.param("id"));
    return context.body(null, 204);
  });
  app.patch("/api/connectors/:id", async (context) => {
    const input = z
      .object({ name: z.string().trim().min(1).max(120) })
      .parse(await context.req.json());
    return context.json(
      await application.renameConnection(context.req.param("id"), input.name),
    );
  });
  app.post("/api/connectors/:id/oauth", async (context) => {
    const connectionReference = context.req.param("id");
    const input = z
      .object({
        returnTo: z.string().max(1_000).optional(),
        permissionSet: z.string().trim().min(1).max(80).optional(),
      })
      .parse(await context.req.json().catch(() => ({})));
    const returnTo = normalizeChatReturnPath(input.returnTo);
    if (input.returnTo && !returnTo) {
      throw new TypeError("OAuth can return only to a Springroll chat or run");
    }
    return context.json(
      await application.startConnectorOAuth(
        connectionReference,
        (connectionId, manifestId) =>
          connectorOAuthCallbackUrl(context.req.url, connectionId, manifestId),
        returnTo,
        input.permissionSet,
      ),
    );
  });
  app.get("/api/connectors/:id/oauth/callback", async (context) => {
    const finish = (returnTo?: string, error?: string) => {
      const path = connectorOAuthResultPath(returnTo, error);
      if (!desktopOAuthResult) return context.redirect(path);
      desktopOAuthResult(path);
      context.header("Cache-Control", "no-store");
      context.header("Referrer-Policy", "no-referrer");
      context.header(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      );
      return context.html(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Springroll sign-in</title><style>body{color-scheme:light dark;font:16px system-ui;margin:15vh auto;padding:24px;max-width:440px;line-height:1.6}h1{font-size:24px}</style></head><body><h1>${error ? "Sign-in couldn't finish" : "You're connected"}</h1><p>${error ? "Return to Springroll to see what happened and try again." : "Continue in the Springroll Mac app."}</p><p>You can close this browser tab.</p></body></html>`,
      );
    };
    const callbackReference = context.req.param("id");
    const redirectUrl = connectorOAuthCallbackUrl(
      context.req.url,
      callbackReference,
    );
    const state = context.req.query("state");
    let connectionId: string;
    let returnTo: string | undefined;
    try {
      connectionId = await application.resolveConnectorOAuthCallback(
        callbackReference,
        state,
        redirectUrl,
      );
      returnTo = normalizeChatReturnPath(
        await application.connectorOAuthReturnTo(connectionId, redirectUrl),
      );
    } catch (caught) {
      const message = boundedWorkflowError(
        caught instanceof Error ? caught.message : String(caught),
        "OAuth sign-in state is invalid. Start again.",
      );
      return finish(undefined, message);
    }
    const workflowReference = connectionWorkflowReference(returnTo);
    const error = context.req.query("error");
    if (error) {
      const description = boundedWorkflowError(
        context.req.query("error_description") ?? error,
        "OAuth sign-in failed. Try again.",
      );
      updateConnectionWorkflowAfterOAuthError(
        assistant,
        workflowReference,
        connectionId,
        description,
      );
      return finish(returnTo, description);
    }
    try {
      const code = z.string().min(1).parse(context.req.query("code"));
      const connection = await application.completeConnectorOAuth(
        connectionId,
        {
          code,
          ...(state === undefined ? {} : { state }),
          redirectUrl,
        },
      );
      if (assistant && workflowReference) {
        const workflow = assistant.getWorkflow(
          workflowReference.sessionId,
          workflowReference.workflowId,
        );
        if (workflow?.status !== "completed") {
          if (isPreparedOAuthConnectionWorkflow(workflow, connectionId)) {
            completeConnectionWorkflow(
              assistant,
              workflowReference.sessionId,
              workflowReference.workflowId,
              connection,
            );
          }
        }
      }
      return finish(returnTo);
    } catch (caught) {
      const message = boundedWorkflowError(
        caught instanceof Error ? caught.message : String(caught),
        "OAuth sign-in failed. Try again.",
      );
      updateConnectionWorkflowAfterOAuthError(
        assistant,
        workflowReference,
        connectionId,
        message,
        caught instanceof ConnectionTestError ? caught : undefined,
      );
      return finish(returnTo, message);
    }
  });
  app.post("/api/connections/neon", async (context) => {
    const input = z
      .object({
        url: z.string().url(),
        token: z.string().optional(),
      })
      .parse(await context.req.json());
    return context.json(
      await application.connectNeon({
        url: input.url,
        ...(input.token === undefined ? undefined : { token: input.token }),
      }),
    );
  });
  app.delete("/api/connections/neon", async (context) => {
    await application.disconnectNeon();
    return context.body(null, 204);
  });

  app.post("/api/chats", async (context) => {
    if (!assistant) return assistantUnavailable(context);
    const input = z
      .object({ title: z.string().min(1).max(200).optional() })
      .strict()
      .parse(await context.req.json());
    return context.json(assistant.createSession(input.title), 201);
  });
  app.post("/api/chats/entry", async (context) => {
    if (!assistant) return assistantUnavailable(context);
    const input = z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        mode: chatSessionEntryModeSchema.optional().default("resume"),
        context: chatSessionContextSchema,
        modelSelection: modelSelectionSchema.nullable().optional(),
      })
      .strict()
      .parse(await context.req.json());
    await validateChatEntry(application, input.context);
    if (input.modelSelection) {
      await assertSelectableChatModel(application, input.modelSelection);
    }
    return context.json(
      assistant.createOrResumeSession({
        ...(input.title ? { title: input.title } : undefined),
        mode: input.mode,
        context: input.context,
        ...(input.modelSelection === undefined
          ? undefined
          : { modelSelection: input.modelSelection }),
      }),
      201,
    );
  });
  app.get("/api/chats", (context) => {
    if (!assistant) return assistantUnavailable(context);
    const includeArchived = z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true")
      .parse(context.req.query("includeArchived"));
    return context.json(assistant.listSessions(includeArchived));
  });
  app.get("/api/chats/:id", (context) => {
    if (!assistant) return assistantUnavailable(context);
    const detail = assistant.getSession(
      context.req.param("id"),
      context.req.query("progress") !== "1",
    );
    return detail
      ? context.json({
          ...detail,
          googleDataProtected: application.isGoogleDataProtected?.(
            `chat:${context.req.param("id")}`,
          ),
        })
      : context.json({ error: "Chat session not found" }, 404);
  });
  app.patch("/api/chats/:id", async (context) => {
    if (!assistant) return assistantUnavailable(context);
    const input = z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        status: z.literal("active").optional(),
        modelSelection: modelSelectionSchema.nullable().optional(),
      })
      .strict()
      .refine(
        (value) =>
          value.title !== undefined ||
          value.status !== undefined ||
          value.modelSelection !== undefined,
        {
          message: "A title, status, or model update is required",
        },
      )
      .parse(await context.req.json());
    try {
      if (input.modelSelection) {
        await assertSelectableChatModel(application, input.modelSelection);
      }
      if (input.title !== undefined) {
        assistant.renameSession(context.req.param("id"), input.title);
      }
      if (input.status === "active") {
        assistant.restoreSession(context.req.param("id"));
      }
      if (input.modelSelection !== undefined) {
        assistant.updateSessionModel(
          context.req.param("id"),
          input.modelSelection,
        );
      }
      return context.json(
        assistant.getSession(context.req.param("id"))?.session,
      );
    } catch (error) {
      if (error instanceof AssistantSessionNotFoundError) {
        return context.json({ error: "Chat session not found" }, 404);
      }
      throw error;
    }
  });
  app.put("/api/chats/:id/context", async (context) => {
    if (!assistant) return assistantUnavailable(context);
    const sessionContext = chatSessionContextSchema.parse(
      await context.req.json(),
    );
    await validateChatEntry(application, sessionContext);
    try {
      return context.json(
        assistant.updateSessionContext(context.req.param("id"), sessionContext),
      );
    } catch (error) {
      if (error instanceof AssistantSessionNotFoundError) {
        return context.json({ error: "Chat session not found" }, 404);
      }
      throw error;
    }
  });
  app.delete("/api/chats/:id", (context) => {
    if (!assistant) return assistantUnavailable(context);
    try {
      assistant.archiveSession(context.req.param("id"));
      return context.body(null, 204);
    } catch (error) {
      if (isUnknownChatSession(error)) {
        return context.json({ error: "Chat session not found" }, 404);
      }
      throw error;
    }
  });
  app.delete("/api/chats/:id/permanent", async (context) => {
    if (!assistant) return assistantUnavailable(context);
    try {
      await assistant.deleteSession(context.req.param("id"));
      return context.body(null, 204);
    } catch (error) {
      if (error instanceof AssistantSessionNotFoundError) {
        return context.json({ error: "Chat session not found" }, 404);
      }
      throw error;
    }
  });
  app.post("/api/chats/:id/cancel", (context) => {
    if (!assistant) return assistantUnavailable(context);
    try {
      return context.json({
        cancelled: assistant.cancelSession(context.req.param("id")),
      });
    } catch (error) {
      if (error instanceof AssistantSessionNotFoundError) {
        return context.json({ error: "Chat session not found" }, 404);
      }
      throw error;
    }
  });
  app.post(
    "/api/chats/:id/workflows/:workflowId/prepare-connection",
    async (context) => {
      if (!assistant) return assistantUnavailable(context);
      const sessionId = context.req.param("id");
      const workflowId = context.req.param("workflowId");
      const workflow = assistant.getWorkflow(sessionId, workflowId);
      if (!workflow) {
        return context.json({ error: "Chat workflow not found" }, 404);
      }
      if (workflow.kind !== "connection_setup") {
        return context.json(
          { error: "This workflow is not a connection proposal" },
          409,
        );
      }
      if (
        workflow.status === "completed" &&
        workflow.subjectKind === "connection" &&
        workflow.subjectId
      ) {
        const existing = await findConnectedConnection(
          application,
          workflow.subjectId,
        );
        if (existing) {
          return context.json({ status: "connected", connection: existing });
        }
      }
      if (
        workflow.status !== "proposed" &&
        workflow.status !== "waiting_for_user"
      ) {
        return context.json(
          { error: `Connection workflow is ${workflow.status}` },
          409,
        );
      }
      const input = z
        .object({ variantId: z.string().min(1).max(100) })
        .parse(await context.req.json());
      const payload = connectionProposalWorkflowSchema.parse(workflow.payload);
      const variant = payload.proposal.variants.find(
        (candidate) => candidate.id === input.variantId,
      );
      if (!variant) {
        throw new TypeError("That connection setup option was not proposed");
      }
      assistant.updateWorkflow(sessionId, workflowId, {
        status: "in_progress",
      });
      let preparedOutcome:
        | {
            readonly phase: "prepared";
            readonly connectorId: string;
            readonly variantId: string;
            readonly credentialKind: "oauth" | "api-key" | "none";
          }
        | undefined;
      try {
        const connection = await application.prepareIntegrationVariant(
          payload.proposal.templateId,
          variant.id,
          payload.proposal.manifest,
        );
        preparedOutcome = {
          phase: "prepared" as const,
          connectorId: connection.id,
          variantId: variant.id,
          credentialKind: variant.credentialKind,
        };
        if (variant.credentialKind === "api-key") {
          assistant.updateWorkflow(sessionId, workflowId, {
            status: "waiting_for_user",
            subject: { kind: "connection", id: connection.id },
            outcome: preparedOutcome,
          });
          return context.json({
            status: "awaiting_api_key",
            connection,
          } satisfies ConnectionWorkflowActionDto);
        }
        if (variant.credentialKind === "none") {
          const connected = await application.connectConnector(
            connection.id,
            {},
          );
          completeConnectionWorkflow(
            assistant,
            sessionId,
            workflowId,
            connected,
          );
          return context.json({
            status: "connected",
            connection: connected,
          } satisfies ConnectionWorkflowActionDto);
        }

        const oauthReference = connectorProviderId(connection);
        const returnTo = connectionWorkflowReturnPath(
          sessionId,
          workflowId,
          oauthReference,
        );
        const oauth = await application.startConnectorOAuth(
          oauthReference,
          (connectionId, manifestId) =>
            connectorOAuthCallbackUrl(
              context.req.url,
              connectionId,
              manifestId,
            ),
          returnTo,
        );
        if (oauth.status === "connected") {
          completeConnectionWorkflow(
            assistant,
            sessionId,
            workflowId,
            oauth.connection,
          );
          return context.json(oauth satisfies ConnectionWorkflowActionDto);
        }
        assistant.updateWorkflow(sessionId, workflowId, {
          status: "waiting_for_user",
          subject: { kind: "connection", id: oauth.connectionId },
          outcome: {
            ...preparedOutcome,
            connectorId: oauth.connectionId,
          },
        });
        return context.json({
          ...oauth,
          connection: {
            ...connection,
            id: oauth.connectionId,
          },
        } satisfies ConnectionWorkflowActionDto);
      } catch (error) {
        const message = safeWorkflowError(
          error,
          "Connection setup failed. Check the connector requirements and try again.",
        );
        assistant.updateWorkflow(sessionId, workflowId, {
          status: "waiting_for_user",
          ...(preparedOutcome
            ? {
                subject: {
                  kind: "connection" as const,
                  id: preparedOutcome.connectorId,
                },
                outcome: {
                  ...preparedOutcome,
                  ceremony: safeConnectionCeremonyFailure(message),
                  ...(error instanceof ConnectionTestError
                    ? { connectionTest: { ...error.test, error: message } }
                    : {}),
                },
              }
            : {}),
          error: message,
        });
        if (error instanceof ConnectionTestError) {
          void assistant
            .continueConnectionWorkflow(sessionId, workflowId)
            .then(consumeBackgroundAssistantResponse)
            .catch(() => undefined);
        }
        return context.json({ error: message }, 500);
      }
    },
  );
  app.post(
    "/api/chats/:id/workflows/:workflowId/connect-key",
    async (context) => {
      if (!assistant) return assistantUnavailable(context);
      const sessionId = context.req.param("id");
      const workflowId = context.req.param("workflowId");
      const workflow = assistant.getWorkflow(sessionId, workflowId);
      if (!workflow) {
        return context.json({ error: "Chat workflow not found" }, 404);
      }
      if (
        workflow.kind !== "connection_setup" ||
        workflow.status !== "waiting_for_user"
      ) {
        return context.json({ error: "Connection workflow is not ready" }, 409);
      }
      const prepared = preparedConnectionWorkflowOutcomeSchema.parse(
        workflow.outcome,
      );
      if (prepared.credentialKind !== "api-key") {
        return context.json(
          { error: "This connection does not use an API key" },
          409,
        );
      }
      const input = connectorCredentialInputSchema.parse(
        await context.req.json(),
      );
      assistant.updateWorkflow(sessionId, workflowId, {
        status: "in_progress",
      });
      try {
        const connected = await application.connectConnector(
          prepared.connectorId,
          input,
        );
        completeConnectionWorkflow(assistant, sessionId, workflowId, connected);
        return context.json({
          status: "connected",
          connection: connected,
        } satisfies ConnectionWorkflowActionDto);
      } catch (error) {
        const message = safeCredentialWorkflowError(
          error,
          [input.apiKey, input.fields?.username, input.fields?.password].filter(
            (value): value is string => Boolean(value),
          ),
          "Connection test failed. Check the credential and try again.",
        );
        assistant.updateWorkflow(sessionId, workflowId, {
          status: "waiting_for_user",
          outcome: {
            ...prepared,
            ceremony: safeConnectionCeremonyFailure(message),
            ...(error instanceof ConnectionTestError
              ? { connectionTest: { ...error.test, error: message } }
              : {}),
          },
          error: message,
        });
        if (error instanceof ConnectionTestError) {
          void assistant
            .continueConnectionWorkflow(sessionId, workflowId)
            .then(consumeBackgroundAssistantResponse)
            .catch(() => undefined);
        }
        return context.json(
          { error: message },
          error instanceof TypeError ? 400 : 500,
        );
      }
    },
  );
  app.post(
    "/api/chats/:id/workflows/:workflowId/decline-connection",
    async (context) => {
      if (!assistant) return assistantUnavailable(context);
      const sessionId = context.req.param("id");
      const workflowId = context.req.param("workflowId");
      const workflow = assistant.getWorkflow(sessionId, workflowId);
      if (!workflow) {
        return context.json({ error: "Chat workflow not found" }, 404);
      }
      if (workflow.kind !== "connection_setup") {
        return context.json(
          { error: "This workflow is not a connection proposal" },
          409,
        );
      }
      if (
        workflow.status !== "proposed" &&
        workflow.status !== "waiting_for_user"
      ) {
        return context.json(
          { error: `Connection workflow is ${workflow.status}` },
          409,
        );
      }
      assistant.updateWorkflow(sessionId, workflowId, {
        status: "cancelled",
        outcome: {
          state: "declined",
          retryable: true,
          ...(workflow.subjectKind === "connection" && workflow.subjectId
            ? { connectorId: workflow.subjectId }
            : undefined),
        },
      });
      void assistant
        .continueConnectionWorkflow(sessionId, workflowId)
        .then(consumeBackgroundAssistantResponse)
        .catch(() => undefined);
      return context.json({
        status: "declined",
      } satisfies ConnectionWorkflowActionDto);
    },
  );
  app.post(
    "/api/chats/:id/workflows/:workflowId/continue-connection",
    async (context) => {
      if (!assistant) return assistantUnavailable(context);
      const sessionId = context.req.param("id");
      const detail = assistant.getSession(sessionId);
      if (!detail) {
        return context.json({ error: "Chat session not found" }, 404);
      }
      const latestTurn = detail.turns.at(-1);
      const hasDurableUserInput = latestTurn
        ? detail.messages.some(
            (message) =>
              message.role === "user" &&
              message.metadata?.turnId === latestTurn.id,
          )
        : false;
      if (
        !latestTurn ||
        (latestTurn.status !== "failed" && latestTurn.status !== "cancelled") ||
        hasDurableUserInput
      ) {
        return context.json(
          { error: "There is no failed connection follow-up to retry" },
          409,
        );
      }
      const response = await assistant.continueConnectionWorkflow(
        sessionId,
        context.req.param("workflowId"),
      );
      if (!response) {
        return context.json(
          { error: "This connection workflow does not need a follow-up" },
          409,
        );
      }
      void consumeBackgroundAssistantResponse(response).catch(() => undefined);
      return context.json({ status: "continuing" }, 202);
    },
  );
  app.post("/api/chats/:id/messages", async (context) => {
    if (!assistant) return assistantUnavailable(context);
    const input = z
      .union([
        z.object({ message: z.unknown() }).strict(),
        z
          .object({
            approvals: z
              .array(
                z
                  .object({
                    id: z.string().trim().min(1).max(200),
                    approved: z.boolean(),
                    reason: z.string().trim().min(1).max(2_000).optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(32),
          })
          .strict(),
      ])
      .parse(await context.req.json());
    try {
      return await assistant.respond(
        context.req.param("id"),
        "message" in input ? input.message : input,
      );
    } catch (error) {
      if (error instanceof AssistantSessionNotFoundError) {
        return context.json({ error: "Chat session not found" }, 404);
      }
      if (error instanceof AssistantTurnConflictError) {
        return context.json(
          { error: "A response is already in progress" },
          409,
        );
      }
      if (error instanceof AssistantApprovalNotFoundError) {
        return context.json(
          { error: "Chat approval is no longer pending" },
          409,
        );
      }
      if (error instanceof TypeError || error instanceof z.ZodError) {
        throw error;
      }
      return context.json({ error: "Assistant response failed" }, 500);
    }
  });

  if (mcp) {
    app.all("/mcp", (context) => mcp.fetch(context.req.raw));
  }

  app.onError((error, context) => {
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? "Invalid request")
        : error instanceof Error
          ? error.message
          : String(error);
    const status =
      error instanceof z.ZodError || error instanceof TypeError ? 400 : 500;

    return context.json({ error: message }, status);
  });

  if (assets) {
    app.get("/assets/:file", async (context) => {
      const response = await assets.read(context.req.param("file"));
      if (!response) {
        return context.notFound();
      }
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-store");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    });
    app.get("*", (context) =>
      context.html(assets.indexHtml, 200, {
        "cache-control": "no-store",
      }),
    );
  }

  return app;
}

function assistantUnavailable(context: Context) {
  return context.json({ error: "Assistant is unavailable" }, 503);
}

async function assertSelectableChatModel(
  application: AppApi,
  selection: z.infer<typeof modelSelectionSchema>,
): Promise<void> {
  const configuration = await application.modelConfiguration();
  if (
    !configuration.recipeModels.some(
      (model) =>
        model.providerId === selection.providerId &&
        model.modelId === selection.modelId,
    )
  ) {
    throw new TypeError(
      "Choose a model available through a connected AI provider",
    );
  }
}

async function validateChatEntry(
  application: AppApi,
  context: ChatSessionContext,
): Promise<void> {
  const expectedSubject =
    context.intent === "run.diagnose"
      ? "run"
      : context.intent === "task.manage"
        ? "task"
        : context.intent === "connection.manage"
          ? "connection"
          : undefined;
  if (
    expectedSubject &&
    (context.subjects.length !== 1 ||
      context.subjects[0]?.kind !== expectedSubject)
  ) {
    throw new TypeError(
      `${context.intent} requires exactly one ${expectedSubject} reference`,
    );
  }
  if (
    !expectedSubject &&
    (context.intent === "general" || context.intent.endsWith(".create")) &&
    context.subjects.length > 0
  ) {
    throw new TypeError(`${context.intent} does not accept entity references`);
  }

  let connectionIds: Set<string> | undefined;
  for (const subject of context.subjects) {
    if (subject.kind === "run" && !(await application.getRun(subject.id))) {
      throw new TypeError(`Unknown run: ${subject.id}`);
    }
    if (subject.kind === "task" && !(await application.getTask(subject.id))) {
      throw new TypeError(`Unknown task: ${subject.id}`);
    }
    if (subject.kind === "connection") {
      connectionIds ??= new Set(
        (await application.listConnections()).map(
          (connection) => connection.id,
        ),
      );
      if (!connectionIds.has(subject.id)) {
        throw new TypeError(`Unknown connection: ${subject.id}`);
      }
    }
  }
}

function normalizeChatReturnPath(
  value: string | undefined,
): string | undefined {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return undefined;
  }
  try {
    const url = new URL(value, "http://springroll.local");
    if (
      url.origin !== "http://springroll.local" ||
      !/^\/(chat|inbox)\/[^/]+$/.test(url.pathname) ||
      url.hash
    ) {
      return undefined;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return undefined;
  }
}

async function findConnectedConnection(
  application: AppApi,
  id: string,
): Promise<ConnectionCardDto | undefined> {
  return (await application.listConnections()).find(
    (connection) => connection.id === id && connection.status === "connected",
  );
}

function completeConnectionWorkflow(
  assistant: AssistantApi,
  sessionId: string,
  workflowId: string,
  connection: ConnectionCardDto,
): void {
  assistant.updateWorkflow(sessionId, workflowId, {
    status: "completed",
    error: null,
    subject: { kind: "connection", id: connection.id },
    outcome: {
      connected: true,
      toolsDiscovered: true,
      connectorId: connection.id,
      toolCount: connection.toolCount ?? connection.tools?.length ?? 0,
      ...(connection.connectionTest
        ? { connectionTest: { ...connection.connectionTest } }
        : {}),
    },
  });
  const existingContext = assistant.getSession(sessionId)?.session.context;
  const hasBroaderGoal =
    existingContext &&
    existingContext.intent !== "connection.create" &&
    existingContext.intent !== "connection.manage";
  assistant.updateSessionContext(
    sessionId,
    hasBroaderGoal
      ? {
          ...existingContext,
          subjects: [
            ...existingContext.subjects.filter(
              (subject) =>
                subject.kind !== "connection" || subject.id !== connection.id,
            ),
            { kind: "connection" as const, id: connection.id },
          ].slice(-8),
        }
      : {
          version: 1,
          intent: "connection.manage",
          origin: "connections",
          subjects: [{ kind: "connection", id: connection.id }],
        },
  );
  if (!hasBroaderGoal) return;
  void assistant
    .continueConnectionWorkflow(sessionId, workflowId)
    .then(consumeBackgroundAssistantResponse)
    .catch(() => undefined);
}

async function consumeBackgroundAssistantResponse(
  response: Response | undefined,
): Promise<void> {
  if (!response?.body) return;
  await response.body.pipeTo(new WritableStream());
}

function connectionWorkflowReturnPath(
  sessionId: string,
  workflowId: string,
  connectorId: string,
): string {
  const params = new URLSearchParams({
    workflow: workflowId,
    connector: connectorId,
  });
  return `/chat/${encodeURIComponent(sessionId)}?${params.toString()}`;
}

const desktopOAuthLocalhostConnectorIds: ReadonlySet<string> = new Set([
  "outlook",
  "onedrive",
  "microsoft-teams",
  "sharepoint",
  "slack",
]);

function connectorOAuthCallbackUrl(
  requestUrl: string,
  callbackReference: string,
  manifestId?: string,
): string {
  const baseUrl = new URL(requestUrl);
  if (
    manifestId !== undefined &&
    desktopOAuthLocalhostConnectorIds.has(manifestId) &&
    (baseUrl.hostname === "127.0.0.1" || baseUrl.hostname === "[::1]")
  ) {
    baseUrl.hostname = "localhost";
  }
  return new URL(
    `/api/connectors/${encodeURIComponent(callbackReference)}/oauth/callback`,
    baseUrl,
  ).toString();
}

function safeWorkflowError(error: unknown, fallback: string): string {
  if (error instanceof LocalMcpProcessError) {
    return "The verified local MCP package could not start. Check your network and npm access, then try the local setup again.";
  }
  return boundedWorkflowError(
    error instanceof TypeError || error instanceof ConnectionTestError
      ? error.message
      : "",
    fallback,
  );
}

function safeCredentialWorkflowError(
  error: unknown,
  credentials: readonly string[],
  fallback: string,
): string {
  return credentials.reduce(
    (message, credential) =>
      message.includes(credential)
        ? message.split(credential).join("[redacted]")
        : message,
    safeWorkflowError(error, fallback),
  );
}

function boundedWorkflowError(value: string, fallback: string): string {
  return value.trim().slice(0, 1_000) || fallback;
}

function connectionWorkflowReference(
  returnTo: string | undefined,
): { readonly sessionId: string; readonly workflowId: string } | undefined {
  if (!returnTo) return undefined;
  try {
    const url = new URL(returnTo, "http://springroll.local");
    const match = /^\/chat\/([^/]+)$/.exec(url.pathname);
    const workflowId = url.searchParams.get("workflow")?.trim();
    if (!match?.[1] || !workflowId || workflowId.length > 100) return undefined;
    return {
      sessionId: decodeURIComponent(match[1]),
      workflowId,
    };
  } catch {
    return undefined;
  }
}

function updateConnectionWorkflowAfterOAuthError(
  assistant: AssistantApi | undefined,
  reference:
    | { readonly sessionId: string; readonly workflowId: string }
    | undefined,
  manifestId: string,
  error: string,
  testError?: ConnectionTestError,
): void {
  if (!assistant || !reference) return;
  const workflow = assistant.getWorkflow(
    reference.sessionId,
    reference.workflowId,
  );
  const setup = preparedConnectionWorkflowOutcomeSchema.safeParse(
    workflow?.outcome,
  );
  const preparedSetup =
    isPreparedOAuthConnectionWorkflow(workflow, manifestId) && setup.success;
  if (
    !preparedSetup ||
    workflow?.status === "completed" ||
    workflow?.status === "failed" ||
    workflow?.status === "cancelled"
  ) {
    return;
  }
  assistant.updateWorkflow(reference.sessionId, reference.workflowId, {
    status: "waiting_for_user",
    outcome: {
      ...(setup.success ? setup.data : {}),
      ceremony: safeConnectionCeremonyFailure(error),
      ...(testError ? { connectionTest: { ...testError.test, error } } : {}),
    },
    error,
  });
  if (testError) {
    void assistant
      .continueConnectionWorkflow(reference.sessionId, reference.workflowId)
      .then(consumeBackgroundAssistantResponse)
      .catch(() => undefined);
  }
}

function safeConnectionCeremonyFailure(error: string): {
  readonly state: "failed" | "expired";
  readonly retryable: true;
} {
  return {
    state: /\b(expired|expiration)\b/i.test(error) ? "expired" : "failed",
    retryable: true,
  };
}

function isPreparedOAuthConnectionWorkflow(
  workflow: ReturnType<AssistantApi["getWorkflow"]>,
  manifestId: string,
): boolean {
  if (
    workflow?.kind !== "connection_setup" ||
    workflow.subjectKind !== "connection" ||
    workflow.subjectId !== manifestId
  ) {
    return false;
  }
  const prepared = preparedConnectionWorkflowOutcomeSchema.safeParse(
    workflow.outcome,
  );
  return (
    prepared.success &&
    prepared.data.credentialKind === "oauth" &&
    prepared.data.connectorId === manifestId
  );
}

function connectorOAuthResultPath(
  returnTo: string | undefined,
  error?: string,
): string {
  const target = new URL(
    returnTo ?? "/integrations",
    "http://springroll.local",
  );
  if (error) target.searchParams.set("oauthError", error);
  else target.searchParams.set("oauth", "connected");
  return `${target.pathname}${target.search}`;
}

function isUnknownChatSession(error: unknown): boolean {
  return (
    error instanceof Error && error.message.startsWith("Unknown chat session:")
  );
}

function parseEventCursor(value: string | undefined): number | undefined {
  if (value === undefined || !/^(0|[1-9]\d*)$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function artifactFilename(title: string, mediaType: string): string {
  const stem =
    title
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "generated-image";
  const extension =
    mediaType === "image/jpeg"
      ? "jpg"
      : mediaType === "image/webp"
        ? "webp"
        : "png";
  return `${stem}.${extension}`;
}
