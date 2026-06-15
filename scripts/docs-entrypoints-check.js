#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function sanitizeTimestamp(value) {
  return String(value || "")
    .trim()
    .replace(/[:.]/g, "-");
}

function getDocsAuditDir(root = repoRoot()) {
  return path.join(root, "output", "docs-entrypoints");
}

function getDocsAuditLatestPath(root = repoRoot()) {
  return path.join(getDocsAuditDir(root), "latest.json");
}

function getDocsAuditReadmePath(root = repoRoot()) {
  return path.join(getDocsAuditDir(root), "README.txt");
}

function readText(repoRelativePath) {
  const fullPath = path.join(repoRoot(), repoRelativePath);
  return fs.readFileSync(fullPath, "utf8");
}

function pathExists(repoRelativePath) {
  return fs.existsSync(path.join(repoRoot(), repoRelativePath));
}

function collectDocsState() {
  const files = {
    readme: "README.md",
    roleGuide: "docs/role-guide.md",
    commandMatrix: "docs/command-matrix.md",
    deliveryChecklist: "docs/delivery-checklist.md"
  };

  const texts = Object.fromEntries(
    Object.entries(files).map(([key, value]) => [key, readText(value)])
  );

  const pkg = JSON.parse(readText("package.json"));
  const scripts = pkg.scripts || {};

  const expectedDocs = [
    "docs/role-guide.md",
    "docs/command-matrix.md",
    "docs/delivery-checklist.md",
    "docs/product-plan.md",
    "docs/mvp-contract.md",
    "docs/frontend-contract.md",
    "docs/ingest-contract.md",
    "docs/test-matrix.md",
    "docs/architecture.md",
    "docs/sources.md",
    "docs/cloud-deploy.md"
  ];

  const requiredScripts = [
    "test",
    "mvp:smoke",
    "demo:check",
    "demo:start",
    "demo:serve",
    "demo:status",
    "weapp:audit",
    "weapp:smoke",
    "ingest:health",
    "baseline:report",
    "baseline:refresh",
    "delivery:report",
    "delivery:check",
    "delivery:stage",
    "delivery:plan",
    "delivery:manifest",
    "delivery:bundle:write",
    "runtime:check",
    "docs:check"
  ];

  const requiredArtifactTokens = [
    "output/demo-start/**",
    "output/mvp-smoke/**",
    "output/weapp-bundle/**",
    "output/weapp-devtools/**",
    "output/runtime-boundaries/**",
    "output/delivery-bundle/**"
  ];

  return {
    files,
    texts,
    scripts,
    expectedDocs,
    requiredScripts,
    requiredArtifactTokens
  };
}

function collectFailures(state = collectDocsState()) {
  const failures = [];

  for (const repoRelativePath of state.expectedDocs) {
    if (!pathExists(repoRelativePath)) {
      failures.push(`missing expected doc: ${repoRelativePath}`);
    }
  }

  for (const scriptName of state.requiredScripts) {
    if (!state.scripts[scriptName]) {
      failures.push(`missing package script: ${scriptName}`);
    }
  }

  const contains = (key, token, label) => {
    if (!state.texts[key].includes(token)) {
      failures.push(`${label} must include ${token}`);
    }
  };

  contains("readme", "docs/role-guide.md", "README");
  contains("readme", "docs/command-matrix.md", "README");
  contains("readme", "docs/delivery-checklist.md", "README");
  contains("readme", "docs/cloud-deploy.md", "README");

  contains("roleGuide", "docs/mvp-contract.md", "role-guide");
  contains("roleGuide", "docs/command-matrix.md", "role-guide");
  contains("roleGuide", "docs/delivery-checklist.md", "role-guide");

  for (const command of ["npm run mvp:smoke", "npm run weapp:smoke", "npm run delivery:check"]) {
    if (!state.texts.commandMatrix.includes(command)) {
      failures.push(`command-matrix must include ${command}`);
    }
  }

  for (const command of ["npm run delivery:bundle:write", "npm run baseline:refresh"]) {
    if (!state.texts.commandMatrix.includes(command)) {
      failures.push(`command-matrix must include ${command}`);
    }
    if (!state.texts.roleGuide.includes(command)) {
      failures.push(`role-guide must include ${command}`);
    }
  }

  if (!state.texts.deliveryChecklist.includes("node scripts/delivery-bundle.js --write")) {
    failures.push("delivery-checklist must describe delivery bundle export");
  }
  if (!state.texts.deliveryChecklist.includes("services/ingest/var/runtime/**")) {
    failures.push("delivery-checklist must describe ingest runtime boundary");
  }
  if (!state.texts.deliveryChecklist.includes("services/api/var/runtime/**")) {
    failures.push("delivery-checklist must describe api runtime boundary");
  }

  for (const token of state.requiredArtifactTokens) {
    const present = Object.values(state.texts).some((text) => text.includes(token));
    if (!present) {
      failures.push(`missing artifact token in entrypoint docs: ${token}`);
    }
  }

  return failures;
}

function buildDocsEntryPointsAudit() {
  const state = collectDocsState();
  const failures = collectFailures(state);
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    statusId: sanitizeTimestamp(generatedAt),
    ok: failures.length === 0,
    checkedFiles: Object.values(state.files),
    checkedScripts: state.requiredScripts,
    checkedArtifacts: state.requiredArtifactTokens,
    failures
  };
}

function renderDocsEntryPointsAuditText(audit) {
  const lines = [
    "广东公考文档入口校验",
    `ok: ${audit.ok ? "true" : "false"}`,
    "",
    "检查文件"
  ];

  audit.checkedFiles.forEach((file) => {
    lines.push(`- ${file}`);
  });

  lines.push("");
  lines.push("检查命令");
  audit.checkedScripts.forEach((scriptName) => {
    lines.push(`- ${scriptName}`);
  });

  lines.push("");
  lines.push("检查工件入口");
  audit.checkedArtifacts.forEach((artifact) => {
    lines.push(`- ${artifact}`);
  });

  lines.push("");
  if (audit.failures.length > 0) {
    lines.push("失败项");
    audit.failures.forEach((failure) => {
      lines.push(`- ${failure}`);
    });
  } else {
    lines.push("失败项");
    lines.push("- none");
  }

  return `${lines.join("\n")}\n`;
}

function writeDocsEntryPointsAudit(audit, root = repoRoot()) {
  const outputDir = getDocsAuditDir(root);
  const canonicalPath = path.join(outputDir, `${audit.statusId || sanitizeTimestamp(audit.generatedAt)}.json`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(getDocsAuditLatestPath(root), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  fs.writeFileSync(canonicalPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  fs.writeFileSync(getDocsAuditReadmePath(root), renderDocsEntryPointsAuditText(audit), "utf8");
  return {
    outputDir,
    latestPath: getDocsAuditLatestPath(root),
    canonicalPath,
    readmePath: getDocsAuditReadmePath(root)
  };
}

function main() {
  const audit = buildDocsEntryPointsAudit();
  const output = writeDocsEntryPointsAudit(audit);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      audit,
      output
    }, null, 2));
  } else {
    process.stdout.write(renderDocsEntryPointsAuditText(audit));
  }

  process.exitCode = audit.ok ? 0 : 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  collectDocsState,
  collectFailures,
  buildDocsEntryPointsAudit,
  renderDocsEntryPointsAuditText,
  writeDocsEntryPointsAudit,
  sanitizeTimestamp,
  getDocsAuditDir,
  getDocsAuditLatestPath,
  getDocsAuditReadmePath
};
