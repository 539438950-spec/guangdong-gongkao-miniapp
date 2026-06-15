const fs = require("node:fs");
const path = require("node:path");

function resolveWeappSmokePaths(repoRoot = path.resolve(__dirname, "..")) {
  const outputDir = path.join(repoRoot, "output", "weapp-devtools");
  return {
    repoRoot,
    projectDir: path.join(repoRoot, "apps", "weapp"),
    outputDir,
    lockPath: path.join(outputDir, "active-run.lock"),
    legacyLockPath: path.join(outputDir, "active-run.lock.json"),
    previewQrPath: path.join(outputDir, "preview-qr.png"),
    previewInfoPath: path.join(outputDir, "preview-info.json"),
    latestPath: path.join(outputDir, "latest.json"),
    readmePath: path.join(outputDir, "README.txt")
  };
}

function ensureWeappSmokeOutputDir(paths) {
  fs.mkdirSync(paths.outputDir, { recursive: true });
  if (paths.legacyLockPath && fs.existsSync(paths.legacyLockPath)) {
    fs.rmSync(paths.legacyLockPath, { force: true });
  }
  [paths.previewQrPath, paths.previewInfoPath].forEach((target) => {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
    }
  });
}

function sleep(timeoutMs) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
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

function readWeappSmokeLock(lockPath) {
  if (!lockPath || !fs.existsSync(lockPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function removeWeappSmokeLock(lockPath) {
  if (lockPath && fs.existsSync(lockPath)) {
    fs.rmSync(lockPath, { force: true });
  }
}

function isStaleWeappSmokeLock(lock = {}, options = {}) {
  const staleAfterMs = Number(options.staleAfterMs || 10 * 60 * 1000);
  const startedAt = Date.parse(String(lock.startedAt || ""));
  if (!isPidAlive(lock.pid)) {
    return true;
  }
  if (!Number.isFinite(startedAt)) {
    return false;
  }
  return Date.now() - startedAt > staleAfterMs;
}

async function acquireWeappSmokeLock(lockPath, options = {}) {
  const waitTimeoutMs = Number(options.waitTimeoutMs || 5 * 60 * 1000);
  const pollMs = Number(options.pollMs || 500);
  const staleAfterMs = Number(options.staleAfterMs || 10 * 60 * 1000);
  const owner = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    purpose: String(options.purpose || "weapp-devtools-smoke")
  };
  const startedAt = Date.now();
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  while (Date.now() - startedAt <= waitTimeoutMs) {
    try {
      fs.writeFileSync(lockPath, `${JSON.stringify(owner, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx"
      });
      return owner;
    } catch (error) {
      if (!error || error.code !== "EEXIST") {
        throw error;
      }
      const existing = readWeappSmokeLock(lockPath);
      if (!existing || isStaleWeappSmokeLock(existing, { staleAfterMs })) {
        removeWeappSmokeLock(lockPath);
        continue;
      }
      await sleep(pollMs);
    }
  }

  const activeLock = readWeappSmokeLock(lockPath);
  const ownerPid = activeLock && activeLock.pid ? ` pid=${activeLock.pid}` : "";
  throw new Error(`timed out waiting for weapp smoke lock:${ownerPid}`);
}

function releaseWeappSmokeLock(lockPath, owner) {
  const existing = readWeappSmokeLock(lockPath);
  if (!existing) {
    return;
  }
  if (
    Number(existing.pid || 0) === Number(owner && owner.pid || 0)
    && String(existing.startedAt || "") === String(owner && owner.startedAt || "")
  ) {
    removeWeappSmokeLock(lockPath);
  }
}

function readProjectConfigSummary(projectDir) {
  const configPath = path.join(projectDir, "project.config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`missing project config: ${configPath}`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return {
    appId: String(config.appid || ""),
    projectName: String(config.projectname || ""),
    compileType: String(config.compileType || ""),
    miniprogramRoot: String(config.miniprogramRoot || "")
  };
}

function summarizePreviewResult(result, options = {}) {
  const output = String(result.output || "");
  const previewInfoPath = String(options.previewInfoPath || "");
  const previewQrPath = String(options.previewQrPath || "");
  const hasPreviewPhase = output.includes("- Preview");
  const hasUploadingPhase = output.includes("Uploading");
  const hasCompileStart = /compile_start/i.test(output);
  const hasAppIdMissing = /appid missing|41002/i.test(output);
  const hasUploadSizeLimit = /source size .* exceed max limit 2MB|错误码：80051/i.test(output);
  const hasInvalidSitemap = /Invalid SiteMap|sitemap错误|缺少rules字段/i.test(output);
  const hasGenericCode10 = /code[:\s]+10\b/i.test(output);
  const hasCompileError = (
    /compile_start[\s\S]*code 10/i.test(output) ||
    /code 10[\s\S]*compile_start/i.test(output) ||
    (hasCompileStart && hasGenericCode10)
  ) && !hasUploadingPhase;
  const portConflict = extractDevtoolsPortConflict(output);
  const infoExists = previewInfoPath ? fs.existsSync(previewInfoPath) : false;
  const qrExists = previewQrPath ? fs.existsSync(previewQrPath) : false;

  if ((infoExists || qrExists) && (result.status === 0 || hasPreviewPhase || hasUploadingPhase)) {
    return {
      ok: true,
      mode: "preview-success",
      message: result.timedOut
        ? "preview generated output files before the CLI timed out"
        : "preview succeeded and generated output files"
    };
  }

  if ((hasPreviewPhase || hasUploadingPhase) && hasAppIdMissing) {
    return {
      ok: true,
      mode: "compile-ok-upload-blocked",
      message: "local compile succeeded; remote preview upload is blocked by appid restrictions"
    };
  }

  if ((hasPreviewPhase || hasUploadingPhase) && hasUploadSizeLimit) {
    return {
      ok: true,
      mode: "compile-ok-upload-blocked",
      message: "local compile succeeded; remote preview upload is blocked by the 2MB source size limit"
    };
  }

  if ((hasPreviewPhase || hasUploadingPhase) && hasInvalidSitemap) {
    return {
      ok: false,
      mode: "preview-config-invalid",
      message: "preview upload is blocked by invalid sitemap configuration"
    };
  }

  if (portConflict) {
    return {
      ok: false,
      mode: "port-conflict",
      message: `devtools IDE server is already running on port ${portConflict.currentPort}`
    };
  }

  if (result.timedOut && hasUploadingPhase) {
    return {
      ok: false,
      mode: "upload-timeout",
      message: "preview timed out during upload"
    };
  }

  if (hasUploadingPhase && hasGenericCode10) {
    return {
      ok: false,
      mode: "upload-failed",
      message: "preview upload failed after local compile"
    };
  }

  if (hasCompileError) {
    return {
      ok: false,
      mode: "compile-failed",
      message: "devtools compile failed before upload"
    };
  }

  return {
    ok: false,
    mode: "unknown",
    message: "unable to classify preview result"
  };
}

function extractDevtoolsPortConflict(output) {
  const text = String(output || "");
  const match = text.match(/IDE server has started on http:\/\/127\.0\.0\.1:(\d+) and must be restarted on port (\d+) first/i);
  if (!match) {
    return null;
  }
  return {
    currentPort: match[1],
    requestedPort: match[2]
  };
}

function buildWeappSmokeAudit(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const projectConfig = options.projectConfig || {};
  const summary = options.summary || {};
  const demoStatus = options.demoStatus || null;
  const managedSession = options.managedSession || null;
  const stepResults = options.stepResults || {};

  return {
    generatedAt,
    statusId: String(generatedAt).replace(/[:.]/g, "-"),
    ok: Boolean(summary.ok),
    mode: String(summary.mode || "unknown"),
    message: String(summary.message || ""),
    cliPath: String(options.cliPath || ""),
    devtoolsPort: String(options.devtoolsPort || ""),
    project: {
      appId: String(projectConfig.appId || ""),
      projectName: String(projectConfig.projectName || ""),
      compileType: String(projectConfig.compileType || ""),
      miniprogramRoot: String(projectConfig.miniprogramRoot || "")
    },
    commands: {
      ensureDemo: Boolean(options.ensureDemo),
      startedManagedDemo: Boolean(options.startedManagedDemo),
      stopManagedDemoOnExit: Boolean(options.stopManagedDemoOnExit)
    },
    steps: {
      cliResolved: Boolean(stepResults.cliResolved),
      openStatus: Number(stepResults.openStatus || 0),
      autoStatus: Number(stepResults.autoStatus || 0),
      previewStatus: Number(stepResults.previewStatus || 0),
      timedOut: Boolean(stepResults.timedOut),
      openOutput: String(stepResults.openOutput || ""),
      autoOutput: String(stepResults.autoOutput || ""),
      previewOutput: String(stepResults.previewOutput || "")
    },
    outputs: {
      previewInfoPath: String(options.previewInfoPath || ""),
      previewInfoExists: Boolean(options.previewInfoExists),
      previewQrPath: String(options.previewQrPath || ""),
      previewQrExists: Boolean(options.previewQrExists)
    },
    demo: demoStatus ? {
      reachable: Boolean(options.demoReachable),
      managed: Boolean(managedSession),
      baseUrl: String(demoStatus.baseUrl || ""),
      demoUrl: String(demoStatus.demoUrl || ""),
      healthUrl: String(demoStatus.healthUrl || ""),
      actualPort: Number(demoStatus.actualPort || 0),
      generatedAt: String(demoStatus.generatedAt || "")
    } : {
      reachable: false,
      managed: Boolean(managedSession),
      baseUrl: "",
      demoUrl: "",
      healthUrl: "",
      actualPort: 0,
      generatedAt: ""
    },
    managedSession: managedSession ? {
      pid: Number(managedSession.pid || 0),
      startedAt: String(managedSession.startedAt || ""),
      stdoutLog: String(managedSession.stdoutLog || ""),
      stderrLog: String(managedSession.stderrLog || "")
    } : null
  };
}

function renderWeappSmokeReadme(audit) {
  const lines = [
    "WeChat DevTools Smoke",
    `ok: ${audit.ok ? "true" : "false"}`,
    `mode: ${audit.mode}`,
    `message: ${audit.message}`,
    `generatedAt: ${audit.generatedAt}`,
    `cliPath: ${audit.cliPath || "(not found)"}`,
    `devtoolsPort: ${audit.devtoolsPort || "(unknown)"}`,
    "",
    "Project",
    `- appId: ${audit.project.appId || "(missing)"}`,
    `- projectName: ${audit.project.projectName || "(missing)"}`,
    `- compileType: ${audit.project.compileType || "(missing)"}`,
    `- miniprogramRoot: ${audit.project.miniprogramRoot || "(missing)"}`,
    "",
    "Steps",
    `- cliResolved: ${audit.steps.cliResolved ? "true" : "false"}`,
    `- openStatus: ${audit.steps.openStatus}`,
    `- autoStatus: ${audit.steps.autoStatus}`,
    `- previewStatus: ${audit.steps.previewStatus}`,
    `- timedOut: ${audit.steps.timedOut ? "true" : "false"}`,
    "",
    "Demo",
    `- reachable: ${audit.demo.reachable ? "true" : "false"}`,
    `- managed: ${audit.demo.managed ? "true" : "false"}`,
    `- baseUrl: ${audit.demo.baseUrl || "(not available)"}`,
    `- demoUrl: ${audit.demo.demoUrl || "(not available)"}`,
    `- actualPort: ${audit.demo.actualPort || 0}`,
    "",
    "Outputs",
    `- previewInfo: ${audit.outputs.previewInfoExists ? audit.outputs.previewInfoPath : "(not generated)"}`,
    `- previewQr: ${audit.outputs.previewQrExists ? audit.outputs.previewQrPath : "(not generated)"}`
  ];

  if (audit.managedSession) {
    lines.push("");
    lines.push("Managed session");
    lines.push(`- pid: ${audit.managedSession.pid}`);
    lines.push(`- stdoutLog: ${audit.managedSession.stdoutLog}`);
    lines.push(`- stderrLog: ${audit.managedSession.stderrLog}`);
  }

  return `${lines.join("\n")}\n`;
}

function buildWeappSmokeArtifacts(audit, outputDir) {
  return [
    {
      path: path.join(outputDir, `${audit.statusId}.json`),
      content: `${JSON.stringify(audit, null, 2)}\n`
    },
    {
      path: path.join(outputDir, "latest.json"),
      content: `${JSON.stringify(audit, null, 2)}\n`
    },
    {
      path: path.join(outputDir, "README.txt"),
      content: renderWeappSmokeReadme(audit)
    }
  ];
}

function writeWeappSmokeArtifacts(artifacts = []) {
  artifacts.forEach((artifact) => {
    fs.mkdirSync(path.dirname(artifact.path), { recursive: true });
    fs.writeFileSync(artifact.path, artifact.content, "utf8");
  });
}

module.exports = {
  resolveWeappSmokePaths,
  ensureWeappSmokeOutputDir,
  isPidAlive,
  readWeappSmokeLock,
  removeWeappSmokeLock,
  isStaleWeappSmokeLock,
  acquireWeappSmokeLock,
  releaseWeappSmokeLock,
  readProjectConfigSummary,
  summarizePreviewResult,
  extractDevtoolsPortConflict,
  buildWeappSmokeAudit,
  renderWeappSmokeReadme,
  buildWeappSmokeArtifacts,
  writeWeappSmokeArtifacts
};
