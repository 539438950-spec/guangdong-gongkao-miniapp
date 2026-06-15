const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  sanitizeSmokeStamp,
  summarizeSteps,
  buildMvpSmokeAudit,
  renderMvpSmokeReadme,
  buildMvpSmokeArtifacts
} = require("../mvp-smoke-lib");

test("mvp smoke lib should sanitize timestamps for audit ids", () => {
  assert.equal(
    sanitizeSmokeStamp("2026-06-12T12:00:01.234Z"),
    "2026-06-12T12-00-01-234Z"
  );
});

test("mvp smoke lib should summarize steps and render artifacts", () => {
  const summary = summarizeSteps([
    { passed: true, durationMs: 100 },
    { passed: false, durationMs: 200 }
  ]);

  assert.deepEqual(summary, {
    total: 2,
    passed: 1,
    failed: 1,
    totalDurationMs: 300
  });

  const audit = buildMvpSmokeAudit({
    generatedAt: "2026-06-12T12:00:01.234Z",
    status: "failed",
    error: "demo check failed",
    steps: [
      {
        id: "demo-check",
        label: "demo --check --no-ingest",
        command: "node scripts/demo-start.js --check --no-ingest --port 0",
        passed: true,
        exitCode: 0,
        timedOut: false,
        durationMs: 1200
      },
      {
        id: "api-tests",
        label: "services/api tests",
        command: "npm run test:api",
        passed: false,
        exitCode: 1,
        timedOut: false,
        durationMs: 3200
      }
    ]
  });

  assert.equal(audit.ok, false);
  assert.equal(audit.summary.total, 2);
  assert.equal(audit.summary.failed, 1);
  assert.equal(audit.statusId, "2026-06-12T12-00-01-234Z");

  const readme = renderMvpSmokeReadme(audit);
  assert.ok(readme.includes("status: failed"));
  assert.ok(readme.includes("demo --check --no-ingest: passed"));
  assert.ok(readme.includes("services/api tests: failed"));

  const artifacts = buildMvpSmokeArtifacts(audit, {
    outputDir: path.join("output", "mvp-smoke")
  });
  assert.equal(artifacts.length, 3);
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("output", "mvp-smoke", "latest.json"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("output", "mvp-smoke", "README.txt"))));
});
