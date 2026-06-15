#!/usr/bin/env node

const {
  buildManagedDemoPaths,
  cleanupManagedDemoSession,
  isManagedDemoSessionRunning,
  readManagedDemoSession,
  stopManagedDemoSession
} = require("./demo-serve-lib");

async function main() {
  const paths = buildManagedDemoPaths();
  const session = readManagedDemoSession(paths.sessionFile);

  if (!session) {
    console.log("[demo-stop] no managed demo session file found.");
    cleanupManagedDemoSession(paths);
    return;
  }

  if (!isManagedDemoSessionRunning(session)) {
    console.log("[demo-stop] managed demo session is already stopped; cleaning stale metadata.");
    cleanupManagedDemoSession(paths);
    return;
  }

  console.log(`[demo-stop] stopping managed demo session (pid=${session.pid}) ...`);
  const result = await stopManagedDemoSession(session, { timeoutMs: 5000 });
  cleanupManagedDemoSession(paths);

  if (!result.stopped) {
    throw new Error(`managed demo session stop did not finish cleanly (${result.reason}).`);
  }

  console.log("[demo-stop] managed demo session stopped.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
