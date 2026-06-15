const path = require("node:path");
const { ensureLocalRuntimeSeed, localRuntimePaths } = require("../../runtime-paths");

const { FileStore } = require("./storage/file-store");
const { exportWeappSnapshot } = require("./publish/export-weapp-snapshot");
const { mapSourceState, canApplyPositionsOpenOverride } = require("./publish/source-state");

function defaultReleasePaths() {
  return localRuntimePaths();
}

function normalizeReleaseMode(mode) {
  const value = String(mode || "").trim();
  if (!value || value === "auto" || value === "clear") {
    return "";
  }
  return value;
}

function validateReleaseOverrideInput(input = {}) {
  const sourceId = String(input.sourceId || "").trim();
  const mode = normalizeReleaseMode(input.mode);
  const reason = String(input.reason || "").trim();
  const operator = String(input.operator || "").trim();

  if (!sourceId) {
    throw new Error("sourceId is required");
  }

  if (mode && !["notice-only", "positions-open"].includes(mode)) {
    throw new Error("invalid release override mode");
  }

  return {
    sourceId,
    mode,
    reason,
    operator
  };
}

function buildReleaseAuditSummary(mode) {
  if (!mode) {
    return "Cleared manual release override";
  }
  if (mode === "notice-only") {
    return "Locked source to notice-only mode";
  }
  return "Opened source positions capability by manual override";
}

function buildReleaseAuditDetail(sourceState, input) {
  const parts = [];
  if (input.reason) {
    parts.push(`reason=${input.reason}`);
  }
  if (input.operator) {
    parts.push(`operator=${input.operator}`);
  }
  if (sourceState.candidateVersionLabel || sourceState.candidateVersionId) {
    parts.push(`candidate=${sourceState.candidateVersionLabel || sourceState.candidateVersionId}`);
  }
  if (sourceState.stableVersionLabel || sourceState.stableVersionId) {
    parts.push(`stable=${sourceState.stableVersionLabel || sourceState.stableVersionId}`);
  }
  return parts.join(" | ");
}

function setSourceReleaseOverride(input, options = {}) {
  const paths = defaultReleasePaths();
  ensureLocalRuntimeSeed(paths);
  const storeRoot = options.storeRoot || paths.ingestStoreRoot;
  const snapshotTarget = options.snapshotTarget || paths.snapshotTarget;
  const now = options.now || new Date().toISOString();
  const normalizedInput = validateReleaseOverrideInput(input);
  const store = new FileStore(storeRoot);
  const existingState = store.getSourceState(normalizedInput.sourceId);

  if (!existingState) {
    throw new Error("source state not found");
  }

  if (normalizedInput.mode === "positions-open") {
    const check = canApplyPositionsOpenOverride(mapSourceState(existingState, { now }));
    if (!check.ok) {
      throw new Error(check.reason || "release override is not allowed");
    }
  }

  store.saveSourceState(normalizedInput.sourceId, {
    releaseOverrideMode: normalizedInput.mode,
    releaseOverrideReason: normalizedInput.mode ? normalizedInput.reason : "",
    releaseOverrideUpdatedAt: now,
    releaseOverrideOperator: normalizedInput.mode ? normalizedInput.operator : ""
  });

  const nextState = store.getSourceState(normalizedInput.sourceId) || existingState;
  const mappedState = mapSourceState(nextState, { now });
  const audit = store.savePublishAudit({
    createdAt: now,
    sourceId: normalizedInput.sourceId,
    sourceName: nextState.sourceName || normalizedInput.sourceId,
    eventType: "release-override",
    summary: buildReleaseAuditSummary(normalizedInput.mode),
    detail: buildReleaseAuditDetail(mappedState, normalizedInput),
    releaseMode: mappedState.releaseMode,
    releaseOverrideMode: normalizedInput.mode,
    reason: normalizedInput.reason,
    operator: normalizedInput.operator,
    candidateVersionId: mappedState.candidateVersionId || "",
    candidateVersionLabel: mappedState.candidateVersionLabel || "",
    stableVersionId: mappedState.stableVersionId || "",
    stableVersionLabel: mappedState.stableVersionLabel || ""
  });

  exportWeappSnapshot(store, snapshotTarget, { now });

  return {
    sourceState: mappedState,
    audit
  };
}

function listPublishAudits(options = {}) {
  const paths = defaultReleasePaths();
  ensureLocalRuntimeSeed(paths);
  const store = new FileStore(options.storeRoot || paths.ingestStoreRoot);
  return store.listPublishAudits(options.sourceId || "");
}

module.exports = {
  defaultReleasePaths,
  validateReleaseOverrideInput,
  setSourceReleaseOverride,
  listPublishAudits
};
