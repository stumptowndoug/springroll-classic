import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import manifests from "./subscription-runtime-manifest.json";

export type SubscriptionRuntimeId = "codex" | "claude";
export interface SubscriptionRuntimeStatus {
  readonly state: "missing" | "ready" | "downloading" | "installing" | "error";
  readonly source?: "existing" | "managed";
  readonly version?: string;
  readonly receivedBytes?: number;
  readonly totalBytes?: number;
  readonly error?: string;
}
export interface RuntimeManifest {
  readonly packageVersion: string;
  readonly cliVersion: string;
  readonly url: string;
  readonly integrity: string;
  readonly teamId: string;
  readonly executable: string;
}
export function compatibleRuntimeVersion(
  actual: string,
  expected: string,
): boolean {
  const a = actual.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  const b = expected.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!a || !b) return false;
  for (let index = 1; index <= 3; index++) {
    const difference = Number(a[index]) - Number(b[index]);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

export function subscriptionRuntimeEnvironment(
  env = process.env,
): NodeJS.ProcessEnv {
  return {
    ...env,
    PATH: [
      ...new Set([
        ...(env.PATH ?? "").split(delimiter).filter(Boolean),
        "/opt/homebrew/bin",
        "/usr/local/bin",
        join(homedir(), ".local/bin"),
        join(homedir(), ".bun/bin"),
        join(homedir(), ".npm-global/bin"),
        "/usr/bin",
        "/bin",
      ]),
    ].join(delimiter),
  };
}

async function command(
  args: string[],
  env = subscriptionRuntimeEnvironment(),
): Promise<string> {
  const child = Bun.spawn(args, { env, stdout: "pipe", stderr: "pipe" });
  const timeout = setTimeout(() => child.kill(), 30_000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0)
      throw new Error(
        `${args[0]?.split("/").at(-1)} failed: ${stderr.slice(-500)}`,
      );
    return stdout || stderr;
  } finally {
    clearTimeout(timeout);
  }
}

/** No downloads during discovery, startup, status checks, or recipe execution. */
export class SubscriptionRuntimeManager {
  readonly #root: string;
  readonly #specs: Partial<
    Record<SubscriptionRuntimeId, RuntimeManifest | undefined>
  >;
  readonly #fetch: typeof globalThis.fetch;
  readonly #candidates: (id: SubscriptionRuntimeId) => readonly string[];
  readonly #verify: (
    executable: string,
    spec: RuntimeManifest,
  ) => Promise<void>;
  readonly #states = new Map<
    SubscriptionRuntimeId,
    SubscriptionRuntimeStatus
  >();
  readonly #active = new Map<
    SubscriptionRuntimeId,
    { promise: Promise<void>; abort: AbortController }
  >();
  readonly #resolved = new Map<
    SubscriptionRuntimeId,
    {
      path?: string;
      fingerprint?: string;
      status: SubscriptionRuntimeStatus;
      at: number;
    }
  >();
  readonly #discovering = new Map<
    SubscriptionRuntimeId,
    Promise<string | undefined>
  >();
  constructor(options: {
    root: string;
    specs?: Partial<Record<SubscriptionRuntimeId, RuntimeManifest | undefined>>;
    fetch?: typeof globalThis.fetch;
    candidates?: (id: SubscriptionRuntimeId) => readonly string[];
    verify?: (executable: string, spec: RuntimeManifest) => Promise<void>;
  }) {
    this.#root = resolve(options.root);
    const entries = manifests as Record<string, RuntimeManifest>;
    this.#specs = options.specs ?? {
      codex: entries[`codex-${process.platform}-${process.arch}`],
      claude: entries[`claude-${process.platform}-${process.arch}`],
    };
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#candidates =
      options.candidates ??
      ((id) =>
        (subscriptionRuntimeEnvironment().PATH ?? "")
          .split(delimiter)
          .filter((dir) => dir.startsWith("/"))
          .map((dir) => join(dir, id)));
    this.#verify =
      options.verify ??
      (async (executable, spec) => {
        await command([
          "/usr/bin/codesign",
          "--verify",
          "--deep",
          "--strict",
          executable,
        ]);
        const signature = await command([
          "/usr/bin/codesign",
          "-dv",
          "--verbose=2",
          executable,
        ]);
        if (!signature.split("\n").includes(`TeamIdentifier=${spec.teamId}`))
          throw new Error(
            "Downloaded support has an unexpected signing identity",
          );
      });
  }

  async status(id: SubscriptionRuntimeId): Promise<SubscriptionRuntimeStatus> {
    const state = this.#states.get(id);
    if (state) return state;
    await this.find(id);
    return this.#resolved.get(id)?.status ?? { state: "missing" };
  }
  async require(id: SubscriptionRuntimeId): Promise<string> {
    const path = await this.find(id);
    if (!path)
      throw new Error(
        `Connect ${id === "codex" ? "Codex" : "Claude"} in Settings to download subscription support`,
      );
    return path;
  }
  async find(id: SubscriptionRuntimeId): Promise<string | undefined> {
    const cached = this.#resolved.get(id);
    if (cached && Date.now() - cached.at < 5_000) return cached.path;
    if (cached?.path && cached.fingerprint) {
      const info = await stat(cached.path).catch(() => undefined);
      if (
        info &&
        `${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}` ===
          cached.fingerprint
      ) {
        cached.at = Date.now();
        return cached.path;
      }
    }
    const pending = this.#discovering.get(id);
    if (pending) return pending;
    const discover = this.#discover(id).finally(() =>
      this.#discovering.delete(id),
    );
    this.#discovering.set(id, discover);
    return discover;
  }
  async #discover(id: SubscriptionRuntimeId): Promise<string | undefined> {
    const spec = this.#specs[id];
    if (!spec) return undefined;
    let detectedIssue: string | undefined;
    for (const path of this.#candidates(id)) {
      try {
        await access(path, constants.X_OK);
        const version = await command([path, "--version"]);
        // The managed download version is not a minimum for user-installed CLIs.
        // Gate on the entry points the adapters actually invoke instead.
        const help = await command(
          id === "codex" ? [path, "app-server", "--help"] : [path, "--help"],
        );
        const supported =
          id === "codex"
            ? help.includes("--stdio")
            : [
                "--input-format",
                "--output-format",
                "stream-json",
                "--mcp-config",
                "--strict-mcp-config",
                "--permission-mode",
                "--permission-prompts",
                "--setting-sources",
                "--settings",
                "--no-session-persistence",
                "--tools",
              ].every((flag) => help.includes(flag));
        if (!supported) {
          detectedIssue = `Found ${version.trim()}, but it does not expose the integration commands Springroll needs. Update your installed CLI or download support.`;
          continue;
        }
        const info = await stat(path);
        this.#resolved.set(id, {
          path,
          fingerprint: `${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`,
          status: {
            state: "ready",
            source: "existing",
            version: version.trim(),
          },
          at: Date.now(),
        });
        return path;
      } catch {
        /* Continue to the next installed CLI, then the managed cache. */
      }
    }
    const directory = this.#directory(id, spec);
    const path = join(directory, spec.executable);
    try {
      const receipt = JSON.parse(
        await readFile(join(directory, ".springroll-runtime.json"), "utf8"),
      );
      if (receipt.integrity !== spec.integrity)
        throw new Error("Runtime version changed");
      await access(path, constants.X_OK);
      await this.#verify(path, spec);
      const version = await command([path, "--version"]);
      if (!compatibleRuntimeVersion(version, spec.cliVersion))
        throw new Error("Incompatible runtime");
      const info = await stat(path);
      this.#resolved.set(id, {
        path,
        fingerprint: `${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`,
        status: { state: "ready", source: "managed", version: version.trim() },
        at: Date.now(),
      });
      return path;
    } catch {
      /* An absent/incomplete cache requires an explicit download. */
    }
    this.#resolved.set(id, {
      status: {
        state: "missing",
        ...(detectedIssue ? { error: detectedIssue } : {}),
      },
      at: Date.now(),
    });
    return undefined;
  }
  #directory(id: SubscriptionRuntimeId, spec: RuntimeManifest) {
    return join(
      this.#root,
      `${id}-${process.platform}-${process.arch}-${spec.packageVersion}`,
    );
  }
  async install(id: SubscriptionRuntimeId): Promise<SubscriptionRuntimeStatus> {
    if (this.#active.has(id)) return this.status(id);
    this.#states.delete(id);
    if (await this.find(id)) return this.status(id);
    // Another caller may have started while discovery was pending.
    if (this.#active.has(id)) return this.status(id);
    const spec = this.#specs[id];
    if (!spec)
      throw new Error(
        "Subscription support downloads are available on macOS only",
      );
    const abort = new AbortController();
    this.#states.set(id, { state: "downloading", receivedBytes: 0 });
    const promise = this.#install(id, spec, abort.signal)
      .catch((error) => {
        this.#states.set(
          id,
          abort.signal.aborted
            ? { state: "missing" }
            : {
                state: "error",
                error:
                  error instanceof Error
                    ? error.message
                    : "Support download failed. Try again.",
              },
        );
      })
      .finally(() => this.#active.delete(id));
    this.#active.set(id, { promise, abort });
    return this.status(id);
  }
  async cancel(id: SubscriptionRuntimeId): Promise<SubscriptionRuntimeStatus> {
    const active = this.#active.get(id);
    active?.abort.abort();
    await active?.promise;
    this.#states.delete(id);
    return this.status(id);
  }
  close() {
    for (const task of this.#active.values()) task.abort.abort();
  }
  async #install(
    id: SubscriptionRuntimeId,
    spec: RuntimeManifest,
    signal: AbortSignal,
  ) {
    await mkdir(this.#root, { recursive: true, mode: 0o700 });
    const lock = join(this.#root, `.${id}.install-lock`);
    try {
      await mkdir(lock, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const pid = Number(
        await readFile(join(lock, "pid"), "utf8").catch(() => "0"),
      );
      let alive = true;
      if (pid > 0) {
        try {
          process.kill(pid, 0);
        } catch (e) {
          alive = (e as NodeJS.ErrnoException).code !== "ESRCH";
        }
      } else alive = Date.now() - (await stat(lock)).mtimeMs < 600_000;
      if (alive)
        throw new Error(
          "Support is being installed by another Springroll process. Try again shortly.",
        );
      await rm(lock, { recursive: true });
      await mkdir(lock, { mode: 0o700 });
    }
    let stage: string | undefined;
    const timeout = setTimeout(
      () => this.#active.get(id)?.abort.abort(),
      600_000,
    );
    try {
      await writeFile(join(lock, "pid"), String(process.pid), { mode: 0o600 });
      stage = await mkdtemp(join(this.#root, `.${id}-download-`));
      const archive = join(stage, "runtime.tgz");
      const response = await this.#fetch(spec.url, {
        redirect: "error",
        signal,
      });
      if (!response.ok || !response.body)
        throw new Error(`Support download failed (${response.status})`);
      const maxBytes = 256 * 1024 * 1024;
      const total = Number(response.headers.get("content-length")) || undefined;
      if (total && total > maxBytes) {
        await response.body.cancel();
        throw new Error("Support archive is too large");
      }
      const hash = createHash("sha512");
      const file = await open(archive, "wx", 0o600);
      let received = 0;
      try {
        for await (const chunk of response.body) {
          signal.throwIfAborted();
          received += chunk.byteLength;
          if (received > maxBytes)
            throw new Error("Support archive is too large");
          hash.update(chunk);
          await file.writeFile(chunk);
          this.#states.set(id, {
            state: "downloading",
            receivedBytes: received,
            ...(total ? { totalBytes: total } : {}),
          });
        }
      } finally {
        await file.close();
      }
      if (`sha512-${hash.digest("base64")}` !== spec.integrity)
        throw new Error(
          "Support download checksum did not match. Please retry.",
        );
      signal.throwIfAborted();
      this.#states.set(id, { state: "installing" });
      const names = (await command(["/usr/bin/tar", "-tzf", archive]))
        .trim()
        .split("\n");
      if (
        names.some(
          (name) =>
            !name.startsWith("package/") || name.split("/").includes(".."),
        )
      )
        throw new Error("Unsafe support archive path");
      const types = (await command(["/usr/bin/tar", "-tvzf", archive]))
        .trim()
        .split("\n");
      if (types.some((line) => !["-", "d"].includes(line[0] ?? "")))
        throw new Error("Unsupported link in support archive");
      await command([
        "/usr/bin/tar",
        "-xzf",
        archive,
        "--no-same-owner",
        "--no-same-permissions",
        "-C",
        stage,
      ]);
      signal.throwIfAborted();
      const packageDir = join(stage, "package");
      const executable = join(packageDir, spec.executable);
      await this.#verify(executable, spec);
      const version = await command([executable, "--version"]);
      if (!compatibleRuntimeVersion(version, spec.cliVersion))
        throw new Error("Downloaded support has an incompatible version");
      await writeFile(
        join(packageDir, ".springroll-runtime.json"),
        JSON.stringify({ integrity: spec.integrity }),
        { mode: 0o600 },
      );
      signal.throwIfAborted();
      const destination = this.#directory(id, spec);
      const backup = join(stage, `previous-${randomUUID()}`);
      let backedUp = false;
      try {
        await rename(destination, backup);
        backedUp = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      try {
        await rename(packageDir, destination);
      } catch (error) {
        if (backedUp) await rename(backup, destination);
        throw error;
      }
      this.#resolved.set(id, {
        path: join(destination, spec.executable),
        status: { state: "ready", source: "managed", version: version.trim() },
        at: Date.now(),
      });
      this.#states.delete(id);
    } finally {
      clearTimeout(timeout);
      if (stage) await rm(stage, { recursive: true, force: true });
      await rm(lock, { recursive: true, force: true });
    }
  }
}
