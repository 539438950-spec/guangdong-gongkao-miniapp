const path = require("node:path");

function resolveSessionAuditPath(repoRoot, explicitAuditPath = "") {
  const explicit = String(explicitAuditPath || "").trim();
  if (explicit) {
    return path.resolve(repoRoot, explicit);
  }
  return path.join(repoRoot, "output", "delivery-session", "latest.json");
}

function extractRevertCommits(audit) {
  const commits = Array.isArray(audit && audit.commits) ? audit.commits.slice() : [];
  const seen = new Set();
  return commits
    .filter((commit) => commit && commit.commit)
    .reverse()
    .filter((commit) => {
      const sha = String(commit.commit).trim();
      if (!sha || seen.has(sha)) {
        return false;
      }
      seen.add(sha);
      return true;
    })
    .map((commit) => ({
      ...commit,
      commit: String(commit.commit).trim()
    }));
}

function buildRevertCommand(commitSha) {
  return `git revert --no-edit ${commitSha}`;
}

function buildRevertAuditCommand(auditPath) {
  return `node scripts/delivery-revert.js --audit ${auditPath} --apply`;
}

function buildRevertPlan(options = {}) {
  const revertCommits = extractRevertCommits(options.audit);
  const headState = options.audit && options.audit.headState ? options.audit.headState : null;
  const lines = [
    "Delivery revert plan",
    `audit: ${options.auditPath}`,
    `apply: ${options.apply ? "true" : "false"}`,
    `commitCount: ${revertCommits.length}`,
    ""
  ];

  if (headState && (headState.beforeHead || headState.afterHead)) {
    lines.push(`headBefore: ${String(headState.beforeHead || "").trim()}`);
    lines.push(`headAfter: ${String(headState.afterHead || "").trim()}`);
    lines.push("");
  }

  if (!revertCommits.length) {
    lines.push("No committed delivery-session entries found in audit.");
    return `${lines.join("\n")}\n`;
  }

  revertCommits.forEach((commit, index) => {
    lines.push(`${index + 1}. ${commit.commit}${commit.subject ? ` ${commit.subject}` : ""}`);
    lines.push(`   ${buildRevertCommand(commit.commit)}`);
  });
  lines.push("");
  lines.push("This flow uses `git revert` and does not rewrite history.");

  return `${lines.join("\n")}\n`;
}

module.exports = {
  resolveSessionAuditPath,
  extractRevertCommits,
  buildRevertCommand,
  buildRevertAuditCommand,
  buildRevertPlan
};
