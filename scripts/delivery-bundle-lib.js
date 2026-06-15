const path = require("node:path");

function getBundleArtifactsRoot(outputDir) {
  return path.join(outputDir, "artifacts");
}

function buildDeliveryBundle(options = {}) {
  const checkResult = options.checkResult;
  const baselineReport = options.baselineReport;
  const stagePlan = options.stagePlan;
  const deliveryPlan = options.deliveryPlan;
  const deliveryManifest = options.deliveryManifest;
  const executionAudit = options.executionAudit;
  const executionAuditInventory = options.executionAuditInventory || null;
  const sessionAudit = options.sessionAudit;
  const sessionAuditInventory = options.sessionAuditInventory || null;
  const weappBundleAudit = options.weappBundleAudit || null;
  const weappBundleAuditInventory = options.weappBundleAuditInventory || null;
  const weappDevtoolsAudit = options.weappDevtoolsAudit || null;
  const weappDevtoolsAuditInventory = options.weappDevtoolsAuditInventory || null;
  const docsAudit = options.docsAudit || null;
  const docsAuditInventory = options.docsAuditInventory || null;
  const runtimeAudit = options.runtimeAudit || null;
  const runtimeAuditInventory = options.runtimeAuditInventory || null;
  const smokeStatus = options.smokeStatus || (checkResult.smokePassed ? "passed" : "failed");

  return {
    generatedAt: new Date().toISOString(),
    smokeStatus,
    smokePassed: checkResult.smokePassed,
    readyForReview: checkResult.summary.readyForReview,
    totalChanged: checkResult.summary.totalChanged,
    bucketCounts: checkResult.summary.bucketCounts,
    commitGroups: checkResult.summary.commitGroups,
    warnings: checkResult.summary.warnings,
    nextSteps: checkResult.summary.nextSteps,
    baselineDecision: deliveryPlan.baselineDecision,
    baselineSummary: baselineReport.summary,
    weappAudit: checkResult.summary.weappAudit || {
      available: false,
      passed: false,
      thresholdStatus: "missing",
      includedSizeKB: 0,
      ignoredSizeKB: 0
    },
    weappSmoke: checkResult.summary.weappSmoke || {
      available: false,
      passed: false,
      mode: "missing",
      message: ""
    },
    docsCheck: checkResult.summary.docsCheck || {
      available: false,
      passed: false,
      failureCount: 0
    },
    runtimeCheck: checkResult.summary.runtimeCheck || {
      available: false,
      passed: false,
      failureCount: 0
    },
    stageGroups: stagePlan.groups.map((group) => ({
      id: group.id,
      label: group.label,
      count: group.count,
      include: deliveryPlan.groups.find((item) => item.id === group.id)?.include !== false
    })),
    stepCount: deliveryPlan.steps.length,
    manifestStepCount: deliveryManifest ? deliveryManifest.steps.length : 0,
    executionAudit: executionAudit
      ? {
        present: true,
        generatedAt: executionAudit.generatedAt,
        status: executionAudit.status,
        apply: Boolean(executionAudit.apply),
        mode: executionAudit.mode || "all",
        resultCount: Array.isArray(executionAudit.results) ? executionAudit.results.length : 0,
        auditFileCount: executionAuditInventory ? Number(executionAuditInventory.fileCount || 0) : 0
      }
      : {
        present: false,
        generatedAt: "",
        status: "missing",
        apply: false,
        mode: "",
        resultCount: 0,
        auditFileCount: executionAuditInventory ? Number(executionAuditInventory.fileCount || 0) : 0
      },
    sessionAudit: sessionAudit
      ? {
        present: true,
        generatedAt: sessionAudit.generatedAt,
        status: sessionAudit.status,
        apply: Boolean(sessionAudit.apply),
        commitCount: Array.isArray(sessionAudit.commits) ? sessionAudit.commits.length : 0,
        resultCount: Array.isArray(sessionAudit.results) ? sessionAudit.results.length : 0,
        auditFileCount: sessionAuditInventory ? Number(sessionAuditInventory.fileCount || 0) : 0,
        aliasAuditCount: sessionAuditInventory ? Number(sessionAuditInventory.aliasFileCount || 0) : 0
      }
      : {
        present: false,
        generatedAt: "",
        status: "missing",
        apply: false,
        commitCount: 0,
        resultCount: 0,
        auditFileCount: sessionAuditInventory ? Number(sessionAuditInventory.fileCount || 0) : 0,
        aliasAuditCount: sessionAuditInventory ? Number(sessionAuditInventory.aliasFileCount || 0) : 0
      },
    weappBundleAuditArtifact: weappBundleAudit
      ? {
        present: true,
        generatedAt: weappBundleAudit.generatedAt || "",
        thresholdStatus: weappBundleAudit.summary ? weappBundleAudit.summary.thresholdStatus : "",
        includedSizeKB: weappBundleAudit.summary ? Number(weappBundleAudit.summary.includedSizeKB || 0) : 0,
        auditFileCount: weappBundleAuditInventory ? Number(weappBundleAuditInventory.fileCount || 0) : 0
      }
      : {
        present: false,
        generatedAt: "",
        thresholdStatus: "missing",
        includedSizeKB: 0,
        auditFileCount: weappBundleAuditInventory ? Number(weappBundleAuditInventory.fileCount || 0) : 0
      },
    weappDevtoolsAuditArtifact: weappDevtoolsAudit
      ? {
        present: true,
        generatedAt: weappDevtoolsAudit.generatedAt || "",
        mode: weappDevtoolsAudit.mode || "",
        ok: Boolean(weappDevtoolsAudit.ok),
        auditFileCount: weappDevtoolsAuditInventory ? Number(weappDevtoolsAuditInventory.fileCount || 0) : 0
      }
      : {
        present: false,
        generatedAt: "",
        mode: "missing",
        ok: false,
        auditFileCount: weappDevtoolsAuditInventory ? Number(weappDevtoolsAuditInventory.fileCount || 0) : 0
      },
    docsAuditArtifact: docsAudit
      ? {
        present: true,
        generatedAt: docsAudit.generatedAt || "",
        ok: Boolean(docsAudit.ok),
        failureCount: Array.isArray(docsAudit.failures) ? docsAudit.failures.length : 0,
        auditFileCount: docsAuditInventory ? Number(docsAuditInventory.fileCount || 0) : 0
      }
      : {
        present: false,
        generatedAt: "",
        ok: false,
        failureCount: 0,
        auditFileCount: docsAuditInventory ? Number(docsAuditInventory.fileCount || 0) : 0
      },
    runtimeAuditArtifact: runtimeAudit
      ? {
        present: true,
        generatedAt: runtimeAudit.generatedAt || "",
        ok: Boolean(runtimeAudit.ok),
        failureCount: Array.isArray(runtimeAudit.failures) ? runtimeAudit.failures.length : 0,
        auditFileCount: runtimeAuditInventory ? Number(runtimeAuditInventory.fileCount || 0) : 0
      }
      : {
        present: false,
        generatedAt: "",
        ok: false,
        failureCount: 0,
        auditFileCount: runtimeAuditInventory ? Number(runtimeAuditInventory.fileCount || 0) : 0
      }
  };
}

function buildBundleQuickstart(bundle) {
  const lines = [
    "交付总包快速入口",
    "",
    "当前状态",
    `- readyForReview: ${bundle.readyForReview ? "true" : "false"}`,
    `- weapp:audit: ${bundle.weappAudit.passed ? "passed" : "failed"} (${bundle.weappAudit.thresholdStatus})`,
    `- weapp:smoke: ${bundle.weappSmoke.passed ? "passed" : "failed"} (${bundle.weappSmoke.mode})`,
    `- docs:check: ${bundle.docsCheck.passed ? "passed" : "failed"} (${bundle.docsCheck.failureCount})`,
    `- runtime:check: ${bundle.runtimeCheck.passed ? "passed" : "failed"} (${bundle.runtimeCheck.failureCount})`,
    "",
    "入口分层",
    "- 先看 RUNBOOK.txt：完整演示、联调、交付、回退流程",
    "- 再看 QUICKSTART.txt：最短执行路径",
    "- 如需分组命令与文件边界，再看 artifacts/manifest/OPERATOR.txt 和 artifacts/manifest/README.txt",
    "",
    "最短路径",
    "- 总体交付顺序：artifacts/manifest/README.txt",
    "- 分组执行与回退：artifacts/manifest/OPERATOR.txt",
    "- 审计 dry-run 全部分组：artifacts/manifest/sequence-execute-dry-run.cmd 或 .sh",
    "- 审计 apply 全部分组：artifacts/manifest/sequence-session.cmd 或 .sh",
    "- 回退已审计提交会话：artifacts/manifest/sequence-revert.cmd 或 .sh",
    "- 原始 stage + commit 顺序：artifacts/manifest/sequence.cmd 或 .sh",
    ""
  ];

  if (bundle.warnings.length > 0) {
    lines.push("当前提醒");
    bundle.warnings.forEach((warning) => {
      lines.push(`- ${warning}`);
    });
    lines.push("");
  }

  lines.push("建议动作");
  bundle.nextSteps.forEach((step) => {
    lines.push(`- ${step}`);
  });

  return `${lines.join("\n")}\n`;
}

function buildBundleRunbook(bundle) {
  const lines = [
    "广东公考小程序交付运行手册",
    "",
    "当前交付状态",
    `- readyForReview: ${bundle.readyForReview ? "true" : "false"}`,
    `- weapp:audit: ${bundle.weappAudit.passed ? "passed" : "failed"} (${bundle.weappAudit.thresholdStatus})`,
    `- weapp:smoke: ${bundle.weappSmoke.passed ? "passed" : "failed"} (${bundle.weappSmoke.mode})`,
    `- docs:check: ${bundle.docsCheck.passed ? "passed" : "failed"} (${bundle.docsCheck.failureCount})`,
    `- runtime:check: ${bundle.runtimeCheck.passed ? "passed" : "failed"} (${bundle.runtimeCheck.failureCount})`,
    "",
    "1. 先看哪些文件",
    "- RUNBOOK.txt：完整演示、联调、交付、回退流程",
    "- QUICKSTART.txt：最短执行路径",
    "- artifacts/manifest/OPERATOR.txt：单组 dry-run / apply / revert 示例",
    "- artifacts/manifest/README.txt：完整步骤、脚本映射、文件清单入口",
    "",
    "2. 演示前准备",
    "- 启动受管控 demo：`npm run demo:serve`",
    "- 查看当前 demo 状态：`npm run demo:status`",
    "- 直接打开 demo：`npm run demo:open`",
    "- 停止 demo：`npm run demo:stop`",
    "",
    "3. 联调与交付闸门",
    "- 主链自检：`npm run mvp:smoke`",
    "- 小程序包体审计：`npm run weapp:audit`",
    "- DevTools 联调：`npm run weapp:smoke`",
    "- 整体交付检查：`node scripts/delivery-check.js`",
    "",
    "4. 交付 dry-run",
    "- 整体 dry-run：`artifacts/manifest/sequence-execute-dry-run.cmd` 或 `.sh`",
    "- 单组 dry-run 示例：见 `artifacts/manifest/OPERATOR.txt`",
    "- 如需直接走脚本：`node scripts/delivery-execute.js --all-required`",
    "",
    "5. 正式 apply / 提交会话",
    "- 整体审计 apply：`artifacts/manifest/sequence-session.cmd` 或 `.sh`",
    "- 单组审计 apply：见 `artifacts/manifest/OPERATOR.txt`",
    "- 如需直接走脚本：`node scripts/delivery-session.js --step frontend --apply --write-audit`",
    "",
    "6. 回退",
    "- 整体回退入口：`artifacts/manifest/sequence-revert.cmd` 或 `.sh`",
    "- 单组回退示例：见 `artifacts/manifest/OPERATOR.txt`",
    "- 如需直接按最新会话回退：`node scripts/delivery-revert.js --audit output/delivery-session/latest.json --apply`",
    "",
    "7. 审计与排查位置",
    "- 交付摘要：`artifacts/bundle.json`、`artifacts/check.json`、`artifacts/baseline-report.json`",
    "- 执行审计：`artifacts/execute-audit/latest.json`",
    "- 提交会话审计：`artifacts/session-audit/latest.json`",
    "- 小程序包体审计：`artifacts/weapp-bundle-audit/latest.json`",
    "- DevTools 联调审计：`artifacts/weapp-devtools-audit/latest.json`",
    "- 文档入口审计：`artifacts/docs-entrypoints-audit/latest.json`",
    "- 运行产物边界审计：`artifacts/runtime-boundaries-audit/latest.json`",
    "- 精确文件边界：`artifacts/manifest/steps/*.files.txt`",
    ""
  ];

  if (bundle.warnings.length > 0) {
    lines.push("当前提醒");
    bundle.warnings.forEach((warning) => {
      lines.push(`- ${warning}`);
    });
    lines.push("");
  }

  lines.push("建议动作");
  bundle.nextSteps.forEach((step) => {
    lines.push(`- ${step}`);
  });

  return `${lines.join("\n")}\n`;
}

function renderDeliveryBundleText(bundle) {
  const lines = [
    "广东公考小程序交付总包",
    `smoke: ${bundle.smokeStatus}`,
    `readyForReview: ${bundle.readyForReview ? "true" : "false"}`,
    `工作区改动: ${bundle.totalChanged}`,
    `baseline: ${bundle.baselineDecision.include ? "include" : "review"}`,
    `weapp:audit: ${bundle.weappAudit.passed ? "passed" : "failed"} (${bundle.weappAudit.includedSizeKB}KB, ${bundle.weappAudit.thresholdStatus})`,
    `weapp:smoke: ${bundle.weappSmoke.passed ? "passed" : "failed"} (${bundle.weappSmoke.mode})`,
    `docs:check: ${bundle.docsCheck.passed ? "passed" : "failed"} (${bundle.docsCheck.failureCount})`,
    `runtime:check: ${bundle.runtimeCheck.passed ? "passed" : "failed"} (${bundle.runtimeCheck.failureCount})`,
    ""
  ];

  lines.push("提交分组");
  bundle.stageGroups.forEach((group) => {
    lines.push(`- ${group.label}: ${group.count}${group.include ? "" : " [review]"}`);
  });
  lines.push("");

  lines.push("快速入口");
  lines.push("- 先看 RUNBOOK.txt：单页演示 / 联调 / 交付 / 回退手册");
  lines.push("- 再看 QUICKSTART.txt：最短演示 / dry-run / apply / revert 路径");
  lines.push("- 再看 artifacts/manifest/OPERATOR.txt：分组执行示例与回退路径");
  lines.push("- 最后看 artifacts/manifest/README.txt：完整交付顺序、文件清单和脚本映射");
  lines.push("");

  lines.push("执行审计");
  if (bundle.executionAudit && bundle.executionAudit.present) {
    lines.push(`- status: ${bundle.executionAudit.status}`);
    lines.push(`- apply: ${bundle.executionAudit.apply ? "true" : "false"}`);
    lines.push(`- mode: ${bundle.executionAudit.mode}`);
    lines.push(`- generatedAt: ${bundle.executionAudit.generatedAt}`);
    lines.push(`- results: ${bundle.executionAudit.resultCount}`);
    lines.push(`- files: ${bundle.executionAudit.auditFileCount}`);
  } else {
    lines.push("- missing");
  }
  lines.push("");

  lines.push("提交会话审计");
  if (bundle.sessionAudit && bundle.sessionAudit.present) {
    lines.push(`- status: ${bundle.sessionAudit.status}`);
    lines.push(`- apply: ${bundle.sessionAudit.apply ? "true" : "false"}`);
    lines.push(`- generatedAt: ${bundle.sessionAudit.generatedAt}`);
    lines.push(`- commits: ${bundle.sessionAudit.commitCount}`);
    lines.push(`- results: ${bundle.sessionAudit.resultCount}`);
    lines.push(`- files: ${bundle.sessionAudit.auditFileCount}`);
    lines.push(`- aliases: ${bundle.sessionAudit.aliasAuditCount}`);
  } else {
    lines.push("- missing");
  }
  lines.push("");

  lines.push("小程序联调审计");
  lines.push(`- bundle audit: ${bundle.weappBundleAuditArtifact.present ? `${bundle.weappBundleAuditArtifact.thresholdStatus} (${bundle.weappBundleAuditArtifact.includedSizeKB}KB)` : "missing"}`);
  lines.push(`- devtools smoke: ${bundle.weappDevtoolsAuditArtifact.present ? `${bundle.weappDevtoolsAuditArtifact.ok ? "ok" : "failed"} (${bundle.weappDevtoolsAuditArtifact.mode})` : "missing"}`);
  lines.push(`- docs entrypoints: ${bundle.docsAuditArtifact.present ? `${bundle.docsAuditArtifact.ok ? "ok" : "failed"} (${bundle.docsAuditArtifact.failureCount})` : "missing"}`);
  lines.push(`- runtime boundaries: ${bundle.runtimeAuditArtifact.present ? `${bundle.runtimeAuditArtifact.ok ? "ok" : "failed"} (${bundle.runtimeAuditArtifact.failureCount})` : "missing"}`);
  lines.push("");

  if (bundle.warnings.length > 0) {
    lines.push("提醒");
    bundle.warnings.forEach((warning) => {
      lines.push(`- ${warning}`);
    });
    lines.push("");
  }

  lines.push("下一步");
  bundle.nextSteps.forEach((step) => {
    lines.push(`- ${step}`);
  });

  return `${lines.join("\n")}\n`;
}

function shouldIncludeArtifactInBundle(artifactPath) {
  const normalized = String(artifactPath || "").replace(/\\/g, "/");
  const baseName = path.basename(normalized).toLowerCase();

  if (baseName === "active-run.lock" || baseName === "active-run.lock.json") {
    return false;
  }

  if (normalized.includes("/weapp-devtools/") && baseName === "preview-info.json") {
    return false;
  }

  return true;
}

function filterBundleArtifacts(artifacts = []) {
  return artifacts.filter((artifact) => shouldIncludeArtifactInBundle(artifact.path));
}

function buildDeliveryBundleArtifacts(options = {}) {
  const outputDir = options.outputDir || path.join("output", "delivery-bundle");
  const artifactsRoot = options.artifactsRoot || getBundleArtifactsRoot(outputDir);
  const bundle = options.bundle;
  const checkResult = options.checkResult;
  const baselineReport = options.baselineReport;
  const stageArtifacts = options.stageArtifacts || [];
  const planArtifacts = options.planArtifacts || [];
  const manifestArtifacts = options.manifestArtifacts || [];
  const executionAuditArtifacts = filterBundleArtifacts(options.executionAuditArtifacts || []);
  const sessionAuditArtifacts = filterBundleArtifacts(options.sessionAuditArtifacts || []);
  const weappBundleAuditArtifacts = filterBundleArtifacts(options.weappBundleAuditArtifacts || []);
  const weappDevtoolsAuditArtifacts = filterBundleArtifacts(options.weappDevtoolsAuditArtifacts || []);
  const docsAuditArtifacts = filterBundleArtifacts(options.docsAuditArtifacts || []);
  const runtimeAuditArtifacts = filterBundleArtifacts(options.runtimeAuditArtifacts || []);

  const artifacts = [
    {
      path: path.join(artifactsRoot, "bundle.json"),
      content: `${JSON.stringify(bundle, null, 2)}\n`
    },
    {
      path: path.join(outputDir, "README.txt"),
      content: renderDeliveryBundleText(bundle)
    },
    {
      path: path.join(outputDir, "RUNBOOK.txt"),
      content: buildBundleRunbook(bundle)
    },
    {
      path: path.join(outputDir, "QUICKSTART.txt"),
      content: buildBundleQuickstart(bundle)
    },
    {
      path: path.join(artifactsRoot, "check.json"),
      content: `${JSON.stringify(checkResult, null, 2)}\n`
    },
    {
      path: path.join(artifactsRoot, "baseline-report.json"),
      content: `${JSON.stringify(baselineReport, null, 2)}\n`
    }
  ];

  stageArtifacts.forEach((artifact) => {
    artifacts.push({
      path: path.join(artifactsRoot, "stage", path.basename(artifact.path)),
      content: artifact.content
    });
  });

  planArtifacts.forEach((artifact) => {
    artifacts.push({
      path: path.join(artifactsRoot, "plan", path.basename(artifact.path)),
      content: artifact.content
    });
  });

  manifestArtifacts.forEach((artifact) => {
    const normalizedPath = artifact.path.replace(/\\/g, "/");
    const prefix = normalizedPath.includes("/steps/") ? "artifacts/manifest/steps" : "artifacts/manifest";
    artifacts.push({
      path: path.join(outputDir, prefix, path.basename(artifact.path)),
      content: artifact.content
    });
  });

  executionAuditArtifacts.forEach((artifact) => {
    artifacts.push({
      path: path.join(artifactsRoot, "execute-audit", path.basename(artifact.path)),
      content: artifact.content
    });
  });

  sessionAuditArtifacts.forEach((artifact) => {
    artifacts.push({
      path: path.join(artifactsRoot, "session-audit", path.basename(artifact.path)),
      content: artifact.content
    });
  });

  weappBundleAuditArtifacts.forEach((artifact) => {
    artifacts.push({
      path: path.join(artifactsRoot, "weapp-bundle-audit", path.basename(artifact.path)),
      content: artifact.content
    });
  });

  weappDevtoolsAuditArtifacts.forEach((artifact) => {
    artifacts.push({
      path: path.join(artifactsRoot, "weapp-devtools-audit", path.basename(artifact.path)),
      content: artifact.content
    });
  });

  docsAuditArtifacts.forEach((artifact) => {
    artifacts.push({
      path: path.join(artifactsRoot, "docs-entrypoints-audit", path.basename(artifact.path)),
      content: artifact.content
    });
  });

  runtimeAuditArtifacts.forEach((artifact) => {
    artifacts.push({
      path: path.join(artifactsRoot, "runtime-boundaries-audit", path.basename(artifact.path)),
      content: artifact.content
    });
  });

  return artifacts;
}

function renderWrittenBundleArtifactsText(artifacts = [], outputDir = "") {
  const lines = [
    "广东公考小程序交付总包工件",
    outputDir ? `输出目录: ${outputDir}` : "",
    ""
  ].filter(Boolean);

  artifacts.forEach((artifact) => {
    lines.push(`- ${artifact.path}`);
  });

  return `${lines.join("\n")}\n`;
}

module.exports = {
  getBundleArtifactsRoot,
  buildDeliveryBundle,
  buildBundleQuickstart,
  buildBundleRunbook,
  renderDeliveryBundleText,
  shouldIncludeArtifactInBundle,
  filterBundleArtifacts,
  buildDeliveryBundleArtifacts,
  renderWrittenBundleArtifactsText
};
