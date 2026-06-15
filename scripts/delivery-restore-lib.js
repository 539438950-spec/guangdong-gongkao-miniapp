const path = require("node:path");

function normalizeAuditKind(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "execute";
  }
  if (normalized === "execute" || normalized === "session") {
    return normalized;
  }
  throw new Error(`Unknown delivery restore audit kind: ${value}`);
}

function resolveDefaultAuditPath(repoRoot, kind) {
  const auditKind = normalizeAuditKind(kind);
  if (auditKind === "session") {
    return path.join(repoRoot, "output", "delivery-session", "latest.json");
  }
  return path.join(repoRoot, "output", "delivery-execute", "latest.json");
}

function resolveAuditPath(repoRoot, options = {}) {
  const explicit = String(options.auditPath || "").trim();
  if (explicit) {
    return path.resolve(repoRoot, explicit);
  }
  return resolveDefaultAuditPath(repoRoot, options.kind);
}

function resolveTargetTree(audit, target) {
  const indexState = audit && audit.indexState ? audit.indexState : {};
  if (target === "after") {
    return String(indexState.afterTree || "").trim();
  }
  return String(indexState.beforeTree || "").trim();
}

function detectAuditKind(audit, fallbackKind = "execute") {
  if (audit && audit.headState) {
    return "session";
  }
  return normalizeAuditKind(fallbackKind);
}

function renderRestorePlan(options = {}) {
  const auditKind = detectAuditKind(options.audit, options.auditKind);
  const target = options.target || "before";
  const lines = [
    "Delivery restore plan",
    `audit: ${options.auditPath}`,
    `auditKind: ${auditKind}`,
    `target: ${target}`,
    `apply: ${options.apply ? "true" : "false"}`,
    `tree: ${options.tree}`,
    ""
  ];

  const headState = options.audit && options.audit.headState ? options.audit.headState : null;
  if (headState && (headState.beforeHead || headState.afterHead)) {
    lines.push(`headBefore: ${String(headState.beforeHead || "").trim()}`);
    lines.push(`headAfter: ${String(headState.afterHead || "").trim()}`);
    lines.push("note: delivery-restore only rewrites the index tree; it does not move HEAD.");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  normalizeAuditKind,
  resolveDefaultAuditPath,
  resolveAuditPath,
  resolveTargetTree,
  detectAuditKind,
  renderRestorePlan
};
