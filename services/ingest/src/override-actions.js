const { ensureLocalRuntimeSeed, localRuntimePaths } = require("../../runtime-paths");
const { FileStore } = require("./storage/file-store");
const { exportWeappSnapshot } = require("./publish/export-weapp-snapshot");
const {
  defaultPositionOverridePath,
  normalizeOverrideRule,
  loadPositionOverrideRules,
  persistPositionOverrideRules,
  resetPositionCorrections,
  applyPositionOverrideRules
} = require("./core/position-overrides");
const { mapSourceState } = require("./publish/source-state");

function defaultOverridePaths() {
  const runtime = localRuntimePaths();
  return {
    storeRoot: runtime.ingestStoreRoot,
    positionOverridePath: runtime.positionOverridePath || defaultPositionOverridePath(),
    snapshotTarget: runtime.snapshotTarget
  };
}

function validatePositionOverrideRule(input = {}) {
  const rule = normalizeOverrideRule(input);
  const selectorCount = [
    rule.sourceId,
    rule.noticeId,
    rule.positionId,
    rule.positionCode,
    rule.examType,
    rule.agencyIncludes,
    rule.titleIncludes
  ].filter(Boolean).length;

  if (!selectorCount) {
    throw new Error("纠错规则至少需要一个命中条件");
  }

  const updateKeys = Object.keys(rule.updates || {}).filter((key) => rule.updates[key] !== undefined);
  if (!updateKeys.length) {
    throw new Error("纠错规则至少需要一个更新字段");
  }

  return rule;
}

function rebuildSnapshotWithOverrides(options = {}) {
  const paths = defaultOverridePaths();
  ensureLocalRuntimeSeed({
    ingestStoreRoot: paths.storeRoot,
    snapshotTarget: paths.snapshotTarget,
    positionOverridePath: paths.positionOverridePath
  });
  const storeRoot = options.storeRoot || paths.storeRoot;
  const positionOverridePath = options.positionOverridePath || paths.positionOverridePath;
  const snapshotTarget = options.snapshotTarget || paths.snapshotTarget;
  const now = options.now || new Date();
  const rules = options.rules || loadPositionOverrideRules(positionOverridePath);
  const store = new FileStore(storeRoot);

  const sourceIds = new Set([
    ...Array.from(store.production.keys()),
    ...store.listSourceStates().map((item) => item.sourceId).filter(Boolean)
  ]);

  sourceIds.forEach((sourceId) => {
    const payload = store.getProduction(sourceId);
    if (!payload) {
      store.saveSourceState(sourceId, {
        correctedPositionCount: 0,
        correctedFieldCount: 0,
        appliedCorrectionRuleCount: 0,
        appliedCorrectionRuleIds: []
      });
      return;
    }

    const originalPositions = (payload.positions || []).map((item) => resetPositionCorrections(item));
    const correctionResult = applyPositionOverrideRules(originalPositions, rules);
    store.publish(sourceId, {
      ...payload,
      positions: correctionResult.positions
    });
    store.saveSourceState(sourceId, {
      correctedPositionCount: correctionResult.stats.correctedPositionCount,
      correctedFieldCount: correctionResult.stats.correctedFieldCount,
      appliedCorrectionRuleCount: correctionResult.stats.appliedRuleCount,
      appliedCorrectionRuleIds: correctionResult.stats.appliedRuleIds
    });
  });

  exportWeappSnapshot(store, snapshotTarget, { now });
  return {
    store,
    rules
  };
}

function listPositionOverrides(options = {}) {
  const paths = defaultOverridePaths();
  return loadPositionOverrideRules(options.positionOverridePath || paths.positionOverridePath);
}

function buildOverrideAuditDetail(rule = {}, sourceState = {}) {
  const updateKeys = Object.keys(rule.updates || {}).filter((key) => rule.updates[key] !== undefined);
  const parts = [
    rule.positionCode ? `positionCode=${rule.positionCode}` : "",
    rule.positionId ? `positionId=${rule.positionId}` : "",
    rule.noticeId ? `noticeId=${rule.noticeId}` : "",
    rule.examType ? `examType=${rule.examType}` : "",
    rule.agencyIncludes ? `agencyIncludes=${rule.agencyIncludes}` : "",
    rule.titleIncludes ? `titleIncludes=${rule.titleIncludes}` : "",
    updateKeys.length ? `updates=${updateKeys.join(",")}` : "",
    rule.reason ? `reason=${rule.reason}` : "",
    sourceState.correctedPositionCount !== undefined ? `correctedPositions=${sourceState.correctedPositionCount}` : "",
    sourceState.correctedFieldCount !== undefined ? `correctedFields=${sourceState.correctedFieldCount}` : ""
  ].filter(Boolean);
  return parts.join(" | ");
}

function saveOverrideAudit(store, rule = {}, eventType, summary, now) {
  const sourceId = String(rule.sourceId || "").trim();
  const mappedSourceState = sourceId
    ? mapSourceState(store.getSourceState(sourceId) || { sourceId }, { now })
    : {};
  return store.savePublishAudit({
    createdAt: typeof now === "string" ? now : now.toISOString(),
    sourceId,
    sourceName: sourceId
      ? ((store.getSourceState(sourceId) || {}).sourceName || sourceId)
      : "global",
    eventType,
    summary,
    detail: buildOverrideAuditDetail(rule, mappedSourceState),
    releaseMode: mappedSourceState.releaseMode || "",
    stableVersionId: mappedSourceState.stableVersionId || "",
    stableVersionLabel: mappedSourceState.stableVersionLabel || "",
    candidateVersionId: mappedSourceState.candidateVersionId || "",
    candidateVersionLabel: mappedSourceState.candidateVersionLabel || ""
  });
}

function upsertPositionOverride(input, options = {}) {
  const paths = defaultOverridePaths();
  const positionOverridePath = options.positionOverridePath || paths.positionOverridePath;
  const now = options.now || new Date().toISOString();
  const nextRule = validatePositionOverrideRule({
    ...input,
    updatedAt: input && input.updatedAt ? input.updatedAt : now
  });
  const currentRules = loadPositionOverrideRules(positionOverridePath);
  const nextRules = currentRules.filter((item) => item.id !== nextRule.id);
  nextRules.push(nextRule);
  persistPositionOverrideRules(positionOverridePath, nextRules);
  const { store } = rebuildSnapshotWithOverrides({
    ...options,
    positionOverridePath,
    rules: nextRules,
    now
  });
  saveOverrideAudit(store, nextRule, "position-override-saved", "Saved position override rule", now);
  exportWeappSnapshot(store, options.snapshotTarget || paths.snapshotTarget, { now });
  return nextRule;
}

function deletePositionOverride(ruleId, options = {}) {
  const paths = defaultOverridePaths();
  const positionOverridePath = options.positionOverridePath || paths.positionOverridePath;
  const currentRules = loadPositionOverrideRules(positionOverridePath);
  const existingRule = currentRules.find((item) => item.id === ruleId);
  if (!existingRule) {
    throw new Error("纠错规则不存在");
  }
  const nextRules = currentRules.filter((item) => item.id !== ruleId);
  persistPositionOverrideRules(positionOverridePath, nextRules);
  const { store } = rebuildSnapshotWithOverrides({
    ...options,
    positionOverridePath,
    rules: nextRules,
    now: options.now || new Date().toISOString()
  });
  saveOverrideAudit(
    store,
    existingRule,
    "position-override-deleted",
    "Deleted position override rule",
    options.now || new Date().toISOString()
  );
  exportWeappSnapshot(store, options.snapshotTarget || paths.snapshotTarget, {
    now: options.now || new Date().toISOString()
  });
  return {
    id: ruleId
  };
}

module.exports = {
  defaultOverridePaths,
  validatePositionOverrideRule,
  rebuildSnapshotWithOverrides,
  listPositionOverrides,
  upsertPositionOverride,
  deletePositionOverride
};
