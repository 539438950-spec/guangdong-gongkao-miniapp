const path = require("node:path");
const { recommendSimilarPositions } = require("../../../../packages/shared/src");
const { getSources } = require("../config/sources");
const { createAdapterMap } = require("../config/adapters");
const { FileStore } = require("../storage/file-store");
const { exportWeappSnapshot } = require("../publish/export-weapp-snapshot");
const { mapSourceState, resolveDate } = require("../publish/source-state");
const { enrichAttachmentOnlyPayload } = require("./attachment-enrichment");
const { runPipeline } = require("./pipeline");
const { loadPositionOverrideRules } = require("./position-overrides");

function defaultPaths() {
  return {
    storeRoot: path.resolve(__dirname, "../../var"),
    artifactsRoot: path.resolve(__dirname, "../../var/artifacts"),
    positionOverridePath: path.resolve(__dirname, "../../var/position-overrides.json"),
    snapshotTarget: path.resolve(__dirname, "../../../../apps/weapp/data/ingested.js")
  };
}

function buildAlertBase(source, state, now, severity) {
  return {
    sourceId: source.id,
    sourceName: source.name,
    createdAt: resolveDate(now).toISOString(),
    severity
  };
}

function emitSourceAlerts(store, source, state, now) {
  if (!state) {
    return [];
  }

  const next = [];
  const alertNow = resolveDate(now).toISOString();

  if (state.lastRunStatus === "failed" || state.lastRunStatus === "error") {
    next.push(store.saveAlertEvent({
      ...buildAlertBase(source, state, alertNow, "high"),
      type: "run-failed",
      summary: `${source.name} 最新运行失败`,
      details: state.lastErrors && state.lastErrors.length ? state.lastErrors.join("；") : "",
      dedupeKey: `${source.id}:run-failed:${state.lastRunStatus}`,
      cooldownMinutes: source.scheduleMinutes || 30
    }));
  }

  if (state.lastRollback) {
    next.push(store.saveAlertEvent({
      ...buildAlertBase(source, state, alertNow, "high"),
      type: "rollback",
      summary: `${source.name} 已回退到稳定版本`,
      details: "最近一次运行未通过发布闸门，前台继续使用上一稳定版本。",
      dedupeKey: `${source.id}:rollback`,
      cooldownMinutes: source.scheduleMinutes || 30
    }));
  }

  if (state.structureAlert) {
    next.push(store.saveAlertEvent({
      ...buildAlertBase(source, state, alertNow, "medium"),
      type: "structure-change",
      summary: `${source.name} 页面结构发生变化`,
      details: state.structureChangeSummary || state.structureSummary || "",
      dedupeKey: `${source.id}:structure-change:${state.structureFingerprint || ""}`,
      cooldownMinutes: 720
    }));
  }

  if (Number(state.pendingReviewCount || 0) > 0) {
    next.push(store.saveAlertEvent({
      ...buildAlertBase(source, state, alertNow, "medium"),
      type: "review-queued",
      summary: `${source.name} 有待复核记录`,
      details: `当前待复核 ${state.pendingReviewCount} 条。`,
      dedupeKey: `${source.id}:review-queued:${state.pendingReviewCount}`,
      cooldownMinutes: source.scheduleMinutes || 30
    }));
  }

  return next;
}

function emitHealthAlerts(store, sources, now) {
  const current = resolveDate(now) || new Date();
  const states = store.listSourceStates();
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const next = [];

  for (const state of states) {
    const source = sourceMap.get(state.sourceId) || {
      id: state.sourceId,
      name: state.sourceName || state.sourceId,
      scheduleMinutes: state.scheduleMinutes || 30
    };
    const mapped = mapSourceState(state, { now: current });

    if (mapped.fetchOverdue || mapped.publishOverdue) {
      next.push(store.saveAlertEvent({
        sourceId: source.id,
        sourceName: source.name,
        type: "sla-overdue",
        severity: "high",
        createdAt: current.toISOString(),
        summary: `${source.name} 已超时未更新`,
        details: [
          mapped.fetchOverdue ? `抓取已超时 ${mapped.fetchLagMinutes} 分钟` : "",
          mapped.publishOverdue ? `发布已超时 ${mapped.publishLagMinutes} 分钟` : ""
        ].filter(Boolean).join("；"),
        dedupeKey: `${source.id}:sla-overdue:${mapped.fetchOverdue ? "fetch" : ""}:${mapped.publishOverdue ? "publish" : ""}`,
        cooldownMinutes: source.scheduleMinutes || 30
      }));
      continue;
    }

    if (mapped.slaStatus === "warning") {
      next.push(store.saveAlertEvent({
        sourceId: source.id,
        sourceName: source.name,
        type: "sla-warning",
        severity: "medium",
        createdAt: current.toISOString(),
        summary: `${source.name} 接近 SLA 上限`,
        details: `抓取延迟 ${mapped.fetchLagMinutes ?? "暂无"} 分钟；发布延迟 ${mapped.publishLagMinutes ?? "暂无"} 分钟。`,
        dedupeKey: `${source.id}:sla-warning`,
        cooldownMinutes: source.scheduleMinutes || 30
      }));
    }
  }

  return next;
}

function shouldRunSource(source, state, now) {
  if (!source.enabled) {
    return false;
  }
  if (!state || !state.lastFetchedAt) {
    return true;
  }

  const current = resolveDate(now) || new Date();
  const lastFetchedAt = resolveDate(state.lastFetchedAt);
  if (!lastFetchedAt) {
    return true;
  }

  return current.getTime() - lastFetchedAt.getTime() >= Number(source.scheduleMinutes || 30) * 60000;
}

async function maybeEnrichStableAttachment(result, source, store, artifactsRoot) {
  if (!result.published && result.rollback && result.stablePayload && result.stablePayload.batch && result.stablePayload.batch.parseStatus === "attachment-only") {
    try {
      const enriched = await enrichAttachmentOnlyPayload(result.stablePayload, artifactsRoot);
      store.publish(source.id, enriched);
    } catch (error) {
      console.log(`[${source.name}] attachment enrichment skipped: ${error.message}`);
    }
  }
}

function logRecommendations(store) {
  const rsksPayload = store.getProduction("rsks-gd");
  if (rsksPayload) {
    if (rsksPayload.positions.length > 0) {
      const base = rsksPayload.positions[0];
      const recommendations = recommendSimilarPositions(base, rsksPayload.positions);
      console.log("recommendations", recommendations);
    } else {
      console.log("recommendations", []);
    }
  }
}

async function runIngestCycle(options = {}) {
  const paths = defaultPaths();
  const now = resolveDate(options.now) || new Date();
  const store = options.store || new FileStore(options.storeRoot || paths.storeRoot);
  const sources = options.sources || getSources();
  const adapters = options.adapters || createAdapterMap(sources);
  const artifactsRoot = options.artifactsRoot || paths.artifactsRoot;
  const positionOverrideRules = options.positionOverrideRules || loadPositionOverrideRules(
    options.positionOverridePath || paths.positionOverridePath
  );
  const snapshotTarget = options.snapshotTarget || paths.snapshotTarget;
  const onlyDue = Boolean(options.onlyDue);
  const results = [];
  const skippedSources = [];

  for (const source of sources) {
    const state = store.getSourceState(source.id);
    if (onlyDue && !shouldRunSource(source, state, now)) {
      skippedSources.push(source.id);
      continue;
    }

    const result = await runPipeline({
      source,
      adapter: adapters[source.id],
      store,
      positionOverrideRules
    });
    console.log(`[${source.name}] published=${result.published} rollback=${result.rollback}`);
    await maybeEnrichStableAttachment(result, source, store, artifactsRoot);

    const nextState = store.getSourceState(source.id);
    emitSourceAlerts(store, source, nextState, now);
    results.push({
      sourceId: source.id,
      published: result.published,
      rollback: result.rollback
    });
  }

  emitHealthAlerts(store, sources, now);
  exportWeappSnapshot(store, snapshotTarget, { now });

  if (options.logRecommendations !== false) {
    logRecommendations(store);
  }

  return {
    store,
    results,
    skippedSources,
    alertEvents: store.listAlertEvents ? store.listAlertEvents() : []
  };
}

module.exports = {
  runIngestCycle,
  shouldRunSource,
  emitSourceAlerts,
  emitHealthAlerts
};
