const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  sanitizeStatusStamp,
  buildDemoStatus,
  renderDemoStatusReadme,
  buildDemoStatusArtifacts,
  buildWeappRuntimeEnvModule
} = require("../demo-start-lib");

test("demo-start lib should sanitize timestamps for status ids", () => {
  assert.equal(
    sanitizeStatusStamp("2026-06-11T15:10:05.123Z"),
    "2026-06-11T15-10-05-123Z"
  );
});

test("demo-start lib should build stable status payload and artifacts", () => {
  const status = buildDemoStatus({
    generatedAt: "2026-06-11T15:10:05.123Z",
    status: "ready",
    baseUrl: "http://127.0.0.1:52861",
    args: {
      check: true,
      noIngest: true,
      port: 3100,
      storeRoot: "runtime/store",
      snapshotTarget: "runtime/ingested.js",
      demoSnapshotTarget: "apps/weapp/data/demo.js",
      positionOverridePath: "runtime/position-overrides.json",
      userStateFile: "runtime/user-state.json"
    },
    instance: {
      requestedPort: 3100,
      port: 52861
    },
    report: {
      summary: {
        total: 3,
        byReadiness: {
          blocked: 2,
          demo: 1
        }
      }
    },
    snapshot: {
      notices: [{ id: "n1" }, { id: "n2" }],
      positions: [{ id: "p1" }],
      sourceStates: [{ sourceId: "rsks-gd" }],
      reviewQueue: [],
      compareGroups: [{ id: "g1" }]
    },
    verification: {
      notices: [{ id: "n1" }, { id: "n2" }],
      sourceStates: [{ sourceId: "rsks-gd" }],
      reviewQueue: [],
      compareGroups: [{ id: "g1" }, { id: "g2" }],
      positionsPayload: {
        positions: [{ id: "p1" }, { id: "p2" }]
      }
    }
  });

  assert.equal(status.statusId, "2026-06-11T15-10-05-123Z");
  assert.equal(status.status, "ready");
  assert.equal(status.sessionKind, "check");
  assert.equal(status.baseUrl, "http://127.0.0.1:52861");
  assert.equal(status.demoUrl, "http://127.0.0.1:52861/demo");
  assert.equal(status.portFallback, true);
  assert.equal(status.snapshotSummary.noticeCount, 2);
  assert.equal(status.verificationSummary.structuredPositionCount, 2);
  assert.deepEqual(status.healthReportSummary.byReadiness, {
    blocked: 2,
    demo: 1
  });

  const readme = renderDemoStatusReadme(status);
  assert.ok(readme.includes("status: ready"));
  assert.ok(readme.includes("demoUrl: http://127.0.0.1:52861/demo"));
  assert.ok(readme.includes("structuredPositions: 2"));

  const artifacts = buildDemoStatusArtifacts(status, {
    outputDir: path.join("output", "demo-start")
  });
  assert.equal(artifacts.length, 5);
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("output", "demo-start", "latest.json"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("output", "demo-start", "latest-check.json"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("output", "demo-start", "README.txt"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("output", "demo-start", "open-demo-check.url"))));
  assert.ok(!artifacts.some((artifact) => artifact.path.endsWith(path.join("output", "demo-start", "open-demo.url"))));

  const runtimeModule = buildWeappRuntimeEnvModule(status);
  assert.ok(runtimeModule.includes("apiMode: \"remote\""));
  assert.ok(runtimeModule.includes("\"http://127.0.0.1:52861\""));
});

test("demo-start lib should keep failure status without demo shortcut when base url is missing", () => {
  const status = buildDemoStatus({
    generatedAt: "2026-06-11T15:11:00.000Z",
    status: "failed",
    args: {
      check: true,
      noIngest: false,
      port: 3100,
      storeRoot: "",
      snapshotTarget: "",
      demoSnapshotTarget: "",
      positionOverridePath: "",
      userStateFile: ""
    },
    error: new Error("boom")
  });

  assert.equal(status.demoUrl, "");
  assert.equal(status.error, "boom");
  assert.equal(status.sessionKind, "check");

  const artifacts = buildDemoStatusArtifacts(status, {
    outputDir: path.join("output", "demo-start")
  });
  assert.equal(artifacts.length, 4);
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("output", "demo-start", "latest-check.json"))));
  assert.ok(!artifacts.some((artifact) => artifact.path.endsWith("open-demo.url")));
});

test("demo-start lib should keep serve shortcut aliases for live demo sessions", () => {
  const status = buildDemoStatus({
    generatedAt: "2026-06-11T18:00:00.000Z",
    status: "ready",
    baseUrl: "http://127.0.0.1:3100",
    args: {
      check: false,
      noIngest: false
    },
    instance: {
      requestedPort: 3100,
      port: 3100
    }
  });

  const artifacts = buildDemoStatusArtifacts(status, {
    outputDir: path.join("output", "demo-start")
  });

  assert.equal(status.sessionKind, "serve");
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("output", "demo-start", "latest-serve.json"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("output", "demo-start", "open-demo-serve.url"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("output", "demo-start", "open-demo.url"))));
});
