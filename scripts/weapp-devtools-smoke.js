#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

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
const {
  acquireWeappSmokeLock,
  buildWeappSmokeAudit,
  ensureWeappSmokeOutputDir,
  extractDevtoolsPortConflict,
  readProjectConfigSummary,
  releaseWeappSmokeLock,
  resolveWeappSmokePaths,
  summarizePreviewResult,
  writeWeappSmokeArtifacts,
  buildWeappSmokeArtifacts
} = require("./weapp-devtools-smoke-lib");

const rootDir = path.resolve(__dirname, "..");
const smokePaths = resolveWeappSmokePaths(rootDir);
const projectDir = smokePaths.projectDir;
const previewQrPath = smokePaths.previewQrPath;
const previewInfoPath = smokePaths.previewInfoPath;
const desiredPort = String(process.env.WEAPP_DEVTOOLS_PORT || "23362");
const DEFAULT_TIMEOUT_MS = 120000;

function hasFlag(name) {
  return process.argv.includes(name);
}

function readNumberFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) {
    return fallback;
  }
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function runCommand(command, args, options = {}) {
  const isCmdShim = /\.(cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    encoding: "utf8",
    shell: isCmdShim,
    timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS
  });
  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  return {
    timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT"),
    status: typeof result.status === "number" ? result.status : 1,
    stdout,
    stderr,
    output: `${stdout}${stderr}`
  };
}

function logStep(title, details) {
  process.stdout.write(`\n[weapp-devtools] ${title}\n`);
  if (details) {
    process.stdout.write(`${details}\n`);
  }
}

function resolveCliFromWhere(binaryName) {
  const whereCommand = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "where.exe");
  const result = runCommand(whereCommand, [binaryName], { timeoutMs: 5000 });
  if (result.status !== 0) {
    return "";
  }
  const firstHit = result.stdout.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
  return firstHit && fs.existsSync(firstHit) ? firstHit : "";
}

function tryRegistryInstallLocation() {
  const regCommand = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "reg.exe");
  const keys = [
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall"
  ];

  for (const key of keys) {
    const result = runCommand(regCommand, ["query", key, "/s"], { timeoutMs: 15000 });
    if (result.status !== 0) {
      continue;
    }
    const lines = result.output.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!/DisplayName\s+REG_\w+\s+.*WeChat DevTools/i.test(line) && !/DisplayName\s+REG_\w+\s+.*微信开发者工具/i.test(line)) {
        continue;
      }
      for (let offset = index; offset < Math.min(index + 12, lines.length); offset += 1) {
        const installMatch = lines[offset].match(/InstallLocation\s+REG_\w+\s+(.+)$/i);
        if (installMatch) {
          return installMatch[1].trim().replace(/^"|"$/g, "");
        }
        const iconMatch = lines[offset].match(/DisplayIcon\s+REG_\w+\s+(.+)$/i);
        if (iconMatch) {
          return path.dirname(iconMatch[1].trim().replace(/^"|"$/g, ""));
        }
      }
    }
  }

  return "";
}

function resolveCliPath() {
  const candidates = [
    process.env.WEAPP_DEVTOOLS_CLI || "",
    resolveCliFromWhere("wechatidecli.cmd"),
    resolveCliFromWhere("cli.bat")
  ].filter(Boolean);

  const registryInstallLocation = tryRegistryInstallLocation();
  if (registryInstallLocation) {
    candidates.push(path.join(registryInstallLocation, "wechatidecli.cmd"));
    candidates.push(path.join(registryInstallLocation, "cli.bat"));
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function writeSmokeAudit(audit) {
  const artifacts = buildWeappSmokeArtifacts(audit, smokePaths.outputDir);
  writeWeappSmokeArtifacts(artifacts);
  return smokePaths.latestPath;
}

async function stopManagedDemoIfRequested(context) {
  if (!context.stopManagedDemoOnExit || !context.managedSession || !context.managedPaths) {
    return;
  }
  await stopManagedDemoSession(context.managedSession, { timeoutMs: 5000 }).catch(() => {});
  cleanupManagedDemoSession(context.managedPaths);
  logStep("demo-stop", "managed demo session stopped after smoke");
}

function buildStepResults(context) {
  return {
    cliResolved: Boolean(context.cliPath),
    openStatus: Number(context.openResult && context.openResult.status || 0),
    autoStatus: Number(context.autoResult && context.autoResult.status || 0),
    previewStatus: Number(context.previewResult && context.previewResult.status || 0),
    timedOut: Boolean(
      (context.openResult && context.openResult.timedOut) ||
      (context.autoResult && context.autoResult.timedOut) ||
      (context.previewResult && context.previewResult.timedOut)
    ),
    openOutput: String(context.openResult && context.openResult.output || ""),
    autoOutput: String(context.autoResult && context.autoResult.output || ""),
    previewOutput: String(context.previewResult && context.previewResult.output || "")
  };
}

function finalizeSmoke(context, summary) {
  const audit = buildWeappSmokeAudit({
    cliPath: context.cliPath,
    devtoolsPort: context.devtoolsPort,
    projectConfig: context.projectConfig,
    summary,
    ensureDemo: context.ensureDemo,
    startedManagedDemo: context.startedManagedDemo,
    stopManagedDemoOnExit: context.stopManagedDemoOnExit,
    stepResults: buildStepResults(context),
    previewInfoPath,
    previewInfoExists: fs.existsSync(previewInfoPath),
    previewQrPath,
    previewQrExists: fs.existsSync(previewQrPath),
    demoStatus: context.demoSelection ? context.demoSelection.status : null,
    demoReachable: Boolean(context.demoSelection && context.demoSelection.reachable),
    managedSession: context.managedSession
  });
  const latestAuditPath = writeSmokeAudit(audit);
  logStep("summary", `${summary.mode}: ${summary.message}`);
  logStep("audit", latestAuditPath);
  if (fs.existsSync(previewInfoPath)) {
    logStep("preview-info", previewInfoPath);
  }
  if (fs.existsSync(previewQrPath)) {
    logStep("preview-qr", previewQrPath);
  }
  return {
    audit,
    latestAuditPath
  };
}

function buildBaseArgs(devtoolsPort) {
  return ["--project", projectDir, "--port", String(devtoolsPort || desiredPort)];
}

function runDevtoolsFlow(context) {
  const baseArgs = buildBaseArgs(context.devtoolsPort);

  context.openResult = runCommand(context.cliPath, ["open", ...baseArgs], { timeoutMs: 45000 });
  logStep("open", context.openResult.output.trim());
  if (context.openResult.status !== 0) {
    return false;
  }

  context.autoResult = runCommand(context.cliPath, ["auto", ...baseArgs, "--trust-project"], { timeoutMs: 45000 });
  logStep("auto", context.autoResult.output.trim());
  if (context.autoResult.status !== 0) {
    return false;
  }

  context.previewResult = runCommand(context.cliPath, [
    "preview",
    ...baseArgs,
    "--qr-format",
    "image",
    "--qr-output",
    previewQrPath,
    "--info-output",
    previewInfoPath
  ], { timeoutMs: 150000 });
  logStep("preview", context.previewResult.output.trim());
  return true;
}

function resolvePortConflict(context) {
  const outputs = [
    context.openResult && context.openResult.output,
    context.autoResult && context.autoResult.output,
    context.previewResult && context.previewResult.output
  ];
  for (const output of outputs) {
    const conflict = extractDevtoolsPortConflict(output);
    if (conflict) {
      return conflict;
    }
  }
  return null;
}

async function ensureManagedDemoForSmoke(context) {
  const managedPaths = buildManagedDemoPaths(rootDir);
  const timeoutMs = readNumberFlag("--demo-timeout-ms", 90000);
  const pollMs = readNumberFlag("--demo-poll-ms", 500);
  const noIngest = !hasFlag("--with-ingest");

  context.managedPaths = managedPaths;

  const existingSession = readManagedDemoSession(managedPaths.sessionFile);
  if (existingSession && isManagedDemoSessionRunning(existingSession)) {
    const existingSelection = await waitForManagedDemoReady(rootDir, {
      pid: existingSession.pid,
      timeoutMs: 1500,
      pollMs: 250,
      strictServeOnly: true
    });
    if (existingSelection && existingSelection.reachable) {
      context.managedSession = existingSession;
      context.demoSelection = existingSelection;
      return;
    }
    await stopManagedDemoSession(existingSession, { timeoutMs: 5000 }).catch(() => {});
    cleanupManagedDemoSession(managedPaths);
  } else if (existingSession) {
    cleanupManagedDemoSession(managedPaths);
  }

  const session = spawnManagedDemoSession(managedPaths, {
    noIngest,
    port: 0,
    statusDir: managedPaths.outputDir
  });
  context.startedManagedDemo = true;
  context.managedSession = session;
  writeManagedDemoSession(managedPaths.sessionFile, session);

  const selection = await waitForManagedDemoReady(rootDir, {
    pid: session.pid,
    timeoutMs,
    pollMs,
    notBefore: session.startedAt,
    strictServeOnly: true
  });
  if (!selection || !selection.reachable) {
    throw new Error(`managed demo did not become reachable within ${timeoutMs}ms; inspect ${managedPaths.stdoutLog}`);
  }

  context.demoSelection = selection;
}

async function main() {
  const projectConfig = readProjectConfigSummary(projectDir);
  const context = {
    projectConfig,
    ensureDemo: !hasFlag("--skip-demo"),
    stopManagedDemoOnExit: hasFlag("--stop-demo-on-exit"),
    devtoolsPort: desiredPort,
    startedManagedDemo: false,
    managedSession: null,
    managedPaths: null,
    demoSelection: null,
    cliPath: "",
    openResult: null,
    autoResult: null,
    previewResult: null,
    lockOwner: null
  };

  try {
    context.lockOwner = await acquireWeappSmokeLock(smokePaths.lockPath, {
      purpose: "weapp-devtools-smoke"
    });
    ensureWeappSmokeOutputDir(smokePaths);

    if (context.ensureDemo) {
      logStep("ensure-demo", "resolving managed local demo session");
      await ensureManagedDemoForSmoke(context);
      logStep("demo", context.demoSelection && context.demoSelection.status ? context.demoSelection.status.demoUrl : "(not available)");
    }

    context.cliPath = resolveCliPath();
    if (!context.cliPath) {
      const summary = {
        ok: false,
        mode: "cli-not-found",
        message: "unable to locate wechatidecli.cmd"
      };
      finalizeSmoke(context, summary);
      process.stderr.write("[weapp-devtools] unable to locate wechatidecli.cmd\n");
      process.exitCode = 2;
      return;
    }

    logStep("CLI", context.cliPath);
    runDevtoolsFlow(context);

    const portConflict = resolvePortConflict(context);
    if (portConflict && portConflict.currentPort !== context.devtoolsPort) {
      logStep("port-fallback", `reusing active IDE server on port ${portConflict.currentPort}`);
      context.devtoolsPort = portConflict.currentPort;
      context.openResult = null;
      context.autoResult = null;
      context.previewResult = null;
      runDevtoolsFlow(context);
    }

    if (!context.openResult || context.openResult.status !== 0) {
      finalizeSmoke(context, {
        ok: false,
        mode: "open-failed",
        message: "devtools open command failed"
      });
      process.stderr.write("[weapp-devtools] open failed\n");
      process.exitCode = context.openResult && context.openResult.status ? context.openResult.status : 1;
      return;
    }

    if (!context.autoResult || context.autoResult.status !== 0) {
      finalizeSmoke(context, {
        ok: false,
        mode: "auto-failed",
        message: "devtools auto command failed"
      });
      process.stderr.write("[weapp-devtools] auto failed\n");
      process.exitCode = context.autoResult && context.autoResult.status ? context.autoResult.status : 1;
      return;
    }

    if (!context.previewResult) {
      finalizeSmoke(context, {
        ok: false,
        mode: "preview-missing",
        message: "devtools preview command did not run"
      });
      process.stderr.write("[weapp-devtools] preview missing\n");
      process.exitCode = 1;
      return;
    }

    const summary = summarizePreviewResult(context.previewResult, {
      previewInfoPath,
      previewQrPath
    });
    finalizeSmoke(context, summary);

    if (!summary.ok) {
      process.stderr.write("[weapp-devtools] smoke failed\n");
      process.exitCode = context.previewResult.status || 1;
    }
  } catch (error) {
    finalizeSmoke(context, {
      ok: false,
      mode: "unexpected-error",
      message: error.message || "unexpected error"
    });
    throw error;
  } finally {
    await stopManagedDemoIfRequested(context);
    if (context.lockOwner) {
      releaseWeappSmokeLock(smokePaths.lockPath, context.lockOwner);
    }
  }
}

main().catch((error) => {
  console.error(`[weapp-devtools] failed: ${error.message}`);
  process.exit(1);
});
