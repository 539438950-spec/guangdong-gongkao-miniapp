#!/usr/bin/env node

const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { buildBaselineReport } = require("./baseline-report-lib");
const { collectDeliveryReport } = require("./delivery-report-lib");
const { resolveNpmRunProcess } = require("./run-package-script-lib");
const { getRuntimeAuditLatestPath } = require("./runtime-boundaries-check");
const {
  buildDeliveryCheckSummary,
  renderDeliveryCheckText
} = require("./delivery-check-lib");

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function resolveSmokeProcess(env = process.env, platform = process.platform) {
  return resolveNpmRunProcess("mvp:smoke", env, platform);
}

function runSmoke() {
  const { command, args } = resolveSmokeProcess();
  cp.execFileSync(command, args, {
    cwd: repoRoot(),
    stdio: "inherit"
  });
}

function runNpmScript(scriptName) {
  const { command, args } = resolveNpmRunProcess(scriptName);
  cp.execFileSync(command, args, {
    cwd: repoRoot(),
    stdio: "inherit"
  });
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getMvpSmokeStatus(audit = null) {
  if (!audit) {
    return {
      available: false,
      passed: false,
      status: "missing"
    };
  }
  return {
    available: true,
    passed: Boolean(audit.ok) || String(audit.status || "") === "ready",
    status: String(audit.status || "unknown")
  };
}

function getWeappAuditStatus(audit = null) {
  if (!audit || !audit.summary) {
    return {
      available: false,
      passed: false,
      thresholdStatus: "missing",
      includedSizeKB: 0,
      ignoredSizeKB: 0
    };
  }
  return {
    available: true,
    passed: audit.summary.thresholdStatus === "within-limit",
    thresholdStatus: String(audit.summary.thresholdStatus || "unknown"),
    includedSizeKB: Number(audit.summary.includedSizeKB || 0),
    ignoredSizeKB: Number(audit.summary.ignoredSizeKB || 0)
  };
}

function isPassingWeappSmokeMode(mode = "") {
  return mode === "preview-success" || mode === "compile-ok-upload-blocked";
}

function getWeappSmokeStatus(audit = null) {
  if (!audit) {
    return {
      available: false,
      passed: false,
      mode: "missing",
      message: ""
    };
  }
  return {
    available: true,
    passed: Boolean(audit.ok) && isPassingWeappSmokeMode(String(audit.mode || "")),
    mode: String(audit.mode || "unknown"),
    message: String(audit.message || "")
  };
}

function getDocsCheckStatus(audit = null) {
  if (!audit) {
    return {
      available: false,
      passed: false,
      failureCount: 0
    };
  }
  return {
    available: true,
    passed: Boolean(audit.ok),
    failureCount: Array.isArray(audit.failures) ? audit.failures.length : 0
  };
}

function getRuntimeCheckStatus(audit = null) {
  if (!audit) {
    return {
      available: false,
      passed: false,
      failureCount: 0
    };
  }
  return {
    available: true,
    passed: Boolean(audit.ok),
    failureCount: Array.isArray(audit.failures) ? audit.failures.length : 0
  };
}

function collectDeliveryCheckResult(options = {}) {
  const shouldRunSmoke = options.runSmoke !== false;
  const shouldRunWeappAudit = options.runWeappAudit !== false;
  const shouldRunWeappSmoke = options.runWeappSmoke !== false;
  const shouldRunDocsCheck = options.runDocsCheck !== false;
  const shouldRunRuntimeCheck = options.runRuntimeCheck !== false;
  let smokePassed = false;
  let mvpSmoke = options.mvpSmoke || null;
  let weappAudit = options.weappAudit || null;
  let weappSmoke = options.weappSmoke || null;
  let docsCheck = options.docsCheck || null;
  let runtimeCheck = options.runtimeCheck || null;

  if (shouldRunSmoke) {
    try {
      runSmoke();
      smokePassed = true;
    } catch (_error) {
      smokePassed = false;
    }
    mvpSmoke = readJsonIfExists(path.join(repoRoot(), "output", "mvp-smoke", "latest.json"));
  } else if (typeof options.smokePassed === "boolean") {
    smokePassed = options.smokePassed;
  } else if (!mvpSmoke) {
    mvpSmoke = readJsonIfExists(path.join(repoRoot(), "output", "mvp-smoke", "latest.json"));
    smokePassed = getMvpSmokeStatus(mvpSmoke).passed;
  }

  if (shouldRunWeappAudit) {
    try {
      runNpmScript("weapp:audit");
    } catch (_error) {
      // Status comes from written audit file.
    }
    weappAudit = readJsonIfExists(path.join(repoRoot(), "output", "weapp-bundle", "latest.json"));
  } else if (!weappAudit) {
    weappAudit = readJsonIfExists(path.join(repoRoot(), "output", "weapp-bundle", "latest.json"));
  }

  if (shouldRunWeappSmoke) {
    try {
      runNpmScript("weapp:smoke");
    } catch (_error) {
      // Status comes from written audit file.
    }
    weappSmoke = readJsonIfExists(path.join(repoRoot(), "output", "weapp-devtools", "latest.json"));
  } else if (!weappSmoke) {
    weappSmoke = readJsonIfExists(path.join(repoRoot(), "output", "weapp-devtools", "latest.json"));
  }

  if (shouldRunDocsCheck) {
    try {
      runNpmScript("docs:check");
    } catch (_error) {
      // Status comes from written audit file.
    }
    docsCheck = readJsonIfExists(path.join(repoRoot(), "output", "docs-entrypoints", "latest.json"));
  } else if (!docsCheck) {
    docsCheck = readJsonIfExists(path.join(repoRoot(), "output", "docs-entrypoints", "latest.json"));
  }

  if (shouldRunRuntimeCheck) {
    try {
      runNpmScript("runtime:check");
    } catch (_error) {
      // Status comes from written audit file.
    }
    runtimeCheck = readJsonIfExists(getRuntimeAuditLatestPath(repoRoot()));
  } else if (!runtimeCheck) {
    runtimeCheck = readJsonIfExists(getRuntimeAuditLatestPath(repoRoot()));
  }

  const report = options.report || collectDeliveryReport();
  const baselineReport = options.baselineReport || buildBaselineReport({ deliveryReport: report });
  const summary = buildDeliveryCheckSummary(report, smokePassed, baselineReport, {
    weappAudit: getWeappAuditStatus(weappAudit),
    weappSmoke: getWeappSmokeStatus(weappSmoke),
    docsCheck: getDocsCheckStatus(docsCheck),
    runtimeCheck: getRuntimeCheckStatus(runtimeCheck)
  });

  return {
    smokePassed,
    mvpSmoke,
    weappAudit,
    weappSmoke,
    docsCheck,
    runtimeCheck,
    report,
    baselineReport,
    summary
  };
}

function main() {
  const result = collectDeliveryCheckResult({
    runSmoke: !hasFlag("--skip-smoke"),
    runWeappAudit: !hasFlag("--skip-weapp-audit"),
    runWeappSmoke: !hasFlag("--skip-weapp-smoke"),
    runDocsCheck: !hasFlag("--skip-docs-check"),
    runRuntimeCheck: !hasFlag("--skip-runtime-check")
  });

  if (hasFlag("--json")) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.summary.readyForReview ? 0 : 1;
    return;
  }

  process.stdout.write(renderDeliveryCheckText(result.summary));
  process.exitCode = result.summary.readyForReview ? 0 : 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  resolveNpmRunProcess,
  resolveSmokeProcess,
  runSmoke,
  runNpmScript,
  readJsonIfExists,
  getWeappAuditStatus,
  getWeappSmokeStatus,
  getDocsCheckStatus,
  getRuntimeCheckStatus,
  getMvpSmokeStatus,
  isPassingWeappSmokeMode,
  collectDeliveryCheckResult
};
