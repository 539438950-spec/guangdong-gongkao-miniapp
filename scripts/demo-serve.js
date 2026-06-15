#!/usr/bin/env node

const {
  buildManagedDemoPaths,
  cleanupManagedDemoSession,
  isManagedDemoSessionRunning,
  readManagedDemoSession,
  spawnManagedDemoSession,
  stopManagedDemoSession,
  waitForManagedDemoReady,
  writeManagedDemoSession
} = require("./demo-serve-lib");
const { renderDemoStatusText } = require("./demo-status-lib");

function hasFlag(name) {
  return process.argv.includes(name);
}

function readFlagValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) {
    return "";
  }
  return process.argv[index + 1];
}

function readNumberFlag(name, fallback) {
  const raw = readFlagValue(name);
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildSpawnOptions(paths) {
  return {
    noIngest: hasFlag("--no-ingest"),
    port: readNumberFlag("--port", null),
    timeoutMs: readNumberFlag("--timeout-ms", 45000),
    pollMs: readNumberFlag("--poll-ms", 500),
    statusDir: paths.outputDir
  };
}

async function main() {
  const paths = buildManagedDemoPaths();
  const existingSession = readManagedDemoSession(paths.sessionFile);
  const restart = hasFlag("--restart");

  if (existingSession && isManagedDemoSessionRunning(existingSession)) {
    if (!restart) {
      const readySelection = await waitForManagedDemoReady(paths.repoRoot, {
        pid: existingSession.pid,
        timeoutMs: 1500,
        pollMs: 250,
        strictServeOnly: true
      });

      console.log(`[demo-serve] managed demo is already running (pid=${existingSession.pid}).`);
      console.log(`[demo-serve] session file: ${paths.sessionFile}`);
      console.log(`[demo-serve] stdout log: ${existingSession.stdoutLog || paths.stdoutLog}`);
      console.log(`[demo-serve] stderr log: ${existingSession.stderrLog || paths.stderrLog}`);
      if (readySelection && readySelection.status) {
        process.stdout.write(renderDemoStatusText(readySelection.status));
        process.stdout.write(`statusFile: ${readySelection.path}\n`);
        process.stdout.write("reachable: true\n");
      }
      return;
    }

    console.log(`[demo-serve] restarting managed demo session (pid=${existingSession.pid}) ...`);
    await stopManagedDemoSession(existingSession, { timeoutMs: 5000 });
    cleanupManagedDemoSession(paths);
  } else if (existingSession) {
    console.log("[demo-serve] removing stale managed demo session metadata.");
    cleanupManagedDemoSession(paths);
  }

  const spawnOptions = buildSpawnOptions(paths);
  const session = spawnManagedDemoSession(paths, spawnOptions);
  writeManagedDemoSession(paths.sessionFile, session);

  console.log(`[demo-serve] started managed demo session (pid=${session.pid}).`);
  console.log(`[demo-serve] session file: ${paths.sessionFile}`);
  console.log(`[demo-serve] stdout log: ${paths.stdoutLog}`);
  console.log(`[demo-serve] stderr log: ${paths.stderrLog}`);

  const readySelection = await waitForManagedDemoReady(paths.repoRoot, {
    pid: session.pid,
    timeoutMs: spawnOptions.timeoutMs,
    pollMs: spawnOptions.pollMs,
    notBefore: session.startedAt,
    strictServeOnly: true
  });

  if (!readySelection || !readySelection.status) {
    throw new Error(`managed demo did not become reachable within ${spawnOptions.timeoutMs}ms; inspect ${paths.stdoutLog}`);
  }

  process.stdout.write(renderDemoStatusText(readySelection.status));
  process.stdout.write(`statusFile: ${readySelection.path}\n`);
  process.stdout.write("reachable: true\n");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
