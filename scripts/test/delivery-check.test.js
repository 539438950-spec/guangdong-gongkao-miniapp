const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDeliveryCheckSummary,
  renderDeliveryCheckText
} = require("../delivery-check-lib");
const {
  resolveNpmRunProcess,
  resolveSmokeProcess,
  getMvpSmokeStatus,
  getWeappAuditStatus,
  getWeappSmokeStatus,
  getDocsCheckStatus,
  isPassingWeappSmokeMode
} = require("../delivery-check");

test("delivery check should summarize clean smoke and synced baseline state", () => {
  const report = {
    totalChanged: 4,
    summary: {
      source: [{ file: "apps/weapp/pages/compare/index.js" }],
      docs: [{ file: "README.md" }],
      baseline: [{ file: "apps/weapp/data/ingested.js" }],
      other: []
    },
    commitGroups: [
      { id: "frontend", label: "frontend", items: [{ file: "apps/weapp/pages/compare/index.js" }] },
      { id: "docs", label: "docs", items: [{ file: "README.md" }] },
      { id: "baseline", label: "baseline", items: [{ file: "apps/weapp/data/ingested.js" }] }
    ]
  };
  const baselineReport = {
    summary: {
      total: 6,
      gitChanged: 1,
      synced: 6,
      "out-of-sync": 0,
      "missing-baseline": 0,
      "missing-runtime": 0
    }
  };

  const summary = buildDeliveryCheckSummary(report, true, baselineReport, {
    weappAudit: {
      available: true,
      passed: true,
      thresholdStatus: "within-limit",
      includedSizeKB: 741.4,
      ignoredSizeKB: 32552.46
    },
    weappSmoke: {
      available: true,
      passed: true,
      mode: "preview-success",
      message: "preview succeeded and generated output files"
    },
    docsCheck: {
      available: true,
      passed: true,
      failureCount: 0
    }
  });

  assert.equal(summary.smokePassed, true);
  assert.equal(summary.readyForReview, true);
  assert.equal(summary.bucketCounts.baseline, 1);
  assert.equal(summary.baselineStatus.clean, true);
  assert.equal(summary.commitGroups.length, 3);
  assert.equal(summary.weappAudit.passed, true);
  assert.equal(summary.weappSmoke.passed, true);
  assert.equal(summary.docsCheck.passed, true);
  assert.ok(summary.warnings.some((item) => item.includes("baseline")));
  assert.ok(summary.nextSteps.some((item) => item.includes("delivery-manifest")));
  assert.ok(summary.nextSteps.some((item) => item.includes("delivery-session")));
});

test("delivery check should fail readiness when smoke fails or changes are unclassified", () => {
  const report = {
    totalChanged: 1,
    summary: {
      source: [],
      docs: [],
      baseline: [],
      other: [{ file: "unknown.tmp" }]
    },
    commitGroups: []
  };
  const baselineReport = {
    summary: {
      total: 6,
      gitChanged: 0,
      synced: 6,
      "out-of-sync": 0,
      "missing-baseline": 0,
      "missing-runtime": 0
    }
  };

  const summary = buildDeliveryCheckSummary(report, false, baselineReport);
  const text = renderDeliveryCheckText(summary);

  assert.equal(summary.smokePassed, false);
  assert.equal(summary.readyForReview, false);
  assert.ok(summary.warnings.some((item) => item.includes("mvp:smoke")));
  assert.ok(text.includes("mvp:smoke: failed"));
  assert.ok(text.includes("weapp:audit: missing"));
  assert.ok(text.includes("weapp:smoke: missing"));
  assert.ok(text.includes("docs:check: missing"));
  assert.ok(text.includes("readyForReview: false"));
  assert.ok(text.includes("下一步"));
});

test("delivery check should fail readiness when baseline drifts from runtime", () => {
  const report = {
    totalChanged: 2,
    summary: {
      source: [{ file: "services/api/src/core.js" }],
      docs: [],
      baseline: [{ file: "apps/weapp/data/ingested.js" }],
      other: []
    },
    commitGroups: [
      { id: "platform", label: "platform", items: [{ file: "services/api/src/core.js" }] },
      { id: "baseline", label: "baseline", items: [{ file: "apps/weapp/data/ingested.js" }] }
    ]
  };
  const baselineReport = {
    summary: {
      total: 6,
      gitChanged: 1,
      synced: 5,
      "out-of-sync": 1,
      "missing-baseline": 0,
      "missing-runtime": 0
    }
  };

  const summary = buildDeliveryCheckSummary(report, true, baselineReport, {
    weappAudit: {
      available: true,
      passed: true,
      thresholdStatus: "within-limit",
      includedSizeKB: 741.4,
      ignoredSizeKB: 32552.46
    },
    weappSmoke: {
      available: true,
      passed: true,
      mode: "preview-success",
      message: "preview succeeded and generated output files"
    },
    docsCheck: {
      available: true,
      passed: true,
      failureCount: 0
    }
  });

  assert.equal(summary.smokePassed, true);
  assert.equal(summary.readyForReview, false);
  assert.equal(summary.baselineStatus.clean, false);
  assert.equal(summary.baselineStatus.outOfSync, 1);
  assert.ok(summary.warnings.some((item) => item.includes("漂移")));
  assert.ok(summary.nextSteps.some((item) => item.includes("refresh-baseline")));
});

test("delivery check should block readiness when weapp audit or smoke fail", () => {
  const report = {
    totalChanged: 1,
    summary: {
      source: [{ file: "apps/weapp/project.config.json" }],
      docs: [],
      baseline: [],
      other: []
    },
    commitGroups: [
      { id: "frontend", label: "frontend", items: [{ file: "apps/weapp/project.config.json" }] }
    ]
  };
  const baselineReport = {
    summary: {
      total: 6,
      gitChanged: 0,
      synced: 6,
      "out-of-sync": 0,
      "missing-baseline": 0,
      "missing-runtime": 0
    }
  };

  const summary = buildDeliveryCheckSummary(report, true, baselineReport, {
    weappAudit: {
      available: true,
      passed: false,
      thresholdStatus: "over-limit",
      includedSizeKB: 32236.09,
      ignoredSizeKB: 0
    },
    weappSmoke: {
      available: true,
      passed: false,
      mode: "compile-ok-upload-blocked",
      message: "upload blocked"
    }
  });

  assert.equal(summary.readyForReview, false);
  assert.ok(summary.warnings.some((item) => item.includes("包体")));
  assert.ok(summary.warnings.some((item) => item.includes("preview")));
  assert.ok(summary.nextSteps[0].includes("weapp:audit"));
});

test("delivery check should block readiness when docs entrypoints check fails", () => {
  const report = {
    totalChanged: 1,
    summary: {
      source: [],
      docs: [{ file: "README.md" }],
      baseline: [],
      other: []
    },
    commitGroups: [
      { id: "docs", label: "docs", items: [{ file: "README.md" }] }
    ]
  };
  const baselineReport = {
    summary: {
      total: 6,
      gitChanged: 0,
      synced: 6,
      "out-of-sync": 0,
      "missing-baseline": 0,
      "missing-runtime": 0
    }
  };

  const summary = buildDeliveryCheckSummary(report, true, baselineReport, {
    weappAudit: {
      available: true,
      passed: true,
      thresholdStatus: "within-limit",
      includedSizeKB: 741.4,
      ignoredSizeKB: 32552.46
    },
    weappSmoke: {
      available: true,
      passed: true,
      mode: "preview-success",
      message: "preview succeeded and generated output files"
    },
    docsCheck: {
      available: true,
      passed: false,
      failureCount: 2
    }
  });

  assert.equal(summary.readyForReview, false);
  assert.ok(summary.warnings.some((item) => item.includes("文档入口校验")));
  assert.ok(summary.nextSteps[0].includes("docs:check"));
});

test("delivery check should prefer npm-cli.js on Windows", () => {
  const resolved = resolveSmokeProcess({
    ProgramFiles: "C:\\Program Files",
    ComSpec: "C:\\Windows\\System32\\cmd.exe"
  }, "win32");

  assert.equal(resolved.command, process.execPath);
  assert.deepEqual(resolved.args, [
    "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    "run",
    "mvp:smoke"
  ]);
});

test("delivery check should resolve generic npm run processes on Windows", () => {
  const resolved = resolveNpmRunProcess("weapp:smoke", {
    ProgramFiles: "C:\\Program Files",
    ComSpec: "C:\\Windows\\System32\\cmd.exe"
  }, "win32");

  assert.equal(resolved.command, process.execPath);
  assert.deepEqual(resolved.args, [
    "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    "run",
    "weapp:smoke"
  ]);
});

test("delivery check should map weapp audit and smoke artifacts into summary status", () => {
  const mvpSmokeStatus = getMvpSmokeStatus({
    ok: true,
    status: "ready"
  });
  const auditStatus = getWeappAuditStatus({
    summary: {
      thresholdStatus: "within-limit",
      includedSizeKB: 741.4,
      ignoredSizeKB: 32552.46
    }
  });
  const smokeStatus = getWeappSmokeStatus({
    ok: true,
    mode: "preview-success",
    message: "preview succeeded and generated output files"
  });

  assert.deepEqual(mvpSmokeStatus, {
    available: true,
    passed: true,
    status: "ready"
  });
  assert.deepEqual(auditStatus, {
    available: true,
    passed: true,
    thresholdStatus: "within-limit",
    includedSizeKB: 741.4,
    ignoredSizeKB: 32552.46
  });
  assert.deepEqual(smokeStatus, {
    available: true,
    passed: true,
    mode: "preview-success",
    message: "preview succeeded and generated output files"
  });

  const docsStatus = getDocsCheckStatus({
    ok: true,
    failures: []
  });
  assert.deepEqual(docsStatus, {
    available: true,
    passed: true,
    failureCount: 0
  });
});

test("delivery check should reuse latest mvp smoke audit when smoke rerun is skipped", () => {
  const status = getMvpSmokeStatus({
    ok: true,
    status: "ready"
  });

  assert.equal(status.available, true);
  assert.equal(status.passed, true);
  assert.equal(status.status, "ready");

  const missing = getMvpSmokeStatus(null);
  assert.deepEqual(missing, {
    available: false,
    passed: false,
    status: "missing"
  });
});

test("delivery check should reject unclassified weapp smoke output as passing status", () => {
  assert.equal(isPassingWeappSmokeMode("preview-success"), true);
  assert.equal(isPassingWeappSmokeMode("compile-ok-upload-blocked"), true);
  assert.equal(isPassingWeappSmokeMode("unknown"), false);

  const smokeStatus = getWeappSmokeStatus({
    ok: true,
    mode: "unknown",
    message: "unable to classify preview result"
  });

  assert.deepEqual(smokeStatus, {
    available: true,
    passed: false,
    mode: "unknown",
    message: "unable to classify preview result"
  });
});
