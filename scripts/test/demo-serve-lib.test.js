const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const {
  buildManagedDemoPaths,
  buildManagedDemoSession,
  readManagedDemoSession,
  writeManagedDemoSession,
  cleanupManagedDemoSession,
  buildDemoStartArgs,
  isPidAlive,
  isManagedDemoSessionRunning,
  waitForManagedDemoReady,
  stopManagedDemoSession
} = require("../demo-serve-lib");

test("demo-serve lib should expose stable managed session paths", () => {
  const paths = buildManagedDemoPaths(path.resolve("C:/repo"));
  assert.ok(paths.outputDir.endsWith(path.join("output", "demo-start")));
  assert.ok(paths.sessionFile.endsWith(path.join("output", "demo-start", "managed-session.json")));
  assert.ok(paths.stdoutLog.endsWith(path.join("output", "demo-start", "serve.stdout.log")));
  assert.ok(paths.stderrLog.endsWith(path.join("output", "demo-start", "serve.stderr.log")));
  assert.ok(paths.runtimeEnvFile.endsWith(path.join("apps", "weapp", "env.runtime.js")));
});

test("demo-serve lib should persist managed session metadata", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-serve-session-"));
  const sessionFile = path.join(tmpDir, "managed-session.json");
  const session = buildManagedDemoSession({
    pid: 12345,
    command: "node",
    args: ["scripts/demo-start.js", "--no-ingest"],
    cwd: "C:/repo",
    stdoutLog: "stdout.log",
    stderrLog: "stderr.log",
    statusDir: "output/demo-start"
  });

  writeManagedDemoSession(sessionFile, session);
  const loaded = readManagedDemoSession(sessionFile);

  assert.equal(loaded.pid, 12345);
  assert.equal(loaded.command, "node");
  assert.deepEqual(loaded.args, ["scripts/demo-start.js", "--no-ingest"]);
  assert.equal(loaded.cwd, "C:/repo");
});

test("demo-serve lib should build demo-start args for managed serve sessions", () => {
  const args = buildDemoStartArgs({
    noIngest: true,
    port: 0,
    storeRoot: "runtime/store",
    statusDir: "output/demo-start"
  });

  assert.ok(args[0].endsWith(path.join("scripts", "demo-start.js")));
  assert.ok(args.includes("--no-ingest"));
  assert.ok(args.includes("--port"));
  assert.ok(args.includes("0"));
  assert.ok(args.includes("--store-root"));
  assert.ok(args.includes("--status-dir"));
});

test("demo-serve lib should remove stale session metadata and runtime env bridge", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-serve-cleanup-"));
  const paths = buildManagedDemoPaths(tmpDir);
  fs.mkdirSync(path.dirname(paths.sessionFile), { recursive: true });
  fs.mkdirSync(path.dirname(paths.runtimeEnvFile), { recursive: true });
  fs.writeFileSync(paths.sessionFile, "{}\n", "utf8");
  fs.writeFileSync(paths.runtimeEnvFile, "module.exports={};\n", "utf8");

  cleanupManagedDemoSession(paths);

  assert.equal(fs.existsSync(paths.sessionFile), false);
  assert.equal(fs.existsSync(paths.runtimeEnvFile), false);
});

test("demo-serve lib should wait for a reachable serve session", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-serve-ready-"));
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
    healthUrl: `http://127.0.0.1:${livePort}/health`
  }, null, 2), "utf8");

  try {
    const selection = await waitForManagedDemoReady(tmpDir, {
      timeoutMs: 1500,
      pollMs: 100
    });
    assert.ok(selection);
    assert.equal(selection.reachable, true);
    assert.ok(selection.path.endsWith(path.join("output", "demo-start", "latest-serve.json")));
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

test("demo-serve lib should ignore stale serve status before the current launch time", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-serve-stale-"));
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
    generatedAt: "2026-06-11T10:00:00.000Z",
    healthUrl: `http://127.0.0.1:${livePort}/health`
  }, null, 2), "utf8");

  try {
    const selection = await waitForManagedDemoReady(tmpDir, {
      timeoutMs: 350,
      pollMs: 100,
      notBefore: "2026-06-12T10:00:00.000Z"
    });
    assert.equal(selection, null);
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

test("demo-serve lib should not fall back to latest check status when strict serve mode is enabled", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-serve-strict-"));
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
    generatedAt: "2026-06-11T10:00:00.000Z",
    healthUrl: "http://127.0.0.1:1/health"
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(outputDir, "latest.json"), JSON.stringify({
    sessionKind: "check",
    generatedAt: "2026-06-12T10:00:00.000Z",
    healthUrl: `http://127.0.0.1:${livePort}/health`
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(outputDir, "latest-check.json"), JSON.stringify({
    sessionKind: "check",
    generatedAt: "2026-06-12T10:00:00.000Z",
    healthUrl: `http://127.0.0.1:${livePort}/health`
  }, null, 2), "utf8");

  try {
    const selection = await waitForManagedDemoReady(tmpDir, {
      timeoutMs: 350,
      pollMs: 100,
      strictServeOnly: true
    });
    assert.equal(selection, null);
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

test("demo-serve lib should detect and stop a managed node process", async () => {
  const child = cp.spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();

  const session = buildManagedDemoSession({
    pid: child.pid,
    command: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"]
  });

  try {
    assert.equal(isPidAlive(child.pid), true);
    assert.equal(isManagedDemoSessionRunning(session), true);

    const result = await stopManagedDemoSession(session, { timeoutMs: 5000 });
    assert.equal(result.stopped, true);
    assert.equal(isPidAlive(child.pid), false);
  } finally {
    if (isPidAlive(child.pid)) {
      try {
        process.kill(child.pid, "SIGKILL");
      } catch (_error) {
        // Best-effort cleanup only.
      }
    }
  }
});
