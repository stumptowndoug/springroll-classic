import { afterEach, describe, expect, test } from "bun:test";
import {
  type Connection,
  type ConnectorManifest,
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
      policy.scope("chat:google", "openai", "gpt");
      throw new Error("Expected rejection");
    } catch (error) {
      expect(publicFailureMessage(error)).toContain(
        "Select an OpenRouter model with enforced ZDR",
      );
    }
  });

  test("blocks Google access from other providers and unauthenticated tool paths", () => {
    const { policy } = setup();
    expect(() => assertGoogleConnectionAccess(google)).toThrow(
      "OpenRouter model with enforced ZDR",
    );
    const scope = policy.scope("chat:other", "openai", "gpt-5.4-mini");
    expect(() =>
      withGoogleDataAccess(scope, () => assertGoogleConnectionAccess(google)),
    ).toThrow("OpenRouter model with enforced ZDR");
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
  test("does not return derived local history to an unrestricted model", async () => {
    const { policy } = setup();
    policy.mark("task:protected");
    let executed = false;
    const registry: ApplicationToolRegistry = {
      definitions: [],
      get: () => undefined,
      execute: async () => {
        executed = true;
        return "private";
      },
    };
    const guarded = policy.registry(
      registry,
      policy.scope("chat:other", "openai", "gpt"),
    );
    for (const name of [
      "get_run",
      "list_tasks",
      "get_task",
      "update_task",
      "list_connections",
    ]) {
      await expect(
        guarded.execute(name, {}, { callId: "read" }),
      ).rejects.toThrow("OpenRouter model with enforced ZDR");
    }
    expect(executed).toBe(false);
  });
});
