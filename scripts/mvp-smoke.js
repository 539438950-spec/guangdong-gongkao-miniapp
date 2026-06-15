#!/usr/bin/env node

const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildMvpSmokeAudit,
  buildMvpSmokeArtifacts
} = require("./mvp-smoke-lib");
const { resolveNpmRunProcess } = require("./run-package-script-lib");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function writeArtifacts(artifacts = []) {
  artifacts.forEach((artifact) => {
    fs.mkdirSync(path.dirname(artifact.path), { recursive: true });
    fs.writeFileSync(artifact.path, artifact.content, "utf8");
  });
}

function runStep(step) {
  const startedAt = Date.now();
  try {
    cp.execFileSync(step.command, step.args, {
      cwd: ROOT_DIR,
      stdio: "inherit",
      timeout: Number(step.timeoutMs || DEFAULT_TIMEOUT_MS)
    });
    return {
      ...step,
      passed: true,
      exitCode: 0,
      timedOut: false,
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ...step,
      passed: false,
      exitCode: typeof error.status === "number" ? error.status : 1,
      timedOut: Boolean(error && error.code === "ETIMEDOUT"),
      durationMs: Date.now() - startedAt
    };
  }
}

function main() {
  const steps = [
    {
      id: "demo-check",
      label: "demo --check --no-ingest",
      command: process.execPath,
      args: [path.join(ROOT_DIR, "scripts", "demo-start.js"), "--check", "--no-ingest", "--port", "0"],
      timeoutMs: DEFAULT_TIMEOUT_MS
    },
    {
      id: "api-tests",
      label: "services/api tests",
      ...resolveNpmRunProcess("test:api")
    },
    {
      id: "weapp-api-tests",
      label: "apps/weapp api tests",
      command: process.execPath,
      args: ["--test", path.join(ROOT_DIR, "apps", "weapp", "test", "api.test.js")],
      timeoutMs: DEFAULT_TIMEOUT_MS
    },
    {
      id: "weapp-pages-smoke",
      label: "apps/weapp main pages smoke",
      command: process.execPath,
      args: [
        "--test",
        "--test-name-pattern",
        "home page|notice-detail page|positions page|compare page|messages page|source status page|review center page|profile page",
        path.join(ROOT_DIR, "apps", "weapp", "test", "pages.test.js")
      ],
      timeoutMs: DEFAULT_TIMEOUT_MS
    }
  ];

  const results = [];
  for (const step of steps) {
    const result = runStep(step);
    results.push(result);
    if (!result.passed) {
      break;
    }
  }

  const failedStep = results.find((item) => !item.passed);
  const audit = buildMvpSmokeAudit({
    status: failedStep ? "failed" : "ready",
    error: failedStep ? `${failedStep.label} failed` : "",
    steps: results
  });

  writeArtifacts(buildMvpSmokeArtifacts(audit, {
    outputDir: path.join(ROOT_DIR, "output", "mvp-smoke")
  }));

  if (!audit.ok) {
    process.exitCode = failedStep ? failedStep.exitCode || 1 : 1;
  }
}

main();
