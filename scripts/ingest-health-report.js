#!/usr/bin/env node

const path = require("node:path");

const { FileStore } = require("../services/ingest/src/storage/file-store");
const { buildIngestHealthReport } = require("../services/ingest/src/health-report");

function parseArgs(argv) {
  const result = {
    json: false,
    sourceId: "",
    auditLimit: 5,
    storeRoot: path.resolve(__dirname, "../services/ingest/var")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      result.json = true;
      continue;
    }
    if (token === "--source") {
      result.sourceId = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (token === "--audit-limit") {
      result.auditLimit = Number(argv[index + 1] || result.auditLimit);
      index += 1;
      continue;
    }
    if (token === "--store-root") {
      result.storeRoot = path.resolve(String(argv[index + 1] || result.storeRoot));
      index += 1;
    }
  }

  return result;
}

function formatRiskFlags(flags) {
  return flags.length ? flags.join(", ") : "none";
}

function printTextReport(report) {
  console.log("广东公考采集健康报告");
  console.log(`生成时间: ${report.generatedAt}`);
  console.log(`来源总数: ${report.summary.total} | 风险来源: ${report.summary.risky}`);
  console.log(`状态分布: ${Object.entries(report.summary.byReadiness).map(([key, value]) => `${key}=${value}`).join(" | ") || "none"}`);
  console.log("");

  for (const source of report.sources) {
    console.log(`[${source.readiness.status}] ${source.sourceName} (${source.sourceId})`);
    console.log(`  模式: ${source.sourceModeLabel} | 发布: ${source.releaseMode} | SLA: ${source.slaStatus} | 解析: ${source.parseQualityStatus}`);
    console.log(`  最近抓取: ${source.lastFetchedAt || "-"} | 最近发布: ${source.lastPublishedAt || "-"}`);
    console.log(`  复核: 总 ${source.pendingReviewCount} / 阻塞 ${source.blockingPendingReviewCount || 0} / 历史 ${source.stalePendingReviewCount || 0} | 连续失败: ${source.consecutiveFailureCount} | 字段覆盖: ${source.fieldCoveragePercent || 0}% | 岗位数: ${source.workbookRowCount || 0}`);
    console.log(`  风险: ${formatRiskFlags(source.riskFlags)}`);
    console.log(`  判断: ${source.readiness.label}`);
    console.log(`  建议: ${source.nextAction}`);
    if (source.staleReviewIds && source.staleReviewIds.length) {
      console.log(`  历史复核ID: ${source.staleReviewIds.join(", ")}`);
    }
    console.log("");
  }

  if (report.recentAudits.length > 0) {
    console.log("最近发布审计:");
    for (const audit of report.recentAudits) {
      console.log(`- ${audit.createdAt} | ${audit.sourceId} | ${audit.eventType} | ${audit.summary}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const store = new FileStore(args.storeRoot);
  const report = buildIngestHealthReport(store, {
    sourceId: args.sourceId,
    auditLimit: args.auditLimit
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printTextReport(report);
}

main();
