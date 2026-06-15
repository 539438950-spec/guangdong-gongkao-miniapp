const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

test("delivery revert should render reverse commit order from explicit audit", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-revert-"));
  const auditPath = path.join(root, "session-audit.json");
  fs.writeFileSync(auditPath, JSON.stringify({
    headState: {
      beforeHead: "head111",
      afterHead: "head222"
    },
    commits: [
      { commit: "aaa111", subject: "frontend" },
      { commit: "bbb222", subject: "platform" }
    ]
  }), "utf8");

  const script = path.resolve(process.cwd(), "scripts", "delivery-revert.js");
  const dryRun = require("node:child_process").execFileSync(process.execPath, [
    script,
    "--audit",
    auditPath
  ], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.ok(dryRun.includes("Delivery revert plan"));
  assert.ok(dryRun.includes("commitCount: 2"));
  assert.ok(dryRun.includes("git revert --no-edit bbb222"));
  assert.ok(dryRun.includes("git revert --no-edit aaa111"));
});

test("delivery revert should support json output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-revert-json-"));
  const auditPath = path.join(root, "session-audit.json");
  fs.writeFileSync(auditPath, JSON.stringify({
    commits: [
      { commit: "aaa111", subject: "frontend" }
    ]
  }), "utf8");

  const script = path.resolve(process.cwd(), "scripts", "delivery-revert.js");
  const json = require("node:child_process").execFileSync(process.execPath, [
    script,
    "--audit",
    auditPath,
    "--json"
  ], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  const parsed = JSON.parse(json);
  assert.equal(parsed.revertCommits.length, 1);
  assert.equal(parsed.revertCommits[0].commit, "aaa111");
});
