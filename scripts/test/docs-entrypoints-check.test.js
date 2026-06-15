const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  collectDocsState,
  buildDocsEntryPointsAudit,
  writeDocsEntryPointsAudit
} = require("../docs-entrypoints-check");

test("docs entrypoints check should validate core docs, scripts, and artifact references", () => {
  const result = buildDocsEntryPointsAudit();

  assert.equal(result.ok, true);
  assert.ok(result.checkedFiles.includes("README.md"));
  assert.ok(result.checkedFiles.includes("docs/role-guide.md"));
  assert.ok(result.checkedScripts.includes("docs:check"));
  assert.ok(result.checkedScripts.includes("runtime:check"));
  assert.ok(result.checkedScripts.includes("delivery:bundle:write"));
});

test("docs entrypoints state should expose the expected document and script contract", () => {
  const state = collectDocsState();

  assert.ok(state.expectedDocs.includes("docs/command-matrix.md"));
  assert.ok(state.expectedDocs.includes("docs/delivery-checklist.md"));
  assert.ok(state.requiredScripts.includes("mvp:smoke"));
  assert.ok(state.requiredScripts.includes("runtime:check"));
  assert.ok(state.requiredScripts.includes("baseline:refresh"));
  assert.ok(state.requiredArtifactTokens.includes("output/delivery-bundle/**"));
  assert.ok(state.requiredArtifactTokens.includes("output/runtime-boundaries/**"));
});

test("docs entrypoints check should write latest and canonical audit files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-entrypoints-audit-"));
  const audit = buildDocsEntryPointsAudit();
  const written = writeDocsEntryPointsAudit(audit, root);

  assert.ok(fs.existsSync(written.latestPath));
  assert.ok(fs.existsSync(written.canonicalPath));
  assert.ok(fs.existsSync(written.readmePath));
  assert.ok(written.canonicalPath.endsWith(`${audit.statusId}.json`));
});
