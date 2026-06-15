const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  acquireWeappSmokeLock,
  resolveWeappSmokePaths,
  ensureWeappSmokeOutputDir,
  releaseWeappSmokeLock,
  readProjectConfigSummary,
  readWeappSmokeLock,
  removeWeappSmokeLock,
  summarizePreviewResult,
  isStaleWeappSmokeLock,
  extractDevtoolsPortConflict,
  buildWeappSmokeAudit,
  renderWeappSmokeReadme,
  buildWeappSmokeArtifacts,
  writeWeappSmokeArtifacts
} = require("../weapp-devtools-smoke-lib");

test("weapp smoke lib should expose stable output paths", () => {
  const paths = resolveWeappSmokePaths(path.resolve("C:/repo"));
  assert.ok(paths.projectDir.endsWith(path.join("apps", "weapp")));
  assert.ok(paths.outputDir.endsWith(path.join("output", "weapp-devtools")));
  assert.ok(paths.lockPath.endsWith(path.join("output", "weapp-devtools", "active-run.lock")));
  assert.ok(paths.legacyLockPath.endsWith(path.join("output", "weapp-devtools", "active-run.lock.json")));
  assert.ok(paths.previewQrPath.endsWith(path.join("output", "weapp-devtools", "preview-qr.png")));
  assert.ok(paths.latestPath.endsWith(path.join("output", "weapp-devtools", "latest.json")));
});

test("weapp smoke lib should clear preview artifacts before a new run", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "weapp-smoke-clean-"));
  const paths = resolveWeappSmokePaths(tmpDir);
  fs.mkdirSync(paths.outputDir, { recursive: true });
  fs.writeFileSync(paths.previewQrPath, "qr", "utf8");
  fs.writeFileSync(paths.previewInfoPath, "{}", "utf8");
  fs.writeFileSync(paths.legacyLockPath, "legacy", "utf8");

  ensureWeappSmokeOutputDir(paths);

  assert.equal(fs.existsSync(paths.previewQrPath), false);
  assert.equal(fs.existsSync(paths.previewInfoPath), false);
  assert.equal(fs.existsSync(paths.legacyLockPath), false);
  assert.equal(fs.existsSync(paths.outputDir), true);
});

test("weapp smoke lib should acquire and release a smoke lock", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "weapp-smoke-lock-"));
  const lockPath = path.join(tmpDir, "active-run.lock.json");

  const owner = await acquireWeappSmokeLock(lockPath, {
    waitTimeoutMs: 200,
    pollMs: 20
  });

  const lock = readWeappSmokeLock(lockPath);
  assert.equal(Number(lock.pid), process.pid);
  assert.equal(String(lock.startedAt), owner.startedAt);

  releaseWeappSmokeLock(lockPath, owner);
  assert.equal(fs.existsSync(lockPath), false);
});

test("weapp smoke lib should clean up stale smoke locks", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "weapp-smoke-stale-lock-"));
  const lockPath = path.join(tmpDir, "active-run.lock.json");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({
    pid: 999999,
    startedAt: "2026-06-01T00:00:00.000Z",
    purpose: "test"
  }, null, 2), "utf8");

  assert.equal(isStaleWeappSmokeLock(readWeappSmokeLock(lockPath)), true);

  const owner = await acquireWeappSmokeLock(lockPath, {
    waitTimeoutMs: 200,
    pollMs: 20
  });
  assert.equal(Number(readWeappSmokeLock(lockPath).pid), process.pid);

  releaseWeappSmokeLock(lockPath, owner);
  removeWeappSmokeLock(lockPath);
});

test("weapp smoke lib should time out on an active smoke lock", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "weapp-smoke-busy-lock-"));
  const lockPath = path.join(tmpDir, "active-run.lock.json");
  const child = cp.spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({
    pid: child.pid,
    startedAt: new Date().toISOString(),
    purpose: "test-busy"
  }, null, 2), "utf8");

  try {
    await assert.rejects(
      acquireWeappSmokeLock(lockPath, {
        waitTimeoutMs: 100,
        pollMs: 20,
        staleAfterMs: 60 * 1000
      }),
      /timed out waiting for weapp smoke lock/
    );
  } finally {
    removeWeappSmokeLock(lockPath);
    try {
      process.kill(child.pid, "SIGKILL");
    } catch (_error) {
      // Best-effort cleanup only.
    }
  }
});

test("weapp smoke lib should read project config summary", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "weapp-smoke-project-"));
  const projectDir = path.join(tmpDir, "apps", "weapp");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "project.config.json"), JSON.stringify({
    appid: "wx123",
    projectname: "gongkao-demo",
    compileType: "miniprogram",
    miniprogramRoot: "./"
  }, null, 2), "utf8");

  const summary = readProjectConfigSummary(projectDir);
  assert.deepEqual(summary, {
    appId: "wx123",
    projectName: "gongkao-demo",
    compileType: "miniprogram",
    miniprogramRoot: "./"
  });
});

test("weapp smoke lib should classify appid-blocked preview as compile success", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "weapp-smoke-preview-"));
  const previewQrPath = path.join(tmpDir, "preview-qr.png");
  const previewInfoPath = path.join(tmpDir, "preview-info.json");

  const summary = summarizePreviewResult({
    status: 1,
    timedOut: false,
    output: "start\n- Preview\nUploading\n41002 appid missing\n"
  }, {
    previewQrPath,
    previewInfoPath
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.mode, "compile-ok-upload-blocked");
});

test("weapp smoke lib should treat generated preview artifacts as preview success even if the CLI times out", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "weapp-smoke-timeout-preview-"));
  const previewQrPath = path.join(tmpDir, "preview-qr.png");
  const previewInfoPath = path.join(tmpDir, "preview-info.json");
  fs.writeFileSync(previewQrPath, "qr", "utf8");

  const summary = summarizePreviewResult({
    status: 1,
    timedOut: true,
    output: "- Preview\n"
  }, {
    previewQrPath,
    previewInfoPath
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.mode, "preview-success");
});

test("weapp smoke lib should detect devtools port conflict output", () => {
  const conflict = extractDevtoolsPortConflict(
    "IDE server has started on http://127.0.0.1:59230 and must be restarted on port 23362 first"
  );
  assert.deepEqual(conflict, {
    currentPort: "59230",
    requestedPort: "23362"
  });

  const summary = summarizePreviewResult({
    status: 1,
    timedOut: false,
    output: "IDE server has started on http://127.0.0.1:59230 and must be restarted on port 23362 first"
  }, {
    previewQrPath: path.join(os.tmpdir(), "no-qr.png"),
    previewInfoPath: path.join(os.tmpdir(), "no-info.json")
  });
  assert.equal(summary.ok, false);
  assert.equal(summary.mode, "port-conflict");
});

test("weapp smoke lib should classify upload size limit as compile success with blocked preview upload", () => {
  const summary = summarizePreviewResult({
    status: 0,
    timedOut: false,
    output: "- Preview\n× Uploading\nError: 系统错误，错误码：80051,source size 32970KB exceed max limit 2MB"
  }, {
    previewQrPath: path.join(os.tmpdir(), "no-qr-size.png"),
    previewInfoPath: path.join(os.tmpdir(), "no-info-size.json")
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.mode, "compile-ok-upload-blocked");
});

test("weapp smoke lib should classify invalid sitemap as preview config failure", () => {
  const summary = summarizePreviewResult({
    status: 0,
    timedOut: false,
    output: "- Preview\n× Uploading\nInvalid SiteMap, sitemap错误，缺少rules字段"
  }, {
    previewQrPath: path.join(os.tmpdir(), "no-qr-sitemap.png"),
    previewInfoPath: path.join(os.tmpdir(), "no-info-sitemap.json")
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.mode, "preview-config-invalid");
});

test("weapp smoke lib should classify code 10 compile output as compile failure", () => {
  const summary = summarizePreviewResult({
    status: 0,
    timedOut: false,
    output: "[error] { code: 10 }\n- Preview\n× compile_start\n"
  }, {
    previewQrPath: path.join(os.tmpdir(), "no-qr-compile-failed.png"),
    previewInfoPath: path.join(os.tmpdir(), "no-info-compile-failed.json")
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.mode, "compile-failed");
});

test("weapp smoke lib should classify generic upload code 10 output as upload failure", () => {
  const summary = summarizePreviewResult({
    status: 0,
    timedOut: false,
    output: "[error] { code: 10, message: 'upload failed' }\n- Preview\n× Uploading\n"
  }, {
    previewQrPath: path.join(os.tmpdir(), "no-qr-upload-failed.png"),
    previewInfoPath: path.join(os.tmpdir(), "no-info-upload-failed.json")
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.mode, "upload-failed");
});

test("weapp smoke lib should keep unclassified preview output as failure", () => {
  const summary = summarizePreviewResult({
    status: 0,
    timedOut: false,
    output: "- Preview\nunexpected output without artifacts\n"
  }, {
    previewQrPath: path.join(os.tmpdir(), "no-qr-unknown.png"),
    previewInfoPath: path.join(os.tmpdir(), "no-info-unknown.json")
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.mode, "unknown");
});

test("weapp smoke lib should build auditable output with demo context", () => {
  const audit = buildWeappSmokeAudit({
    generatedAt: "2026-06-12T09:00:00.000Z",
    cliPath: "C:/WeChat/wechatidecli.cmd",
    devtoolsPort: "23362",
    projectConfig: {
      appId: "wx123",
      projectName: "gongkao-demo",
      compileType: "miniprogram",
      miniprogramRoot: "./"
    },
    summary: {
      ok: true,
      mode: "compile-ok-upload-blocked",
      message: "local compile succeeded; remote preview upload is blocked by appid restrictions"
    },
    ensureDemo: true,
    startedManagedDemo: false,
    stopManagedDemoOnExit: false,
    stepResults: {
      cliResolved: true,
      openStatus: 0,
      autoStatus: 0,
      previewStatus: 1,
      timedOut: false
    },
    previewInfoPath: "preview-info.json",
    previewInfoExists: false,
    previewQrPath: "preview-qr.png",
    previewQrExists: true,
    demoStatus: {
      baseUrl: "http://127.0.0.1:59323",
      demoUrl: "http://127.0.0.1:59323/demo",
      healthUrl: "http://127.0.0.1:59323/health",
      actualPort: 59323,
      generatedAt: "2026-06-12T08:59:00.000Z"
    },
    demoReachable: true,
    managedSession: {
      pid: 1234,
      startedAt: "2026-06-12T08:58:00.000Z",
      stdoutLog: "serve.stdout.log",
      stderrLog: "serve.stderr.log"
    }
  });

  assert.equal(audit.ok, true);
  assert.equal(audit.demo.reachable, true);
  assert.equal(audit.demo.baseUrl, "http://127.0.0.1:59323");
  assert.equal(audit.managedSession.pid, 1234);
  assert.equal(audit.steps.cliResolved, true);
  assert.equal(audit.steps.previewStatus, 1);

  const readme = renderWeappSmokeReadme(audit);
  assert.ok(readme.includes("mode: compile-ok-upload-blocked"));
  assert.ok(readme.includes("baseUrl: http://127.0.0.1:59323"));
  assert.ok(readme.includes("cliResolved: true"));

  const artifacts = buildWeappSmokeArtifacts(audit, path.join("output", "weapp-devtools"));
  assert.equal(artifacts.length, 3);
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("output", "weapp-devtools", "latest.json"))));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "weapp-smoke-artifacts-"));
  writeWeappSmokeArtifacts(buildWeappSmokeArtifacts(audit, tmpDir));
  assert.equal(fs.existsSync(path.join(tmpDir, "latest.json")), true);
  assert.equal(fs.existsSync(path.join(tmpDir, "README.txt")), true);
});
