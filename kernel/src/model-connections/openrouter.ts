import { createProviderDefinedToolFactory } from "@ai-sdk/provider-utils";
import {
  createOpenRouter,
  type OpenRouterProvider,
} from "@openrouter/ai-sdk-provider";
import { jsonSchema } from "ai";
import type { AiSdkProviderUsage } from "../ai-sdk-agent-runner.ts";
import type { CredentialStore } from "../credentials.ts";
import {
  HttpStatusError,
  InvalidResponseError,
  type RetryOptions,
  withRetry,
} from "../failures.ts";
import { protectGoogleInferenceBody } from "../google-data-policy.ts";
import type { ImageGenerationProviderUsage } from "../image-generation.ts";
import {
  type ProviderToolBindings,
  webFetchProviderToolCapability,
  webSearchProviderToolCapability,
} from "../provider-tools.ts";
import { ToolPolicyError } from "../tools.ts";
import { type FetchApi, MissingCredentialError } from "./openai.ts";

export const openRouterApiKeyCreationUrl =
  "https://openrouter.ai/settings/keys";
export const defaultOpenRouterModelId = "openai/gpt-5.4-mini";
export const defaultOpenRouterModelPricing = {
  inputUsdPerMillionTokens: 0.75,
  outputUsdPerMillionTokens: 4.5,
} as const;
const openRouterWebFetch = createProviderDefinedToolFactory<
  {
    readonly url?: string;
    readonly title?: string;
    readonly content?: string;
    readonly status?: string;
  },
  Record<string, never>
>({
  id: "openrouter.web_fetch",
  inputSchema: jsonSchema({
    type: "object",
    properties: {
      url: { type: "string" },
      title: { type: "string" },
      content: { type: "string" },
      status: { type: "string" },
    },
    additionalProperties: true,
  }),
});

export interface OpenRouterAgentRuntime {
  readonly model: ReturnType<OpenRouterProvider["chat"]>;
  readonly providerTools: ProviderToolBindings;
  readonly providerUsage: {
    read(): AiSdkProviderUsage;
  };
}

export interface OpenRouterImageRuntime {
  readonly model: ReturnType<OpenRouterProvider["imageModel"]>;
  readonly providerUsage: {
    read(): ImageGenerationProviderUsage;
  };
}

export interface OpenRouterModelConnectionOptions {
  readonly onGoogleDataRequest?: (route: {
    readonly modelId: string;
    readonly endpoint: string;
  }) => void;
  readonly fetch?: FetchApi;
  readonly retry?: RetryOptions;
}

export interface OpenRouterConnectionRequest {
  readonly credentialRef: string;
  readonly apiKey: string;
  readonly modelId?: string;
}

export interface OpenRouterConnectionTestResult {
  readonly provider: "openrouter";
  readonly modelId: string;
}

export class OpenRouterModelConnection {
  readonly #fetch: FetchApi;
  readonly #onGoogleDataRequest: OpenRouterModelConnectionOptions["onGoogleDataRequest"];
  readonly #retry: RetryOptions | undefined;

  constructor(
    private readonly credentials: CredentialStore,
    options: OpenRouterModelConnectionOptions = {},
  ) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#retry = options.retry;
    this.#onGoogleDataRequest = options.onGoogleDataRequest;
  }

  #zdrInventory:
    | { expires: number; models: readonly string[] | undefined }
    | undefined;
  #zdrLoading: Promise<readonly string[] | undefined> | undefined;

  /** Advisory only: final inference routing always enforces ZDR independently. */
  async zdrModelIds(): Promise<readonly string[] | undefined> {
    if (this.#zdrInventory && this.#zdrInventory.expires > Date.now())
      return this.#zdrInventory.models;
    if (this.#zdrLoading) return this.#zdrLoading;
    this.#zdrLoading = (async () => {
      let models: readonly string[] | undefined;
      try {
        const response = await this.#fetch(
          "https://openrouter.ai/api/v1/endpoints/zdr",
          { signal: AbortSignal.timeout(5000) },
        );
        if (!response.ok) throw new Error("ZDR inventory unavailable");
        const payload = (await response.json()) as {
          data?: { model_id?: unknown }[];
        };
        if (
          !Array.isArray(payload.data) ||
          payload.data.some(
            (endpoint) => typeof endpoint?.model_id !== "string",
          )
        )
          throw new Error("Invalid ZDR inventory");
        models = [
          ...new Set(
            payload.data.map((endpoint) => endpoint.model_id as string),
          ),
        ];
      } catch {
        /* Unknown availability must never disable request enforcement. */
      }
      this.#zdrInventory = {
        models,
        expires: Date.now() + (models ? 300_000 : 30_000),
      };
      return models;
    })();
    try {
      return await this.#zdrLoading;
    } finally {
      this.#zdrLoading = undefined;
    }
  }

  async connect(
    request: OpenRouterConnectionRequest,
  ): Promise<OpenRouterConnectionTestResult> {
    const apiKey = validateApiKey(request.apiKey);
    const modelId = request.modelId ?? defaultOpenRouterModelId;
    const result = await this.testApiKey(apiKey, modelId);
    await this.credentials.put(request.credentialRef, apiKey);

    return result;
  }

  async test(
    credentialRef: string,
    modelId = defaultOpenRouterModelId,
  ): Promise<OpenRouterConnectionTestResult> {
    const apiKey = await this.credentials.get(credentialRef);
    if (!apiKey) {
      throw new MissingCredentialError(
        `No OpenRouter API key found for ${credentialRef}`,
      );
    }

    return this.testApiKey(apiKey, modelId);
  }

  async loadModel(
    credentialRef: string,
    modelId = defaultOpenRouterModelId,
    googleData = false,
  ): Promise<ReturnType<OpenRouterProvider["chat"]>> {
    return (await this.loadAgentRuntime(credentialRef, modelId, googleData))
      .model;
  }

  async loadImageModel(
    credentialRef: string,
    modelId: string,
  ): Promise<ReturnType<OpenRouterProvider["imageModel"]>> {
    return (await this.loadImageRuntime(credentialRef, modelId)).model;
  }

  async loadImageRuntime(
    credentialRef: string,
    modelId: string,
  ): Promise<OpenRouterImageRuntime> {
    const apiKey = await this.credentials.get(credentialRef);
    if (!apiKey) {
      throw new MissingCredentialError(
        `No OpenRouter API key found for ${credentialRef}`,
      );
    }
    const usage = new OpenRouterImageProviderUsage();
    const provider = createOpenRouter({
      apiKey,
      appName: "Springroll",
      compatibility: "strict",
      fetch: createUsageTrackingFetch(this.#fetch, usage),
    });
    return {
      model: provider.imageModel(modelId),
      providerUsage: usage,
    };
  }

  async loadAgentRuntime(
    credentialRef: string,
    modelId = defaultOpenRouterModelId,
    googleData = false,
  ): Promise<OpenRouterAgentRuntime> {
    const apiKey = await this.credentials.get(credentialRef);
    if (!apiKey) {
      throw new MissingCredentialError(
        `No OpenRouter API key found for ${credentialRef}`,
      );
    }

    const inferenceFetch: FetchApi = googleData
      ? async (input, init) => {
          if (
            String(input) !== "https://openrouter.ai/api/v1/chat/completions" ||
            typeof init?.body !== "string"
          ) {
            throw new ToolPolicyError(
              "Unsupported Google-data inference request",
            );
          }
          const body = protectGoogleInferenceBody(init.body);
          this.#onGoogleDataRequest?.({
            modelId,
            endpoint: "https://openrouter.ai/api/v1/chat/completions",
          });
          const response = await this.#fetch(input, { ...init, body });
          if (response.status === 404 || response.status === 503) {
            throw new ToolPolicyError(
              `OpenRouter could not serve ${modelId} with ZDR enforced. Choose another model with a ZDR endpoint or try again later. Privacy protection was not relaxed.`,
            );
          }
          return response;
        }
      : this.#fetch;
    const usage = new OpenRouterProviderUsage();
    const provider = createOpenRouter({
      apiKey,
      appName: "Springroll",
      compatibility: "strict",
      fetch: createUsageTrackingFetch(inferenceFetch, usage),
    });

    return {
      model: provider.chat(modelId, {
        usage: {
          include: true,
        },
      }),
      providerTools: googleData
        ? {}
        : {
            [webSearchProviderToolCapability]: {
              profile: "managed-auto",
              tool: provider.tools.webSearch({ engine: "auto" }),
            },
            [webFetchProviderToolCapability]: {
              profile: "managed-auto",
              tool: openRouterWebFetch({}),
            },
          },
      providerUsage: usage,
    };
  }

  async disconnect(credentialRef: string): Promise<void> {
    await this.credentials.delete(credentialRef);
  }

  private async testApiKey(
    apiKey: string,
    modelId: string,
  ): Promise<OpenRouterConnectionTestResult> {
    const response = await withRetry(async () => {
      const attempt = await this.#fetch("https://openrouter.ai/api/v1/key", {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!attempt.ok) {
        throw new HttpStatusError(
          attempt.status,
          `OpenRouter connection test failed with HTTP ${attempt.status}`,
        );
      }

      return attempt;
    }, this.#retry);
    const body = (await response.json()) as unknown;
    if (
      body === null ||
      typeof body !== "object" ||
      !("data" in body) ||
      body.data === null ||
      typeof body.data !== "object"
    ) {
      throw new InvalidResponseError(
        "OpenRouter returned an invalid key response",
      );
    }

    return {
      provider: "openrouter",
      modelId,
    };
  }
}

function validateApiKey(apiKey: string): string {
  const normalized = apiKey.trim();
  if (normalized === "" || normalized.includes("\n")) {
    throw new TypeError("OpenRouter API key must be a non-empty single line");
  }

  return normalized;
}

class OpenRouterProviderUsage {
  #webSearchRequests = 0;

  async record(response: Response): Promise<void> {
    if (!response.headers.get("content-type")?.includes("application/json")) {
      return;
    }
    const body = (await response
      .clone()
      .json()
      .catch(() => undefined)) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return;
    }
    const responseUsage = (body as { readonly usage?: unknown }).usage;
    if (
      !responseUsage ||
      typeof responseUsage !== "object" ||
      Array.isArray(responseUsage)
    ) {
      return;
    }
    const serverToolUse = (
      responseUsage as { readonly server_tool_use?: unknown }
    ).server_tool_use;
    if (
      !serverToolUse ||
      typeof serverToolUse !== "object" ||
      Array.isArray(serverToolUse)
    ) {
      return;
    }
    const count = (serverToolUse as { readonly web_search_requests?: unknown })
      .web_search_requests;
    if (typeof count === "number" && Number.isInteger(count) && count > 0) {
      this.#webSearchRequests += count;
    }
  }

  read(): AiSdkProviderUsage {
    return this.#webSearchRequests > 0
      ? { webSearchRequests: this.#webSearchRequests }
      : {};
  }
}

class OpenRouterImageProviderUsage {
  #usage: ImageGenerationProviderUsage = {};

  async record(response: Response): Promise<void> {
    if (!response.headers.get("content-type")?.includes("application/json")) {
      return;
    }
    const body = (await response
      .clone()
      .json()
      .catch(() => undefined)) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return;
    const usage = (body as { readonly usage?: unknown }).usage;
    if (!usage || typeof usage !== "object" || Array.isArray(usage)) return;
    const inputTokens = nonNegativeNumber(usage, "prompt_tokens");
    const outputTokens = nonNegativeNumber(usage, "completion_tokens");
    const totalTokens = nonNegativeNumber(usage, "total_tokens");
    const cost = nonNegativeNumber(usage, "cost");
    const actualCostUsdMicros =
      cost === undefined ? undefined : Math.round(cost * 1_000_000);
    this.#usage = {
      ...(inputTokens === undefined ? {} : { inputTokens }),
      ...(outputTokens === undefined ? {} : { outputTokens }),
      ...(totalTokens === undefined ? {} : { totalTokens }),
      ...(actualCostUsdMicros === undefined
        ? {}
        : {
            costUsdMicros: actualCostUsdMicros,
            actualCostUsdMicros,
            costSource: "provider_reported" as const,
          }),
    };
  }

  read(): ImageGenerationProviderUsage {
    return this.#usage;
  }
}

function nonNegativeNumber(value: object, key: string): number | undefined {
  if (!(key in value)) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" &&
    Number.isFinite(candidate) &&
    candidate >= 0
    ? candidate
    : undefined;
}

function createUsageTrackingFetch(
  fetch: FetchApi,
  usage: { record(response: Response): Promise<void> },
): typeof globalThis.fetch {
  return Object.assign(
    async (input: URL | RequestInfo, init?: RequestInit) => {
      const response = await fetch(input, init);
      await usage.record(response);
      return response;
    },
    { preconnect: globalThis.fetch.preconnect },
  );
}
