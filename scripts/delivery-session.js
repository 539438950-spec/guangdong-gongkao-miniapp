#!/usr/bin/env node

const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { collectDeliveryCheckResult } = require("./delivery-check");
const { collectDeliveryReport } = require("./delivery-report-lib");
const { buildBaselineReport } = require("./baseline-report-lib");
const { buildStagePlan } = require("./delivery-stage-lib");
const { buildDeliveryPlan } = require("./delivery-plan-lib");
const { buildDeliveryManifest } = require("./delivery-manifest-lib");
const {
  selectManifestSteps,
  buildExecutionEntries,
  parseGitStatusShort,
  buildWorkspacePreflight,
  parseGitNameOnly,
  verifyStageTransition
} = require("./delivery-execute-lib");
const {
  buildSessionGuard,
  buildRestoreHints,
  buildSessionAudit,
  recordSessionResult,
  recordSessionCommit,
  finalizeSessionAudit,
  buildSessionAuditArtifacts,
  renderSessionPlan
} = require("./delivery-session-lib");

function defaultRepoRoot() {
  return path.resolve(__dirname, "..");
}

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

function repoRoot() {
  const raw = readFlagValue("--repo-root");
  if (!raw) {
    return defaultRepoRoot();
  }
  return path.resolve(process.cwd(), raw);
}

function parseAuditDir() {
  const raw = readFlagValue("--audit-dir");
  if (!raw) {
    return path.join(repoRoot(), "output", "delivery-session");
  }
  return path.resolve(repoRoot(), raw);
}

function parseAuditAlias() {
  return String(readFlagValue("--audit-alias") || "").trim();
}

function shouldSkipDeliveryCheck() {
  return hasFlag("--skip-delivery-check");
}

function loadManifestFromFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildCurrentManifest() {
  const deliveryReport = collectDeliveryReport();
  const baselineReport = buildBaselineReport({ deliveryReport });
  const stagePlan = buildStagePlan(deliveryReport);
  const deliveryPlan = buildDeliveryPlan({
    deliveryReport,
    stagePlan,
    baselineReport,
    smokeStatus: "required"
  });

  return buildDeliveryManifest(deliveryPlan, stagePlan);
}

function resolveManifest() {
  const manifestPath = readFlagValue("--manifest");
  if (manifestPath) {
    return loadManifestFromFile(path.resolve(repoRoot(), manifestPath));
  }
  return buildCurrentManifest();
}

function runCommand(command) {
  if (process.platform === "win32") {
    cp.execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
      cwd: repoRoot(),
      stdio: "inherit"
    });
    return;
  }

  cp.execFileSync("sh", ["-lc", command], {
    cwd: repoRoot(),
    stdio: "inherit"
  });
}

function writeArtifacts(artifacts = []) {
  artifacts.forEach((artifact) => {
    fs.mkdirSync(path.dirname(artifact.path), { recursive: true });
    fs.writeFileSync(artifact.path, artifact.content, "utf8");
  });
}

function readStagedFiles() {
  return parseGitNameOnly(cp.execFileSync("git", ["diff", "--cached", "--name-only"], {
    cwd: repoRoot(),
    encoding: "utf8"
  }));
}

function readChangedFiles() {
  return parseGitStatusShort(cp.execFileSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: repoRoot(),
    encoding: "utf8"
  })).map((item) => item.file);
}

function readIndexTree() {
  return String(cp.execFileSync("git", ["write-tree"], {
    cwd: repoRoot(),
    encoding: "utf8"
  }) || "").trim();
}

function readHead() {
  return String(cp.execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot(),
    encoding: "utf8"
  }) || "").trim();
}

function readHeadSubject() {
  return String(cp.execFileSync("git", ["log", "-1", "--pretty=%s"], {
    cwd: repoRoot(),
    encoding: "utf8"
  }) || "").trim();
}

function resolveSelectedSteps(manifest) {
  return selectManifestSteps(manifest, {
    allRequired: hasFlag("--all-required"),
    includeReview: hasFlag("--include-review"),
    step: readFlagValue("--step")
  });
}

function main() {
  const manifest = resolveManifest();
  const apply = hasFlag("--apply");
  const force = hasFlag("--force");
  const skipDeliveryCheck = shouldSkipDeliveryCheck();
  const writeAudit = hasFlag("--write-audit");
  const allowPreStaged = hasFlag("--allow-prestaged");
  const auditDir = parseAuditDir();
  const auditAlias = parseAuditAlias();
  const customRepoRoot = Boolean(readFlagValue("--repo-root"));

  if (skipDeliveryCheck && !force) {
    throw new Error("`--skip-delivery-check` requires `--force` so bypassing the gate is always explicit.");
  }
  if (customRepoRoot && apply && !skipDeliveryCheck) {
    throw new Error("Custom `--repo-root` apply runs require `--skip-delivery-check --force`; delivery-check only reflects the current workspace.");
  }

  const selectedSteps = resolveSelectedSteps(manifest);
  const entries = buildExecutionEntries(selectedSteps, { mode: "all" });
  const beforeHead = readHead();
  const beforeStagedFiles = readStagedFiles();
  const beforeChangedFiles = readChangedFiles();
  const checkResult = apply && !skipDeliveryCheck ? collectDeliveryCheckResult() : null;
  const guard = buildSessionGuard(entries, checkResult, {
    apply,
    force,
    allowPreStaged,
    initialStagedFiles: beforeStagedFiles
  });
  const workspacePreflight = buildWorkspacePreflight(entries, {
    changedFiles: beforeChangedFiles,
    stagedFiles: beforeStagedFiles
  });
  const relativeAuditDir = path.relative(repoRoot(), auditDir).replace(/\\/g, "/");
  const audit = buildSessionAudit({
    apply,
    force,
    manifest,
    selectedSteps,
    entries,
    guard,
    checkResult,
    workspacePreflight,
    status: apply ? "pending" : "dry-run",
    headState: {
      beforeHead,
      afterHead: ""
    },
    indexState: {
      beforeTree: readIndexTree(),
      afterTree: "",
      beforeStagedFiles,
      afterStagedFiles: []
    },
    restoreHints: buildRestoreHints(relativeAuditDir, "")
  });

  if (hasFlag("--json")) {
    console.log(JSON.stringify({
      manifest,
      selectedSteps,
      entries,
      guard,
      workspacePreflight,
      checkResult,
      audit
    }, null, 2));
    return;
  }

  process.stdout.write(renderSessionPlan(manifest, entries, {
    apply,
    force,
    initialStagedFiles: beforeStagedFiles,
    workspacePreflight
  }));

  if (!apply) {
    finalizeSessionAudit(audit, {
      restoreHints: buildRestoreHints(relativeAuditDir, audit.auditId),
      headState: {
        ...audit.headState,
        afterHead: readHead()
      },
      indexState: {
        ...audit.indexState,
        afterTree: readIndexTree(),
        afterStagedFiles: readStagedFiles()
      }
    });
    if (writeAudit) {
      writeArtifacts(buildSessionAuditArtifacts(audit, {
        outputDir: auditDir,
        auditAlias
      }));
    }
    return;
  }

  if (!guard.canApply) {
    finalizeSessionAudit(audit, {
      status: "blocked",
      error: guard.reasons.join(" "),
      restoreHints: buildRestoreHints(relativeAuditDir, audit.auditId),
      headState: {
        ...audit.headState,
        afterHead: readHead()
      },
      indexState: {
        ...audit.indexState,
        afterTree: readIndexTree(),
        afterStagedFiles: readStagedFiles()
      }
    });
    if (writeAudit) {
      writeArtifacts(buildSessionAuditArtifacts(audit, {
        outputDir: auditDir,
        auditAlias
      }));
    }
    throw new Error(guard.reasons.join(" "));
  }

  try {
    entries.forEach((entry) => {
      if (entry.kind === "verify") {
        entry.commands.forEach((command) => runCommand(command));
        recordSessionResult(audit, {
          slug: entry.slug,
          kind: entry.kind,
          commands: entry.commands.slice(),
          status: "ok"
        });
        return;
      }

      if (entry.kind === "stage") {
        const beforeFiles = readStagedFiles();
        entry.commands.forEach((command) => runCommand(command));
        const afterFiles = readStagedFiles();
        const verification = verifyStageTransition(beforeFiles, afterFiles, entry.files);
        const result = {
          slug: entry.slug,
          kind: entry.kind,
          commands: entry.commands.slice(),
          status: verification.ok ? "ok" : "failed",
          beforeStagedFiles: beforeFiles,
          afterStagedFiles: afterFiles,
          verification
        };
        recordSessionResult(audit, result);
        if (!verification.ok) {
          throw new Error(`Stage verification failed for ${entry.slug}: missing=${verification.missing.join(",") || "none"} unexpected=${verification.unexpectedIntroduced.join(",") || "none"}`);
        }
        return;
      }

      const commitBeforeHead = readHead();
      const stagedBeforeCommit = readStagedFiles();
      if (!stagedBeforeCommit.length) {
        throw new Error(`Commit step ${entry.slug} has no staged files.`);
      }

      entry.commands.forEach((command) => runCommand(command));

      const commitAfterHead = readHead();
      const stagedAfterCommit = readStagedFiles();
      if (commitAfterHead === commitBeforeHead) {
        throw new Error(`Commit step ${entry.slug} did not advance HEAD.`);
      }
      if (stagedAfterCommit.length > 0) {
        throw new Error(`Commit step ${entry.slug} left staged files in index.`);
      }

      recordSessionCommit(audit, {
        slug: entry.slug,
        groupId: entry.groupId || "",
        commit: commitAfterHead,
        previousHead: commitBeforeHead,
        subject: readHeadSubject(),
        files: entry.files.slice(),
        status: "ok"
      });
      recordSessionResult(audit, {
        slug: entry.slug,
        kind: entry.kind,
        commands: entry.commands.slice(),
        status: "ok",
        beforeHead: commitBeforeHead,
        afterHead: commitAfterHead,
        beforeStagedFiles: stagedBeforeCommit,
        afterStagedFiles: stagedAfterCommit
      });
    });

    finalizeSessionAudit(audit, {
      status: "applied",
      restoreHints: buildRestoreHints(relativeAuditDir, audit.auditId),
      headState: {
        ...audit.headState,
        afterHead: readHead()
      },
      indexState: {
        ...audit.indexState,
        afterTree: readIndexTree(),
        afterStagedFiles: readStagedFiles()
      }
    });
  } catch (error) {
    finalizeSessionAudit(audit, {
      status: "failed",
      error: error.message,
      restoreHints: buildRestoreHints(relativeAuditDir, audit.auditId),
      headState: {
        ...audit.headState,
        afterHead: readHead()
      },
      indexState: {
        ...audit.indexState,
        afterTree: readIndexTree(),
        afterStagedFiles: readStagedFiles()
      }
    });
    if (writeAudit) {
      writeArtifacts(buildSessionAuditArtifacts(audit, {
        outputDir: auditDir,
        auditAlias
      }));
    }
    throw error;
  }

  if (writeAudit) {
    writeArtifacts(buildSessionAuditArtifacts(audit, {
      outputDir: auditDir,
      auditAlias
    }));
  }
}

main();
