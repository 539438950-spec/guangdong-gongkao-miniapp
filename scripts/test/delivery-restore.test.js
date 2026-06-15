const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

test("delivery restore should prefer explicit audit file and default to before tree", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-restore-"));
  const auditPath = path.join(root, "audit.json");
  fs.writeFileSync(auditPath, JSON.stringify({
    indexState: {
      beforeTree: "aaa111",
      afterTree: "bbb222"
    }
  }), "utf8");

  const script = path.resolve(process.cwd(), "scripts", "delivery-restore.js");
  const dryRun = require("node:child_process").execFileSync(process.execPath, [
    script,
    "--audit",
    auditPath
  ], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.ok(dryRun.includes("target: before"));
  assert.ok(dryRun.includes("auditKind: execute"));
  assert.ok(dryRun.includes("tree: aaa111"));
});

test("delivery restore should support after target in dry-run output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-restore-"));
  const auditPath = path.join(root, "audit.json");
  fs.writeFileSync(auditPath, JSON.stringify({
    indexState: {
      beforeTree: "aaa111",
      afterTree: "bbb222"
    }
  }), "utf8");

  const script = path.resolve(process.cwd(), "scripts", "delivery-restore.js");
  const dryRun = require("node:child_process").execFileSync(process.execPath, [
    script,
    "--audit",
    auditPath,
    "--target",
    "after"
  ], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.ok(dryRun.includes("target: after"));
  assert.ok(dryRun.includes("auditKind: execute"));
  assert.ok(dryRun.includes("tree: bbb222"));
});

test("delivery restore should accept delivery session audit format", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-restore-session-"));
  const auditPath = path.join(root, "session-audit.json");
  fs.writeFileSync(auditPath, JSON.stringify({
    headState: {
      beforeHead: "head111",
      afterHead: "head222"
    },
    indexState: {
      beforeTree: "tree111",
      afterTree: "tree222"
    },
    restoreHints: {
      latestAudit: "output/delivery-session/latest.json"
    }
  }), "utf8");

  const script = path.resolve(process.cwd(), "scripts", "delivery-restore.js");
  const dryRun = require("node:child_process").execFileSync(process.execPath, [
    script,
    "--audit-kind",
    "session",
    "--audit",
    auditPath
  ], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.ok(dryRun.includes("target: before"));
  assert.ok(dryRun.includes("auditKind: session"));
  assert.ok(dryRun.includes("headBefore: head111"));
  assert.ok(dryRun.includes("tree: tree111"));
});
