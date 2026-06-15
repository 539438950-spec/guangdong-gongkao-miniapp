#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { collectDeliveryReport } = require("./delivery-report-lib");
const { buildBaselineReport } = require("./baseline-report-lib");
const { DEFAULT_GROUP_ORDER, buildStagePlan } = require("./delivery-stage-lib");
const { buildDeliveryPlan } = require("./delivery-plan-lib");
const {
  buildDeliveryManifest,
  renderManifestText,
  buildDeliveryManifestArtifacts,
  renderWrittenManifestArtifactsText
} = require("./delivery-manifest-lib");

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

function parseGroupIds() {
  const raw = readFlagValue("--group");
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOutputDir() {
  const raw = readFlagValue("--output-dir");
  if (!raw) {
    return path.join(repoRoot(), "output", "delivery-manifest");
  }
  return path.resolve(repoRoot(), raw);
}

function parseSmokeStatus() {
  const raw = readFlagValue("--smoke-status");
  return raw || "required";
}

function validateGroupIds(groupIds) {
  const invalid = groupIds.filter((groupId) => !DEFAULT_GROUP_ORDER.includes(groupId));
  if (invalid.length > 0) {
    throw new Error(`Unknown delivery group: ${invalid.join(", ")}`);
  }
}

function writeArtifacts(artifacts = []) {
  artifacts.forEach((artifact) => {
    fs.mkdirSync(path.dirname(artifact.path), { recursive: true });
    fs.writeFileSync(artifact.path, artifact.content, "utf8");
  });
}

function main() {
  const groupIds = parseGroupIds();
  validateGroupIds(groupIds);

  const deliveryReport = collectDeliveryReport();
  const baselineReport = buildBaselineReport({ deliveryReport });
  const stagePlan = buildStagePlan(deliveryReport, { groupIds });
  const deliveryPlan = buildDeliveryPlan({
    deliveryReport,
    stagePlan,
    baselineReport,
    smokeStatus: parseSmokeStatus()
  });
  const manifest = buildDeliveryManifest(deliveryPlan, stagePlan);

  if (hasFlag("--json")) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  if (hasFlag("--write")) {
    const outputDir = parseOutputDir();
    const artifacts = buildDeliveryManifestArtifacts(manifest, {
      repoRoot: repoRoot(),
      outputDir
    });
    writeArtifacts(artifacts);
    process.stdout.write(renderWrittenManifestArtifactsText(artifacts, outputDir));
    return;
  }

  process.stdout.write(renderManifestText(manifest));
}

main();
