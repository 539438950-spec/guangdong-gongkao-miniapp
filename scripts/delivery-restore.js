#!/usr/bin/env node

const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  normalizeAuditKind,
  resolveAuditPath,
  resolveTargetTree,
  renderRestorePlan
} = require("./delivery-restore-lib");

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

function runReadTree(tree) {
  cp.execFileSync("git", ["read-tree", tree], {
    cwd: repoRoot(),
    stdio: "inherit"
  });
}

function main() {
  const auditKind = normalizeAuditKind(readFlagValue("--audit-kind"));
  const auditPath = resolveAuditPath(repoRoot(), {
    auditPath: readFlagValue("--audit"),
    kind: auditKind
  });
  if (!fs.existsSync(auditPath)) {
    throw new Error(`Delivery restore audit file not found: ${auditPath}`);
  }
  const audit = loadAudit(auditPath);
  const target = readFlagValue("--target") || "before";
  const tree = resolveTargetTree(audit, target);

  if (!tree) {
    throw new Error(`Audit does not contain an index tree for target: ${target}`);
  }

  process.stdout.write(renderRestorePlan({
    auditPath,
    auditKind,
    audit,
    target,
    apply: hasFlag("--apply"),
    tree
  }));

  if (!hasFlag("--apply")) {
    return;
  }

  runReadTree(tree);
}

main();
