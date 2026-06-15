#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { localRuntimePaths } = require("../services/runtime-paths");

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function sanitizeTimestamp(value) {
  return String(value || "")
    .trim()
    .replace(/[:.]/g, "-");
}

function getRuntimeAuditDir(root = repoRoot()) {
  return path.join(root, "output", "runtime-boundaries");
}

function getRuntimeAuditLatestPath(root = repoRoot()) {
  return path.join(getRuntimeAuditDir(root), "latest.json");
}

function getRuntimeAuditReadmePath(root = repoRoot()) {
  return path.join(getRuntimeAuditDir(root), "README.txt");
}

function readRepoText(repoRelativePath, root = repoRoot()) {
  return fs.readFileSync(path.join(root, repoRelativePath), "utf8");
}

function collectRuntimeBoundaryState(root = repoRoot()) {
  const gitignorePath = ".gitignore";
  const readmePath = "README.md";
  const roleGuidePath = "docs/role-guide.md";
  const commandMatrixPath = "docs/command-matrix.md";
  const deliveryChecklistPath = "docs/delivery-checklist.md";
  const runtimePathsPath = "services/runtime-paths.js";
  const packageJsonPath = "package.json";

  const files = {
    gitignore: gitignorePath,
    readme: readmePath,
    roleGuide: roleGuidePath,
    commandMatrix: commandMatrixPath,
    deliveryChecklist: deliveryChecklistPath,
    runtimePaths: runtimePathsPath,
    packageJson: packageJsonPath
  };

  const texts = {
    gitignore: readRepoText(gitignorePath, root),
    readme: readRepoText(readmePath, root),
    roleGuide: readRepoText(roleGuidePath, root),
    commandMatrix: readRepoText(commandMatrixPath, root),
    deliveryChecklist: readRepoText(deliveryChecklistPath, root),
    runtimePaths: readRepoText(runtimePathsPath, root)
  };

  const pkg = JSON.parse(readRepoText(packageJsonPath, root));
  const scripts = pkg.scripts || {};

  const requiredIgnoreEntries = [
    ".playwright-cli/",
    "output/",
    "apps/weapp/env.runtime.js",
    "apps/weapp/project.private.config.json",
    "services/api/var/runtime/",
    "services/ingest/var/runtime/",
    "cloudfunctions/gongkao-api/runtime/"
  ];

  const requiredRuntimeBoundaryTokens = [
    "services/ingest/var/runtime/**",
    "services/api/var/runtime/**",
    "output/**",
    ".playwright-cli/**",
    "apps/weapp/env.runtime.js",
    "apps/weapp/data/ingested.js",
    "services/ingest/var/source-states.json",
    "services/ingest/var/position-overrides.json",
    "services/ingest/var/production/**",
    "npm run baseline:refresh",
    "npm run delivery:check",
    "npm run runtime:check"
  ];

  const requiredCommandMatrixCommands = [
    "npm run delivery:check",
    "npm run delivery:bundle:write",
    "npm run baseline:refresh",
    "npm run runtime:check"
  ];

  const runtimePaths = localRuntimePaths();
  const requiredRuntimePathTokens = [
    runtimePaths.userStateFile,
    runtimePaths.snapshotTarget,
    runtimePaths.positionOverridePath,
    runtimePaths.artifactsRoot
  ].map((item) => String(item).replace(/\\/g, "/"));

  return {
    files,
    texts,
    scripts,
    requiredIgnoreEntries,
    requiredRuntimeBoundaryTokens,
    requiredCommandMatrixCommands,
    requiredRuntimePathTokens,
    runtimePaths
  };
}

function collectRuntimeBoundaryFailures(state = collectRuntimeBoundaryState()) {
  const failures = [];

  for (const scriptName of ["runtime:check", "delivery:check", "delivery:bundle:write", "baseline:refresh"]) {
    if (!state.scripts[scriptName]) {
      failures.push(`missing package script: ${scriptName}`);
    }
  }

  for (const token of state.requiredIgnoreEntries) {
    if (!state.texts.gitignore.includes(token)) {
      failures.push(`.gitignore must include ${token}`);
    }
  }

  for (const token of state.requiredRuntimeBoundaryTokens) {
    if (!state.texts.deliveryChecklist.includes(token) && !state.texts.readme.includes(token)) {
      failures.push(`runtime boundary docs must include ${token}`);
    }
  }

  for (const command of state.requiredCommandMatrixCommands) {
    if (!state.texts.commandMatrix.includes(command)) {
      failures.push(`command-matrix must include ${command}`);
    }
  }

  if (!state.texts.roleGuide.includes("docs/delivery-checklist.md")) {
    failures.push("role-guide must route runtime boundary work to docs/delivery-checklist.md");
  }

  const normalizedRuntimeText = state.texts.runtimePaths.replace(/\\/g, "/");
  for (const token of state.requiredRuntimePathTokens) {
    const relativeToken = path.relative(repoRoot(), token).replace(/\\/g, "/");
    if (!normalizedRuntimeText.includes(relativeToken) && !normalizedRuntimeText.includes(token)) {
      failures.push(`runtime-paths must include ${token}`);
    }
  }

  if (!state.texts.deliveryChecklist.includes("这些都应被 `.gitignore` 屏蔽。")) {
    failures.push("delivery-checklist must describe ignored runtime/audit worktree noise");
  }

  if (!state.texts.deliveryChecklist.includes("默认本地运行写入：")) {
    failures.push("delivery-checklist must describe default runtime write scope");
  }

  if (!state.texts.readme.includes("默认本地运行只应写入 runtime 和审计产物")) {
    failures.push("README must describe runtime-only local write boundary");
  }

  return failures;
}

function buildRuntimeBoundaryAudit() {
  const state = collectRuntimeBoundaryState();
  const failures = collectRuntimeBoundaryFailures(state);
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    statusId: sanitizeTimestamp(generatedAt),
    ok: failures.length === 0,
    checkedFiles: Object.values(state.files),
    checkedScripts: ["runtime:check", "delivery:check", "delivery:bundle:write", "baseline:refresh"],
    checkedIgnoreEntries: state.requiredIgnoreEntries,
    checkedBoundaryTokens: state.requiredRuntimeBoundaryTokens,
    checkedRuntimePaths: state.requiredRuntimePathTokens,
    failures
  };
}

function renderRuntimeBoundaryAuditText(audit) {
  const lines = [
    "广东公考运行产物边界校验",
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
  lines.push("检查 ignore 边界");
  audit.checkedIgnoreEntries.forEach((token) => {
    lines.push(`- ${token}`);
  });

  lines.push("");
  lines.push("检查 runtime / baseline 术语");
  audit.checkedBoundaryTokens.forEach((token) => {
    lines.push(`- ${token}`);
  });

  lines.push("");
  lines.push("检查 runtime 路径实现");
  audit.checkedRuntimePaths.forEach((token) => {
    lines.push(`- ${token}`);
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

function writeRuntimeBoundaryAudit(audit, root = repoRoot()) {
  const outputDir = getRuntimeAuditDir(root);
  const canonicalPath = path.join(outputDir, `${audit.statusId || sanitizeTimestamp(audit.generatedAt)}.json`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(getRuntimeAuditLatestPath(root), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  fs.writeFileSync(canonicalPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  fs.writeFileSync(getRuntimeAuditReadmePath(root), renderRuntimeBoundaryAuditText(audit), "utf8");
  return {
    outputDir,
    latestPath: getRuntimeAuditLatestPath(root),
    canonicalPath,
    readmePath: getRuntimeAuditReadmePath(root)
  };
}

function main() {
  const audit = buildRuntimeBoundaryAudit();
  const output = writeRuntimeBoundaryAudit(audit);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      audit,
      output
    }, null, 2));
  } else {
    process.stdout.write(renderRuntimeBoundaryAuditText(audit));
  }

  process.exitCode = audit.ok ? 0 : 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  sanitizeTimestamp,
  getRuntimeAuditDir,
  getRuntimeAuditLatestPath,
  getRuntimeAuditReadmePath,
  collectRuntimeBoundaryState,
  collectRuntimeBoundaryFailures,
  buildRuntimeBoundaryAudit,
  renderRuntimeBoundaryAuditText,
  writeRuntimeBoundaryAudit
};
