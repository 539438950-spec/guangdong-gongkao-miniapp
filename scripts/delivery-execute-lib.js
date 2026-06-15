function normalizeStepToken(value) {
  return String(value || "").trim().toLowerCase();
}

function parseStepTokens(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => normalizeStepToken(item))
    .filter(Boolean);
}

function findManifestStep(manifest, token) {
  const normalized = normalizeStepToken(token);
  if (!normalized) {
    return null;
  }

  return (manifest.steps || []).find((step) => {
    return normalizeStepToken(step.id) === normalized ||
      normalizeStepToken(step.slug) === normalized ||
      normalizeStepToken(step.groupId) === normalized ||
      String(step.order) === normalized;
  }) || null;
}

function selectManifestSteps(manifest, options = {}) {
  const allSteps = Array.isArray(manifest.steps) ? manifest.steps.slice() : [];
  const selected = [];
  const seen = new Set();

  const addStep = (step) => {
    if (!step || seen.has(step.slug)) {
      return;
    }
    if (step.required === false && !options.includeReview) {
      return;
    }
    selected.push(step);
    seen.add(step.slug);
  };

  if (options.allRequired) {
    allSteps.forEach((step) => addStep(step));
    return selected;
  }

  const tokens = parseStepTokens(options.step || "");
  tokens.forEach((token) => addStep(findManifestStep(manifest, token)));

  return selected;
}

function buildExecutionEntries(steps, options = {}) {
  const mode = options.mode || "all";
  const entries = [];

  steps.forEach((step) => {
    const base = {
      order: step.order,
      stepId: step.id,
      slug: step.slug,
      title: step.title,
      groupId: step.groupId || "",
      required: step.required !== false,
      fileCount: Number(step.fileCount || 0),
      files: Array.isArray(step.files) ? step.files.slice() : []
    };

    if (!step.groupId) {
      entries.push({
        ...base,
        kind: "verify",
        commands: Array.isArray(step.commands) ? step.commands.slice() : []
      });
      return;
    }

    if (mode !== "commit") {
      entries.push({
        ...base,
        kind: "stage",
        commands: step.commands[0] ? [step.commands[0]] : []
      });
    }

    if (mode !== "stage") {
      entries.push({
        ...base,
        kind: "commit",
        commands: step.commands[1] ? [step.commands[1]] : []
      });
    }
  });

  return entries.filter((entry) => entry.commands.length > 0);
}

function normalizeFile(value) {
  return String(value || "").trim().replace(/\\/g, "/");
}

function uniqueFiles(items = []) {
  return Array.from(new Set(
    (items || [])
      .map((item) => normalizeFile(item))
      .filter(Boolean)
  ));
}

function parseGitStatusShort(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const rawFile = line.slice(3);
      const renameIndex = rawFile.lastIndexOf(" -> ");
      const file = renameIndex === -1
        ? rawFile
        : rawFile.slice(renameIndex + 4);

      return {
        status: line.slice(0, 2),
        file: normalizeFile(file)
      };
    });
}

function buildWorkspacePreflight(entries, snapshot = {}) {
  const selectedFiles = uniqueFiles(
    (entries || [])
      .flatMap((entry) => Array.isArray(entry.files) ? entry.files : [])
  );
  const changedFiles = uniqueFiles(snapshot.changedFiles || []);
  const stagedFiles = uniqueFiles(snapshot.stagedFiles || []);
  const selectedSet = new Set(selectedFiles);
  const selectedChangedFiles = changedFiles.filter((file) => selectedSet.has(file));
  const selectedStagedFiles = stagedFiles.filter((file) => selectedSet.has(file));
  const outsideSelectedChangedFiles = changedFiles.filter((file) => !selectedSet.has(file));
  const outsideSelectedStagedFiles = stagedFiles.filter((file) => !selectedSet.has(file));

  return {
    selectedFileCount: selectedFiles.length,
    selectedFiles,
    changedFileCount: changedFiles.length,
    changedFiles,
    stagedFileCount: stagedFiles.length,
    stagedFiles,
    selectedChangedCount: selectedChangedFiles.length,
    selectedChangedFiles,
    selectedStagedCount: selectedStagedFiles.length,
    selectedStagedFiles,
    outsideSelectedChangedCount: outsideSelectedChangedFiles.length,
    outsideSelectedChangedFiles,
    outsideSelectedStagedCount: outsideSelectedStagedFiles.length,
    outsideSelectedStagedFiles
  };
}

function buildApplyGuard(entries, checkResult, options = {}) {
  const applyRequested = Boolean(options.apply);
  const force = Boolean(options.force);
  const mutatingEntries = entries.filter((entry) => entry.kind === "stage" || entry.kind === "commit");
  const reasons = [];

  if (!applyRequested) {
    return {
      applyRequested,
      force,
      requiresDeliveryCheck: false,
      canApply: true,
      reasons
    };
  }

  if (entries.length === 0) {
    reasons.push("No matching delivery steps to execute.");
  }

  if (!mutatingEntries.length) {
    return {
      applyRequested,
      force,
      requiresDeliveryCheck: false,
      canApply: reasons.length === 0,
      reasons
    };
  }

  if (!checkResult) {
    reasons.push("Missing delivery check result for mutating execution.");
  } else if (!checkResult.summary || !checkResult.summary.readyForReview) {
    reasons.push("delivery-check did not pass `readyForReview`; apply is blocked.");
  }

  return {
    applyRequested,
    force,
    requiresDeliveryCheck: true,
    canApply: force || reasons.length === 0,
    reasons
  };
}

function buildCommitOnlyPreflight(entries, currentStagedFiles, options = {}) {
  const applyRequested = Boolean(options.apply);
  const force = Boolean(options.force);
  const mode = options.mode || "all";
  const staged = uniqueFiles(currentStagedFiles);

  if (!applyRequested || mode !== "commit") {
    return {
      enabled: false,
      canApply: true,
      expectedFiles: [],
      currentStagedFiles: staged,
      missingFiles: [],
      unexpectedFiles: [],
      reasons: []
    };
  }

  const expectedFiles = Array.from(new Set(
    (entries || [])
      .filter((entry) => entry.kind === "commit")
      .flatMap((entry) => Array.isArray(entry.files) ? entry.files : [])
      .map((item) => normalizeFile(item))
      .filter(Boolean)
  ));
  const currentSet = new Set(staged);
  const expectedSet = new Set(expectedFiles);
  const missingFiles = expectedFiles.filter((file) => !currentSet.has(file));
  const unexpectedFiles = staged.filter((file) => !expectedSet.has(file));
  const reasons = [];

  if (staged.length === 0) {
    reasons.push("commit-only execution requires staged files for the selected delivery step.");
  }
  if (missingFiles.length > 0) {
    reasons.push(`commit-only execution is missing staged files from the selected step: ${missingFiles.join(", ")}`);
  }
  if (unexpectedFiles.length > 0) {
    reasons.push(`commit-only execution found staged files outside the selected step: ${unexpectedFiles.join(", ")}`);
  }

  return {
    enabled: true,
    canApply: force || reasons.length === 0,
    expectedFiles,
    currentStagedFiles: staged,
    missingFiles,
    unexpectedFiles,
    reasons
  };
}

function parseGitNameOnly(text) {
  return uniqueFiles(
    String(text || "")
      .split(/\r?\n/)
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  );
}

function verifyStageTransition(beforeFiles, afterFiles, expectedFiles) {
  const beforeSet = new Set(beforeFiles || []);
  const afterSet = new Set(afterFiles || []);
  const expected = uniqueFiles(expectedFiles);

  const missing = expected.filter((file) => !afterSet.has(file));
  const introduced = Array.from(afterSet).filter((file) => !beforeSet.has(file));
  const unexpectedIntroduced = introduced.filter((file) => !expected.includes(file));

  return {
    ok: missing.length === 0 && unexpectedIntroduced.length === 0,
    missing,
    unexpectedIntroduced,
    introduced
  };
}

function sanitizeAuditStamp(value) {
  return String(value || "")
    .replace(/[:.]/g, "-")
    .replace(/[^0-9A-Za-z_-]/g, "");
}

function buildExecutionAudit(options = {}) {
  const timestamp = options.generatedAt || new Date().toISOString();
  return {
    generatedAt: timestamp,
    auditId: sanitizeAuditStamp(timestamp),
    apply: Boolean(options.apply),
    force: Boolean(options.force),
    mode: options.mode || "all",
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
    indexState: options.indexState || null,
    status: options.status || "planned",
    results: []
  };
}

function recordAuditResult(audit, result) {
  if (!audit || !Array.isArray(audit.results)) {
    return audit;
  }
  audit.results.push(result);
  return audit;
}

function finalizeExecutionAudit(audit, patch = {}) {
  if (!audit) {
    return audit;
  }
  Object.assign(audit, patch);
  return audit;
}

function buildAuditArtifacts(audit, options = {}) {
  const outputDir = options.outputDir || "";
  if (!outputDir) {
    return [];
  }

  const fileName = `${audit.auditId || "delivery-execute"}.json`;
  return [
    {
      path: require("node:path").join(outputDir, fileName),
      content: `${JSON.stringify(audit, null, 2)}\n`
    },
    {
      path: require("node:path").join(outputDir, "latest.json"),
      content: `${JSON.stringify(audit, null, 2)}\n`
    }
  ];
}

function formatWorkspacePreview(files, limit = 5) {
  const items = Array.isArray(files) ? files.slice(0, limit) : [];
  if (items.length === 0) {
    return "";
  }

  const suffix = Array.isArray(files) && files.length > limit
    ? ` ... (+${files.length - limit} more)`
    : "";
  return `${items.join(", ")}${suffix}`;
}

function renderExecutionPlan(manifest, entries, options = {}) {
  const lines = [
    "Delivery execute plan",
    `apply: ${options.apply ? "true" : "false"}`,
    `force: ${options.force ? "true" : "false"}`,
    `mode: ${options.mode || "all"}`,
    `selectedSteps: ${entries.length}`,
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
      lines.push(`outsideChangedPreview: ${formatWorkspacePreview(workspacePreflight.outsideSelectedChangedFiles)}`);
    }
    if (workspacePreflight.outsideSelectedStagedCount > 0) {
      lines.push(`outsideStagedPreview: ${formatWorkspacePreview(workspacePreflight.outsideSelectedStagedFiles)}`);
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
  parseStepTokens,
  findManifestStep,
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
};
