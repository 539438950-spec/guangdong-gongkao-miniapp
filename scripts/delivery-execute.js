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
  buildApplyGuard,
  buildCommitOnlyPreflight,
  parseGitNameOnly,
  verifyStageTransition,
  buildExecutionAudit,
  recordAuditResult,
  finalizeExecutionAudit,
  buildAuditArtifacts,
  renderExecutionPlan
} = require("./delivery-execute-lib");

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

function parseMode() {
  if (hasFlag("--stage-only")) {
    return "stage";
  }
  if (hasFlag("--commit-only")) {
    return "commit";
  }
  return "all";
}

function parseAuditDir() {
  const raw = readFlagValue("--audit-dir");
  if (!raw) {
    return path.join(repoRoot(), "output", "delivery-execute");
  }
  return path.resolve(repoRoot(), raw);
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

function main() {
  const manifest = resolveManifest();
  const apply = hasFlag("--apply");
  const force = hasFlag("--force");
  const skipDeliveryCheck = shouldSkipDeliveryCheck();
  const mode = parseMode();
  const writeAudit = hasFlag("--write-audit");
  const auditDir = parseAuditDir();
  const customRepoRoot = Boolean(readFlagValue("--repo-root"));

  if (skipDeliveryCheck && !force) {
    throw new Error("`--skip-delivery-check` requires `--force` so bypassing the gate is always explicit.");
  }
  if (customRepoRoot && apply && !skipDeliveryCheck) {
    throw new Error("Custom `--repo-root` apply runs require `--skip-delivery-check --force`; delivery-check only reflects the current workspace.");
  }

  const selectedSteps = selectManifestSteps(manifest, {
    allRequired: hasFlag("--all-required"),
    includeReview: hasFlag("--include-review"),
    step: readFlagValue("--step")
  });
  const entries = buildExecutionEntries(selectedSteps, { mode });
  const currentStagedFiles = readStagedFiles();
  const currentChangedFiles = readChangedFiles();
  const checkResult = apply && !skipDeliveryCheck ? collectDeliveryCheckResult() : null;
  const guard = buildApplyGuard(entries, checkResult, { apply, force });
  const workspacePreflight = buildWorkspacePreflight(entries, {
    changedFiles: currentChangedFiles,
    stagedFiles: currentStagedFiles
  });
  const commitOnlyPreflight = buildCommitOnlyPreflight(entries, currentStagedFiles, {
    apply,
    force,
    mode
  });
  if (commitOnlyPreflight.enabled) {
    guard.commitOnlyPreflight = commitOnlyPreflight;
    if (commitOnlyPreflight.reasons.length > 0) {
      guard.reasons = Array.isArray(guard.reasons)
        ? guard.reasons.concat(commitOnlyPreflight.reasons)
        : commitOnlyPreflight.reasons.slice();
      guard.canApply = Boolean(force) || guard.reasons.length === 0;
    }
  }
  const audit = buildExecutionAudit({
    apply,
    force,
    mode,
    manifest,
    selectedSteps,
    entries,
    guard,
    checkResult,
    workspacePreflight,
    status: apply ? "pending" : "dry-run",
    indexState: {
      beforeTree: readIndexTree(),
      afterTree: "",
      beforeStagedFiles: currentStagedFiles,
      afterStagedFiles: []
    }
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

  process.stdout.write(renderExecutionPlan(manifest, entries, {
    apply,
    force,
    mode,
    workspacePreflight
  }));

  if (!apply) {
    if (writeAudit) {
      writeArtifacts(buildAuditArtifacts(finalizeExecutionAudit(audit, {
        status: "dry-run",
        indexState: {
          ...audit.indexState,
          afterTree: readIndexTree(),
          afterStagedFiles: readStagedFiles()
        }
      }), {
        outputDir: auditDir
      }));
    }
    return;
  }

  if (!guard.canApply) {
    if (writeAudit) {
      writeArtifacts(buildAuditArtifacts(finalizeExecutionAudit(audit, {
        status: "blocked",
        error: guard.reasons.join(" "),
        indexState: {
          ...audit.indexState,
          afterTree: readIndexTree(),
          afterStagedFiles: readStagedFiles()
        }
      }), {
        outputDir: auditDir
      }));
    }
    throw new Error(guard.reasons.join(" "));
  }

  try {
    entries.forEach((entry) => {
      const beforeFiles = entry.kind === "stage" ? readStagedFiles() : [];
      entry.commands.forEach((command) => {
        runCommand(command);
      });

      const result = {
        slug: entry.slug,
        kind: entry.kind,
        commands: entry.commands.slice(),
        status: "ok"
      };

      if (entry.kind === "stage") {
        const afterFiles = readStagedFiles();
        const verification = verifyStageTransition(beforeFiles, afterFiles, entry.files);
        result.beforeStagedFiles = beforeFiles;
        result.afterStagedFiles = afterFiles;
        result.verification = verification;
        if (!verification.ok) {
          result.status = "failed";
          recordAuditResult(audit, result);
          throw new Error(`Stage verification failed for ${entry.slug}: missing=${verification.missing.join(",") || "none"} unexpected=${verification.unexpectedIntroduced.join(",") || "none"}`);
        }
      }

      recordAuditResult(audit, result);
    });

    finalizeExecutionAudit(audit, {
      status: "applied",
      indexState: {
        ...audit.indexState,
        afterTree: readIndexTree(),
        afterStagedFiles: readStagedFiles()
      }
    });
  } catch (error) {
    finalizeExecutionAudit(audit, {
      status: "failed",
      error: error.message,
      indexState: {
        ...audit.indexState,
        afterTree: readIndexTree(),
        afterStagedFiles: readStagedFiles()
      }
    });
    if (writeAudit) {
      writeArtifacts(buildAuditArtifacts(audit, { outputDir: auditDir }));
    }
    throw error;
  }

  if (writeAudit) {
    writeArtifacts(buildAuditArtifacts(audit, { outputDir: auditDir }));
  }
}

main();
