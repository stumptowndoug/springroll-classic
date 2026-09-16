import { describe, expect, test } from "bun:test";
import { protectGoogleInferenceBody } from "../src/google-data-policy.ts";
import { OpenRouterModelConnection } from "../src/model-connections/openrouter.ts";

const credentials = {
  get: async () => "test-key",
  put: async () => {},
  delete: async () => {},
};

describe("Google inference boundary", () => {
  test("forces ZDR without pinning models, hosts, or disabling eligible fallbacks", () => {
    const body = JSON.parse(
      protectGoogleInferenceBody(
        JSON.stringify({
          model: "another/model",
          models: ["fallback/model"],
          messages: [{ role: "user", content: "private" }],
          provider: {
            zdr: false,
            data_collection: "allow",
            allow_fallbacks: true,
            sort: "price",
          },
          store: true,
        }),
      ),
    );
    expect(body.provider).toEqual({
      zdr: true,
      data_collection: "deny",
      allow_fallbacks: true,
      sort: "price",
    });
    expect(body.models).toEqual(["fallback/model"]);
    expect(body.provider.only).toBeUndefined();
    expect(body.provider.order).toBeUndefined();
    expect(body.store).toBe(false);
    expect(body.messages[0].content).toBe("private");
  });
  test("rejects plugins and hosted web search outside ZDR coverage", () => {
    for (const extra of [
      { plugins: [{ id: "web" }] },
      { plugins: {} },
      { web_search_options: {} },
    ]) {
      expect(() =>
        protectGoogleInferenceBody(
          JSON.stringify({ model: "any/model", ...extra }),
        ),
      ).toThrow();
    }
  });
  test("supports any selected model and relies on OpenRouter ZDR routing without an inventory preflight", async () => {
    const bodies: Record<string, unknown>[] = [];
    const audit: { modelId: string; endpoint: string }[] = [];
    const urls: string[] = [];
    const models = new OpenRouterModelConnection(credentials, {
      onGoogleDataRequest: (route) => {
        audit.push(route);
      },
      fetch: async (url, init) => {
        urls.push(String(url));
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json({
          id: "test",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "OK" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      },
    });
    const runtime = await models.loadAgentRuntime(
      "key",
      "new-provider/new-model",
      true,
    );
    expect(urls).toEqual([]);
    expect(runtime.providerTools).toEqual({});
    await runtime.model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "private" }] }],
      providerOptions: {
        openrouter: { provider: { zdr: false, allow_fallbacks: true } },
      },
    });
    expect(urls).toEqual(["https://openrouter.ai/api/v1/chat/completions"]);
    expect(audit).toEqual([
      {
        modelId: "new-provider/new-model",
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
      },
    ]);
    expect(bodies[0]?.provider).toEqual({
      allow_fallbacks: true,
      data_collection: "deny",
      zdr: true,
    });
  });
  test("never resends an unavailable ZDR request without protection", async () => {
    const bodies: Record<string, unknown>[] = [];
    const models = new OpenRouterModelConnection(credentials, {
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response("No ZDR endpoints", { status: 503 });
      },
    });
    const model = await models.loadModel("key", "openrouter/auto", true);
    await expect(
      model.doGenerate({
        prompt: [
          { role: "user", content: [{ type: "text", text: "private" }] },
        ],
      }),
    ).rejects.toThrow("ZDR enforced");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.provider).toEqual({ data_collection: "deny", zdr: true });
  });
});

describe("OpenRouter ZDR availability", () => {
  test("reads model IDs from the live endpoint inventory and caches without inference", async () => {
    const urls: string[] = [];
    const connection = new OpenRouterModelConnection(credentials, {
      fetch: async (url) => {
        urls.push(String(url));
        return Response.json({
          data: [
            { model_id: "vendor/a" },
            { model_id: "vendor/a" },
            { model_id: "vendor/b" },
          ],
        });
      },
    });
    expect(await connection.zdrModelIds()).toEqual(["vendor/a", "vendor/b"]);
    expect(await connection.zdrModelIds()).toEqual(["vendor/a", "vendor/b"]);
    expect(urls).toEqual(["https://openrouter.ai/api/v1/endpoints/zdr"]);
  });
  test("reports unavailable inventory as unknown, never as an empty allowlist", async () => {
    for (const payload of [
      { error: "unavailable" },
      { data: [{ name: "missing ID" }] },
    ]) {
      const connection = new OpenRouterModelConnection(credentials, {
        fetch: async () => Response.json(payload),
      });
      expect(await connection.zdrModelIds()).toBeUndefined();
    }
  });
});
