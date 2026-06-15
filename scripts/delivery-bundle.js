#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { collectDeliveryCheckResult } = require("./delivery-check");
const { buildBaselineReport } = require("./baseline-report-lib");
const { buildStagePlan, buildStageArtifacts } = require("./delivery-stage-lib");
const { buildDeliveryPlan, buildDeliveryPlanArtifacts } = require("./delivery-plan-lib");
const { buildDeliveryManifest, buildDeliveryManifestArtifacts } = require("./delivery-manifest-lib");
const {
  buildDeliveryBundle,
  renderDeliveryBundleText,
  buildDeliveryBundleArtifacts,
  renderWrittenBundleArtifactsText
} = require("./delivery-bundle-lib");

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readFlagValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) {
    return "";
  }
  return process.argv[index + 1];
}

function parseOutputDir() {
  const raw = readFlagValue("--output-dir");
  if (!raw) {
    return path.join(repoRoot(), "output", "delivery-bundle");
  }
  return path.resolve(repoRoot(), raw);
}

function parseExecuteAuditDir() {
  const raw = readFlagValue("--execute-audit-dir");
  if (!raw) {
    return path.join(repoRoot(), "output", "delivery-execute");
  }
  return path.resolve(repoRoot(), raw);
}

function parseSessionAuditDir() {
  const raw = readFlagValue("--session-audit-dir");
  if (!raw) {
    return path.join(repoRoot(), "output", "delivery-session");
  }
  return path.resolve(repoRoot(), raw);
}

function parseWeappBundleAuditDir() {
  const raw = readFlagValue("--weapp-bundle-audit-dir");
  if (!raw) {
    return path.join(repoRoot(), "output", "weapp-bundle");
  }
  return path.resolve(repoRoot(), raw);
}

function parseWeappDevtoolsAuditDir() {
  const raw = readFlagValue("--weapp-devtools-audit-dir");
  if (!raw) {
    return path.join(repoRoot(), "output", "weapp-devtools");
  }
  return path.resolve(repoRoot(), raw);
}

function parseDocsAuditDir() {
  const raw = readFlagValue("--docs-audit-dir");
  if (!raw) {
    return path.join(repoRoot(), "output", "docs-entrypoints");
  }
  return path.resolve(repoRoot(), raw);
}

function parseRuntimeAuditDir() {
  const raw = readFlagValue("--runtime-audit-dir");
  if (!raw) {
    return path.join(repoRoot(), "output", "runtime-boundaries");
  }
  return path.resolve(repoRoot(), raw);
}

function readJsonFileIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function getAuditIdentity(audit) {
  if (!audit || typeof audit !== "object") {
    return "";
  }
  return String(audit.auditId || audit.statusId || "").trim();
}

function selectBundledAuditNames(auditDir, artifactNames, latestAudit) {
  if (!Array.isArray(artifactNames) || artifactNames.length === 0) {
    return [];
  }

  const selected = [];
  const seen = new Set();
  const canonicalId = getAuditIdentity(latestAudit);
  const canonicalName = canonicalId ? `${canonicalId}.json` : "";

  const addName = (name) => {
    if (!name || seen.has(name) || !artifactNames.includes(name)) {
      return;
    }
    selected.push(name);
    seen.add(name);
  };

  addName("latest.json");
  addName(canonicalName);

  if (!canonicalId) {
    return selected.length > 0 ? selected : artifactNames.slice();
  }

  artifactNames.forEach((name) => {
    if (seen.has(name)) {
      return;
    }
    const parsed = readJsonFileIfExists(path.join(auditDir, name));
    if (getAuditIdentity(parsed) === canonicalId) {
      addName(name);
    }
  });

  return selected.length > 0 ? selected : artifactNames.slice();
}

function loadLatestAuditArtifacts(auditDir) {
  const latestPath = path.join(auditDir, "latest.json");
  if (!fs.existsSync(auditDir)) {
    return {
      audit: null,
      artifacts: [],
      inventory: {
        fileCount: 0,
        aliasFileCount: 0
      }
    };
  }

  const artifactNames = fs.readdirSync(auditDir)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));
  const audit = readJsonFileIfExists(latestPath);
  const bundledNames = selectBundledAuditNames(auditDir, artifactNames, audit);
  const canonicalName = getAuditIdentity(audit) ? `${getAuditIdentity(audit)}.json` : "";
  const artifacts = bundledNames.map((name) => {
    const artifactPath = path.join(auditDir, name);
    const content = fs.readFileSync(artifactPath, "utf8");
    return {
      path: artifactPath,
      content: content.endsWith("\n") ? content : `${content}\n`
    };
  });

  return {
    audit,
    artifacts,
    inventory: {
      fileCount: bundledNames.length,
      aliasFileCount: bundledNames.filter((name) => {
        return name !== "latest.json" && name !== canonicalName;
      }).length
    }
  };
}

function writeArtifacts(artifacts = []) {
  artifacts.forEach((artifact) => {
    fs.mkdirSync(path.dirname(artifact.path), { recursive: true });
    fs.writeFileSync(artifact.path, artifact.content, "utf8");
  });
}

function resetOutputDir(outputDir) {
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

function main() {
  const skipSmoke = hasFlag("--skip-smoke");
  const skipWeappAudit = hasFlag("--skip-weapp-audit");
  const skipWeappSmoke = hasFlag("--skip-weapp-smoke");
  const checkResult = collectDeliveryCheckResult({
    runSmoke: !skipSmoke,
    runWeappAudit: !skipWeappAudit,
    runWeappSmoke: !skipWeappSmoke,
    runRuntimeCheck: !hasFlag("--skip-runtime-check"),
    smokePassed: skipSmoke ? false : undefined
  });
  const smokeStatus = skipSmoke
    ? "skipped"
    : (checkResult.smokePassed ? "passed" : "failed");
  const baselineReport = checkResult.baselineReport || buildBaselineReport({ deliveryReport: checkResult.report });
  const stagePlan = buildStagePlan(checkResult.report);
  const deliveryPlan = buildDeliveryPlan({
    deliveryReport: checkResult.report,
    stagePlan,
    baselineReport,
    smokeStatus
  });
  const deliveryManifest = buildDeliveryManifest(deliveryPlan, stagePlan);
  const {
    audit: executionAudit,
    artifacts: executionAuditArtifacts,
    inventory: executionAuditInventory
  } = loadLatestAuditArtifacts(parseExecuteAuditDir());
  const {
    audit: sessionAudit,
    artifacts: sessionAuditArtifacts,
    inventory: sessionAuditInventory
  } = loadLatestAuditArtifacts(parseSessionAuditDir());
  const {
    audit: weappBundleAudit,
    artifacts: weappBundleAuditArtifacts,
    inventory: weappBundleAuditInventory
  } = loadLatestAuditArtifacts(parseWeappBundleAuditDir());
  const {
    audit: weappDevtoolsAudit,
    artifacts: weappDevtoolsAuditArtifacts,
    inventory: weappDevtoolsAuditInventory
  } = loadLatestAuditArtifacts(parseWeappDevtoolsAuditDir());
  const {
    audit: docsAudit,
    artifacts: docsAuditArtifacts,
    inventory: docsAuditInventory
  } = loadLatestAuditArtifacts(parseDocsAuditDir());
  const {
    audit: runtimeAudit,
    artifacts: runtimeAuditArtifacts,
    inventory: runtimeAuditInventory
  } = loadLatestAuditArtifacts(parseRuntimeAuditDir());
  const bundle = buildDeliveryBundle({
    checkResult,
    baselineReport,
    stagePlan,
    deliveryPlan,
    deliveryManifest,
    executionAudit,
    executionAuditInventory,
    sessionAudit,
    sessionAuditInventory,
    weappBundleAudit,
    weappBundleAuditInventory,
    weappDevtoolsAudit,
    weappDevtoolsAuditInventory,
    docsAudit,
    docsAuditInventory,
    runtimeAudit,
    runtimeAuditInventory,
    smokeStatus
  });

  if (hasFlag("--json")) {
    console.log(JSON.stringify({
      bundle,
      checkResult,
      baselineReport,
      stagePlan,
      deliveryPlan,
      deliveryManifest,
      executionAudit,
      executionAuditInventory,
      sessionAudit,
      sessionAuditInventory,
      weappBundleAudit,
      weappBundleAuditInventory,
      weappDevtoolsAudit,
      weappDevtoolsAuditInventory,
      docsAudit,
      docsAuditInventory,
      runtimeAudit,
      runtimeAuditInventory
    }, null, 2));
    process.exitCode = skipSmoke ? 0 : (bundle.readyForReview ? 0 : 1);
    return;
  }

  if (hasFlag("--write")) {
    const outputDir = parseOutputDir();
    resetOutputDir(outputDir);
    const stageArtifacts = buildStageArtifacts(stagePlan, {
      outputDir: path.join(outputDir, "stage")
    });
    const planArtifacts = buildDeliveryPlanArtifacts(deliveryPlan, {
      outputDir: path.join(outputDir, "plan")
    });
    const manifestArtifacts = buildDeliveryManifestArtifacts(deliveryManifest, {
      repoRoot: repoRoot(),
      outputDir: path.join(outputDir, "manifest")
    });
    const artifacts = buildDeliveryBundleArtifacts({
      outputDir,
      bundle,
      checkResult,
      baselineReport,
      stageArtifacts,
      planArtifacts,
      manifestArtifacts,
      executionAuditArtifacts,
      sessionAuditArtifacts,
      weappBundleAuditArtifacts,
      weappDevtoolsAuditArtifacts,
      docsAuditArtifacts,
      runtimeAuditArtifacts
    });
    writeArtifacts(artifacts);
    process.stdout.write(renderWrittenBundleArtifactsText(artifacts, outputDir));
    process.exitCode = skipSmoke ? 0 : (bundle.readyForReview ? 0 : 1);
    return;
  }

  process.stdout.write(renderDeliveryBundleText(bundle));
  process.exitCode = skipSmoke ? 0 : (bundle.readyForReview ? 0 : 1);
}

main();
