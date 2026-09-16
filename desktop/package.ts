import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pruneOptionalRuntimes } from "./prune-runtime.ts";

if (process.platform !== "darwin")
  throw new Error("The prototype targets macOS only");
const root = fileURLToPath(new URL("../", import.meta.url));
const desktop = join(root, "desktop");
const release = process.argv.includes("--release");
const expectedBun = (
  await Bun.file(join(root, "package.json")).json()
).packageManager.split("@")[1];
if (release && Bun.version !== expectedBun)
  throw new Error(
    `Release packaging requires Bun ${expectedBun}; running ${Bun.version}`,
  );
const productName = release ? "Springroll" : "Springroll Prototype";
const identifier = release
  ? "com.springroll.desktop"
  : "com.springroll.desktop.prototype";
const version = "0.1.4";
const buildNumber = process.env.SPRINGROLL_BUILD_NUMBER || "1";
if (!/^\d+$/.test(buildNumber)) throw new Error("Build number must be numeric");
const oauth: Record<string, string> = {};
if (release) {
  for (const key of [
    "SPRINGROLL_GOOGLE_OAUTH_CLIENT_ID",
    "SPRINGROLL_GOOGLE_OAUTH_CLIENT_SECRET",
    "SPRINGROLL_MICROSOFT_OAUTH_CLIENT_ID",
  ]) {
    const value = process.env[key]?.trim();
    if (!value) throw new Error(`Release requires ${key}`);
    oauth[key] = value;
  }
}
const outputRoot = join(desktop, "dist");
await mkdir(outputRoot, { recursive: true });
// Every build has its own directory: never overwrite a running app or user data.
const output = await mkdtemp(
  join(outputRoot, release ? "release-" : "prototype-"),
);
export const app = join(output, `${productName}.app`);
const contents = join(app, "Contents");
const runtime = join(contents, "Resources", "runtime");
await mkdir(join(contents, "MacOS"), { recursive: true });
await mkdir(join(runtime, "bin"), { recursive: true });

async function run(command: string[], cwd = root) {
  const child = Bun.spawn(command, {
    cwd,
    env: {
      ...process.env,
      ...(release
        ? { TAURI_CONFIG: JSON.stringify({ productName, identifier, version }) }
        : {}),
    },
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0)
    throw new Error(`Build step failed: ${command[0]}`);
}

// Hashed browser chunks from previous builds are not removed by Bun's bundler.
// Build into a clean output directory so old versions never enter the app.
await rm(join(root, "app/dist"), { recursive: true, force: true });
await run([process.execPath, "run", "build"]);
await run([
  "cargo",
  "build",
  ...(release ? ["--release"] : []),
  "--manifest-path",
  join(desktop, "Cargo.toml"),
]);
// Explicit allowlist: never copy .env, .local, Git history, or design mockups.
for (const path of [
  "package.json",
  "bun.lock",
  "LICENSE",
  "app/package.json",
  "app/src",
  "app/dist",
  "kernel/package.json",
  "kernel/src",
  "cli/package.json",
  "spikes/rivet-r0/package.json",
  "drizzle",
]) {
  await cp(join(root, path), join(runtime, path), { recursive: true });
}
await run(
  [
    process.execPath,
    "install",
    "--frozen-lockfile",
    "--production",
    "--ignore-scripts",
  ],
  runtime,
);
await copyFile(process.execPath, join(runtime, "bin/bun"));
const require = createRequire(join(root, "kernel/package.json"));
const { getEnginePath } = require("@rivetkit/engine-cli") as {
  getEnginePath(): string;
};
await copyFile(getEnginePath(), join(runtime, "bin/rivet-engine"));
await chmod(join(runtime, "bin/bun"), 0o755);
await chmod(join(runtime, "bin/rivet-engine"), 0o755);
await pruneOptionalRuntimes(runtime);
await copyFile(
  join(desktop, `target/${release ? "release" : "debug"}/springroll-desktop`),
  join(contents, "MacOS/springroll-desktop"),
);
await chmod(join(contents, "MacOS/springroll-desktop"), 0o755);
await copyFile(
  join(desktop, "icons/icon.icns"),
  join(contents, "Resources/icon.icns"),
);
await writeFile(
  join(contents, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>springroll-desktop</string>
<key>CFBundleIdentifier</key><string>${identifier}</string>
<key>CFBundleName</key><string>${productName}</string>
<key>CFBundleDisplayName</key><string>${productName}</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${buildNumber}</string>
<key>CFBundleIconFile</key><string>icon.icns</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>`,
);
if (release)
  await writeFile(join(runtime, "oauth-clients.json"), JSON.stringify(oauth));
console.log(
  `Unsigned ${release ? "release candidate" : "development app"}: ${app}`,
);
