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

test("delivery execute should support isolated repo-root rehearsal for stage and commit", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-execute-repo-"));
  const executeScript = path.resolve(process.cwd(), "scripts", "delivery-execute.js");

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
    executeScript,
    "--repo-root",
    repo,
    "--manifest",
    "manifest.json",
    "--step",
    "frontend",
    "--stage-only",
    "--apply",
    "--force",
    "--skip-delivery-check",
    "--write-audit"
  ], {
    cwd: process.cwd(),
    stdio: "pipe"
  });

  const staged = runGit(["diff", "--cached", "--name-only"], repo).trim();
  assert.equal(staged, "a.txt");
  const stageAudit = JSON.parse(fs.readFileSync(path.join(repo, "output", "delivery-execute", "latest.json"), "utf8"));
  assert.equal(stageAudit.mode, "stage");
  assert.equal(stageAudit.status, "applied");
  assert.deepEqual(stageAudit.indexState.afterStagedFiles, ["a.txt"]);
  assert.equal(stageAudit.workspacePreflight.selectedChangedCount, 1);
  assert.ok(stageAudit.workspacePreflight.outsideSelectedChangedCount >= 1);
  assert.ok(stageAudit.workspacePreflight.outsideSelectedChangedFiles.includes("notes.md"));

  cp.execFileSync(process.execPath, [
    executeScript,
    "--repo-root",
    repo,
    "--manifest",
    "manifest.json",
    "--step",
    "frontend",
    "--commit-only",
    "--apply",
    "--force",
    "--skip-delivery-check",
    "--write-audit"
  ], {
    cwd: process.cwd(),
    stdio: "pipe"
  });

  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8").replace(/\r\n/g, "\n"), "after\n");
  const committedAudit = JSON.parse(fs.readFileSync(path.join(repo, "output", "delivery-execute", "latest.json"), "utf8"));
  assert.equal(committedAudit.mode, "commit");
  assert.equal(committedAudit.status, "applied");
  assert.deepEqual(committedAudit.indexState.afterStagedFiles, []);
  assert.ok(committedAudit.workspacePreflight.outsideSelectedChangedCount >= 1);
  assert.ok(committedAudit.workspacePreflight.outsideSelectedChangedFiles.includes("notes.md"));
  const subjects = runGit(["log", "--pretty=%s", "-2"], repo);
  assert.ok(subjects.includes("feat: update a"));
});
