const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDeliveryBundle,
  buildBundleQuickstart,
  buildBundleRunbook,
  renderDeliveryBundleText,
  shouldIncludeArtifactInBundle,
  filterBundleArtifacts,
  buildDeliveryBundleArtifacts,
  renderWrittenBundleArtifactsText
} = require("../delivery-bundle-lib");

test("delivery bundle should summarize readiness including weapp audit and devtools smoke", () => {
  const bundle = buildDeliveryBundle({
    smokeStatus: "passed",
    checkResult: {
      smokePassed: true,
      summary: {
        readyForReview: true,
        totalChanged: 12,
        bucketCounts: { source: 6, docs: 2, baseline: 4, other: 0 },
        commitGroups: [{ id: "frontend", label: "frontend", count: 2 }],
        warnings: [],
        nextSteps: ["next-a"],
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
      }
    },
    baselineReport: {
      summary: { total: 6, gitChanged: 5, synced: 6, "out-of-sync": 0, "missing-baseline": 0, "missing-runtime": 0 }
    },
    stagePlan: {
      groups: [{ id: "baseline", label: "baseline", count: 4 }]
    },
    deliveryPlan: {
      baselineDecision: { include: true, reason: "ok" },
      groups: [{ id: "baseline", include: true }],
      steps: [{ id: "verify-smoke" }, { id: "baseline-stage-commit" }]
    },
    deliveryManifest: {
      steps: [{ id: "verify-smoke" }, { id: "baseline-stage-commit" }]
    },
    executionAudit: {
      generatedAt: "2026-06-11T13:00:00.000Z",
      status: "dry-run",
      apply: false,
      mode: "all",
      results: [{ slug: "03-frontend-stage-commit" }]
    },
    executionAuditInventory: {
      fileCount: 2,
      aliasFileCount: 0
    },
    sessionAudit: {
      generatedAt: "2026-06-11T14:00:00.000Z",
      status: "applied",
      apply: true,
      commits: [{ slug: "03-frontend-stage-commit" }],
      results: [{ slug: "03-frontend-stage-commit", kind: "commit" }]
    },
    sessionAuditInventory: {
      fileCount: 3,
      aliasFileCount: 1
    },
    weappBundleAudit: {
      generatedAt: "2026-06-11T16:57:05.531Z",
      summary: {
        thresholdStatus: "within-limit",
        includedSizeKB: 741.4
      }
    },
    weappBundleAuditInventory: {
      fileCount: 2
    },
    weappDevtoolsAudit: {
      generatedAt: "2026-06-11T16:57:49.609Z",
      mode: "preview-success",
      ok: true
    },
    weappDevtoolsAuditInventory: {
      fileCount: 2
    },
    docsAudit: {
      generatedAt: "2026-06-12T12:00:00.000Z",
      ok: true,
      failures: []
    },
    docsAuditInventory: {
      fileCount: 2
    }
  });

  assert.equal(bundle.readyForReview, true);
  assert.equal(bundle.weappAudit.passed, true);
  assert.equal(bundle.weappSmoke.passed, true);
  assert.equal(bundle.weappBundleAuditArtifact.present, true);
  assert.equal(bundle.weappBundleAuditArtifact.thresholdStatus, "within-limit");
  assert.equal(bundle.weappDevtoolsAuditArtifact.present, true);
  assert.equal(bundle.weappDevtoolsAuditArtifact.mode, "preview-success");
  assert.equal(bundle.docsAuditArtifact.present, true);
  assert.equal(bundle.docsAuditArtifact.ok, true);
  assert.equal(bundle.executionAudit.present, true);
  assert.equal(bundle.sessionAudit.present, true);
});

test("delivery bundle should filter transient devtools artifacts from the final bundle", () => {
  assert.equal(shouldIncludeArtifactInBundle("output/weapp-devtools/active-run.lock"), false);
  assert.equal(shouldIncludeArtifactInBundle("output/weapp-devtools/active-run.lock.json"), false);
  assert.equal(shouldIncludeArtifactInBundle("output/weapp-devtools/preview-info.json"), false);
  assert.equal(shouldIncludeArtifactInBundle("output/weapp-devtools/latest.json"), true);

  const filtered = filterBundleArtifacts([
    { path: "output/weapp-devtools/active-run.lock", content: "" },
    { path: "output/weapp-devtools/active-run.lock.json", content: "" },
    { path: "output/weapp-devtools/preview-info.json", content: "" },
    { path: "output/weapp-devtools/latest.json", content: "{}\n" }
  ]);

  assert.deepEqual(filtered.map((item) => item.path), ["output/weapp-devtools/latest.json"]);
});

test("delivery bundle should render text and artifacts including weapp audits", () => {
  const bundle = {
    smokeStatus: "passed",
    smokePassed: true,
    readyForReview: true,
    totalChanged: 8,
    baselineDecision: { include: false, reason: "review baseline" },
    weappAudit: {
      passed: true,
      includedSizeKB: 741.4,
      thresholdStatus: "within-limit"
    },
    weappSmoke: {
      passed: true,
      mode: "preview-success"
    },
    docsCheck: {
      passed: true,
      failureCount: 0
    },
    stageGroups: [{ label: "baseline", count: 3, include: false }],
    executionAudit: { present: false, status: "missing", apply: false, mode: "", generatedAt: "", resultCount: 0, auditFileCount: 0 },
    sessionAudit: { present: false, status: "missing", apply: false, generatedAt: "", commitCount: 0, resultCount: 0, auditFileCount: 0, aliasAuditCount: 0 },
    weappBundleAuditArtifact: { present: true, thresholdStatus: "within-limit", includedSizeKB: 741.4 },
    weappDevtoolsAuditArtifact: { present: true, ok: true, mode: "preview-success" },
    docsAuditArtifact: { present: true, ok: true, failureCount: 0 },
    warnings: ["warn-a"],
    nextSteps: ["step-a"]
  };
  const text = renderDeliveryBundleText(bundle);
  const quickstart = buildBundleQuickstart(bundle);
  const runbook = buildBundleRunbook(bundle);
  assert.ok(text.includes("weapp:audit: passed"));
  assert.ok(text.includes("weapp:smoke: passed"));
  assert.ok(text.includes("docs:check: passed"));
  assert.ok(text.includes("小程序联调审计"));
  assert.ok(text.includes("先看 RUNBOOK.txt"));
  assert.ok(text.includes("QUICKSTART.txt"));
  assert.ok(text.includes("artifacts/manifest/OPERATOR.txt"));
  assert.ok(runbook.includes("广东公考小程序交付运行手册"));
  assert.ok(runbook.includes("1. 先看哪些文件"));
  assert.ok(runbook.includes("2. 演示前准备"));
  assert.ok(runbook.includes("6. 回退"));
  assert.ok(runbook.includes("artifacts/execute-audit/latest.json"));
  assert.ok(quickstart.includes("交付总包快速入口"));
  assert.ok(quickstart.includes("先看 RUNBOOK.txt"));
  assert.ok(quickstart.includes("当前状态"));
  assert.ok(quickstart.includes("最短路径"));
  assert.ok(quickstart.includes("artifacts/manifest/sequence-execute-dry-run.cmd"));

  const outputDir = path.join(os.tmpdir(), `delivery-bundle-${Date.now()}`);
  const artifacts = buildDeliveryBundleArtifacts({
    outputDir,
    bundle,
    checkResult: { smokePassed: true },
    baselineReport: { summary: {} },
    stageArtifacts: [{ path: path.join(outputDir, "stage", "plan.json"), content: "{}\n" }],
    planArtifacts: [{ path: path.join(outputDir, "plan", "sequence.cmd"), content: "@echo off\r\n" }],
    manifestArtifacts: [{ path: path.join(outputDir, "manifest", "steps", "01-verify-smoke.cmd"), content: "@echo off\r\n" }],
    executionAuditArtifacts: [{ path: path.join(outputDir, "delivery-execute", "latest.json"), content: "{}\n" }],
    sessionAuditArtifacts: [{ path: path.join(outputDir, "delivery-session", "latest.json"), content: "{}\n" }],
    weappBundleAuditArtifacts: [{ path: path.join(outputDir, "weapp-bundle", "latest.json"), content: "{}\n" }],
    weappDevtoolsAuditArtifacts: [
      { path: path.join(outputDir, "weapp-devtools", "latest.json"), content: "{}\n" },
      { path: path.join(outputDir, "weapp-devtools", "active-run.lock.json"), content: "{}\n" },
      { path: path.join(outputDir, "weapp-devtools", "preview-info.json"), content: "{}\n" }
    ],
    docsAuditArtifacts: [{ path: path.join(outputDir, "docs-entrypoints", "latest.json"), content: "{}\n" }]
  });

  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("stage", "plan.json"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("plan", "sequence.cmd"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("artifacts", "manifest", "steps", "01-verify-smoke.cmd"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith("RUNBOOK.txt")));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith("QUICKSTART.txt")));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("artifacts", "execute-audit", "latest.json"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("artifacts", "session-audit", "latest.json"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("artifacts", "weapp-bundle-audit", "latest.json"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("artifacts", "weapp-devtools-audit", "latest.json"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("artifacts", "docs-entrypoints-audit", "latest.json"))));
  assert.equal(artifacts.some((artifact) => artifact.path.endsWith(path.join("artifacts", "weapp-devtools-audit", "active-run.lock.json"))), false);
  assert.equal(artifacts.some((artifact) => artifact.path.endsWith(path.join("artifacts", "weapp-devtools-audit", "preview-info.json"))), false);

  const artifactText = renderWrittenBundleArtifactsText(artifacts, outputDir);
  assert.ok(artifactText.includes(path.join("artifacts", "bundle.json")));
  assert.ok(artifactText.includes("输出目录"));
});
