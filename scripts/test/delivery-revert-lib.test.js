const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveSessionAuditPath,
  extractRevertCommits,
  buildRevertCommand,
  buildRevertAuditCommand,
  buildRevertPlan
} = require("../delivery-revert-lib");

test("delivery revert lib should resolve session audit path", () => {
  const root = path.join("C:", "repo");
  assert.equal(
    resolveSessionAuditPath(root, ""),
    path.join(root, "output", "delivery-session", "latest.json")
  );
  assert.equal(
    resolveSessionAuditPath(root, "tmp/audit.json"),
    path.resolve(root, "tmp/audit.json")
  );
});

test("delivery revert lib should reverse committed order for git revert", () => {
  const commits = extractRevertCommits({
    commits: [
      { commit: "aaa111", subject: "first" },
      { commit: "bbb222", subject: "second" },
      { commit: "bbb222", subject: "duplicate" }
    ]
  });

  assert.deepEqual(commits.map((item) => item.commit), ["bbb222", "aaa111"]);
  assert.equal(buildRevertCommand("aaa111"), "git revert --no-edit aaa111");
  assert.equal(
    buildRevertAuditCommand("output/delivery-session/03-frontend-stage-commit.json"),
    "node scripts/delivery-revert.js --audit output/delivery-session/03-frontend-stage-commit.json --apply"
  );
});

test("delivery revert lib should render session revert plan", () => {
  const audit = {
    headState: {
      beforeHead: "head111",
      afterHead: "head222"
    },
    commits: [
      { commit: "aaa111", subject: "frontend" },
      { commit: "bbb222", subject: "platform" }
    ]
  };

  const text = buildRevertPlan({
    auditPath: "output/delivery-session/latest.json",
    audit,
    apply: false
  });

  assert.ok(text.includes("Delivery revert plan"));
  assert.ok(text.includes("commitCount: 2"));
  assert.ok(text.includes("headBefore: head111"));
  assert.ok(text.includes("git revert --no-edit bbb222"));
  assert.ok(text.includes("does not rewrite history"));
});
