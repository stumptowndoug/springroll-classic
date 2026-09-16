import { AsyncLocalStorage } from "node:async_hooks";
import {
  type AppDatabase,
  type Connection,
  type ConnectorManifest,
  connections,
  googleDataProtection,
  ToolPolicyError,
} from "@springroll/kernel";
import { eq, inArray } from "drizzle-orm";
import type { ApplicationToolRegistry } from "./application-tool-registry.ts";

const googleManifests = ["gmail", "google-calendar", "google-drive"];
const access = new AsyncLocalStorage<GoogleDataAccess>();
export interface GoogleDataAccess {
  readonly eligible: boolean;
  protected: boolean;
  protect(): void;
}
export function withGoogleDataAccess<T>(
  scope: GoogleDataAccess,
  fn: () => T,
): T {
  return access.run(scope, fn);
}
export function currentGoogleDataAccess(): GoogleDataAccess | undefined {
  return access.getStore();
}
export function isGoogleConnection(connection: {
  readonly manifestId?: string | undefined;
}): boolean {
  return googleManifests.includes(connection.manifestId ?? "");
}
export function isGoogleApiManifest(
  manifest: ConnectorManifest | undefined,
): boolean {
  if (!manifest) return false;
  if (googleManifests.includes(manifest.id)) return true;
  const transport = manifest.transport;
  const url =
    "baseUrl" in transport
      ? transport.baseUrl
      : "endpoint" in transport
        ? transport.endpoint
        : undefined;
  if (!url) return false;
  const parsed = new URL(url);
  return (
    [
      "gmail.googleapis.com",
      "calendar.googleapis.com",
      "drive.googleapis.com",
      "docs.googleapis.com",
      "sheets.googleapis.com",
      "slides.googleapis.com",
    ].includes(parsed.hostname) ||
    (parsed.hostname === "www.googleapis.com" &&
      /^\/(gmail|calendar|drive|docs|sheets|slides)(\/|$)/.test(
        parsed.pathname,
      ))
  );
}
export function assertGoogleConnectionAccess(
  connection: Connection,
  manifest?: ConnectorManifest,
): void {
  const scope = access.getStore();
  if (isGoogleConnection(connection) || isGoogleApiManifest(manifest)) {
    if (!scope?.eligible)
      throw new ToolPolicyError(
        "Use an OpenRouter model with enforced ZDR to access Google data.",
      );
    scope.protect();
  }
}

export class GoogleDataProtection {
  constructor(private readonly db: AppDatabase) {}

  has(id: string): boolean {
    return Boolean(
      this.db
        .select()
        .from(googleDataProtection)
        .where(eq(googleDataProtection.id, id))
        .get(),
    );
  }
  mark(id: string): void {
    this.db
      .insert(googleDataProtection)
      .values({ id, createdAt: new Date() })
      .onConflictDoNothing()
      .run();
  }
  hasGoogleContent(): boolean {
    return Boolean(
      this.db.select().from(googleDataProtection).limit(1).get() ||
        this.db
          .select()
          .from(connections)
          .where(inArray(connections.manifestId, googleManifests))
          .limit(1)
          .get(),
    );
  }
  scope(id: string, provider: string, modelId: string): GoogleDataAccess {
    const eligible = provider === "openrouter" && modelId.trim().length > 0;
    if (this.has(id) && !eligible) {
      throw new ToolPolicyError(
        "This conversation or recipe contains Google data. Select an OpenRouter model with enforced ZDR to continue; changing providers cannot remove this protection.",
      );
    }
    const scope: GoogleDataAccess = {
      eligible,
      protected: this.has(id),
      protect: () => {
        if (!eligible)
          throw new ToolPolicyError(
            "Use an OpenRouter model with enforced ZDR to read Google data or saved workspace content that may contain it.",
          );
        this.mark(id);
        scope.protected = true;
      },
    };
    return scope;
  }

  registry(
    registry: ApplicationToolRegistry,
    scope: GoogleDataAccess,
  ): ApplicationToolRegistry {
    const execute: ApplicationToolRegistry["execute"] = async (
      name,
      input,
      context,
    ) => {
      const args = input as Record<string, unknown>;
      // Local inventories include names, summaries, prompts and derived content.
      // Until individual fields have provenance, treat these reads conservatively.
      const localContent = new Set([
        "list_connections",
        "list_tasks",
        "get_task",
        "list_runs",
        "get_run",
        "list_approvals",
        "get_usage",
        "get_application_state",
        "search_connection_tools",
        "describe_connection_tools",
        "activate_connection_tools",
        "create_task",
        "update_task",
        "repair_task_tools",
        "run_task_now",
        "pause_task",
        "resume_task",
        "delete_task",
        "reconnect_connection",
        "disconnect_connection",
        "remove_connection",
      ]);
      if (localContent.has(name) && this.hasGoogleContent()) scope.protect();
      if (
        scope.protected &&
        (name === "create_task" || name === "update_task")
      ) {
        // Mark before mutation, including retries and scheduled execution races.
        this.mark(
          `task:${name === "create_task" ? context.callId : String(args.taskId)}`,
        );
      }
      return withGoogleDataAccess(scope, () =>
        registry.execute(name, input, context),
      );
    };
    const definitions = registry.definitions.map((definition) => ({
      ...definition,
      execute: (
        input: unknown,
        context: Parameters<ApplicationToolRegistry["execute"]>[2],
      ) => execute(definition.name, input, context),
    }));
    return {
      definitions,
      get: (name) => definitions.find((definition) => definition.name === name),
      execute,
    };
  }
}
