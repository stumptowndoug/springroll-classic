import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  type AgentRunner,
  AiSdkAssistant,
  type ConnectorManifest,
  type CredentialStore,
  connections as connectionTable,
  createHackerNewsToolSource,
  createMarkdownRunResult,
  createNativeToolSource,
  credentialAuditEvents,
  type FetchApi,
  type HostedCredentialVault,
  type HostedCredentialVaultKey,
  imageGenerationConnectionId,
  imageGenerationSourceId,
  imageGenerationToolInputSchema,
  inspectRecipeHistoryToolName,
  integrationManifests,
  type LocalTaskRunHost,
  modelCalls,
  OpenRouterModelConnection,
  openLocalDatabase,
  runs as runTable,
  SqliteChatStore,
  SqliteRecipeKnowledgeStore,
  SqliteRunCheckpointStore,
  SqliteToolApprovalStore,
  type ToolDescriptor,
  type ToolSource,
  tasks as taskTable,
  taskTools as taskToolTable,
  toolApprovals as toolApprovalTable,
  updateTaskNotesToolName,
  webFetchProviderToolCapability,
  webSearchProviderToolCapability,
} from "@springroll/kernel";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { eq } from "drizzle-orm";
import {
  oneClickIntegrationState,
  oneClickIntegrations,
} from "../src/client/connection-catalog.ts";
import {
  LocalApplication,
  type LocalApplicationOptions,
  modelFacingJsonSchema,
  type ResolveModelExecution,
} from "../src/server/application.ts";
import { createSpringrollApplicationTools } from "../src/server/assistant-tools.ts";
import {
  chatExecutionLimits,
  readRecipeExecutionLimits,
} from "../src/server/execution-settings.ts";
import {
  GoogleDataProtection,
  withGoogleDataAccess,
} from "../src/server/google-data-protection.ts";
import { type AssistantApi, createHttpApp } from "../src/server/http-app.ts";
import type {
  IntegrationResearcher,
  LocalMcpIntegrationResearcher,
} from "../src/server/integration-researcher.ts";
import { VerifiedOpenApiResearcher } from "../src/server/integration-researcher.ts";
import { chooseModelExecution } from "../src/server/model-selection.ts";
import { connectionLogoSeeds } from "../src/server/provider-logos.ts";
import {
  exaCredentialRef,
  openRouterCredentialRef,
  webConnectionId,
} from "../src/server/sources.ts";
import type {
  ConnectionCardDto,
  TaskProposalDto,
  TaskProposalOutcomeDto,
  TaskToolRepairProposalOutcomeDto,
} from "../src/shared.ts";

const hackerNewsConnectionId = "fixture-hacker-news";
const hackerNewsSourceId = "native.hacker-news";

class MemoryCredentialStore implements CredentialStore {
  readonly values = new Map<string, string>();

  async get(reference: string): Promise<string | undefined> {
    return this.values.get(reference);
  }

  async put(reference: string, secret: string): Promise<void> {
    this.values.set(reference, secret);
  }

  async delete(reference: string): Promise<void> {
    this.values.delete(reference);
  }
}

class MemoryHostedCredentialVault implements HostedCredentialVault {
  readonly values = new Map<string, string>();

  async get(key: HostedCredentialVaultKey): Promise<string | undefined> {
    return this.values.get(this.key(key));
  }

  async put(key: HostedCredentialVaultKey, secret: string): Promise<void> {
    this.values.set(this.key(key), secret);
  }

  async delete(key: HostedCredentialVaultKey): Promise<void> {
    this.values.delete(this.key(key));
  }

  private key(key: HostedCredentialVaultKey): string {
    return `${key.accountId}:${key.credentialRef}`;
  }
}

const now = new Date("2026-07-30T12:00:00.000Z");
const agent: AgentRunner = {
  async run(request) {
    expect(
      request.tools
        .map((tool) => tool.descriptor.name)
        .filter(
          (name) =>
            name !== inspectRecipeHistoryToolName &&
            name !== updateTaskNotesToolName,
        ),
    ).toEqual(["get_hacker_news_top_stories"]);
    return {
      result: createMarkdownRunResult({
        body: "I read the top Hacker News stories. AI and local-first software led the discussion.",
        fallbackSummary: "AI and local-first software led Hacker News.",
        summary: "AI and local-first software led Hacker News.",
      }),
      toolCalls: [],
      usage: {
        provider: "openrouter",
        modelId: "test-model",
        billing: "metered",
        inputTokens: 30,
        outputTokens: 12,
        cachedInputTokens: 5,
        reasoningTokens: 3,
        totalTokens: 42,
        costUsdMicros: 120,
        actualCostUsdMicros: 120,
        estimatedCostUsdMicros: 110,
        costSource: "provider_reported",
        webSearchRequests: 1,
      },
      startedAt: now,
      finishedAt: new Date(now.getTime() + 1_000),
    };
  },
};

const resolveModelExecution: ResolveModelExecution = async (
  taskSelection,
  requiredCapabilities,
) =>
  chooseModelExecution({
    taskSelection,
    automaticSelections: [{ providerId: "openrouter", modelId: "test/model" }],
    connectedProviders: new Set(["openrouter"]),
    requiredCapabilities,
    portableCapabilities: new Set([
      webSearchProviderToolCapability,
      webFetchProviderToolCapability,
    ]),
  });

const databases: ReturnType<typeof openLocalDatabase>[] = [];

test("recipe deletion atomically removes old owned conversations and preserves them on active conflicts", async () => {
  const { application, database } = createHarness();
  const task = await application.createTask(
    readyProposal(
      await directTaskProposal(
        application,
        "Summarize Hacker News every morning",
      ),
    ),
    false,
  );
  const chats = new SqliteChatStore(database.db);
  for (let index = 0; index < 101; index += 1) {
    database.db
      .insert(runTable)
      .values({
        id: `owned-${index}`,
        taskId: task.id,
        scheduledTime: new Date(now.getTime() + index),
        status: index === 0 ? "running" : "succeeded",
        executionLocation: "local",
      })
      .run();
  }
  const session = chats.createSession({
    context: {
      version: 1,
      intent: "run.diagnose",
      origin: "runs",
      subjects: [{ kind: "run", id: "owned-0" }],
    },
  });
  const http = createHttpApp(application);
  expect(
    (await application.listRuns()).some((run) => run.id === "owned-0"),
  ).toBe(false);
  expect(
    (await http.request(`/api/tasks/${task.id}`, { method: "DELETE" })).status,
  ).toBe(409);
  expect(chats.getSession(session.id)).toBeDefined();
  database.db
    .update(runTable)
    .set({ status: "succeeded" })
    .where(eq(runTable.id, "owned-0"))
    .run();
  expect(
    (await http.request(`/api/tasks/${task.id}`, { method: "DELETE" })).status,
  ).toBe(204);
  expect(chats.getSession(session.id)).toBeUndefined();
  expect(database.db.select().from(runTable).all()).toHaveLength(0);
});

test("run deletion leaves an active linked chat intact", async () => {
  const { application, database } = createHarness();
  const task = await application.createTask(
    readyProposal(
      await directTaskProposal(
        application,
        "Summarize Hacker News every morning",
      ),
    ),
    false,
  );
  database.db
    .insert(runTable)
    .values({
      id: "chat-owned",
      executionLocation: "local",
      taskId: task.id,
      scheduledTime: now,
      status: "succeeded",
    })
    .run();
  const chats = new SqliteChatStore(database.db);
  const session = chats.createSession({
    context: {
      version: 1,
      intent: "run.diagnose",
      origin: "runs",
      subjects: [{ kind: "run", id: "chat-owned" }],
    },
  });
  chats.createTurn(session.id);
  expect(await application.deleteRun("chat-owned")).toBe("active");
  expect(chats.getSession(session.id)?.activeTurnId).toBeTruthy();
  expect(await application.getRun("chat-owned")).toBeDefined();
  const response = await createHttpApp(application).request(
    "/api/runs/chat-owned",
    { method: "DELETE" },
  );
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("linked chat");
});

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

function createHarness(
  selectedResolver: ResolveModelExecution = resolveModelExecution,
  selectedAgent: AgentRunner = agent,
  selectedNow: () => Date = () => now,
  selectedFetch: FetchApi = async () => Response.json({ results: [] }),
  integrationResearcher?: IntegrationResearcher,
  extraToolSources?: readonly ToolSource[],
  localMcpResearcher?: LocalMcpIntegrationResearcher,
  seedHackerNewsFixture = true,
  connectorOAuthClients?: LocalApplicationOptions["connectorOAuthClients"],
  hostedCredentials?: LocalApplicationOptions["hostedCredentials"],
  modelProviderOptions: Pick<
    LocalApplicationOptions,
    | "claudeSubscription"
    | "codexSubscription"
    | "standardModels"
    | "subscriptionRuntimes"
  > = {},
) {
  const database = openLocalDatabase({ filename: ":memory:" });
  databases.push(database);
  const credentials = new MemoryCredentialStore();
  const models = new OpenRouterModelConnection(credentials, {
    fetch: async () => Response.json({ data: { label: "test-key" } }),
  });
  const application = new LocalApplication(database.db, {
    credentials,
    models,
    modelCatalog: {
      async read() {
        return {
          models: [
            {
              providerId: "openrouter",
              modelId: "test/model",
              name: "Test Model",
              contextTokens: 128_000,
              inputUsdPerMillionTokens: 1,
              outputUsdPerMillionTokens: 3,
              reasoning: true,
              toolCall: true,
              inputModalities: ["text"],
            },
          ],
          imageModels: [
            {
              providerId: "openrouter",
              modelId: "google/gemini-image-test",
              name: "Gemini Image Test",
              reasoning: false,
              toolCall: false,
              inputModalities: ["text"],
            },
          ],
          updatedAt: now,
          stale: false,
        };
      },
    },
    agent: selectedAgent,
    resolveModelExecution: selectedResolver,
    ...(integrationResearcher ? { integrationResearcher } : {}),
    ...(localMcpResearcher ? { localMcpResearcher } : {}),
    openApiResearcher: new VerifiedOpenApiResearcher({ fetch: selectedFetch }),
    extraToolSources: [
      ...(seedHackerNewsFixture
        ? [createHackerNewsToolSource({ fetch: selectedFetch })]
        : []),
      ...(extraToolSources ?? []),
    ],
    now: selectedNow,
    fetch: selectedFetch,
    ...(connectorOAuthClients ? { connectorOAuthClients } : {}),
    ...(hostedCredentials ? { hostedCredentials } : {}),
    ...modelProviderOptions,
  });
  application.ensureBuiltinConnections();
  if (seedHackerNewsFixture) {
    database.db
      .insert(connectionTable)
      .values({
        id: hackerNewsConnectionId,
        name: "Hacker News",
        sourceId: hackerNewsSourceId,
        credentialRef: "none",
        config: {},
        availableIn: ["local", "hosted"],
      })
      .run();
  }

  return { application, credentials, database };
}

function createModelProviderHarness(
  modelProviderOptions: Pick<
    LocalApplicationOptions,
    | "claudeSubscription"
    | "codexSubscription"
    | "standardModels"
    | "subscriptionRuntimes"
  >,
) {
  return createHarness(
    resolveModelExecution,
    agent,
    () => now,
    async () => Response.json({ results: [] }),
    undefined,
    undefined,
    undefined,
    true,
    undefined,
    undefined,
    modelProviderOptions,
  );
}

test("Anthropic setup carries the workspace ID from HTTP to the provider", async () => {
  let received: unknown;
  const { application, credentials } = createModelProviderHarness({
    standardModels: {
      async connect(request) {
        received = request;
        await credentials.put("anthropic-default", "fixture-key");
        return { provider: request.providerId, modelId: "claude-sonnet-4-6" };
      },
      async disconnect() {},
      async loadModel() {
        return new MockLanguageModelV4();
      },
    },
  });
  const http = createHttpApp(application);
  const response = await http.request("/api/model-providers/anthropic", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      apiKey: "fixture-key",
      workspaceId: "wrkspc_test123",
    }),
  });
  expect(response.status).toBe(200);
  expect(received).toEqual({
    providerId: "anthropic",
    apiKey: "fixture-key",
    workspaceId: "wrkspc_test123",
  });
  expect(await response.json()).toMatchObject({
    id: "anthropic",
    status: "connected",
  });
});

function readyProposal(outcome: TaskProposalOutcomeDto): TaskProposalDto {
  expect(outcome.status).toBe("ready");
  if (outcome.status !== "ready") {
    throw new Error("Expected a ready task proposal");
  }
  return outcome.proposal;
}

test("Settings updates and budget removal affect recipe limits without capping chat steps", async () => {
  const { application, database } = createHarness();
  const http = createHttpApp(application);
  expect(readRecipeExecutionLimits(database.db)).toEqual({ maxSteps: 0 });
  expect((await application.modelConfiguration()).execution?.maxSteps).toBe(0);
  for (const limits of [
    { maxSteps: 4, maxCostUsdMicros: 50_000 },
    { maxSteps: 7 },
    { maxSteps: 0, maxCostUsdMicros: 50_000 },
    { maxSteps: 0 },
  ]) {
    const response = await http.request("/api/models/execution", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(limits),
    });
    expect(response.status).toBe(200);
    expect(readRecipeExecutionLimits(database.db)).toEqual(limits);
    expect(chatExecutionLimits).toEqual({ maxSteps: 0 });
  }
});

test("web research connects providers independently and routes tools using saved defaults", async () => {
  const urls: string[] = [];
  const { application, credentials } = createHarness(
    undefined,
    undefined,
    undefined,
    async (input) => {
      urls.push(String(input));
      return Response.json(
        String(input).includes("parallel")
          ? {
              results: [
                {
                  url: "https://example.com",
                  title: "Source",
                  excerpts: ["Evidence"],
                },
              ],
            }
          : { success: true, data: { web: [] } },
      );
    },
  );
  const http = createHttpApp(application);
  expect(await application.webResearchConfiguration()).toMatchObject({
    searchProvider: "exa",
    readerProvider: "exa",
  });
  const settingsResponse = await http.request("/api/web-research");
  expect(settingsResponse.status).toBe(200);
  const settings = await settingsResponse.json();
  expect(
    settings.providers.map((provider: { logoSvg: string }) => provider.logoSvg),
  ).toEqual([
    connectionLogoSeeds["web-search"],
    connectionLogoSeeds.parallel,
    connectionLogoSeeds.firecrawl,
  ]);
  for (const provider of settings.providers) {
    expect(provider.logoSvg).toContain("<svg");
  }
  const unconnected = await http.request("/api/web-research", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      searchProvider: "parallel",
      readerProvider: "direct",
    }),
  });
  expect(unconnected.ok).toBe(false);
  for (const id of ["parallel", "firecrawl"]) {
    const response = await http.request(`/api/web-research/providers/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: `${id}-fixture-key` }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      searchProvider: "exa",
      readerProvider: "exa",
    });
    expect(credentials.values.get(`${id}-web-default`)).toBe(
      `${id}-fixture-key`,
    );
  }
  const updated = await http.request("/api/web-research", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      searchProvider: "parallel",
      readerProvider: "firecrawl",
    }),
  });
  expect(updated.status).toBe(200);
  application.ensureBuiltinConnections();
  expect(await application.webResearchConfiguration()).toMatchObject({
    searchProvider: "parallel",
    readerProvider: "firecrawl",
  });
  const result = await application.callReadConnectionTool(
    "builtin-web",
    "search_web",
    { query: "test query" },
  );
  expect(result.structuredContent).toMatchObject({ provider: "parallel" });
  expect(urls.at(-1)).toBe("https://api.parallel.ai/v1/search");
  await expect(application.disconnectWebProvider("parallel")).rejects.toThrow(
    "Choose another",
  );
  await application.updateWebResearch({
    searchProvider: "exa",
    readerProvider: "direct",
  });
  await application.disconnectWebProvider("parallel");
  expect(credentials.values.has("parallel-web-default")).toBe(false);
  expect(await application.listConnections()).toContainEqual(
    expect.objectContaining({ id: "firecrawl", status: "connected" }),
  );
});

async function directTaskProposal(
  application: LocalApplication,
  prompt: string,
  overrides: Partial<Parameters<LocalApplication["proposeTaskDraft"]>[0]> = {},
): Promise<TaskProposalOutcomeDto> {
  return application.proposeTaskDraft({
    title: "Morning HN digest",
    prompt,
    schedule: "0 8 * * *",
    scheduleLabel: "Daily at 8:00 AM",
    timezone: "UTC",
    connectionId: hackerNewsConnectionId,
    toolNames: ["get_hacker_news_top_stories"],
    contract:
      "Every morning I will read public Hacker News stories and summarize them. I cannot post or change anything.",
    catchUpPolicy: "skip_to_next",
    ...overrides,
  });
}

async function waitForFinishedRun(
  application: LocalApplication,
  runId: string,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = await application.getRun(runId);
    if (run?.status === "succeeded" || run?.status === "failed") {
      return run;
    }
    await Bun.sleep(1);
  }
  throw new Error(`Run ${runId} did not finish`);
}

describe("local product application", () => {
  test("exposes the persisted recovery receipt in recipe details", async () => {
    const { application, database } = createHarness();
    const lastScheduleRecovery = {
      outcome: "skipped_missed" as const,
      scheduledTime: "2026-09-04T08:00:00.000Z",
      recoveredAt: "2026-09-07T10:00:00.000Z",
    };
    database.db
      .insert(taskTable)
      .values({
        id: "recovered-recipe",
        prompt: "Daily summary",
        schedule: "0 8 * * *",
        nextRunAt: new Date("2026-09-08T08:00:00Z"),
        lastScheduleRecovery,
      })
      .run();
    expect(await application.getTask("recovered-recipe")).toMatchObject({
      lastScheduleRecovery,
    });
    const response = await createHttpApp(application).request(
      "/api/tasks/recovered-recipe",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ lastScheduleRecovery });
  });

  test("dereferences model-facing connection schemas without mutating execution contracts", () => {
    const schema = {
      type: "object",
      properties: {
        filters: {
          type: "object",
          properties: {
            visiblePageDuration: {
              type: "object",
              properties: {
                min: { type: ["number", "null"] },
                max: { type: ["number", "null"] },
              },
              required: ["min", "max"],
            },
            sessionDuration: {
              $ref: "#/properties/filters/properties/visiblePageDuration",
              description: "Filter by total session duration.",
            },
          },
        },
      },
    } as const;

    const projected = modelFacingJsonSchema(schema);

    expect(JSON.stringify(schema)).toContain('"$ref"');
    expect(JSON.stringify(projected)).not.toContain('"$ref"');
    expect(projected).toMatchObject({
      properties: {
        filters: {
          properties: {
            sessionDuration: {
              type: "object",
              properties: {
                min: { type: ["number", "null"] },
                max: { type: ["number", "null"] },
              },
              required: ["min", "max"],
              description: "Filter by total session duration.",
            },
          },
        },
      },
    });
  });

  test("proposes, saves, runs, and reads a task through the shared kernel", async () => {
    const progressAgent: AgentRunner = {
      async run(request) {
        await request.eventSink?.append(
          {
            type: "model_selection",
            provider: "openrouter",
            modelId: "test/model",
            billing: "metered",
            maxSteps: 10,
          },
          now,
        );
        await request.eventSink?.append(
          {
            type: "model_turn",
            turnId: "call-1:0",
            step: 0,
            phase: "started",
            provider: "openrouter",
            modelId: "test/model",
          },
          now,
        );
        await request.eventSink?.append(
          {
            type: "model_retry",
            turnId: "call-1:0",
            step: 0,
            attempt: 2,
            provider: "openrouter",
            modelId: "test/model",
          },
          now,
        );
        await request.eventSink?.append(
          {
            type: "model_turn",
            turnId: "call-1:0",
            step: 0,
            phase: "completed",
            provider: "openrouter",
            modelId: "test/model",
            finishReason: "stop",
            durationMs: 500,
          },
          now,
        );
        return agent.run(request);
      },
    };
    const { application, database } = createHarness(
      resolveModelExecution,
      progressAgent,
    );

    const proposal = readyProposal(
      await directTaskProposal(
        application,
        "Summarize Hacker News every morning",
      ),
    );
    expect(proposal).toMatchObject({
      title: "Morning HN digest",
      connectionName: "Hacker News",
      executionMode: "local",
      tools: [
        {
          name: "get_hacker_news_top_stories",
          effect: "read",
          approval: "never",
        },
      ],
    });

    const task = await application.createTask(proposal, false);
    expect(task).toMatchObject({
      name: "Morning HN digest",
      enabled: false,
      connectionNames: ["Hacker News"],
      availableIn: ["local", "hosted"],
      hostedBlockedBy: [],
      capabilities: [
        {
          connectionId: hackerNewsConnectionId,
          connectionName: "Hacker News",
          toolName: "get_hacker_news_top_stories",
          effect: "read",
          mode: "allow",
        },
      ],
      contract: proposal.contract,
    });
    expect(await application.getTask(task.id)).toMatchObject({
      contract: proposal.contract,
    });
    expect(await application.listTasks()).toContainEqual(
      expect.objectContaining({ id: task.id, contract: proposal.contract }),
    );
    const started = await application.runTaskNow(task.id);
    const run = await waitForFinishedRun(application, started.id);
    expect(run).toMatchObject({
      taskName: "Morning HN digest",
      status: "succeeded",
      summary: "AI and local-first software led Hacker News.",
      durationMs: 1_000,
      costUsdMicros: 120,
      actualCostUsdMicros: 120,
      estimatedCostUsdMicros: 110,
      costSource: "provider_reported",
      inputTokens: 30,
      outputTokens: 12,
      cachedInputTokens: 5,
      reasoningTokens: 3,
      totalTokens: 42,
      webSearchRequests: 1,
      toolCalls: 1,
    });
    expect((await application.snapshot()).runs).toHaveLength(1);
    expect(await application.listTaskRuns(task.id)).toMatchObject([
      {
        id: started.id,
        taskId: task.id,
        status: "succeeded",
        report: expect.stringContaining("Hacker News"),
      },
    ]);
    const taskRunsResponse = await createHttpApp(application).request(
      `/api/tasks/${task.id}/runs`,
    );
    expect(taskRunsResponse.status).toBe(200);
    expect(await taskRunsResponse.json()).toMatchObject([
      { id: started.id, taskId: task.id, status: "succeeded" },
    ]);
    expect(await application.listRunEvents(started.id)).toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({
          kind: "model",
          title: "Using test/model",
          maxTurns: 10,
        }),
        expect.objectContaining({
          kind: "model",
          title: "Starting model turn 1",
          modelTurn: 1,
        }),
        expect.objectContaining({
          kind: "model",
          title: "Retrying model call",
          detail: "Attempt 2 · openrouter · test/model",
        }),
        expect.objectContaining({
          kind: "model",
          title: "Model turn 1 finished",
          modelTurn: 1,
          tone: "success",
        }),
      ]),
    });

    await application.updateConnectionToolPolicy(hackerNewsConnectionId, {
      toolName: "get_hacker_news_top_stories",
      mode: "check_first",
    });
    expect((await application.getTask(task.id))?.capabilities[0]?.mode).toBe(
      "check_first",
    );
    expect(
      database.db
        .select()
        .from(connectionTable)
        .where(eq(connectionTable.id, hackerNewsConnectionId))
        .get(),
    ).toMatchObject({
      config: {
        toolPolicies: { get_hacker_news_top_stories: "check_first" },
      },
    });

    await application.updateConnectionToolPolicy(hackerNewsConnectionId, {
      toolName: "get_hacker_news_top_stories",
      mode: "off",
    });
    expect((await application.getTask(task.id))?.capabilities[0]?.mode).toBe(
      "off",
    );

    const enabled = await application.updateTask(task.id, { enabled: true });
    expect(enabled?.enabled).toBe(true);
  });

  test("routes local task lifecycle and manual runs through the attached host", async () => {
    const { application, database } = createHarness();
    const calls: string[] = [];
    const host: LocalTaskRunHost = {
      async syncTask(taskId) {
        calls.push(`sync:${taskId}`);
      },
      async removeTask(taskId) {
        calls.push(`remove:${taskId}`);
      },
      async enqueueRun(runId, taskId, scheduledTime) {
        calls.push(`enqueue:${runId}:${taskId}:${scheduledTime.toISOString()}`);
      },
      async resumeRun(runId, taskId, decisions) {
        calls.push(
          `resume:${runId}:${taskId}:${decisions.map(({ id }) => id).join(",")}`,
        );
      },
      async shutdown() {},
    };
    application.attachTaskRunHost(host);
    const proposal = readyProposal(
      await directTaskProposal(application, "Summarize Hacker News"),
    );

    const lifecycleTask = await application.createTask(proposal, false, {
      id: "actor-lifecycle",
    });
    await application.updateTask(lifecycleTask.id, { name: "Updated digest" });
    expect(await application.deleteTask(lifecycleTask.id)).toBe("deleted");

    const manualTask = await application.createTask(proposal, false, {
      id: "actor-manual",
    });
    const started = await application.runTaskNow(
      manualTask.id,
      "manual-request",
    );
    database.db
      .insert(runTable)
      .values({
        id: "actor-approval",
        taskId: manualTask.id,
        scheduledTime: new Date(now.getTime() - 1_000),
        status: "waiting_for_approval",
        executionLocation: "local",
        startedAt: new Date(now.getTime() - 500),
      })
      .run();
    new SqliteRunCheckpointStore(database.db).save("actor-approval", [
      { role: "user", content: "Publish the digest" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "actor-call",
            toolName: "publish_digest",
            input: { channel: "daily" },
          },
          {
            type: "tool-approval-request",
            approvalId: "approval-1",
            toolCallId: "actor-call",
          },
        ],
      },
    ]);
    new SqliteToolApprovalStore(database.db).recordPending({
      id: "approval-1",
      contextKind: "run",
      contextId: "actor-approval",
      toolCallId: "actor-call",
      toolName: "publish_digest",
      input: { channel: "daily" },
      riskEffect: "destructive",
      now,
    });
    await application.decideRunApprovals("actor-approval", [
      { id: "approval-1", approved: true },
    ]);

    expect(calls).toEqual([
      "sync:actor-lifecycle",
      "sync:actor-lifecycle",
      "remove:actor-lifecycle",
      "sync:actor-manual",
      `enqueue:${started.id}:actor-manual:${now.toISOString()}`,
      "resume:actor-approval:actor-manual:approval-1",
    ]);
    expect((await application.getRun(started.id))?.status).toBe("claimed");
  });

  test("offers an explicit rerun after a retryable one-off failure without replaying automatically", async () => {
    let agentCalls = 0;
    let clockOffsetMs = 0;
    const failingAgent: AgentRunner = {
      async run() {
        agentCalls += 1;
        const error = new Error("model request timed out");
        error.name = "TimeoutError";
        throw error;
      },
    };
    const { application } = createHarness(
      resolveModelExecution,
      failingAgent,
      () => new Date(now.getTime() + clockOffsetMs++),
    );
    const proposal = readyProposal(
      await directTaskProposal(application, "Summarize Hacker News"),
    );
    const task = await application.createTask(proposal, false);

    const first = await application.runTaskNow(task.id, "retryable-once-1");
    const failed = await waitForFinishedRun(application, first.id);
    expect(failed).toMatchObject({
      status: "failed",
      canRetry: true,
    });
    await Bun.sleep(5);
    expect(agentCalls).toBe(1);

    const second = await application.runTaskNow(task.id, "retryable-once-2");
    expect(second.id).not.toBe(first.id);
    await waitForFinishedRun(application, second.id);
    expect(agentCalls).toBe(2);
  });

  test("stops an in-flight run through the cancel API", async () => {
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const hangingAgent: AgentRunner = {
      async run(request) {
        started();
        return await new Promise<never>((_, reject) => {
          const signal = request.signal;
          if (!signal) {
            reject(new Error("Expected an abort signal"));
            return;
          }
          if (signal.aborted) {
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
          });
        });
      },
    };
    const { application } = createHarness(resolveModelExecution, hangingAgent);
    const http = createHttpApp(application);
    const proposal = readyProposal(
      await directTaskProposal(application, "Summarize Hacker News"),
    );
    const task = await application.createTask(proposal, false);
    const run = await application.runTaskNow(task.id, "cancel-run-1");
    await startedPromise;

    const missing = await http.request("/api/runs/missing/cancel", {
      method: "POST",
    });
    expect(missing.status).toBe(404);

    const cancelled = await http.request(`/api/runs/${run.id}/cancel`, {
      method: "POST",
    });
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toEqual({ cancelled: true });

    const finished = await waitForFinishedRun(application, run.id);
    expect(finished).toMatchObject({
      status: "failed",
      error: "Stopped",
    });

    const again = await http.request(`/api/runs/${run.id}/cancel`, {
      method: "POST",
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ cancelled: false });
  });

  test("shows automatically activated recipe knowledge through the product API", async () => {
    const { application, database } = createHarness();
    const proposal = readyProposal(
      await directTaskProposal(
        application,
        "Summarize Hacker News every morning",
      ),
    );
    const task = await application.createTask(proposal, false);
    new SqliteRecipeKnowledgeStore(database.db).createRevision({
      taskId: task.id,
      knowledge: {
        schemaVersion: 1,
        markdown: "# Hacker News\n\nRead the reviewed top-stories feed.",
      },
    });
    const http = createHttpApp(application);
    const response = await http.request(`/api/tasks/${task.id}/knowledge`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      taskId: task.id,
      revision: 1,
      status: "ready",
      knowledge: {
        markdown: "# Hacker News\n\nRead the reviewed top-stories feed.",
      },
    });
  });

  test("serves the product API and stores OpenRouter keys outside SQLite", async () => {
    const { application, credentials, database } = createHarness();
    expect(
      database.db
        .select()
        .from(connectionTable)
        .all()
        .some((connection) => connection.id === "builtin-hacker-news"),
    ).toBe(false);
    const assistant = new AiSdkAssistant(database.db, {
      loadRuntime: async () => ({
        model: new MockLanguageModelV4(),
        provider: "mock-provider",
        modelId: "mock-model",
      }),
    });
    const http = createHttpApp(application, undefined, assistant);

    const connected = await http.request("/api/connections/openrouter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "sk-or-v1-test" }),
    });
    expect(connected.status).toBe(200);
    expect(await connected.json()).toMatchObject({
      id: "openrouter",
      status: "connected",
    });
    expect(credentials.values.get(openRouterCredentialRef)).toBe(
      "sk-or-v1-test",
    );
    const webSearch = await http.request("/api/connections/web-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "exa-test" }),
    });
    expect(webSearch.status).toBe(200);
    expect(await webSearch.json()).toMatchObject({
      id: "web-search",
      status: "connected",
      credentialConfigured: true,
    });
    expect(credentials.values.get(exaCredentialRef)).toBe("exa-test");
    const connectionCards = (await (
      await http.request("/api/connections")
    ).json()) as ConnectionCardDto[];
    expect(connectionCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "web-search",
          name: "Web research",
          status: "connected",
          credentialConfigured: true,
          availableIn: ["local", "hosted"],
        }),
        expect.objectContaining({
          id: "google-search",
          status: "coming_soon",
        }),
        expect.objectContaining({
          id: "neon",
          featured: true,
          actionable: true,
          setupVariantId: "oauth",
        }),
        expect.objectContaining({
          id: "jira",
          featured: true,
          actionable: true,
          credentialKind: "oauth",
          setupVariantId: "oauth",
        }),
        expect.objectContaining({
          id: "outlook",
          name: "Outlook Mail & Calendar",
          featured: true,
          actionable: false,
          status: "coming_soon",
        }),
        expect.objectContaining({
          id: "salesforce",
          featured: true,
          actionable: false,
          status: "coming_soon",
        }),
      ]),
    );
    const standardCards = connectionCards.filter(
      (connection) =>
        connection.category === "connector" && connection.featured === true,
    );
    expect(standardCards).toHaveLength(15);
    expect(
      standardCards.every(
        (connection) =>
          Boolean(connection.logoSvg) || Boolean(connection.logoUrl),
      ),
    ).toBe(true);
    const oneClickCards = oneClickIntegrations(connectionCards);
    for (const id of [
      "gmail",
      "google-calendar",
      "google-drive",
      "slack",
      "outlook",
      "onedrive",
      "microsoft-teams",
      "sharepoint",
    ]) {
      expect(oneClickCards.some((connection) => connection.id === id)).toBe(
        false,
      );
      const card = connectionCards.find((connection) => connection.id === id);
      expect(card).toBeDefined();
      if (!card) throw new Error(`Missing ${id} catalog connector`);
      expect(oneClickIntegrationState(card)).toBe(
        id === "sharepoint" ? undefined : "setup_required",
      );
    }
    expect(
      oneClickCards.some((connection) => connection.id === "salesforce"),
    ).toBe(false);
    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === "gmail",
      ),
    ).toMatchObject({
      status: "coming_soon",
      actionable: false,
      oauthReady: false,
    });
    await expect(
      application.proposeConnectionAction("gmail", "reconnect"),
    ).resolves.toMatchObject({
      status: "unavailable",
      title: "Gmail sign-in isn't available yet",
    });
    expect(
      await (
        await http.request("/api/integrations/propose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sentence: "Connect Gmail" }),
        })
      ).json(),
    ).toMatchObject({
      status: "unavailable",
      title: "Gmail isn't ready to connect yet",
      userAction: "none",
    });
    const webSearchDetail = await http.request("/api/connections/web-search");
    expect(webSearchDetail.status).toBe(200);
    expect(await webSearchDetail.json()).toMatchObject({
      id: "web-search",
      catalogSource: "live",
      availableIn: ["local", "hosted"],
      transportDetails: {
        kind: "builtin",
        protocolLabel: "Built-in web research",
        endpoint: "https://api.exa.ai",
      },
      agentAccess: {
        mode: "on-demand",
        policySource: "connection",
        catalogIncludes: "names-and-effects",
        detailIncludes: "descriptions-and-schemas",
      },
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: "search_web",
          description: expect.any(String),
          effect: "read",
          mode: "allow",
        }),
      ]),
    });
    const githubDetail = await http.request("/api/connections/github");
    expect(githubDetail.status).toBe(200);
    expect(await githubDetail.json()).toMatchObject({
      id: "github",
      transportDetails: {
        kind: "mcp-remote",
        protocolLabel: "Model Context Protocol (Remote)",
        endpoint: "https://api.githubcopilot.com/mcp/",
        copySnippet: "https://api.githubcopilot.com/mcp/",
      },
    });
    const updatedWebPolicy = await http.request(
      "/api/connections/web-search/tools/search_web",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "check_first" }),
      },
    );
    expect(updatedWebPolicy.status).toBe(200);
    expect(await updatedWebPolicy.json()).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: "search_web", mode: "check_first" }),
      ]),
    });
    expect(
      (await http.request("/api/connections/not-a-connection")).status,
    ).toBe(404);
    expect(await (await http.request("/api/models")).json()).toMatchObject({
      models: [
        {
          providerId: "openrouter",
          modelId: "test/model",
          inputUsdPerMillionTokens: 1,
          outputUsdPerMillionTokens: 3,
        },
      ],
      imageModels: [
        {
          providerId: "openrouter",
          modelId: "google/gemini-image-test",
        },
      ],
      catalogStale: false,
    });
    const refreshed = await http.request("/api/models/refresh", {
      method: "POST",
    });
    expect(refreshed.status).toBe(200);
    expect(await refreshed.json()).toMatchObject({
      models: [
        {
          providerId: "openrouter",
          modelId: "test/model",
        },
      ],
      catalogStale: false,
    });
    const selected = await http.request("/api/models/default", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selection: {
          providerId: "openrouter",
          modelId: "test/model",
        },
      }),
    });
    expect(selected.status).toBe(200);
    expect(await selected.json()).toMatchObject({
      defaultSelection: {
        providerId: "openrouter",
        modelId: "test/model",
      },
    });
    const selectedDistiller = await http.request(
      "/api/models/research-distiller",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          selection: {
            providerId: "openrouter",
            modelId: "test/model",
          },
        }),
      },
    );
    expect(selectedDistiller.status).toBe(200);
    expect(await selectedDistiller.json()).toMatchObject({
      researchDistillerSelection: {
        providerId: "openrouter",
        modelId: "test/model",
      },
    });
    expect(await (await http.request("/api/models")).json()).toMatchObject({
      researchDistillerSelection: {
        providerId: "openrouter",
        modelId: "test/model",
      },
    });

    const executionUpdated = await http.request("/api/models/execution", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        maxSteps: 30,
        maxCostUsdMicros: 350_000,
      }),
    });
    expect(executionUpdated.status).toBe(200);
    expect(await executionUpdated.json()).toMatchObject({
      execution: {
        maxSteps: 30,
        maxCostUsdMicros: 350_000,
      },
    });
    expect(await (await http.request("/api/models")).json()).toMatchObject({
      execution: {
        maxSteps: 30,
        maxCostUsdMicros: 350_000,
      },
    });

    const proposal = readyProposal(
      await directTaskProposal(
        application,
        "Summarize Hacker News every morning",
      ),
    );
    const task = await application.createTask(proposal, false);
    expect(task.contract).toBe(proposal.contract);
    expect(
      await (await http.request(`/api/tasks/${task.id}`)).json(),
    ).toMatchObject({ contract: proposal.contract });
    expect(await (await http.request("/api/tasks")).json()).toContainEqual(
      expect.objectContaining({ id: task.id, contract: proposal.contract }),
    );
    const overridden = await http.request(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modelSelection: {
          providerId: "openrouter",
          modelId: "test/model",
        },
      }),
    });
    expect(overridden.status).toBe(200);
    expect(await overridden.json()).toMatchObject({
      modelOverride: {
        providerId: "openrouter",
        modelId: "test/model",
      },
    });
    const execution = await http.request(`/api/tasks/${task.id}/execution`);
    expect(execution.status).toBe(200);
    expect(await execution.json()).toEqual({
      providerId: "openrouter",
      modelId: "test/model",
      selectedBy: "task",
      toolRoutes: [],
    });

    const run = await http.request(`/api/tasks/${task.id}/run`, {
      method: "POST",
      headers: { "idempotency-key": "manual-run-1" },
    });
    expect(run.status).toBe(202);
    const runBody = (await run.json()) as { readonly id: string };
    const completedRun = await waitForFinishedRun(application, runBody.id);
    expect(completedRun).toMatchObject({
      status: "succeeded",
      taskName: "Morning HN digest",
    });
    const eventPage = await http.request(
      `/api/runs/${runBody.id}/events?after=0`,
    );
    expect(eventPage.status).toBe(200);
    const eventPageBody = await eventPage.json();
    expect(eventPageBody).toMatchObject({
      runId: runBody.id,
      runStatus: "succeeded",
      hasMore: false,
      events: expect.arrayContaining([
        expect.objectContaining({ title: "Run completed" }),
      ]),
    });
    expect(JSON.stringify(eventPageBody)).not.toContain(
      "AI and local-first software led the discussion",
    );
    const eventStream = await http.request(
      `/api/runs/${runBody.id}/events/stream`,
    );
    expect(eventStream.status).toBe(200);
    expect(eventStream.headers.get("content-type")).toContain(
      "text/event-stream",
    );
    const streamBody = await eventStream.text();
    expect(streamBody).toContain("event: run_event");
    expect(streamBody).toContain("event: run_complete");
    const retriedRun = await http.request(`/api/tasks/${task.id}/run`, {
      method: "POST",
      headers: { "idempotency-key": "manual-run-1" },
    });
    expect(retriedRun.status).toBe(202);
    expect(await retriedRun.json()).toMatchObject({ id: runBody.id });
    expect((await application.snapshot()).runs).toHaveLength(1);

    const staleApproval = await http.request(
      `/api/runs/${runBody.id}/approvals`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approvals: [{ id: "stale-approval", approved: true }],
        }),
      },
    );
    expect(staleApproval.status).toBe(409);

    const linkedRunThread = assistant.createOrResumeSession({
      context: {
        version: 1,
        intent: "run.diagnose",
        origin: "runs",
        subjects: [{ kind: "run", id: runBody.id }],
      },
    });
    const unrelatedThread = assistant.createOrResumeSession({
      context: {
        version: 1,
        intent: "general",
        origin: "chat",
        subjects: [],
      },
    });

    const deletedRun = await http.request(`/api/runs/${runBody.id}`, {
      method: "DELETE",
    });
    expect(deletedRun.status).toBe(204);
    expect((await http.request(`/api/runs/${runBody.id}`)).status).toBe(404);
    expect(
      (await http.request(`/api/chats/${linkedRunThread.id}`)).status,
    ).toBe(404);
    expect(
      (await http.request(`/api/chats/${unrelatedThread.id}`)).status,
    ).toBe(200);
    const missingApproval = await http.request(
      `/api/runs/${runBody.id}/approvals`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approvals: [{ id: "missing-approval", approved: true }],
        }),
      },
    );
    expect(missingApproval.status).toBe(404);
    expect((await http.request(`/api/runs/${runBody.id}/events`)).status).toBe(
      404,
    );
    expect(
      (
        await http.request(`/api/runs/${runBody.id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(404);

    const replacement = await http.request(`/api/tasks/${task.id}/run`, {
      method: "POST",
      headers: { "idempotency-key": "manual-run-2" },
    });
    const replacementBody = (await replacement.json()) as {
      readonly id: string;
    };
    await waitForFinishedRun(application, replacementBody.id);
    const linkedTaskThread = assistant.createOrResumeSession({
      context: {
        version: 1,
        intent: "task.manage",
        origin: "tasks",
        subjects: [{ kind: "task", id: task.id }],
      },
    });
    const replacementRunThread = assistant.createOrResumeSession({
      context: {
        version: 1,
        intent: "run.diagnose",
        origin: "runs",
        subjects: [{ kind: "run", id: replacementBody.id }],
      },
    });
    const deletedTask = await http.request(`/api/tasks/${task.id}`, {
      method: "DELETE",
    });
    expect(deletedTask.status).toBe(204);
    expect((await http.request(`/api/tasks/${task.id}`)).status).toBe(404);
    expect((await http.request(`/api/runs/${replacementBody.id}`)).status).toBe(
      404,
    );
    expect(
      (await http.request(`/api/chats/${linkedTaskThread.id}`)).status,
    ).toBe(404);
    expect(
      (await http.request(`/api/chats/${replacementRunThread.id}`)).status,
    ).toBe(404);
    expect(await (await http.request("/api/tasks")).json()).toEqual([]);
    expect(await (await http.request("/api/runs")).json()).toEqual([]);
  });

  test("connects Codex with managed ChatGPT sign-in for chats and recipes", async () => {
    let connected = false;
    const { application } = createModelProviderHarness({
      codexSubscription: {
        async account() {
          return {
            account: connected
              ? {
                  type: "chatgpt" as const,
                  email: "person@example.test",
                  planType: "plus",
                }
              : null,
            requiresOpenaiAuth: true,
          };
        },
        async startLogin() {
          connected = true;
          return {
            type: "chatgpt" as const,
            loginId: "login-1",
            authUrl: "https://auth.openai.com/codex",
          };
        },
        async logout() {
          connected = false;
        },
        close() {},
        async models() {
          return [
            {
              id: "gpt-5.6-sol",
              displayName: "GPT-5.6 Sol",
              description: "Codex model",
              hidden: false,
              isDefault: true,
              inputModalities: ["text", "image"],
            },
          ];
        },
      },
    });
    const http = createHttpApp(application);

    const initialConfiguration = (await (
      await http.request("/api/models")
    ).json()) as {
      providers: Array<{ id: string } & Record<string, unknown>>;
      recipeModels: Array<Record<string, unknown>>;
    };
    expect(
      initialConfiguration.providers.map((provider) => provider.id),
    ).toEqual([
      "openrouter",
      "openai",
      "xai",
      "anthropic",
      "google",
      "groq",
      "claude",
      "codex",
    ]);
    expect(initialConfiguration.providers).toContainEqual(
      expect.objectContaining({ id: "codex", status: "not_connected" }),
    );
    expect(initialConfiguration.recipeModels).toEqual([]);
    const login = await http.request("/api/model-providers/codex/login", {
      method: "POST",
    });
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({
      loginId: "login-1",
      authUrl: "https://auth.openai.com/codex",
    });

    const configuration = (await (
      await http.request("/api/models")
    ).json()) as {
      providers: Array<Record<string, unknown>>;
      models: Array<Record<string, unknown>>;
      recipeModels: Array<Record<string, unknown>>;
    };
    expect(configuration.providers).toContainEqual(
      expect.objectContaining({
        id: "codex",
        status: "connected",
        accountLabel: "person@example.test",
        planLabel: "plus",
      }),
    );
    expect(configuration.models).not.toContainEqual(
      expect.objectContaining({ providerId: "codex" }),
    );
    expect(configuration.recipeModels).toContainEqual(
      expect.objectContaining({
        providerId: "codex",
        modelId: "gpt-5.6-sol",
      }),
    );

    const disconnected = await http.request("/api/model-providers/codex", {
      method: "DELETE",
    });
    expect(disconnected.status).toBe(204);
    expect(connected).toBe(false);
  });

  test("connects Claude Agent SDK with managed subscription sign-in for chats and recipes", async () => {
    let connected = false;
    const { application } = createModelProviderHarness({
      claudeSubscription: {
        async account() {
          return {
            account: connected
              ? {
                  email: "claude@example.test",
                  subscriptionType: "pro",
                }
              : null,
          };
        },
        async login() {
          connected = true;
        },
        async logout() {
          connected = false;
        },
        close() {},
        models() {
          return [
            {
              id: "sonnet",
              displayName: "Claude Sonnet",
              description: "Balanced Claude model",
              isDefault: true,
              inputModalities: ["text", "image"],
            },
          ];
        },
      },
    });
    const http = createHttpApp(application);

    const initialConfiguration = (await (
      await http.request("/api/models")
    ).json()) as {
      providers: Array<Record<string, unknown>>;
      recipeModels: Array<Record<string, unknown>>;
    };
    expect(initialConfiguration.providers).toContainEqual(
      expect.objectContaining({ id: "claude", status: "not_connected" }),
    );
    expect(initialConfiguration.recipeModels).toEqual([]);

    const login = await http.request("/api/model-providers/claude/login", {
      method: "POST",
    });
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({ completed: true });

    const configuration = (await (
      await http.request("/api/models")
    ).json()) as {
      providers: Array<Record<string, unknown>>;
      models: Array<Record<string, unknown>>;
      recipeModels: Array<Record<string, unknown>>;
    };
    expect(configuration.providers).toContainEqual(
      expect.objectContaining({
        id: "claude",
        status: "connected",
        accountLabel: "claude@example.test",
        planLabel: "pro",
      }),
    );
    expect(configuration.models).not.toContainEqual(
      expect.objectContaining({ providerId: "claude" }),
    );
    expect(configuration.recipeModels).toContainEqual(
      expect.objectContaining({
        providerId: "claude",
        modelId: "sonnet",
      }),
    );

    const chatDefault = await http.request("/api/models/default", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selection: { providerId: "claude", modelId: "sonnet" },
      }),
    });
    expect(chatDefault.status).toBe(200);
    expect(await chatDefault.json()).toMatchObject({
      defaultSelection: {
        providerId: "claude",
        modelId: "sonnet",
      },
    });

    const disconnected = await http.request("/api/model-providers/claude", {
      method: "DELETE",
    });
    expect(disconnected.status).toBe(204);
    expect(connected).toBe(false);
  });

  test("makes Gmail actionable when the registered Google OAuth client is configured", async () => {
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async () => Response.json({ results: [] }),
      undefined,
      undefined,
      undefined,
      true,
      {
        gmail: {
          clientId: "google-client-id",
          clientSecret: "google-client-secret",
          authorization: {
            authorizationEndpoint:
              "https://accounts.google.test/o/oauth2/v2/auth",
            tokenEndpoint: "https://oauth2.google.test/token",
          },
        },
      },
    );

    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === "gmail",
      ),
    ).toMatchObject({
      status: "not_connected",
      actionable: true,
      oauthReady: true,
      setupVariantId: "oauth",
    });
    await expect(
      application.proposeIntegration("Connect Gmail"),
    ).resolves.toMatchObject({
      status: "ready",
      proposal: { templateId: "gmail" },
    });
  });

  test("makes Google, Microsoft, and Slack connectors one-click when their OAuth clients are configured", async () => {
    const googleAuthorization = {
      authorizationEndpoint: "https://accounts.google.test/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.google.test/token",
    } as const;
    const microsoftAuthorization = {
      authorizationEndpoint:
        "https://login.microsoftonline.test/common/oauth2/v2.0/authorize",
      tokenEndpoint:
        "https://login.microsoftonline.test/common/oauth2/v2.0/token",
    } as const;
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async () => Response.json({ results: [] }),
      undefined,
      undefined,
      undefined,
      true,
      {
        "google-calendar": {
          clientId: "google-client-id",
          clientSecret: "google-client-secret",
          authorization: googleAuthorization,
        },
        "google-drive": {
          clientId: "google-client-id",
          clientSecret: "google-client-secret",
          authorization: googleAuthorization,
        },
        outlook: {
          clientId: "microsoft-client-id",
          clientSecret: "microsoft-client-secret",
          authorization: microsoftAuthorization,
        },
        onedrive: {
          clientId: "microsoft-client-id",
          clientSecret: "microsoft-client-secret",
          authorization: microsoftAuthorization,
        },
        "microsoft-teams": {
          clientId: "microsoft-client-id",
          clientSecret: "microsoft-client-secret",
          authorization: microsoftAuthorization,
        },
        sharepoint: {
          clientId: "microsoft-client-id",
          clientSecret: "microsoft-client-secret",
          authorization: microsoftAuthorization,
        },
        slack: {
          clientId: "slack-client-id",
        },
      },
    );
    const cards = await application.listConnections();
    expect(
      cards.find((connection) => connection.id === "google-calendar"),
    ).toMatchObject({
      status: "not_connected",
      actionable: true,
      oauthReady: true,
      setupVariantId: "oauth",
    });
    expect(
      cards.find((connection) => connection.id === "google-drive"),
    ).toMatchObject({
      status: "not_connected",
      actionable: true,
      oauthReady: true,
      setupVariantId: "oauth",
    });
    expect(cards.find((connection) => connection.id === "slack")).toMatchObject(
      {
        status: "not_connected",
        actionable: true,
        oauthReady: true,
        setupVariantId: "oauth",
      },
    );
    for (const id of ["outlook", "onedrive", "microsoft-teams", "sharepoint"]) {
      expect(cards.find((connection) => connection.id === id)).toMatchObject({
        status: "not_connected",
        actionable: true,
        oauthReady: true,
        setupVariantId: "oauth",
      });
    }
    await expect(
      application.proposeIntegration("Connect Google Calendar"),
    ).resolves.toMatchObject({
      status: "ready",
      proposal: { templateId: "google-calendar" },
    });
    await expect(
      application.proposeIntegration("Search Slack"),
    ).resolves.toMatchObject({
      status: "ready",
      proposal: { templateId: "slack" },
    });
    await expect(
      application.proposeIntegration("Connect Outlook"),
    ).resolves.toMatchObject({
      status: "ready",
      proposal: { templateId: "outlook" },
    });
  });

  test("connects Slack with desktop PKCE and no client secret", async () => {
    let tokenBody: URLSearchParams | undefined;
    const request: FetchApi = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.includes("oauth-protected-resource")) {
        return Response.json({
          resource: "https://mcp.slack.com",
          authorization_servers: ["https://mcp.slack.com"],
        });
      }
      if (url.pathname.includes("oauth-authorization-server")) {
        return Response.json({
          issuer: "https://mcp.slack.com",
          authorization_endpoint: "https://slack.com/oauth/v2_user/authorize",
          token_endpoint: "https://slack.com/api/oauth.v2.user.access",
          response_types_supported: ["code"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["client_secret_post"],
          grant_types_supported: ["authorization_code", "refresh_token"],
        });
      }
      if (url.pathname === "/api/oauth.v2.user.access") {
        tokenBody = new URLSearchParams(String(init?.body));
        return Response.json({
          access_token: "slack-access-token",
          refresh_token: "slack-refresh-token",
          expires_in: 3600,
          token_type: "bearer",
        });
      }
      if (url.pathname === "/api/auth.test") {
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer slack-access-token",
        );
        return Response.json({ ok: true, team: "Acme Workspace" });
      }
      if (url.pathname === "/mcp" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          readonly id?: string | number;
          readonly method: string;
        };
        if (body.method === "notifications/initialized") {
          return new Response(null, { status: 202 });
        }
        const result =
          body.method === "initialize"
            ? {
                protocolVersion: "2025-11-25",
                capabilities: { tools: {} },
                serverInfo: { name: "slack", version: "1" },
              }
            : body.method === "tools/list"
              ? {
                  tools: [
                    {
                      name: "slack_search",
                      description: "Search Slack messages.",
                      inputSchema: { type: "object", properties: {} },
                      annotations: { readOnlyHint: true },
                    },
                  ],
                }
              : undefined;
        return Response.json({ jsonrpc: "2.0", id: body.id, result });
      }
      throw new Error(`Unexpected Slack OAuth request: ${url}`);
    };
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
      undefined,
      undefined,
      undefined,
      true,
      { slack: { clientId: "slack-public-client-id" } },
    );
    const http = createHttpApp(application);

    const started = await http.request(
      "http://127.0.0.1:4117/api/connectors/slack/oauth",
      { method: "POST", headers: { "content-type": "application/json" } },
    );
    expect(started.status).toBe(200);
    const startedBody = (await started.json()) as {
      readonly authorizationUrl: string;
    };
    const authorizationUrl = new URL(startedBody.authorizationUrl);
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      "https://slack.com/oauth/v2_user/authorize",
    );
    expect(authorizationUrl.searchParams.get("client_id")).toBe(
      "slack-public-client-id",
    );
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4117/api/connectors/slack/oauth/callback",
    );
    expect(authorizationUrl.searchParams.get("code_challenge")).toBeTruthy();
    expect(authorizationUrl.searchParams.get("scope")).toContain(
      "search:read.public",
    );

    const state = authorizationUrl.searchParams.get("state");
    expect(state).toBeTruthy();
    const completed = await http.request(
      `http://localhost:4117/api/connectors/slack/oauth/callback?code=slack-code&state=${encodeURIComponent(state ?? "")}`,
    );
    expect(completed.status).toBe(302);
    expect(tokenBody?.get("client_id")).toBe("slack-public-client-id");
    expect(tokenBody?.get("client_secret")).toBeNull();
    expect(tokenBody?.get("code_verifier")).toBeTruthy();
    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === "slack-default",
      ),
    ).toMatchObject({
      status: "connected",
      accountLabel: "Acme Workspace",
      name: "Slack · Acme Workspace",
      toolCount: 1,
    });
  });

  test("replaces a leftover Gmail API-key catalog row with native Google OAuth", async () => {
    const leftoverGmail: ConnectorManifest = {
      id: "gmail",
      name: "Gmail",
      blurb: "Legacy researched Gmail API-key setup.",
      transport: {
        kind: "http-api",
        baseUrl: "https://gmail.googleapis.com/gmail/v1",
        operations: [
          {
            name: "list_labels",
            description: "List labels.",
            method: "GET",
            path: "/users/me/labels",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            effect: "read",
          },
        ],
      },
      credential: { kind: "api-key", placeholder: "Gmail API key" },
    };
    const { application, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async () => Response.json({ results: [] }),
      undefined,
      undefined,
      undefined,
      true,
      {
        gmail: {
          clientId: "google-client-id",
          clientSecret: "google-client-secret",
          authorization: {
            authorizationEndpoint:
              "https://accounts.google.test/o/oauth2/v2/auth",
            tokenEndpoint: "https://oauth2.google.test/token",
          },
        },
      },
    );
    database.db
      .insert(integrationManifests)
      .values({
        id: leftoverGmail.id,
        manifest: leftoverGmail,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === "gmail",
      ),
    ).toMatchObject({
      credentialKind: "oauth",
      status: "not_connected",
      actionable: true,
      oauthReady: true,
      setupVariantId: "oauth",
    });
  });

  test("connects multiple Gmail accounts through native Google OAuth and the Gmail API", async () => {
    let tokenCount = 0;
    const gmailAuthorizations: string[] = [];
    const request: FetchApi = async (input, init) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.google.test") {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get("client_id")).toBe("springroll-google-client");
        expect(body.get("client_secret")).toBe("springroll-google-secret");
        tokenCount += 1;
        return Response.json({
          access_token: `gmail-access-${tokenCount}`,
          refresh_token: `gmail-refresh-${tokenCount}`,
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (url.origin === "https://gmail.googleapis.com") {
        const authorization = new Headers(init?.headers).get("authorization");
        if (authorization) gmailAuthorizations.push(authorization);
        if (url.pathname.endsWith("/profile")) {
          return Response.json({
            emailAddress:
              authorization === "Bearer gmail-access-1"
                ? "work@example.com"
                : "personal@example.com",
          });
        }
        if (url.pathname.endsWith("/labels")) {
          return Response.json({ labels: [{ id: "INBOX", name: "INBOX" }] });
        }
      }
      throw new Error(`Unexpected Gmail request: ${url}`);
    };
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
      undefined,
      undefined,
      undefined,
      true,
      {
        gmail: {
          clientId: "springroll-google-client",
          clientSecret: "springroll-google-secret",
          authorization: {
            authorizationEndpoint:
              "https://accounts.google.test/o/oauth2/v2/auth",
            tokenEndpoint: "https://oauth2.google.test/token",
            authorizationParameters: {
              access_type: "offline",
              prompt: "select_account consent",
            },
            accountIdentity: {
              endpoint:
                "https://gmail.googleapis.com/gmail/v1/users/me/profile",
              field: "emailAddress",
            },
          },
        },
      },
    );
    const http = createHttpApp(application);

    const connectAccount = async () => {
      const started = await http.request("/api/connectors/gmail/oauth", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      expect(started.status).toBe(200);
      const startBody = (await started.json()) as {
        readonly authorizationUrl: string;
        readonly connectionId: string;
      };
      const authorizationUrl = new URL(startBody.authorizationUrl);
      expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
        "https://accounts.google.test/o/oauth2/v2/auth",
      );
      expect(authorizationUrl.searchParams.get("scope")).toBe(
        "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.send",
      );
      expect(authorizationUrl.searchParams.get("prompt")).toBe(
        "select_account consent",
      );
      const state = authorizationUrl.searchParams.get("state");
      expect(state).toBeTruthy();
      const callback = await http.request(
        `/api/connectors/gmail/oauth/callback?code=google-code-${tokenCount + 1}&state=${encodeURIComponent(state ?? "")}`,
      );
      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toContain("oauth=connected");
      return startBody.connectionId;
    };

    const firstId = await connectAccount();
    const secondId = await connectAccount();
    expect(firstId).toBe("gmail-default");
    expect(secondId).toStartWith("gmail-");
    expect(secondId).not.toBe(firstId);

    const accounts = (await application.listConnections()).filter(
      (connection) => connection.manifestId === "gmail",
    );
    expect(accounts).toHaveLength(2);
    expect(accounts.map((connection) => connection.name).sort()).toEqual([
      "Gmail · personal@example.com",
      "Gmail · work@example.com",
    ]);
    expect(
      accounts.map((connection) => connection.accountLabel).sort(),
    ).toEqual(["personal@example.com", "work@example.com"]);
    expect(
      accounts.every(
        (connection) =>
          connection.status === "connected" &&
          connection.connectionType === "api" &&
          connection.endpoint === "https://gmail.googleapis.com/gmail/v1" &&
          connection.canAddAnother === true &&
          connection.toolCount === 7,
      ),
    ).toBe(true);
    expect(gmailAuthorizations).toEqual([
      "Bearer gmail-access-1",
      "Bearer gmail-access-1",
      "Bearer gmail-access-2",
      "Bearer gmail-access-2",
    ]);
  });

  test("prepare-then-sign-in for a connected Gmail provider adds another account", async () => {
    let tokenCount = 0;
    const request: FetchApi = async (input, init) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.google.test") {
        tokenCount += 1;
        return Response.json({
          access_token: `gmail-access-${tokenCount}`,
          refresh_token: `gmail-refresh-${tokenCount}`,
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (url.origin === "https://gmail.googleapis.com") {
        const authorization = new Headers(init?.headers).get("authorization");
        if (url.pathname.endsWith("/profile")) {
          return Response.json({
            emailAddress:
              authorization === "Bearer gmail-access-1"
                ? "work@example.com"
                : "personal@example.com",
          });
        }
        if (url.pathname.endsWith("/labels")) {
          return Response.json({ labels: [{ id: "INBOX", name: "INBOX" }] });
        }
      }
      throw new Error(`Unexpected Gmail request: ${url}`);
    };
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
      undefined,
      undefined,
      undefined,
      true,
      {
        gmail: {
          clientId: "springroll-google-client",
          clientSecret: "springroll-google-secret",
          authorization: {
            authorizationEndpoint:
              "https://accounts.google.test/o/oauth2/v2/auth",
            tokenEndpoint: "https://oauth2.google.test/token",
            authorizationParameters: {
              access_type: "offline",
              prompt: "select_account consent",
            },
            accountIdentity: {
              endpoint:
                "https://gmail.googleapis.com/gmail/v1/users/me/profile",
              field: "emailAddress",
            },
          },
        },
      },
    );
    const http = createHttpApp(application);
    const firstStarted = await http.request("/api/connectors/gmail/oauth", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const firstBody = (await firstStarted.json()) as {
      readonly authorizationUrl: string;
      readonly connectionId: string;
    };
    const firstState = new URL(firstBody.authorizationUrl).searchParams.get(
      "state",
    );
    await http.request(
      `/api/connectors/gmail/oauth/callback?code=google-code-1&state=${encodeURIComponent(firstState ?? "")}`,
    );

    const prepared = await http.request("/api/integrations/gmail/select", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variantId: "oauth" }),
    });
    expect(prepared.status).toBe(200);
    const preparedCard = (await prepared.json()) as {
      readonly id: string;
      readonly manifestId?: string;
      readonly name: string;
    };
    expect(preparedCard.id).toBe("gmail-default");
    expect(preparedCard.manifestId).toBe("gmail");
    expect(preparedCard.name).toBe("Gmail · work@example.com");

    const secondStarted = await http.request(
      `/api/connectors/${encodeURIComponent(preparedCard.manifestId ?? preparedCard.id)}/oauth`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
      },
    );
    expect(secondStarted.status).toBe(200);
    const secondBody = (await secondStarted.json()) as {
      readonly authorizationUrl: string;
      readonly connectionId: string;
    };
    expect(secondBody.connectionId).not.toBe(firstBody.connectionId);
    const secondState = new URL(secondBody.authorizationUrl).searchParams.get(
      "state",
    );
    await http.request(
      `/api/connectors/gmail/oauth/callback?code=google-code-2&state=${encodeURIComponent(secondState ?? "")}`,
    );

    const accounts = (await application.listConnections()).filter(
      (connection) => connection.manifestId === "gmail",
    );
    expect(accounts).toHaveLength(2);
    expect(
      accounts.find((connection) => connection.id === "gmail-default")?.name,
    ).toBe("Gmail · work@example.com");
    expect(
      accounts.find((connection) => connection.id === "gmail-default")
        ?.accountLabel,
    ).toBe("work@example.com");
    expect(
      accounts.find((connection) => connection.id !== "gmail-default")?.name,
    ).toBe("Gmail · personal@example.com");
    expect(
      accounts.find((connection) => connection.id !== "gmail-default")
        ?.accountLabel,
    ).toBe("personal@example.com");
  });

  test("normal Gmail setup includes send and draft permissions with tool approval controls", async () => {
    let tokenCount = 0;
    const request: FetchApi = async (input) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.google.test") {
        tokenCount += 1;
        return Response.json({
          access_token: `gmail-access-${tokenCount}`,
          refresh_token: `gmail-refresh-${tokenCount}`,
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (url.origin === "https://gmail.googleapis.com") {
        if (url.pathname.endsWith("/profile")) {
          return Response.json({ emailAddress: "work@example.com" });
        }
        if (url.pathname.endsWith("/labels")) {
          return Response.json({ labels: [{ id: "INBOX", name: "INBOX" }] });
        }
      }
      throw new Error(`Unexpected Gmail request: ${url}`);
    };
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
      undefined,
      undefined,
      undefined,
      true,
      {
        gmail: {
          clientId: "springroll-google-client",
          clientSecret: "springroll-google-secret",
          authorization: {
            authorizationEndpoint:
              "https://accounts.google.test/o/oauth2/v2/auth",
            tokenEndpoint: "https://oauth2.google.test/token",
            authorizationParameters: {
              access_type: "offline",
              prompt: "select_account consent",
            },
            accountIdentity: {
              endpoint:
                "https://gmail.googleapis.com/gmail/v1/users/me/profile",
              field: "emailAddress",
            },
          },
        },
      },
      undefined,
    );
    const http = createHttpApp(application);
    const started = await http.request("/api/connectors/gmail/oauth", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const startBody = (await started.json()) as {
      readonly authorizationUrl: string;
      readonly connectionId: string;
    };
    const firstState = new URL(startBody.authorizationUrl).searchParams.get(
      "state",
    );
    await http.request(
      `/api/connectors/gmail/oauth/callback?code=google-code-1&state=${encodeURIComponent(firstState ?? "")}`,
    );

    const connected = (await application.listConnections()).find(
      (connection) => connection.id === startBody.connectionId,
    );
    await expect(
      application.connectionToolNeedsApproval(
        startBody.connectionId,
        "create_draft",
        {},
      ),
    ).rejects.toThrow(
      "Missing required inputs for create_draft: to, subject, body",
    );
    await expect(
      application.connectionToolNeedsApproval(
        startBody.connectionId,
        "create_draft",
        { to: "self@example.com", subject: "Test", body: "Test draft" },
      ),
    ).resolves.toBe(false);
    await application.updateConnectionToolPolicy(startBody.connectionId, {
      toolName: "create_draft",
      mode: "check_first",
    });
    await expect(
      application.connectionToolNeedsApproval(
        startBody.connectionId,
        "create_draft",
        { to: "self@example.com", subject: "Test", body: "Test draft" },
      ),
    ).resolves.toBe(true);
    expect(connected).toMatchObject({
      toolCount: 7,
      permissionSets: [
        { id: "read", granted: true },
        { id: "drafts", granted: true },
        { id: "send", granted: true },
      ],
    });
    expect(connected?.tools?.map((tool) => tool.name)).toContain(
      "send_message",
    );

    const upgrade = await http.request(
      `/api/connectors/${startBody.connectionId}/oauth`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permissionSet: "send" }),
      },
    );
    expect(upgrade.status).toBe(200);
    const upgradeBody = (await upgrade.json()) as {
      readonly authorizationUrl: string;
    };
    const upgradeUrl = new URL(upgradeBody.authorizationUrl);
    expect(upgradeUrl.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.send",
    );
    const upgradeState = upgradeUrl.searchParams.get("state");
    await http.request(
      `/api/connectors/gmail/oauth/callback?code=google-code-2&state=${encodeURIComponent(upgradeState ?? "")}`,
    );

    const sending = (await application.listConnections()).find(
      (connection) => connection.id === startBody.connectionId,
    );
    expect(sending?.permissionSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "read", granted: true }),
        expect.objectContaining({ id: "send", granted: true }),
        expect.objectContaining({ id: "drafts", granted: true }),
      ]),
    );
    expect(sending?.tools?.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["search_threads", "send_message"]),
    );
    const detail = await application.getConnectionDetail(
      startBody.connectionId,
    );
    expect(detail).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: "send_message",
          effect: "write",
          mode: "check_first",
        }),
      ]),
    });
  });

  test("connects Google Calendar through native Calendar API with event management at initial consent", async () => {
    let tokenCount = 0;
    const request: FetchApi = async (input, init) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.google.test") {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get("client_id")).toBe("springroll-google-client");
        expect(body.get("client_secret")).toBe("springroll-google-secret");
        tokenCount += 1;
        return Response.json({
          access_token: `calendar-access-${tokenCount}`,
          refresh_token: `calendar-refresh-${tokenCount}`,
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (url.pathname === "/oauth2/v2/userinfo") {
        return Response.json({ email: "work@example.com" });
      }
      if (url.pathname.endsWith("/users/me/calendarList")) {
        return Response.json({
          items: [{ id: "primary", summary: "Work" }],
        });
      }
      throw new Error(`Unexpected Calendar request: ${url}`);
    };
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
      undefined,
      undefined,
      undefined,
      true,
      {
        "google-calendar": {
          clientId: "springroll-google-client",
          clientSecret: "springroll-google-secret",
          authorization: {
            authorizationEndpoint:
              "https://accounts.google.test/o/oauth2/v2/auth",
            tokenEndpoint: "https://oauth2.google.test/token",
            authorizationParameters: {
              access_type: "offline",
              prompt: "select_account consent",
            },
            accountIdentity: {
              endpoint: "https://www.googleapis.com/oauth2/v2/userinfo",
              field: "email",
            },
          },
        },
      },
    );
    const http = createHttpApp(application);
    const started = await http.request(
      "/api/connectors/google-calendar/oauth",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
      },
    );
    const startBody = (await started.json()) as {
      readonly authorizationUrl: string;
      readonly connectionId: string;
    };
    expect(new URL(startBody.authorizationUrl).searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events",
    );
    const firstState = new URL(startBody.authorizationUrl).searchParams.get(
      "state",
    );
    await http.request(
      `/api/connectors/google-calendar/oauth/callback?code=google-code-1&state=${encodeURIComponent(firstState ?? "")}`,
    );

    const connected = (await application.listConnections()).find(
      (connection) => connection.id === startBody.connectionId,
    );
    expect(connected).toMatchObject({
      accountLabel: "work@example.com",
      permissionSets: [
        { id: "read", granted: true },
        { id: "write", granted: true },
      ],
    });
    expect(connected?.tools?.map((tool) => tool.name)).toContain(
      "create_event",
    );

    const upgrade = await http.request(
      `/api/connectors/${startBody.connectionId}/oauth`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permissionSet: "write" }),
      },
    );
    const upgradeBody = (await upgrade.json()) as {
      readonly authorizationUrl: string;
    };
    expect(
      new URL(upgradeBody.authorizationUrl).searchParams.get("scope"),
    ).toBe(
      "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events",
    );
    const upgradeState = new URL(upgradeBody.authorizationUrl).searchParams.get(
      "state",
    );
    await http.request(
      `/api/connectors/google-calendar/oauth/callback?code=google-code-2&state=${encodeURIComponent(upgradeState ?? "")}`,
    );
    const writing = (await application.listConnections()).find(
      (connection) => connection.id === startBody.connectionId,
    );
    expect(writing?.permissionSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "read", granted: true }),
        expect.objectContaining({ id: "write", granted: true }),
      ]),
    );
    expect(writing?.tools?.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["list_events", "create_event"]),
    );
  });

  test("connects Outlook through native Graph OAuth and a write permission upgrade", async () => {
    let tokenCount = 0;
    const request: FetchApi = async (input, init) => {
      const url = new URL(String(input));
      if (url.origin === "https://login.microsoftonline.test") {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get("client_id")).toBe("springroll-entra-client");
        expect(body.has("client_secret")).toBe(false);
        tokenCount += 1;
        return Response.json({
          access_token: `graph-access-${tokenCount}`,
          refresh_token: `graph-refresh-${tokenCount}`,
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (url.pathname === "/v1.0/me" && url.searchParams.has("$select")) {
        const authorization = new Headers(init?.headers).get("authorization");
        return Response.json({
          userPrincipalName:
            authorization === "Bearer graph-access-3"
              ? "client@example.com"
              : "doug@example.com",
        });
      }
      if (url.pathname === "/v1.0/me/messages") {
        expect(new Headers(init?.headers).get("authorization")).toMatch(
          /^Bearer graph-access-/,
        );
        return Response.json({ value: [] });
      }
      throw new Error(`Unexpected Outlook request: ${url}`);
    };
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
      undefined,
      undefined,
      undefined,
      true,
      {
        outlook: {
          clientId: "springroll-entra-client",
          authorization: {
            authorizationEndpoint:
              "https://login.microsoftonline.test/common/oauth2/v2.0/authorize",
            tokenEndpoint:
              "https://login.microsoftonline.test/common/oauth2/v2.0/token",
            authorizationParameters: { prompt: "select_account" },
            accountIdentity: {
              endpoint:
                "https://graph.microsoft.com/v1.0/me?$select=userPrincipalName",
              field: "userPrincipalName",
            },
          },
        },
      },
    );
    const http = createHttpApp(application);
    const started = await http.request(
      "http://127.0.0.1:4117/api/connectors/outlook/oauth",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
      },
    );
    expect(started.status).toBe(200);
    const startBody = (await started.json()) as {
      readonly authorizationUrl: string;
      readonly connectionId: string;
    };
    const authorizationUrl = new URL(startBody.authorizationUrl);
    expect(authorizationUrl.searchParams.get("scope")).toBe(
      "openid profile offline_access User.Read Mail.Read Calendars.Read",
    );
    expect(authorizationUrl.searchParams.get("prompt")).toBe("select_account");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4117/api/connectors/outlook/oauth/callback",
    );
    const firstState = authorizationUrl.searchParams.get("state");
    const callback = await http.request(
      `http://localhost:4117/api/connectors/outlook/oauth/callback?code=entra-code-1&state=${encodeURIComponent(firstState ?? "")}`,
    );
    expect(callback.status).toBe(302);

    const connected = (await application.listConnections()).find(
      (connection) => connection.id === startBody.connectionId,
    );
    expect(connected).toMatchObject({
      accountLabel: "doug@example.com",
      permissionSets: [
        { id: "read", granted: true },
        { id: "write", granted: false },
      ],
    });
    expect(connected?.tools?.map((tool) => tool.name)).toContain(
      "list_messages",
    );
    expect(connected?.tools?.map((tool) => tool.name)).not.toContain(
      "send_mail",
    );

    const upgrade = await http.request(
      `http://127.0.0.1:4117/api/connectors/${startBody.connectionId}/oauth`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permissionSet: "write" }),
      },
    );
    const upgradeBody = (await upgrade.json()) as {
      readonly authorizationUrl: string;
    };
    const upgradeUrl = new URL(upgradeBody.authorizationUrl);
    expect(upgradeUrl.searchParams.get("scope")).toBe(
      "openid profile offline_access User.Read Mail.Read Calendars.Read Mail.Send Calendars.ReadWrite",
    );
    const upgradeState = upgradeUrl.searchParams.get("state");
    await http.request(
      `http://localhost:4117/api/connectors/outlook/oauth/callback?code=entra-code-2&state=${encodeURIComponent(upgradeState ?? "")}`,
    );
    const writing = (await application.listConnections()).find(
      (connection) => connection.id === startBody.connectionId,
    );
    expect(writing?.tools?.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["list_messages", "send_mail", "create_event"]),
    );

    expect(
      await application.getConnectionDetail(startBody.connectionId),
    ).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: "send_mail", mode: "check_first" }),
        expect.objectContaining({ name: "create_event", mode: "allow" }),
      ]),
    });

    const secondStart = await http.request(
      "http://127.0.0.1:4117/api/connectors/outlook/oauth",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
      },
    );
    const secondStartBody = (await secondStart.json()) as {
      readonly authorizationUrl: string;
      readonly connectionId: string;
    };
    expect(secondStartBody.connectionId).not.toBe(startBody.connectionId);
    const secondUrl = new URL(secondStartBody.authorizationUrl);
    await http.request(
      `http://localhost:4117/api/connectors/outlook/oauth/callback?code=entra-code-3&state=${encodeURIComponent(secondUrl.searchParams.get("state") ?? "")}`,
    );
    expect(
      (await application.listConnections())
        .filter((connection) => connection.manifestId === "outlook")
        .map((connection) => connection.accountLabel)
        .toSorted(),
    ).toEqual(["client@example.com", "doug@example.com"]);
  });

  test("marks installed connectors unavailable when their host credential disappears", async () => {
    const manifest: ConnectorManifest = {
      id: "credential-expiry-fixture",
      name: "Credential Expiry Fixture",
      blurb: "Exercises connector credential availability.",
      transport: {
        kind: "openapi",
        specUrl: "https://api.example.test/openapi.json",
        baseUrl: "https://api.example.test/v1",
      },
      credential: {
        kind: "api-key",
        placeholder: "Fixture API key",
        header: "X-API-Key",
      },
      probe: { tool: "health", input: {} },
    };
    const { application, credentials, database } = createHarness();
    const credentialRef = "connector-credential-expiry-fixture-default";
    database.db
      .insert(integrationManifests)
      .values({ id: manifest.id, manifest, createdAt: now, updatedAt: now })
      .run();
    database.db
      .insert(connectionTable)
      .values({
        id: `${manifest.id}-default`,
        name: manifest.name,
        sourceId: "openapi",
        manifestId: manifest.id,
        credentialRef,
        config: {
          discovery: "passed",
          credentialVerification: "passed",
          toolCount: 1,
        },
        availableIn: ["local", "hosted"],
        createdAt: now,
        updatedAt: now,
      })
      .run();

    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === `${manifest.id}-default`,
      ),
    ).toMatchObject({
      installed: true,
      status: "not_connected",
      credentialConfigured: false,
      connectionIssue: "credential_missing",
    });

    await credentials.put(credentialRef, "fixture-secret");
    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === `${manifest.id}-default`,
      ),
    ).toMatchObject({
      status: "connected",
      credentialConfigured: true,
    });

    await credentials.delete(credentialRef);
    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === `${manifest.id}-default`,
      ),
    ).toMatchObject({
      status: "not_connected",
      connectionIssue: "credential_missing",
    });
  });

  test("marks native OAuth connections unavailable after an invalid refresh grant", async () => {
    const request: FetchApi = async (input) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.google.test") {
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      throw new Error(`Unexpected OAuth refresh request: ${url}`);
    };
    const { application, credentials, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
      undefined,
      undefined,
      undefined,
      true,
      {
        gmail: {
          clientId: "springroll-google-client",
          clientSecret: "springroll-google-secret",
          authorization: {
            authorizationEndpoint:
              "https://accounts.google.test/o/oauth2/v2/auth",
            tokenEndpoint: "https://oauth2.google.test/token",
          },
        },
      },
    );
    const connectionId = "gmail-expired-test";
    const credentialRef = "connector-gmail-expired-test";
    const redirectUrl =
      "http://127.0.0.1:4117/api/connectors/gmail/oauth/callback";
    await credentials.put(
      credentialRef,
      JSON.stringify({
        serverUrl: "https://gmail.googleapis.com/gmail/v1",
        redirectUrl,
        tokens: {
          access_token: "expired-access-token",
          refresh_token: "expired-refresh-token",
          token_type: "Bearer",
        },
        tokenExpiresAt: Date.now() - 1,
      }),
    );
    database.db
      .insert(connectionTable)
      .values({
        id: connectionId,
        name: "Gmail · expired@example.com",
        sourceId: "http-api",
        manifestId: "gmail",
        credentialRef,
        config: {
          disconnected: false,
          oauthRedirectUrl: redirectUrl,
          grantedPermissionSets: ["read"],
          discovery: "passed",
          credentialVerification: "passed",
        },
        availableIn: ["local"],
        createdAt: now,
        updatedAt: now,
      })
      .run();

    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === connectionId,
      ),
    ).toMatchObject({
      status: "connected",
      credentialConfigured: true,
    });

    await expect(
      application.callReadConnectionTool(connectionId, "search_threads", {
        query: "meeting",
      }),
    ).rejects.toThrow("OAuth token refresh failed (400). Sign in again.");

    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === connectionId,
      ),
    ).toMatchObject({
      status: "not_connected",
      credentialConfigured: false,
      connectionIssue: "credential_missing",
    });
  });

  test("researches Snowflake by name instead of proposing Neon for database intent", async () => {
    const intents: string[] = [];
    const outcome = {
      status: "not_found" as const,
      title: "Continue researching Snowflake",
      explanation: "Inspect official Snowflake setup documentation.",
    };
    const { application } = createHarness(
      undefined,
      undefined,
      undefined,
      undefined,
      {
        research: async (intent) => {
          intents.push(intent);
          return outcome;
        },
      },
    );
    const before = await application.listConnections();
    const intent =
      "Snowflake database SQL queries and data warehouse integration";
    const response = await createHttpApp(application).request(
      "/api/integrations/propose",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sentence: intent }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(outcome);
    expect(intents).toEqual([intent]);
    expect(await application.listConnections()).toEqual(before);
  });

  test("proposes safe registry setup and persists only the selected manifest variant", async () => {
    const { application, database } = createHarness();
    const http = createHttpApp(application);

    const proposed = await http.request("/api/integrations/propose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sentence: "Connect my Neon database" }),
    });
    expect(proposed.status).toBe(200);
    expect(await proposed.json()).toMatchObject({
      status: "ready",
      proposal: {
        templateId: "neon",
        variants: [
          {
            id: "oauth",
            recommended: true,
            credentialKind: "oauth",
          },
          {
            id: "api-key",
            recommended: false,
            credentialKind: "api-key",
          },
        ],
      },
    });

    const recommended = await http.request("/api/integrations/neon/select", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variantId: "oauth" }),
    });
    expect(recommended.status).toBe(200);
    expect(await recommended.json()).toMatchObject({
      id: "neon",
      credentialKind: "oauth",
      setupVariantId: "oauth",
    });

    const selected = await http.request("/api/integrations/neon/select", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variantId: "api-key" }),
    });
    expect(selected.status).toBe(200);
    expect(await selected.json()).toMatchObject({
      id: "neon",
      status: "not_connected",
      credentialKind: "api-key",
    });
    const persisted = database.db
      .select()
      .from(integrationManifests)
      .all()
      .find((row) => row.id === "neon");
    expect(persisted?.manifest).toMatchObject({
      id: "neon",
      credential: { kind: "api-key" },
    });
    expect(JSON.stringify(persisted)).not.toContain("secret");

    database.db
      .insert(connectionTable)
      .values({
        id: "neon-default",
        name: "Neon",
        sourceId: "mcp-remote",
        manifestId: "neon",
        credentialRef: "neon-mcp-default",
        config: { disconnected: true },
        availableIn: ["local", "hosted"],
        createdAt: now,
        updatedAt: now,
      })
      .run();
    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === "neon-default",
      ),
    ).toMatchObject({ installed: true, removable: true, canAddAnother: true });
    await expect(
      application.proposeConnectionAction("neon", "remove"),
    ).resolves.toMatchObject({
      status: "ready",
      proposal: { connectionId: "neon-default", removable: true },
    });
    expect(
      (await http.request("/api/connectors/neon", { method: "DELETE" })).status,
    ).toBe(204);
    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === "neon",
      ),
    ).toMatchObject({
      installed: false,
      removable: false,
      credentialKind: "oauth",
    });
    expect(
      database.db
        .select()
        .from(integrationManifests)
        .all()
        .find((row) => row.id === "neon"),
    ).toBeUndefined();

    expect(
      await (
        await http.request("/api/integrations/propose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sentence: "Connect Slack" }),
        })
      ).json(),
    ).toMatchObject({
      status: "unavailable",
      title: "Slack isn't ready to connect yet",
    });
  });

  test("reviews researched official connectors before persisting them", async () => {
    const stripeManifest: ConnectorManifest = {
      id: "stripe",
      name: "Stripe",
      blurb: "<b>Payments</b> — inspect customers, products, and balances.",
      transport: { kind: "mcp-remote", endpoint: "https://mcp.stripe.com/" },
      credential: { kind: "oauth" },
      probe: { tool: "get_stripe_account_info", input: {} },
      tools: {
        allow: [
          "get_stripe_account_info",
          "retrieve_balance",
          "list_customers",
        ],
        risk: {
          get_stripe_account_info: {
            effect: "read",
            openWorld: true,
            idempotent: true,
          },
          retrieve_balance: {
            effect: "read",
            openWorld: true,
            idempotent: true,
          },
          list_customers: {
            effect: "read",
            openWorld: true,
            idempotent: true,
          },
        },
      },
    };
    const researcher: IntegrationResearcher = {
      async research() {
        return {
          status: "ready",
          integration: {
            manifest: stripeManifest,
            operator: "Stripe",
            registryName: "com.stripe/mcp",
            registryVersion: "0.2.4",
            guidance: {
              summary:
                "Sign in to Stripe and review the requested account access.",
              steps: ["Choose Sign in with Stripe.", "Approve account access."],
              docsUrl: "https://docs.stripe.com/mcp",
            },
            sources: [
              {
                title: "Stripe MCP documentation",
                url: "https://docs.stripe.com/mcp",
              },
            ],
          },
        };
      },
    };
    const { application, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async () => Response.json({ results: [] }),
      researcher,
    );
    const http = createHttpApp(application);

    const response = await http.request("/api/integrations/propose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sentence: "Research the official payment provider connector",
      }),
    });
    const outcome = (await response.json()) as {
      status: string;
      proposal: {
        templateId: string;
        trust: string;
        registryName: string;
        manifest: ConnectorManifest;
        tools: readonly { name: string; effect: string }[];
      };
    };
    expect(outcome).toMatchObject({
      status: "ready",
      proposal: {
        trust: "registry-verified",
        registryName: "com.stripe/mcp",
        manifest: { id: "stripe", credential: { kind: "oauth" } },
        tools: [
          { name: "get_stripe_account_info", effect: "read" },
          { name: "retrieve_balance", effect: "read" },
          { name: "list_customers", effect: "read" },
        ],
      },
    });
    expect(database.db.select().from(integrationManifests).all()).toEqual([]);

    const accepted = await http.request(
      `/api/integrations/${encodeURIComponent(outcome.proposal.templateId)}/select`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variantId: "researched" }),
      },
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({
      id: "stripe",
      status: "not_connected",
      credentialKind: "oauth",
    });
    expect(database.db.select().from(integrationManifests).all()).toHaveLength(
      1,
    );
    expect(database.db.select().from(connectionTable).all()).not.toContainEqual(
      expect.objectContaining({ manifestId: "stripe" }),
    );
  });

  test("keeps an agent-researched local package reviewable until acceptance", async () => {
    const manifest: ConnectorManifest = {
      id: "microsoft-clarity",
      name: "Microsoft Clarity",
      blurb: "<b>Local</b> — read Clarity analytics from this Mac.",
      transport: {
        kind: "mcp-local",
        package: {
          registry: "npm",
          name: "@microsoft/clarity-mcp-server",
          version: "2.0.1",
        },
      },
      credential: {
        kind: "api-key",
        env: "CLARITY_API_TOKEN",
        placeholder: "Clarity Data Export API token",
      },
    };
    const localResearcher: LocalMcpIntegrationResearcher = {
      async researchLocalMcp(input) {
        expect(input.packageName).toBe("@microsoft/clarity-mcp-server");
        return {
          status: "ready",
          integration: {
            manifest,
            operator: "Microsoft",
            trust: "package-verified",
            packageName: "@microsoft/clarity-mcp-server",
            packageVersion: "2.0.1",
            guidance: input.guidance,
            sources: input.sources,
          },
        };
      },
    };
    const { application, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async () => Response.json({ results: [] }),
      undefined,
      undefined,
      localResearcher,
    );

    const outcome = await application.proposeLocalMcpIntegration({
      name: "Microsoft Clarity",
      operator: "Microsoft",
      description: "Read Clarity analytics from this Mac.",
      packageName: "@microsoft/clarity-mcp-server",
      repositoryUrl: "https://github.com/microsoft/clarity-mcp-server",
      credential: {
        kind: "api-key",
        env: "CLARITY_API_TOKEN",
        placeholder: "Clarity Data Export API token",
      },
      guidance: {
        summary: "Generate a Data Export API token.",
        steps: ["Open Settings, then Data Export."],
        docsUrl: "https://learn.microsoft.com/clarity",
      },
      sources: [
        {
          title: "Microsoft Learn",
          url: "https://learn.microsoft.com/clarity",
        },
        {
          title: "Microsoft source",
          url: "https://github.com/microsoft/clarity-mcp-server",
        },
      ],
    });
    expect(outcome).toMatchObject({
      status: "ready",
      proposal: {
        trust: "package-verified",
        packageName: "@microsoft/clarity-mcp-server",
        packageVersion: "2.0.1",
        manifest,
      },
    });
    expect(database.db.select().from(integrationManifests).all()).toEqual([]);
    if (outcome.status !== "ready") throw new Error("Expected proposal");

    await application.prepareIntegrationVariant(
      outcome.proposal.templateId,
      "researched",
      outcome.proposal.manifest,
    );
    expect(
      database.db.select().from(integrationManifests).all()[0]?.manifest,
    ).toEqual(manifest);
  });

  test("verifies a repositoryless scoped package against exact official documentation", async () => {
    const manifest: ConnectorManifest = {
      id: "shopify-dev-mcp",
      name: "Shopify Dev MCP",
      blurb: "<b>Local</b> — current Shopify developer guidance.",
      transport: {
        kind: "mcp-local",
        package: {
          registry: "npm",
          name: "@shopify/dev-mcp",
          version: "1.14.4",
        },
      },
      credential: { kind: "none" },
    };
    const localResearcher: LocalMcpIntegrationResearcher = {
      async researchLocalMcp(input) {
        expect(input.repositoryUrl).toBeUndefined();
        expect(input.packageNamedByOfficialDocumentation).toBe(true);
        return {
          status: "ready",
          integration: {
            manifest,
            operator: "Shopify",
            trust: "package-verified",
            packageName: input.packageName,
            packageVersion: "1.14.4",
            guidance: input.guidance,
            sources: input.sources,
          },
        };
      },
    };
    const webSource = createNativeToolSource("native.web", [
      {
        descriptor: {
          name: "fetch_public_url",
          description: "Fetch official documentation.",
          inputSchema: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"],
            additionalProperties: false,
          },
          declaredRisk: {
            effect: "read",
            openWorld: true,
            idempotent: true,
          },
        },
        async execute() {
          return {
            content: [
              "Run npx -y @shopify/dev-mcp@latest. No authentication is required.",
            ],
            structuredContent: {
              url: "https://shopify.dev/docs/apps/build/ai-toolkit.md",
            },
          };
        },
      },
    ]);
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async () => Response.json({ results: [] }),
      undefined,
      [webSource],
      localResearcher,
    );

    const outcome = await application.proposeLocalMcpIntegration({
      name: "Shopify Dev MCP",
      operator: "Shopify",
      description: "Current Shopify developer guidance.",
      packageName: "@shopify/dev-mcp",
      credential: { kind: "none" },
      guidance: {
        summary: "Install Shopify's documented MCP.",
        steps: ["Review and install the pinned package."],
        docsUrl: "https://shopify.dev/docs/apps/build/ai-toolkit",
      },
      sources: [
        {
          title: "Shopify AI Toolkit",
          url: "https://shopify.dev/docs/apps/build/ai-toolkit",
        },
      ],
    });

    expect(outcome).toMatchObject({
      status: "ready",
      proposal: {
        packageName: "@shopify/dev-mcp",
        packageVersion: "1.14.4",
      },
    });
  });

  test("turns an unverifiable package guess into a recoverable follow-up", async () => {
    const localResearcher: LocalMcpIntegrationResearcher = {
      async researchLocalMcp() {
        throw new TypeError("npm returned 404");
      },
    };
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async () => Response.json({ results: [] }),
      undefined,
      undefined,
      localResearcher,
    );

    const outcome = await application.proposeLocalMcpIntegration({
      name: "Microsoft Clarity",
      operator: "Microsoft",
      description: "Read Clarity analytics.",
      packageName: "@microsoft/clarity-mcp",
      repositoryUrl: "https://github.com/microsoft/clarity-mcp-server",
      credential: { kind: "none" },
      guidance: {
        summary: "Follow the official setup instructions.",
        steps: ["Open the documentation."],
        docsUrl: "https://learn.microsoft.com/clarity",
      },
      sources: [
        {
          title: "Microsoft Learn",
          url: "https://learn.microsoft.com/clarity",
        },
        {
          title: "Microsoft source",
          url: "https://github.com/microsoft/clarity-mcp-server",
        },
      ],
    });

    expect(outcome).toMatchObject({
      status: "not_found",
      title: "I couldn't verify @microsoft/clarity-mcp",
      explanation: expect.stringContaining(
        "ask the user for an official documentation, repository, or package URL",
      ),
    });
  });

  test("extracts package and repository evidence from an official connector source", async () => {
    const fetchedInputs: unknown[] = [];
    const webSource = createNativeToolSource("native.web", [
      {
        descriptor: {
          name: "fetch_public_url",
          description: "Fetch official documentation.",
          inputSchema: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"],
            additionalProperties: false,
          },
          declaredRisk: {
            effect: "read",
            openWorld: true,
            idempotent: true,
          },
        },
        async execute(input) {
          fetchedInputs.push(input);
          return {
            content: [
              "Install with npx @microsoft/clarity-mcp-server. Source: https://github.com/microsoft/clarity-mcp-server",
            ],
            structuredContent: {
              url: "https://clarity.microsoft.com/blog/mcp",
            },
          };
        },
      },
    ]);
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async () => Response.json({ results: [] }),
      undefined,
      [webSource],
    );

    await expect(
      application.inspectConnectorSource(
        "https://clarity.microsoft.com/blog/mcp",
      ),
    ).resolves.toMatchObject({
      sourceUrl: "https://clarity.microsoft.com/blog/mcp",
      npmPackages: ["@microsoft/clarity-mcp-server"],
      repositoryUrls: ["https://github.com/microsoft/clarity-mcp-server"],
    });
    await application.inspectConnectorSource(
      "https://github.com/microsoft/clarity-mcp-server",
    );
    await application.inspectConnectorSource(
      "https://github.com/microsoft/clarity-mcp-server/blob/main/package.json",
    );
    expect(fetchedInputs).toEqual([
      { url: "https://clarity.microsoft.com/blog/mcp" },
      {
        url: "https://raw.githubusercontent.com/microsoft/clarity-mcp-server/HEAD/README.md",
      },
      {
        url: "https://raw.githubusercontent.com/microsoft/clarity-mcp-server/main/package.json",
      },
    ]);
  });

  test("verifies and prepares Clerk's documented no-auth remote MCP", async () => {
    const docsUrl = "https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server";
    const endpoint = "https://mcp.clerk.com/mcp";
    const webSource = createNativeToolSource("native.web", [
      {
        descriptor: {
          name: "fetch_public_url",
          description: "Fetch official documentation.",
          inputSchema: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"],
            additionalProperties: false,
          },
          declaredRisk: {
            effect: "read",
            openWorld: true,
            idempotent: true,
          },
        },
        async execute(input) {
          expect(input).toEqual({ url: docsUrl });
          return {
            content: [
              `Clerk's remote MCP server uses Streamable HTTP at ${endpoint}.`,
            ],
            structuredContent: { url: docsUrl },
          };
        },
      },
    ]);
    const request: FetchApi = async (input, init) => {
      expect(String(input)).toBe(endpoint);
      const body = JSON.parse(String(init?.body)) as {
        readonly id?: string | number;
        readonly method: string;
      };
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      const result =
        body.method === "initialize"
          ? {
              protocolVersion: "2025-11-25",
              capabilities: { tools: {} },
              serverInfo: { name: "clerk", version: "1" },
            }
          : body.method === "tools/list"
            ? {
                tools: [
                  {
                    name: "clerk_sdk_snippet",
                    description: "Find an official Clerk SDK snippet.",
                    inputSchema: {
                      type: "object",
                      properties: { query: { type: "string" } },
                      required: ["query"],
                    },
                    annotations: { readOnlyHint: true },
                  },
                ],
              }
            : undefined;
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    };
    const { application, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
      undefined,
      [webSource],
    );

    const outcome = await application.proposeRemoteMcpIntegration({
      name: "Clerk",
      operator: "Clerk",
      description: "Use Clerk's official SDK documentation tools.",
      tags: ["authentication", "developer-tools"],
      endpoint,
      docsUrl,
      credential: { kind: "none" },
    });

    expect(outcome).toMatchObject({
      status: "ready",
      proposal: {
        trust: "provider-verified",
        tools: [{ name: "clerk_sdk_snippet", effect: "read" }],
        variants: [
          {
            credentialKind: "none",
            guidance: { docsUrl },
          },
        ],
      },
    });
    if (outcome.status !== "ready") {
      throw new Error("Expected a ready Clerk proposal");
    }
    await application.prepareIntegrationVariant(
      outcome.proposal.templateId,
      outcome.proposal.variants[0]?.id ?? "researched",
      outcome.proposal.manifest,
    );
    expect(
      database.db.select().from(integrationManifests).all()[0]?.manifest,
    ).toMatchObject({
      id: "clerk",
      transport: { kind: "mcp-remote", endpoint },
      credential: { kind: "none" },
    });
  });

  test("does not present a credentialed REST endpoint as remote MCP", async () => {
    const docsUrl = "https://docs.dataforseo.test/v3/auth";
    const endpoint = "https://api.dataforseo.test/v3";
    const webSource = createNativeToolSource("native.web", [
      {
        descriptor: {
          name: "fetch_public_url",
          description: "Fetch official documentation.",
          inputSchema: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"],
            additionalProperties: false,
          },
          declaredRisk: { effect: "read", openWorld: true, idempotent: true },
        },
        async execute() {
          return {
            content: [`Use the REST API at ${endpoint} with HTTP Basic auth.`],
            structuredContent: { url: docsUrl },
          };
        },
      },
    ]);
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      undefined,
      undefined,
      [webSource],
    );

    await expect(
      application.proposeRemoteMcpIntegration({
        name: "DataForSEO",
        operator: "DataForSEO",
        description: "Read SEO data.",
        endpoint,
        docsUrl,
        credential: {
          kind: "api-key",
          header: "Authorization",
          placeholder: "DataForSEO API credential",
        },
      }),
    ).resolves.toMatchObject({
      status: "not_found",
      explanation: expect.stringContaining("does not describe an MCP"),
    });
  });

  test("prepares a user-supplied remote MCP URL as a labeled custom connector", async () => {
    const { application, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
    );
    const http = createHttpApp(application);

    const response = await http.request("/api/connectors/custom", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Internal Search",
        endpoint: "https://mcp.example.test/search",
        credentialKind: "oauth",
      }),
    });

    expect(response.status).toBe(200);
    const card = (await response.json()) as ConnectionCardDto;
    expect(card).toMatchObject({
      name: "Internal Search",
      status: "not_connected",
      endpoint: "https://mcp.example.test/search",
      credentialKind: "oauth",
      connectionType: "mcp",
      custom: true,
    });
    const [row] = database.db.select().from(integrationManifests).all();
    expect(row?.manifest).toMatchObject({
      id: card.id,
      transport: {
        kind: "mcp-remote",
        endpoint: "https://mcp.example.test/search",
      },
    });
    expect(row?.manifest.probe).toBeUndefined();
    expect(row?.manifest.tools).toBeUndefined();
  });

  test("imports one remote MCP from standard client configuration without model research", async () => {
    const { application, database } = createHarness();
    const http = createHttpApp(application);
    const response = await http.request("/api/connectors/import/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        configuration: JSON.stringify({
          mcpServers: {
            "Team Search": {
              type: "http",
              url: "https://mcp.example.test/search",
              headers: {
                "X-API-Key": ["$", "{TEAM_SEARCH_KEY}"].join(""),
              },
            },
          },
        }),
        credentialKind: "api-key",
      }),
    });
    const card = (await response.json()) as ConnectionCardDto;

    expect(response.status).toBe(200);
    expect(card).toMatchObject({
      name: "Team Search",
      endpoint: "https://mcp.example.test/search",
      credentialKind: "api-key",
      connectionType: "mcp",
      custom: true,
    });
    expect(
      database.db.select().from(integrationManifests).all()[0]?.manifest,
    ).toMatchObject({
      transport: {
        kind: "mcp-remote",
        endpoint: "https://mcp.example.test/search",
      },
      credential: { kind: "api-key", header: "X-API-Key" },
    });
  });

  test("rejects credential values embedded in imported MCP JSON", async () => {
    const { application } = createHarness();

    await expect(
      application.prepareImportedRemoteMcp({
        configuration: JSON.stringify({
          mcpServers: {
            unsafe: {
              url: "https://mcp.example.test/mcp",
              headers: { Authorization: "Bearer secret-value" },
            },
          },
        }),
        credentialKind: "api-key",
      }),
    ).rejects.toThrow("Remove the credential value");
  });

  test("creates and safely verifies a small adapter from ordinary API documentation", async () => {
    const docsUrl = "https://rates.example.test/docs";
    const baseUrl = "https://api.rates.example.test/v1";
    const webSource = createNativeToolSource("native.web", [
      {
        descriptor: {
          name: "fetch_public_url",
          description: "Fetch API documentation.",
          inputSchema: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"],
            additionalProperties: false,
          },
          declaredRisk: {
            effect: "read",
            openWorld: true,
            idempotent: true,
          },
        },
        async execute() {
          return {
            content: [
              `Rates API base URL: ${baseUrl}. GET /rates/latest accepts base and symbols query parameters.`,
            ],
            structuredContent: { url: docsUrl },
          };
        },
      },
    ]);
    const requests: string[] = [];
    const request: FetchApi = async (input) => {
      requests.push(String(input));
      return Response.json({ base: "USD", rates: { EUR: 0.86 } });
    };
    const { application, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
      undefined,
      [webSource],
    );

    const outcome = await application.proposeDocumentedApiIntegration({
      name: "Rates",
      operator: "Rates Example",
      description: "Read current exchange rates.",
      docsUrl,
      sourceUrls: [docsUrl],
      baseUrl,
      credential: { kind: "none" },
      operations: [
        {
          name: "get_latest_rates",
          description: "Read the latest rates for a base currency.",
          method: "GET",
          path: "/rates/latest",
          inputSchema: {
            type: "object",
            properties: {
              base: { type: "string" },
              symbols: { type: "string" },
            },
            required: ["base"],
            additionalProperties: false,
          },
          parameters: [
            {
              input: "base",
              name: "base",
              location: "query",
              required: true,
            },
            {
              input: "symbols",
              name: "symbols",
              location: "query",
              required: false,
            },
          ],
          effect: "read",
        },
      ],
      probe: {
        tool: "get_latest_rates",
        input: { base: "USD", symbols: "EUR" },
        note: "Read one public exchange rate.",
      },
    });

    expect(outcome).toMatchObject({
      status: "ready",
      proposal: {
        trust: "user-reviewed",
        api: { operationCount: 1 },
        tools: [{ name: "get_latest_rates", effect: "read" }],
        manifest: { transport: { kind: "http-api" } },
      },
    });
    if (outcome.status !== "ready") throw new Error("Expected API proposal");
    const prepared = await application.prepareIntegrationVariant(
      outcome.proposal.templateId,
      "researched",
      outcome.proposal.manifest,
    );
    const connected = await application.connectConnector(prepared.id, {});

    expect(connected).toMatchObject({
      status: "connected",
      connectionType: "api",
      toolCount: 1,
    });
    expect(requests).toEqual([
      "https://api.rates.example.test/v1/rates/latest?base=USD&symbols=EUR",
    ]);
    expect(
      database.db.select().from(integrationManifests).all()[0]?.manifest,
    ).toMatchObject({ transport: { kind: "http-api", baseUrl } });
  });

  test("collects and stores HTTP Basic API credentials together without refetching docs", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const { application, credentials } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async (input, init) => {
        requests.push({
          url: String(input),
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return Response.json({});
      },
    );

    const outcome = await application.proposeDocumentedApiIntegration({
      name: "DataForSEO",
      operator: "DataForSEO",
      description: "Read keyword metrics.",
      docsUrl: "https://docs.dataforseo.test/v3/",
      sourceUrls: [
        "https://docs.dataforseo.test/v3/",
        "https://raw.githubusercontent.test/dataforseo/openapi.json",
      ],
      baseUrl: "https://api.dataforseo.test",
      credential: {
        kind: "api-key",
        format: "http-basic",
        header: "Authorization",
        placeholder: "DataForSEO credentials",
        usernamePlaceholder: "DataForSEO API login",
        passwordPlaceholder: "DataForSEO API password",
      },
      probe: {
        tool: "keyword_metrics",
        input: { tasks: [] },
        note: "Read keyword metrics for an empty task list.",
      },
      operations: [
        {
          name: "keyword_metrics",
          description: "Read keyword metrics.",
          method: "POST",
          path: "/v3/keywords_data/google_ads/search_volume/live",
          inputSchema: {
            type: "object",
            properties: { tasks: { type: "array" } },
            required: ["tasks"],
            additionalProperties: false,
          },
          bodyInput: "tasks",
          effect: "read",
        },
      ],
    });

    expect(outcome).toMatchObject({
      status: "ready",
      proposal: {
        trust: "user-reviewed",
        api: { operationCount: 1 },
        manifest: {
          transport: {
            kind: "http-api",
            baseUrl: "https://api.dataforseo.test/",
          },
        },
      },
    });
    if (outcome.status !== "ready") throw new Error("Expected API proposal");
    expect(outcome.proposal.manifest?.probe?.tool).toBe("keyword_metrics");
    const prepared = await application.prepareIntegrationVariant(
      outcome.proposal.templateId,
      "researched",
      outcome.proposal.manifest,
    );
    expect(prepared.credentialFields).toEqual([
      {
        name: "username",
        label: "DataForSEO API login",
        secret: false,
        autoComplete: "username",
      },
      {
        name: "password",
        label: "DataForSEO API password",
        secret: true,
        autoComplete: "current-password",
      },
    ]);
    await expect(
      application.connectConnector(prepared.id, {
        fields: { username: "user@example.test" },
      }),
    ).rejects.toThrow("DataForSEO API password");
    await application.connectConnector(prepared.id, {
      fields: {
        username: "user@example.test",
        password: "dataforseo-password",
      },
    });
    expect(credentials.values.get("connector-dataforseo-default")).toBe(
      `Basic ${Buffer.from("user@example.test:dataforseo-password").toString("base64")}`,
    );
    expect(requests).toHaveLength(1);
    requests.length = 0;
    await application.callReadConnectionTool(prepared.id, "keyword_metrics", {
      tasks: [],
    });
    expect(requests).toEqual([
      {
        url: "https://api.dataforseo.test/v3/keywords_data/google_ads/search_volume/live",
        authorization: `Basic ${Buffer.from("user@example.test:dataforseo-password").toString("base64")}`,
      },
    ]);
  });

  test("preserves query-key guidance and injects the credential host-side", async () => {
    const docsUrl = "https://api.nasa.test/docs";
    const baseUrl = "https://api.nasa.test";
    const webSource = createNativeToolSource("native.web", [
      {
        descriptor: {
          name: "fetch_public_url",
          description: "Fetch API documentation.",
          inputSchema: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"],
            additionalProperties: false,
          },
          declaredRisk: {
            effect: "read",
            openWorld: true,
            idempotent: true,
          },
        },
        async execute(input) {
          return {
            content: [
              `NASA API base URL: ${baseUrl}. GET /planetary/apod uses the api_key query parameter.`,
            ],
            structuredContent: {
              url: typeof input.url === "string" ? input.url : docsUrl,
            },
          };
        },
      },
    ]);
    const requests: string[] = [];
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async (input) => {
        requests.push(String(input));
        return Response.json({ title: "Test APOD" });
      },
      undefined,
      [webSource],
    );
    const input = {
      name: "NASA APOD",
      operator: "NASA",
      description: "Read the astronomy picture of the day.",
      docsUrl,
      sourceUrls: [docsUrl],
      baseUrl,
      credential: {
        kind: "api-key" as const,
        query: "api_key",
        placeholder: "NASA API key",
        keyCreationUrl: "https://api.nasa.test/#signUp",
      },
      operations: [
        {
          name: "get_apod",
          description: "Read one astronomy picture of the day.",
          method: "GET" as const,
          path: "/planetary/apod",
          inputSchema: {
            type: "object",
            properties: { date: { type: "string" } },
            additionalProperties: false,
          },
          parameters: [
            {
              input: "date",
              name: "date",
              location: "query" as const,
              required: false,
            },
          ],
          effect: "read" as const,
        },
      ],
      probe: {
        tool: "get_apod",
        input: { date: "2026-08-08" },
        note: "Read one published APOD entry.",
      },
    };

    await expect(
      application.proposeDocumentedApiIntegration({
        ...input,
        sourceUrls: [docsUrl, "https://api-evangelist.test/nasa-apod"],
      }),
    ).resolves.toMatchObject({
      status: "ready",
      proposal: {
        trust: "user-reviewed",
        sources: expect.arrayContaining([
          {
            title: expect.any(String),
            url: "https://api-evangelist.test/nasa-apod",
          },
        ]),
      },
    });

    const outcome = await application.proposeDocumentedApiIntegration(input);
    expect(outcome).toMatchObject({
      status: "ready",
      proposal: {
        manifest: {
          credential: { kind: "api-key", query: "api_key" },
        },
      },
    });
    if (outcome.status !== "ready") throw new Error("Expected API proposal");
    const prepared = await application.prepareIntegrationVariant(
      outcome.proposal.templateId,
      "researched",
      outcome.proposal.manifest,
    );
    await application.connectConnector(prepared.id, {
      apiKey: "secret-nasa-key",
    });

    expect(requests).toEqual([
      "https://api.nasa.test/planetary/apod?date=2026-08-08&api_key=secret-nasa-key",
    ]);
  });

  test("prepares a durable researched manifest without an in-memory lookup", async () => {
    const manifest: ConnectorManifest = {
      id: "durable-research",
      name: "Durable Research",
      blurb: "<b>Verified</b> — survives an application restart.",
      transport: {
        kind: "mcp-remote",
        endpoint: "https://durable.example.test/mcp",
      },
      credential: { kind: "none" },
    };
    const { application, database } = createHarness();

    const connection = await application.prepareIntegrationVariant(
      "research-restored-workflow",
      "researched",
      manifest,
    );

    expect(connection).toMatchObject({
      id: manifest.id,
      status: "not_connected",
      credentialKind: "none",
    });
    expect(
      database.db.select().from(integrationManifests).all()[0]?.manifest,
    ).toEqual(manifest);
  });

  test("resumes setup for a prepared custom connector before it is installed", async () => {
    const manifest: ConnectorManifest = {
      id: "prepared-firebase",
      name: "Firebase",
      blurb: "<b>Firebase</b> — project tools.",
      transport: {
        kind: "mcp-local",
        package: {
          registry: "npm",
          name: "firebase-tools",
          version: "15.25.1",
        },
      },
      credential: {
        kind: "api-key",
        env: "FIREBASE_TOKEN",
        placeholder: "Paste your Firebase token",
      },
    };
    const { application } = createHarness();

    await application.prepareIntegrationVariant(
      "research-prepared-firebase",
      "researched",
      manifest,
    );

    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === manifest.id,
      ),
    ).toMatchObject({
      custom: true,
      installed: false,
      removable: false,
      status: "not_connected",
      availableIn: ["local"],
    });
    await expect(
      application.proposeConnectionAction(manifest.id, "reconnect"),
    ).resolves.toMatchObject({
      status: "ready",
      proposal: {
        connectionId: manifest.id,
        action: "reconnect",
        expectedStatus: "not_connected",
        credentialKind: "api-key",
        removable: false,
      },
    });
  });

  test("renders persisted and registry manifests and resolves OpenAPI by transport", async () => {
    const manifest: ConnectorManifest = {
      id: "inventory",
      name: "Inventory",
      blurb: "<b>Stock</b> — inspect current inventory.",
      logoUrl:
        "https://raw.githubusercontent.com/example/inventory/main/icon.png",
      logoSource: "github-repository",
      transport: {
        kind: "openapi",
        specUrl: "https://inventory.example/openapi.json",
        baseUrl: "https://inventory.example/v1",
      },
      credential: { kind: "none" },
      probe: { tool: "listItems", input: {} },
      tools: { allow: ["listItems"] },
    };
    if (manifest.transport.kind !== "openapi") {
      throw new Error("Expected an OpenAPI manifest");
    }
    const specUrl = manifest.transport.specUrl;
    const requests: string[] = [];
    const request: FetchApi = async (input) => {
      const url = String(input);
      requests.push(url);
      if (url === specUrl) {
        return Response.json({
          openapi: "3.1.0",
          info: { title: "Inventory", version: "1" },
          paths: {
            "/items": {
              get: {
                operationId: "listItems",
                summary: "List inventory items",
                responses: {
                  "200": {
                    description: "Items",
                    content: {
                      "application/json": {
                        schema: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
          },
        });
      }
      return Response.json({ items: [{ id: "widget-1" }] });
    };
    const { application, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
    );
    database.db
      .insert(integrationManifests)
      .values({
        id: manifest.id,
        manifest,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(connectionTable)
      .values({
        id: "inventory-default",
        name: manifest.name,
        sourceId: manifest.transport.kind,
        manifestId: manifest.id,
        credentialRef: "none",
        config: { toolCount: 1 },
        availableIn: ["local", "hosted"],
        createdAt: now,
        updatedAt: now,
      })
      .run();

    expect(await application.listConnections()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "neon", status: "not_connected" }),
        expect.objectContaining({
          id: "inventory-default",
          name: "Inventory",
          description: "Stock — inspect current inventory.",
          logoUrl:
            "https://raw.githubusercontent.com/example/inventory/main/icon.png",
          logoSource: "github-repository",
          endpoint: "https://inventory.example/v1",
          status: "not_connected",
          connectionIssue: "verification_required",
          toolCount: 1,
        }),
      ]),
    );

    const source = application.getToolSource("openapi");
    expect(source?.id).toBe("openapi");
    const session = await source?.open({
      connection: {
        id: "inventory-default",
        sourceId: "openapi",
        manifestId: manifest.id,
        credentialRef: "none",
        availableIn: ["local", "hosted"],
      },
      location: "local",
    });
    expect(await session?.listTools()).toMatchObject([
      { name: "listItems", declaredRisk: { effect: "read" } },
    ]);
    await expect(
      session?.callTool(
        "listItems",
        {},
        { taskId: "task-inventory", runId: "run-inventory" },
      ),
    ).resolves.toMatchObject({
      structuredContent: { items: [{ id: "widget-1" }] },
    });
    expect(requests).toEqual([
      "https://inventory.example/openapi.json",
      "https://inventory.example/v1/items",
    ]);
    await session?.close();
  });

  test("requires a read test and saves credentials only after the real API request succeeds", async () => {
    let responseStatus = 405;
    const requests: string[] = [];
    const { application, credentials, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async (input) => {
        requests.push(String(input));
        return Response.json(
          responseStatus === 200
            ? { data: [] }
            : { error: "GET method not allowed; test-secret" },
          { status: responseStatus },
        );
      },
    );
    const manifest: ConnectorManifest = {
      id: "test-api",
      name: "Test API",
      blurb: "Read websites",
      transport: {
        kind: "http-api",
        baseUrl: "https://api.example.test/v1",
        operations: [
          {
            name: "list_websites",
            description: "List one website",
            method: "GET",
            path: "/websites",
            effect: "read",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        ],
      },
      credential: { kind: "api-key", placeholder: "API key" },
    };
    database.db
      .insert(integrationManifests)
      .values({ id: manifest.id, manifest, createdAt: now, updatedAt: now })
      .run();
    await expect(
      application.connectConnector(manifest.id, { apiKey: "test-secret" }),
    ).rejects.toThrow("no read-only connection test");
    expect(requests).toEqual([]);
    expect(credentials.values.has("connector-test-api-default")).toBe(false);
    expect(
      database.db
        .select()
        .from(connectionTable)
        .all()
        .some((c) => c.manifestId === manifest.id),
    ).toBe(false);

    const tested = { ...manifest, probe: { tool: "list_websites", input: {} } };
    database.db
      .update(integrationManifests)
      .set({ manifest: tested })
      .where(eq(integrationManifests.id, manifest.id))
      .run();
    try {
      await application.connectConnector(manifest.id, {
        apiKey: "test-secret",
      });
      throw new Error("Expected connection test failure");
    } catch (error) {
      expect(error).toMatchObject({
        test: {
          status: "failed",
          kind: "api-read",
          tool: "list_websites",
          method: "GET",
          endpoint: "https://api.example.test/v1/websites",
        },
      });
      expect(String(error)).toContain("405");
      expect(String(error)).not.toContain("test-secret");
    }
    expect(credentials.values.has("connector-test-api-default")).toBe(false);
    expect(
      database.db
        .select()
        .from(connectionTable)
        .all()
        .some((c) => c.manifestId === manifest.id),
    ).toBe(false);
    responseStatus = 200;
    const connected = await application.connectConnector(manifest.id, {
      apiKey: "test-secret",
    });
    expect(connected).toMatchObject({
      status: "connected",
      connectionTest: {
        status: "passed",
        kind: "api-read",
        tool: "list_websites",
        method: "GET",
        endpoint: "https://api.example.test/v1/websites",
      },
    });
    expect(credentials.values.get("connector-test-api-default")).toBe(
      "test-secret",
    );
    expect(requests).toEqual([
      "https://api.example.test/v1/websites",
      "https://api.example.test/v1/websites",
    ]);
  });

  test("verifies an OpenAPI credential with an explicitly curated safe operation", async () => {
    const manifest: ConnectorManifest = {
      id: "warehouse",
      name: "Warehouse",
      blurb: "<b>Stock</b> — inspect current inventory.",
      transport: {
        kind: "openapi",
        specUrl: "https://warehouse.example/openapi.json",
        baseUrl: "https://warehouse.example/v1",
      },
      credential: {
        kind: "api-key",
        placeholder: "Your warehouse key",
        keyCreationUrl: "https://warehouse.example/keys",
        header: "x-api-key",
      },
      probe: { tool: "listItems", input: {} },
      tools: { allow: ["listItems"] },
    };
    const calls: { readonly url: string; readonly key?: string }[] = [];
    const request: FetchApi = async (input, init) => {
      const url = String(input);
      const key = new Headers(init?.headers).get("x-api-key") ?? undefined;
      calls.push({ url, ...(key ? { key } : undefined) });
      if (url.endsWith("openapi.json")) {
        return Response.json({
          openapi: "3.1.0",
          info: { title: "Warehouse", version: "1" },
          paths: {
            "/items": {
              get: {
                operationId: "listItems",
                responses: { "200": { description: "Items" } },
              },
            },
          },
        });
      }
      return Response.json({ items: [] });
    };
    const { application, credentials, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
    );
    database.db
      .insert(integrationManifests)
      .values({ id: manifest.id, manifest, createdAt: now, updatedAt: now })
      .run();
    const http = createHttpApp(application);

    const missingKey = await http.request("/api/connectors/warehouse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(missingKey.status).toBe(400);

    const response = await http.request("/api/connectors/warehouse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "warehouse-secret" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "warehouse-default",
      status: "connected",
      toolCount: 1,
      canAddAnother: true,
    });
    expect(calls).toEqual([
      { url: "https://warehouse.example/openapi.json" },
      {
        url: "https://warehouse.example/v1/items",
        key: "warehouse-secret",
      },
    ]);
    expect(credentials.values.get("connector-warehouse-default")).toBe(
      "warehouse-secret",
    );
    const persisted = database.db
      .select()
      .from(connectionTable)
      .all()
      .find((connection) => connection.manifestId === "warehouse");
    expect(JSON.stringify(persisted)).not.toContain("warehouse-secret");
    expect(persisted?.config).toMatchObject({
      discovery: "passed",
      credentialVerification: "passed",
      toolNames: ["listItems"],
    });
    await expect(
      application.proposeConnectionAction("warehouse", "disconnect"),
    ).resolves.toMatchObject({
      status: "ready",
      proposal: {
        connectionName: "Warehouse",
        action: "disconnect",
        expectedStatus: "connected",
        credentialKind: "api-key",
        toolCount: 1,
      },
    });
    await expect(
      application.proposeConnectionAction("warehouse", "reconnect"),
    ).resolves.toMatchObject({
      status: "unavailable",
      title: "Connection already connected",
    });
    expect(
      database.db.select().from(credentialAuditEvents).all(),
    ).toMatchObject([
      {
        connectorId: "warehouse-default",
        credentialKind: "api-key",
        action: "test",
        status: "failed",
      },
      {
        connectorId: "warehouse-default",
        credentialKind: "api-key",
        action: "test",
        status: "succeeded",
        failureCategory: null,
      },
    ]);
    expect(
      JSON.stringify(database.db.select().from(credentialAuditEvents).all()),
    ).not.toContain("warehouse-secret");
    const dependentTask = await application.createTask(
      {
        title: "Warehouse inventory",
        prompt: "Read the current warehouse inventory.",
        schedule: "0 8 * * *",
        scheduleLabel: "Daily at 8:00 AM",
        timezone: "UTC",
        connectionId: "warehouse-default",
        connectionName: "Warehouse",
        toolNames: ["listItems"],
        tools: [
          {
            name: "listItems",
            description: "List warehouse items",
            effect: "read",
            approval: "never",
          },
        ],
        contract: "Read inventory without changing it.",
        executionMode: "local",
        catchUpPolicy: "skip_to_next",
      },
      false,
    );

    const connectionTools = createSpringrollApplicationTools(application);
    const disconnectConnection =
      connectionTools.disconnect_connection as unknown as {
        execute(
          input: { readonly connectionId: string },
          options: {
            readonly toolCallId: string;
            readonly messages: readonly [];
          },
        ): Promise<{
          readonly disconnected: boolean;
          readonly connectionId: string;
        }>;
      };
    const reconnectConnection =
      connectionTools.reconnect_connection as unknown as {
        execute(
          input: { readonly connectionId: string },
          options: {
            readonly toolCallId: string;
            readonly messages: readonly [];
          },
        ): Promise<{
          readonly status: string;
          readonly credentialKind: string;
          readonly path: string;
        }>;
      };
    const removeConnection = connectionTools.remove_connection as unknown as {
      execute(
        input: { readonly connectionId: string },
        options: {
          readonly toolCallId: string;
          readonly messages: readonly [];
        },
      ): Promise<{ readonly removed: boolean; readonly connectionId: string }>;
    };

    await expect(
      disconnectConnection.execute(
        { connectionId: "warehouse" },
        { toolCallId: "disconnect-call", messages: [] },
      ),
    ).resolves.toEqual({ disconnected: true, connectionId: "warehouse" });
    expect(credentials.values.has("connector-warehouse-default")).toBe(false);
    await expect(
      reconnectConnection.execute(
        { connectionId: "warehouse" },
        { toolCallId: "reconnect-call", messages: [] },
      ),
    ).resolves.toMatchObject({
      status: "requires_user_action",
      credentialKind: "api-key",
      path: "/connections/warehouse-default",
    });

    const reconnected = await http.request("/api/connectors/warehouse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "replacement-secret" }),
    });
    expect(await reconnected.json()).toMatchObject({
      id: "warehouse-default",
      status: "connected",
    });
    expect(new SqliteChatStore(database.db).listSessions()).toHaveLength(0);
    await disconnectConnection.execute(
      { connectionId: "warehouse" },
      { toolCallId: "disconnect-again", messages: [] },
    );

    await expect(
      removeConnection.execute(
        { connectionId: "warehouse" },
        { toolCallId: "remove-used", messages: [] },
      ),
    ).rejects.toThrow(
      "Warehouse is used by 1 recipe. Remove it from those recipes before removing the connector.",
    );
    await application.deleteTask(dependentTask.id);
    await expect(
      removeConnection.execute(
        { connectionId: "warehouse" },
        { toolCallId: "remove-call", messages: [] },
      ),
    ).resolves.toEqual({ removed: true, connectionId: "warehouse" });
    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === "warehouse",
      ),
    ).toBeUndefined();
    expect(
      database.db
        .select()
        .from(integrationManifests)
        .all()
        .find((row) => row.id === "warehouse"),
    ).toBeUndefined();

    expect(
      database.db
        .select()
        .from(credentialAuditEvents)
        .all()
        .map(({ action, status }) => ({ action, status })),
    ).toEqual([
      { action: "test", status: "failed" },
      { action: "test", status: "succeeded" },
      { action: "revoke", status: "succeeded" },
      { action: "test", status: "succeeded" },
      { action: "revoke", status: "succeeded" },
      { action: "remove", status: "failed" },
      { action: "remove", status: "succeeded" },
    ]);
  });

  test("connects a second API-key account without replacing the first", async () => {
    const manifest: ConnectorManifest = {
      id: "warehouse",
      name: "Warehouse",
      blurb: "<b>Stock</b> — inspect current inventory.",
      transport: {
        kind: "openapi",
        specUrl: "https://warehouse.example/openapi.json",
        baseUrl: "https://warehouse.example/v1",
      },
      credential: {
        kind: "api-key",
        placeholder: "Your warehouse key",
        header: "x-api-key",
      },
      probe: { tool: "listItems", input: {} },
      tools: { allow: ["listItems"] },
    };
    const request: FetchApi = async (input) => {
      const url = String(input);
      if (url.endsWith("openapi.json")) {
        return Response.json({
          openapi: "3.1.0",
          info: { title: "Warehouse", version: "1" },
          paths: {
            "/items": {
              get: {
                operationId: "listItems",
                responses: { "200": { description: "Items" } },
              },
            },
          },
        });
      }
      return Response.json({ items: [] });
    };
    const { application, credentials, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
    );
    database.db
      .insert(integrationManifests)
      .values({ id: manifest.id, manifest, createdAt: now, updatedAt: now })
      .run();
    const http = createHttpApp(application);

    const first = await http.request("/api/connectors/warehouse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "warehouse-secret-1" }),
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      readonly id: string;
      readonly canAddAnother?: boolean;
    };
    expect(firstBody).toMatchObject({
      id: "warehouse-default",
      canAddAnother: true,
    });

    const second = await http.request("/api/connectors/warehouse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "warehouse-secret-2" }),
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { readonly id: string };
    expect(secondBody.id).toStartWith("warehouse-");
    expect(secondBody.id).not.toBe("warehouse-default");

    const accounts = (await application.listConnections()).filter(
      (connection) => connection.manifestId === "warehouse",
    );
    expect(accounts).toHaveLength(2);
    expect(accounts.every((connection) => connection.canAddAnother)).toBe(true);
    expect(credentials.values.get("connector-warehouse-default")).toBe(
      "warehouse-secret-1",
    );
    expect(credentials.values.get(`connector-${secondBody.id}`)).toBe(
      "warehouse-secret-2",
    );
  });

  test("researches and durably connects an official OpenAPI API through chat", async () => {
    const specUrl = "https://assessorsearch.com/property-data-api/openapi.json";
    const apiCalls: { readonly url: string; readonly key?: string }[] = [];
    const spec = {
      openapi: "3.1.0",
      info: { title: "AssessorSearch Property Data API", version: "1.0.0" },
      servers: [{ url: "https://api.assessorsearch.com" }],
      security: [{ ApiKeyAuth: [] }],
      components: {
        securitySchemes: {
          ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
        },
      },
      paths: {
        "/v1/properties": {
          get: {
            operationId: "lookup_property_v1_properties_get",
            summary: "Look up a property",
            parameters: [
              {
                name: "address",
                in: "query",
                required: false,
                schema: { type: "string" },
              },
            ],
            responses: { "200": { description: "Lookup result" } },
          },
        },
      },
    };
    const request: FetchApi = async (input, init) => {
      const url = String(input);
      if (url === specUrl) return Response.json(spec);
      apiCalls.push({
        url,
        ...(new Headers(init?.headers).get("X-API-Key")
          ? { key: new Headers(init?.headers).get("X-API-Key") as string }
          : {}),
      });
      return Response.json({ status: "no_match" });
    };
    const assessorAgent: AgentRunner = {
      async run(runRequest) {
        expect(
          runRequest.tools
            .map((tool) => tool.descriptor.name)
            .filter(
              (name) =>
                name !== inspectRecipeHistoryToolName &&
                name !== updateTaskNotesToolName,
            ),
        ).toEqual(["lookup_property_v1_properties_get"]);
        await runRequest.tools[0]?.execute(
          { address: "4038 SW Majestic Ave, Redmond, Oregon 97756" },
          { taskId: runRequest.task.id, runId: runRequest.runId },
        );
        return {
          result: createMarkdownRunResult({
            body: "AssessorSearch property lookup completed.",
            fallbackSummary: "Property lookup completed.",
          }),
          toolCalls: [],
          usage: {
            provider: "openrouter",
            modelId: "test-model",
            billing: "metered",
            inputTokens: 10,
            outputTokens: 5,
            cachedInputTokens: 0,
            reasoningTokens: 0,
            totalTokens: 15,
            costUsdMicros: 10,
          },
          startedAt: now,
          finishedAt: new Date(now.getTime() + 100),
        };
      },
    };
    const { application, credentials, database } = createHarness(
      resolveModelExecution,
      assessorAgent,
      () => now,
      request,
    );
    expect(
      await application.discoverOpenApi(
        "https://assessorsearch.com/property-data-api",
      ),
    ).toMatchObject({
      status: "found",
      title: "AssessorSearch Property Data API",
      specUrl,
      baseUrl: "https://api.assessorsearch.com/",
      credential: { kind: "api-key", header: "X-API-Key" },
      documentationCandidates: ["https://assessorsearch.com/property-data-api"],
      tools: [{ name: "lookup_property_v1_properties_get", effect: "read" }],
    });
    const outcome = await application.proposeOpenApiIntegration({
      name: "Assessor Search",
      operator: "AssessorSearch",
      description: "Read nationwide public property records.",
      tags: ["property-data"],
      specUrl,
      docsUrl: "https://assessorsearch.com/property-data-api/docs",
      keyCreationUrl: "https://assessorsearch.com/dashboard",
      credentialPlaceholder: "pda_live_…",
      probe: {
        tool: "lookup_property_v1_properties_get",
        input: { address: "Springroll connector verification invalid address" },
        note: "A deliberately non-matching lookup uses zero credits.",
      },
      notes: ["Matched records consume API credits."],
      sources: [
        {
          title: "AssessorSearch API docs",
          url: "https://assessorsearch.com/property-data-api/docs",
        },
        { title: "Official OpenAPI", url: specUrl },
      ],
    });
    expect(outcome).toMatchObject({
      status: "ready",
      proposal: {
        trust: "openapi-verified",
        api: { operationCount: 1 },
        manifest: {
          transport: { kind: "openapi" },
          credential: { kind: "api-key", header: "X-API-Key" },
        },
      },
    });
    if (outcome.status !== "ready") {
      throw new Error("Expected an OpenAPI proposal");
    }

    const chat = new SqliteChatStore(database.db);
    const session = chat.createSession({ id: "chat-openapi-setup" });
    const message = chat.appendMessage({
      id: "openapi-message",
      sessionId: session.id,
      role: "assistant",
      parts: [{ type: "text", text: "Review the official API." }],
    });
    const workflow = chat.recordWorkflow({
      id: "openapi-workflow",
      sessionId: session.id,
      sourceMessageId: message.id,
      sourceToolCallId: "openapi-tool-call",
      kind: "connection_setup",
      payload: JSON.parse(JSON.stringify(outcome)),
    });
    const assistant = new AiSdkAssistant(database.db, {
      loadRuntime: async () => ({
        model: new MockLanguageModelV4(),
        provider: "mock-provider",
        modelId: "mock-model-id",
      }),
    });
    const http = createHttpApp(application, undefined, assistant);
    const workflowPath = `/api/chats/${session.id}/workflows/${workflow.id}`;

    const prepared = await http.request(`${workflowPath}/prepare-connection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variantId: "researched" }),
    });
    expect(prepared.status).toBe(200);
    expect(await prepared.json()).toMatchObject({
      status: "awaiting_api_key",
      connection: {
        id: "assessor-search",
        connectionType: "api",
        credentialKind: "api-key",
      },
    });

    const connected = await http.request(`${workflowPath}/connect-key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "pda_live_test_secret" }),
    });
    expect(connected.status).toBe(200);
    expect(await connected.json()).toMatchObject({
      status: "connected",
      connection: {
        id: "assessor-search-default",
        status: "connected",
        connectionType: "api",
        toolCount: 1,
      },
    });
    expect(credentials.values.get("connector-assessor-search-default")).toBe(
      "pda_live_test_secret",
    );
    expect(JSON.stringify(assistant.getSession(session.id))).not.toContain(
      "pda_live_test_secret",
    );
    expect(
      JSON.stringify(database.db.select().from(connectionTable).all()),
    ).not.toContain("pda_live_test_secret");

    const recipeDraft: Parameters<LocalApplication["proposeTaskDraft"]>[0] = {
      title: "Daily property lookup",
      prompt:
        "Look up property core details for 4038 SW Majestic Ave, Redmond, Oregon 97756 every morning.",
      schedule: "0 8 * * *",
      scheduleLabel: "Daily at 8:00 AM",
      timezone: "America/Los_Angeles",
      connectionId: "assessor-search",
      toolNames: ["lookup_property_v1_properties_get"],
      contract: "Read one property record without changing provider data.",
      catchUpPolicy: "skip_to_next",
    };
    await expect(
      application.proposeTaskDraft({
        ...recipeDraft,
        toolNames: ["invented_property_tool"],
      }),
    ).rejects.toThrow("selected an unavailable tool");
    await expect(
      application.proposeTaskDraft({
        ...recipeDraft,
        schedule: "not a cron expression",
      }),
    ).rejects.toThrow();
    const recipeProposal = readyProposal(
      await application.proposeTaskDraft(recipeDraft),
    );
    expect(recipeProposal).toMatchObject({
      connectionId: "assessor-search-default",
      connectionName: "Assessor Search",
      toolNames: ["lookup_property_v1_properties_get"],
      tools: [
        {
          name: "lookup_property_v1_properties_get",
          effect: "read",
        },
      ],
    });
    const task = await application.createTask(recipeProposal, false);
    const started = await application.runTaskNow(task.id, "openapi-recipe-run");
    expect(await waitForFinishedRun(application, started.id)).toMatchObject({
      status: "succeeded",
    });
    expect(apiCalls).toEqual([
      {
        url: "https://api.assessorsearch.com/v1/properties?address=Springroll+connector+verification+invalid+address",
        key: "pda_live_test_secret",
      },
      {
        url: "https://api.assessorsearch.com/v1/properties?address=4038+SW+Majestic+Ave%2C+Redmond%2C+Oregon+97756",
        key: "pda_live_test_secret",
      },
    ]);
  });

  test("prepares a manual OpenAPI spec by deriving its server and auth", async () => {
    const specUrl = "https://api.example.test/openapi.json";
    const request: FetchApi = async () =>
      Response.json({
        openapi: "3.1.0",
        info: { title: "Example Inventory", version: "1" },
        servers: [{ url: "https://api.example.test/v1" }],
        security: [{ bearerAuth: [] }],
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer" },
          },
        },
        paths: {
          "/items": {
            get: {
              operationId: "listItems",
              responses: { "200": { description: "Items" } },
            },
          },
        },
      });
    const { application } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
    );
    const http = createHttpApp(application);
    const response = await http.request("/api/connectors/custom/openapi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ specUrl }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "Example Inventory",
      connectionType: "api",
      credentialKind: "api-key",
      endpoint: "https://api.example.test/v1",
      custom: true,
      installed: false,
    });
  });

  test("resumes registered-client MCP OAuth after restart with one stable multi-account callback", async () => {
    const manifest: ConnectorManifest = {
      id: "oauth-fixture",
      name: "OAuth Fixture",
      blurb: "<b>Test</b> — exercise standard MCP OAuth.",
      transport: {
        kind: "mcp-remote",
        endpoint: "https://mcp.example.test/mcp",
      },
      credential: {
        kind: "oauth",
        scopes: ["fixture.read", "fixture.profile"],
        accountIdentity: {
          endpoint: "https://auth.example.test/userinfo",
          field: "email",
        },
      },
    };
    let registrationCount = 0;
    const hostedVault = new MemoryHostedCredentialVault();
    const request: FetchApi = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.includes("oauth-protected-resource")) {
        return Response.json({
          resource: "https://mcp.example.test/mcp",
          authorization_servers: ["https://auth.example.test"],
        });
      }
      if (url.pathname.includes("oauth-authorization-server")) {
        return Response.json({
          issuer: "https://auth.example.test",
          authorization_endpoint: "https://auth.example.test/authorize",
          token_endpoint: "https://auth.example.test/token",
          registration_endpoint: "https://auth.example.test/register",
          response_types_supported: ["code"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["client_secret_post"],
          grant_types_supported: ["authorization_code", "refresh_token"],
        });
      }
      if (url.pathname === "/register" && init?.method === "POST") {
        registrationCount += 1;
        const registration = JSON.parse(String(init.body)) as {
          readonly redirect_uris: readonly string[];
        };
        return Response.json({
          client_id: "springroll-dynamic-client",
          redirect_uris: registration.redirect_uris,
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          client_name: "Springroll",
        });
      }
      if (url.pathname === "/token" && init?.method === "POST") {
        const body = new URLSearchParams(String(init.body));
        expect(body.get("client_id")).toBe("springroll-static-client");
        expect(body.get("client_secret")).toBe("static-client-secret");
        if (body.get("grant_type") === "authorization_code") {
          expect(body.get("redirect_uri")).toBe(
            "http://localhost/api/connectors/oauth-fixture/oauth/callback",
          );
        }
        return Response.json({
          access_token: "oauth-access-secret",
          refresh_token: "oauth-refresh-secret",
          token_type: "bearer",
        });
      }
      if (url.pathname === "/userinfo") {
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer oauth-access-secret",
        );
        return Response.json({ email: "ada@example.test", sub: "user-1" });
      }
      if (url.pathname === "/mcp" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          readonly id?: string | number;
          readonly method: string;
        };
        if (body.method === "notifications/initialized") {
          return new Response(null, { status: 202 });
        }
        const result =
          body.method === "initialize"
            ? {
                protocolVersion: "2025-11-25",
                capabilities: { tools: {} },
                serverInfo: { name: "oauth-fixture", version: "1" },
              }
            : body.method === "tools/list"
              ? {
                  tools: [
                    {
                      name: "health",
                      description: "Check the connection",
                      inputSchema: { type: "object", properties: {} },
                      annotations: { readOnlyHint: true },
                    },
                  ],
                }
              : body.method === "tools/call"
                ? { content: [{ type: "text", text: "ok" }] }
                : undefined;
        return Response.json({ jsonrpc: "2.0", id: body.id, result });
      }
      throw new Error(`Unexpected OAuth request: ${url}`);
    };
    const { application, credentials, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      request,
      undefined,
      undefined,
      undefined,
      true,
      {
        [manifest.id]: {
          clientId: "springroll-static-client",
          clientSecret: "static-client-secret",
        },
      },
      { accountId: "springroll-user-1", vault: hostedVault },
    );
    database.db
      .insert(integrationManifests)
      .values({ id: manifest.id, manifest, createdAt: now, updatedAt: now })
      .run();
    const http = createHttpApp(application);
    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === manifest.id,
      ),
    ).toMatchObject({ oauthReady: true, status: "not_connected" });
    await credentials.put(
      "connector-oauth-fixture-default",
      "legacy-api-key-value",
    );

    const invalidReturn = await http.request(
      "/api/connectors/oauth-fixture/oauth",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnTo: "https://attacker.example/chat/1" }),
      },
    );
    expect(invalidReturn.status).toBe(400);

    const inboxWithoutId = await http.request(
      "/api/connectors/oauth-fixture/oauth",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnTo: "/inbox" }),
      },
    );
    expect(inboxWithoutId.status).toBe(400);

    const returnTo = "/chat/chat-oauth?connector=oauth-fixture";
    const started = await http.request("/api/connectors/oauth-fixture/oauth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnTo }),
    });
    if (!started.ok) {
      throw new Error(await started.text());
    }
    expect(started.status).toBe(200);
    let startedBody = (await started.json()) as {
      readonly status: string;
      readonly authorizationUrl: string;
    };
    expect(startedBody.status).toBe("redirect");
    // A repeated provider-level start must reuse the unfinished account, not
    // create another disconnected card. Concurrent requests share one flow.
    const retries = await Promise.all(
      [0, 1].map(() =>
        http.request("/api/connectors/oauth-fixture/oauth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ returnTo }),
        }),
      ),
    );
    const retryBodies = await Promise.all(
      retries.map((response) => response.json()),
    );
    expect(retryBodies[0]).toEqual(retryBodies[1]);
    startedBody = retryBodies[0];
    const pendingAccounts = (await application.listConnections()).filter(
      (card) => card.manifestId === manifest.id,
    );
    expect(pendingAccounts).toHaveLength(1);
    expect(pendingAccounts[0]).toMatchObject({
      id: "oauth-fixture-default",
      oauthPending: true,
    });
    const authorizationUrl = new URL(startedBody.authorizationUrl);
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      "https://auth.example.test/authorize",
    );
    expect(authorizationUrl.searchParams.get("client_id")).toBe(
      "springroll-static-client",
    );
    expect(authorizationUrl.searchParams.get("code_challenge")).toBeTruthy();
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost/api/connectors/oauth-fixture/oauth/callback",
    );
    expect(authorizationUrl.searchParams.get("scope")).toBe(
      "fixture.read fixture.profile",
    );
    expect(registrationCount).toBe(0);
    expect(
      credentials.values.get("connector-oauth-fixture-default"),
    ).not.toContain("static-client-secret");

    const restartedModels = new OpenRouterModelConnection(credentials, {
      fetch: async () => Response.json({ data: { label: "test-key" } }),
    });
    const restartedApplication = new LocalApplication(database.db, {
      credentials,
      models: restartedModels,
      agent,
      resolveModelExecution,
      openApiResearcher: new VerifiedOpenApiResearcher({ fetch: request }),
      now: () => now,
      fetch: request,
      connectorOAuthClients: {
        [manifest.id]: {
          clientId: "springroll-static-client",
          clientSecret: "static-client-secret",
        },
      },
      hostedCredentials: {
        accountId: "springroll-user-1",
        vault: hostedVault,
      },
    });
    restartedApplication.ensureBuiltinConnections();
    const restartedHttp = createHttpApp(restartedApplication);

    const callback = await restartedHttp.request(
      "http://127.0.0.1/api/connectors/oauth-fixture/oauth/callback?code=test-code&state=wrong-state",
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toContain(
      "/chat/chat-oauth?connector=oauth-fixture-default&oauthError=",
    );
    expect(
      database.db
        .select()
        .from(connectionTable)
        .all()
        .some((connection) => connection.manifestId === manifest.id),
    ).toBe(true);

    const validState = authorizationUrl.searchParams.get("state");
    expect(validState).toBeTruthy();
    const completed = await restartedHttp.request(
      `http://127.0.0.1/api/connectors/oauth-fixture/oauth/callback?code=test-code&state=${encodeURIComponent(validState ?? "")}`,
    );
    expect(completed.status).toBe(302);
    expect(completed.headers.get("location")).toBe(
      "/chat/chat-oauth?connector=oauth-fixture-default&oauth=connected",
    );
    expect(registrationCount).toBe(0);
    expect(
      (await restartedApplication.listConnections()).find(
        (connection) => connection.id === `${manifest.id}-default`,
      ),
    ).toMatchObject({
      status: "connected",
      toolCount: 1,
      accountLabel: "ada@example.test",
      name: "OAuth Fixture · ada@example.test",
    });
    const persisted = database.db
      .select()
      .from(connectionTable)
      .all()
      .find((connection) => connection.manifestId === manifest.id);
    expect(persisted?.config).toMatchObject({
      discovery: "passed",
      toolNames: ["health"],
    });
    expect(JSON.stringify(persisted)).not.toContain("oauth-access-secret");
    expect(credentials.values.get("connector-oauth-fixture-default")).toContain(
      "oauth-access-secret",
    );
    const oauthAudit = database.db
      .select()
      .from(credentialAuditEvents)
      .all()
      .filter((event) => event.connectorId === `${manifest.id}-default`);
    expect(
      oauthAudit.map(({ action, status }) => ({ action, status })),
    ).toEqual([
      { action: "oauth_start", status: "succeeded" },
      { action: "oauth_start", status: "succeeded" },
      { action: "oauth_complete", status: "failed" },
      { action: "oauth_complete", status: "succeeded" },
    ]);
    expect(JSON.stringify(oauthAudit)).not.toContain("oauth-access-secret");

    const secondStarted = await restartedHttp.request(
      "/api/connectors/oauth-fixture/oauth",
      { method: "POST", headers: { "content-type": "application/json" } },
    );
    expect(secondStarted.status).toBe(200);
    const secondStartedBody = (await secondStarted.json()) as {
      readonly status: "redirect";
      readonly authorizationUrl: string;
      readonly connectionId: string;
    };
    expect(secondStartedBody.connectionId).toStartWith("oauth-fixture-");
    expect(secondStartedBody.connectionId).not.toBe("oauth-fixture-default");
    const secondAuthorizationUrl = new URL(secondStartedBody.authorizationUrl);
    expect(secondAuthorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost/api/connectors/oauth-fixture/oauth/callback",
    );
    const secondState = secondAuthorizationUrl.searchParams.get("state");
    expect(secondState).toBeTruthy();
    const desktopSuccessPaths: string[] = [];
    const desktopSuccessHttp = createHttpApp(
      restartedApplication,
      undefined,
      undefined,
      undefined,
      (path) => desktopSuccessPaths.push(path),
    );
    const secondCompleted = await desktopSuccessHttp.request(
      `/api/connectors/oauth-fixture/oauth/callback?code=second-code&state=${encodeURIComponent(secondState ?? "")}`,
    );
    expect(secondCompleted.status).toBe(200);
    expect(await secondCompleted.text()).toContain("You're connected");
    expect(desktopSuccessPaths).toEqual(["/integrations?oauth=connected"]);
    expect(registrationCount).toBe(0);

    const desktopResults: string[] = [];
    const desktopHttp = createHttpApp(
      restartedApplication,
      undefined,
      undefined,
      undefined,
      (path) => desktopResults.push(path),
    );
    const desktopCallback = await desktopHttp.request(
      "/api/connectors/unknown-provider/oauth/callback?code=do-not-display&state=secret-state",
    );
    expect(desktopCallback.status).toBe(200);
    expect(desktopCallback.headers.get("location")).toBeNull();
    expect(desktopCallback.headers.get("cache-control")).toBe("no-store");
    const desktopHtml = await desktopCallback.text();
    expect(desktopHtml).toContain("Return to Springroll");
    expect(desktopHtml).not.toContain("do-not-display");
    expect(desktopHtml).not.toContain("secret-state");
    expect(desktopResults[0]).toStartWith("/integrations?oauthError=");

    const twoAccounts = (await restartedApplication.listConnections()).filter(
      (connection) => connection.manifestId === manifest.id,
    );
    expect(twoAccounts).toHaveLength(2);
    expect(twoAccounts.every((connection) => connection.canAddAnother)).toBe(
      true,
    );
    expect(
      twoAccounts.every(
        (connection) =>
          connection.availableIn?.join(",") === "local" &&
          connection.hostedEligible === true &&
          connection.hostedCredentialEscrowed === false &&
          connection.hostedCredentialEscrowAvailable === true,
      ),
    ).toBe(true);
    expect(hostedVault.values.size).toBe(0);
    expect(
      new Set(
        database.db
          .select()
          .from(connectionTable)
          .all()
          .filter((connection) => connection.manifestId === manifest.id)
          .map((connection) => connection.credentialRef),
      ).size,
    ).toBe(2);

    const abandoned = await restartedApplication.startConnectorOAuth(
      manifest.id,
      () => "http://localhost/api/connectors/oauth-fixture/oauth/callback",
    );
    expect(abandoned.status).toBe("redirect");
    if (abandoned.status !== "redirect")
      throw new Error("Expected pending OAuth");
    await restartedApplication.removeConnector(abandoned.connectionId);
    expect(
      (await restartedApplication.listConnections()).filter(
        (card) => card.manifestId === manifest.id,
      ),
    ).toHaveLength(2);

    const firstAccountTask = await restartedApplication.createTask(
      readyProposal(
        await directTaskProposal(
          restartedApplication,
          "Check my first OAuth account",
          {
            title: "First account check",
            connectionId: "oauth-fixture-default",
            toolNames: ["health"],
            contract: "Read the first account connection status.",
          },
        ),
      ),
      false,
    );
    expect(firstAccountTask).toMatchObject({
      availableIn: ["local"],
      hostedBlockedBy: ["OAuth Fixture · ada@example.test"],
    });

    const firstHosted = await restartedHttp.request(
      "/api/connectors/oauth-fixture-default/hosted-credential",
      { method: "POST" },
    );
    expect(firstHosted.status).toBe(200);
    expect(await firstHosted.json()).toMatchObject({
      availableIn: ["local", "hosted"],
      hostedCredentialEscrowed: true,
    });
    expect(
      await restartedApplication.getTask(firstAccountTask.id),
    ).toMatchObject({
      availableIn: ["local", "hosted"],
      hostedBlockedBy: [],
    });
    const secondHosted = await restartedHttp.request(
      `/api/connectors/${secondStartedBody.connectionId}/hosted-credential`,
      { method: "POST" },
    );
    expect(secondHosted.status).toBe(200);
    const credentialRefs = database.db
      .select()
      .from(connectionTable)
      .all()
      .filter((connection) => connection.manifestId === manifest.id)
      .map((connection) => connection.credentialRef);
    expect(hostedVault.values.size).toBe(2);
    expect(
      credentialRefs.every((reference) =>
        hostedVault.values.has(`springroll-user-1:${reference}`),
      ),
    ).toBe(true);

    const secondLocalOnly = await restartedHttp.request(
      `/api/connectors/${secondStartedBody.connectionId}/hosted-credential`,
      { method: "DELETE" },
    );
    expect(secondLocalOnly.status).toBe(200);
    expect(await secondLocalOnly.json()).toMatchObject({
      availableIn: ["local"],
      hostedCredentialEscrowed: false,
    });
    expect(hostedVault.values.size).toBe(1);
    expect(
      hostedVault.values.has(
        "springroll-user-1:connector-oauth-fixture-default",
      ),
    ).toBe(true);

    const renamed = await restartedHttp.request(
      `/api/connectors/${secondStartedBody.connectionId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Work account" }),
      },
    );
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({
      id: secondStartedBody.connectionId,
      manifestId: manifest.id,
      providerName: manifest.name,
      name: "Work account",
    });
    const secondReenabled = await restartedHttp.request(
      `/api/connectors/${secondStartedBody.connectionId}/hosted-credential`,
      { method: "POST" },
    );
    expect(secondReenabled.status).toBe(200);
    expect(hostedVault.values.size).toBe(2);
    const signedOutSecond = await restartedHttp.request(
      `/api/connectors/${secondStartedBody.connectionId}/disconnect`,
      { method: "POST" },
    );
    expect(signedOutSecond.status).toBe(204);
    expect(hostedVault.values.size).toBe(1);
    expect(
      (await restartedApplication.listConnections()).find(
        (connection) => connection.id === "oauth-fixture-default",
      ),
    ).toMatchObject({ status: "connected" });

    await credentials.delete("connector-oauth-fixture-default");
    expect(
      (await restartedApplication.listConnections()).find(
        (connection) => connection.id === `${manifest.id}-default`,
      ),
    ).toMatchObject({
      installed: true,
      status: "not_connected",
      credentialConfigured: false,
      connectionIssue: "credential_missing",
    });
  });

  test("coalesces concurrent manual runs but permits an intentional later rerun", async () => {
    let executions = 0;
    let releaseFirstRun: () => void = () => {};
    let markFirstRunStarted: () => void = () => {};
    const firstRunStarted = new Promise<void>((resolve) => {
      markFirstRunStarted = resolve;
    });
    const firstRunRelease = new Promise<void>((resolve) => {
      releaseFirstRun = resolve;
    });
    const delayedAgent: AgentRunner = {
      async run(request) {
        executions += 1;
        if (executions === 1) {
          markFirstRunStarted();
          await firstRunRelease;
        }
        return agent.run(request);
      },
    };
    let currentTime = now.getTime();
    const { application } = createHarness(
      resolveModelExecution,
      delayedAgent,
      () => new Date(currentTime),
    );
    const proposal = readyProposal(
      await directTaskProposal(
        application,
        "Summarize Hacker News every morning",
      ),
    );
    const task = await application.createTask(proposal, false);
    const http = createHttpApp(application);

    const first = application.runTaskNow(task.id, "manual-run-1");
    await firstRunStarted;
    const firstResult = await first;
    const activeRunDeletion = await http.request(
      `/api/runs/${firstResult.id}`,
      { method: "DELETE" },
    );
    expect(activeRunDeletion.status).toBe(409);
    expect(await activeRunDeletion.json()).toEqual({
      error: "A run cannot be deleted while it is still active",
    });
    const activeTaskDeletion = await http.request(`/api/tasks/${task.id}`, {
      method: "DELETE",
    });
    expect(activeTaskDeletion.status).toBe(409);
    expect(await activeTaskDeletion.json()).toEqual({
      error:
        "Stop this recipe's active runs and linked chats before deleting it",
    });
    const concurrent = application.runTaskNow(task.id, "manual-run-2");
    const concurrentResult = await concurrent;

    expect(concurrentResult.id).toBe(firstResult.id);
    expect(executions).toBe(1);
    expect((await application.snapshot()).runs).toHaveLength(1);
    expect((await application.getRun(firstResult.id))?.status).toBe("running");

    const retried = await application.runTaskNow(task.id, "manual-run-1");
    expect(retried.id).toBe(firstResult.id);
    expect(executions).toBe(1);

    releaseFirstRun();
    await waitForFinishedRun(application, firstResult.id);
    currentTime += 1;
    const intentional = await application.runTaskNow(task.id, "manual-run-3");
    expect(intentional.id).not.toBe(firstResult.id);
    await waitForFinishedRun(application, intentional.id);
    expect(executions).toBe(2);
    expect((await application.snapshot()).runs).toHaveLength(2);
  });

  test("returns the existing occurrence when a manual-run insert conflicts", async () => {
    const { application, database } = createHarness();
    const proposal = readyProposal(
      await directTaskProposal(
        application,
        "Summarize Hacker News every morning",
      ),
    );
    const task = await application.createTask(proposal, false);
    database.db
      .insert(runTable)
      .values({
        id: "existing-manual-occurrence",
        taskId: task.id,
        scheduledTime: now,
        manualRequestId: "original-request",
        status: "succeeded",
        executionLocation: "local",
      })
      .run();

    await expect(
      application.runTaskNow(task.id, "conflicting-request"),
    ).resolves.toEqual({ id: "existing-manual-occurrence" });
    expect((await application.snapshot()).runs).toHaveLength(1);
  });

  test("does not expose the retired manual recipe composer endpoint", async () => {
    const { application } = createHarness();
    const http = createHttpApp(application);

    const response = await http.request("/api/tasks/propose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sentence: "x", timezone: "UTC" }),
    });

    expect(response.status).toBe(404);
  });

  test("does not cache local browser assets across rebuilds", async () => {
    const { application } = createHarness();
    const http = createHttpApp(application, {
      indexHtml: "<!doctype html><title>Springroll</title>",
      async read(path) {
        return path === "main.js"
          ? new Response("export const version = 1", {
              headers: { "content-type": "text/javascript" },
            })
          : undefined;
      },
    });

    const asset = await http.request("/assets/main.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("no-store");
    expect(await asset.text()).toBe("export const version = 1");
    const page = await http.request("/runs/example");
    expect(page.headers.get("cache-control")).toBe("no-store");
  });

  test("preflights execution before creating a manual run", async () => {
    let resolutions = 0;
    const { application } = createHarness(async (selection, capabilities) => {
      resolutions += 1;
      if (resolutions > 1) {
        throw new Error("The selected model is no longer connected");
      }
      return resolveModelExecution(selection, capabilities);
    });
    const proposal = readyProposal(
      await directTaskProposal(
        application,
        "Summarize Hacker News every morning",
      ),
    );
    const task = await application.createTask(proposal, false);

    await expect(application.runTaskNow(task.id)).rejects.toThrow(
      "The selected model is no longer connected",
    );
    expect((await application.snapshot()).runs).toHaveLength(0);
  });

  test("preflights an image recipe against connected image models", async () => {
    const imageSource = createNativeToolSource(imageGenerationSourceId, [
      {
        descriptor: {
          name: "generate_image",
          description: "Generate an image.",
          inputSchema: imageGenerationToolInputSchema,
          declaredRisk: {
            effect: "write",
            openWorld: true,
            idempotent: false,
          },
        },
        async execute() {
          return { content: [] };
        },
      },
    ]);
    const { application, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async () => Response.json({ data: { label: "test-key" } }),
      undefined,
      [imageSource],
    );
    const proposal = readyProposal(
      await directTaskProposal(application, "Generate a dog image", {
        connectionId: imageGenerationConnectionId,
        toolNames: ["generate_image"],
        contract: "Generate and save one image.",
      }),
    );
    const task = await application.createTask(proposal, false);

    await expect(application.runTaskNow(task.id)).rejects.toThrow(
      "Connect OpenRouter, OpenAI, or xAI",
    );
    expect((await application.snapshot()).runs).toHaveLength(0);

    await application.connectModelProvider("openrouter", "sk-or-v1-test");
    await expect(application.getTaskExecution(task.id)).resolves.toBeDefined();
    await expect(
      application.updateTask(task.id, {
        imageModelSelection: {
          providerId: "openrouter",
          modelId: "test/model",
        },
      }),
    ).rejects.toThrow("Choose an image model");
    await expect(
      application.updateTask(task.id, {
        imageModelSelection: {
          providerId: "openrouter",
          modelId: "google/gemini-image-test",
        },
      }),
    ).resolves.toMatchObject({
      imageModelOverride: {
        providerId: "openrouter",
        modelId: "google/gemini-image-test",
      },
    });
    await expect(application.getTaskExecution(task.id)).resolves.toBeDefined();

    database.db
      .update(taskToolTable)
      .set({
        inputSchemaHash:
          "9ef2f0ab66c282c40634c38d8bff8360d285cc7ae10b652063a4ef99606bb7e2",
      })
      .where(eq(taskToolTable.name, "generate_image"))
      .run();
    await expect(application.getTaskExecution(task.id)).rejects.toThrow(
      "schema changed",
    );
    expect(await application.migrateBuiltInToolPins()).toBe(1);
    expect(
      database.db
        .select({ inputSchemaHash: taskToolTable.inputSchemaHash })
        .from(taskToolTable)
        .where(eq(taskToolTable.name, "generate_image"))
        .get()?.inputSchemaHash,
    ).toBe("5f910c49cfdf3010b107251854cea896073c5bbc805f6022f360cb3f38abc16e");
    await expect(application.getTaskExecution(task.id)).resolves.toBeDefined();
  });

  test("migrates only the explicitly compatible built-in web pin revision", async () => {
    const { application, database } = createHarness();
    const task = await application.createTask(
      readyProposal(
        await directTaskProposal(application, "Check current weather", {
          title: "Current weather",
          connectionId: webConnectionId,
          toolNames: ["search_web", "fetch_public_url"],
          contract: "Search public sources without changing anything.",
        }),
      ),
      false,
    );
    const oldSearchHash =
      "520ff7effaa3435169b145f48457c13280fc8a1e407dd64267bada1b54deb2bf";
    const oldFetchHash =
      "7162fba9f4d27e1cabd8a0a0fd80ffbafdd51a679f8994de33ecf6a12c394e78";
    database.db
      .update(taskToolTable)
      .set({ inputSchemaHash: oldSearchHash })
      .where(eq(taskToolTable.name, "search_web"))
      .run();
    database.db
      .update(taskToolTable)
      .set({ inputSchemaHash: oldFetchHash })
      .where(eq(taskToolTable.name, "fetch_public_url"))
      .run();

    expect(await application.migrateBuiltInToolPins()).toBe(2);
    const migratedPins = database.db
      .select()
      .from(taskToolTable)
      .all()
      .filter((pin) => pin.taskId === task.id);
    expect(
      migratedPins.find((pin) => pin.name === "search_web")?.inputSchemaHash,
    ).toBe("a3dfac69fa40055505dbf2dead554fff4bef28aa078941f2de47ce2f76530151");
    expect(
      migratedPins.find((pin) => pin.name === "fetch_public_url")
        ?.inputSchemaHash,
    ).toBe("a7c94e5183f9bdc8712e6f738c5c436de4d15b31df4fbb43a2d21a40d14b1b27");
    expect(await application.migrateBuiltInToolPins()).toBe(0);
    database.db
      .update(taskToolTable)
      .set({ inputSchemaHash: oldSearchHash, riskEffect: "write" })
      .where(eq(taskToolTable.name, "search_web"))
      .run();
    expect(await application.migrateBuiltInToolPins()).toBe(0);
    database.db
      .update(taskToolTable)
      .set({
        inputSchemaHash:
          "a3dfac69fa40055505dbf2dead554fff4bef28aa078941f2de47ce2f76530151",
        riskEffect: "read",
      })
      .where(eq(taskToolTable.name, "search_web"))
      .run();
    await expect(application.getTaskExecution(task.id)).resolves.toBeDefined();
  });

  test("excludes recipes with local-only integrations from hosted runs", async () => {
    const localSource = createNativeToolSource("native.clarity-fixture", [
      {
        descriptor: {
          name: "list_projects",
          description: "List Clarity projects",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          declaredRisk: { effect: "read", openWorld: false, idempotent: true },
        },
        async execute() {
          return { content: [] };
        },
      },
    ]);
    const hostableSource = createNativeToolSource("native.inventory-fixture", [
      {
        descriptor: {
          name: "list_items",
          description: "List inventory items",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          declaredRisk: { effect: "read", openWorld: false, idempotent: true },
        },
        async execute() {
          return { content: [] };
        },
      },
    ]);
    const { application, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async () => Response.json({ results: [] }),
      undefined,
      [localSource, hostableSource],
    );
    database.db
      .insert(connectionTable)
      .values([
        {
          id: "clarity-fixture",
          name: "Microsoft Clarity",
          sourceId: localSource.id,
          credentialRef: "none",
          config: {},
          availableIn: ["local"],
        },
        {
          id: "inventory-fixture",
          name: "Inventory",
          sourceId: hostableSource.id,
          credentialRef: "none",
          config: {},
          availableIn: ["local", "hosted"],
        },
      ])
      .run();

    const localOnly = await application.createTask(
      readyProposal(
        await directTaskProposal(application, "Read Clarity analytics", {
          title: "Clarity digest",
          connectionId: "clarity-fixture",
          toolNames: ["list_projects"],
          contract: "Read Clarity analytics.",
        }),
      ),
      false,
    );
    const hostable = await application.createTask(
      readyProposal(
        await directTaskProposal(application, "Read inventory", {
          title: "Inventory check",
          connectionId: "inventory-fixture",
          toolNames: ["list_items"],
          contract: "Read inventory.",
        }),
      ),
      false,
    );

    expect(localOnly).toMatchObject({
      availableIn: ["local"],
      hostedBlockedBy: ["Microsoft Clarity"],
    });
    expect(hostable).toMatchObject({
      availableIn: ["local", "hosted"],
      hostedBlockedBy: [],
    });
    expect(
      database.db
        .select()
        .from(connectionTable)
        .where(eq(connectionTable.id, webConnectionId))
        .get(),
    ).toMatchObject({ availableIn: ["local", "hosted"] });
    expect(
      (await application.listConnections()).find(
        (connection) => connection.id === "web-search",
      ),
    ).toMatchObject({ availableIn: ["local", "hosted"] });
  });

  test("repairs live external tool drift directly from the current contract", async () => {
    let descriptor: ToolDescriptor = {
      name: "read_fixture",
      description: "Read fixture records",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
      declaredRisk: {
        effect: "read",
        openWorld: true,
        idempotent: true,
      },
    };
    const source: ToolSource = {
      id: "mcp-remote",
      kind: "native",
      async open() {
        return {
          async listTools() {
            return [descriptor];
          },
          async callTool() {
            return { content: [] };
          },
          async close() {},
        };
      },
    };
    const { application, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async () => Response.json({ results: [] }),
      undefined,
      [source],
    );
    database.db
      .insert(connectionTable)
      .values({
        id: "drifting-fixture",
        name: "Drifting fixture",
        sourceId: source.id,
        credentialRef: "none",
        config: {},
        availableIn: ["local"],
      })
      .run();
    const task = await application.createTask(
      readyProposal(
        await directTaskProposal(application, "Read fixture records", {
          title: "Fixture reader",
          connectionId: "drifting-fixture",
          toolNames: ["read_fixture"],
          contract: "Read fixture records.",
        }),
      ),
      false,
    );
    const originalHash = database.db
      .select({ inputSchemaHash: taskToolTable.inputSchemaHash })
      .from(taskToolTable)
      .where(eq(taskToolTable.taskId, task.id))
      .get()?.inputSchemaHash;
    descriptor = {
      ...descriptor,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer", minimum: 1 },
        },
        required: ["query"],
      },
    };

    await expect(application.getTaskExecution(task.id)).resolves.toBeDefined();
    const refreshedHash = database.db
      .select({ inputSchemaHash: taskToolTable.inputSchemaHash })
      .from(taskToolTable)
      .where(eq(taskToolTable.taskId, task.id))
      .get()?.inputSchemaHash;
    expect(refreshedHash).toBeDefined();
    expect(refreshedHash).not.toBe(originalHash);

    descriptor = {
      ...descriptor,
      inputSchema: {
        ...descriptor.inputSchema,
        properties: {
          ...(descriptor.inputSchema.properties as Record<string, unknown>),
          timeoutMs: { type: "integer", minimum: 1 },
        },
      },
      declaredRisk: {
        effect: "write",
        openWorld: true,
        idempotent: false,
      },
    };

    await expect(application.getTaskExecution(task.id)).rejects.toThrow(
      "Recipe tool review required: Drifting fixture's read_fixture access changed from read to write.",
    );
    const repairResponse = await createHttpApp(application).request(
      `/api/tasks/${task.id}/tool-repair`,
    );
    expect(repairResponse.status).toBe(200);
    const outcome =
      (await repairResponse.json()) as TaskToolRepairProposalOutcomeDto;
    expect(outcome).toMatchObject({
      status: "ready",
      proposal: {
        taskId: task.id,
        changes: [
          {
            sourceId: source.id,
            toolName: "read_fixture",
            previousRisk: { effect: "read" },
            proposedRisk: { effect: "write" },
          },
        ],
      },
    });
    if (outcome.status !== "ready") {
      throw new Error("Expected a tool repair proposal");
    }

    const repairTaskTools = createSpringrollApplicationTools(application)
      .repair_task_tools as unknown as {
      execute(
        input: { readonly taskId: string },
        options: {
          readonly toolCallId: string;
          readonly messages: readonly [];
        },
      ): Promise<{ readonly id: string; readonly contract: string }>;
    };
    expect(
      await repairTaskTools.execute(
        { taskId: task.id },
        { toolCallId: "repair-call", messages: [] },
      ),
    ).toMatchObject({
      id: task.id,
      contract: "",
    });
    expect(new SqliteChatStore(database.db).listSessions()).toHaveLength(0);
    await expect(application.getTaskExecution(task.id)).resolves.toBeDefined();
    expect(
      database.db
        .select()
        .from(taskToolTable)
        .all()
        .find((pin) => pin.taskId === task.id),
    ).toMatchObject({
      riskEffect: "write",
      riskOpenWorld: true,
      riskIdempotent: false,
      approval: "never",
    });
    await expect(application.runTaskNow(task.id)).resolves.toMatchObject({
      id: expect.any(String),
    });
    await expect(
      application.updateTask(task.id, { enabled: true }),
    ).resolves.toMatchObject({ enabled: true });
    expect(
      (await application.listRuns()).filter((run) => run.taskId === task.id),
    ).toHaveLength(1);
  });

  test("describes connected ToolSources and separates read from mutation calls", async () => {
    const fetch: FetchApi = async (input) => {
      const url = String(input);
      if (url.endsWith("/topstories.json")) return Response.json([123]);
      if (url.endsWith("/item/123.json")) {
        return Response.json({
          id: 123,
          type: "story",
          title: "A careful local agent",
          by: "springroll",
          score: 42,
          time: 1_754_000_000,
        });
      }
      return Response.json({ results: [] });
    };
    let writeCalls = 0;
    const writeSource = createNativeToolSource("native.write-test", [
      {
        descriptor: {
          name: "change_remote_state",
          description: "Change remote state.",
          inputSchema: {
            type: "object",
            properties: {
              visiblePageDuration: {
                type: "object",
                properties: {
                  min: { type: ["number", "null"] },
                  max: { type: ["number", "null"] },
                },
              },
              sessionDuration: {
                $ref: "#/properties/visiblePageDuration",
              },
            },
          },
          declaredRisk: {
            effect: "write",
            openWorld: true,
            idempotent: false,
          },
        },
        async execute() {
          writeCalls += 1;
          return { content: [{ type: "text", text: "changed" }] };
        },
      },
    ]);
    const unavailableSource: ToolSource = {
      id: "native.unavailable-search-test",
      kind: "native",
      async open() {
        throw new Error("provider detail that must stay hidden");
      },
    };
    const { application, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      fetch,
      undefined,
      [writeSource, unavailableSource],
    );
    database.db
      .insert(connectionTable)
      .values({
        id: "write-test",
        name: "Write test",
        sourceId: writeSource.id,
        credentialRef: "none",
        config: {},
        availableIn: ["local"],
      })
      .run();
    database.db
      .insert(connectionTable)
      .values({
        id: "unavailable-search-test",
        name: "Unavailable search test",
        sourceId: unavailableSource.id,
        credentialRef: "none",
        config: {},
        availableIn: ["local"],
      })
      .run();

    const described = await application.describeConnectionTools(
      hackerNewsConnectionId,
    );
    expect(described).toMatchObject({
      connectionId: hackerNewsConnectionId,
      connectionName: "Hacker News",
      tools: [
        {
          name: "get_hacker_news_top_stories",
          risk: { effect: "read", openWorld: true, idempotent: true },
        },
      ],
    });
    expect(JSON.stringify(described)).not.toContain("inputSchema");
    await expect(
      application.describeConnectionTools("write-test", "remote change", 5),
    ).resolves.toMatchObject({
      connectionId: "write-test",
      tools: [{ name: "change_remote_state" }],
    });
    const searched = await application.searchConnectionTools(
      "change remote state",
    );
    expect(searched).toMatchObject({
      query: "change remote state",
      matches: [
        {
          connectionId: "write-test",
          connectionName: "Write test",
          toolName: "change_remote_state",
          effect: "write",
        },
      ],
    });
    expect(searched.searchedConnections).toBeGreaterThanOrEqual(2);
    expect(searched.unavailableConnections).toBe(1);
    expect(searched.unavailableConnectionIds).toEqual([
      "unavailable-search-test",
    ]);
    expect(JSON.stringify(searched)).not.toContain("provider detail");
    const activated = await application.activateConnectionTools("write-test", [
      "change_remote_state",
    ]);
    expect(activated).toMatchObject({
      connectionId: "write-test",
      connectionName: "Write test",
      tools: [
        {
          name: "change_remote_state",
          description: "Change remote state.",
          inputSchema: {
            type: "object",
            properties: {
              sessionDuration: {
                type: "object",
                properties: {
                  min: { type: ["number", "null"] },
                  max: { type: ["number", "null"] },
                },
              },
            },
          },
          risk: { effect: "write", openWorld: true, idempotent: false },
          mode: "allow",
        },
      ],
    });
    expect(JSON.stringify(activated)).toContain("inputSchema");
    expect(JSON.stringify(activated)).not.toContain('"$ref"');
    await expect(
      application.activateConnectionTools("write-test", ["missing_tool"]),
    ).rejects.toThrow("Connection tools are unavailable: missing_tool");
    const result = await application.callReadConnectionTool(
      hackerNewsConnectionId,
      "get_hacker_news_top_stories",
      { limit: 1 },
    );
    expect(result.structuredContent).toMatchObject({
      stories: [{ id: 123, title: "A careful local agent" }],
    });

    await expect(
      application.callReadConnectionTool(
        "write-test",
        "change_remote_state",
        {},
      ),
    ).rejects.toThrow("not read-only");
    expect(writeCalls).toBe(0);
    await expect(
      application.callConnectionTool(
        hackerNewsConnectionId,
        "get_hacker_news_top_stories",
        { limit: 1 },
      ),
    ).rejects.toThrow("read-only connection route");
    await expect(
      application.callConnectionTool("write-test", "change_remote_state", {}),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "changed" }],
    });
    expect(writeCalls).toBe(1);
    await application.updateConnectionToolPolicy("write-test", {
      toolName: "change_remote_state",
      mode: "check_first",
    });
    await expect(
      application.callConnectionTool("write-test", "change_remote_state", {}),
    ).rejects.toThrow("requires approval");
    await expect(
      application.callConnectionTool(
        "write-test",
        "change_remote_state",
        {},
        { approved: true },
      ),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "changed" }],
    });
    expect(writeCalls).toBe(2);

    const writeProposal = await application.proposeTaskDraft({
      title: "Change remote state",
      prompt: "Change the remote state every morning.",
      schedule: "0 8 * * *",
      scheduleLabel: "Daily at 8:00 AM",
      timezone: "UTC",
      connectionId: "write-test",
      toolNames: ["change_remote_state"],
      contract: "Change remote state as scheduled.",
      catchUpPolicy: "skip_to_next",
    });
    expect(writeProposal.proposal.tools).toEqual([
      expect.objectContaining({
        name: "change_remote_state",
        effect: "write",
        approval: "before_call",
      }),
    ]);
    await expect(
      application.createTask(writeProposal.proposal, true),
    ).resolves.toMatchObject({ enabled: true });
    await expect(
      application.createTask(writeProposal.proposal, false),
    ).resolves.toMatchObject({ enabled: false });
  });

  test("searches stored connection catalogs without opening the live source", async () => {
    const quietSource: ToolSource = {
      id: "native.catalog-search-test",
      kind: "native",
      async open() {
        throw new Error("live catalog probe should not run");
      },
    };
    const { application, database } = createHarness(
      resolveModelExecution,
      agent,
      () => now,
      async () => Response.json({ results: [] }),
      undefined,
      [quietSource],
    );
    database.db
      .insert(connectionTable)
      .values({
        id: "catalog-search-test",
        name: "Catalog search",
        sourceId: quietSource.id,
        credentialRef: "none",
        config: {
          discoveredTools: [
            {
              name: "inspect_dashboard",
              description: "Read dashboard metrics",
              effect: "read",
            },
          ],
        },
        availableIn: ["local"],
      })
      .run();

    await expect(
      application.searchConnectionTools("dashboard metrics"),
    ).resolves.toMatchObject({
      matches: [
        {
          connectionId: "catalog-search-test",
          toolName: "inspect_dashboard",
          effect: "read",
        },
      ],
    });
    await expect(
      application.connectionToolNeedsApproval(
        "catalog-search-test",
        "inspect_dashboard",
      ),
    ).resolves.toBe(false);
  });

  test("summarizes approvals, usage, and application state without exposing payloads", async () => {
    const { application, database } = createHarness();
    const secret = "never-show-this-approval-input";
    database.db
      .insert(toolApprovalTable)
      .values({
        id: "approval-summary-1",
        contextKind: "chat",
        contextId: "turn-summary-1",
        toolCallId: "tool-call-summary-1",
        toolName: "create_external_record",
        input: { apiKey: secret, value: "sensitive payload" },
        riskEffect: "write",
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(modelCalls)
      .values([
        {
          id: "usage-chat-1",
          contextKind: "chat",
          contextId: "turn-summary-1",
          sequence: 1,
          status: "succeeded",
          provider: "openrouter",
          modelId: "test/model",
          billing: "metered",
          inputTokens: 100,
          outputTokens: 20,
          reasoningTokens: 5,
          cachedInputTokens: 10,
          totalTokens: 120,
          costUsdMicros: 50,
          actualCostUsdMicros: 50,
          estimatedCostUsdMicros: 45,
          webSearchRequests: 1,
          providerToolCalls: 2,
          startedAt: now,
          finishedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "usage-run-1",
          contextKind: "run",
          contextId: "run-summary-1",
          sequence: 1,
          status: "failed",
          provider: "openrouter",
          modelId: "test/model",
          billing: "metered",
          inputTokens: 40,
          outputTokens: 5,
          totalTokens: 45,
          costUsdMicros: 20,
          estimatedCostUsdMicros: 20,
          webSearchRequests: 0,
          providerToolCalls: 1,
          startedAt: now,
          finishedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    const approvals = await application.listApprovalSummaries("pending", 10);
    expect(approvals).toEqual({
      approvals: [
        {
          id: "approval-summary-1",
          contextKind: "chat",
          contextId: "turn-summary-1",
          toolName: "create_external_record",
          riskEffect: "write",
          status: "pending",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      truncated: false,
    });
    expect(JSON.stringify(approvals)).not.toContain(secret);
    expect(JSON.stringify(approvals)).not.toContain("sensitive payload");

    expect(application.usageSummary()).toEqual({
      calls: {
        total: 2,
        started: 0,
        succeeded: 1,
        failed: 1,
        cancelled: 0,
      },
      tokens: {
        input: 140,
        output: 25,
        reasoning: 5,
        cachedInput: 10,
        total: 165,
      },
      costUsdMicros: { recorded: 70, actual: 50, estimated: 65 },
      webSearchRequests: 1,
      providerToolCalls: 3,
    });
    expect(application.usageSummary("chat")).toMatchObject({
      contextKind: "chat",
      calls: { total: 1, succeeded: 1, failed: 0 },
      tokens: { total: 120 },
      costUsdMicros: { recorded: 50, actual: 50, estimated: 45 },
    });

    expect(await application.applicationState()).toMatchObject({
      tasks: { total: 0, enabled: 0, paused: 0 },
      runs: { total: 0 },
      connections: { total: 1, connected: 0, needsAttention: 1 },
      pendingApprovals: 1,
    });
  });

  test("exposes persisted assistant sessions through the HTTP boundary", async () => {
    const { application, database } = createHarness();
    const model = new MockLanguageModelV4({
      doStream: [
        {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: "describe-call",
                toolName: "describe_connection_tools",
                input: JSON.stringify({
                  connectionId: hackerNewsConnectionId,
                }),
              },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: "tool_calls" },
                usage: {
                  inputTokens: {
                    total: 7,
                    noCache: 7,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  outputTokens: { total: 4, text: 4, reasoning: 0 },
                },
              },
            ],
          }),
        },
        {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "text-1" },
              {
                type: "text-delta",
                id: "text-1",
                delta: "I checked your connections and can guide you.",
              },
              { type: "text-end", id: "text-1" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: {
                  inputTokens: {
                    total: 7,
                    noCache: 7,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  outputTokens: { total: 4, text: 4, reasoning: 0 },
                },
              },
            ],
          }),
        },
      ],
    });
    const assistant = new AiSdkAssistant(database.db, {
      loadRuntime: async () => ({
        model,
        provider: "mock-provider",
        modelId: "mock-model-id",
        tools: createSpringrollApplicationTools(application),
      }),
    });
    const http = createHttpApp(application, undefined, assistant);

    const connectionEntry = {
      context: {
        version: 1,
        intent: "connection.manage",
        origin: "connections",
        subjects: [{ kind: "connection", id: "web-search" }],
        suggestedPrompt: "Help me understand this connection.",
      },
    };
    const entryResponse = await http.request("/api/chats/entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(connectionEntry),
    });
    expect(entryResponse.status).toBe(201);
    const entry = (await entryResponse.json()) as {
      readonly id: string;
      readonly context: unknown;
    };
    expect(entry.context).toEqual(connectionEntry.context);
    expect(entry).not.toHaveProperty("contextKey");
    const resumedResponse = await http.request("/api/chats/entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: { ...connectionEntry.context, origin: "chat" },
      }),
    });
    expect((await resumedResponse.json()).id).toBe(entry.id);
    const contextUpdate = await http.request(`/api/chats/${entry.id}/context`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version: 1,
        intent: "general",
        origin: "chat",
        subjects: [],
      }),
    });
    expect(contextUpdate.status).toBe(200);
    expect(await contextUpdate.json()).toMatchObject({
      id: entry.id,
      context: { intent: "general", subjects: [] },
    });
    const invalidEntry = await http.request("/api/chats/entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: {
          version: 1,
          intent: "run.diagnose",
          origin: "runs",
          subjects: [{ kind: "run", id: "missing-run" }],
        },
      }),
    });
    expect(invalidEntry.status).toBe(400);
    expect(await invalidEntry.json()).toMatchObject({
      error: "Unknown run: missing-run",
    });

    const createdResponse = await http.request("/api/chats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Connect Clarity" }),
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as { id: string };

    const streamResponse = await http.request(
      `/api/chats/${created.id}/messages`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            id: "client-message",
            role: "user",
            parts: [{ type: "text", text: "Connect Microsoft Clarity" }],
          },
        }),
      },
    );
    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get("content-type")).toContain(
      "text/event-stream",
    );
    expect(await streamResponse.text()).toContain(
      "I checked your connections and can guide you.",
    );
    expect(model.doStreamCalls).toHaveLength(2);
    expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain(
      "get_hacker_news_top_stories",
    );

    const detailResponse = await http.request(`/api/chats/${created.id}`);
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject({
      session: {
        id: created.id,
        title: "Connect Clarity",
        activeTurnId: null,
        latestTurnStatus: "completed",
      },
      messages: [{ role: "user" }, { role: "assistant" }],
      turns: [{ status: "completed", error: null }],
      usage: { inputTokens: 14, outputTokens: 8, totalTokens: 22 },
    });
    expect(await (await http.request("/api/chats")).json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          latestTurnStatus: "completed",
        }),
      ]),
    );

    const renameResponse = await http.request(`/api/chats/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Clarity setup" }),
    });
    expect(renameResponse.status).toBe(200);
    expect(await renameResponse.json()).toMatchObject({
      id: created.id,
      title: "Clarity setup",
      status: "active",
    });
    expect(
      (
        await http.request(`/api/chats/${created.id}/cancel`, {
          method: "POST",
        })
      ).status,
    ).toBe(200);
    const archiveResponse = await http.request(`/api/chats/${created.id}`, {
      method: "DELETE",
    });
    expect(archiveResponse.status).toBe(204);
    const restoreResponse = await http.request(`/api/chats/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    expect(restoreResponse.status).toBe(200);
    expect(await restoreResponse.json()).toMatchObject({
      id: created.id,
      status: "active",
    });
    expect(
      (await http.request(`/api/chats/${created.id}`, { method: "DELETE" }))
        .status,
    ).toBe(204);
    expect(
      (
        await http.request(`/api/chats/${created.id}/permanent`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(204);
    expect((await http.request(`/api/chats/${created.id}`)).status).toBe(404);

    const missingResponse = await http.request(
      "/api/chats/not-found/messages",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            id: "missing",
            role: "user",
            parts: [{ type: "text", text: "Hello" }],
          },
        }),
      },
    );
    expect(missingResponse.status).toBe(404);
  });

  test("accepts bounded approval decisions through the chat HTTP boundary", async () => {
    const calls: unknown[] = [];
    const assistant = {
      async respond(sessionId: string, value: unknown) {
        calls.push({ sessionId, value });
        return new Response("approved-stream", {
          headers: { "content-type": "text/event-stream" },
        });
      },
    } as unknown as AssistantApi;
    const http = createHttpApp({} as LocalApplication, undefined, assistant);

    const response = await http.request("/api/chats/chat-1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        approvals: [
          {
            id: "approval-1",
            approved: false,
            reason: "Keep the existing record",
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("approved-stream");
    expect(calls).toEqual([
      {
        sessionId: "chat-1",
        value: {
          approvals: [
            {
              id: "approval-1",
              approved: false,
              reason: "Keep the existing record",
            },
          ],
        },
      },
    ]);
  });

  test("creates paused or enabled recipes directly without workflow rows", async () => {
    const { application, database } = createHarness();
    const createTask = createSpringrollApplicationTools(application)
      .create_task as unknown as {
      execute(
        input: {
          readonly title: string;
          readonly prompt: string;
          readonly schedule: string;
          readonly scheduleLabel: string;
          readonly timezone: string;
          readonly connectionId: string;
          readonly toolNames: readonly string[];
          readonly contract: string;
          readonly catchUpPolicy: "catch_up" | "skip_to_next";
          readonly enabled: boolean;
        },
        options: {
          readonly toolCallId: string;
          readonly messages: readonly [];
        },
      ): Promise<{ readonly id: string; readonly enabled: boolean }>;
    };
    const input = {
      title: "Morning HN digest",
      prompt: "Summarize Hacker News each morning",
      schedule: "0 8 * * *",
      scheduleLabel: "Daily at 8:00 AM",
      timezone: "UTC",
      connectionId: hackerNewsConnectionId,
      toolNames: ["get_hacker_news_top_stories"],
      contract:
        "Read public Hacker News stories and summarize them without changing anything.",
      catchUpPolicy: "skip_to_next" as const,
    };

    const paused = await createTask.execute(
      { ...input, enabled: false },
      { toolCallId: "direct-task-paused", messages: [] },
    );
    const repeated = await createTask.execute(
      { ...input, enabled: false },
      { toolCallId: "direct-task-paused", messages: [] },
    );
    const enabled = await createTask.execute(
      { ...input, title: "Enabled HN digest", enabled: true },
      { toolCallId: "direct-task-enabled", messages: [] },
    );

    expect(paused).toMatchObject({ id: "direct-task-paused", enabled: false });
    expect(repeated).toEqual(paused);
    expect(enabled).toMatchObject({ id: "direct-task-enabled", enabled: true });
    expect(await application.listTasks()).toHaveLength(2);
    expect(new SqliteChatStore(database.db).listSessions()).toHaveLength(0);
  });

  test("updates an existing recipe directly without a workflow", async () => {
    const { application, database } = createHarness();
    const originalProposal = readyProposal(
      await directTaskProposal(application, "Summarize Hacker News daily"),
    );
    const original = await application.createTask(originalProposal, false);
    const updateTask = createSpringrollApplicationTools(application)
      .update_task as unknown as {
      execute(
        input: { readonly taskId: string; readonly prompt: string },
        options: {
          readonly toolCallId: string;
          readonly messages: readonly [];
        },
      ): Promise<{
        readonly id: string;
        readonly prompt: string;
        readonly contract: string;
        readonly enabled: boolean;
      }>;
    };
    const input = {
      taskId: original.id,
      prompt: "Summarize Hacker News daily and use Rapid City, South Dakota.",
    };

    const updated = await updateTask.execute(input, {
      toolCallId: "update-call",
      messages: [],
    });
    const repeated = await updateTask.execute(input, {
      toolCallId: "update-call",
      messages: [],
    });

    expect(updated).toMatchObject({
      id: original.id,
      prompt: input.prompt,
      contract: "",
      enabled: false,
    });
    expect(repeated).toMatchObject({ id: original.id, prompt: input.prompt });
    expect(new SqliteChatStore(database.db).listSessions()).toHaveLength(0);
  });

  test("runs, pauses, and resumes a recipe directly and idempotently", async () => {
    const { application, database } = createHarness();
    const proposal = readyProposal(
      await directTaskProposal(application, "Summarize Hacker News daily"),
    );
    const task = await application.createTask(proposal, true);
    const tools = createSpringrollApplicationTools(application);
    const pauseTask = tools.pause_task as unknown as {
      execute(
        input: { readonly taskId: string },
        options: {
          readonly toolCallId: string;
          readonly messages: readonly [];
        },
      ): Promise<{ readonly id: string; readonly enabled: boolean }>;
    };
    const resumeTask = tools.resume_task as typeof pauseTask;
    const runTaskNow = tools.run_task_now as unknown as {
      execute(
        input: { readonly taskId: string },
        options: {
          readonly toolCallId: string;
          readonly messages: readonly [];
        },
      ): Promise<{ readonly id: string }>;
    };

    expect(
      await pauseTask.execute(
        { taskId: task.id },
        { toolCallId: "pause-call", messages: [] },
      ),
    ).toMatchObject({ id: task.id, enabled: false });
    expect(
      await pauseTask.execute(
        { taskId: task.id },
        { toolCallId: "pause-call", messages: [] },
      ),
    ).toMatchObject({ id: task.id, enabled: false });
    expect(
      await resumeTask.execute(
        { taskId: task.id },
        { toolCallId: "resume-call", messages: [] },
      ),
    ).toMatchObject({ id: task.id, enabled: true });

    const started = await runTaskNow.execute(
      { taskId: task.id },
      { toolCallId: "run-call", messages: [] },
    );
    const repeated = await runTaskNow.execute(
      { taskId: task.id },
      { toolCallId: "run-call", messages: [] },
    );
    expect(repeated).toEqual(started);
    expect(await application.listRuns()).toHaveLength(1);
    expect(new SqliteChatStore(database.db).listSessions()).toHaveLength(0);
  });
});

test("appearance settings persist in the workspace across HTTP origins and independent updates", async () => {
  const { application } = createHarness();
  const http = createHttpApp(application);
  expect(
    await (await http.request("http://127.0.0.1:4117/api/appearance")).json(),
  ).toEqual({ theme: null, textSize: null });
  const patch = (body: unknown) =>
    http.request("http://127.0.0.1:4117/api/appearance", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  expect((await patch({ theme: "springroll-dark-glass" })).status).toBe(200);
  expect((await patch({ textSize: "large" })).status).toBe(200);
  const restartedHttp = createHttpApp(application);
  expect(
    await (
      await restartedHttp.request("http://127.0.0.1:59999/api/appearance")
    ).json(),
  ).toEqual({ theme: "springroll-dark-glass", textSize: "large" });
  expect((await patch({ textSize: "invalid" })).status).toBe(400);
  expect(application.appearance()).toEqual({
    theme: "springroll-dark-glass",
    textSize: "large",
  });
});

test("runtime setup endpoints require explicit local requests and reject unknown providers", async () => {
  const calls: string[] = [];
  const { application } = createModelProviderHarness({
    subscriptionRuntimes: {
      async status(id) {
        calls.push(`status:${id}`);
        return { state: "missing" };
      },
      async install(id) {
        calls.push(`install:${id}`);
        return { state: "downloading" };
      },
      async cancel(id) {
        calls.push(`cancel:${id}`);
        return { state: "missing" };
      },
      close() {},
    },
  });
  const http = createHttpApp(application);
  expect(
    (await http.request("/api/model-providers/codex/runtime")).status,
  ).toBe(200);
  expect(calls).toEqual(["status:codex"]);
  const foreign = await http.request("/api/model-providers/codex/runtime", {
    method: "POST",
    headers: { Origin: "https://untrusted.example" },
  });
  expect(foreign.status).toBe(403);
  expect(calls).toEqual(["status:codex"]);
  const unknown = await http.request("/api/model-providers/arbitrary/runtime", {
    method: "POST",
  });
  expect(unknown.status).toBeGreaterThanOrEqual(400);
  expect(calls).toEqual(["status:codex"]);
  expect(
    (
      await http.request("/api/model-providers/claude/runtime", {
        method: "POST",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await http.request("/api/model-providers/claude/runtime/cancel", {
        method: "POST",
      })
    ).status,
  ).toBe(200);
  expect(calls).toEqual(["status:codex", "install:claude", "cancel:claude"]);
});

test("Gmail discovery surfaces latest-message search and explains unavailable ZDR models without tainting discovery", async () => {
  const { application, database } = createHarness();
  database.db
    .insert(connectionTable)
    .values({
      id: "gmail-default",
      name: "Gmail",
      sourceId: "http-api",
      manifestId: "gmail",
      credentialRef: "test-google",
      availableIn: ["local"],
      config: { grantedPermissionSets: ["read", "send", "drafts"] },
    })
    .run();
  const policy = new GoogleDataProtection(database.db);
  const scope = policy.scope(
    "chat:gmail-discovery",
    "openrouter",
    "qwen/qwen3-8b",
  );
  const inventory = spyOn(
    OpenRouterModelConnection.prototype,
    "zdrModelIds",
  ).mockResolvedValue(["eligible/model"]);
  try {
    for (const query of [
      "gmail",
      "message",
      "messages",
      "list",
      "latest gmail message",
    ]) {
      const result = await withGoogleDataAccess(scope, () =>
        application.searchConnectionTools(query, 5),
      );
      expect(
        result.matches.some((tool) => tool.toolName === "search_threads"),
      ).toBe(true);
      expect(result.googleDataAccess?.message).toContain("ZDR endpoint");
      expect(result.googleDataAccess?.message).toContain(
        "not describe this as a missing email tool",
      );
    }
    const result = await withGoogleDataAccess(scope, () =>
      application.describeConnectionTools("gmail-default", "message", 5),
    );
    expect(result.tools.some((tool) => tool.name === "search_threads")).toBe(
      true,
    );
    expect(result.googleDataAccess?.status).toBe("unavailable");
    const partial = await application.searchConnectionTools("gmail", 1);
    expect(partial.truncated).toBe(true);
    expect(partial.totalMatches).toBeGreaterThan(1);
    inventory.mockResolvedValue(undefined);
    expect(
      (
        await withGoogleDataAccess(scope, () =>
          application.searchConnectionTools("gmail"),
        )
      ).googleDataAccess,
    ).toBeUndefined();
    inventory.mockResolvedValue(["qwen/qwen3-8b"]);
    expect(
      (
        await withGoogleDataAccess(scope, () =>
          application.describeConnectionTools("gmail-default"),
        )
      ).googleDataAccess,
    ).toBeUndefined();
    const gemini = policy.scope(
      "chat:gemini-discovery",
      "google",
      "gemini-3.7-flash",
    );
    expect(
      (
        await withGoogleDataAccess(gemini, () =>
          application.searchConnectionTools("gmail"),
        )
      ).googleDataAccess,
    ).toBeUndefined();
    expect(policy.has("chat:gmail-discovery")).toBe(false);
    expect(scope.protected).toBe(false);
    expect(
      (
        await withGoogleDataAccess(scope, () =>
          application.searchConnectionTools("hacker news"),
        )
      ).googleDataAccess,
    ).toBeUndefined();
  } finally {
    inventory.mockRestore();
  }
});
