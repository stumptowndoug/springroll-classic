import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compatibleRuntimeVersion,
  type RuntimeManifest,
  SubscriptionRuntimeManager,
} from "../src/subscription-runtime.ts";

async function fixture(withLink = false) {
  const root = await mkdtemp(join(tmpdir(), "springroll-runtime-test-"));
  const pkg = join(root, "package");
  await mkdir(pkg);
  const executable = join(pkg, "codex");
  await writeFile(
    executable,
    '#!/bin/sh\nif [ "$1" = "app-server" ]; then printf "app-server --stdio\\n"; else printf "codex-cli 0.153.2\\n"; fi\n',
    {
      mode: 0o755,
    },
  );
  await writeFile(join(pkg, "LICENSE"), "Test fixture license");
  if (withLink) await symlink("/tmp", join(pkg, "outside"));
  const archive = join(root, "support.tgz");
  const tar = Bun.spawn(
    ["/usr/bin/tar", "-czf", archive, "-C", root, "package"],
    { stdout: "ignore", stderr: "ignore" },
  );
  expect(await tar.exited).toBe(0);
  const bytes = await readFile(archive);
  const spec: RuntimeManifest = {
    packageVersion: "0.153.2",
    cliVersion: "0.153.2",
    url: "https://registry.npmjs.org/test/support.tgz",
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    teamId: "test",
    executable: "codex",
  };
  return {
    root,
    pkg,
    executable,
    bytes,
    spec,
    cache: join(root, "cache"),
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
async function finish(manager: SubscriptionRuntimeManager) {
  for (let i = 0; i < 400; i++) {
    const state = await manager.status("codex");
    if (state.state !== "installing" && state.state !== "downloading")
      return state;
    await Bun.sleep(10);
  }
  throw new Error("Installer did not settle");
}

test("validates managed download versions against the manifest", () => {
  expect(compatibleRuntimeVersion("codex-cli 0.153.2", "0.153.2")).toBe(true);
  expect(compatibleRuntimeVersion("0.153.9", "0.153.2")).toBe(true);
  expect(compatibleRuntimeVersion("0.153.1", "0.153.2")).toBe(false);
  expect(compatibleRuntimeVersion("0.154.0", "0.153.2")).toBe(true);
  expect(compatibleRuntimeVersion("1.0.0", "0.153.2")).toBe(true);
  expect(compatibleRuntimeVersion("2.2.0 (Claude Code)", "2.1.260")).toBe(true);
  expect(compatibleRuntimeVersion("2.1.259 (Claude Code)", "2.1.260")).toBe(
    false,
  );
  expect(compatibleRuntimeVersion("unknown", "0.153.2")).toBe(false);
});

test("reuses a compatible local CLI without downloading support", async () => {
  const f = await fixture();
  try {
    let downloads = 0;
    const manager = new SubscriptionRuntimeManager({
      root: f.cache,
      specs: { codex: f.spec },
      candidates: () => [f.executable],
      fetch: (async () => {
        downloads++;
        throw new Error("unexpected download");
      }) as unknown as typeof fetch,
    });
    expect(await manager.require("codex")).toBe(f.executable);
    expect(await manager.install("codex")).toMatchObject({
      state: "ready",
      source: "existing",
    });
    expect(downloads).toBe(0);
  } finally {
    await f.dispose();
  }
});

test("status never downloads; explicit concurrent requests install once and persist a verified cache", async () => {
  const f = await fixture();
  try {
    let downloads = 0,
      verifications = 0;
    const options = {
      root: f.cache,
      specs: { codex: f.spec },
      candidates: () => [],
      verify: async () => {
        verifications++;
      },
      fetch: (async () => {
        downloads++;
        return new Response(f.bytes, {
          headers: { "content-length": String(f.bytes.length) },
        });
      }) as unknown as typeof fetch,
    };
    const manager = new SubscriptionRuntimeManager(options);
    expect(await manager.status("codex")).toEqual({ state: "missing" });
    await expect(manager.require("codex")).rejects.toThrow("Settings");
    expect(downloads).toBe(0);
    await Promise.all([manager.install("codex"), manager.install("codex")]);
    expect(await finish(manager)).toMatchObject({
      state: "ready",
      source: "managed",
    });
    expect(downloads).toBe(1);
    expect(verifications).toBe(1);
    const path = await manager.require("codex");
    expect(await readFile(join(path, "../LICENSE"), "utf8")).toBe(
      "Test fixture license",
    );
    const restarted = new SubscriptionRuntimeManager(options);
    expect(await restarted.require("codex")).toBe(path);
    expect(downloads).toBe(1);
  } finally {
    await f.dispose();
  }
});

test("checksum failure leaves no usable runtime and can be retried", async () => {
  const f = await fixture();
  try {
    let corrupted = true,
      verified = 0;
    const manager = new SubscriptionRuntimeManager({
      root: f.cache,
      specs: { codex: f.spec },
      candidates: () => [],
      verify: async () => {
        verified++;
      },
      fetch: (async () =>
        new Response(
          corrupted ? "damaged" : f.bytes,
        )) as unknown as typeof fetch,
    });
    await manager.install("codex");
    expect(await finish(manager)).toMatchObject({
      state: "error",
      error: expect.stringContaining("checksum"),
    });
    expect(verified).toBe(0);
    await expect(manager.require("codex")).rejects.toThrow();
    corrupted = false;
    await manager.install("codex");
    expect(await finish(manager)).toMatchObject({ state: "ready" });
  } finally {
    await f.dispose();
  }
});

test("rejects archive links and invalid signatures before executing support", async () => {
  for (const withLink of [true, false]) {
    const f = await fixture(withLink);
    try {
      const manager = new SubscriptionRuntimeManager({
        root: f.cache,
        specs: { codex: f.spec },
        candidates: () => [],
        verify: async () => {
          throw new Error("Invalid signature");
        },
        fetch: (async () => new Response(f.bytes)) as unknown as typeof fetch,
      });
      await manager.install("codex");
      expect(await finish(manager)).toMatchObject({
        state: "error",
        error: expect.stringContaining(withLink ? "link" : "signature"),
      });
      await expect(manager.require("codex")).rejects.toThrow();
    } finally {
      await f.dispose();
    }
  }
});

test("cancels an unfinished download and allows a fresh retry", async () => {
  const f = await fixture();
  try {
    let pending = true;
    const manager = new SubscriptionRuntimeManager({
      root: f.cache,
      specs: { codex: f.spec },
      candidates: () => [],
      verify: async () => {},
      fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
        if (!pending) return new Response(f.bytes);
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) reject(new Error("Aborted"));
          else
            signal?.addEventListener(
              "abort",
              () => reject(new Error("Aborted")),
              { once: true },
            );
        });
      }) as unknown as typeof fetch,
    });
    await manager.install("codex");
    expect(await manager.cancel("codex")).toMatchObject({ state: "missing" });
    pending = false;
    await manager.install("codex");
    expect(await finish(manager)).toMatchObject({ state: "ready" });
  } finally {
    await f.dispose();
  }
});

test("falls back to explicit support download when required commands are absent", async () => {
  const f = await fixture();
  try {
    await writeFile(f.executable, '#!/bin/sh\nprintf "codex-cli 0.100.0\\n"\n');
    await chmod(f.executable, 0o755);
    const manager = new SubscriptionRuntimeManager({
      root: f.cache,
      specs: { codex: f.spec },
      candidates: () => [f.executable],
      verify: async () => {},
      fetch: (async () => new Response(f.bytes)) as unknown as typeof fetch,
    });
    expect(await manager.status("codex")).toMatchObject({ state: "missing" });
    await manager.install("codex");
    expect(await finish(manager)).toMatchObject({
      state: "ready",
      source: "managed",
    });
  } finally {
    await f.dispose();
  }
});

test.each([
  {
    id: "codex" as const,
    installed: "codex-cli 0.100.0",
    downloadedVersion: "0.153.2",
    help: "app-server --stdio",
  },
  {
    id: "claude" as const,
    installed: "2.1.100 (Claude Code)",
    downloadedVersion: "2.1.260",
    help: "--input-format --output-format stream-json --mcp-config --strict-mcp-config --permission-mode --permission-prompts --setting-sources --settings --no-session-persistence --tools",
  },
  {
    id: "codex" as const,
    installed: "codex-cli 0.154.0",
    downloadedVersion: "0.153.2",
    help: "app-server --stdio",
  },
  {
    id: "claude" as const,
    installed: "2.2.0 (Claude Code)",
    downloadedVersion: "2.1.260",
    help: "--input-format --output-format stream-json --mcp-config --strict-mcp-config --permission-mode --permission-prompts --setting-sources --settings --no-session-persistence --tools",
  },
])(
  "reuses installed $id $installed when integration commands are available",
  async ({ id, installed, downloadedVersion, help }) => {
    const f = await fixture();
    try {
      const script = (supported: boolean) =>
        `#!/bin/sh\nif [ "$1" = "--version" ]; then printf '%s\\n' '${installed}'; else printf '%s\\n' '${supported ? help : "unrelated command"}'; fi\n`;
      await writeFile(f.executable, script(true));
      let downloads = 0;
      const options = {
        root: f.cache,
        specs: { [id]: { ...f.spec, cliVersion: downloadedVersion } },
        candidates: () => [f.executable],
        fetch: (async () => {
          downloads++;
          throw new Error("Unexpected download");
        }) as unknown as typeof fetch,
      };
      const manager = new SubscriptionRuntimeManager(options);
      expect(await manager.status(id)).toMatchObject({
        state: "ready",
        source: "existing",
        version: installed,
      });
      expect(await manager.require(id)).toBe(f.executable);
      expect(await manager.install(id)).toMatchObject({
        state: "ready",
        source: "existing",
      });
      expect(downloads).toBe(0);
      await writeFile(f.executable, script(false));
      const changed = new SubscriptionRuntimeManager(options);
      expect(await changed.status(id)).toMatchObject({
        state: "missing",
        error: expect.stringContaining("integration commands"),
      });
      expect(downloads).toBe(0);
    } finally {
      await f.dispose();
    }
  },
);
