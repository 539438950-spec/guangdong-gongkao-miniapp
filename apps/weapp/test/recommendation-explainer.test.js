const test = require("node:test");
const assert = require("node:assert/strict");

const recommendationExplainer = require("../utils/recommendation-explainer");

test("recommendation explainer should describe stricter candidate requirements clearly", () => {
  const result = recommendationExplainer.decorateRecommendedPosition(
    {
      title: "综合管理岗",
      mismatchCount: 0,
      education: "本科",
      degree: "学士",
      serviceRequirement: "不限",
      freshGraduateOnly: false,
      politicalStatus: "不限",
      headcount: 2,
      noticeTrust: {
        parseQualityStatus: "healthy"
      }
    },
    {
      title: "执法岗",
      mismatchCount: 3,
      eligibilityActive: true,
      education: "研究生",
      degree: "硕士",
      serviceRequirement: "2年以上基层经历",
      freshGraduateOnly: true,
      politicalStatus: "中共党员",
      headcount: 1,
      noticeTrust: {
        parseQualityStatus: "warning"
      },
      reasons: ["学历一致", "职位类型一致"],
      mismatchReasons: ["学历要求不匹配", "政治面貌要求不匹配"],
      nextAction: {
        label: "先核对报考条件",
        detail: "重点确认学历和政治面貌要求"
      }
    }
  );

  assert.equal(result.profileHint, "对你更严格：多 3 项待确认");
  assert.ok(result.reasonSummary.includes("和综合管理岗相似"));
  assert.ok(result.reasonSummary.includes("和基准相比"));
  assert.ok(result.reasonSummary.includes("待确认"));
  assert.equal(result.nextActionSummary, "先核对报考条件 · 重点确认学历和政治面貌要求");
});

test("recommendation explainer should describe friendlier candidates clearly", () => {
  const result = recommendationExplainer.decorateRecommendedPosition(
    {
      title: "执法岗",
      mismatchCount: 3,
      education: "研究生",
      degree: "硕士",
      serviceRequirement: "2年以上基层经历",
      freshGraduateOnly: true,
      politicalStatus: "中共党员",
      headcount: 1,
      noticeTrust: {
        parseQualityStatus: "warning"
      }
    },
    {
      title: "综合管理岗",
      mismatchCount: 1,
      eligibilityActive: true,
      education: "本科",
      degree: "学士",
      serviceRequirement: "不限",
      freshGraduateOnly: false,
      politicalStatus: "不限",
      headcount: 3,
      noticeTrust: {
        parseQualityStatus: "healthy"
      },
      reasons: ["专业重合", "学历一致"]
    }
  );

  assert.equal(result.profileHint, "对你更友好：少 2 项待确认");
  assert.ok(result.reasonSummary.includes("和执法岗相似"));
  assert.ok(result.reasonSummary.includes("和基准相比"));
});
