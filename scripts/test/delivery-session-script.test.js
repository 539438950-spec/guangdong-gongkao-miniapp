const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

function runGit(args, cwd) {
  return cp.execFileSync("git", args, {
    cwd,
    encoding: "utf8"
  });
}

test("delivery session and revert should support isolated repo-root rehearsal", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-session-repo-"));
  const sessionScript = path.resolve(process.cwd(), "scripts", "delivery-session.js");
  const revertScript = path.resolve(process.cwd(), "scripts", "delivery-revert.js");
  const restoreScript = path.resolve(process.cwd(), "scripts", "delivery-restore.js");

  runGit(["init"], repo);
  runGit(["config", "user.name", "Codex Test"], repo);
  runGit(["config", "user.email", "codex@example.com"], repo);

  fs.writeFileSync(path.join(repo, "a.txt"), "before\n", "utf8");
  runGit(["add", "--", "a.txt"], repo);
  runGit(["commit", "-m", "chore: initial"], repo);

  fs.writeFileSync(path.join(repo, "a.txt"), "after\n", "utf8");
  fs.writeFileSync(path.join(repo, "notes.md"), "keep out of scope\n", "utf8");

  const manifestPath = path.join(repo, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    smokeStatus: "required",
    baselineDecision: { include: true, reason: "ok" },
    steps: [
      {
        order: 1,
        id: "frontend-stage-commit",
        slug: "01-frontend-stage-commit",
        title: "Frontend commit",
        required: true,
        reason: "",
        groupId: "frontend",
        commands: [
          "git add -- a.txt",
          "git commit -m \"feat: update a\""
        ],
        fileCount: 1,
        files: ["a.txt"]
      }
    ]
  }, null, 2), "utf8");

  cp.execFileSync(process.execPath, [
    sessionScript,
    "--repo-root",
    repo,
    "--manifest",
    "manifest.json",
    "--step",
    "frontend",
    "--apply",
    "--force",
    "--skip-delivery-check",
    "--write-audit",
    "--audit-alias",
    "frontend-test"
  ], {
    cwd: process.cwd(),
    stdio: "pipe"
  });

  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8").replace(/\r\n/g, "\n"), "after\n");
  assert.ok(fs.existsSync(path.join(repo, "output", "delivery-session", "frontend-test.json")));
  const sessionAudit = JSON.parse(fs.readFileSync(path.join(repo, "output", "delivery-session", "latest.json"), "utf8"));
  assert.equal(sessionAudit.workspacePreflight.selectedChangedCount, 1);
  assert.ok(sessionAudit.workspacePreflight.outsideSelectedChangedCount >= 1);
  assert.ok(sessionAudit.workspacePreflight.outsideSelectedChangedFiles.includes("notes.md"));

  const restoreDryRun = cp.execFileSync(process.execPath, [
    restoreScript,
    "--repo-root",
    repo,
    "--audit-kind",
    "session",
    "--audit",
    path.join("output", "delivery-session", "frontend-test.json"),
    "--target",
    "before"
  ], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.ok(restoreDryRun.includes("auditKind: session"));

  cp.execFileSync(process.execPath, [
    revertScript,
    "--repo-root",
    repo,
    "--audit",
    path.join("output", "delivery-session", "frontend-test.json"),
    "--apply"
  ], {
    cwd: process.cwd(),
    stdio: "pipe"
  });

  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8").replace(/\r\n/g, "\n"), "before\n");
  const subjects = runGit(["log", "--pretty=%s", "-3"], repo);
  assert.ok(subjects.includes("Revert \"feat: update a\""));
  assert.ok(subjects.includes("feat: update a"));
});
