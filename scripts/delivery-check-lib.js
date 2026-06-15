function buildBaselineStatus(baselineReport = null) {
  const summary = baselineReport && baselineReport.summary
    ? baselineReport.summary
    : {
      total: 0,
      gitChanged: 0,
      synced: 0,
      "out-of-sync": 0,
      "missing-baseline": 0,
      "missing-runtime": 0
    };

  const outOfSync = Number(summary["out-of-sync"] || 0);
  const missingBaseline = Number(summary["missing-baseline"] || 0);
  const missingRuntime = Number(summary["missing-runtime"] || 0);

  return {
    total: Number(summary.total || 0),
    gitChanged: Number(summary.gitChanged || 0),
    synced: Number(summary.synced || 0),
    outOfSync,
    missingBaseline,
    missingRuntime,
    clean: outOfSync === 0 && missingBaseline === 0 && missingRuntime === 0
  };
}

function buildDefaultWeappAuditStatus() {
  return {
    available: false,
    passed: false,
    thresholdStatus: "missing",
    includedSizeKB: 0,
    ignoredSizeKB: 0
  };
}

function buildDefaultWeappSmokeStatus() {
  return {
    available: false,
    passed: false,
    mode: "missing",
    message: ""
  };
}

function buildDefaultDocsCheckStatus() {
  return {
    available: false,
    passed: false,
    failureCount: 0
  };
}

function buildDefaultRuntimeBoundaryStatus() {
  return {
    available: false,
    passed: false,
    failureCount: 0
  };
}

function buildWarnings(report, smokePassed, baselineStatus, weappAudit, weappSmoke, docsCheck, runtimeCheck) {
  const warnings = [];

  if (!smokePassed) {
    warnings.push("`mvp:smoke` 未通过，当前不应进入提交流程。");
  }

  if ((report.summary.other || []).length > 0) {
    warnings.push("存在未分类改动，提交前需要先确认归属。");
  }

  if (!baselineStatus.clean) {
    if (baselineStatus.outOfSync > 0) {
      warnings.push("显式 baseline 与 runtime 之间存在漂移，当前不能直接视为可交付状态。");
    }
    if (baselineStatus.missingBaseline > 0 || baselineStatus.missingRuntime > 0) {
      warnings.push("显式 baseline 或 runtime 存在缺失文件，需要先补齐。");
    }
  } else if ((report.summary.baseline || []).length > 0) {
    warnings.push("当前存在显式 baseline 改动，提交前仍需确认这批 baseline 是否应随本轮一并更新。");
  }

  if (!weappAudit.available) {
    warnings.push("小程序包体审计缺失，需要至少跑一次 `weapp:audit`。");
  } else if (!weappAudit.passed) {
    warnings.push("小程序 preview 包体未通过 2MB 阈值审计，当前不应进入可交付状态。");
  }

  if (!weappSmoke.available) {
    warnings.push("微信开发者工具联调审计缺失，需要跑一次 `weapp:smoke`。");
  } else if (!weappSmoke.passed) {
    warnings.push(`微信开发者工具 preview 未通过，当前模式为 ${weappSmoke.mode || "unknown"}。`);
  }

  if (!docsCheck.available) {
    warnings.push("文档入口校验缺失，需要至少跑一次 `docs:check`。");
  } else if (!docsCheck.passed) {
    warnings.push(`文档入口校验未通过，当前失败数为 ${docsCheck.failureCount}。`);
  }

  if (!runtimeCheck.available) {
    warnings.push("运行产物边界校验缺失，需要至少跑一次 `runtime:check`。");
  } else if (!runtimeCheck.passed) {
    warnings.push(`运行产物边界校验未通过，当前失败数为 ${runtimeCheck.failureCount}。`);
  }

  return warnings;
}

function buildNextSteps(report, smokePassed, baselineStatus, weappAudit, weappSmoke, docsCheck, runtimeCheck) {
  const steps = [];

  if (!smokePassed) {
    steps.push("先修复 `mvp:smoke` 失败项，再重新执行 `node scripts/delivery-check.js --json`。");
    return steps;
  }

  if (!weappAudit.passed) {
    steps.push("先运行 `npm run weapp:audit`，确认 preview 包体和 ignore 边界是否在 2MB 阈值内。");
    return steps;
  }

  if (!weappSmoke.passed) {
    steps.push("先运行 `npm run weapp:smoke`，确认 DevTools preview 是否真正可用。");
    return steps;
  }

  if (!docsCheck.passed) {
    steps.push("先运行 `npm run docs:check`，确认 README 与入口文档的命令、工件和分流入口一致。");
    return steps;
  }

  if (!runtimeCheck.passed) {
    steps.push("先运行 `npm run runtime:check`，确认 .gitignore、入口文档与 runtime/audit 路径边界仍然一致。");
    return steps;
  }

  if ((report.summary.other || []).length > 0) {
    steps.push("先运行 `node scripts/delivery-report.js`，把未分类改动收口到明确分组。");
  }

  if (!baselineStatus.clean) {
    steps.push("先运行 `node scripts/baseline-report.js`，确认 baseline/runtime 的漂移或缺失项。");
    steps.push("如果 runtime 才是预期结果，再执行 `node scripts/refresh-baseline.js`；否则回查运行期产物写入顺序。");
    return steps;
  }

  steps.push("运行 `node scripts/delivery-manifest.js`，查看完整的提交步骤、文件清单和脚本映射。");
  steps.push("先用 `node scripts/delivery-execute.js --all-required` 做 dry-run，确认执行顺序。");
  steps.push("如需把某一组正式落成可审计提交会话，使用 `node scripts/delivery-session.js --step frontend --apply --write-audit`。");
  steps.push("如需直接落盘工件，再运行 `node scripts/delivery-manifest.js --write`。");
  steps.push("按 manifest 顺序拆分前端、平台、文档、baseline 四组提交。");

  if ((report.summary.docs || []).length > 0) {
    steps.push("文档可独立成组，避免与功能代码混提。");
  }

  return steps;
}

function buildDeliveryCheckSummary(report, smokePassed, baselineReport = null, statuses = {}) {
  const baselineStatus = buildBaselineStatus(baselineReport);
  const weappAudit = statuses.weappAudit || buildDefaultWeappAuditStatus();
  const weappSmoke = statuses.weappSmoke || buildDefaultWeappSmokeStatus();
  const docsCheck = statuses.docsCheck || buildDefaultDocsCheckStatus();
  const runtimeCheck = statuses.runtimeCheck || buildDefaultRuntimeBoundaryStatus();
  const hasOtherChanges = (report.summary.other || []).length > 0;
  const readyForReview = Boolean(smokePassed)
    && !hasOtherChanges
    && baselineStatus.clean
    && weappAudit.passed
    && weappSmoke.passed
    && docsCheck.passed
    && runtimeCheck.passed;

  return {
    smokePassed: Boolean(smokePassed),
    readyForReview,
    totalChanged: report.totalChanged,
    bucketCounts: {
      source: (report.summary.source || []).length,
      docs: (report.summary.docs || []).length,
      baseline: (report.summary.baseline || []).length,
      other: (report.summary.other || []).length
    },
    baselineStatus,
    weappAudit,
    weappSmoke,
    docsCheck,
    runtimeCheck,
    commitGroups: (report.commitGroups || [])
      .filter((group) => Array.isArray(group.items) && group.items.length > 0)
      .map((group) => ({
        id: group.id,
        label: group.label,
        count: group.items.length
      })),
    warnings: buildWarnings(report, smokePassed, baselineStatus, weappAudit, weappSmoke, docsCheck, runtimeCheck),
    nextSteps: buildNextSteps(report, smokePassed, baselineStatus, weappAudit, weappSmoke, docsCheck, runtimeCheck)
  };
}

function renderDeliveryCheckText(summary) {
  const lines = [
    "广东公考小程序交付检查",
    `mvp:smoke: ${summary.smokePassed ? "passed" : "failed"}`,
    `weapp:audit: ${summary.weappAudit.available ? `${summary.weappAudit.passed ? "passed" : "failed"} (${summary.weappAudit.includedSizeKB}KB, ${summary.weappAudit.thresholdStatus})` : "missing"}`,
    `weapp:smoke: ${summary.weappSmoke.available ? `${summary.weappSmoke.passed ? "passed" : "failed"} (${summary.weappSmoke.mode})` : "missing"}`,
    `docs:check: ${summary.docsCheck.available ? `${summary.docsCheck.passed ? "passed" : "failed"} (${summary.docsCheck.failureCount})` : "missing"}`,
    `runtime:check: ${summary.runtimeCheck.available ? `${summary.runtimeCheck.passed ? "passed" : "failed"} (${summary.runtimeCheck.failureCount})` : "missing"}`,
    `readyForReview: ${summary.readyForReview ? "true" : "false"}`,
    `工作区改动: ${summary.totalChanged}`,
    `分类统计: source=${summary.bucketCounts.source}, docs=${summary.bucketCounts.docs}, baseline=${summary.bucketCounts.baseline}, other=${summary.bucketCounts.other}`,
    `baseline: synced=${summary.baselineStatus.synced}, outOfSync=${summary.baselineStatus.outOfSync}, missingBaseline=${summary.baselineStatus.missingBaseline}, missingRuntime=${summary.baselineStatus.missingRuntime}`,
    ""
  ];

  lines.push("建议提交分组");
  if (summary.commitGroups.length === 0) {
    lines.push("- 当前没有可建议的提交分组");
  } else {
    summary.commitGroups.forEach((group) => {
      lines.push(`- ${group.label}: ${group.count}`);
    });
  }
  lines.push("");

  if (summary.warnings.length > 0) {
    lines.push("提醒");
    summary.warnings.forEach((warning) => {
      lines.push(`- ${warning}`);
    });
    lines.push("");
  }

  lines.push("下一步");
  summary.nextSteps.forEach((step) => {
    lines.push(`- ${step}`);
  });

  return `${lines.join("\n")}\n`;
}

module.exports = {
  buildBaselineStatus,
  buildDefaultWeappAuditStatus,
  buildDefaultWeappSmokeStatus,
  buildDefaultDocsCheckStatus,
  buildDefaultRuntimeBoundaryStatus,
  buildDeliveryCheckSummary,
  renderDeliveryCheckText
};
