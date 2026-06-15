const path = require("node:path");

function sanitizeStatusStamp(value) {
  return String(value || "")
    .replace(/[:.]/g, "-")
    .replace(/[^0-9A-Za-z_-]/g, "");
}

function toCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

function buildDemoStatus(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const baseUrl = String(options.baseUrl || "");
  const verification = options.verification || {};
  const snapshot = options.snapshot || {};
  const report = options.report || {};
  const instance = options.instance || {};
  const sessionKind = options.args && options.args.check ? "check" : "serve";

  return {
    generatedAt,
    statusId: sanitizeStatusStamp(generatedAt),
    status: options.status || "ready",
    sessionKind,
    check: Boolean(options.args && options.args.check),
    noIngest: Boolean(options.args && options.args.noIngest),
    requestedPort: Number(instance.requestedPort || (options.args && options.args.port) || 0),
    actualPort: Number(instance.port || 0),
    portFallback: Boolean(
      Number(instance.requestedPort || 0) > 0 &&
      Number(instance.port || 0) > 0 &&
      Number(instance.requestedPort || 0) !== Number(instance.port || 0)
    ),
    baseUrl,
    demoUrl: baseUrl ? `${baseUrl}/demo` : "",
    healthUrl: baseUrl ? `${baseUrl}/health` : "",
    rpcUrl: baseUrl ? `${baseUrl}/rpc` : "",
    error: options.error ? String(options.error.message || options.error) : "",
    runtimePaths: {
      storeRoot: options.args ? options.args.storeRoot : "",
      snapshotTarget: options.args ? options.args.snapshotTarget : "",
      demoSnapshotTarget: options.args ? options.args.demoSnapshotTarget : "",
      positionOverridePath: options.args ? options.args.positionOverridePath : "",
      userStateFile: options.args ? options.args.userStateFile : ""
    },
    snapshotSummary: {
      noticeCount: toCount(snapshot.notices),
      positionCount: toCount(snapshot.positions),
      sourceCount: toCount(snapshot.sourceStates),
      pendingReviewCount: toCount(snapshot.reviewQueue),
      compareGroupCount: toCount(snapshot.compareGroups)
    },
    verificationSummary: {
      noticeCount: toCount(verification.notices),
      sourceStateCount: toCount(verification.sourceStates),
      reviewQueueCount: toCount(verification.reviewQueue),
      compareGroupCount: toCount(verification.compareGroups),
      structuredPositionCount: verification.positionsPayload && Array.isArray(verification.positionsPayload.positions)
        ? verification.positionsPayload.positions.length
        : 0
    },
    healthReportSummary: {
      total: Number(report.summary && report.summary.total || 0),
      byReadiness: report.summary && report.summary.byReadiness
        ? { ...report.summary.byReadiness }
        : {}
    }
  };
}

function renderDemoStatusReadme(status) {
  const lines = [
    "Guangdong Gongkao Demo Status",
    `status: ${status.status}`,
    `sessionKind: ${status.sessionKind || "unknown"}`,
    `generatedAt: ${status.generatedAt}`,
    `baseUrl: ${status.baseUrl || "(not started)"}`,
    `demoUrl: ${status.demoUrl || "(not available)"}`,
    `healthUrl: ${status.healthUrl || "(not available)"}`,
    `rpcUrl: ${status.rpcUrl || "(not available)"}`,
    `requestedPort: ${status.requestedPort || 0}`,
    `actualPort: ${status.actualPort || 0}`,
    `portFallback: ${status.portFallback ? "true" : "false"}`,
    "",
    "Snapshot summary",
    `- notices: ${status.snapshotSummary.noticeCount}`,
    `- positions: ${status.snapshotSummary.positionCount}`,
    `- sources: ${status.snapshotSummary.sourceCount}`,
    `- pendingReview: ${status.snapshotSummary.pendingReviewCount}`,
    `- compareGroups: ${status.snapshotSummary.compareGroupCount}`,
    "",
    "Verification summary",
    `- notices: ${status.verificationSummary.noticeCount}`,
    `- sourceStates: ${status.verificationSummary.sourceStateCount}`,
    `- reviewQueue: ${status.verificationSummary.reviewQueueCount}`,
    `- compareGroups: ${status.verificationSummary.compareGroupCount}`,
    `- structuredPositions: ${status.verificationSummary.structuredPositionCount}`,
    "",
    "Runtime paths",
    `- storeRoot: ${status.runtimePaths.storeRoot}`,
    `- snapshotTarget: ${status.runtimePaths.snapshotTarget}`,
    `- demoSnapshotTarget: ${status.runtimePaths.demoSnapshotTarget}`,
    `- positionOverridePath: ${status.runtimePaths.positionOverridePath}`,
    `- userStateFile: ${status.runtimePaths.userStateFile}`
  ];

  if (status.error) {
    lines.push("");
    lines.push(`error: ${status.error}`);
  }

  return `${lines.join("\n")}\n`;
}

function buildDemoStatusArtifacts(status, options = {}) {
  const outputDir = options.outputDir || path.join("output", "demo-start");
  const fileName = `${status.statusId || "latest"}.json`;
  const sessionKind = status.sessionKind === "check" ? "check" : "serve";
  const artifacts = [
    {
      path: path.join(outputDir, fileName),
      content: `${JSON.stringify(status, null, 2)}\n`
    },
    {
      path: path.join(outputDir, "latest.json"),
      content: `${JSON.stringify(status, null, 2)}\n`
    },
    {
      path: path.join(outputDir, `latest-${sessionKind}.json`),
      content: `${JSON.stringify(status, null, 2)}\n`
    },
    {
      path: path.join(outputDir, "README.txt"),
      content: renderDemoStatusReadme(status)
    }
  ];

  if (status.demoUrl) {
    artifacts.push({
      path: path.join(outputDir, `open-demo-${sessionKind}.url`),
      content: `[InternetShortcut]\r\nURL=${status.demoUrl}\r\n`
    });
    if (sessionKind === "serve") {
      artifacts.push({
        path: path.join(outputDir, "open-demo.url"),
        content: `[InternetShortcut]\r\nURL=${status.demoUrl}\r\n`
      });
    }
  }

  return artifacts;
}

function buildWeappRuntimeEnvModule(status = {}) {
  const baseUrl = String(status.baseUrl || "").trim();
  const label = String(status.portFallback
    ? "最近一次本机 Demo（自动回退端口）"
    : "最近一次本机 Demo"
  );

  return [
    "module.exports = {",
    "  apiMode: \"remote\",",
    `  apiBaseUrl: ${JSON.stringify(baseUrl)},`,
    `  apiDefaultLabel: ${JSON.stringify(label)},`,
    `  apiRuntimeGeneratedAt: ${JSON.stringify(String(status.generatedAt || ""))},`,
    `  apiRuntimeDemoUrl: ${JSON.stringify(String(status.demoUrl || ""))}`,
    "};",
    ""
  ].join("\n");
}

module.exports = {
  sanitizeStatusStamp,
  buildDemoStatus,
  renderDemoStatusReadme,
  buildDemoStatusArtifacts,
  buildWeappRuntimeEnvModule
};
