import { AsyncLocalStorage } from "node:async_hooks";
import {
  type AppDatabase,
  type Connection,
  type ConnectorManifest,
  googleDataProtection,
  runs,
  ToolPolicyError,
} from "@springroll/kernel";
import { eq } from "drizzle-orm";
import type { ApplicationToolRegistry } from "./application-tool-registry.ts";

const googleManifests = ["gmail", "google-calendar", "google-drive"];
const access = new AsyncLocalStorage<GoogleDataAccess>();
export interface GoogleDataAccess {
  readonly provider?: string;
  readonly modelId?: string;
  readonly eligible: boolean;
  readonly denialReason?: string;
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
        scope?.denialReason ??
          "Select an eligible model to access Google data.",
      );
    scope.protect();
  }
}

export class GoogleDataProtection {
  constructor(private readonly db: AppDatabase) {}

  eligible(provider: string): boolean {
    return [
      "openrouter",
      "openai",
      "anthropic",
      "google",
      "xai",
      "groq",
    ].includes(provider);
  }

  denialReason(_provider: string): string {
    return "Use a direct API provider or an OpenRouter model with ZDR available to access Google data. Subscription connections are not enabled for Google data.";
  }

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
      .onConflictDoUpdate({
        target: googleDataProtection.id,
        set: { createdAt: new Date() },
      })
      .run();
  }
  private isProtectedReference(record: Record<string, unknown>): boolean {
    for (const key of ["id", "taskId", "runId", "sessionId"]) {
      const id = record[key];
      if (typeof id !== "string") continue;
      if (this.has(`task:${id}`) || this.has(`chat:${id}`)) return true;
      const run = this.db
        .select({ taskId: runs.taskId })
        .from(runs)
        .where(eq(runs.id, id))
        .get();
      if (run && this.has(`task:${run.taskId}`)) return true;
    }
    return false;
  }
  private containsProtectedReference(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value))
      return value.some((item) => this.containsProtectedReference(item));
    const record = value as Record<string, unknown>;
    return (
      this.isProtectedReference(record) ||
      Object.values(record).some((item) =>
        this.containsProtectedReference(item),
      )
    );
  }
  /** Discovery must not pull unrelated Google-derived content into a conversation. */
  discoveryResult(value: unknown): unknown {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value))
      return value.map((item) => this.discoveryResult(item));
    const record = value as Record<string, unknown>;
    if (this.isProtectedReference(record)) {
      return {
        ...Object.fromEntries(
          ["id", "taskId", "runId", "sessionId"].flatMap((key) =>
            typeof record[key] === "string" ? [[key, record[key]]] : [],
          ),
        ),
        googleDataProtected: true,
        details:
          "Contents omitted during discovery. Open this record only if needed for the user's request; reading its contents requires a Google-compatible model.",
      };
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [
        key,
        this.discoveryResult(item),
      ]),
    );
  }
  scope(id: string, provider: string, modelId: string): GoogleDataAccess {
    const eligible = this.eligible(provider) && modelId.trim().length > 0;
    if (this.has(id) && !eligible) {
      throw new ToolPolicyError(
        `This conversation or recipe contains Google data. ${this.denialReason(provider)}`,
      );
    }
    const scope: GoogleDataAccess = {
      provider,
      modelId,
      eligible,
      denialReason: this.denialReason(provider),
      protected: this.has(id),
      protect: () => {
        if (!eligible) throw new ToolPolicyError(this.denialReason(provider));
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
      // Only data from a protected record taints the conversation. Merely having
      // a Google connection elsewhere in the workspace does not.
      const localContent = new Set([
        "list_tasks",
        "get_task",
        "list_runs",
        "get_run",
        "list_approvals",
        "get_application_state",
        "update_task",
        "repair_task_tools",
        "run_task_now",
        "pause_task",
        "resume_task",
        "delete_task",
      ]);
      if (localContent.has(name) && this.containsProtectedReference(args))
        scope.protect();
      if (
        scope.protected &&
        (name === "create_task" || name === "update_task")
      ) {
        // Mark before mutation, including retries and scheduled execution races.
        this.mark(
          `task:${name === "create_task" ? context.callId : String(args.taskId)}`,
        );
      }
      const result = await withGoogleDataAccess(scope, () =>
        registry.execute(name, input, context),
      );
      // A list is discovery, not a request to read every recipe's private content.
      if (
        !scope.protected &&
        [
          "list_tasks",
          "list_runs",
          "list_approvals",
          "get_application_state",
        ].includes(name)
      ) {
        return this.discoveryResult(result);
      }
      if (localContent.has(name) && this.containsProtectedReference(result))
        scope.protect();
      return result;
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
