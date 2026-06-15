class MemoryStore {
  constructor() {
    this.rawSnapshots = [];
    this.reviewQueue = [];
    this.alertEvents = [];
    this.publishAudits = [];
    this.production = new Map();
    this.latestStable = new Map();
    this.sourceStates = new Map();
    this.runs = [];
  }

  normalizeReviewItem(item) {
    const createdAt = item.createdAt || new Date().toISOString();
    return {
      ...item,
      id: item.id || `review-${Date.now()}-${this.reviewQueue.length + 1}`,
      createdAt,
      status: item.status || "pending",
      resolutionNote: item.resolutionNote || "",
      resolvedAt: item.resolvedAt || "",
      updatedAt: item.updatedAt || createdAt
    };
  }

  normalizeAlertEvent(event) {
    const createdAt = event.createdAt || new Date().toISOString();
    return {
      ...event,
      createdAt,
      status: event.status || "active",
      closedAt: event.closedAt || "",
      updatedAt: event.updatedAt || createdAt
    };
  }

  normalizePublishAudit(event) {
    const createdAt = event.createdAt || new Date().toISOString();
    return {
      ...event,
      id: event.id || `publish-audit-${Date.now()}-${this.publishAudits.length + 1}`,
      createdAt,
      updatedAt: event.updatedAt || createdAt,
      eventType: event.eventType || "publish",
      sourceId: event.sourceId || "",
      sourceName: event.sourceName || event.sourceId || "",
      summary: event.summary || "",
      detail: event.detail || "",
      releaseMode: event.releaseMode || "",
      releaseOverrideMode: event.releaseOverrideMode || "",
      reason: event.reason || "",
      operator: event.operator || ""
    };
  }

  saveRawSnapshot(snapshot) {
    this.rawSnapshots.push(snapshot);
  }

  saveRunLog(log) {
    this.runs.push(log);
  }

  enqueueReview(item) {
    const next = this.normalizeReviewItem(item);
    this.reviewQueue.push(next);
    return next;
  }

  saveAlertEvent(event) {
    const createdAt = event.createdAt || new Date().toISOString();
    const dedupeKey = event.dedupeKey || [
      event.sourceId || "global",
      event.type || "unknown",
      event.summary || ""
    ].join(":");
    const cooldownMinutes = Number(event.cooldownMinutes || 180);
    const previous = [...this.alertEvents]
      .reverse()
      .find((item) => item.dedupeKey === dedupeKey);

    if (previous) {
      const currentMs = new Date(createdAt).getTime();
      const previousMs = new Date(previous.createdAt).getTime();
      if (
        Number.isFinite(currentMs) &&
        Number.isFinite(previousMs) &&
        currentMs - previousMs < cooldownMinutes * 60000
      ) {
        return previous;
      }
    }

    const next = {
      ...this.normalizeAlertEvent(event),
      id: event.id || `alert-${Date.now()}-${this.alertEvents.length + 1}`,
      createdAt,
      dedupeKey,
      cooldownMinutes
    };
    this.alertEvents.push(next);
    return next;
  }

  savePublishAudit(event) {
    const next = this.normalizePublishAudit(event);
    this.publishAudits.push(next);
    return next;
  }

  publish(sourceId, payload) {
    this.production.set(sourceId, payload);
    this.latestStable.set(sourceId, payload);
  }

  rollback(sourceId) {
    return this.latestStable.get(sourceId) || null;
  }

  getProduction(sourceId) {
    return this.production.get(sourceId) || null;
  }

  getSourceState(sourceId) {
    return this.sourceStates.get(sourceId) || null;
  }

  saveSourceState(sourceId, state) {
    const previous = this.sourceStates.get(sourceId) || {};
    const normalized = Object.fromEntries(
      Object.entries(state).filter(([, value]) => value !== undefined)
    );
    const next = {
      ...previous,
      ...normalized,
      sourceId
    };
    this.sourceStates.set(sourceId, next);
    return next;
  }

  listSourceStates() {
    return Array.from(this.sourceStates.values());
  }

  countReviewQueue(sourceId) {
    return this.reviewQueue
      .map((item) => this.normalizeReviewItem(item))
      .filter((item) => item.sourceId === sourceId && item.status !== "resolved")
      .length;
  }

  listReviewQueue() {
    return this.reviewQueue
      .map((item) => this.normalizeReviewItem(item))
      .filter((item) => item.status !== "resolved");
  }

  listResolvedReviewQueue() {
    return this.reviewQueue
      .map((item) => this.normalizeReviewItem(item))
      .filter((item) => item.status === "resolved")
      .sort((left, right) => String(right.resolvedAt || "").localeCompare(String(left.resolvedAt || "")));
  }

  listAlertEvents() {
    return this.alertEvents
      .map((item) => this.normalizeAlertEvent(item))
      .filter((item) => item.status !== "resolved");
  }

  listPublishAudits(sourceId) {
    return this.publishAudits
      .map((item, index) => ({
        ...this.normalizePublishAudit(item),
        _sortIndex: index
      }))
      .filter((item) => !sourceId || item.sourceId === sourceId)
      .sort((left, right) => {
        const createdAtGap = String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
        if (createdAtGap !== 0) {
          return createdAtGap;
        }
        return right._sortIndex - left._sortIndex;
      })
      .map(({ _sortIndex, ...item }) => item);
  }

  closeReviewAlertsForSource(sourceId) {
    const now = new Date().toISOString();
    this.alertEvents = this.alertEvents.map((item) => {
      const next = this.normalizeAlertEvent(item);
      if (next.sourceId === sourceId && next.type === "review-queued" && next.status !== "resolved") {
        return {
          ...next,
          status: "resolved",
          closedAt: now,
          updatedAt: now
        };
      }
      return next;
    });
  }

  ensureReviewAlertForSource(sourceId, sourceName) {
    const pendingCount = this.countReviewQueue(sourceId);
    if (!pendingCount) {
      return null;
    }

    const active = this.alertEvents
      .map((item) => this.normalizeAlertEvent(item))
      .find((item) => item.sourceId === sourceId && item.type === "review-queued" && item.status !== "resolved");
    if (active) {
      return active;
    }

    return this.saveAlertEvent({
      sourceId,
      sourceName,
      type: "review-queued",
      severity: "medium",
      summary: `${sourceName || sourceId} 有待复核记录`,
      details: `当前待复核 ${pendingCount} 条。`
    });
  }

  resolveReviewItem(reviewId, resolutionNote = "") {
    const now = new Date().toISOString();
    let resolved = null;

    this.reviewQueue = this.reviewQueue.map((item) => {
      const next = this.normalizeReviewItem(item);
      if (next.id !== reviewId) {
        return next;
      }
      resolved = {
        ...next,
        status: "resolved",
        resolutionNote: resolutionNote || next.resolutionNote || "",
        resolvedAt: now,
        updatedAt: now
      };
      return resolved;
    });

    if (!resolved) {
      throw new Error("review item not found");
    }

    this.syncPendingReviewCounts();
    if (!this.countReviewQueue(resolved.sourceId)) {
      this.closeReviewAlertsForSource(resolved.sourceId);
    }
    return resolved;
  }

  reopenReviewItem(reviewId) {
    const now = new Date().toISOString();
    let reopened = null;

    this.reviewQueue = this.reviewQueue.map((item) => {
      const next = this.normalizeReviewItem(item);
      if (next.id !== reviewId) {
        return next;
      }
      reopened = {
        ...next,
        status: "pending",
        resolvedAt: "",
        updatedAt: now
      };
      return reopened;
    });

    if (!reopened) {
      throw new Error("review item not found");
    }

    this.syncPendingReviewCounts();
    const sourceState = this.getSourceState(reopened.sourceId) || {};
    this.ensureReviewAlertForSource(
      reopened.sourceId,
      sourceState.sourceName || reopened.sourceName || reopened.sourceId
    );
    return reopened;
  }

  syncPendingReviewCounts() {
    for (const [sourceId, state] of this.sourceStates.entries()) {
      this.sourceStates.set(sourceId, {
        ...state,
        pendingReviewCount: this.countReviewQueue(sourceId)
      });
    }
  }
}

module.exports = {
  MemoryStore
};
