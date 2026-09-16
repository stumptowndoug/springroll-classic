import { describe, expect, test } from "bun:test";
import { APICallError, simulateReadableStream, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import {
  AiSdkAssistant,
  selectAssistantContext,
  summarizePromptFallback,
} from "../src/ai-sdk-assistant.ts";
import { toDurableChatParts } from "../src/durable-chat-persistence.ts";
import { createMarkdownRunResult } from "../src/run-results.ts";
import { openLocalDatabase } from "../src/storage/database.ts";
import { SqliteChatStore } from "../src/storage/sqlite-chat-store.ts";
import { SqliteModelCallStore } from "../src/storage/sqlite-model-call-store.ts";
import { SqliteRunArtifactRepository } from "../src/storage/sqlite-run-artifact-repository.ts";
import type { JsonObject, ToolCallContext } from "../src/tools.ts";

const usage = {
  inputTokens: {
    total: 10,
    noCache: 8,
    cacheRead: 2,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 5,
    text: 4,
    reasoning: 1,
  },
};

describe("AiSdkAssistant", () => {
  for (const configuration of ["default", "zero", "settings"] as const) {
    test(`continues beyond 20 steps with unlimited chat configuration: ${configuration}`, async () => {
      const local = openLocalDatabase({ filename: ":memory:" });
      try {
        let executions = 0;
        const model = new MockLanguageModelV4({
          doStream: [
            ...Array.from({ length: 25 }, (_, index) =>
              toolCallStream("lookup", `lookup-${index}`),
            ),
            responseStream("Completed all 25 lookups"),
          ],
        });
        const assistant = new AiSdkAssistant(local.db, {
          ...(configuration === "zero" ? { maxSteps: 0 } : {}),
          ...(configuration === "settings"
            ? {
                maxSteps: 2,
                loadExecutionSettings: async () => ({ maxSteps: 0 }),
              }
            : {}),
          loadRuntime: async () => ({
            model,
            provider: "mock",
            modelId: "mock",
            tools: {
              lookup: tool({
                inputSchema: z.object({}),
                execute: async () => ({ result: ++executions }),
              }),
            },
          }),
        });
        const session = assistant.createSession();
        const body = await (
          await assistant.respond(
            session.id,
            userMessage("Complete all lookups"),
          )
        ).text();
        expect(body).toContain("Completed all 25 lookups");
        expect(body).not.toContain("step limit");
        expect(executions).toBe(25);
        expect(model.doStreamCalls).toHaveLength(26);
        expect(
          JSON.stringify(assistant.getSession(session.id)?.messages),
        ).toContain("Completed all 25 lookups");
      } finally {
        local.close();
      }
    });
  }

  test("returns a final response even when the only allowed step is empty", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: emptyResponseStream(),
      });
      const assistant = new AiSdkAssistant(local.db, {
        maxSteps: 1,
        loadRuntime: async () => ({ model, provider: "mock", modelId: "mock" }),
      });
      const session = assistant.createSession();
      expect(
        await (
          await assistant.respond(session.id, userMessage("Answer"))
        ).text(),
      ).toContain("reached the 1-step limit");
      expect(model.doStreamCalls).toHaveLength(1);
      expect(assistant.getSession(session.id)?.turns[0]?.status).toBe(
        "completed",
      );
    } finally {
      local.close();
    }
  });

  test("returns a host response at the input-token boundary without extra synthesis", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [toolCallStream("lookup", "one"), emptyResponseStream()],
      });
      const assistant = new AiSdkAssistant(local.db, {
        maxCumulativeInputTokens: 1,
        loadRuntime: async () => ({
          model,
          provider: "mock",
          modelId: "mock",
          tools: {
            lookup: tool({
              inputSchema: z.object({}),
              execute: async () => ({ found: true }),
            }),
          },
        }),
      });
      const session = assistant.createSession();
      expect(
        await (
          await assistant.respond(session.id, userMessage("Research"))
        ).text(),
      ).toContain("reached the cumulative input-token limit");
      expect(model.doStreamCalls).toHaveLength(2);
      expect(assistant.getSession(session.id)?.turns[0]?.status).toBe(
        "completed",
      );
    } finally {
      local.close();
    }
  });

  test("streams and persists a host answer when the model ignores the last-step tool ban", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      let executions = 0;
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream("lookup", "first"),
          toolCallStream("lookup", "second"),
          toolCallStream("lookup", "forbidden"),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        maxRetries: 0,
        loadExecutionSettings: async () => ({ maxSteps: 3 }),
        loadRuntime: async () => ({
          model,
          provider: "mock",
          modelId: "mock",
          tools: {
            lookup: tool({
              inputSchema: z.object({}),
              execute: async () => {
                executions++;
                return { fact: "partial" };
              },
            }),
          },
        }),
      });
      const session = assistant.createSession();
      const body = await (
        await assistant.respond(
          session.id,
          userMessage("Find current standings"),
        )
      ).text();
      expect(body).toContain("reached the 3-step limit");
      expect(body).toContain("recipe limits in Settings do not apply to chat");
      expect(body).not.toContain("adjust the execution limits in Settings");
      expect(body).not.toContain('"type":"error"');
      expect(executions).toBe(2);
      expect(model.doStreamCalls).toHaveLength(3);
      const detail = assistant.getSession(session.id);
      expect(detail?.turns[0]?.status).toBe("completed");
      expect(JSON.stringify(detail?.messages)).toContain(
        "reached the 3-step limit",
      );
      expect(body.indexOf("reached the 3-step limit")).toBeLessThan(
        body.lastIndexOf('"type":"finish"'),
      );
    } finally {
      local.close();
    }
  });

  test("reloads limits for each response and handles an empty final model turn without another call", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      let maxSteps = 2;
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream("lookup", "one"),
          emptyResponseStream(),
          toolCallStream("lookup", "two"),
          toolCallStream("lookup", "three"),
          emptyResponseStream(),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadExecutionSettings: async () => ({ maxSteps }),
        loadRuntime: async () => ({
          model,
          provider: "mock",
          modelId: "mock",
          tools: {
            lookup: tool({
              inputSchema: z.object({}),
              execute: async () => ({ fact: "partial" }),
            }),
          },
        }),
      });
      const session = assistant.createSession();
      expect(
        await (
          await assistant.respond(session.id, userMessage("First request"))
        ).text(),
      ).toContain("reached the 2-step limit");
      maxSteps = 3;
      expect(
        await (
          await assistant.respond(session.id, userMessage("Next request"))
        ).text(),
      ).toContain("reached the 3-step limit");
      expect(model.doStreamCalls).toHaveLength(5);
    } finally {
      local.close();
    }
  });

  test("uses the configured cost budget and returns a host answer if budget wrap-up is empty", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [toolCallStream("lookup", "one"), emptyResponseStream()],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadExecutionSettings: async () => ({
          maxSteps: 10,
          maxCostUsdMicros: 1,
        }),
        loadRuntime: async () => ({
          model,
          provider: "mock",
          modelId: "mock",
          pricing: {
            inputUsdPerMillionTokens: 1,
            outputUsdPerMillionTokens: 1,
          },
          tools: {
            lookup: tool({
              inputSchema: z.object({}),
              execute: async () => ({ fact: "partial" }),
            }),
          },
        }),
      });
      const session = assistant.createSession();
      const body = await (
        await assistant.respond(session.id, userMessage("Research"))
      ).text();
      expect(body).toContain("reached the cost budget");
      expect(model.doStreamCalls).toHaveLength(2);
      expect(model.doStreamCalls[1]?.toolChoice).toEqual({ type: "none" });
      expect(assistant.getSession(session.id)?.turns[0]?.status).toBe(
        "completed",
      );
    } finally {
      local.close();
    }
  });
  test("deletes every conversation owned by one subject", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model: new MockLanguageModelV4({
            doStream: responseStream("Interrupted by deletion.", false, 50),
          }),
          provider: "mock-provider",
          modelId: "mock-model",
        }),
      });
      const context = {
        version: 1 as const,
        intent: "run.diagnose" as const,
        origin: "runs" as const,
        subjects: [{ kind: "run" as const, id: "run-1" }],
      };
      const archived = assistant.createOrResumeSession({
        mode: "new",
        context,
      });
      assistant.archiveSession(archived.id);
      const active = assistant.createOrResumeSession({
        mode: "new",
        context,
      });
      const activeResponse = await assistant.respond(
        active.id,
        userMessage("Keep working"),
      );
      const unrelated = assistant.createOrResumeSession({
        mode: "new",
        context: {
          ...context,
          subjects: [{ kind: "run", id: "run-2" }],
        },
      });

      await expect(
        assistant.deleteSessionsForSubject({ kind: "run", id: "run-1" }),
      ).resolves.toBe(2);
      await activeResponse.text().catch(() => "cancelled");
      expect(assistant.getSession(archived.id)).toBeUndefined();
      expect(assistant.getSession(active.id)).toBeUndefined();
      expect(assistant.getSession(unrelated.id)?.session.id).toBe(unrelated.id);
    } finally {
      local.close();
    }
  });

  test("loads the session model override for the next turn", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: responseStream("Using the chosen model."),
      });
      let loaded:
        | { readonly providerId: string; readonly modelId: string }
        | undefined;
      let loadedTurnId: string | undefined;
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async (selection, context) => {
          loaded = selection;
          if (context?.turnId) loadedTurnId = context.turnId;
          return {
            model,
            provider: selection?.providerId ?? "mock-provider",
            modelId: selection?.modelId ?? "mock-model",
          };
        },
      });
      const session = assistant.createOrResumeSession({
        context: {
          version: 1,
          intent: "general",
          origin: "chat",
          subjects: [],
        },
        modelSelection: { providerId: "openai", modelId: "gpt-5" },
      });
      expect(session.modelOverride).toEqual({
        providerId: "openai",
        modelId: "gpt-5",
      });

      const response = await assistant.respond(session.id, {
        id: "model-message",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      });
      await response.text();

      expect(loaded).toEqual({ providerId: "openai", modelId: "gpt-5" });
      expect(loadedTurnId).toBe(assistant.getSession(session.id)?.turns[0]?.id);
      expect(
        assistant.updateSessionModel(session.id, null).modelOverride,
      ).toBeUndefined();
    } finally {
      local.close();
    }
  });

  test("runs subscription models in chat with tools, usage, and durable history", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const prompts: string[] = [];
      const executed: string[] = [];
      const now = new Date("2026-09-04T12:00:00.000Z");
      const assistant = new AiSdkAssistant(local.db, {
        now: () => now,
        loadRuntime: async () => ({
          kind: "subscription",
          provider: "codex",
          modelId: "gpt-5.6-sol",
          billing: "subscription",
          inputModalities: ["text"],
          tools: [
            {
              descriptor: {
                name: "lookup",
                description: "Look up a value",
                inputSchema: {
                  type: "object",
                  properties: { query: { type: "string" } },
                  required: ["query"],
                  additionalProperties: false,
                },
              },
              policy: {
                sourceId: "springroll",
                connectionId: "test",
                name: "lookup",
                inputSchemaHash: "lookup-v1",
                risk: {
                  effect: "read",
                  openWorld: false,
                  idempotent: true,
                },
                approval: "never",
              },
              async execute(input: JsonObject) {
                executed.push(String(input.query));
                return { content: [{ answer: "42" }] };
              },
            },
          ],
          createRunner: (options) => ({
            async run(request) {
              expect(options.maxSteps).toBe(0);
              prompts.push(request.task.prompt);
              const callId = `${request.runId}:lookup`;
              await request.eventSink?.append(
                {
                  type: "tool_call",
                  toolCallId: callId,
                  toolName: "lookup",
                  sourceId: "springroll",
                  input: { query: "meaning" },
                  effect: "read",
                  openWorld: false,
                  approval: "never",
                },
                now,
              );
              const output = await request.tools[0]?.execute(
                { query: "meaning" },
                {
                  taskId: request.task.id,
                  runId: request.runId,
                  toolCallId: callId,
                },
              );
              await request.eventSink?.append(
                {
                  type: "tool_result",
                  toolCallId: callId,
                  status: "succeeded",
                  output: output?.content[0] ?? null,
                },
                now,
              );
              const text =
                prompts.length === 1 ? "The answer is 42." : "Yes, still 42.";
              await request.eventSink?.append(
                {
                  type: "message",
                  messageId: `${request.runId}:assistant`,
                  role: "assistant",
                  parts: [{ type: "text", text }],
                },
                now,
              );
              const usage = {
                provider: "codex",
                modelId: "gpt-5.6-sol",
                billing: "subscription" as const,
                inputTokens: 12,
                outputTokens: 5,
                totalTokens: 17,
              };
              await request.eventSink?.append(
                {
                  type: "usage",
                  modelCallId: `${request.runId}:codex`,
                  ...usage,
                },
                now,
              );
              return {
                result: createMarkdownRunResult({
                  body: text,
                  fallbackSummary: text,
                }),
                toolCalls: [],
                usage,
                startedAt: now,
                finishedAt: now,
              };
            },
          }),
        }),
      });
      const session = assistant.createOrResumeSession({
        context: {
          version: 1,
          intent: "general",
          origin: "chat",
          subjects: [],
        },
        modelSelection: { providerId: "codex", modelId: "gpt-5.6-sol" },
      });

      await (
        await assistant.respond(session.id, userMessage("Find it"))
      ).text();
      await (
        await assistant.respond(session.id, userMessage("Is that certain?"))
      ).text();

      expect(executed).toEqual(["meaning", "meaning"]);
      expect(prompts[0]).toContain("USER:\nFind it");
      expect(prompts[1]).toContain("ASSISTANT:\n[Prior lookup result:");
      expect(prompts[1]).toContain("The answer is 42.");
      expect(prompts[1]).toContain("USER:\nIs that certain?");
      const detail = assistant.getSession(session.id);
      expect(detail?.messages.at(-1)?.parts).toContainEqual(
        expect.objectContaining({ type: "text", text: "Yes, still 42." }),
      );
      expect(detail?.turns.at(-1)?.usage).toMatchObject({
        inputTokens: 12,
        outputTokens: 5,
        totalTokens: 17,
      });
      expect(
        new SqliteModelCallStore(local.db).list(
          "chat",
          detail?.turns[0]?.id ?? "",
        ),
      ).toContainEqual(expect.objectContaining({ billing: "subscription" }));
    } finally {
      local.close();
    }
  });

  test.each([true, false])(
    "subscription approval card executes only approved exact calls (%s)",
    async (approved) => {
      const local = openLocalDatabase({ filename: ":memory:" });
      try {
        const prompts: string[] = [];
        const executed: string[] = [];
        const now = new Date("2026-09-04T12:00:00.000Z");
        const createAssistant = () =>
          new AiSdkAssistant(local.db, {
            now: () => now,
            loadRuntime: async () => ({
              kind: "subscription",
              provider: "codex",
              modelId: "gpt-5.6-sol",
              billing: "subscription",
              inputModalities: ["text"],
              tools: [
                {
                  descriptor: {
                    name: "lookup",
                    description: "Look up a value",
                    inputSchema: {
                      type: "object",
                      properties: { query: { type: "string" } },
                      required: ["query"],
                      additionalProperties: false,
                    },
                  },
                  policy: {
                    sourceId: "springroll",
                    connectionId: "test",
                    name: "lookup",
                    inputSchemaHash: "lookup-v1",
                    risk: {
                      effect: "read",
                      openWorld: false,
                      idempotent: true,
                    },
                    approval: "never",
                  },
                  needsApproval: async () => true,
                  async execute(input: JsonObject, context: ToolCallContext) {
                    expect(context.approved).toBe(true);
                    executed.push(String(input.query));
                    return { content: [{ answer: "42" }] };
                  },
                },
              ],
              createRunner: (options) => ({
                async run(request) {
                  expect(options.maxSteps).toBe(0);
                  prompts.push(request.task.prompt);
                  const callId = `${request.runId}:lookup`;
                  await request.eventSink?.append(
                    {
                      type: "tool_call",
                      toolCallId: callId,
                      toolName: "lookup",
                      sourceId: "springroll",
                      input: { query: "meaning" },
                      effect: "read",
                      openWorld: false,
                      approval: "never",
                    },
                    now,
                  );
                  const output = await request.tools[0]?.execute(
                    { query: "meaning" },
                    {
                      taskId: request.task.id,
                      runId: request.runId,
                      toolCallId: callId,
                    },
                  );
                  await request.eventSink?.append(
                    {
                      type: "tool_result",
                      toolCallId: callId,
                      status: "succeeded",
                      output: output?.content[0] ?? null,
                    },
                    now,
                  );
                  const text =
                    prompts.length === 1
                      ? "The answer is 42."
                      : "Yes, still 42.";
                  await request.eventSink?.append(
                    {
                      type: "message",
                      messageId: `${request.runId}:assistant`,
                      role: "assistant",
                      parts: [{ type: "text", text }],
                    },
                    now,
                  );
                  const usage = {
                    provider: "codex",
                    modelId: "gpt-5.6-sol",
                    billing: "subscription" as const,
                    inputTokens: 12,
                    outputTokens: 5,
                    totalTokens: 17,
                  };
                  await request.eventSink?.append(
                    {
                      type: "usage",
                      modelCallId: `${request.runId}:codex`,
                      ...usage,
                    },
                    now,
                  );
                  return {
                    result: createMarkdownRunResult({
                      body: text,
                      fallbackSummary: text,
                    }),
                    toolCalls: [],
                    usage,
                    startedAt: now,
                    finishedAt: now,
                  };
                },
              }),
            }),
          });
        const assistant = createAssistant();
        const session = assistant.createOrResumeSession({
          context: {
            version: 1,
            intent: "general",
            origin: "chat",
            subjects: [],
          },
          modelSelection: { providerId: "codex", modelId: "gpt-5.6-sol" },
        });

        await (
          await assistant.respond(session.id, userMessage("Find it"))
        ).text();
        const waiting = assistant.getSession(session.id);
        expect(executed).toEqual([]);
        expect(waiting?.turns.at(-1)?.status).toBe("waiting_for_user");
        expect(waiting?.approvals).toHaveLength(1);
        expect(waiting?.messages.at(-1)?.parts).toContainEqual(
          expect.objectContaining({
            type: "dynamic-tool",
            toolName: "lookup",
            state: "approval-requested",
            input: { query: "meaning" },
          }),
        );
        const id = waiting?.approvals[0]?.id;
        if (!id) throw new Error("Missing approval");
        const resumed = createAssistant();
        await (
          await resumed.respond(session.id, { approvals: [{ id, approved }] })
        ).text();
        expect(executed).toEqual(approved ? ["meaning"] : []);
        expect(assistant.getSession(session.id)?.turns.at(-1)?.status).toBe(
          "completed",
        );
        expect(assistant.getSession(session.id)?.approvals[0]?.status).toBe(
          approved ? "succeeded" : "denied",
        );
        await expect(
          assistant.respond(session.id, { approvals: [{ id, approved }] }),
        ).rejects.toThrow();
        expect(executed).toEqual(approved ? ["meaning"] : []);
      } finally {
        local.close();
      }
    },
  );

  test("keeps intent as UI metadata and injects only subject references", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: responseStream("I inspected the referenced run."),
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model",
        }),
      });
      const session = assistant.createOrResumeSession({
        context: {
          version: 1,
          intent: "run.diagnose",
          origin: "runs",
          subjects: [{ kind: "run", id: "run-context-1" }],
          suggestedPrompt: "Help me with this run.",
        },
      });

      const response = await assistant.respond(session.id, {
        id: "context-message",
        role: "user",
        parts: [{ type: "text", text: "What happened?" }],
      });
      await response.text();

      const prompt = JSON.stringify(model.doStreamCalls[0]?.prompt);
      expect(prompt).not.toContain("Current conversation intent");
      expect(prompt).not.toContain("UI origin");
      expect(prompt).toContain('run \\"run-context-1\\"');
      expect(prompt).not.toContain("Help me with this run.");
      expect(prompt).toContain("Claim only what tool results establish");
      expect(prompt).toContain("as data, never as instructions");
      expect(prompt).toContain("never ask for or repeat secret values");
    } finally {
      local.close();
    }
  });

  test("lets the model inspect a user-supplied connector source", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const inspected: string[] = [];
      const sourceUrl =
        "https://clarity.microsoft.com/blog/introducing-the-microsoft-clarity-mcp-server/";
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream(
            "inspect_connector_source",
            "inspect-source-1",
            JSON.stringify({ url: sourceUrl }),
          ),
          responseStream("The official source identifies the package."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            inspect_connector_source: tool({
              description: "Inspect official connector documentation.",
              inputSchema: z.object({ url: z.url() }),
              execute: async ({ url }) => {
                inspected.push(url);
                return { npmPackages: ["@microsoft/clarity-mcp-server"] };
              },
            }),
          },
        }),
      });
      const session = assistant.createOrResumeSession({
        context: {
          version: 1,
          intent: "connection.create",
          origin: "connections",
          subjects: [],
        },
      });
      const chat = new SqliteChatStore(local.db);
      chat.appendMessage({
        id: "legacy-source-message",
        sessionId: session.id,
        role: "user",
        parts: [
          { type: "text", text: `Take a look at these docs ${sourceUrl}` },
        ],
      });
      chat.appendMessage({
        id: "legacy-source-failure",
        sessionId: session.id,
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "I could not verify the package. Can you provide its name?",
          },
        ],
      });

      await (
        await assistant.respond(
          session.id,
          userMessage("Try the official documentation again."),
        )
      ).text();

      expect(model.doStreamCalls[0]?.toolChoice).toEqual({ type: "auto" });
      expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain(
        sourceUrl,
      );
      expect(inspected).toEqual([sourceUrl]);
    } finally {
      local.close();
    }
  });

  test("lets the model inspect a GitHub Registry package candidate", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const repositoryUrl = "https://github.com/microsoft/clarity-mcp-server";
      const inspected: string[] = [];
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream(
            "research_connection",
            "research-clarity",
            JSON.stringify({ intent: "Microsoft Clarity" }),
          ),
          toolCallStream(
            "inspect_connector_source",
            "inspect-clarity",
            JSON.stringify({ url: repositoryUrl }),
          ),
          responseStream("The package candidate is ready for verification."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            research_connection: tool({
              description: "Search connector registries.",
              inputSchema: z.object({ intent: z.string() }),
              execute: async () => ({
                status: "candidate",
                candidate: {
                  kind: "local-mcp",
                  repositoryUrl,
                },
              }),
            }),
            inspect_connector_source: tool({
              description: "Inspect a connector source.",
              inputSchema: z.object({ url: z.url() }),
              execute: async ({ url }) => {
                inspected.push(url);
                return { npmPackages: ["@microsoft/clarity-mcp-server"] };
              },
            }),
          },
        }),
      });
      const session = assistant.createSession();

      const response = await assistant.respond(
        session.id,
        userMessage("Connect Microsoft Clarity"),
      );

      expect(await response.text()).toContain("ready for verification");
      expect(model.doStreamCalls[1]?.toolChoice).toEqual({ type: "auto" });
      expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain(
        repositoryUrl,
      );
      expect(inspected).toEqual([repositoryUrl]);
    } finally {
      local.close();
    }
  });

  test("streams and persists a validated response with itemized usage", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: responseStream("I can help connect Neon.", true),
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "openrouter",
          modelId: "test/model",
          billing: "metered",
          catalogRevision: "catalog-v1",
          pricing: {
            inputUsdPerMillionTokens: 2,
            outputUsdPerMillionTokens: 8,
          },
        }),
      });
      const session = assistant.createSession("Connect Neon");

      const response = await assistant.respond(session.id, {
        id: "client-controlled-id",
        role: "user",
        parts: [{ type: "text", text: "Connect my Neon project" }],
      });
      const sse = await response.text();

      expect(response.headers.get("content-type")).toContain(
        "text/event-stream",
      );
      expect(sse).toContain("I can help connect Neon.");
      expect(sse).not.toContain("private chain of thought");

      const chat = new SqliteChatStore(local.db);
      const messages = chat.listMessages(session.id);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({
        role: "user",
        parts: [{ type: "text", text: "Connect my Neon project" }],
      });
      expect(messages[0]?.id).not.toBe("client-controlled-id");
      expect(messages[1]).toMatchObject({
        role: "assistant",
        metadata: {
          provider: "openrouter",
          modelId: "test/model",
        },
      });
      expect(
        messages[1]?.parts.find((part) => part.type === "text"),
      ).toMatchObject({ type: "text", text: "I can help connect Neon." });
      expect(JSON.stringify(messages[1]?.parts)).not.toContain("reasoning");
      expect(chat.getSession(session.id)?.activeTurnId).toBeNull();

      const turnId = messages[0]?.turnId;
      expect(turnId).toBeString();
      if (!turnId) throw new Error("Expected a persisted turn ID");
      const calls = new SqliteModelCallStore(local.db).list("chat", turnId);
      expect(calls).toMatchObject([
        {
          status: "succeeded",
          provider: "mock-provider",
          modelId: "mock-model-id",
          billing: "metered",
          catalogRevision: "catalog-v1",
          inputTokens: 10,
          outputTokens: 5,
          reasoningTokens: 1,
          cachedInputTokens: 2,
          totalTokens: 15,
          estimatedCostUsdMicros: 60,
          costUsdMicros: 60,
          costSource: "catalog_estimate",
        },
      ]);
      expect(assistant.getSession(session.id)?.turns).toMatchObject([
        {
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            reasoningTokens: 1,
            cachedInputTokens: 2,
            totalTokens: 15,
            estimatedCostUsdMicros: 60,
          },
        },
      ]);
      expect(assistant.listSessions()).toMatchObject([
        { id: session.id, latestTurnStatus: "completed" },
      ]);
    } finally {
      local.close();
    }
  });

  test("loads durable history for the next model turn", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          responseStream("First answer."),
          responseStream("Second answer."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });
      const session = assistant.createSession();

      await (
        await assistant.respond(session.id, userMessage("First question"))
      ).text();
      expect(assistant.getSession(session.id)?.session.title).toBe(
        "First question",
      );
      await (
        await assistant.respond(session.id, userMessage("Second question"))
      ).text();

      expect(model.doStreamCalls).toHaveLength(2);
      const secondPrompt = JSON.stringify(model.doStreamCalls[1]?.prompt);
      expect(secondPrompt).toContain("First question");
      expect(secondPrompt).toContain("First answer.");
      expect(secondPrompt).toContain("Second question");
      expect(assistant.getSession(session.id)?.messages).toHaveLength(4);
    } finally {
      local.close();
    }
  });

  test("removes failed tool continuations before retrying with Gemini", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const chat = new SqliteChatStore(local.db);
      const session = chat.createSession({ title: "Existing conversation" });
      const failedTurn = chat.createTurn(session.id, "failed-gemini-turn");
      chat.appendMessage({
        id: "failed-user-message",
        sessionId: session.id,
        turnId: failedTurn.id,
        role: "user",
        parts: [{ type: "text", text: "Inspect county traffic" }],
        metadata: { turnId: failedTurn.id },
      });
      chat.appendMessage({
        id: "failed-assistant-message",
        sessionId: session.id,
        turnId: failedTurn.id,
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "tool-list_connections",
            toolCallId: "poisoned-tool-call",
            state: "output-available",
            input: {},
            output: { connections: ["AssessorSearch"] },
          },
          {
            type: "text",
            text: "I couldn't finish that response. Provider returned error (HTTP 400)",
            state: "done",
          },
        ],
        metadata: { turnId: failedTurn.id },
      });
      chat.setTurnStatus(failedTurn.id, "failed", {
        error: "Provider returned error (HTTP 400)",
      });
      const model = new MockLanguageModelV4({
        doStream: responseStream("The clean retry succeeded."),
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "openrouter",
          modelId: "google/gemini-3.7-flash",
        }),
      });

      await (
        await assistant.respond(
          session.id,
          userMessage("Inspect county traffic"),
        )
      ).text();

      const prompt = JSON.stringify(model.doStreamCalls[0]?.prompt);
      expect(prompt).toContain("Inspect county traffic");
      expect(prompt).toContain("Provider returned error (HTTP 400)");
      expect(prompt).not.toContain("poisoned-tool-call");
      expect(prompt).not.toContain("AssessorSearch");
      expect(assistant.getSession(session.id)?.turns.at(-1)).toMatchObject({
        status: "completed",
        error: null,
      });
    } finally {
      local.close();
    }
  });

  test("continues a broader goal after connector setup without persisting a synthetic user message", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          responseStream("Use the connection card to finish setup."),
          responseStream(
            "The connection is ready, so I can finish the recipe.",
          ),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });
      const session = assistant.createOrResumeSession({
        context: {
          version: 1,
          intent: "task.create",
          origin: "recipes",
          subjects: [],
        },
      });
      await (
        await assistant.respond(
          session.id,
          userMessage("Create a recipe that needs Fixture API"),
        )
      ).text();
      const sourceMessage = assistant.getSession(session.id)?.messages.at(-1);
      if (!sourceMessage) throw new Error("Expected a source message");
      const workflow = assistant.recordWorkflow(session.id, {
        sourceMessageId: sourceMessage.id,
        sourceToolCallId: "connection-proposal-1",
        kind: "connection_setup",
        payload: { status: "ready", proposal: { name: "Fixture API" } },
      });
      assistant.updateWorkflow(session.id, workflow.id, {
        status: "completed",
        subject: { kind: "connection", id: "fixture-api" },
        outcome: { connected: true, toolsDiscovered: true, toolCount: 3 },
      });

      const continuation = await assistant.continueConnectionWorkflow(
        session.id,
        workflow.id,
      );
      expect(continuation).toBeDefined();
      await continuation?.text();

      const prompt = JSON.stringify(model.doStreamCalls[1]?.prompt);
      expect(prompt).toContain("Springroll host event");
      expect(prompt).toContain("fixture-api");
      expect(prompt).toContain("3 live tools were discovered");
      const detail = assistant.getSession(session.id);
      expect(detail?.messages.map((message) => message.role)).toEqual([
        "user",
        "assistant",
        "assistant",
      ]);
      expect(JSON.stringify(detail?.messages)).not.toContain(
        "Springroll host event",
      );
      expect(detail?.turns).toHaveLength(2);
    } finally {
      local.close();
    }
  });

  test("continues the same agent loop after connection setup regardless of intent", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          responseStream("Use the card to connect."),
          responseStream("The connection is ready."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });
      const session = assistant.createOrResumeSession({
        context: {
          version: 1,
          intent: "connection.create",
          origin: "connections",
          subjects: [],
        },
      });
      await (
        await assistant.respond(session.id, userMessage("Connect Fixture"))
      ).text();
      const sourceMessage = assistant.getSession(session.id)?.messages.at(-1);
      if (!sourceMessage) throw new Error("Expected a source message");
      const workflow = assistant.recordWorkflow(session.id, {
        sourceMessageId: sourceMessage.id,
        sourceToolCallId: "connection-proposal-2",
        kind: "connection_setup",
        payload: { status: "ready", proposal: { name: "Fixture" } },
      });
      assistant.updateWorkflow(session.id, workflow.id, {
        status: "completed",
        subject: { kind: "connection", id: "fixture" },
        outcome: { connected: true, toolsDiscovered: true, toolCount: 1 },
      });

      const continuation = await assistant.continueConnectionWorkflow(
        session.id,
        workflow.id,
      );
      expect(continuation).toBeDefined();
      await continuation?.text();
      expect(model.doStreamCalls).toHaveLength(2);
      expect(assistant.getSession(session.id)?.turns).toHaveLength(2);
    } finally {
      local.close();
    }
  });

  test("continues a broader goal with a safe declined-connection event", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          responseStream("Use the card to connect."),
          responseStream("I can offer an alternative."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });
      const session = assistant.createOrResumeSession({
        context: {
          version: 1,
          intent: "task.create",
          origin: "recipes",
          subjects: [],
        },
      });
      await (
        await assistant.respond(
          session.id,
          userMessage("Create a recipe that could use Fixture API"),
        )
      ).text();
      const sourceMessage = assistant.getSession(session.id)?.messages.at(-1);
      if (!sourceMessage) throw new Error("Expected a source message");
      const workflow = assistant.recordWorkflow(session.id, {
        sourceMessageId: sourceMessage.id,
        sourceToolCallId: "connection-proposal-declined",
        kind: "connection_setup",
        payload: { status: "ready", proposal: { name: "Fixture API" } },
      });
      assistant.updateWorkflow(session.id, workflow.id, {
        status: "cancelled",
        outcome: { state: "declined", retryable: true },
      });

      const continuation = await assistant.continueConnectionWorkflow(
        session.id,
        workflow.id,
      );
      expect(continuation).toBeDefined();
      await continuation?.text();

      const prompt = JSON.stringify(model.doStreamCalls[1]?.prompt);
      expect(prompt).toContain("user declined connector setup");
      expect(prompt).toContain("No credential value is included");
      expect(prompt).toContain("without claiming this capability is available");
      const detail = assistant.getSession(session.id);
      expect(detail?.messages.map((message) => message.role)).toEqual([
        "user",
        "assistant",
        "assistant",
      ]);
      expect(JSON.stringify(detail?.messages)).not.toContain(
        "Springroll host event",
      );
    } finally {
      local.close();
    }
  });

  test("continues after a failed connection test with the operation and diagnostic", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          responseStream("Prepare setup"),
          responseStream("I will correct the Cloud API route."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({ model, provider: "mock", modelId: "mock" }),
      });
      const session = assistant.createSession();
      await (
        await assistant.respond(session.id, userMessage("Connect analytics"))
      ).text();
      const source = assistant.getSession(session.id)?.messages.at(-1);
      if (!source) throw new Error("Missing proposal message");
      const workflow = assistant.recordWorkflow(session.id, {
        sourceMessageId: source.id,
        sourceToolCallId: "test-proposal",
        kind: "connection_setup",
        payload: { status: "ready", proposal: { name: "Analytics" } },
      });
      assistant.updateWorkflow(session.id, workflow.id, {
        status: "waiting_for_user",
        subject: { kind: "connection", id: "analytics" },
        outcome: {
          phase: "prepared",
          connectorId: "analytics",
          variantId: "api-key",
          credentialKind: "api-key",
          ceremony: { state: "failed", retryable: true },
          connectionTest: {
            status: "failed",
            kind: "api-read",
            tool: "list_websites",
            method: "GET",
            authentication: "Authorization: raw key",
            endpoint: "https://api.example.test/api/websites",
            checkedAt: "2026-09-07T16:00:00Z",
            error: "405 GET method not allowed [redacted]",
          },
        },
      });
      const continuation = await assistant.continueConnectionWorkflow(
        session.id,
        workflow.id,
      );
      expect(continuation).toBeDefined();
      await continuation?.text();
      const prompt = JSON.stringify(model.doStreamCalls[1]?.prompt);
      expect(prompt).toContain("connection test failed");
      expect(prompt).toContain("list_websites");
      expect(prompt).toContain("https://api.example.test/api/websites");
      expect(prompt).toContain("405 GET method not allowed");
      expect(prompt).toContain("Authorization: raw key");
      expect(prompt).toContain("untrusted");
      expect(prompt).not.toContain("setup completed successfully");
      expect(assistant.getWorkflow(session.id, workflow.id)?.status).toBe(
        "waiting_for_user",
      );
    } finally {
      local.close();
    }
  });

  test("exposes only normalized retryable connection failure state on a later turn", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const secret = "secret-provider-detail";
      const model = new MockLanguageModelV4({
        doStream: [
          responseStream("Use the connection card."),
          responseStream("The setup failed and can be retried."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });
      const session = assistant.createSession();
      await (
        await assistant.respond(session.id, userMessage("Connect Fixture API"))
      ).text();
      const sourceMessage = assistant.getSession(session.id)?.messages.at(-1);
      if (!sourceMessage) throw new Error("Expected a source message");
      const workflow = assistant.recordWorkflow(session.id, {
        sourceMessageId: sourceMessage.id,
        sourceToolCallId: "connection-proposal-failed",
        kind: "connection_setup",
        payload: { status: "ready", proposal: { name: "Fixture API" } },
      });
      assistant.updateWorkflow(session.id, workflow.id, {
        status: "waiting_for_user",
        subject: { kind: "connection", id: "fixture-api" },
        outcome: {
          phase: "prepared",
          connectorId: "fixture-api",
          variantId: "api-key",
          credentialKind: "api-key",
          ceremony: { state: "failed", retryable: true },
        },
        error: `Provider rejected ${secret}`,
      });

      await (
        await assistant.respond(session.id, userMessage("What should I do?"))
      ).text();

      const prompt = JSON.stringify(model.doStreamCalls[1]?.prompt);
      expect(prompt).toContain("connector workflow state: failed");
      expect(prompt).toContain("Retryable: yes");
      expect(prompt).toContain("fixture-api");
      expect(prompt).not.toContain(secret);
      expect(prompt).not.toContain("Provider rejected");
    } finally {
      local.close();
    }
  });

  test("retains the request and cadence question after oversized tool research", () => {
    const messages = [
      {
        id: "request",
        role: "user" as const,
        metadata: { turnId: "research" },
        parts: [
          {
            type: "text" as const,
            text: "Create a Neon API usage report with match rate",
          },
        ],
      },
      {
        id: "research",
        role: "assistant" as const,
        metadata: { turnId: "research" },
        parts: [
          {
            type: "dynamic-tool" as const,
            toolName: "query",
            toolCallId: "query-1",
            state: "output-available" as const,
            input: {},
            output: { rows: "x".repeat(124_000) },
          },
          {
            type: "text" as const,
            text: "Use property_data_api_usage_events. What cadence?",
          },
        ],
      },
      {
        id: "followup",
        role: "user" as const,
        metadata: { turnId: "followup" },
        parts: [{ type: "text" as const, text: "yes, daily at 8AM" }],
      },
    ];
    const context = selectAssistantContext(messages);
    const serialized = JSON.stringify(context);
    expect(serialized).toContain("Create a Neon API usage report");
    expect(serialized).toContain(
      "property_data_api_usage_events. What cadence?",
    );
    expect(serialized).toContain("yes, daily at 8AM");
    expect(serialized.length).toBeLessThan(120_000);
    expect(JSON.stringify(messages)).toContain("x".repeat(124_000));
  });

  test("context compaction preserves pending tool approvals", () => {
    const pending = {
      type: "dynamic-tool" as const,
      toolName: "write",
      toolCallId: "pending",
      state: "approval-requested" as const,
      input: { action: "write" },
      approval: { id: "approval-1" },
    };
    const context = selectAssistantContext(
      [
        {
          id: "assistant",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "read",
              toolCallId: "completed",
              state: "output-available",
              input: {},
              output: "x".repeat(3000),
            },
            pending,
            { type: "text", text: "Please approve the write" },
          ],
        },
      ],
      40,
      2000,
    );
    expect(context[0]?.parts).toContainEqual(pending);
    expect(JSON.stringify(context)).not.toContain("x".repeat(3000));
    expect(JSON.stringify(context)).toContain("Please approve the write");
  });

  test("keeps full durable history while bounding recent model context by turn", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          responseStream("answer-alpha"),
          responseStream("answer-beta"),
          responseStream("answer-gamma"),
          responseStream("answer-delta"),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        maxContextMessages: 3,
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });
      const session = assistant.createSession();

      for (const question of [
        "question-alpha",
        "question-beta",
        "question-gamma",
        "question-delta",
      ]) {
        await (
          await assistant.respond(session.id, userMessage(question))
        ).text();
      }

      const fourthPrompt = JSON.stringify(model.doStreamCalls[3]?.prompt);
      expect(fourthPrompt).not.toContain("question-alpha");
      expect(fourthPrompt).not.toContain("question-beta");
      expect(fourthPrompt).toContain("question-gamma");
      expect(fourthPrompt).toContain("answer-gamma");
      expect(fourthPrompt).toContain("question-delta");
      expect(assistant.getSession(session.id)?.messages).toHaveLength(8);
    } finally {
      local.close();
    }
  });

  test("rejects a concurrent send without creating another durable turn", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model: new MockLanguageModelV4({
            doStream: responseStream("Only one answer.", false, 20),
          }),
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });
      const session = assistant.createSession();
      const firstResponse = await assistant.respond(
        session.id,
        userMessage("First request"),
      );

      await expect(
        assistant.respond(session.id, userMessage("Concurrent request")),
      ).rejects.toThrow("A response is already in progress");
      await firstResponse.text();

      expect(assistant.getSession(session.id)).toMatchObject({
        session: { activeTurnId: null },
        turns: [{ status: "completed" }],
      });
      expect(assistant.getSession(session.id)?.messages).toHaveLength(2);
    } finally {
      local.close();
    }
  });

  test("finishes persistence without requiring the client to drain the response", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: responseStream("Durable after disconnect.", false, 5),
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });
      const session = assistant.createSession();

      const response = await assistant.respond(
        session.id,
        userMessage("Keep going if I leave"),
      );
      // Deliberately never consume response.body, as if the browser disconnected.
      await waitFor(
        () => assistant.getSession(session.id)?.messages.length === 2,
      );

      const detail = assistant.getSession(session.id);
      expect(detail?.session.activeTurnId).toBeNull();
      expect(detail?.messages.map((message) => message.role)).toEqual([
        "user",
        "assistant",
      ]);
      expect(
        detail?.messages[1]?.parts.find((part) => part.type === "text"),
      ).toMatchObject({ type: "text", text: "Durable after disconnect." });
      await response.body?.cancel();
    } finally {
      local.close();
    }
  });

  test("aborts active work and persists a user cancellation", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model: new MockLanguageModelV4({
            doStream: responseStream("This should be interrupted.", false, 50),
          }),
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });
      const session = assistant.createSession();
      const response = await assistant.respond(
        session.id,
        userMessage("Stop this response"),
      );

      await waitFor(
        () =>
          new SqliteModelCallStore(local.db).list(
            "chat",
            assistant.getSession(session.id)?.turns[0]?.id ?? "missing",
          ).length === 1,
      );
      expect(assistant.cancelSession(session.id)).toBe(true);
      await response.text().catch(() => "aborted");
      await waitFor(
        () =>
          assistant.getSession(session.id)?.turns[0]?.status === "cancelled",
      );

      const detail = assistant.getSession(session.id);
      const turnId = detail?.turns[0]?.id;
      expect(detail).toMatchObject({
        session: { activeTurnId: null },
        turns: [{ status: "cancelled", error: null }],
      });
      expect(turnId).toBeString();
      if (!turnId) throw new Error("Expected a cancelled turn ID");
      expect(
        new SqliteModelCallStore(local.db).list("chat", turnId),
      ).toMatchObject([
        { status: "cancelled", error: "Assistant model call cancelled" },
      ]);
      expect(assistant.cancelSession(session.id)).toBe(false);
    } finally {
      local.close();
    }
  });

  test("bounds completed output before writing durable history", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: responseStream("x".repeat(300_000)),
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });
      const session = assistant.createSession();

      await (
        await assistant.respond(
          session.id,
          userMessage("Give me a long answer"),
        )
      ).text();

      const assistantMessage = assistant.getSession(session.id)?.messages[1];
      expect(JSON.stringify(assistantMessage?.parts).length).toBeLessThan(
        256_000,
      );
      expect(JSON.stringify(assistantMessage?.parts)).toContain(
        "Response truncated in durable history",
      );
    } finally {
      local.close();
    }
  });

  test("continues tool use until the model returns a text answer", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          ...Array.from({ length: 13 }, (_, index) =>
            toolCallStream("lookup", `lookup-${index + 1}`),
          ),
          responseStream("The final answer uses the gathered results."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            lookup: tool({
              description: "Look up a fact.",
              inputSchema: z.object({}),
              execute: async () => ({ fact: "enough information" }),
            }),
          },
        }),
      });
      const session = assistant.createSession();

      const response = await assistant.respond(
        session.id,
        userMessage("Look this up and answer"),
      );

      expect(await response.text()).toContain(
        "The final answer uses the gathered results.",
      );
      expect(model.doStreamCalls).toHaveLength(14);
      expect(model.doStreamCalls[13]?.toolChoice).not.toEqual({ type: "none" });
      expect(assistant.getSession(session.id)?.turns).toMatchObject([
        { status: "completed", error: null },
      ]);
    } finally {
      local.close();
    }
  });

  test("tracks parallel image tool models, image counts, tokens, and costs", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          parallelToolCallStream("generate_image", [
            { toolCallId: "image-call-1", input: '{"model":"image-a"}' },
            { toolCallId: "image-call-2", input: '{"model":"image-b"}' },
          ]),
          responseStream("Here are the images."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-chat-model",
          tools: {
            generate_image: tool({
              description: "Generate an image.",
              inputSchema: z.object({ model: z.string() }),
              execute: async ({ model }) => ({
                content: ["Generated one image."],
                structuredContent: { artifacts: [] },
                usage: {
                  operation: "image_generation" as const,
                  provider: "openrouter",
                  modelId: model,
                  billing: "metered" as const,
                  imageCount: 1,
                  inputTokens: 20,
                  outputTokens: 80,
                  totalTokens: 100,
                  actualCostUsdMicros: 4_600,
                  costUsdMicros: 4_600,
                  costSource: "provider_reported" as const,
                },
              }),
            }),
          },
        }),
      });
      const session = assistant.createSession();

      await (
        await assistant.respond(session.id, userMessage("Create an image"))
      ).text();

      const detail = assistant.getSession(session.id);
      expect(detail?.turns[0]?.usage).toMatchObject({
        actualCostUsdMicros: 9_200,
        imageGenerations: [
          {
            provider: "openrouter",
            modelId: "image-a",
            imageCount: 1,
            totalTokens: 100,
            costUsdMicros: 4_600,
          },
          {
            provider: "openrouter",
            modelId: "image-b",
            imageCount: 1,
            totalTokens: 100,
            costUsdMicros: 4_600,
          },
        ],
      });
    } finally {
      local.close();
    }
  });

  test("returns chat artifacts and removes unreferenced blobs with the session", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const artifacts = new SqliteRunArtifactRepository(local.db);
      const deleted: string[] = [];
      const assistant = new AiSdkAssistant(local.db, {
        artifacts,
        artifactBlobs: {
          get: async () => undefined,
          put: async () => {
            throw new Error("Unexpected attachment write");
          },
          delete: async (sha256) => {
            deleted.push(sha256);
          },
        },
        loadRuntime: async () => ({
          model: new MockLanguageModelV4({
            doStream: responseStream("Here is the image."),
          }),
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });
      const session = assistant.createSession();
      await (
        await assistant.respond(session.id, userMessage("Create an image"))
      ).text();
      const turnId = assistant.getSession(session.id)?.turns[0]?.id;
      if (!turnId) throw new Error("Expected a chat turn");
      const sha256 = "c".repeat(64);
      const artifact = artifacts.create({
        owner: { kind: "chat_turn", id: turnId },
        captureKey: "image-call-1:0",
        sha256,
        mediaType: "image/png",
        byteSize: 100,
      });

      expect(assistant.getSession(session.id)?.artifacts).toMatchObject([
        { id: artifact.id, turnId },
      ]);

      assistant.archiveSession(session.id);
      await assistant.deleteSession(session.id);

      expect(artifacts.get(artifact.id)).toBeUndefined();
      expect(deleted).toEqual([sha256]);
    } finally {
      local.close();
    }
  });

  test("measures how long each tool call took so the turn can report it", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream("lookup", "call-1"),
          toolCallStream("lookup", "call-2"),
          responseStream("Both lookups are in."),
        ],
      });
      // A clock that advances one second per read: the first tool call takes
      // a couple of ticks, the second a couple more.
      let tick = 0;
      const assistant = new AiSdkAssistant(local.db, {
        now: () => new Date(Date.UTC(2026, 7, 15, 10, 0, tick++)),
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            lookup: tool({
              description: "Look up a fact.",
              inputSchema: z.object({}),
              execute: async () => ({ fact: "enough information" }),
            }),
          },
        }),
      });
      const session = assistant.createSession();

      const response = await assistant.respond(
        session.id,
        userMessage("Look this up twice"),
      );
      await response.text();

      const [turn] = assistant.getSession(session.id)?.turns ?? [];
      expect(turn?.toolCalls.map((call) => call.toolCallId)).toEqual([
        "call-1",
        "call-2",
      ]);
      expect(turn?.toolCalls.map((call) => call.toolName)).toEqual([
        "lookup",
        "lookup",
      ]);
      for (const call of turn?.toolCalls ?? []) {
        expect(call.status).toBe("succeeded");
        expect(call.finishedAt).not.toBeNull();
        expect(
          (call.finishedAt?.getTime() ?? 0) - call.startedAt.getTime(),
        ).toBeGreaterThan(0);
      }
    } finally {
      local.close();
    }
  });

  test("exposes one complete application tool set on every step", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const calls: string[] = [];
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream(
            "get_run",
            "get-run",
            JSON.stringify({ runId: "run-1" }),
          ),
          responseStream("The run failed after its connector expired."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            get_run: tool({
              description: "Get a run.",
              inputSchema: z.object({ runId: z.string() }),
              execute: async () => {
                calls.push("get-run");
                return { status: "failed", reason: "expired" };
              },
            }),
            list_tasks: tool({
              description: "List tasks.",
              inputSchema: z.object({}),
              execute: async () => ({ tasks: [] }),
            }),
          },
        }),
      });
      const session = assistant.createSession();

      await (
        await assistant.respond(session.id, userMessage("Diagnose run 1"))
      ).text();

      const firstTools = model.doStreamCalls[0]?.tools?.flatMap((entry) =>
        "name" in entry ? [entry.name] : [],
      );
      const secondTools = model.doStreamCalls[1]?.tools?.flatMap((entry) =>
        "name" in entry ? [entry.name] : [],
      );
      expect(firstTools).toEqual(secondTools);
      expect(firstTools).toContain("get_run");
      expect(firstTools).toContain("list_tasks");
      expect(calls).toEqual(["get-run"]);
    } finally {
      local.close();
    }
  });

  test("exposes connector proposal schemas on every step", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream(
            "inspect_connector_source",
            "inspect-before-proposal",
            JSON.stringify({ url: "https://example.com/connector" }),
          ),
          responseStream("The evidence is sufficient for a proposal."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            inspect_connector_source: tool({
              description: "Inspect source evidence.",
              inputSchema: z.object({ url: z.url() }),
              execute: async () => ({ content: "Official connector docs" }),
            }),
            propose_connection: tool({
              description: "Propose a verified connection.",
              inputSchema: z.object({ name: z.string() }),
              execute: async () => ({ status: "ready" }),
            }),
          },
        }),
      });
      const session = assistant.createOrResumeSession({
        context: {
          version: 1,
          intent: "connection.create",
          origin: "connections",
          subjects: [],
        },
      });

      await (
        await assistant.respond(session.id, userMessage("Connect Example"))
      ).text();

      const firstTools = model.doStreamCalls[0]?.tools?.flatMap((entry) =>
        "name" in entry ? [entry.name] : [],
      );
      const secondTools = model.doStreamCalls[1]?.tools?.flatMap((entry) =>
        "name" in entry ? [entry.name] : [],
      );
      expect(firstTools).toContain("propose_connection");
      expect(secondTools).toContain("propose_connection");
    } finally {
      local.close();
    }
  });

  test("does not impose connector research call quotas", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      let inspections = 0;
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallsStream([
            ...Array.from({ length: 5 }, (_, index) => ({
              toolName: "inspect_connector_source",
              toolCallId: `inspect-${index}`,
              input: JSON.stringify({
                url: `https://example.com/connector/${index}`,
              }),
            })),
            {
              toolName: "inspect_connector_source",
              toolCallId: "inspect-duplicate",
              input: JSON.stringify({
                url: "https://example.com/connector/0",
              }),
            },
          ]),
          responseStream(
            "I used the first inspection and skipped the duplicate.",
          ),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            inspect_connector_source: tool({
              description: "Inspect a connector source.",
              inputSchema: z.object({ url: z.url() }),
              execute: async () => {
                inspections += 1;
                return { content: "evidence" };
              },
            }),
          },
        }),
      });
      const session = assistant.createOrResumeSession({
        context: {
          version: 1,
          intent: "connection.create",
          origin: "connections",
          subjects: [],
        },
      });

      await (
        await assistant.respond(session.id, userMessage("Connect Example"))
      ).text();

      expect(inspections).toBe(6);
      const messages = JSON.stringify(
        assistant.getSession(session.id)?.messages,
      );
      expect(messages).not.toContain("connector source-call budget");
    } finally {
      local.close();
    }
  });

  test("keeps the latest exact connector evidence in model context", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream(
            "inspect_connector_source",
            "inspect-large-source",
            JSON.stringify({ url: "https://example.com/connector" }),
          ),
          toolCallStream("propose_local_mcp", "propose-connector"),
          responseStream("The connector proposal is ready to review."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            inspect_connector_source: tool({
              description: "Inspect a connector source.",
              inputSchema: z.object({ url: z.url() }),
              execute: async () => ({
                content: `BEGIN-${"x".repeat(8_000)}-END-OF-EVIDENCE`,
                npmPackages: ["@example/connector"],
              }),
            }),
            propose_local_mcp: tool({
              description: "Propose a local MCP connector.",
              inputSchema: z.object({}),
              execute: async () => ({
                status: "ready",
                proposal: { id: "example-connector" },
              }),
            }),
          },
        }),
      });
      const session = assistant.createOrResumeSession({
        context: {
          version: 1,
          intent: "connection.create",
          origin: "connections",
          subjects: [],
        },
      });

      await (
        await assistant.respond(session.id, userMessage("Connect Example"))
      ).text();

      const finalPrompt = JSON.stringify(model.doStreamCalls[2]?.prompt);
      expect(finalPrompt).not.toContain(
        "Connector evidence truncated by Springroll",
      );
      expect(finalPrompt).toContain("@example/connector");
      expect(finalPrompt).toContain("END-OF-EVIDENCE");
      expect(
        JSON.stringify(assistant.getSession(session.id)?.messages),
      ).toContain("END-OF-EVIDENCE");
    } finally {
      local.close();
    }
  });

  test("does not impose a host-authored proposal retry policy", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream("propose_local_mcp", "invalid-proposal-1"),
          toolCallStream("propose_local_mcp", "invalid-proposal-2"),
          responseStream(
            "The proposal was not created because validation remains unresolved.",
          ),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            propose_local_mcp: tool({
              description: "Propose a local MCP connector.",
              inputSchema: z.object({}),
              execute: async () => ({
                status: "invalid_input",
                issues: [{ path: "sources", message: "Required" }],
              }),
            }),
          },
        }),
      });
      const session = assistant.createSession();

      const response = await assistant.respond(
        session.id,
        userMessage("Connect Microsoft Clarity"),
      );

      expect(await response.text()).toContain("proposal was not created");
      expect(model.doStreamCalls).toHaveLength(3);
      expect(model.doStreamCalls[2]?.toolChoice).toEqual({ type: "auto" });
      expect(JSON.stringify(model.doStreamCalls[2]?.prompt)).not.toContain(
        "Two connector proposal attempts failed host validation",
      );
    } finally {
      local.close();
    }
  });

  test("allows one corrected retry after duplicate validation failures in one model step", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      let executions = 0;
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallsStream([
            {
              toolName: "propose_local_mcp",
              toolCallId: "duplicate-invalid-1",
            },
            {
              toolName: "propose_local_mcp",
              toolCallId: "duplicate-invalid-2",
            },
          ]),
          toolCallStream("propose_local_mcp", "corrected-proposal"),
          responseStream(
            "The corrected connector proposal is ready to review.",
          ),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            propose_local_mcp: tool({
              description: "Propose a local MCP connector.",
              inputSchema: z.object({}),
              execute: async () => {
                executions += 1;
                return executions <= 2
                  ? {
                      status: "invalid_input",
                      issues: [{ path: "guidanceSteps", message: "Required" }],
                    }
                  : { status: "ready", proposal: { id: "clarity" } };
              },
            }),
          },
        }),
      });
      const session = assistant.createSession();

      const response = await assistant.respond(
        session.id,
        userMessage("Connect Microsoft Clarity"),
      );

      expect(await response.text()).toContain("proposal is ready to review");
      expect(executions).toBe(3);
      expect(model.doStreamCalls).toHaveLength(3);
      expect(model.doStreamCalls[1]?.toolChoice).not.toEqual({ type: "none" });
    } finally {
      local.close();
    }
  });

  test("projects proposal tool output into durable workflow state", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream("propose_task", "proposal-call-1"),
          responseStream("Review the recipe proposal below."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        workflowTools: { propose_task: "connection_setup" },
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            propose_task: tool({
              description: "Draft a recipe.",
              inputSchema: z.object({}),
              execute: async () => ({
                status: "ready",
                proposal: { title: "Morning briefing" },
              }),
            }),
          },
        }),
      });
      const session = assistant.createSession();

      await (
        await assistant.respond(session.id, userMessage("Draft a briefing"))
      ).text();

      expect(assistant.getSession(session.id)?.workflows).toMatchObject([
        {
          sessionId: session.id,
          sourceToolCallId: "proposal-call-1",
          kind: "connection_setup",
          status: "proposed",
          payload: {
            status: "ready",
            proposal: { title: "Morning briefing" },
          },
        },
      ]);
    } finally {
      local.close();
    }
  });

  test("projects one workflow for duplicate ready proposals in one model step", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallsStream([
            {
              toolName: "propose_local_mcp",
              toolCallId: "duplicate-ready-1",
            },
            {
              toolName: "propose_local_mcp",
              toolCallId: "duplicate-ready-2",
            },
          ]),
          responseStream("Review the connector proposal below."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        workflowTools: {
          propose_local_mcp: "connection_setup",
        },
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            propose_local_mcp: tool({
              description: "Propose a local MCP connector.",
              inputSchema: z.object({}),
              execute: async () => ({
                status: "ready",
                proposal: { templateId: "clarity" },
              }),
            }),
          },
        }),
      });
      const session = assistant.createSession();

      await (
        await assistant.respond(session.id, userMessage("Connect Clarity"))
      ).text();

      expect(assistant.getSession(session.id)?.workflows).toHaveLength(1);
      expect(assistant.getSession(session.id)?.workflows[0]).toMatchObject({
        sourceToolCallId: "duplicate-ready-1",
        kind: "connection_setup",
        payload: {
          status: "ready",
          proposal: { templateId: "clarity" },
        },
      });
    } finally {
      local.close();
    }
  });

  test.each([false, true])(
    "backfills workflow state from durable proposal messages (dynamic: %s)",
    (dynamic) => {
      const local = openLocalDatabase({ filename: ":memory:" });
      try {
        const chat = new SqliteChatStore(local.db);
        const session = chat.createSession({ id: "chat-before-workflows" });
        chat.appendMessage({
          id: "proposal-message",
          sessionId: session.id,
          role: "assistant",
          parts: [
            {
              type: "tool-research_connection",
              toolCallId: "connection-miss-1",
              state: "output-available",
              input: { intent: "Connect Neon" },
              output: {
                status: "not_found",
                title: "No remote connector",
                explanation: "Continue researching.",
              },
            },
            {
              type: dynamic ? "dynamic-tool" : "tool-propose_local_mcp",
              ...(dynamic ? { toolName: "propose_local_mcp" } : {}),
              toolCallId: "connection-call-1",
              state: "output-available",
              input: { intent: "Connect Neon" },
              output: dynamic
                ? {
                    structuredContent: {
                      status: "ready",
                      proposal: { name: "Neon" },
                    },
                    content: [],
                  }
                : { status: "ready", proposal: { name: "Neon" } },
            },
          ],
        });

        const assistant = new AiSdkAssistant(local.db, {
          workflowTools: {
            research_connection: "connection_setup",
            propose_local_mcp: "connection_setup",
          },
          loadRuntime: async () => ({
            model: new MockLanguageModelV4(),
            provider: "mock-provider",
            modelId: "mock-model-id",
          }),
        });

        expect(assistant.getSession(session.id)?.workflows).toMatchObject([
          {
            sourceMessageId: "proposal-message",
            sourceToolCallId: "connection-call-1",
            kind: "connection_setup",
            status: "proposed",
            payload: { status: "ready", proposal: { name: "Neon" } },
          },
        ]);
      } finally {
        local.close();
      }
    },
  );

  test("strips every AI SDK provider metadata rail from durable tool parts", () => {
    const parts = toDurableChatParts([
      {
        type: "tool-example",
        toolCallId: "call-1",
        state: "output-available",
        input: { query: "weather" },
        output: { content: ["safe result"] },
        providerMetadata: { openrouter: { reasoning: "private-1" } },
        callProviderMetadata: { openrouter: { reasoning: "private-2" } },
        resultProviderMetadata: { openrouter: { reasoning: "private-3" } },
        providerOptions: { openrouter: { reasoning_details: ["private-4"] } },
      },
    ]);

    const encoded = JSON.stringify(parts);
    expect(encoded).toContain("safe result");
    expect(encoded).not.toContain("ProviderMetadata");
    expect(encoded).not.toContain("providerMetadata");
    expect(encoded).not.toContain("providerOptions");
    expect(encoded).not.toContain("private-");
  });

  test("scrubs legacy provider metadata already stored in chat history", () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const chat = new SqliteChatStore(local.db);
      const session = chat.createSession();
      const turn = chat.createTurn(session.id);
      chat.appendMessage({
        sessionId: session.id,
        turnId: turn.id,
        role: "assistant",
        parts: [
          {
            type: "tool-example",
            callProviderMetadata: {
              openrouter: { reasoning: "legacy private reasoning" },
            },
          },
        ],
      });
      expect(JSON.stringify(chat.listMessages(session.id))).toContain(
        "legacy private reasoning",
      );

      new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model: new MockLanguageModelV4(),
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });

      expect(JSON.stringify(chat.listMessages(session.id))).not.toContain(
        "ProviderMetadata",
      );
      expect(JSON.stringify(chat.listMessages(session.id))).not.toContain(
        "legacy private reasoning",
      );
    } finally {
      local.close();
    }
  });

  test("persists a visible failure when a model stops without text", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model: new MockLanguageModelV4({ doStream: emptyResponseStream() }),
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });
      const session = assistant.createSession();

      await (
        await assistant.respond(session.id, userMessage("Please answer"))
      ).text();

      const detail = assistant.getSession(session.id);
      expect(detail?.turns).toMatchObject([
        {
          status: "failed",
          error: "Assistant stopped without an answer (stop)",
        },
      ]);
      expect(JSON.stringify(detail?.messages)).toContain(
        "I stopped before producing an answer. Please try again.",
      );
    } finally {
      local.close();
    }
  });

  test("does not count narration before a tool call as a terminal answer", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          narratedToolCallStream(
            "I found the documentation. Checking it now.",
            "lookup",
            "lookup-1",
          ),
          emptyResponseStream(),
          responseStream(
            "The lookup found the document. Here is what it says.",
          ),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            lookup: tool({
              description: "Look up documentation.",
              inputSchema: z.object({}),
              execute: async () => ({ found: true }),
            }),
          },
        }),
      });
      const session = assistant.createSession();

      await (
        await assistant.respond(session.id, userMessage("Check the docs"))
      ).text();

      const detail = assistant.getSession(session.id);
      expect(detail?.turns).toMatchObject([
        { status: "completed", error: null },
      ]);
      const encoded = JSON.stringify(detail?.messages);
      expect(encoded).toContain("The lookup found the document.");
      expect(encoded).not.toContain("I stopped before producing an answer");
    } finally {
      local.close();
    }
  });

  test("synthesizes from tool evidence when the model stream fails", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      let calls = 0;
      const model = new MockLanguageModelV4({
        doStream: async () => {
          calls += 1;
          if (calls === 1) return toolCallStream("lookup", "lookup-1");
          if (calls === 2) {
            throw new APICallError({
              message: "Bad Request Error",
              url: "https://openrouter.ai/api/v1/chat/completions",
              requestBodyValues: {},
              statusCode: 502,
              isRetryable: false,
              data: {
                error: { message: "Gemini stream ended without a candidate" },
              },
            });
          }
          return responseStream(
            "The lookup succeeded. Pewaukee is a residential address.",
          );
        },
      });
      const assistant = new AiSdkAssistant(local.db, {
        maxRetries: 0,
        loadRuntime: async () => ({
          model,
          provider: "openrouter",
          modelId: "google/gemini-3.6-flash",
          tools: {
            lookup: tool({
              description: "Look up a fact.",
              inputSchema: z.object({}),
              execute: async () => ({ address: "residential" }),
            }),
          },
        }),
      });
      const session = assistant.createSession();

      await (
        await assistant.respond(
          session.id,
          userMessage("What is this address?"),
        )
      ).text();

      const detail = assistant.getSession(session.id);
      expect(detail?.turns).toMatchObject([
        { status: "completed", error: null },
      ]);
      expect(JSON.stringify(detail?.messages)).toContain(
        "Pewaukee is a residential address",
      );
    } finally {
      local.close();
    }
  });

  test("wraps up on the last allowed step instead of calling more tools", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream("lookup", "lookup-1"),
          toolCallStream("lookup", "lookup-2"),
          responseStream("Two lookups were enough. Here is the answer."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        maxSteps: 3,
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            lookup: tool({
              description: "Look up a fact.",
              inputSchema: z.object({}),
              execute: async () => ({ fact: "enough" }),
            }),
          },
        }),
      });
      const session = assistant.createSession();

      await (
        await assistant.respond(session.id, userMessage("Look this up"))
      ).text();

      expect(model.doStreamCalls).toHaveLength(3);
      expect(model.doStreamCalls[2]?.toolChoice).toEqual({ type: "none" });
      expect(JSON.stringify(model.doStreamCalls[2]?.prompt)).toContain(
        "This conversation turn has reached its step boundary",
      );
      expect(assistant.getSession(session.id)?.turns).toMatchObject([
        { status: "completed", error: null },
      ]);
    } finally {
      local.close();
    }
  });

  test("persists the provider error when a model stream fails", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const assistant = new AiSdkAssistant(local.db, {
        maxRetries: 0,
        loadRuntime: async () => ({
          model: new MockLanguageModelV4({
            doStream: async () => {
              throw new APICallError({
                message: "Bad Request Error",
                url: "https://openrouter.ai/api/v1/chat/completions",
                requestBodyValues: { apiKey: "sk-secret" },
                statusCode: 502,
                isRetryable: false,
                data: {
                  error: {
                    message: "Gemini stream ended without a candidate",
                  },
                },
              });
            },
          }),
          provider: "openrouter",
          modelId: "google/gemini-3.6-flash",
        }),
      });
      const session = assistant.createSession();

      await (
        await assistant.respond(session.id, userMessage("Please answer"))
      ).text();

      const detail = assistant.getSession(session.id);
      expect(detail?.turns).toMatchObject([
        {
          status: "failed",
          error: "Gemini stream ended without a candidate (HTTP 502)",
        },
      ]);
      expect(JSON.stringify(detail?.messages)).toContain(
        "I couldn't finish that response. Gemini stream ended without a candidate (HTTP 502)",
      );
      expect(JSON.stringify(detail)).not.toContain("sk-secret");
      const turnId = detail?.turns[0]?.id;
      expect(turnId).toBeString();
      if (!turnId) throw new Error("Expected a persisted turn ID");
      expect(
        new SqliteModelCallStore(local.db).list("chat", turnId),
      ).toMatchObject([
        {
          status: "failed",
          error: "Gemini stream ended without a candidate (HTTP 502)",
        },
      ]);
    } finally {
      local.close();
    }
  });

  test("completes a turn when the model recovers from a failed tool", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream("unreliable_lookup", "lookup-1"),
          responseStream("The lookup failed, but here is what I can tell you."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            unreliable_lookup: tool({
              description: "A lookup that may fail.",
              inputSchema: z.object({}),
              execute: async (): Promise<{ ok: boolean }> => {
                throw new Error("Remote lookup unavailable");
              },
            }),
          },
        }),
      });
      const session = assistant.createSession();

      const response = await assistant.respond(
        session.id,
        userMessage("Try the lookup"),
      );

      expect(await response.text()).toContain(
        "The lookup failed, but here is what I can tell you.",
      );
      expect(assistant.getSession(session.id)?.turns).toMatchObject([
        { status: "completed", error: null },
      ]);
    } finally {
      local.close();
    }
  });

  test("persists an approval request across restart and resumes the exact tool call", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const executed: unknown[] = [];
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream(
            "change_record",
            "change-1",
            JSON.stringify({ value: "server-owned-input" }),
          ),
          responseStream("The approved change completed."),
        ],
      });
      const loadRuntime = async () => ({
        model,
        provider: "mock-provider",
        modelId: "mock-model-id",
        tools: {
          change_record: tool({
            description: "Change a remote record.",
            inputSchema: z.object({ value: z.string() }),
            needsApproval: true,
            execute: async (input: { value: string }) => {
              executed.push(input);
              return { changed: true };
            },
          }),
        },
        approvalPolicies: {
          change_record: { riskEffect: "write" as const },
        },
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime,
      });
      const session = assistant.createSession();

      await (
        await assistant.respond(session.id, userMessage("Change the record"))
      ).text();
      const pending = assistant.getSession(session.id);
      const approvalPart = pending?.messages
        .at(-1)
        ?.parts.find(
          (part) => "state" in part && part.state === "approval-requested",
        );
      const approvalId =
        approvalPart &&
        "approval" in approvalPart &&
        typeof approvalPart.approval?.id === "string"
          ? approvalPart.approval.id
          : undefined;
      expect(approvalId).toBeString();
      expect(pending).toMatchObject({
        session: { activeTurnId: expect.any(String) },
        turns: [{ status: "waiting_for_user" }],
        approvals: [
          {
            id: approvalId,
            status: "pending",
            toolCallId: "change-1",
            toolName: "change_record",
            input: { value: "server-owned-input" },
            riskEffect: "write",
          },
        ],
      });
      expect(executed).toHaveLength(0);

      const restored = new AiSdkAssistant(local.db, {
        loadRuntime,
      });
      expect(restored.getSession(session.id)?.turns).toMatchObject([
        { status: "waiting_for_user" },
      ]);
      await expect(
        restored.respond(session.id, {
          approvals: [{ id: "not-the-persisted-id", approved: true }],
        }),
      ).rejects.toThrow("Unknown pending assistant approval");
      if (!approvalId) throw new Error("Expected a durable approval ID");

      const response = await restored.respond(session.id, {
        approvals: [{ id: approvalId, approved: true }],
      });
      expect(await response.text()).toContain("approved change completed");
      const completed = restored.getSession(session.id);
      expect(executed).toEqual([{ value: "server-owned-input" }]);
      expect(completed?.messages).toHaveLength(2);
      expect(completed).toMatchObject({
        session: { activeTurnId: null },
        turns: [{ status: "completed" }],
        approvals: [
          {
            id: approvalId,
            status: "succeeded",
            outcome: { state: "output-available" },
          },
        ],
      });
      expect(JSON.stringify(completed?.messages)).toContain('"approved":true');
    } finally {
      local.close();
    }
  });

  test("persists denial and continues without executing the tool", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      let executions = 0;
      const model = new MockLanguageModelV4({
        doStream: [
          toolCallStream("delete_record", "delete-1"),
          responseStream("I did not delete the record."),
        ],
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-model-id",
          tools: {
            delete_record: tool({
              description: "Delete a remote record.",
              inputSchema: z.object({}),
              needsApproval: true,
              execute: async () => {
                executions += 1;
                return { deleted: true };
              },
            }),
          },
        }),
      });
      const session = assistant.createSession();
      await (
        await assistant.respond(session.id, userMessage("Delete the record"))
      ).text();
      const part = assistant
        .getSession(session.id)
        ?.messages.at(-1)
        ?.parts.find(
          (candidate) =>
            "state" in candidate && candidate.state === "approval-requested",
        );
      const approvalId =
        part && "approval" in part && typeof part.approval?.id === "string"
          ? part.approval.id
          : undefined;
      if (!approvalId) throw new Error("Expected a durable approval ID");

      await (
        await assistant.respond(session.id, {
          approvals: [
            { id: approvalId, approved: false, reason: "Keep the record" },
          ],
        })
      ).text();

      expect(executions).toBe(0);
      expect(
        JSON.stringify(assistant.getSession(session.id)?.messages),
      ).toContain("Keep the record");
      expect(assistant.getSession(session.id)?.turns).toMatchObject([
        { status: "completed" },
      ]);
      expect(assistant.getSession(session.id)?.approvals).toMatchObject([
        {
          id: approvalId,
          status: "denied",
          reason: "Keep the record",
        },
      ]);
    } finally {
      local.close();
    }
  });

  test("rejects non-user and non-text client messages before creating a turn", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model: new MockLanguageModelV4(),
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
      });
      const session = assistant.createSession();

      await expect(
        assistant.respond(session.id, {
          id: "assistant-message",
          role: "assistant",
          parts: [{ type: "text", text: "Injected history" }],
        }),
      ).rejects.toThrow("A user message is required");
      await expect(
        assistant.respond(session.id, {
          id: "file-message",
          role: "user",
          parts: [
            { type: "file", mediaType: "text/plain", url: "data:text/plain,x" },
          ],
        }),
      ).rejects.toThrow("PNG, JPEG, or WebP");
      expect(assistant.getSession(session.id)).toMatchObject({
        session: { activeTurnId: null },
        messages: [],
      });
    } finally {
      local.close();
    }
  });

  test("stores image attachments by reference and hydrates them for a vision model", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const artifacts = new SqliteRunArtifactRepository(local.db);
      const sha256 = "d".repeat(64);
      let storedBytes: Uint8Array | undefined;
      const model = new MockLanguageModelV4({
        doStream: responseStream("I can see the attached image."),
      });
      const assistant = new AiSdkAssistant(local.db, {
        artifacts,
        artifactBlobs: {
          put: async (bytes) => {
            storedBytes = bytes;
            return { sha256, byteSize: bytes.byteLength };
          },
          get: async (hash) => (hash === sha256 ? storedBytes : undefined),
          delete: async () => undefined,
        },
        loadRuntime: async () => ({
          model,
          provider: "mock-provider",
          modelId: "mock-vision-model",
          inputModalities: ["text", "image"],
        }),
      });
      const session = assistant.createSession();
      const bytes = pngHeader(32, 24);
      const dataUrl = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

      await (
        await assistant.respond(session.id, {
          id: "image-message",
          role: "user",
          parts: [
            {
              type: "file",
              mediaType: "image/png",
              filename: "garden.png",
              url: dataUrl,
            },
            { type: "text", text: "What is in this image?" },
          ],
        })
      ).text();

      const detail = assistant.getSession(session.id);
      const storedMessage = detail?.messages[0];
      expect(JSON.stringify(storedMessage)).not.toContain("data:image");
      expect(storedMessage?.parts).toMatchObject([
        {
          type: "file",
          mediaType: "image/png",
          filename: "garden.png",
          url: expect.stringContaining("/api/artifacts/"),
        },
        { type: "text", text: "What is in this image?" },
      ]);
      expect(detail?.artifacts).toMatchObject([
        {
          title: "garden.png",
          payload: { origin: "attachment", width: 32, height: 24 },
        },
      ]);
      expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain(
        Buffer.from(bytes).toString("base64"),
      );
      const attachmentId = detail?.artifacts[0]?.id;
      if (!attachmentId) throw new Error("Expected an attachment artifact");
      expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain(
        attachmentId,
      );
    } finally {
      local.close();
    }
  });

  test("does not silently substitute a model that cannot read image attachments", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const artifacts = new SqliteRunArtifactRepository(local.db);
      const bytes = pngHeader(16, 16);
      const sha256 = "e".repeat(64);
      const assistant = new AiSdkAssistant(local.db, {
        artifacts,
        artifactBlobs: {
          put: async () => ({ sha256, byteSize: bytes.byteLength }),
          get: async () => bytes,
          delete: async () => undefined,
        },
        loadRuntime: async () => ({
          model: new MockLanguageModelV4(),
          provider: "mock-provider",
          modelId: "mock-text-model",
          inputModalities: ["text"],
        }),
      });
      const session = assistant.createSession();
      const dataUrl = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

      await expect(
        assistant.respond(session.id, {
          id: "image-message",
          role: "user",
          parts: [{ type: "file", mediaType: "image/png", url: dataUrl }],
        }),
      ).rejects.toThrow("cannot read image attachments");

      expect(assistant.getSession(session.id)?.turns.at(-1)).toMatchObject({
        status: "failed",
        error: expect.stringContaining("cannot read image attachments"),
      });
    } finally {
      local.close();
    }
  });

  test("keeps Google-derived titles on the protected conversation model", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const protectedModel = new MockLanguageModelV4({
        doStream: responseStream("Summary of Google mail."),
        doGenerate: {
          content: [{ type: "text", text: "Google Mail Summary" }],
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage,
          warnings: [],
        },
      });
      let distillerLoaded = false;
      const titleSessions: string[] = [];
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async (_selection, context) => {
          if (context?.purpose === "title" && context.sessionId)
            titleSessions.push(context.sessionId);
          return {
            model: protectedModel,
            provider: "openrouter",
            modelId: "openai/gpt-5.4-mini",
            googleDataProtected: true,
          };
        },
        loadDistillerRuntime: async () => {
          distillerLoaded = true;
          throw new Error(
            "Unrestricted distiller must not receive Google data",
          );
        },
      });
      const session = assistant.createSession();
      await (
        await assistant.respond(
          session.id,
          userMessage("Summarize Google mail"),
        )
      ).text();
      await waitFor(
        () =>
          assistant.getSession(session.id)?.session.title ===
          "Google Mail Summary",
      );
      expect(distillerLoaded).toBe(false);
      expect(titleSessions).toContain(session.id);
      expect(protectedModel.doGenerateCalls.length).toBeGreaterThan(0);
    } finally {
      local.close();
    }
  });

  test("generates a concise async title after the first turn completes", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      const mainModel = new MockLanguageModelV4({
        doStream: responseStream("I can help you debug your Hacker News task."),
      });
      const distillerModel = new MockLanguageModelV4({
        doGenerate: {
          content: [{ type: "text", text: "Hacker News Task Debug" }],
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage,
          warnings: [],
        },
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model: mainModel,
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
        loadDistillerRuntime: async () => ({
          model: distillerModel,
          provider: "mock-distiller-provider",
          modelId: "mock-distiller-model",
        }),
      });
      const session = assistant.createSession();
      const response = await assistant.respond(
        session.id,
        userMessage(
          "Can you please help me fix the Hacker News daily task? It failed at 8am.",
        ),
      );
      await response.text();

      await waitFor(() => {
        const detail = assistant.getSession(session.id);
        return detail?.session.title === "Hacker News Task Debug";
      });

      const detail = assistant.getSession(session.id);
      expect(detail?.session.title).toBe("Hacker News Task Debug");
    } finally {
      local.close();
    }
  });

  test("generates a concise async title immediately when prompt arrives before the stream finishes", async () => {
    const local = openLocalDatabase({ filename: ":memory:" });
    try {
      let releaseStream: (() => void) | undefined;
      const streamBlocked = new Promise<void>((resolve) => {
        releaseStream = resolve;
      });
      const mainModel = new MockLanguageModelV4({
        doStream: async () => {
          await streamBlocked;
          return responseStream("Finished after delay.");
        },
      });
      const distillerModel = new MockLanguageModelV4({
        doGenerate: {
          content: [{ type: "text", text: "Hacker News Task Debug" }],
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage,
          warnings: [],
        },
      });
      const assistant = new AiSdkAssistant(local.db, {
        loadRuntime: async () => ({
          model: mainModel,
          provider: "mock-provider",
          modelId: "mock-model-id",
        }),
        loadDistillerRuntime: async () => ({
          model: distillerModel,
          provider: "mock-distiller-provider",
          modelId: "mock-distiller-model",
        }),
      });
      const session = assistant.createSession();
      const response = await assistant.respond(
        session.id,
        userMessage("Can you please help me fix the Hacker News daily task?"),
      );

      await waitFor(() => {
        const detail = assistant.getSession(session.id);
        return detail?.session.title === "Hacker News Task Debug";
      });

      expect(assistant.getSession(session.id)?.session.title).toBe(
        "Hacker News Task Debug",
      );
      releaseStream?.();
      await response.text();
    } finally {
      local.close();
    }
  });

  test("summarizePromptFallback strips conversational filler and limits length", () => {
    expect(
      summarizePromptFallback(
        "Can you please help me fix the Hacker News daily task?",
      ),
    ).toBe("Fix the Hacker News daily task?");
    expect(
      summarizePromptFallback(
        "How do I query my Neon Postgres database for unbilled accounts?",
      ),
    ).toBe("Query my Neon Postgres database for unbilled…");
    expect(summarizePromptFallback("what's the weather in Seattle?")).toBe(
      "The weather in Seattle?",
    );
    expect(summarizePromptFallback("hello")).toBe("Hello");
  });
});

function responseStream(
  text: string,
  includeReasoning = false,
  chunkDelayInMs: number | null = null,
) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        ...(includeReasoning
          ? [
              { type: "reasoning-start" as const, id: "reasoning-1" },
              {
                type: "reasoning-delta" as const,
                id: "reasoning-1",
                delta: "private chain of thought",
              },
              { type: "reasoning-end" as const, id: "reasoning-1" },
            ]
          : []),
        { type: "text-start" as const, id: "text-1" },
        { type: "text-delta" as const, id: "text-1", delta: text },
        { type: "text-end" as const, id: "text-1" },
        {
          type: "finish" as const,
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage,
        },
      ],
      chunkDelayInMs,
    }),
  };
}

function toolCallStream(toolName: string, toolCallId: string, input = "{}") {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        {
          type: "tool-call" as const,
          toolCallId,
          toolName,
          input,
        },
        {
          type: "finish" as const,
          finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
          usage,
        },
      ],
    }),
  };
}

function parallelToolCallStream(
  toolName: string,
  calls: readonly { readonly toolCallId: string; readonly input: string }[],
) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        ...calls.map((call) => ({
          type: "tool-call" as const,
          toolCallId: call.toolCallId,
          toolName,
          input: call.input,
        })),
        {
          type: "finish" as const,
          finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
          usage,
        },
      ],
    }),
  };
}

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function narratedToolCallStream(
  text: string,
  toolName: string,
  toolCallId: string,
  input = "{}",
) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        { type: "text-start" as const, id: "text-1" },
        { type: "text-delta" as const, id: "text-1", delta: text },
        { type: "text-end" as const, id: "text-1" },
        {
          type: "tool-call" as const,
          toolCallId,
          toolName,
          input,
        },
        {
          type: "finish" as const,
          finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
          usage,
        },
      ],
    }),
  };
}

function toolCallsStream(
  calls: readonly {
    readonly toolName: string;
    readonly toolCallId: string;
    readonly input?: string;
  }[],
) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        ...calls.map(({ toolCallId, toolName, input = "{}" }) => ({
          type: "tool-call" as const,
          toolCallId,
          toolName,
          input,
        })),
        {
          type: "finish" as const,
          finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
          usage,
        },
      ],
    }),
  };
}

function emptyResponseStream() {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        {
          type: "finish" as const,
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage,
        },
      ],
    }),
  };
}

function userMessage(text: string) {
  return {
    id: crypto.randomUUID(),
    role: "user" as const,
    parts: [{ type: "text" as const, text }],
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for stream");
    await Bun.sleep(10);
  }
}
