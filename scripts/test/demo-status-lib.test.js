const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const {
  buildDemoStatusPaths,
  buildDemoStatusCandidatePaths,
  defaultDemoStatusPath,
  readDemoStatus,
  resolvePreferredDemoStatus,
  normalizeDemoStatus,
  renderDemoStatusText,
  resolveOpenInstruction
} = require("../demo-status-lib");

test("demo-status lib should expose stable demo status paths", () => {
  const paths = buildDemoStatusPaths(path.resolve("C:/repo"));
  assert.ok(paths.latestAny.endsWith(path.join("output", "demo-start", "latest.json")));
  assert.ok(paths.latestServe.endsWith(path.join("output", "demo-start", "latest-serve.json")));
  assert.ok(paths.latestCheck.endsWith(path.join("output", "demo-start", "latest-check.json")));
});

test("demo-status lib should prefer live serve sessions by default", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-status-paths-"));
  const outputDir = path.join(tmpDir, "output", "demo-start");
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(path.join(outputDir, "latest.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(outputDir, "latest-serve.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(outputDir, "latest-check.json"), "{}\n", "utf8");

  assert.equal(
    defaultDemoStatusPath(tmpDir),
    path.join(outputDir, "latest-serve.json")
  );
  assert.equal(
    defaultDemoStatusPath(tmpDir, { preference: "check" }),
    path.join(outputDir, "latest-check.json")
  );
  assert.equal(
    defaultDemoStatusPath(tmpDir, { preference: "any" }),
    path.join(outputDir, "latest.json")
  );
  assert.deepEqual(
    buildDemoStatusCandidatePaths(tmpDir),
    [
      path.join(outputDir, "latest-serve.json"),
      path.join(outputDir, "latest.json"),
      path.join(outputDir, "latest-check.json")
    ]
  );
});

test("demo-status lib should resolve the first reachable session by preference", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-status-live-"));
  const outputDir = path.join(tmpDir, "output", "demo-start");
  fs.mkdirSync(outputDir, { recursive: true });

  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const livePort = typeof address === "object" && address ? address.port : 0;

  fs.writeFileSync(path.join(outputDir, "latest-serve.json"), JSON.stringify({
    sessionKind: "serve",
    healthUrl: "http://127.0.0.1:1/health"
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(outputDir, "latest.json"), JSON.stringify({
    sessionKind: "check",
    healthUrl: `http://127.0.0.1:${livePort}/health`
  }, null, 2), "utf8");

  try {
    const selection = await resolvePreferredDemoStatus(tmpDir);
    assert.equal(selection.path, path.join(outputDir, "latest.json"));
    assert.equal(selection.reachable, true);
    assert.equal(selection.status.sessionKind, "check");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("demo-status lib should read, normalize, and render status summaries", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-status-"));
  const statusPath = path.join(tmpDir, "latest.json");
  fs.writeFileSync(statusPath, JSON.stringify({
    generatedAt: "2026-06-11T16:00:00.000Z",
    status: "ready",
    sessionKind: "serve",
    baseUrl: "http://127.0.0.1:55771",
    demoUrl: "http://127.0.0.1:55771/demo",
    healthUrl: "http://127.0.0.1:55771/health",
    rpcUrl: "http://127.0.0.1:55771/rpc",
    check: false,
    noIngest: true,
    requestedPort: 0,
    actualPort: 55771,
    portFallback: false,
    snapshotSummary: {
      noticeCount: 3,
      positionCount: 21723,
      sourceCount: 3,
      pendingReviewCount: 0,
      compareGroupCount: 2
    },
    verificationSummary: {
      noticeCount: 3,
      sourceStateCount: 3,
      reviewQueueCount: 0,
      compareGroupCount: 2,
      structuredPositionCount: 9344
    },
    healthReportSummary: {
      total: 3,
      byReadiness: {
        blocked: 2,
        demo: 1
      }
    }
  }, null, 2), "utf8");

  const status = readDemoStatus(statusPath);
  const normalized = normalizeDemoStatus(status);
  const text = renderDemoStatusText(status);

  assert.equal(normalized.actualPort, 55771);
  assert.equal(normalized.sessionKind, "serve");
  assert.equal(normalized.verificationSummary.structuredPositionCount, 9344);
  assert.ok(text.includes("Demo session status"));
  assert.ok(text.includes("sessionKind: serve"));
  assert.ok(text.includes("demoUrl: http://127.0.0.1:55771/demo"));
  assert.ok(text.includes("structuredPositions: 9344"));
  assert.ok(text.includes("byReadiness: blocked=2, demo=1"));
});

test("demo-status lib should resolve platform-specific open instructions", () => {
  assert.deepEqual(resolveOpenInstruction("http://127.0.0.1:55771/demo", "darwin"), {
    command: "open",
    args: ["http://127.0.0.1:55771/demo"]
  });
  assert.deepEqual(resolveOpenInstruction("http://127.0.0.1:55771/demo", "linux"), {
    command: "xdg-open",
    args: ["http://127.0.0.1:55771/demo"]
  });
  const win = resolveOpenInstruction("http://127.0.0.1:55771/demo", "win32");
  assert.equal(win.command, "powershell.exe");
  assert.ok(win.args.some((item) => String(item).includes("Start-Process")));
});
