const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

function buildDemoStatusPaths(repoRoot = path.resolve(__dirname, "..")) {
  const outputDir = path.join(repoRoot, "output", "demo-start");
  return {
    latestAny: path.join(outputDir, "latest.json"),
    latestServe: path.join(outputDir, "latest-serve.json"),
    latestCheck: path.join(outputDir, "latest-check.json")
  };
}

function defaultDemoStatusPath(repoRoot = path.resolve(__dirname, ".."), options = {}) {
  const { latestAny, latestServe, latestCheck } = buildDemoStatusPaths(repoRoot);
  const preference = String(options.preference || "serve");

  if (preference === "check") {
    return fs.existsSync(latestCheck) ? latestCheck : latestAny;
  }
  if (preference === "any") {
    return latestAny;
  }

  if (fs.existsSync(latestServe)) {
    return latestServe;
  }
  if (fs.existsSync(latestAny)) {
    return latestAny;
  }
  if (fs.existsSync(latestCheck)) {
    return latestCheck;
  }
  return latestAny;
}

function buildDemoStatusCandidatePaths(repoRoot = path.resolve(__dirname, ".."), options = {}) {
  const { latestAny, latestServe, latestCheck } = buildDemoStatusPaths(repoRoot);
  const preference = String(options.preference || "serve");

  if (preference === "check") {
    return [latestCheck, latestAny, latestServe];
  }
  if (preference === "any") {
    return [latestAny, latestServe, latestCheck];
  }
  return [latestServe, latestAny, latestCheck];
}

function readDemoStatus(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`demo status file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function requestStatusUrl(targetUrl, timeoutMs = 1200) {
  if (!targetUrl) {
    return Promise.resolve(false);
  }

  let target;
  try {
    target = new URL(targetUrl);
  } catch (_error) {
    return Promise.resolve(false);
  }

  const transport = target.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    const request = transport.request(target, {
      method: "GET",
      agent: false,
      headers: {
        connection: "close"
      }
    }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 300);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolve(false);
    });
    request.end();
  });
}

async function resolvePreferredDemoStatus(repoRoot = path.resolve(__dirname, ".."), options = {}) {
  const candidatePaths = buildDemoStatusCandidatePaths(repoRoot, options);
  const seen = new Set();
  const existing = [];

  candidatePaths.forEach((candidatePath) => {
    if (seen.has(candidatePath)) {
      return;
    }
    seen.add(candidatePath);
    if (fs.existsSync(candidatePath)) {
      existing.push(candidatePath);
    }
  });

  for (const candidatePath of existing) {
    const status = readDemoStatus(candidatePath);
    const reachable = await requestStatusUrl(status.healthUrl);
    if (reachable) {
      return {
        path: candidatePath,
        status,
        reachable: true
      };
    }
  }

  if (existing.length) {
    return {
      path: existing[0],
      status: readDemoStatus(existing[0]),
      reachable: false
    };
  }

  return {
    path: defaultDemoStatusPath(repoRoot, options),
    status: null,
    reachable: false
  };
}

function normalizeDemoStatus(status = {}) {
  return {
    generatedAt: String(status.generatedAt || ""),
    status: String(status.status || ""),
    sessionKind: String(status.sessionKind || (status.check ? "check" : "")),
    baseUrl: String(status.baseUrl || ""),
    demoUrl: String(status.demoUrl || ""),
    healthUrl: String(status.healthUrl || ""),
    rpcUrl: String(status.rpcUrl || ""),
    check: Boolean(status.check),
    noIngest: Boolean(status.noIngest),
    requestedPort: Number(status.requestedPort || 0),
    actualPort: Number(status.actualPort || 0),
    portFallback: Boolean(status.portFallback),
    snapshotSummary: {
      noticeCount: Number(status.snapshotSummary && status.snapshotSummary.noticeCount || 0),
      positionCount: Number(status.snapshotSummary && status.snapshotSummary.positionCount || 0),
      sourceCount: Number(status.snapshotSummary && status.snapshotSummary.sourceCount || 0),
      pendingReviewCount: Number(status.snapshotSummary && status.snapshotSummary.pendingReviewCount || 0),
      compareGroupCount: Number(status.snapshotSummary && status.snapshotSummary.compareGroupCount || 0)
    },
    verificationSummary: {
      noticeCount: Number(status.verificationSummary && status.verificationSummary.noticeCount || 0),
      sourceStateCount: Number(status.verificationSummary && status.verificationSummary.sourceStateCount || 0),
      reviewQueueCount: Number(status.verificationSummary && status.verificationSummary.reviewQueueCount || 0),
      compareGroupCount: Number(status.verificationSummary && status.verificationSummary.compareGroupCount || 0),
      structuredPositionCount: Number(status.verificationSummary && status.verificationSummary.structuredPositionCount || 0)
    },
    healthReportSummary: {
      total: Number(status.healthReportSummary && status.healthReportSummary.total || 0),
      byReadiness: status.healthReportSummary && status.healthReportSummary.byReadiness
        ? { ...status.healthReportSummary.byReadiness }
        : {}
    },
    error: String(status.error || "")
  };
}

function renderDemoStatusText(status = {}) {
  const normalized = normalizeDemoStatus(status);
  const lines = [
    "Demo session status",
    `status: ${normalized.status || "unknown"}`,
    `sessionKind: ${normalized.sessionKind || "unknown"}`,
    `generatedAt: ${normalized.generatedAt || "unknown"}`,
    `baseUrl: ${normalized.baseUrl || "(not available)"}`,
    `demoUrl: ${normalized.demoUrl || "(not available)"}`,
    `healthUrl: ${normalized.healthUrl || "(not available)"}`,
    `rpcUrl: ${normalized.rpcUrl || "(not available)"}`,
    `requestedPort: ${normalized.requestedPort}`,
    `actualPort: ${normalized.actualPort}`,
    `portFallback: ${normalized.portFallback ? "true" : "false"}`,
    "",
    "Snapshot summary",
    `- notices: ${normalized.snapshotSummary.noticeCount}`,
    `- positions: ${normalized.snapshotSummary.positionCount}`,
    `- sources: ${normalized.snapshotSummary.sourceCount}`,
    `- pendingReview: ${normalized.snapshotSummary.pendingReviewCount}`,
    `- compareGroups: ${normalized.snapshotSummary.compareGroupCount}`,
    "",
    "Verification summary",
    `- notices: ${normalized.verificationSummary.noticeCount}`,
    `- sourceStates: ${normalized.verificationSummary.sourceStateCount}`,
    `- reviewQueue: ${normalized.verificationSummary.reviewQueueCount}`,
    `- compareGroups: ${normalized.verificationSummary.compareGroupCount}`,
    `- structuredPositions: ${normalized.verificationSummary.structuredPositionCount}`,
    "",
    "Health report summary",
    `- totalSources: ${normalized.healthReportSummary.total}`,
    `- byReadiness: ${Object.entries(normalized.healthReportSummary.byReadiness).map(([key, value]) => `${key}=${value}`).join(", ") || "none"}`
  ];

  if (normalized.error) {
    lines.push("");
    lines.push(`error: ${normalized.error}`);
  }

  return `${lines.join("\n")}\n`;
}

function resolveOpenInstruction(url, platform = process.platform) {
  if (!url) {
    throw new Error("demo url is empty; run `npm run demo:start` or `npm run demo:check` first.");
  }

  if (platform === "win32") {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-Command", `Start-Process '${String(url).replace(/'/g, "''")}'`]
    };
  }
  if (platform === "darwin") {
    return {
      command: "open",
      args: [url]
    };
  }
  return {
    command: "xdg-open",
    args: [url]
  };
}

module.exports = {
  buildDemoStatusPaths,
  buildDemoStatusCandidatePaths,
  defaultDemoStatusPath,
  readDemoStatus,
  requestStatusUrl,
  resolvePreferredDemoStatus,
  normalizeDemoStatus,
  renderDemoStatusText,
  resolveOpenInstruction
};
