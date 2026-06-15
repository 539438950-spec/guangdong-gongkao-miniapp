#!/usr/bin/env node

const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  resolveSessionAuditPath,
  extractRevertCommits,
  buildRevertPlan
} = require("./delivery-revert-lib");

function hasFlag(name) {
  return process.argv.includes(name);
}

function readFlagValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) {
    return "";
  }
  return process.argv[index + 1];
}

function defaultRepoRoot() {
  return path.resolve(__dirname, "..");
}

function repoRoot() {
  const raw = readFlagValue("--repo-root");
  if (!raw) {
    return defaultRepoRoot();
  }
  return path.resolve(process.cwd(), raw);
}

function loadAudit(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runRevert(commitSha) {
  cp.execFileSync("git", ["revert", "--no-edit", commitSha], {
    cwd: repoRoot(),
    stdio: "inherit"
  });
}

function main() {
  const auditPath = resolveSessionAuditPath(repoRoot(), readFlagValue("--audit"));
  if (!fs.existsSync(auditPath)) {
    throw new Error(`Delivery revert audit file not found: ${auditPath}`);
  }
  const audit = loadAudit(auditPath);
  const revertCommits = extractRevertCommits(audit);

  if (hasFlag("--json")) {
    console.log(JSON.stringify({
      auditPath,
      revertCommits
    }, null, 2));
    return;
  }

  process.stdout.write(buildRevertPlan({
    auditPath,
    audit,
    apply: hasFlag("--apply")
  }));

  if (!hasFlag("--apply")) {
    return;
  }

  if (!revertCommits.length) {
    throw new Error("Delivery session audit does not contain committed entries to revert.");
  }

  revertCommits.forEach((commit) => {
    runRevert(commit.commit);
  });
}

main();
