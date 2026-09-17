import { afterEach, describe, expect, test } from "bun:test";
import {
  type Connection,
  type ConnectorManifest,
  OpenRouterModelConnection,
  openLocalDatabase,
  publicFailureMessage,
} from "@springroll/kernel";
import type { ApplicationToolRegistry } from "../src/server/application-tool-registry.ts";
import {
  assertGoogleConnectionAccess,
  GoogleDataProtection,
  isGoogleApiManifest,
  withGoogleDataAccess,
} from "../src/server/google-data-protection.ts";

const databases: ReturnType<typeof openLocalDatabase>[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
function setup() {
  const db = openLocalDatabase({ filename: ":memory:" });
  databases.push(db);
  return { db, policy: new GoogleDataProtection(db.db) };
}
const google: Connection = {
  id: "gmail-user",
  manifestId: "gmail",
  sourceId: "api",
  credentialRef: "google",
  availableIn: ["local"],
};
const external: Connection = { ...google, id: "web", manifestId: "web" };
const model = "openai/gpt-5.4-mini";

describe("Google data isolation", () => {
  test("recognizes custom Workspace endpoints without treating Google AI as a safe connector", () => {
    const manifest = (baseUrl: string) =>
      ({
        id: "custom",
        transport: { kind: "http-api", baseUrl },
      }) as ConnectorManifest;
    expect(
      isGoogleApiManifest(manifest("https://www.googleapis.com/drive/v3")),
    ).toBe(true);
    expect(
      isGoogleApiManifest(manifest("https://gmail.googleapis.com/gmail/v1")),
    ).toBe(true);
    expect(
      isGoogleApiManifest(
        manifest("https://generativelanguage.googleapis.com/v1beta"),
      ),
    ).toBe(false);
    expect(
      isGoogleApiManifest(
        manifest("https://gmail.googleapis.com.attacker.example"),
      ),
    ).toBe(false);
  });
  test("shows actionable policy failures instead of generic provider errors", () => {
    const { policy } = setup();
    policy.mark("chat:google");
    try {
      policy.scope("chat:google", "codex", "gpt");
      throw new Error("Expected rejection");
    } catch (error) {
      expect(publicFailureMessage(error)).toContain(
        "Subscription connections are not enabled",
      );
    }
  });

  test("blocks Google access from other providers and unauthenticated tool paths", () => {
    const { policy } = setup();
    expect(() => assertGoogleConnectionAccess(google)).toThrow(
      "Select an eligible model",
    );
    const scope = policy.scope("chat:other", "codex", "gpt-5.4-mini");
    expect(() =>
      withGoogleDataAccess(scope, () => assertGoogleConnectionAccess(google)),
    ).toThrow("Subscription connections are not enabled");
    expect(policy.has("chat:other")).toBe(false);
  });
  test("protects before Google results arrive, persists across policy reload, and blocks model switching", () => {
    const { db, policy } = setup();
    const scope = policy.scope("chat:google", "openrouter", model);
    withGoogleDataAccess(scope, () => assertGoogleConnectionAccess(google));
    expect(scope.protected).toBe(true);
    const reopened = new GoogleDataProtection(db.db);
    expect(() => reopened.scope("chat:google", "claude", "sonnet")).toThrow(
      "contains Google data",
    );
    expect(
      reopened.scope("chat:google", "openrouter", "openrouter/auto").protected,
    ).toBe(true);
    expect(
      reopened.scope("chat:google", "openrouter", "another/model").eligible,
    ).toBe(true);
    expect(reopened.scope("chat:google", "openrouter", model).protected).toBe(
      true,
    );
  });
  test("allows external connectors after Google access without removing model protection", () => {
    const { policy } = setup();
    const scope = policy.scope("chat:google", "openrouter", model);
    scope.protect();
    expect(() =>
      withGoogleDataAccess(scope, () => assertGoogleConnectionAccess(external)),
    ).not.toThrow();
    expect(scope.protected).toBe(true);
    expect(policy.has("chat:google")).toBe(true);
    const other = policy.scope("chat:other", "anthropic", "sonnet");
    expect(() =>
      withGoogleDataAccess(other, () => assertGoogleConnectionAccess(external)),
    ).not.toThrow();
  });
  test("protects derived recipes while allowing web and integration research", async () => {
    const { policy } = setup();
    const scope = policy.scope("chat:google", "openrouter", model);
    scope.protect();
    const calls: string[] = [];
    const registry: ApplicationToolRegistry = {
      definitions: [],
      get: () => undefined,
      execute: async (name) => {
        calls.push(name);
        expect(policy.has("task:new-task")).toBe(true);
        return {};
      },
    };
    const guarded = policy.registry(registry, scope);
    await guarded.execute("create_task", {}, { callId: "new-task" });
    await expect(
      guarded.execute("search_web", {}, { callId: "search" }),
    ).resolves.toEqual({});
    await expect(
      guarded.execute("research_connection", {}, { callId: "research" }),
    ).resolves.toEqual({});
    expect(calls).toEqual(["create_task", "search_web", "research_connection"]);
  });
  test("blocks protected records, but not unrelated records or connection discovery", async () => {
    const { policy } = setup();
    policy.mark("task:protected");
    const calls: string[] = [];
    const registry: ApplicationToolRegistry = {
      definitions: [],
      get: () => undefined,
      execute: async (name) => {
        calls.push(name);
        return name === "list_tasks"
          ? { tasks: [{ id: "protected", prompt: "private" }] }
          : { id: "unrelated", text: "public" };
      },
    };
    const scope = policy.scope("chat:other", "codex", "gpt");
    const guarded = policy.registry(registry, scope);
    await expect(
      guarded.execute("get_task", { taskId: "protected" }, { callId: "read" }),
    ).rejects.toThrow("Subscription connections are not enabled");
    expect(calls).toEqual([]);
    const listed = await guarded.execute("list_tasks", {}, { callId: "list" });
    expect(JSON.stringify(listed)).not.toContain("private");
    expect(listed).toMatchObject({
      tasks: [{ id: "protected", googleDataProtected: true }],
    });
    for (const name of [
      "get_task",
      "list_connections",
      "search_connection_tools",
      "create_task",
    ]) {
      await expect(
        guarded.execute(name, { taskId: "unrelated" }, { callId: "other" }),
      ).resolves.toBeDefined();
    }
    expect(scope.protected).toBe(false);
    expect(policy.has("chat:other")).toBe(false);
  });
  test("omits protected inventory contents without tainting unrelated recipe creation", async () => {
    const { policy } = setup();
    policy.mark("task:protected");
    const scope = policy.scope("chat:inventory", "openrouter", model);
    const registry: ApplicationToolRegistry = {
      definitions: [],
      get: () => undefined,
      execute: async () => ({
        tasks: [{ id: "protected", prompt: "private" }],
      }),
    };
    const result = await policy
      .registry(registry, scope)
      .execute("list_tasks", {}, { callId: "list" });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(scope.protected).toBe(false);
    expect(policy.has("chat:inventory")).toBe(false);
  });
});

test("day-in-history discovery stays unrestricted, then explicit protected detail enables ZDR", async () => {
  const { policy } = setup();
  policy.mark("task:legacy");
  const scope = policy.scope(
    "chat:history",
    "openrouter",
    "qwen/qwen3.8-flash",
  );
  const bodies: { provider?: { zdr?: boolean } }[] = [];
  const connection = new OpenRouterModelConnection(
    { get: async () => "test", put: async () => {}, delete: async () => {} },
    {
      fetch: async (_url, init) => {
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
        });
      },
    },
  );
  const model = await connection.loadModel(
    "test",
    "qwen/qwen3.8-flash",
    () => scope.protected,
  );
  const next = () =>
    model.doGenerate({
      prompt: [
        {
          role: "user",
          content: [{ type: "text", text: "Create a day-in-history recipe" }],
        },
      ],
    });
  const registry: ApplicationToolRegistry = {
    definitions: [],
    get: () => undefined,
    execute: async (name) =>
      name === "list_tasks"
        ? { tasks: [{ id: "legacy", prompt: "protected contents" }] }
        : name === "get_task"
          ? { task: { id: "legacy", prompt: "protected contents" } }
          : { connections: [] },
  };
  const guarded = policy.registry(registry, scope);
  await next();
  for (const name of [
    "list_connections",
    "get_application_state",
    "list_connections",
    "list_tasks",
  ]) {
    const result = await guarded.execute(name, {}, { callId: name });
    expect(JSON.stringify(result)).not.toContain("protected contents");
  }
  await next();
  expect(bodies[0]?.provider?.zdr).toBeUndefined();
  expect(bodies[1]?.provider?.zdr).toBeUndefined();
  expect(policy.has("chat:history")).toBe(false);
  await guarded.execute("get_task", { taskId: "legacy" }, { callId: "detail" });
  await next();
  expect(bodies[2]?.provider?.zdr).toBe(true);
  expect(policy.has("chat:history")).toBe(true);
});

test("actual Google access refreshes a legacy marker so it cannot be mistaken for migration-only state", () => {
  const { db, policy } = setup();
  db.sqlite.run(
    "INSERT INTO google_data_protection (id, created_at) VALUES (?, ?)",
    ["task:legacy", 1],
  );
  const scope = policy.scope("task:legacy", "openrouter", model);
  withGoogleDataAccess(scope, () => assertGoogleConnectionAccess(google));
  const marker = db.sqlite
    .query<{ created_at: number }, []>(
      "SELECT created_at FROM google_data_protection WHERE id = 'task:legacy'",
    )
    .get();
  expect(marker?.created_at).toBeGreaterThan(1);
  expect(scope.protected).toBe(true);
});

test("a repaired non-Google recipe stays unprotected despite other Google recipes", () => {
  const { db, policy } = setup();
  policy.mark("task:google-recipe");
  db.sqlite.run(
    "INSERT INTO google_data_protection (id, created_at) VALUES (?, ?)",
    ["task:neon-report", 1],
  );
  // An audited repair removes only the migration's mistaken marker.
  db.sqlite.run("DELETE FROM google_data_protection WHERE id = ?", [
    "task:neon-report",
  ]);
  const reopened = new GoogleDataProtection(db.db);
  const scope = reopened.scope(
    "task:neon-report",
    "openrouter",
    "qwen/qwen3.8-flash",
  );
  withGoogleDataAccess(scope, () =>
    assertGoogleConnectionAccess({
      ...external,
      id: "neon",
      manifestId: "neon",
    }),
  );
  expect(scope.protected).toBe(false);
  expect(reopened.has("task:neon-report")).toBe(false);
  expect(reopened.has("task:google-recipe")).toBe(true);
  // Google access later in that same scope must still enable protection.
  withGoogleDataAccess(scope, () => assertGoogleConnectionAccess(google));
  expect(scope.protected).toBe(true);
  expect(reopened.has("task:neon-report")).toBe(true);
});

test("Gemini reads Gmail without a manual confirmation and retains protection across model switches", async () => {
  const { db, policy } = setup();
  const scope = policy.scope("chat:gemini", "google", "gemini-3.7-flash");
  let reads = 0;
  const registry = policy.registry(
    {
      definitions: [],
      get: () => undefined,
      execute: async () => {
        assertGoogleConnectionAccess(google);
        reads++;
        return { subject: "synthetic" };
      },
    },
    scope,
  );
  await expect(
    registry.execute("gmail_search_threads", {}, { callId: "read" }),
  ).resolves.toEqual({ subject: "synthetic" });
  expect(reads).toBe(1);
  expect(scope.protected).toBe(true);
  expect(
    new GoogleDataProtection(db.db).scope(
      "chat:gemini",
      "google",
      "gemini-3.7-flash",
    ).protected,
  ).toBe(true);
  expect(policy.scope("chat:gemini", "openrouter", model).protected).toBe(true);
});

test("direct API eligibility does not depend on legacy confirmation rows; subscriptions remain blocked", () => {
  const { policy } = setup();
  for (const id of [
    "openai",
    "anthropic",
    "google",
    "xai",
    "groq",
    "openrouter",
  ])
    expect(policy.eligible(id)).toBe(true);
  for (const id of ["claude", "codex", "unknown"])
    expect(policy.eligible(id)).toBe(false);
});
