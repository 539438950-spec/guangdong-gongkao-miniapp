const path = require("node:path");

function sanitizeSmokeStamp(value) {
  return String(value || "")
    .replace(/[:.]/g, "-")
    .replace(/[^0-9A-Za-z_-]/g, "");
}

function summarizeSteps(steps = []) {
  const total = Array.isArray(steps) ? steps.length : 0;
  const passed = (steps || []).filter((step) => step && step.passed).length;
  const failed = total - passed;
  const totalDurationMs = (steps || []).reduce(
    (sum, step) => sum + Number((step && step.durationMs) || 0),
    0
  );

  return {
    total,
    passed,
    failed,
    totalDurationMs
  };
}

function buildMvpSmokeAudit(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const steps = Array.isArray(options.steps) ? options.steps : [];
  const summary = summarizeSteps(steps);
  const status = options.status || (summary.failed === 0 ? "ready" : "failed");

  return {
    generatedAt,
    statusId: sanitizeSmokeStamp(generatedAt),
    ok: status === "ready",
    status,
    error: options.error ? String(options.error) : "",
    summary,
    steps: steps.map((step) => ({
      id: String(step.id || ""),
      label: String(step.label || ""),
      command: String(step.command || ""),
      passed: Boolean(step.passed),
      exitCode: Number(step.exitCode || 0),
      timedOut: Boolean(step.timedOut),
      durationMs: Number(step.durationMs || 0)
    }))
  };
}

function renderMvpSmokeReadme(audit) {
  const lines = [
    "Guangdong Gongkao MVP Smoke",
    `status: ${audit.status}`,
    `ok: ${audit.ok ? "true" : "false"}`,
    `generatedAt: ${audit.generatedAt}`,
    `steps: ${audit.summary.passed}/${audit.summary.total}`,
    `totalDurationMs: ${audit.summary.totalDurationMs}`,
    ""
  ];

  if (audit.error) {
    lines.push(`error: ${audit.error}`);
    lines.push("");
  }

  lines.push("Steps");
  audit.steps.forEach((step) => {
    lines.push(
      `- ${step.label}: ${step.passed ? "passed" : "failed"} ` +
      `(exit=${step.exitCode}, timedOut=${step.timedOut ? "true" : "false"}, durationMs=${step.durationMs})`
    );
  });

  return `${lines.join("\n")}\n`;
}

function buildMvpSmokeArtifacts(audit, options = {}) {
  const outputDir = options.outputDir || path.join("output", "mvp-smoke");
  return [
    {
      path: path.join(outputDir, `${audit.statusId}.json`),
      content: `${JSON.stringify(audit, null, 2)}\n`
    },
    {
      path: path.join(outputDir, "latest.json"),
      content: `${JSON.stringify(audit, null, 2)}\n`
    },
    {
      path: path.join(outputDir, "README.txt"),
      content: renderMvpSmokeReadme(audit)
    }
  ];
}

module.exports = {
  sanitizeSmokeStamp,
  summarizeSteps,
  buildMvpSmokeAudit,
  renderMvpSmokeReadme,
  buildMvpSmokeArtifacts
};
