const path = require("node:path");

const {
  buildApplyGuard
} = require("./delivery-execute-lib");

function hasCommitEntries(entries = []) {
  return entries.some((entry) => entry.kind === "commit");
}

function buildSessionGuard(entries, checkResult, options = {}) {
  const apply = Boolean(options.apply);
  const force = Boolean(options.force);
  const initialStagedFiles = Array.isArray(options.initialStagedFiles)
    ? options.initialStagedFiles.slice()
    : [];
  const baseGuard = buildApplyGuard(entries, checkResult, { apply, force });
  const reasons = Array.isArray(baseGuard.reasons) ? baseGuard.reasons.slice() : [];

  if (apply && hasCommitEntries(entries) && initialStagedFiles.length > 0 && !options.allowPreStaged) {
    reasons.push("delivery-session requires a clean index before commit; found pre-staged files.");
  }

  return {
    ...baseGuard,
    allowPreStaged: Boolean(options.allowPreStaged),
    initialStagedFiles,
    canApply: !apply || force || reasons.length === 0,
    reasons
  };
}

function sanitizeAuditStamp(value) {
  return String(value || "")
    .replace(/[:.]/g, "-")
    .replace(/[^0-9A-Za-z_-]/g, "");
}

function buildRestoreHints(outputDir, auditId) {
  const normalizedDir = String(outputDir || "").replace(/\\/g, "/");
  const latestPath = path.posix.join(normalizedDir || "output/delivery-session", "latest.json");
  const stampedPath = path.posix.join(normalizedDir || "output/delivery-session", `${auditId || "latest"}.json`);

  return {
    latestAudit: latestPath,
    stampedAudit: stampedPath,
    restoreBefore: `node scripts/delivery-restore.js --audit-kind session --audit ${latestPath} --target before`,
    restoreAfter: `node scripts/delivery-restore.js --audit-kind session --audit ${latestPath} --target after`,
    revertAppliedCommits: `node scripts/delivery-revert.js --audit ${latestPath} --apply`
  };
}

function buildSessionAudit(options = {}) {
  const timestamp = options.generatedAt || new Date().toISOString();
  return {
    generatedAt: timestamp,
    auditId: sanitizeAuditStamp(timestamp),
    apply: Boolean(options.apply),
    force: Boolean(options.force),
    manifest: options.manifest || null,
    selectedSteps: Array.isArray(options.selectedSteps) ? options.selectedSteps.slice() : [],
    entries: Array.isArray(options.entries) ? options.entries.map((entry) => ({
      order: entry.order,
      slug: entry.slug,
      kind: entry.kind,
      title: entry.title,
      groupId: entry.groupId || "",
      fileCount: entry.fileCount || 0,
      commands: Array.isArray(entry.commands) ? entry.commands.slice() : []
    })) : [],
    guard: options.guard || null,
    checkSummary: options.checkResult && options.checkResult.summary
      ? options.checkResult.summary
      : null,
    workspacePreflight: options.workspacePreflight || null,
    headState: options.headState || null,
    indexState: options.indexState || null,
    restoreHints: options.restoreHints || null,
    commits: [],
    results: [],
    status: options.status || "planned"
  };
}

function recordSessionResult(audit, result) {
  if (!audit || !Array.isArray(audit.results)) {
    return audit;
  }
  audit.results.push(result);
  return audit;
}

function recordSessionCommit(audit, commit) {
  if (!audit || !Array.isArray(audit.commits)) {
    return audit;
  }
  audit.commits.push(commit);
  return audit;
}

function finalizeSessionAudit(audit, patch = {}) {
  if (!audit) {
    return audit;
  }
  Object.assign(audit, patch);
  return audit;
}

function buildSessionAuditArtifacts(audit, options = {}) {
  const outputDir = options.outputDir || path.join("output", "delivery-session");
  const auditAlias = String(options.auditAlias || "").trim();
  const fileName = `${audit.auditId || "delivery-session"}.json`;
  const artifacts = [
    {
      path: path.join(outputDir, fileName),
      content: `${JSON.stringify(audit, null, 2)}\n`
    },
    {
      path: path.join(outputDir, "latest.json"),
      content: `${JSON.stringify(audit, null, 2)}\n`
    }
  ];

  if (auditAlias) {
    artifacts.push({
      path: path.join(outputDir, `${auditAlias}.json`),
      content: `${JSON.stringify(audit, null, 2)}\n`
    });
  }

  return artifacts;
}

function renderSessionPlan(manifest, entries, options = {}) {
  const commitCount = entries.filter((entry) => entry.kind === "commit").length;
  const lines = [
    "Delivery session plan",
    `apply: ${options.apply ? "true" : "false"}`,
    `force: ${options.force ? "true" : "false"}`,
    `selectedSteps: ${entries.length}`,
    `commitSteps: ${commitCount}`,
    `initialStagedFiles: ${Array.isArray(options.initialStagedFiles) ? options.initialStagedFiles.length : 0}`,
    `smokeStatus: ${manifest.smokeStatus}`,
    `baseline: ${manifest.baselineDecision && manifest.baselineDecision.include ? "include" : "review"}`,
    ""
  ];

  if (options.workspacePreflight) {
    const workspacePreflight = options.workspacePreflight;
    lines.push("Workspace preflight");
    lines.push(`selectedFiles: ${workspacePreflight.selectedFileCount}`);
    lines.push(`changedFiles: ${workspacePreflight.changedFileCount}`);
    lines.push(`stagedFiles: ${workspacePreflight.stagedFileCount}`);
    lines.push(`selectedChangedFiles: ${workspacePreflight.selectedChangedCount}`);
    lines.push(`outsideSelectedChangedFiles: ${workspacePreflight.outsideSelectedChangedCount}`);
    lines.push(`outsideSelectedStagedFiles: ${workspacePreflight.outsideSelectedStagedCount}`);
    if (workspacePreflight.outsideSelectedChangedCount > 0) {
      lines.push(`outsideChangedPreview: ${workspacePreflight.outsideSelectedChangedFiles.slice(0, 5).join(", ")}`);
    }
    if (workspacePreflight.outsideSelectedStagedCount > 0) {
      lines.push(`outsideStagedPreview: ${workspacePreflight.outsideSelectedStagedFiles.slice(0, 5).join(", ")}`);
    }
    lines.push("");
  }

  if (entries.length === 0) {
    lines.push("No matching steps.");
    return `${lines.join("\n")}\n`;
  }

  entries.forEach((entry) => {
    const suffix = entry.kind === "verify" ? "" : ` [${entry.kind}]`;
    lines.push(`${entry.order}. ${entry.title}${suffix}`);
    if (entry.fileCount > 0) {
      lines.push(`   files: ${entry.fileCount}`);
    }
    entry.commands.forEach((command) => {
      lines.push(`   ${command}`);
    });
  });

  return `${lines.join("\n")}\n`;
}

module.exports = {
  hasCommitEntries,
  buildSessionGuard,
  buildRestoreHints,
  buildSessionAudit,
  recordSessionResult,
  recordSessionCommit,
  finalizeSessionAudit,
  buildSessionAuditArtifacts,
  renderSessionPlan
};
