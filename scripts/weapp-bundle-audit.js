#!/usr/bin/env node

const path = require("node:path");
const {
  buildWeappBundleAudit,
  buildWeappBundleAuditArtifacts,
  collectWeappProjectFiles,
  normalizePackIgnoreRules,
  readWeappProjectConfig,
  renderWeappBundleAuditReadme,
  resolveWeappBundleAuditPaths,
  writeWeappBundleAuditArtifacts
} = require("./weapp-bundle-audit-lib");

function main() {
  const paths = resolveWeappBundleAuditPaths(path.resolve(__dirname, ".."));
  const projectConfig = readWeappProjectConfig(paths.projectConfigPath);
  const rules = normalizePackIgnoreRules((projectConfig.packOptions || {}).ignore || []);
  const files = collectWeappProjectFiles(paths.projectDir, rules);
  const audit = buildWeappBundleAudit({
    projectConfig,
    rules,
    files
  });

  writeWeappBundleAuditArtifacts(buildWeappBundleAuditArtifacts(audit, paths.outputDir));
  process.stdout.write(renderWeappBundleAuditReadme(audit));
  process.stdout.write(`auditFile: ${paths.latestPath}\n`);

  if (audit.summary.thresholdStatus !== "within-limit") {
    process.exitCode = 1;
  }
}

main();
