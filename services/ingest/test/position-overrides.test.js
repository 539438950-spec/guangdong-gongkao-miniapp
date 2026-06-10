const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCorrectionSummary,
  matchesOverrideRule,
  applyPositionOverrideRules
} = require("../src/core/position-overrides");

function createPosition(overrides = {}) {
  return {
    id: overrides.id || "position-1",
    sourceId: overrides.sourceId || "rsks-gd",
    noticeId: overrides.noticeId || "notice-1",
    batchId: overrides.batchId || "batch-1",
    examType: overrides.examType || "guangdong-provincial",
    area: overrides.area || "广州",
    agency: overrides.agency || "广州市某单位",
    title: overrides.title || "综合管理岗",
    positionCode: overrides.positionCode || "10101001",
    positionType: overrides.positionType || "综合管理类",
    headcount: overrides.headcount || 1,
    educationRaw: overrides.educationRaw || "本科以上",
    educationLevel: overrides.educationLevel || "undergraduate",
    degreeRaw: overrides.degreeRaw || "学士以上",
    degreeLevel: overrides.degreeLevel || "bachelor",
    majorRaw: overrides.majorRaw || "本科:法学类",
    majorTags: overrides.majorTags || ["法学类"],
    majorCodes: overrides.majorCodes || [],
    serviceRequirement: overrides.serviceRequirement || "不限",
    freshGraduateOnly: Boolean(overrides.freshGraduateOnly),
    politicalStatus: overrides.politicalStatus || "不限",
    notes: overrides.notes || "未注明",
    examArea: overrides.examArea || "广州",
    publishedAt: overrides.publishedAt || "2025-01-07T00:00:00.000Z",
    sourceNoticeTitle: overrides.sourceNoticeTitle || "广东省2025年考试录用公务员公告",
    sourceUrl: overrides.sourceUrl || "https://rsks.gd.gov.cn/example",
    normalizedReady: overrides.normalizedReady !== false
  };
}

test("matchesOverrideRule should support source, notice and position code matching", () => {
  const position = createPosition();
  assert.equal(matchesOverrideRule(position, {
    sourceId: "rsks-gd",
    noticeId: "notice-1",
    positionCode: "10101001"
  }), true);
  assert.equal(matchesOverrideRule(position, {
    sourceId: "ggfw-hrss-gd"
  }), false);
  assert.equal(matchesOverrideRule(position, {
    titleIncludes: "综合管理"
  }), true);
});

test("buildCorrectionSummary should generate compact human-readable labels", () => {
  assert.equal(buildCorrectionSummary(["educationRaw"]), "学历要求已人工纠错");
  assert.equal(
    buildCorrectionSummary(["educationRaw", "politicalStatus", "notes"]),
    "学历要求、政治面貌等 3 项已人工纠错"
  );
});

test("applyPositionOverrideRules should correct fields and preserve traceability", () => {
  const position = createPosition({
    politicalStatus: "不限",
    notes: "需中共党员"
  });
  const result = applyPositionOverrideRules([position], [
    {
      id: "rule-1",
      sourceId: "rsks-gd",
      positionCode: "10101001",
      reason: "原表备注已明确政治面貌",
      updatedAt: "2026-06-09T12:00:00.000Z",
      updates: {
        politicalStatus: "中共党员",
        notes: "需开展一线值班"
      }
    },
    {
      id: "rule-2",
      noticeId: "notice-1",
      titleIncludes: "综合管理",
      reason: "统一专业代码格式",
      updates: {
        majorRaw: "本科:法学(B0301);本科:知识产权(B030102)"
      }
    }
  ]);

  assert.equal(result.stats.correctedPositionCount, 1);
  assert.equal(result.stats.correctedFieldCount, 3);
  assert.equal(result.stats.appliedRuleCount, 2);
  assert.deepEqual(result.stats.appliedRuleIds, ["rule-1", "rule-2"]);
  assert.equal(result.positions[0].hasManualCorrections, true);
  assert.deepEqual(
    result.positions[0].correctedFields.sort(),
    ["majorRaw", "notes", "politicalStatus"].sort()
  );
  assert.equal(result.positions[0].correctionSummary, "政治面貌、其他要求等 3 项已人工纠错");
  assert.equal(result.positions[0].politicalStatus, "中共党员");
  assert.equal(result.positions[0].notes, "需开展一线值班");
  assert.deepEqual(result.positions[0].majorCodes, ["B0301", "B030102"]);
  assert.equal(result.positions[0].correctionLog.length, 2);
  assert.equal(result.positions[0].correctionLog[0].ruleId, "rule-1");
  assert.equal(result.positions[0].correctionLog[1].ruleId, "rule-2");
});
