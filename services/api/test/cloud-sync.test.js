const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { syncCloudFunctionPackage } = require("../../../scripts/sync-cloudfunction");

test("cloud sync should generate deployable function scaffold and runtime mirror", () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(tmpRoot, "cloud-sync-"));
  const functionRoot = path.join(fixtureRoot, "cloudfunctions", "gongkao-api");

  const result = syncCloudFunctionPackage({
    rootDir: process.cwd(),
    functionRoot
  });

  assert.equal(result.functionRoot, functionRoot);
  assert.equal(fs.existsSync(path.join(functionRoot, "index.js")), true);
  assert.equal(fs.existsSync(path.join(functionRoot, "package.json")), true);
  assert.equal(fs.existsSync(path.join(functionRoot, "runtime", "services", "api", "src", "cloud-function.js")), true);
  assert.equal(fs.existsSync(path.join(functionRoot, "runtime", "apps", "weapp", "data", "ingested.js")), true);
  assert.equal(fs.existsSync(path.join(functionRoot, "runtime", "services", "ingest", "var", "review")), true);

  const manifest = JSON.parse(fs.readFileSync(path.join(functionRoot, "runtime-manifest.json"), "utf8"));
  assert.ok(manifest.files.includes("services/api/src/core.js"));
  assert.ok(manifest.directories.includes("services/ingest/var/production"));
});
