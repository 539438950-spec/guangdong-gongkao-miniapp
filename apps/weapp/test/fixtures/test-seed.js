const fs = require("node:fs");

function createMiniappTestSeed() {
  return {
    updatedAt: "2026-06-09T12:00:00.000Z",
    notices: [
      {
        id: "rsks-gd|notice-2026",
        sourceId: "rsks-gd",
        examType: "guangdong-provincial",
        title: "广东省2026年考试录用公务员公告",
        area: "广东",
        source: "广东省人事考试网",
        sourceMode: "official",
        publishedAt: "2026-01-05",
        registrationWindow: "2026-01-10 至 2026-01-16",
        writtenExamAt: "2026-03-15",
        hasStructuredPositions: true,
        positionCount: 5
      },
      {
        id: "ggfw-hrss-gd|notice-2026",
        sourceId: "ggfw-hrss-gd",
        examType: "guangdong-provincial",
        title: "广东省2026年考试录用公务员资格审核公告",
        area: "广东",
        source: "广东省公务员考试录用管理系统",
        sourceMode: "official",
        publishedAt: "2026-03-01",
        registrationWindow: "待官方补充",
        writtenExamAt: "待官方补充",
        hasStructuredPositions: false,
        positionCount: 0
      },
      {
        id: "national-bm|notice-2026",
        sourceId: "national-bm",
        examType: "national",
        title: "2026年度国家公务员考试公告",
        area: "全国",
        source: "国家公务员局专题",
        sourceMode: "demo",
        sourceModeLabel: "演示",
        sourceModeNote: "当前环境无法稳定直连国考专题站点，暂用演示数据占位。",
        publishedAt: "2026-10-14",
        registrationWindow: "2026-10-15 08:00 至 2026-10-24 18:00",
        writtenExamAt: "2026-11-29",
        hasStructuredPositions: true,
        positionCount: 1
      }
    ],
    positions: [
      {
        id: "rsks-gd|notice-2026:position-1",
        noticeId: "rsks-gd|notice-2026",
        batchId: "rsks-gd|notice-2026:batch-1",
        examType: "guangdong-provincial",
        agency: "广州市某单位",
        title: "综合管理岗",
        positionCode: "440100001",
        positionType: "综合管理类",
        headcount: 2,
        area: "广州",
        education: "本科",
        degree: "学士",
        major: "法学",
        majorCodes: ["A030101"],
        serviceRequirement: "不限",
        freshGraduateOnly: false,
        politicalStatus: "不限",
        notes: "未注明",
        sourceNoticeTitle: "广东省2026年考试录用公务员公告"
      },
      {
        id: "rsks-gd|notice-2026:position-2",
        noticeId: "rsks-gd|notice-2026",
        batchId: "rsks-gd|notice-2026:batch-1",
        examType: "guangdong-provincial",
        agency: "广州市某单位",
        title: "法治研究岗",
        positionCode: "440100002",
        positionType: "综合管理类",
        headcount: 1,
        area: "广州",
        education: "本科",
        degree: "学士",
        major: "法学",
        majorCodes: ["A030101"],
        serviceRequirement: "不限",
        freshGraduateOnly: false,
        politicalStatus: "不限",
        notes: "未注明",
        sourceNoticeTitle: "广东省2026年考试录用公务员公告"
      },
      {
        id: "rsks-gd|notice-2026:position-3",
        noticeId: "rsks-gd|notice-2026",
        batchId: "rsks-gd|notice-2026:batch-1",
        examType: "guangdong-provincial",
        agency: "深圳市某单位",
        title: "执法岗",
        positionCode: "440300003",
        positionType: "行政执法类",
        headcount: 1,
        area: "深圳",
        education: "硕士",
        degree: "硕士",
        major: "公安学",
        majorCodes: ["A030611"],
        serviceRequirement: "2年基层经历",
        freshGraduateOnly: true,
        politicalStatus: "中共党员",
        notes: "需通过体能测试",
        sourceNoticeTitle: "广东省2026年考试录用公务员公告"
      },
      {
        id: "rsks-gd|notice-2026:position-4",
        noticeId: "rsks-gd|notice-2026",
        batchId: "rsks-gd|notice-2026:batch-1",
        examType: "guangdong-provincial",
        agency: "佛山市某单位",
        title: "综合文字岗",
        positionCode: "440600004",
        positionType: "综合管理类",
        headcount: 3,
        area: "佛山",
        education: "本科",
        degree: "学士",
        major: "汉语言文学",
        majorCodes: ["A050101"],
        serviceRequirement: "不限",
        freshGraduateOnly: false,
        politicalStatus: "不限",
        notes: "未注明",
        sourceNoticeTitle: "广东省2026年考试录用公务员公告"
      },
      {
        id: "rsks-gd|notice-2026:position-5",
        noticeId: "rsks-gd|notice-2026",
        batchId: "rsks-gd|notice-2026:batch-1",
        examType: "guangdong-provincial",
        agency: "东莞市某单位",
        title: "基层治理岗",
        positionCode: "441900005",
        positionType: "综合管理类",
        headcount: 1,
        area: "东莞",
        education: "本科",
        degree: "学士",
        major: "行政管理",
        majorCodes: ["A120402"],
        serviceRequirement: "1年基层经历",
        freshGraduateOnly: false,
        politicalStatus: "不限",
        notes: "有基层走访任务",
        sourceNoticeTitle: "广东省2026年考试录用公务员公告"
      },
      {
        id: "national-bm|notice-2026:position-1",
        noticeId: "national-bm|notice-2026",
        batchId: "national-bm|notice-2026:batch-1",
        examType: "national",
        agency: "广州海关",
        title: "综合业务一级主任科员以下",
        positionCode: "130110001",
        positionType: "综合管理类",
        headcount: 1,
        area: "广州",
        education: "本科",
        degree: "学士",
        major: "法学",
        majorCodes: ["A030101"],
        serviceRequirement: "不限",
        freshGraduateOnly: false,
        politicalStatus: "不限",
        notes: "未注明",
        sourceNoticeTitle: "2026年度国家公务员考试公告"
      }
    ],
    sourceStates: [
      {
        sourceId: "rsks-gd",
        sourceName: "广东人事考试网",
        examType: "guangdong-provincial",
        sourceMode: "official",
        sourceModeLabel: "官方",
        lastRunStatus: "published",
        lastPublishedAt: "2026-06-09T10:30:00.000Z",
        parseQualityStatus: "healthy",
        parseQualitySummary: "岗位表结构化成功",
        pendingReviewCount: 1,
        candidateWorkbookCount: 1,
        extractedWorkbookCount: 1,
        fieldCoveragePercent: 94,
        scheduleMinutes: 30,
        publishSlaMinutes: 60
      },
      {
        sourceId: "ggfw-hrss-gd",
        sourceName: "广东省公务员考试录用管理系统",
        examType: "guangdong-provincial",
        sourceMode: "official",
        sourceModeLabel: "官方",
        lastRunStatus: "published",
        lastPublishedAt: "2026-06-09T10:35:00.000Z",
        parseQualityStatus: "attachment-only",
        parseQualitySummary: "当前仅完成公告/附件解析",
        pendingReviewCount: 0,
        candidateWorkbookCount: 0,
        extractedWorkbookCount: 0,
        scheduleMinutes: 30,
        publishSlaMinutes: 60
      },
      {
        sourceId: "national-bm",
        sourceName: "国家公务员局专题",
        examType: "national",
        sourceMode: "demo",
        sourceModeLabel: "演示",
        sourceModeNote: "当前环境无法稳定直连国考专题站点，暂用演示数据占位。",
        lastRunStatus: "published",
        lastPublishedAt: "2026-06-09T10:40:00.000Z",
        parseQualityStatus: "warning",
        parseQualitySummary: "当前为演示岗位数据",
        pendingReviewCount: 0,
        scheduleMinutes: 30,
        publishSlaMinutes: 60
      }
    ],
    reviewQueue: [
      {
        id: "review-rsks-1",
        sourceId: "rsks-gd",
        sourceName: "广东人事考试网",
        reason: ["字段覆盖率需抽样复核"],
        reasons: ["字段覆盖率需抽样复核"],
        parseStatus: "healthy",
        hasRawPayload: true,
        hasParsedPayload: true,
        fieldCoveragePercent: 94,
        createdAt: "2026-06-09T10:31:00.000Z"
      }
    ],
    resolvedReviewQueue: [],
    alertEvents: [
      {
        id: "alert-review-rsks-1",
        sourceId: "rsks-gd",
        sourceName: "广东人事考试网",
        type: "review-queued",
        severity: "medium",
        createdAt: "2026-06-09T10:32:00.000Z",
        updatedAt: "2026-06-09T10:32:00.000Z",
        summary: "广东人事考试网 有待复核记录",
        details: "当前待复核 1 条。",
        status: "active",
        closedAt: ""
      }
    ],
    compareGroups: [
      {
        id: "seed-compare-group-1",
        name: "省考主对比",
        examType: "guangdong-provincial",
        positionIds: ["rsks-gd|notice-2026:position-1"],
        viewPreferences: {
          sortMode: "manual",
          rowFocusMode: "all"
        },
        originContext: null,
        lastActionContext: null,
        isPinned: true,
        pinnedAt: "2026-06-09T09:00:00.000Z",
        lastUsedAt: "2026-06-09T10:00:00.000Z"
      }
    ]
  };
}

function installTestSeed(store, seedVersion = "miniapp-test-seed") {
  store.__setSeedSnapshotLoaderForTests(() => ({
    seedVersion,
    seed: createMiniappTestSeed()
  }));
  store.__hydrateUserStateForServer({});
}

function writeSeedModule(filePath, seed = createMiniappTestSeed()) {
  fs.writeFileSync(filePath, `module.exports = ${JSON.stringify(seed, null, 2)};\n`, "utf8");
}

module.exports = {
  createMiniappTestSeed,
  installTestSeed,
  writeSeedModule
};
