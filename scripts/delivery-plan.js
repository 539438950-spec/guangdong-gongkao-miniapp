#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { collectDeliveryReport } = require("./delivery-report-lib");
const { buildStagePlan } = require("./delivery-stage-lib");
const { buildBaselineReport } = require("./baseline-report-lib");
const {
  buildDeliveryPlan,
  renderDeliveryPlanText,
  buildDeliveryPlanArtifacts,
  renderWrittenPlanArtifactsText
} = require("./delivery-plan-lib");

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
    return path.join(repoRoot(), "output", "delivery-plan");
  }
  return path.resolve(repoRoot(), raw);
}

function writeArtifacts(artifacts = []) {
  artifacts.forEach((artifact) => {
    fs.mkdirSync(path.dirname(artifact.path), { recursive: true });
    fs.writeFileSync(artifact.path, artifact.content, "utf8");
  });
}

function main() {
  const deliveryReport = collectDeliveryReport();
  const stagePlan = buildStagePlan(deliveryReport);
  const baselineReport = buildBaselineReport({ deliveryReport });
  const plan = buildDeliveryPlan({
    deliveryReport,
    stagePlan,
    baselineReport
  });

  if (hasFlag("--json")) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (hasFlag("--write")) {
    const outputDir = parseOutputDir();
    const artifacts = buildDeliveryPlanArtifacts(plan, { outputDir });
    writeArtifacts(artifacts);
    process.stdout.write(renderWrittenPlanArtifactsText(artifacts, outputDir));
    return;
  }

  process.stdout.write(renderDeliveryPlanText(plan));
}

main();
