const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildDemoStatusPaths,
  readDemoStatus,
  requestStatusUrl,
  resolvePreferredDemoStatus
} = require("./demo-status-lib");

function buildManagedDemoPaths(repoRoot = path.resolve(__dirname, "..")) {
  const outputDir = path.join(repoRoot, "output", "demo-start");
  return {
    repoRoot,
    outputDir,
    sessionFile: path.join(outputDir, "managed-session.json"),
    stdoutLog: path.join(outputDir, "serve.stdout.log"),
    stderrLog: path.join(outputDir, "serve.stderr.log"),
    runtimeEnvFile: path.join(repoRoot, "apps", "weapp", "env.runtime.js")
  };
}

function normalizeManagedDemoSession(session = {}) {
  return {
    pid: Number(session.pid || 0),
    startedAt: String(session.startedAt || ""),
    command: String(session.command || ""),
    args: Array.isArray(session.args) ? session.args.map((item) => String(item)) : [],
    cwd: String(session.cwd || ""),
    stdoutLog: String(session.stdoutLog || ""),
    stderrLog: String(session.stderrLog || ""),
    statusDir: String(session.statusDir || ""),
    sessionKind: "serve"
  };
}

function buildManagedDemoSession(options = {}) {
  return normalizeManagedDemoSession({
    pid: options.pid,
    startedAt: options.startedAt || new Date().toISOString(),
    command: options.command || process.execPath,
    args: options.args || [],
    cwd: options.cwd || path.resolve(__dirname, ".."),
    stdoutLog: options.stdoutLog || "",
    stderrLog: options.stderrLog || "",
    statusDir: options.statusDir || ""
  });
}

function readManagedDemoSession(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return normalizeManagedDemoSession(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function writeManagedDemoSession(filePath, session) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(normalizeManagedDemoSession(session), null, 2)}\n`, "utf8");
}

function removeManagedDemoSession(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

function isPidAlive(pid) {
  const normalizedPid = Number(pid || 0);
  if (!Number.isInteger(normalizedPid) || normalizedPid <= 0) {
    return false;
  }
  try {
    process.kill(normalizedPid, 0);
    return true;
  } catch (error) {
    if (error && (error.code === "EPERM" || error.code === "EACCES")) {
      return true;
    }
    return false;
  }
}

function isManagedDemoSessionRunning(session) {
  return Boolean(session && isPidAlive(session.pid));
}

function cleanupManagedDemoSession(paths, options = {}) {
  removeManagedDemoSession(paths.sessionFile);
  if (options.removeRuntimeEnv !== false && fs.existsSync(paths.runtimeEnvFile)) {
    fs.rmSync(paths.runtimeEnvFile, { force: true });
  }
}

function buildDemoStartArgs(options = {}) {
  const args = [path.join("scripts", "demo-start.js")];

  if (options.noIngest) {
    args.push("--no-ingest");
  }

  const port = Number(options.port);
  if (Number.isInteger(port) && port >= 0) {
    args.push("--port", String(port));
  }

  const mappings = [
    ["storeRoot", "--store-root"],
    ["snapshotTarget", "--snapshot-target"],
    ["demoSnapshotTarget", "--demo-snapshot-target"],
    ["positionOverridePath", "--position-override-path"],
    ["userStateFile", "--user-state-file"],
    ["statusDir", "--status-dir"]
  ];

  mappings.forEach(([key, flag]) => {
    if (options[key]) {
      args.push(flag, path.resolve(String(options[key])));
    }
  });

  return args;
}

function spawnManagedDemoSession(paths, options = {}) {
  fs.mkdirSync(paths.outputDir, { recursive: true });
  const stdoutFd = fs.openSync(paths.stdoutLog, "a");
  const stderrFd = fs.openSync(paths.stderrLog, "a");
  const args = buildDemoStartArgs({
    ...options,
    statusDir: options.statusDir || paths.outputDir
  });

  const child = cp.spawn(process.execPath, args, {
    cwd: paths.repoRoot,
    detached: true,
    stdio: ["ignore", stdoutFd, stderrFd],
    windowsHide: true
  });

  child.unref();

  return buildManagedDemoSession({
    pid: child.pid,
    command: process.execPath,
    args,
    cwd: paths.repoRoot,
    stdoutLog: paths.stdoutLog,
    stderrLog: paths.stderrLog,
    statusDir: options.statusDir || paths.outputDir
  });
}

function sleep(timeoutMs) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

async function waitForManagedDemoReady(repoRoot = path.resolve(__dirname, ".."), options = {}) {
  const timeoutMs = Number(options.timeoutMs || 45000);
  const pollMs = Number(options.pollMs || 500);
  const pid = Number(options.pid || 0);
  const notBefore = String(options.notBefore || "");
  const strictServeOnly = options.strictServeOnly !== false;
  const startedAt = Date.now();
  const { latestServe } = buildDemoStatusPaths(repoRoot);

  while (Date.now() - startedAt <= timeoutMs) {
    if (fs.existsSync(latestServe)) {
      const status = readDemoStatus(latestServe);
      const generatedAt = String(status.generatedAt || "");
      if (!notBefore || (generatedAt && generatedAt >= notBefore)) {
        const reachable = await requestStatusUrl(status.healthUrl);
        if (reachable) {
          return {
            path: latestServe,
            status,
            reachable: true
          };
        }
      }
    }

    if (!notBefore && !strictServeOnly) {
      const selection = await resolvePreferredDemoStatus(repoRoot, { preference: "serve" });
      if (selection && selection.reachable) {
        return selection;
      }
    }
    if (pid > 0 && !isPidAlive(pid)) {
      return null;
    }
    await sleep(pollMs);
  }

  return null;
}

async function stopManagedDemoSession(session, options = {}) {
  const pid = Number(session && session.pid || 0);
  if (!Number.isInteger(pid) || pid <= 0) {
    return {
      stopped: false,
      reason: "missing-pid"
    };
  }
  if (!isPidAlive(pid)) {
    return {
      stopped: false,
      reason: "not-running"
    };
  }

  if (process.platform === "win32") {
    const taskkillCommand = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
    cp.execFileSync(taskkillCommand, ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch (_error) {
      process.kill(pid, "SIGTERM");
    }
  }

  const waitTimeoutMs = Number(options.timeoutMs || 5000);
  const startedAt = Date.now();
  while (Date.now() - startedAt <= waitTimeoutMs) {
    if (!isPidAlive(pid)) {
      return {
        stopped: true,
        reason: "stopped"
      };
    }
    await sleep(150);
  }

  return {
    stopped: !isPidAlive(pid),
    reason: isPidAlive(pid) ? "timeout" : "stopped"
  };
}

module.exports = {
  buildManagedDemoPaths,
  normalizeManagedDemoSession,
  buildManagedDemoSession,
  readManagedDemoSession,
  writeManagedDemoSession,
  removeManagedDemoSession,
  isPidAlive,
  isManagedDemoSessionRunning,
  cleanupManagedDemoSession,
  buildDemoStartArgs,
  spawnManagedDemoSession,
  waitForManagedDemoReady,
  stopManagedDemoSession
};
