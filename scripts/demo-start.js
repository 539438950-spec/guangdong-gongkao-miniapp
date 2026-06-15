#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const { ensureLocalRuntimeSeed, localRuntimePaths } = require("../services/runtime-paths");
const { runIngestCycle } = require("../services/ingest/src/core/run-cycle");
const { FileStore } = require("../services/ingest/src/storage/file-store");
const { buildIngestHealthReport } = require("../services/ingest/src/health-report");
const { startApiServer, closeApiServer } = require("../services/api/src/index");
const {
  buildDemoStatus,
  buildDemoStatusArtifacts,
  buildWeappRuntimeEnvModule
} = require("./demo-start-lib");

const WEAPP_RUNTIME_ENV_PATH = path.resolve(__dirname, "..", "apps", "weapp", "env.runtime.js");
const PROCESS_CLEANUP_TASKS = new Set();
let processCleanupHooksRegistered = false;

function parseArgs(argv) {
  const runtimeDefaults = localRuntimePaths();
  const result = {
    check: false,
    noIngest: false,
    portSpecified: false,
    port: 3100,
    storeRoot: runtimeDefaults.ingestStoreRoot,
    snapshotTarget: runtimeDefaults.snapshotTarget,
    demoSnapshotTarget: runtimeDefaults.demoSnapshotTarget,
    positionOverridePath: runtimeDefaults.positionOverridePath,
    userStateFile: runtimeDefaults.userStateFile,
    statusDir: path.resolve(__dirname, "..", "output", "demo-start"),
    writeStatus: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--check") {
      result.check = true;
      continue;
    }
    if (token === "--no-ingest") {
      result.noIngest = true;
      continue;
    }
    if (token === "--port") {
      result.portSpecified = true;
      result.port = Number(argv[index + 1] || result.port);
      index += 1;
      continue;
    }
    if (token === "--store-root") {
      result.storeRoot = path.resolve(String(argv[index + 1] || result.storeRoot));
      index += 1;
      continue;
    }
    if (token === "--snapshot-target") {
      result.snapshotTarget = path.resolve(String(argv[index + 1] || result.snapshotTarget));
      index += 1;
      continue;
    }
    if (token === "--demo-snapshot-target") {
      result.demoSnapshotTarget = path.resolve(String(argv[index + 1] || result.demoSnapshotTarget));
      index += 1;
      continue;
    }
    if (token === "--position-override-path") {
      result.positionOverridePath = path.resolve(String(argv[index + 1] || result.positionOverridePath));
      index += 1;
      continue;
    }
    if (token === "--user-state-file") {
      result.userStateFile = path.resolve(String(argv[index + 1] || result.userStateFile));
      index += 1;
      continue;
    }
    if (token === "--status-dir") {
      result.statusDir = path.resolve(String(argv[index + 1] || result.statusDir));
      index += 1;
      continue;
    }
    if (token === "--no-write-status") {
      result.writeStatus = false;
    }
  }

  return result;
}

function loadSnapshot(filePath) {
  delete require.cache[require.resolve(filePath)];
  return require(filePath);
}

function formatReadiness(summary = {}) {
  return Object.entries(summary.byReadiness || {})
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");
}

function createTimer(label) {
  const startedAt = Date.now();
  return {
    done(extra = "") {
      const elapsedMs = Date.now() - startedAt;
      const suffix = extra ? ` ${extra}` : "";
      console.log(`[demo] ${label} done (${elapsedMs}ms)${suffix}`);
    }
  };
}

function writeArtifacts(artifacts = []) {
  artifacts.forEach((artifact) => {
    fs.mkdirSync(path.dirname(artifact.path), { recursive: true });
    fs.writeFileSync(artifact.path, artifact.content, "utf8");
  });
}

function runProcessCleanupTasks() {
  Array.from(PROCESS_CLEANUP_TASKS).forEach((task) => {
    try {
      task();
    } catch (_error) {
      // Best-effort cleanup only.
    }
  });
}

function ensureProcessCleanupHooks() {
  if (processCleanupHooksRegistered) {
    return;
  }
  processCleanupHooksRegistered = true;
  process.once("exit", runProcessCleanupTasks);
}

function writeDemoStatusArtifacts(args, options = {}) {
  if (!args || args.writeStatus === false) {
    return null;
  }

  const status = buildDemoStatus({
    args,
    status: options.status || "ready",
    baseUrl: options.baseUrl || "",
    instance: options.instance || null,
    report: options.report || null,
    snapshot: options.snapshot || null,
    verification: options.verification || null,
    error: options.error || null
  });
  const artifacts = buildDemoStatusArtifacts(status, {
    outputDir: args.statusDir
  });
  writeArtifacts(artifacts);
  return {
    status,
    latestPath: path.join(args.statusDir, status.sessionKind === "check" ? "latest-check.json" : "latest-serve.json"),
    latestAnyPath: path.join(args.statusDir, "latest.json")
  };
}

function writeWeappRuntimeEnv(status) {
  ensureProcessCleanupHooks();
  fs.mkdirSync(path.dirname(WEAPP_RUNTIME_ENV_PATH), { recursive: true });
  fs.writeFileSync(WEAPP_RUNTIME_ENV_PATH, buildWeappRuntimeEnvModule(status), "utf8");
  PROCESS_CLEANUP_TASKS.add(removeWeappRuntimeEnv);
  return WEAPP_RUNTIME_ENV_PATH;
}

function removeWeappRuntimeEnv() {
  PROCESS_CLEANUP_TASKS.delete(removeWeappRuntimeEnv);
  if (!fs.existsSync(WEAPP_RUNTIME_ENV_PATH)) {
    return false;
  }
  fs.rmSync(WEAPP_RUNTIME_ENV_PATH, { force: true });
  return true;
}

function requestJson(targetUrl, { method = "GET", body = null, timeoutMs = 60000 } = {}) {
  const target = new URL(targetUrl);
  const transport = target.protocol === "https:" ? https : http;
  const bodyText = body ? JSON.stringify(body) : "";
  const headers = {
    connection: "close"
  };

  if (bodyText) {
    headers["content-type"] = "application/json";
    headers["content-length"] = Buffer.byteLength(bodyText);
  }

  return new Promise((resolve, reject) => {
    const request = transport.request(target, {
      method,
      agent: false,
      headers
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve({
            statusCode: response.statusCode || 0,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`request timeout after ${timeoutMs}ms: ${targetUrl}`));
    });
    if (bodyText) {
      request.write(bodyText);
    }
    request.end();
  });
}

function requestText(targetUrl, { method = "GET", timeoutMs = 60000 } = {}) {
  const target = new URL(targetUrl);
  const transport = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(target, {
      method,
      agent: false,
      headers: {
        connection: "close"
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers || {},
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });

    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`request timeout after ${timeoutMs}ms: ${targetUrl}`));
    });
    request.end();
  });
}

async function requestRpc(baseUrl, action, args = []) {
  const response = await requestJson(`${baseUrl}/rpc`, {
    method: "POST",
    body: {
      action,
      args
    }
  });

  if (response.statusCode < 200 || response.statusCode >= 300 || !response.body.ok) {
    throw new Error(`rpc ${action} check failed: ${response.statusCode}`);
  }

  return response.body.data;
}

function ensureArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} check failed: expected array payload`);
  }
  return value;
}

function ensureObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} check failed: expected object payload`);
  }
  return value;
}

function verifyDemoHtml(response, routeLabel) {
  const body = String(response.body || "");
  const contentType = String(response.headers["content-type"] || "");

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`${routeLabel} page check failed: ${response.statusCode}`);
  }
  if (!contentType.includes("text/html")) {
    throw new Error(`${routeLabel} page check failed: unexpected content-type ${contentType || "unknown"}`);
  }
  if (!body.trimStart().startsWith("<!DOCTYPE html>")) {
    throw new Error(`${routeLabel} page check failed: response is not raw html`);
  }
  if (body.trimStart().startsWith("\"")) {
    throw new Error(`${routeLabel} page check failed: html is still wrapped as a JSON string`);
  }
  if (!body.includes("广东公考信息与选岗 Demo")) {
    throw new Error(`${routeLabel} page check failed: missing demo title`);
  }
  if (!body.includes("最新公告") || !body.includes("来源状态") || !body.includes("岗位对比")) {
    throw new Error(`${routeLabel} page check failed: missing mvp sections`);
  }
}

async function verifyApi(baseUrl) {
  console.log("[demo] verifying /health ...");
  const healthResponse = await requestJson(`${baseUrl}/health`);
  if (healthResponse.statusCode < 200 || healthResponse.statusCode >= 300 || !healthResponse.body.ok) {
    throw new Error(`health check failed: ${healthResponse.statusCode}`);
  }

  console.log("[demo] verifying /rpc listNotices ...");
  const notices = ensureArray(await requestRpc(baseUrl, "listNotices"), "listNotices");
  if (!notices.length) {
    throw new Error("rpc listNotices check failed: missing notices");
  }

  console.log("[demo] verifying /rpc getDashboard ...");
  const dashboard = ensureObject(await requestRpc(baseUrl, "getDashboard"), "getDashboard");
  if (!Array.isArray(dashboard.notices) || !dashboard.notices.length) {
    throw new Error("rpc dashboard check failed: missing notices");
  }
  if (!Array.isArray(dashboard.sourceStates) || !dashboard.sourceStates.length) {
    throw new Error("rpc dashboard check failed: missing source states");
  }
  if (!Array.isArray(dashboard.compareGroups)) {
    throw new Error("rpc dashboard check failed: compare groups payload is missing");
  }

  console.log("[demo] verifying /rpc listSourceStates ...");
  const sourceStates = ensureArray(await requestRpc(baseUrl, "listSourceStates"), "listSourceStates");
  if (!sourceStates.length) {
    throw new Error("rpc listSourceStates check failed: missing source states");
  }
  if (!sourceStates.every((item) => item && item.sourceId)) {
    throw new Error("rpc listSourceStates check failed: sourceId is missing");
  }
  if (!sourceStates.some((item) => item.publishGateStatus || item.parseQualityStatus)) {
    throw new Error("rpc listSourceStates check failed: missing publish gate summary fields");
  }

  console.log("[demo] verifying /rpc listReviewQueue ...");
  const reviewQueue = ensureArray(await requestRpc(baseUrl, "listReviewQueue"), "listReviewQueue");

  const structuredNotice = notices.find((item) => item && item.id && item.hasStructuredPositions)
    || dashboard.notices.find((item) => item && item.id && item.hasStructuredPositions)
    || null;
  let positionsPayload = null;
  if (structuredNotice) {
    console.log("[demo] verifying /rpc getNoticeDetail ...");
    const noticeDetail = ensureObject(
      await requestRpc(baseUrl, "getNoticeDetail", [structuredNotice.id]),
      "getNoticeDetail"
    );
    if (!noticeDetail.notice || noticeDetail.notice.id !== structuredNotice.id) {
      throw new Error("rpc getNoticeDetail check failed: notice id mismatch");
    }

    console.log("[demo] verifying /rpc listPositionsByNotice ...");
    positionsPayload = ensureObject(
      await requestRpc(baseUrl, "listPositionsByNotice", [structuredNotice.id]),
      "listPositionsByNotice"
    );
    const positions = ensureArray(positionsPayload.positions, "listPositionsByNotice.positions");
    if (!positions.length) {
      throw new Error("rpc listPositionsByNotice check failed: structured notice returned no positions");
    }
    if (!positionsPayload.notice || positionsPayload.notice.id !== structuredNotice.id) {
      throw new Error("rpc listPositionsByNotice check failed: notice payload mismatch");
    }
    if (!positions.every((item) => item.noticeId === structuredNotice.id)) {
      throw new Error("rpc listPositionsByNotice check failed: position noticeId mismatch");
    }
  }

  console.log("[demo] verifying /rpc listCompareGroups ...");
  const compareGroups = ensureArray(await requestRpc(baseUrl, "listCompareGroups"), "listCompareGroups");
  const activeCompareGroup = dashboard.activeCompareGroup
    || compareGroups.find((item) => Array.isArray(item && item.positionIds) && item.positionIds.length > 0)
    || compareGroups[0]
    || null;
  if (activeCompareGroup && activeCompareGroup.id) {
    console.log("[demo] verifying /rpc getCompareGroupDetail ...");
    const compareDetail = ensureObject(
      await requestRpc(baseUrl, "getCompareGroupDetail", [activeCompareGroup.id]),
      "getCompareGroupDetail"
    );
    if (!compareDetail.group || compareDetail.group.id !== activeCompareGroup.id) {
      throw new Error("rpc getCompareGroupDetail check failed: compare group mismatch");
    }
    const comparePositions = ensureArray(compareDetail.positions, "getCompareGroupDetail.positions");
    if (
      compareDetail.group.examType &&
      comparePositions.some((item) => item && item.examType && item.examType !== compareDetail.group.examType)
    ) {
      throw new Error("rpc getCompareGroupDetail check failed: compare positions crossed exam type");
    }
  }

  console.log("[demo] verifying /demo ...");
  verifyDemoHtml(await requestText(`${baseUrl}/demo`), "/demo");

  console.log("[demo] verifying / ...");
  verifyDemoHtml(await requestText(`${baseUrl}/`), "/");

  return {
    notices,
    sourceStates,
    reviewQueue,
    compareGroups,
    positionsPayload
  };
}

function printReadySummary({ baseUrl, report, snapshot, verification }) {
  const noticesFromApi = Array.isArray(verification && verification.notices) ? verification.notices : [];
  const sourceStatesFromApi = Array.isArray(verification && verification.sourceStates) ? verification.sourceStates : [];
  const reviewQueueFromApi = Array.isArray(verification && verification.reviewQueue) ? verification.reviewQueue : [];
  const compareGroupsFromApi = Array.isArray(verification && verification.compareGroups) ? verification.compareGroups : [];
  const positionsFromApi = verification && verification.positionsPayload && Array.isArray(verification.positionsPayload.positions)
    ? verification.positionsPayload.positions
    : [];

  console.log("");
  console.log("Demo ready");
  console.log(`- API: ${baseUrl}`);
  console.log(`- Notices: ${Array.isArray(snapshot.notices) ? snapshot.notices.length : 0}`);
  console.log(`- Positions: ${Array.isArray(snapshot.positions) ? snapshot.positions.length : 0}`);
  console.log(`- Sources: ${report.summary.total} (${formatReadiness(report.summary) || "none"})`);
  console.log(`- Pending review: ${Array.isArray(snapshot.reviewQueue) ? snapshot.reviewQueue.length : 0}`);
  console.log(`- API notices check: ${noticesFromApi.length}`);
  console.log(`- API source states check: ${sourceStatesFromApi.length}`);
  console.log(`- API review queue check: ${reviewQueueFromApi.length}`);
  console.log(`- API compare groups check: ${compareGroupsFromApi.length}`);
  console.log(`- API structured positions check: ${positionsFromApi.length}`);
  console.log("");
  console.log("How to view the demo");
  console.log("1. Open `apps/weapp` in WeChat DevTools.");
  console.log("2. Direct demo: keep the default local Store mode and preview the current snapshot.");
  console.log("3. Remote demo: in `我的` -> connection config, switch to `本机开发`.");
  console.log(`4. If needed, set the API address to ${baseUrl}.`);
  console.log(`5. Browser preview: open ${baseUrl}/demo`);
  console.log("");
}

async function keepServerAlive(server) {
  await new Promise((resolve, reject) => {
    const keeper = setInterval(() => {}, 60 * 60 * 1000);

    const shutdown = async () => {
      clearInterval(keeper);
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
      try {
        await closeApiServer(server);
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    const onSigint = () => {
      shutdown().catch(reject);
    };
    const onSigterm = () => {
      shutdown().catch(reject);
    };

    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);
  });
}

async function closeServerQuickly(server, timeoutMs = 1500) {
  if (!server) {
    return;
  }
  const closeResult = await Promise.race([
    closeApiServer(server).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
  return closeResult;
}

async function startDemoServer(args) {
  const preferredPort = args.check && !args.portSpecified ? 0 : args.port;
  const instance = await startApiServer({
    port: preferredPort,
    allowPortFallback: !args.portSpecified && preferredPort !== 0,
    userStateFile: args.userStateFile,
    snapshotTarget: args.snapshotTarget,
    demoSnapshotTarget: args.demoSnapshotTarget,
    ingestStoreRoot: args.storeRoot,
    positionOverridePath: args.positionOverridePath
  });
  if (Number(instance.requestedPort) > 0 && Number(instance.port) !== Number(instance.requestedPort)) {
    console.log(`[demo] port ${instance.requestedPort} is busy, using ${instance.port} instead.`);
  }
  return instance;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let instance = null;
  let report = null;
  let snapshot = null;
  let baseUrl = "";
  let shouldCleanupWeappRuntimeEnv = false;
  if (!args.check) {
    removeWeappRuntimeEnv();
  }
  ensureLocalRuntimeSeed({
    ingestStoreRoot: args.storeRoot,
    snapshotTarget: args.snapshotTarget,
    demoSnapshotTarget: args.demoSnapshotTarget,
    positionOverridePath: args.positionOverridePath,
    userStateFile: args.userStateFile
  });

  if (!args.noIngest) {
    console.log("[demo] refreshing ingest snapshot...");
    const timer = createTimer("refresh ingest snapshot");
    await runIngestCycle({
      storeRoot: args.storeRoot,
      snapshotTarget: args.snapshotTarget,
      positionOverridePath: args.positionOverridePath,
      logRecommendations: false
    });
    timer.done();
  }

  const snapshotTimer = createTimer("load snapshot and health report");
  const store = new FileStore(args.storeRoot);
  report = buildIngestHealthReport(store, { auditLimit: 3 });
  snapshot = loadSnapshot(args.snapshotTarget);
  snapshotTimer.done();

  console.log("[demo] starting local API...");
  const apiStartTimer = createTimer("start local API");
  instance = await startDemoServer(args);
  baseUrl = `http://127.0.0.1:${instance.port}`;
  apiStartTimer.done(`port=${instance.port}`);
  console.log(`[demo] local API ready: ${baseUrl}`);

  try {
    const verifyTimer = createTimer("verify API and demo routes");
    const verification = await verifyApi(baseUrl);
    verifyTimer.done(`notices=${Array.isArray(verification.notices) ? verification.notices.length : 0}`);
    const statusWrite = writeDemoStatusArtifacts(args, {
      status: "ready",
      baseUrl,
      instance,
      report,
      snapshot,
      verification
    });
    if (statusWrite && statusWrite.latestPath) {
      console.log(`[demo] status artifacts: ${statusWrite.latestPath}`);
      if (statusWrite.latestAnyPath && statusWrite.latestAnyPath !== statusWrite.latestPath) {
        console.log(`[demo] latest any-session status: ${statusWrite.latestAnyPath}`);
      }
      if (!args.check && statusWrite.status) {
        const runtimeEnvPath = writeWeappRuntimeEnv(statusWrite.status);
        shouldCleanupWeappRuntimeEnv = true;
        console.log(`[demo] weapp runtime env: ${runtimeEnvPath}`);
      }
    }
    printReadySummary({
      baseUrl,
      report,
      snapshot,
      verification
    });

    if (args.check) {
      console.log("[demo] check complete.");
      const closeTimer = createTimer("close local API");
      await closeServerQuickly(instance.server, 3000);
      closeTimer.done();
      process.exit(0);
      return;
    }

    console.log("Press Ctrl+C to stop the local API server.");
    await keepServerAlive(instance.server);
  } catch (error) {
    const statusWrite = writeDemoStatusArtifacts(args, {
      status: "failed",
      baseUrl,
      instance,
      report,
      snapshot,
      error
    });
    if (statusWrite && statusWrite.latestPath) {
      console.log(`[demo] status artifacts: ${statusWrite.latestPath}`);
      if (statusWrite.latestAnyPath && statusWrite.latestAnyPath !== statusWrite.latestPath) {
        console.log(`[demo] latest any-session status: ${statusWrite.latestAnyPath}`);
      }
    }
    throw error;
  } finally {
    if (args.check && instance && instance.server) {
      await closeServerQuickly(instance.server, 3000);
    }
    if (shouldCleanupWeappRuntimeEnv) {
      removeWeappRuntimeEnv();
    }
  }
}

main().catch(async (error) => {
  console.error("[demo] failed:", error.message);
  process.exit(1);
});
