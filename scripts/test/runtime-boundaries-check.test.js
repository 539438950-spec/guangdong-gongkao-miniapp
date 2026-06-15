const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  collectRuntimeBoundaryState,
  buildRuntimeBoundaryAudit,
  writeRuntimeBoundaryAudit
} = require("../runtime-boundaries-check");

test("runtime boundaries check should expose current runtime path contract", () => {
  const state = collectRuntimeBoundaryState();

  assert.ok(state.requiredIgnoreEntries.includes("output/"));
  assert.ok(state.requiredRuntimeBoundaryTokens.includes("npm run runtime:check"));
  assert.ok(state.requiredRuntimePathTokens.some((item) => item.endsWith("services/api/var/runtime/user-state.json")));
  assert.ok(state.requiredRuntimePathTokens.some((item) => item.endsWith("services/ingest/var/runtime/ingested.js")));
  assert.ok(state.requiredRuntimePathTokens.some((item) => item.endsWith("services/ingest/var/runtime/position-overrides.json")));
  assert.ok(state.requiredRuntimePathTokens.some((item) => item.endsWith("services/ingest/var/runtime/artifacts")));
});

test("runtime boundaries check should pass against the current repo contract", () => {
  const audit = buildRuntimeBoundaryAudit();

  assert.equal(audit.ok, true);
  assert.ok(audit.checkedScripts.includes("runtime:check"));
  assert.ok(audit.checkedFiles.includes("services/runtime-paths.js"));
  assert.equal(audit.failures.length, 0);
});

test("runtime boundaries check should write latest and canonical audit files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-boundaries-audit-"));
  const audit = buildRuntimeBoundaryAudit();
  const written = writeRuntimeBoundaryAudit(audit, root);

  assert.ok(fs.existsSync(written.latestPath));
  assert.ok(fs.existsSync(written.canonicalPath));
  assert.ok(fs.existsSync(written.readmePath));
  assert.ok(written.canonicalPath.endsWith(`${audit.statusId}.json`));
});
