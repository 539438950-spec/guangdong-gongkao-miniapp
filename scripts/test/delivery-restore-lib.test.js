const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeAuditKind,
  resolveDefaultAuditPath,
  resolveAuditPath,
  resolveTargetTree,
  detectAuditKind,
  renderRestorePlan
} = require("../delivery-restore-lib");

test("delivery restore lib should normalize audit kinds and choose default paths", () => {
  assert.equal(normalizeAuditKind(""), "execute");
  assert.equal(normalizeAuditKind("session"), "session");

  const root = path.join("C:", "repo");
  assert.equal(
    resolveDefaultAuditPath(root, "execute"),
    path.join(root, "output", "delivery-execute", "latest.json")
  );
  assert.equal(
    resolveDefaultAuditPath(root, "session"),
    path.join(root, "output", "delivery-session", "latest.json")
  );
});

test("delivery restore lib should resolve explicit and implicit audit paths", () => {
  const root = path.join("C:", "repo");
  assert.equal(
    resolveAuditPath(root, { kind: "session" }),
    path.join(root, "output", "delivery-session", "latest.json")
  );
  assert.equal(
    resolveAuditPath(root, { auditPath: "tmp/audit.json", kind: "execute" }),
    path.resolve(root, "tmp/audit.json")
  );
});

test("delivery restore lib should detect audit kind and render session head context", () => {
  const audit = {
    headState: {
      beforeHead: "aaa111",
      afterHead: "bbb222"
    },
    indexState: {
      beforeTree: "tree111",
      afterTree: "tree222"
    }
  };

  assert.equal(detectAuditKind(audit, "execute"), "session");
  assert.equal(resolveTargetTree(audit, "before"), "tree111");
  assert.equal(resolveTargetTree(audit, "after"), "tree222");

  const text = renderRestorePlan({
    auditPath: "output/delivery-session/latest.json",
    auditKind: "session",
    audit,
    target: "before",
    apply: false,
    tree: "tree111"
  });
  assert.ok(text.includes("auditKind: session"));
  assert.ok(text.includes("headBefore: aaa111"));
  assert.ok(text.includes("does not move HEAD"));
});
