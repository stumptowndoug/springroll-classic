import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("macOS is required");
const desktop = fileURLToPath(new URL("./", import.meta.url));
const dist = join(desktop, "dist");
const destination = join(dist, "dev");
const lock = join(dist, ".dev-update-lock");
await mkdir(dist, { recursive: true });
await mkdir(lock).catch(() => {
  throw new Error(
    `Another desktop update is running. If it was interrupted, remove ${lock} and retry.`,
  );
});

try {
  // Build completely before touching the running app or the last good build.
  const { app } = await import("./package.ts");
  const processes = Bun.spawn(["/bin/ps", "-axo", "pid=,comm="], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const listing = await new Response(processes.stdout).text();
  if ((await processes.exited) !== 0)
    throw new Error("Could not inspect running desktop apps");
  const pids = listing.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) return [];
    const executable = match[2] ?? "";
    return executable.startsWith(`${dist}/`) &&
      executable.endsWith(
        "/Springroll Prototype.app/Contents/MacOS/springroll-desktop",
      )
      ? [Number(match[1])]
      : [];
  });
  console.log("Closing the previous desktop build…");
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  const deadline = Date.now() + 30_000;
  for (const pid of pids) {
    while (true) {
      try {
        process.kill(pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") break;
        throw error;
      }
      if (Date.now() > deadline)
        throw new Error(
          "The previous app did not finish quitting. Quit it and rerun bun run dev:mac.",
        );
      await Bun.sleep(200);
    }
  }
  const previous = join(dist, "dev-previous");
  await rm(previous, { recursive: true, force: true });
  let hadPrevious = false;
  try {
    await rename(destination, previous);
    hadPrevious = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await rename(dirname(app), destination);
  } catch (error) {
    if (hadPrevious) await rename(previous, destination);
    throw error;
  }
  const current = join(destination, "Springroll Prototype.app");
  // LaunchServices does not inherit this shell's environment. Pass the local
  // registered OAuth clients explicitly to the app.
  const launchArgs = ["/usr/bin/open"];
  for (const key of [
    "SPRINGROLL_GOOGLE_OAUTH_CLIENT_ID",
    "SPRINGROLL_GOOGLE_OAUTH_CLIENT_SECRET",
    "SPRINGROLL_MICROSOFT_OAUTH_CLIENT_ID",
  ]) {
    const value = process.env[key]?.trim();
    if (value) launchArgs.push("--env", `${key}=${value}`);
  }
  launchArgs.push(current);
  const launch = Bun.spawn(launchArgs);
  if ((await launch.exited) !== 0) throw new Error(`Could not open ${current}`);
  console.log(`Updated and opened: ${current}`);
} finally {
  await rm(lock, { recursive: true, force: true });
}
