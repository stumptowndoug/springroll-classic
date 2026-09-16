import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExecutableTool } from "@springroll/kernel";
import {
  type AgentRunner,
  AiSdkAgentRunner,
  AiSdkAssistant,
  AiSdkImageGenerationService,
  ClaudeAgentRunner,
  ClaudeSubscriptionConnection,
  CodexAgentRunner,
  CodexAppServerClient,
  CodexSubscriptionConnection,
  connections,
  createCodexAppServerSpawn,
  createImageGenerationToolSource,
  defaultOpenAiModelId,
  defaultOpenRouterModelId,
  defaultXaiModelId,
  FilesystemArtifactBlobStore,
  findImageModelDefinition,
  googleDataRouteAudit,
  type ImageGenerationToolRuntime,
  imageGenerationCardId,
  imageGenerationModelHandle,
  imageGenerationToolDescriptor,
  imageModelSettingId,
  isStandardModelProviderId,
  MacOsKeychainCredentialStore,
  modelSettings,
  OpenAiModelConnection,
  OpenRouterModelConnection,
  openLocalDatabase,
  type ProviderToolCapability,
  requiredProviderToolCapabilities,
  SqliteArtifactRepository,
  StandardModelConnection,
  SubscriptionRuntimeManager,
  standardModelProviderDefinitions,
  subscriptionRuntimeEnvironment,
  ToolPolicyError,
  tasks,
  webFetchProviderToolCapability,
  webResearchSelection,
  webSearchProviderToolCapability,
  XaiModelConnection,
} from "@springroll/kernel";
import type { ToolSet } from "ai";
import { eq } from "drizzle-orm";
import { LocalApplication } from "./server/application.ts";
import {
  connectSpringrollMcpStdio,
  createSpringrollMcpHttpEndpoint,
  type SpringrollMcpHttpEndpoint,
} from "./server/application-mcp.ts";
import { createSpringrollApplicationToolRegistry } from "./server/application-tool-registry.ts";
import {
  createAgentApplicationTools,
  createAgentConnectionTool,
  createAiSdkApplicationTools,
  createAiSdkConnectionTool,
  legacyAssistantConnectorProposalTools,
} from "./server/assistant-tools.ts";
import { connectorOAuthClientsFromEnvironment } from "./server/connector-oauth-clients.ts";
import {
  chatExecutionLimits,
  readRecipeExecutionLimits,
} from "./server/execution-settings.ts";
import {
  currentGoogleDataAccess,
  GoogleDataProtection,
  isGoogleConnection,
  withGoogleDataAccess,
} from "./server/google-data-protection.ts";
import { createHttpApp, type HttpAppAssets } from "./server/http-app.ts";
import { chooseImageModelForCall } from "./server/image-model-selection.ts";
import {
  AiIntegrationResearcher,
  GithubMcpRegistryClient,
  OfficialMcpRegistryClient,
  OfficialNpmRegistryClient,
  VerifiedLocalMcpResearcher,
  VerifiedOpenApiResearcher,
} from "./server/integration-researcher.ts";
import {
  type ModelCatalogSnapshot,
  SpringrollModelCatalog,
} from "./server/model-catalog.ts";
import {
  chooseModelExecution,
  providerToolBindingsForExecution,
} from "./server/model-selection.ts";
import { configureLocalRivetEnvironment } from "./server/rivet-environment.ts";
import { resolveRuntimePaths } from "./server/runtime-paths.ts";
import {
  openAiCredentialRef,
  openRouterCredentialRef,
  xaiCredentialRef,
} from "./server/sources.ts";
import {
  prepareStarterRecipe,
  seedStarterRecipe,
} from "./server/starter-recipe.ts";
import {
  type ModelExecutionDto,
  type ModelOptionDto,
  type ModelProviderId,
  modelProviderIds,
} from "./shared.ts";

const runtimePaths = resolveRuntimePaths(process.env);
const { databasePath } = runtimePaths;
mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });

const rivetEnvironment = configureLocalRivetEnvironment(
  process.env,
  databasePath,
);

// One-time migration from the pre-rename install: adopt the shrimproll
// database (and its WAL sidecars) under the new name so recipes and run
// history survive the Springroll rename.
const legacyDatabasePath = databasePath.replace(
  /springroll\.sqlite$/,
  "shrimproll.sqlite",
);
if (
  legacyDatabasePath !== databasePath &&
  !existsSync(databasePath) &&
  existsSync(legacyDatabasePath)
) {
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(legacyDatabasePath + suffix)) {
      renameSync(legacyDatabasePath + suffix, databasePath + suffix);
    }
  }
}

prepareStarterRecipe(databasePath);
const localDatabase = openLocalDatabase({
  filename: databasePath,
  migrationsFolder: runtimePaths.migrationsFolder,
});
const credentials = new MacOsKeychainCredentialStore(
  process.env.SPRINGROLL_KEYCHAIN_SERVICE
    ? { service: process.env.SPRINGROLL_KEYCHAIN_SERVICE, legacyService: false }
    : {},
);
const models = new OpenRouterModelConnection(credentials, {
  onGoogleDataRequest: (route) => {
    localDatabase.db
      .insert(googleDataRouteAudit)
      .values({
        id: crypto.randomUUID(),
        ...route,
        requestedAt: new Date(),
      })
      .run();
  },
});
const openAiModels = new OpenAiModelConnection(credentials);
const xaiModels = new XaiModelConnection(credentials);
const standardModels = new StandardModelConnection(credentials);
const subscriptionRuntimes = new SubscriptionRuntimeManager({
  root: join(dirname(databasePath), "subscription-runtimes"),
});
const subscriptionEnv = subscriptionRuntimeEnvironment();
const codexSpawn = createCodexAppServerSpawn({
  resolveExecutable: () => subscriptionRuntimes.require("codex"),
  env: subscriptionEnv,
  codexHome: join(dirname(databasePath), "codex"),
});
const codexSubscription = new CodexSubscriptionConnection(
  new CodexAppServerClient({ spawn: codexSpawn }),
);
const claudeSubscription = new ClaudeSubscriptionConnection({
  resolveExecutable: () => subscriptionRuntimes.require("claude"),
  env: subscriptionEnv,
  claudeHome: join(dirname(databasePath), "claude"),
});
const artifactBlobs = new FilesystemArtifactBlobStore(
  join(dirname(databasePath), "artifacts"),
);
const artifacts = new SqliteArtifactRepository(localDatabase.db);
const googleProtection = new GoogleDataProtection(localDatabase.db);
const imageGeneration: ImageGenerationToolRuntime = {
  async listModels() {
    return (await connectedImageModels()).map((model) => ({
      handle: imageGenerationModelHandle(model.providerId, model.modelId),
      providerId: model.providerId,
      modelId: model.modelId,
      name: model.name,
      inputModalities: model.inputModalities,
    }));
  },
  async generate(input) {
    if (currentGoogleDataAccess()?.protected) {
      throw new ToolPolicyError(
        "The image-generation route cannot yet enforce the Google-data AI policy. Use a separate conversation without Google data for image generation.",
      );
    }
    const setting = localDatabase.db
      .select()
      .from(modelSettings)
      .where(eq(modelSettings.id, imageModelSettingId))
      .get();
    const taskSetting = input.taskId
      ? localDatabase.db
          .select({
            providerId: tasks.imageModelProviderId,
            modelId: tasks.imageModelId,
          })
          .from(tasks)
          .where(eq(tasks.id, input.taskId))
          .get()
      : undefined;
    const available = await connectedImageModels();
    const selection = resolveImageModelSelection(
      available,
      taskSetting?.providerId && taskSetting.modelId
        ? { providerId: taskSetting.providerId, modelId: taskSetting.modelId }
        : setting?.providerId && setting.modelId
          ? { providerId: setting.providerId, modelId: setting.modelId }
          : undefined,
      input.model,
    );
    if (
      input.references?.length &&
      !selection.inputModalities.includes("image")
    ) {
      throw new Error(
        `Image model ${selection.name} does not advertise reference-image input support`,
      );
    }
    const definition = findImageModelDefinition(
      selection.providerId,
      selection.modelId,
      selection.name,
    );
    if (!definition) throw new Error("No supported image model is configured");
    const openRouterRuntime =
      definition.providerId === "openrouter"
        ? await models.loadImageRuntime(
            openRouterCredentialRef,
            definition.modelId,
          )
        : undefined;
    const model = openRouterRuntime
      ? openRouterRuntime.model
      : definition.providerId === "openai"
        ? await openAiModels.loadImageModel(
            openAiCredentialRef,
            definition.modelId,
          )
        : await xaiModels.loadImageModel(xaiCredentialRef, definition.modelId);
    const pricing =
      selection.inputUsdPerMillionTokens !== undefined &&
      selection.outputUsdPerMillionTokens !== undefined
        ? {
            inputUsdPerMillionTokens: selection.inputUsdPerMillionTokens,
            outputUsdPerMillionTokens: selection.outputUsdPerMillionTokens,
          }
        : undefined;
    return new AiSdkImageGenerationService(model, definition, {
      ...(pricing ? { pricing } : undefined),
      ...(openRouterRuntime
        ? { providerUsage: openRouterRuntime.providerUsage }
        : undefined),
    }).generate(input);
  },
};
const imageGenerationSource = createImageGenerationToolSource({
  generation: imageGeneration,
  blobs: artifactBlobs,
  artifacts,
});
const modelCatalog = new SpringrollModelCatalog(runtimePaths.modelCatalogPath);
const agent: AgentRunner = {
  async run(request) {
    const hasGoogleTools = request.tools.some((tool) => {
      const connection = localDatabase.db
        .select()
        .from(connections)
        .where(eq(connections.id, tool.policy.connectionId))
        .get();
      return (
        connection &&
        isGoogleConnection({ manifestId: connection.manifestId ?? undefined })
      );
    });
    if (hasGoogleTools) googleProtection.mark(`task:${request.task.id}`);
    const selected = await resolveModelExecution(
      request.task.modelSelection,
      requiredProviderToolCapabilities(request.tools),
    );
    const scope = googleProtection.scope(
      `task:${request.task.id}`,
      selected.providerId,
      selected.modelId,
    );
    return withGoogleDataAccess(scope, () => runAgent(request, selected));
  },
};
async function runAgent(
  request: Parameters<AgentRunner["run"]>[0],
  execution: ModelExecutionDto,
) {
  const catalog = await modelCatalog.read().catch(
    (): ModelCatalogSnapshot => ({
      models: [],
      imageModels: [],
      stale: true,
    }),
  );
  const catalogModel = catalog.models.find(
    (model) =>
      model.providerId === execution.providerId &&
      model.modelId === execution.modelId,
  );
  const pricing = catalogModelPricing(catalogModel);
  const runnerExecutionLimits = readRecipeExecutionLimits(localDatabase.db);
  const { maxSteps } = runnerExecutionLimits;
  if (!request.continuation) {
    await request.eventSink?.append(
      {
        type: "model_selection",
        provider: execution.providerId,
        modelId: execution.modelId,
        billing:
          execution.providerId === "codex" || execution.providerId === "claude"
            ? "subscription"
            : "metered",
        ...(execution.providerId === "codex" || maxSteps === 0
          ? undefined
          : { maxSteps }),
        ...(catalog.revision
          ? { catalogRevision: catalog.revision }
          : undefined),
        ...(pricing
          ? {
              inputUsdPerMillionTokens: pricing.inputUsdPerMillionTokens,
              outputUsdPerMillionTokens: pricing.outputUsdPerMillionTokens,
            }
          : undefined),
      },
      new Date(),
    );
  }

  if (execution.providerId === "openrouter") {
    const runtime = await models.loadAgentRuntime(
      openRouterCredentialRef,
      execution.modelId,
      currentGoogleDataAccess()?.eligible === true,
    );
    return new AiSdkAgentRunner(runtime.model, {
      artifactReader: artifacts,
      ...runnerExecutionLimits,
      ...(pricing ? { pricing } : undefined),
      providerTools: providerToolBindingsForExecution(
        runtime.providerTools,
        execution,
      ),
      providerUsage: runtime.providerUsage,
      ...(catalog.revision ? { catalogRevision: catalog.revision } : undefined),
      emitModelSelection: false,
    }).run(request);
  }
  if (execution.providerId === "openai") {
    const model = await openAiModels.loadModel(
      openAiCredentialRef,
      execution.modelId,
    );
    return new AiSdkAgentRunner(model, {
      artifactReader: artifacts,
      ...runnerExecutionLimits,
      ...(pricing ? { pricing } : undefined),
      ...(catalog.revision ? { catalogRevision: catalog.revision } : undefined),
      emitModelSelection: false,
    }).run(request);
  }
  if (execution.providerId === "codex") {
    return new CodexAgentRunner(execution.modelId, {
      maxSteps,
      emitModelSelection: false,
      spawn: codexSpawn,
    }).run(request);
  }
  if (execution.providerId === "claude") {
    const claudeRuntime = await claudeSubscription.runtime();
    return new ClaudeAgentRunner(execution.modelId, {
      maxSteps,
      emitModelSelection: false,
      executable: claudeRuntime.executable,
      env: claudeRuntime.env,
    }).run(request);
  }
  if (execution.providerId === "xai") {
    const runtime = await xaiModels.loadAgentRuntime(
      xaiCredentialRef,
      execution.modelId,
    );
    return new AiSdkAgentRunner(runtime.model, {
      artifactReader: artifacts,
      ...runnerExecutionLimits,
      ...((pricing ?? runtime.pricing)
        ? { pricing: pricing ?? runtime.pricing }
        : undefined),
      ...(catalog.revision ? { catalogRevision: catalog.revision } : undefined),
      emitModelSelection: false,
    }).run(request);
  }
  const model = await standardModels.loadModel(
    execution.providerId,
    execution.modelId,
  );
  return new AiSdkAgentRunner(model, {
    artifactReader: artifacts,
    ...runnerExecutionLimits,
    ...(pricing ? { pricing } : undefined),
    ...(catalog.revision ? { catalogRevision: catalog.revision } : undefined),
    emitModelSelection: false,
  }).run(request);
}

const loadAssistantRuntime = async (selection?: {
  readonly providerId: string;
  readonly modelId: string;
}) => {
  const execution = await resolveModelExecution(selection, [], true);
  const catalog = await modelCatalog.read().catch(
    (): ModelCatalogSnapshot => ({
      models: [],
      imageModels: [],
      stale: true,
    }),
  );
  const catalogModel = catalog.models.find(
    (model) =>
      model.providerId === execution.providerId &&
      model.modelId === execution.modelId,
  );
  const catalogPricing = catalogModelPricing(catalogModel);
  if (execution.providerId === "codex") {
    return {
      kind: "subscription" as const,
      provider: execution.providerId,
      modelId: execution.modelId,
      inputModalities: ["text"],
      billing: "subscription" as const,
      createRunner: (options: { system: string; maxSteps: number }) =>
        new CodexAgentRunner(execution.modelId, {
          system: options.system,
          maxSteps: options.maxSteps,
          emitModelSelection: false,
          spawn: codexSpawn,
          surface: "chat",
        }),
    };
  }
  if (execution.providerId === "claude") {
    const claudeRuntime = await claudeSubscription.runtime();
    return {
      kind: "subscription" as const,
      provider: execution.providerId,
      modelId: execution.modelId,
      inputModalities: ["text"],
      billing: "subscription" as const,
      createRunner: (options: { system: string; maxSteps: number }) =>
        new ClaudeAgentRunner(execution.modelId, {
          system: options.system,
          maxSteps: options.maxSteps,
          emitModelSelection: false,
          executable: claudeRuntime.executable,
          env: claudeRuntime.env,
          surface: "chat",
        }),
    };
  }
  if (execution.providerId === "openrouter") {
    return {
      model: await models.loadModel(
        openRouterCredentialRef,
        execution.modelId,
        true,
      ),
      provider: execution.providerId,
      modelId: execution.modelId,
      inputModalities: catalogModel?.inputModalities ?? ["text"],
      billing: "metered" as const,
      ...(catalog.revision ? { catalogRevision: catalog.revision } : undefined),
      ...(catalogPricing ? { pricing: catalogPricing } : undefined),
    };
  }
  if (execution.providerId === "openai") {
    return {
      model: await openAiModels.loadModel(
        openAiCredentialRef,
        execution.modelId,
      ),
      provider: execution.providerId,
      modelId: execution.modelId,
      inputModalities: catalogModel?.inputModalities ?? ["text"],
      billing: "metered" as const,
      ...(catalog.revision ? { catalogRevision: catalog.revision } : undefined),
      ...(catalogPricing ? { pricing: catalogPricing } : undefined),
    };
  }
  if (isStandardModelProviderId(execution.providerId)) {
    return {
      model: await standardModels.loadModel(
        execution.providerId,
        execution.modelId,
      ),
      provider: execution.providerId,
      modelId: execution.modelId,
      inputModalities: catalogModel?.inputModalities ?? ["text"],
      billing: "metered" as const,
      ...(catalog.revision ? { catalogRevision: catalog.revision } : undefined),
      ...(catalogPricing ? { pricing: catalogPricing } : undefined),
    };
  }
  const runtime = await xaiModels.loadAgentRuntime(
    xaiCredentialRef,
    execution.modelId,
  );
  return {
    model: runtime.model,
    provider: execution.providerId,
    modelId: execution.modelId,
    inputModalities: catalogModel?.inputModalities ?? ["text"],
    billing: "metered" as const,
    ...(catalog.revision ? { catalogRevision: catalog.revision } : undefined),
    ...((catalogPricing ?? runtime.pricing)
      ? { pricing: catalogPricing ?? runtime.pricing }
      : undefined),
  };
};

const configuredConnectorOAuthClients = connectorOAuthClientsFromEnvironment(
  process.env,
);
const application = new LocalApplication(localDatabase.db, {
  enforceGoogleDataProtection: true,
  credentials,
  models,
  openAiModels,
  xaiModels,
  standardModels,
  codexSubscription,
  claudeSubscription,
  subscriptionRuntimes,
  modelCatalog,
  agent,
  resolveModelExecution,
  integrationResearcher: new AiIntegrationResearcher({
    registry: new OfficialMcpRegistryClient(),
    githubRegistry: new GithubMcpRegistryClient(),
  }),
  localMcpResearcher: new VerifiedLocalMcpResearcher({
    npm: new OfficialNpmRegistryClient(),
  }),
  openApiResearcher: new VerifiedOpenApiResearcher(),
  extraToolSources: [imageGenerationSource],
  artifactBlobs,
  artifacts,
  ...(configuredConnectorOAuthClients
    ? { connectorOAuthClients: configuredConnectorOAuthClients }
    : {}),
});
application.ensureBuiltinConnections();
await seedStarterRecipe(application, databasePath);
await application.migrateBuiltInToolPins();
const applicationTools = createSpringrollApplicationToolRegistry(application);
const externalApplicationTools = googleProtection.registry(applicationTools, {
  eligible: false,
  protected: false,
  protect: () => {
    throw new ToolPolicyError(
      "Google-derived workspace data is unavailable through external MCP. Use an OpenRouter model with enforced ZDR in Springroll.",
    );
  },
});
if (process.argv.includes("--mcp-stdio")) {
  await runStdioMcp(externalApplicationTools);
}
const assistant = new AiSdkAssistant(localDatabase.db, {
  maxSteps: chatExecutionLimits.maxSteps,
  artifacts,
  artifactBlobs,
  workflowTools: {
    research_connection: "connection_setup",
    propose_connection: "connection_setup",
  },
  loadRuntime: async (selection, context) => {
    const runtime = await loadAssistantRuntime(selection);
    const scope = googleProtection.scope(
      `chat:${context?.sessionId ?? "unscoped"}`,
      runtime.provider,
      runtime.modelId,
    );
    const guardedTools = googleProtection.registry(applicationTools, scope);
    const approvalPolicies = Object.fromEntries([
      ...applicationTools.definitions.map(
        (definition) =>
          [
            definition.name,
            { riskEffect: definition.policy.risk.effect },
          ] as const,
      ),
      ["generate_image", { riskEffect: "write" as const }],
    ]);
    if ("kind" in runtime && runtime.kind === "subscription") {
      const tools = context?.turnId
        ? [
            ...createAgentApplicationTools(
              guardedTools,
              { turnId: context.turnId },
              { exclude: legacyAssistantConnectorProposalTools },
            ),
            createAgentConnectionTool(
              application,
              imageGenerationToolDescriptor(await imageGeneration.listModels()),
              imageGenerationCardId,
              {
                turnId: context.turnId,
                artifactOwner: {
                  kind: "chat_turn",
                  id: context.turnId,
                },
              },
            ),
          ]
        : [];
      return {
        ...runtime,
        googleDataProtected: scope.protected,
        tools: tools.map(
          (tool): ExecutableTool => ({
            ...tool,
            execute: (input, ctx) =>
              withGoogleDataAccess(scope, () => tool.execute(input, ctx)),
          }),
        ),
        approvalPolicies,
      };
    }
    const tools: ToolSet = {
      ...createAiSdkApplicationTools(guardedTools, {
        exclude: legacyAssistantConnectorProposalTools,
      }),
      ...(context?.turnId
        ? {
            generate_image: createAiSdkConnectionTool(
              application,
              imageGenerationToolDescriptor(await imageGeneration.listModels()),
              imageGenerationCardId,
              {
                turnId: context.turnId,
                artifactOwner: {
                  kind: "chat_turn",
                  id: context.turnId,
                },
              },
            ),
          }
        : undefined),
    };
    for (const tool of Object.values(tools)) {
      const execute = tool.execute;
      if (execute)
        tool.execute = (input, ctx) =>
          withGoogleDataAccess(scope, () => execute(input, ctx));
    }
    return {
      ...runtime,
      googleDataProtected: scope.protected,
      tools,
      approvalPolicies,
    };
  },
  loadDistillerRuntime: async () => {
    const runtime = await application.researchDistillerRuntime();
    return runtime
      ? {
          model: runtime.model,
          provider: runtime.provider,
          modelId: runtime.modelId,
        }
      : undefined;
  },
});

await application.executor.recoverInterruptedWork();
const { createLocalRivetTaskHost } = await import(
  "@springroll/kernel/host/rivet-local-task-host"
);
const taskRunHost = await createLocalRivetTaskHost({
  db: localDatabase.db,
  executor: application.executor,
  endpoint: rivetEnvironment.RIVET_ENDPOINT,
  onError: (error) => {
    console.error(
      "Local task actor failed:",
      error instanceof Error ? error.message : String(error),
    );
  },
});
application.attachTaskRunHost(taskRunHost);

const assets = await loadAssets();
const mcp = createDevelopmentMcpEndpoint(externalApplicationTools);
const httpApp = createHttpApp(
  application,
  assets,
  assistant,
  mcp,
  process.env.SPRINGROLL_DESKTOP === "1"
    ? (path) =>
        console.log(`Springroll desktop OAuth result: ${JSON.stringify(path)}`)
    : undefined,
);
const port = readPort(process.env.PORT);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  // Chat and run SSE streams sit quiet while a tool call or model reasoning
  // runs — nothing is written for tens of seconds. Bun's default 10s idle
  // timeout closes those sockets mid-turn and the client reports a network
  // error even though the turn continues server-side.
  idleTimeout: 240,
  fetch: httpApp.fetch,
});

console.log(`Springroll is ready at ${server.url}`);
if (mcp) {
  console.log(`Springroll development MCP is enabled at ${server.url}mcp`);
}

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.stop();
  await mcp?.close();
  await application.close();
  await taskRunHost.shutdown();
  modelCatalog.close();
  localDatabase.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

async function runStdioMcp(
  registry: ReturnType<typeof createSpringrollApplicationToolRegistry>,
): Promise<never> {
  const connection = await connectSpringrollMcpStdio(registry);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await connection.close();
    modelCatalog.close();
    localDatabase.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
  return new Promise<never>(() => undefined);
}

function createDevelopmentMcpEndpoint(
  registry: ReturnType<typeof createSpringrollApplicationToolRegistry>,
): SpringrollMcpHttpEndpoint | undefined {
  const bearerToken = process.env.SPRINGROLL_MCP_TOKEN;
  return bearerToken
    ? createSpringrollMcpHttpEndpoint(registry, { bearerToken })
    : undefined;
}

async function loadAssets(): Promise<HttpAppAssets> {
  const indexHtml = await Bun.file(runtimePaths.indexPath).text();

  return {
    indexHtml,
    async read(path) {
      if (!/^[a-zA-Z0-9._-]+$/.test(path)) {
        return undefined;
      }
      const file = Bun.file(join(runtimePaths.assetsDirectory, path));
      if (!(await file.exists())) {
        return undefined;
      }

      return new Response(file);
    },
  };
}

function readPort(value: string | undefined): number {
  if (value === undefined) {
    return 4117;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("PORT must be an integer between 0 and 65535");
  }
  return port;
}

async function resolveModelExecution(
  taskSelection:
    | { readonly providerId: string; readonly modelId: string }
    | undefined,
  requiredCapabilities: readonly ProviderToolCapability[],
  includeCodingAgents = true,
): Promise<ModelExecutionDto> {
  const setting = localDatabase.db
    .select()
    .from(modelSettings)
    .where(eq(modelSettings.id, "default"))
    .get();
  const providerIds = includeCodingAgents
    ? modelProviderIds
    : modelProviderIds.filter(
        (providerId) => providerId !== "codex" && providerId !== "claude",
      );
  const connectionStates = await Promise.all(
    providerIds.map(async (providerId) => ({
      providerId,
      connected: await hasProviderCredential(providerId),
    })),
  );
  const connectedProviders = new Set(
    connectionStates
      .filter((state) => state.connected)
      .map((state) => state.providerId),
  );
  const defaultSelection =
    setting?.providerId &&
    setting.modelId &&
    isModelProviderId(setting.providerId)
      ? {
          providerId: setting.providerId,
          modelId: setting.modelId,
        }
      : undefined;

  const execution = chooseModelExecution({
    taskSelection,
    defaultSelection,
    automaticSelections: providerIds.map((providerId) => ({
      providerId,
      modelId: defaultModelId(providerId),
    })),
    connectedProviders,
    requiredCapabilities,
    portableCapabilities: new Set([
      webSearchProviderToolCapability,
      webFetchProviderToolCapability,
    ]),
  });
  const web = webResearchSelection(
    localDatabase.db
      .select()
      .from(connections)
      .where(eq(connections.id, "builtin-web"))
      .get()?.config ?? {},
  );
  return {
    ...execution,
    toolRoutes: execution.toolRoutes.map((route) =>
      route.profile === "portable"
        ? {
            ...route,
            service:
              route.capability === webSearchProviderToolCapability
                ? web.searchProvider
                : web.readerProvider,
          }
        : route,
    ),
  };
}

function hasProviderCredential(providerId: ModelProviderId): Promise<boolean> {
  if (providerId === "codex") {
    return codexSubscription
      .account(false)
      .then((state) => state.account?.type === "chatgpt")
      .catch(() => false);
  }
  if (providerId === "claude") {
    return claudeSubscription
      .account()
      .then((state) => Boolean(state.account))
      .catch(() => false);
  }
  return credentials
    .get(credentialReference(providerId))
    .then((credential) => Boolean(credential));
}

async function connectedImageModels(): Promise<readonly ModelOptionDto[]> {
  const catalog = await modelCatalog.read();
  const connected = new Set<ModelProviderId>(
    (
      await Promise.all(
        (["openrouter", "openai", "xai"] as const).map(async (providerId) => ({
          providerId,
          connected: await hasProviderCredential(providerId),
        })),
      )
    )
      .filter((provider) => provider.connected)
      .map((provider) => provider.providerId),
  );
  return catalog.imageModels.filter(
    (model) =>
      connected.has(model.providerId) &&
      findImageModelDefinition(model.providerId, model.modelId) !== undefined,
  );
}

function resolveImageModelSelection(
  available: readonly ModelOptionDto[],
  configured:
    | { readonly providerId: string; readonly modelId: string }
    | undefined,
  requestedHandle?: string,
): ModelOptionDto {
  const fallback = chooseImageModelForCall(
    available,
    configured,
    requestedHandle,
  );
  if (fallback) return fallback;
  throw new Error(
    available.length
      ? "No default image model is available. Choose a model in the tool call or configure a default."
      : "No image-generation model is available. Connect OpenRouter, OpenAI, or xAI and refresh the model catalog.",
  );
}

function credentialReference(providerId: ModelProviderId): string {
  if (providerId === "openrouter") return openRouterCredentialRef;
  if (providerId === "openai") return openAiCredentialRef;
  if (providerId === "xai") return xaiCredentialRef;
  if (providerId === "codex" || providerId === "claude") {
    throw new TypeError(
      `${providerId} uses managed subscription authentication`,
    );
  }
  return standardModelProviderDefinitions[providerId].credentialRef;
}

function defaultModelId(providerId: ModelProviderId): string {
  if (providerId === "openrouter") return defaultOpenRouterModelId;
  if (providerId === "openai") return defaultOpenAiModelId;
  if (providerId === "xai") return defaultXaiModelId;
  if (providerId === "codex") return "gpt-5.6-sol";
  if (providerId === "claude") return "sonnet";
  return standardModelProviderDefinitions[providerId].defaultModelId;
}

function isModelProviderId(value: string): value is ModelProviderId {
  return modelProviderIds.includes(value as ModelProviderId);
}

function catalogModelPricing(model: ModelOptionDto | undefined):
  | {
      readonly inputUsdPerMillionTokens: number;
      readonly outputUsdPerMillionTokens: number;
    }
  | undefined {
  return model?.inputUsdPerMillionTokens !== undefined &&
    model.outputUsdPerMillionTokens !== undefined
    ? {
        inputUsdPerMillionTokens: model.inputUsdPerMillionTokens,
        outputUsdPerMillionTokens: model.outputUsdPerMillionTokens,
      }
    : undefined;
}
