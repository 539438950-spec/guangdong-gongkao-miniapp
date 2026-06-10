const fs = require("node:fs");
const path = require("node:path");
const { MemoryStore } = require("./memory-store");

function inferReviewCreatedAt(filePath, entryName) {
  const match = String(entryName).match(/-(\d+)\.json$/);
  if (match) {
    const timestamp = Number(match[1]);
    if (Number.isFinite(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  }

  return fs.statSync(filePath).mtime.toISOString();
}

function normalizeStoredReviewItem(item, filePath, entryName) {
  const createdAt = item.createdAt || inferReviewCreatedAt(filePath, entryName);
  return {
    ...item,
    id: item.id || path.basename(entryName, ".json"),
    createdAt,
    status: item.status || "pending",
    resolutionNote: item.resolutionNote || "",
    resolvedAt: item.resolvedAt || "",
    updatedAt: item.updatedAt || createdAt
  };
}

function normalizeStoredAlertEvent(item, filePath, entryName) {
  const createdAt = item.createdAt || inferReviewCreatedAt(filePath, entryName);
  return {
    ...item,
    id: item.id || path.basename(entryName, ".json"),
    createdAt,
    dedupeKey: item.dedupeKey || [
      item.sourceId || "global",
      item.type || "unknown",
      item.summary || ""
    ].join(":"),
    status: item.status || "active",
    closedAt: item.closedAt || "",
    updatedAt: item.updatedAt || createdAt
  };
}

class FileStore extends MemoryStore {
  constructor(rootDir) {
    super();
    this.rootDir = rootDir;
    this.reviewFileMap = new Map();
    this.alertFileMap = new Map();
    this.publishAuditFileMap = new Map();
    this.ensureDirs();
    this.loadExistingProduction();
    this.loadExistingSourceStates();
    this.loadExistingReviewQueue();
    this.loadExistingAlertEvents();
    this.loadExistingPublishAudits();
    this.syncPendingReviewCounts();
  }

  ensureDirs() {
    ["raw", "review", "production", "runs", "alerts", "publish-audits"].forEach((segment) => {
      fs.mkdirSync(path.join(this.rootDir, segment), { recursive: true });
    });
  }

  loadExistingProduction() {
    const productionDir = path.join(this.rootDir, "production");
    if (!fs.existsSync(productionDir)) {
      return;
    }

    for (const entry of fs.readdirSync(productionDir)) {
      const filePath = path.join(productionDir, entry);
      if (!entry.endsWith(".json")) {
        continue;
      }

      try {
        const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const sourceId = payload && payload.source && payload.source.id;
        if (sourceId) {
          this.production.set(sourceId, payload);
          this.latestStable.set(sourceId, payload);
        }
      } catch (_error) {
        // Ignore malformed historical files and continue bootstrapping.
      }
    }
  }

  loadExistingSourceStates() {
    const stateFile = path.join(this.rootDir, "source-states.json");
    if (!fs.existsSync(stateFile)) {
      return;
    }

    try {
      const items = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      if (Array.isArray(items)) {
        items.forEach((item) => {
          if (item && item.sourceId) {
            this.sourceStates.set(item.sourceId, item);
          }
        });
      }
    } catch (_error) {
      // Ignore malformed state cache and continue bootstrapping.
    }
  }

  loadExistingReviewQueue() {
    const reviewDir = path.join(this.rootDir, "review");
    if (!fs.existsSync(reviewDir)) {
      return;
    }

    for (const entry of fs.readdirSync(reviewDir).sort()) {
      const filePath = path.join(reviewDir, entry);
      if (!entry.endsWith(".json")) {
        continue;
      }

      try {
        const item = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (item && item.sourceId) {
          const next = normalizeStoredReviewItem(item, filePath, entry);
          this.reviewQueue.push(next);
          this.reviewFileMap.set(next.id, filePath);
        }
      } catch (_error) {
        // Ignore malformed historical review files and continue bootstrapping.
      }
    }
  }

  loadExistingAlertEvents() {
    const alertDir = path.join(this.rootDir, "alerts");
    if (!fs.existsSync(alertDir)) {
      return;
    }

    for (const entry of fs.readdirSync(alertDir).sort()) {
      const filePath = path.join(alertDir, entry);
      if (!entry.endsWith(".json")) {
        continue;
      }

      try {
        const item = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (item && item.type) {
          const next = normalizeStoredAlertEvent(item, filePath, entry);
          this.alertEvents.push(next);
          this.alertFileMap.set(next.id, filePath);
        }
      } catch (_error) {
        // Ignore malformed historical alert files and continue bootstrapping.
      }
    }
  }

  loadExistingPublishAudits() {
    const auditDir = path.join(this.rootDir, "publish-audits");
    if (!fs.existsSync(auditDir)) {
      return;
    }

    for (const entry of fs.readdirSync(auditDir).sort()) {
      const filePath = path.join(auditDir, entry);
      if (!entry.endsWith(".json")) {
        continue;
      }

      try {
        const item = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (item && item.eventType) {
          const next = this.normalizePublishAudit(item);
          this.publishAudits.push(next);
          this.publishAuditFileMap.set(next.id, filePath);
        }
      } catch (_error) {
        // Ignore malformed historical audit files and continue bootstrapping.
      }
    }
  }

  writeJson(relativePath, payload) {
    const targetPath = path.join(this.rootDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  saveRawSnapshot(snapshot) {
    super.saveRawSnapshot(snapshot);
    this.writeJson(path.join("raw", `${snapshot.sourceId}-${Date.now()}.json`), snapshot);
  }

  saveRunLog(log) {
    super.saveRunLog(log);
    this.writeJson(path.join("runs", `${log.sourceId}-${Date.now()}.json`), log);
  }

  enqueueReview(item) {
    const next = super.enqueueReview(item);
    this.syncPendingReviewCounts();
    const relativePath = path.join("review", `${next.id}.json`);
    this.reviewFileMap.set(next.id, path.join(this.rootDir, relativePath));
    this.writeJson(relativePath, next);
    this.writeJson("source-states.json", this.listSourceStates());
    return next;
  }

  saveAlertEvent(event) {
    const before = this.alertEvents.length;
    const next = super.saveAlertEvent(event);
    if (this.alertEvents.length > before) {
      const relativePath = path.join("alerts", `${next.id}.json`);
      this.alertFileMap.set(next.id, path.join(this.rootDir, relativePath));
      this.writeJson(relativePath, next);
    }
    return next;
  }

  savePublishAudit(event) {
    const next = super.savePublishAudit(event);
    const relativePath = path.join("publish-audits", `${next.id}.json`);
    this.publishAuditFileMap.set(next.id, path.join(this.rootDir, relativePath));
    this.writeJson(relativePath, next);
    return next;
  }

  resolveReviewItem(reviewId, resolutionNote = "") {
    const next = super.resolveReviewItem(reviewId, resolutionNote);
    this.persistReviewItem(reviewId);
    this.persistAlertEvents();
    this.writeJson("source-states.json", this.listSourceStates());
    return next;
  }

  reopenReviewItem(reviewId) {
    const next = super.reopenReviewItem(reviewId);
    this.persistReviewItem(reviewId);
    this.persistAlertEvents();
    this.writeJson("source-states.json", this.listSourceStates());
    return next;
  }

  persistReviewItem(reviewId) {
    const reviewItem = this.reviewQueue.find((item) => item.id === reviewId);
    const filePath = this.reviewFileMap.get(reviewId);
    if (reviewItem && filePath) {
      fs.writeFileSync(filePath, `${JSON.stringify(reviewItem, null, 2)}\n`, "utf8");
    }
  }

  persistAlertEvents() {
    for (const item of this.alertEvents) {
      const filePath = this.alertFileMap.get(item.id);
      if (filePath) {
        fs.writeFileSync(filePath, `${JSON.stringify(item, null, 2)}\n`, "utf8");
      }
    }
  }

  persistPublishAudits() {
    for (const item of this.publishAudits) {
      const filePath = this.publishAuditFileMap.get(item.id);
      if (filePath) {
        fs.writeFileSync(filePath, `${JSON.stringify(item, null, 2)}\n`, "utf8");
      }
    }
  }

  publish(sourceId, payload) {
    super.publish(sourceId, payload);
    this.writeJson(path.join("production", `${sourceId}.json`), payload);
  }

  saveSourceState(sourceId, state) {
    const next = super.saveSourceState(sourceId, state);
    this.writeJson("source-states.json", this.listSourceStates());
    return next;
  }
}

module.exports = {
  FileStore
};
