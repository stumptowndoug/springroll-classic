import { lstat, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { notarizeArchive } from "./notarize.ts";
import { releaseInstallerDmg } from "./release-dmg.ts";

// Load credentials through the caller's environment; never copy signing secrets.
function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}
if (!Bun.which("create-dmg"))
  throw new Error("Install the packaging tool first: brew install create-dmg");
const identity = required("APPLE_SIGNING_IDENTITY");
for (const key of ["APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"])
  required(key);
if (!process.argv.includes("--release"))
  throw new Error("Use bun run release:mac");
async function run(command: string[]) {
  const child = Bun.spawn(command, { stdout: "inherit", stderr: "inherit" });
  if ((await child.exited) !== 0)
    throw new Error(`Release step failed: ${command[0]}`);
}
const identities = Bun.spawnSync([
  "security",
  "find-identity",
  "-v",
  "-p",
  "codesigning",
]);
if (!identities.stdout.toString().includes(`"${identity}"`))
  throw new Error("Signing certificate not installed");
const { app } = await import("./package.ts");
const entitlements = join(import.meta.dir, "runtime-entitlements.plist");
const machMagic = new Set([
  "cffaedfe",
  "cefaedfe",
  "feedfacf",
  "feedface",
  "cafebabe",
  "bebafeca",
  "cafebabf",
  "bfbafeca",
]);
async function signTree(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) return;
  if (info.isDirectory()) {
    for (const entry of await readdir(path)) await signTree(join(path, entry));
    return;
  }
  const header = Buffer.from(
    await Bun.file(path).slice(0, 4).arrayBuffer(),
  ).toString("hex");
  if (!machMagic.has(header)) return;
  const jit = ["bun", "node", "claude"].includes(basename(path));
  const v8 = ["secure-exec-v8", "codex-code-mode-host"].includes(
    basename(path),
  );
  await run([
    "codesign",
    "--force",
    "--timestamp",
    "--options",
    "runtime",
    "--sign",
    identity,
    ...(v8
      ? ["--entitlements", join(import.meta.dir, "v8-entitlements.plist")]
      : jit
        ? ["--entitlements", entitlements]
        : []),
    path,
  ]);
}
await signTree(app);
await run([
  "codesign",
  "--force",
  "--timestamp",
  "--options",
  "runtime",
  "--sign",
  identity,
  app,
]);
await run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", app]);
const zip = join(dirname(app), "Springroll-notarization.zip");
await run(["ditto", "-c", "-k", "--keepParent", app, zip]);
const resultPath = join(dirname(app), "notarization.json");
await notarizeArchive(zip, resultPath);
await run(["xcrun", "stapler", "staple", app]);
await run(["xcrun", "stapler", "validate", app]);
await run(["spctl", "--assess", "--type", "execute", "--verbose=2", app]);
const download = join(dirname(app), `Springroll-0.1.5-${process.arch}.zip`);
await run(["ditto", "-c", "-k", "--keepParent", app, download]);
console.log(`Signed and notarized beta: ${download}`);

await releaseInstallerDmg(app);
