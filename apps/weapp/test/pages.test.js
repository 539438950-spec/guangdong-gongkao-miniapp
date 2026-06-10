const test = require("node:test");
const assert = require("node:assert/strict");

const api = require("../utils/api");

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadPageDefinition(modulePath) {
  let definition = null;
  const resolvedPath = require.resolve(modulePath);
  delete require.cache[resolvedPath];
  const previousPage = global.Page;
  global.Page = (config) => {
    definition = config;
  };

  try {
    require(modulePath);
  } finally {
    global.Page = previousPage;
  }

  return definition;
}

function createPageInstance(definition) {
  const page = {
    data: clone(definition.data || {}),
    setData(patch) {
      this.data = {
        ...this.data,
        ...patch
      };
    }
  };

  Object.keys(definition).forEach((key) => {
    if (key !== "data") {
      page[key] = definition[key];
    }
  });

  return page;
}

function buildNoticeFixtures() {
  return [
    {
      id: "rsks-gd|notice-1",
      title: "广东省2026年考试录用公务员公告",
      area: "广东",
      examType: "guangdong-provincial",
      source: "广东省人事考试网",
      sourceMode: "official",
      publishedAt: "2026-06-09",
      registrationWindow: "2026-06-10 至 2026-06-16",
      hasStructuredPositions: true,
      mergedSourceCount: 2,
      positionNoticeId: "rsks-gd|notice-1",
      positionSourceName: "rsks-gd",
      mergedSources: [
        {
          noticeId: "rsks-gd|notice-1",
          sourceId: "rsks-gd",
          sourceName: "rsks-gd",
          publishedAt: "2026-06-09",
          hasStructuredPositions: true,
          positionCount: 2
        },
        {
          noticeId: "ggfw-hrss-gd|notice-1-shadow",
          sourceId: "ggfw-hrss-gd",
          sourceName: "ggfw-hrss-gd",
          publishedAt: "2026-06-09",
          hasStructuredPositions: false,
          positionCount: 0
        }
      ],
      summary: "广东省考公告摘要",
      noticeStageId: "main",
      noticeStageLabel: "主公告",
      noticeBatch: {
        key: "guangdong-provincial:2026",
        year: "2026",
        examType: "guangdong-provincial",
        label: "2026年广东批次"
      },
      noticeTimelineCount: 2,
      relatedNoticeCount: 1,
      followingNoticeCount: 1,
      followingStageLabels: ["资格审核"],
      noticeProgressHint: "本批后续 1 条",
      noticeProgressDetail: "后续节点：资格审核",
      noticeCompareCandidateIds: ["position-1", "position-2"],
      noticeCompareSuggestion: {
        mode: "reuse",
        ready: true,
        hint: "可直接把当前公告岗位补入对比方案：广东岗位方案",
        actionLabel: "带入 2 个岗位对比",
        groupId: "group-1",
        groupName: "广东岗位方案",
        nextCount: 1,
        candidateCount: 2,
        compatibleGroupCount: 1,
        totalPositionCount: 2
      }
    },
    {
      id: "ggfw-hrss-gd|notice-3",
      title: "广东省2026年考试录用公务员资格审核公告",
      area: "广东",
      examType: "guangdong-provincial",
      source: "广东人社",
      sourceMode: "official",
      publishedAt: "2026-06-20",
      registrationWindow: "待官方补充",
      hasStructuredPositions: false,
      summary: "资格审核公告摘要",
      noticeStageId: "qualification-review",
      noticeStageLabel: "资格审核",
      noticeBatch: {
        key: "guangdong-provincial:2026",
        year: "2026",
        examType: "guangdong-provincial",
        label: "2026年广东批次"
      },
      noticeTimelineCount: 2,
      relatedNoticeCount: 1,
      followingNoticeCount: 0,
      followingStageLabels: [],
      noticeProgressHint: "本批已识别 2 条公告",
      noticeProgressDetail: "当前位于已识别公告链的最新节点",
      noticeCompareCandidateIds: [],
      noticeCompareSuggestion: {
        mode: "",
        ready: false,
        hint: "",
        actionLabel: "",
        groupId: "",
        groupName: "",
        nextCount: 0,
        candidateCount: 0,
        compatibleGroupCount: 0,
        totalPositionCount: 0
      }
    },
    {
      id: "national-bm|notice-2",
      title: "国考公告",
      area: "全国",
      examType: "national",
      source: "国家公务员局",
      sourceMode: "demo",
      sourceModeLabel: "演示",
      publishedAt: "2026-05-01",
      registrationWindow: "2026-10-15 至 2026-10-24",
      hasStructuredPositions: false,
      summary: "国考公告摘要",
      noticeStageId: "general",
      noticeStageLabel: "公告",
      noticeBatch: {
        key: "national:2026",
        year: "2026",
        examType: "national",
        label: "2026年全国批次"
      },
      noticeTimelineCount: 1,
      relatedNoticeCount: 0,
      followingNoticeCount: 0,
      followingStageLabels: [],
      noticeProgressHint: "当前批次仅识别 1 条公告",
      noticeProgressDetail: "后续节点会在官方发布后持续补齐",
      sourceModeNote: "示例数据",
      noticeCompareCandidateIds: [],
      noticeCompareSuggestion: {
        mode: "",
        ready: false,
        hint: "",
        actionLabel: "",
        groupId: "",
        groupName: "",
        nextCount: 0,
        candidateCount: 0,
        compatibleGroupCount: 0,
        totalPositionCount: 0
      }
    }
  ];
}

function buildDashboardPayload() {
  const notices = buildNoticeFixtures();
  return {
    sourceStates: [
      {
        sourceId: "rsks-gd",
        sourceName: "广东省人事考试网",
        examType: "guangdong-provincial",
        sourceMode: "official",
        sourceModeLabel: "官方",
        lastRunStatus: "published",
        slaStatus: "healthy",
        scheduleMinutes: 30,
        publishSlaMinutes: 60,
        lastSuccessfulFetchedAt: "2026-06-09T09:50:00.000Z",
        candidateVersionId: "rsks-gd@2026-06-09T09:50:00.000Z",
        candidateVersionLabel: "2026-06-09 09:50 候选版本",
        candidateVersionCreatedAt: "2026-06-09T09:50:00.000Z",
        stableVersionId: "rsks-gd@2026-06-09T09:35:00.000Z",
        stableVersionLabel: "2026-06-09 09:35 稳定快照",
        stableVersionUpdatedAt: "2026-06-09T09:35:00.000Z",
        pendingReviewCount: 1,
        consecutiveFailureCount: 0,
        fetchOverdue: false,
        publishOverdue: false,
        releaseOverrideActive: true,
        releaseOverrideMode: "notice-only",
        releaseOverrideApplied: true,
        releaseOverrideReason: "运营手动锁定为仅公告模式",
        releaseOverrideUpdatedAt: "2026-06-09T11:30:00.000Z",
        parseQualityStatus: "warning",
        parseQualitySummary: "字段命中 11/17，覆盖率 65%",
        gateFailureReason: "字段命中率不足，岗位表继续走人工复核，前台先保留公告模式。",
        gateChecks: [
          {
            id: "coverage-check",
            label: "关键字段覆盖率",
            status: "fail",
            detail: "字段命中 11/17，覆盖率 65%"
          },
          {
            id: "workbook-check",
            label: "岗位表工作表识别",
            status: "pass",
            detail: "已识别 2 个工作表"
          }
        ],
        fieldCoveragePercent: 65,
        workbookSheetCount: 2,
        workbookSheetSummary: "县级机关 12 行 11 列；公安系统 8 行 10 列",
        candidateWorkbookCount: 1,
        extractedWorkbookCount: 1,
        lastRowsTotal: 20,
        nextAction: {
          focus: "parse",
          label: "鍏堜慨姝ｅ矖浣嶈〃瑙ｆ瀽",
          detail: "鍏抽敭瀛楁瑕嗙洊鐜?· 瀛楁鍛戒腑 11/17锛岃鐩栫巼 65%"
        }
      }
    ],
    publishAudits: [
      {
        id: "audit-1",
        sourceId: "rsks-gd",
        sourceName: "广东省人事考试网",
        eventType: "release-override",
        createdAt: "2026-06-09T11:30:00.000Z",
        summary: "Locked source to notice-only mode",
        detail: "reason=manual lock | stable=2026-06-09 09:35 绋冲畾蹇収",
        releaseMode: "notice-only",
        releaseOverrideMode: "notice-only",
        reason: "manual lock",
        candidateVersionId: "rsks-gd@2026-06-09T09:50:00.000Z",
        candidateVersionLabel: "2026-06-09 09:50 候选版本",
        stableVersionId: "rsks-gd@2026-06-09T09:35:00.000Z",
        stableVersionLabel: "2026-06-09 09:35 稳定快照"
      }
    ],
    alertEvents: [],
    reviewQueue: [
      {
        id: "review-1",
        sourceId: "rsks-gd",
        sourceName: "广东省人事考试网",
        createdAt: "2026-06-09T10:00:00.000Z",
        reasons: ["字段映射失败"],
        hasParsedPayload: true,
        hasRawPayload: true,
        candidateVersionId: "rsks-gd@2026-06-09T09:50:00.000Z",
        candidateVersionLabel: "2026-06-09 09:50 候选版本",
        rollbackToVersionId: "rsks-gd@2026-06-09T09:35:00.000Z",
        rollbackToVersionLabel: "2026-06-09 09:35 稳定快照",
        gateChecks: [
          {
            id: "coverage-check",
            label: "关键字段覆盖率",
            status: "fail",
            detail: "字段命中 11/17，覆盖率 65%"
          },
          {
            id: "dedupe-check",
            label: "公告去重校验",
            status: "pass",
            detail: "主公告未重复"
          }
        ],
        noticeTitle: "广东省 2026 年考试录用公务员公告",
        parseStatus: "parsed",
        fieldCoveragePercent: 65,
        rowsTotal: 20,
        workbookSheetSummary: "县级机关 12 行 11 列；公安系统 8 行 10 列",
        detailLines: [
          "公告：广东省 2026 年考试录用公务员公告",
          "解析状态：parsed",
          "字段覆盖率：65%"
        ]
      }
    ],
    resolvedReviewQueue: [
      {
        id: "review-2",
        sourceId: "rsks-gd",
        sourceName: "广东省人事考试网",
        resolvedAt: "2026-06-09T11:00:00.000Z",
        reasons: ["下载失败"],
        resolutionNote: "已人工确认",
        hasParsedPayload: true,
        hasRawPayload: false,
        candidateVersionId: "rsks-gd@2026-06-09T10:10:00.000Z",
        candidateVersionLabel: "2026-06-09 10:10 候选版本",
        rollbackToVersionId: "rsks-gd@2026-06-09T09:35:00.000Z",
        rollbackToVersionLabel: "2026-06-09 09:35 稳定快照",
        gateChecks: [
          {
            id: "download-check",
            label: "附件下载完整性",
            status: "fail",
            detail: "下载失败"
          }
        ],
        noticeTitle: "广东省 2026 年考试录用公务员公告",
        parseStatus: "attachment-only",
        fieldCoveragePercent: 0,
        workbookSheetSummary: ""
      }
    ],
    stats: {
      sourceCount: 1,
      sourceAlertCount: 1,
      overdueSourceCount: 0,
      pendingReviewTotal: 1,
      resolvedReviewTotal: 1,
      alertEventCount: 0,
      favoriteCount: 2,
      subscriptionCount: 1,
      compareGroupCount: 2,
      compareGroupLimit: 20,
      compareGroupCapacityLimit: 4,
      pinnedCompareGroupCount: 0,
      fullCompareGroupCount: 0,
      emptyCompareGroupCount: 0,
      reusableCompareGroupCount: 2,
      activeCompareGroupCount: 2,
      remainingCompareGroupCount: 18,
      reviewNeededCompareGroupCount: 0,
      unreadMessageCount: 3,
      subscriptionNewHitCount: 1
    },
    sourceSummary: {
      sourceCount: 1,
      sourceAlertCount: 1,
      overdueSourceCount: 0,
      pendingReviewTotal: 1,
      alertEventCount: 0,
      parseIssueCount: 1,
      publishableCount: 0,
      restrictedCount: 1,
      gateBlockedCount: 1,
      rollbackCount: 0,
      gateFailureTypeSummary: [
        {
          label: "鍏抽敭瀛楁瑕嗙洊",
          count: 1
        }
      ]
    },
    reviewSummary: {
      total: 1,
      resolved: 1,
      highPriority: 0,
      blockingRelease: 1,
      failedCheckTypeSummary: [
        {
          label: "鍏抽敭瀛楁瑕嗙洊",
          count: 1
        }
      ]
    },
    notices,
    compareGroups: [
      {
        id: "group-1",
        name: "深圳方案",
        examType: "guangdong-provincial",
        positionIds: ["p1", "p2"],
        compareSummary: {
          active: true,
          positionCount: 2,
          matchedCount: 1,
          blockedCount: 1,
          cautionCount: 1,
          barrierCountTotal: 6,
          topTitle: "综合管理岗",
          topAgency: "广州市某单位",
          topLabel: "机会优先",
          topScoreLabel: "74 分",
          topReason: "基层经历限制较少",
          bestFitTitle: "综合管理岗",
          bestFitLabel: "当前最匹配",
          bestFitReason: "基层经历限制较少"
        },
        originContext: {
          sourceType: "subscription",
          sourceLabel: "订阅命中",
          sourceEntry: "messages",
          sourceName: "珠三角订阅",
          action: "create",
          actedAt: "2026-06-09T09:00:00.000Z"
        },
        lastActionContext: {
          sourceType: "positions",
          sourceLabel: "岗位列表",
          sourceEntry: "positions",
          sourceName: "广东岗位",
          action: "reuse",
          actedAt: "2026-06-09T10:30:00.000Z"
        }
      },
      {
        id: "group-2",
        name: "国考方案",
        examType: "national",
        positionIds: ["p3"],
        compareSummary: {
          active: true,
          positionCount: 1,
          matchedCount: 0,
          blockedCount: 1,
          cautionCount: 1,
          barrierCountTotal: 4,
          topTitle: "执法岗",
          topAgency: "国家某单位",
          topLabel: "条件较严",
          topScoreLabel: "46 分",
          topReason: "仅限应届",
          bestFitTitle: "执法岗",
          bestFitLabel: "2 项待确认",
          bestFitReason: "学历要求不匹配"
        },
        originContext: {
          sourceType: "positions",
          sourceLabel: "岗位列表",
          sourceEntry: "positions",
          sourceName: "国考岗位",
          action: "create",
          actedAt: "2026-06-08T09:00:00.000Z"
        },
        lastActionContext: {
          sourceType: "positions",
          sourceLabel: "岗位列表",
          sourceEntry: "positions",
          sourceName: "国考岗位",
          action: "reuse",
          actedAt: "2026-06-08T09:30:00.000Z"
        }
      }
    ],
    savedFilters: [
      {
        id: "filter-1",
        name: "应届本科",
        summary: "本科 · 应届",
        currentMatchCount: 4,
        currentPositionIds: ["position-1", "position-2"],
        currentPositionPreview: [
          {
            id: "position-1",
            title: "综合管理岗",
            area: "广州",
            agency: "广州市某单位"
          }
        ],
        noticeId: "rsks-gd|notice-1"
      }
    ],
    subscriptions: [
      {
        id: "sub-1",
        name: "珠三角",
        summary: "广州深圳",
        currentMatchCount: 5,
        newMatchCount: 1,
        decisionSummary: "新增 1 个岗位 · 可报 1 个 · 待确认 0 个",
        bestMatchSummary: "综合管理岗 · 当前最匹配 · 专业名称命中:法学",
        nextActionSummary: "综合管理岗 · 可优先保留：当前没有明显硬门槛冲突，可继续保留。",
        compareSuggestion: {
          mode: "reuse",
          ready: true,
          hint: "可直接放入对比方案：广东岗位方案",
          actionLabel: "直接对比新增命中",
          groupId: "group-1",
          groupName: "广东岗位方案",
          nextCount: 1,
          candidateCount: 1,
          compatibleGroupCount: 1
        },
        compareHint: "可直接放入对比方案：广东岗位方案",
        compareReady: true,
        compareActionLabel: "直接对比新增命中",
        noticeId: "rsks-gd|notice-1",
        newPositionPreview: [
          {
            id: "position-1",
            title: "综合管理岗",
            area: "广州",
            agency: "广州市某单位"
          }
        ]
      }
    ],
    personalProfile: {
      education: "本科",
      degree: "学士",
      majorKeywords: "法学",
      politicalStatus: "",
      serviceExperience: "none",
      freshGraduateStatus: "non-fresh"
    },
    favoriteNotices: [
      { id: "rsks-gd|notice-1", title: "广东省2026年考试录用公务员公告", area: "广东", publishedAt: "2026-06-09" }
    ],
    browsingHistory: [
      { id: "history-1", title: "广东省2026年考试录用公务员公告", type: "notice", noticeId: "rsks-gd|notice-1" }
    ],
    messages: [
      {
        id: "msg-0",
        type: "favorite-progress",
        typeLabel: "收藏追踪",
        title: "收藏公告已进入资格审核",
        summary: "广东省2026年考试录用公务员公告 · 新增节点：广东省2026年考试录用公务员资格审核公告",
        actionLabel: "查看后续公告",
        noticeId: "ggfw-hrss-gd|notice-3",
        favoriteNoticeId: "rsks-gd|notice-1",
        read: false
      },
      {
        id: "msg-1",
        type: "subscription",
        typeLabel: "订阅提醒",
        title: "珠三角新增岗位",
        summary: "新增 1 个岗位 · 可报 1 个 · 待确认 0 个",
        actionLabel: "查看命中岗位",
        noticeId: "rsks-gd|notice-1",
        subscriptionId: "sub-1",
        newPositionPreview: [
          {
            id: "position-1",
            title: "综合管理岗",
            area: "广州",
            agency: "广州市某单位"
          }
        ],
        compareSuggestion: {
          mode: "reuse",
          ready: true,
          hint: "可直接放入对比方案：广东岗位方案",
          actionLabel: "直接对比新增命中",
          groupId: "group-1",
          groupName: "广东岗位方案",
          nextCount: 1,
          candidateCount: 1,
          compatibleGroupCount: 1
        },
        bestMatchSummary: "综合管理岗 · 当前最匹配 · 专业名称命中:法学",
        nextActionSummary: "综合管理岗 · 可优先保留：当前没有明显硬门槛冲突，可继续保留。",
        compareHint: "可直接放入对比方案：广东岗位方案",
        compareReady: true,
        compareActionLabel: "直接对比新增命中",
        read: false
      },
      {
        id: "msg-2",
        type: "source-alert",
        typeLabel: "数据告警",
        title: "结构化需关注",
        summary: "字段覆盖率偏低",
        actionLabel: "查看状态",
        pageUrl: "/pages/source-status/index?sourceId=rsks-gd&focus=parse",
        read: false
      }
    ]
  };
}

function patchApiForPageTest() {
  const original = {
    getDashboard: api.getDashboard,
    getRuntimeConfig: api.getRuntimeConfig,
    getConnectionSummary: api.getConnectionSummary,
    getConnectionDiagnostics: api.getConnectionDiagnostics,
    listConnectionPresets: api.listConnectionPresets,
    toggleFavoriteNotice: api.toggleFavoriteNotice,
    resolveReviewItem: api.resolveReviewItem,
    reopenReviewItem: api.reopenReviewItem,
    resolveStaleReviewItems: api.resolveStaleReviewItems,
    savePersonalProfile: api.savePersonalProfile,
    getPersonalProfile: api.getPersonalProfile
  };

  api.getDashboard = () => Promise.resolve(buildDashboardPayload());
  api.getRuntimeConfig = () => ({
    mode: "remote",
    baseUrl: "http://127.0.0.1:3100",
    usingRemote: true,
    healthUrl: "http://127.0.0.1:3100/health",
    activePresetId: "local-dev"
  });
  api.getConnectionSummary = () => ({
    modeLabel: "远端 API",
    presetLabel: "本机开发",
    endpointLabel: "http://127.0.0.1:3100",
    sourceLabel: "用户保存",
    healthLabel: "http://127.0.0.1:3100/health",
    hint: "当前连接使用开发预设。"
  });
  api.getConnectionDiagnostics = () => ({
    status: "failure",
    statusLabel: "历史连接曾失败",
    scopeLabel: "历史记录",
    baseUrl: "https://old.example.com/gongkao",
    checkedAt: "2026-06-09T12:00:00.000Z",
    message: "timeout",
    userStateFile: "",
    isForCurrentConfig: false
  });
  api.listConnectionPresets = () => ([
    {
      id: "local-dev",
      name: "本机开发",
      badge: "DEV",
      mode: "remote",
      baseUrl: "http://127.0.0.1:3100",
      description: "本地 API"
    }
  ]);
  api.toggleFavoriteNotice = () => Promise.resolve([]);
  api.resolveReviewItem = (id, resolutionNote) => Promise.resolve({
    id,
    status: "resolved",
    resolutionNote: resolutionNote || ""
  });
  api.reopenReviewItem = (id) => Promise.resolve({
    id,
    status: "pending"
  });
  api.resolveStaleReviewItems = (input = {}) => Promise.resolve({
    resolvedCount: 0,
    reviewIds: [],
    sourceId: input.sourceId || ""
  });
  api.savePersonalProfile = (input) => Promise.resolve({
    profile: clone(input)
  });
  api.getPersonalProfile = () => Promise.resolve({
    profile: clone(buildDashboardPayload().personalProfile)
  });

  return () => {
    api.getDashboard = original.getDashboard;
    api.getRuntimeConfig = original.getRuntimeConfig;
    api.getConnectionSummary = original.getConnectionSummary;
    api.getConnectionDiagnostics = original.getConnectionDiagnostics;
    api.listConnectionPresets = original.listConnectionPresets;
    api.toggleFavoriteNotice = original.toggleFavoriteNotice;
    api.resolveReviewItem = original.resolveReviewItem;
    api.reopenReviewItem = original.reopenReviewItem;
    api.resolveStaleReviewItems = original.resolveStaleReviewItems;
    api.savePersonalProfile = original.savePersonalProfile;
    api.getPersonalProfile = original.getPersonalProfile;
  };
}

function buildPositionOverrideFixtures() {
  return [
    {
      id: "rule-1",
      sourceId: "rsks-gd",
      noticeId: "rsks-gd|notice-1",
      positionCode: "A001",
      reason: "人工核对岗位表后修正政治面貌",
      updatedAt: "2026-06-09T12:10:00.000Z",
      updates: {
        politicalStatus: "中共党员",
        notes: "需通过体能测试"
      }
    }
  ];
}

function patchApiForPageTest() {
  const original = {
    getDashboard: api.getDashboard,
    getRuntimeConfig: api.getRuntimeConfig,
    getConnectionSummary: api.getConnectionSummary,
    getConnectionDiagnostics: api.getConnectionDiagnostics,
    listConnectionPresets: api.listConnectionPresets,
    toggleFavoriteNotice: api.toggleFavoriteNotice,
    resolveReviewItem: api.resolveReviewItem,
    reopenReviewItem: api.reopenReviewItem,
    listPositionOverrides: api.listPositionOverrides,
    savePositionOverride: api.savePositionOverride,
    deletePositionOverride: api.deletePositionOverride,
    setSourceReleaseOverride: api.setSourceReleaseOverride,
    listPublishAudits: api.listPublishAudits,
    savePersonalProfile: api.savePersonalProfile,
    getPersonalProfile: api.getPersonalProfile
  };

  api.getDashboard = () => Promise.resolve(buildDashboardPayload());
  api.getRuntimeConfig = () => ({
    mode: "remote",
    baseUrl: "http://127.0.0.1:3100",
    usingRemote: true,
    healthUrl: "http://127.0.0.1:3100/health",
    activePresetId: "local-dev"
  });
  api.getConnectionSummary = () => ({
    modeLabel: "远端 API",
    presetLabel: "本机开发",
    endpointLabel: "http://127.0.0.1:3100",
    sourceLabel: "用户保存",
    healthLabel: "http://127.0.0.1:3100/health",
    hint: "当前连接使用开发预设。"
  });
  api.getConnectionDiagnostics = () => ({
    status: "failure",
    statusLabel: "历史连接曾失败",
    scopeLabel: "历史记录",
    baseUrl: "https://old.example.com/gongkao",
    checkedAt: "2026-06-09T12:00:00.000Z",
    message: "timeout",
    userStateFile: "",
    isForCurrentConfig: false
  });
  api.listConnectionPresets = () => ([
    {
      id: "local-dev",
      name: "本机开发",
      badge: "DEV",
      mode: "remote",
      baseUrl: "http://127.0.0.1:3100",
      description: "本地 API"
    }
  ]);
  api.toggleFavoriteNotice = () => Promise.resolve([]);
  api.resolveReviewItem = (id, resolutionNote) => Promise.resolve({
    id,
    status: "resolved",
    resolutionNote: resolutionNote || ""
  });
  api.reopenReviewItem = (id) => Promise.resolve({
    id,
    status: "pending"
  });
  api.listPositionOverrides = () => Promise.resolve(buildPositionOverrideFixtures());
  api.savePositionOverride = (input) => Promise.resolve({
    ...clone(input),
    updatedAt: "2026-06-09T12:20:00.000Z"
  });
  api.deletePositionOverride = (id) => Promise.resolve({ id });
  api.setSourceReleaseOverride = (input) => Promise.resolve({
    sourceState: {
      sourceId: input.sourceId || "",
      releaseOverrideMode: input.mode || ""
    },
    audit: {
      id: `audit-${String(input.sourceId || "source")}-${String(input.mode || "clear")}`,
      sourceId: input.sourceId || "",
      releaseOverrideMode: input.mode || ""
    }
  });
  api.listPublishAudits = () => Promise.resolve(clone(buildDashboardPayload().publishAudits || []));
  api.savePersonalProfile = (input) => Promise.resolve({
    profile: clone(input)
  });
  api.getPersonalProfile = () => Promise.resolve({
    profile: clone(buildDashboardPayload().personalProfile)
  });

  return () => {
    api.getDashboard = original.getDashboard;
    api.getRuntimeConfig = original.getRuntimeConfig;
    api.getConnectionSummary = original.getConnectionSummary;
    api.getConnectionDiagnostics = original.getConnectionDiagnostics;
    api.listConnectionPresets = original.listConnectionPresets;
    api.toggleFavoriteNotice = original.toggleFavoriteNotice;
    api.resolveReviewItem = original.resolveReviewItem;
    api.reopenReviewItem = original.reopenReviewItem;
    api.listPositionOverrides = original.listPositionOverrides;
    api.savePositionOverride = original.savePositionOverride;
    api.deletePositionOverride = original.deletePositionOverride;
    api.setSourceReleaseOverride = original.setSourceReleaseOverride;
    api.listPublishAudits = original.listPublishAudits;
    api.savePersonalProfile = original.savePersonalProfile;
    api.getPersonalProfile = original.getPersonalProfile;
  };
}

function buildNoticeTrust(overrides = {}) {
  return {
    sourceId: "rsks-gd",
    sourceName: "广东省人事考试网",
    sourceModeLabel: "官方",
    parseQualityStatus: "warning",
    parseQualitySummary: "字段覆盖不足，建议结合原表复核",
    trustLabel: "结构化需关注",
    fieldCoveragePercent: 65,
    workbookSheetSummary: "岗位表 2 个工作表",
    lastSuccessfulFetchedAt: "2026-06-09T09:50:00.000Z",
    lastPublishedAt: "2026-06-09T10:00:00.000Z",
    publishGateStatus: "parse-warning",
    publishGateLabel: "仅公告模式",
    publishGateDetail: "岗位表结构化未完全通过校验，前台先保持公告模式。",
    publishGateFocus: "parse",
    runStatusLabel: "已发布",
    riskSummary: "字段覆盖率 65%",
    ...clone(overrides)
  };
}

function patchPositionAndCompareApi(overrides = {}) {
  const original = {
    listCompareGroups: api.listCompareGroups,
    listPositionsByNotice: api.listPositionsByNotice,
    getRecommendedPositions: api.getRecommendedPositions,
    getCompareGroupDetail: api.getCompareGroupDetail,
    saveCompareGroupPreferences: api.saveCompareGroupPreferences,
    setCompareGroupPinned: api.setCompareGroupPinned,
    getSavedFilter: api.getSavedFilter,
    getSubscription: api.getSubscription,
    saveSavedFilterViewPreferences: api.saveSavedFilterViewPreferences,
    saveSubscriptionViewPreferences: api.saveSubscriptionViewPreferences,
    getPersonalProfile: api.getPersonalProfile,
    recordCompareGroupAction: api.recordCompareGroupAction,
    touchCompareGroup: api.touchCompareGroup
  };

  const noticeTrust = buildNoticeTrust();
  const notice = {
    id: "rsks-gd|notice-1",
    title: "广东省考公告",
    area: "广东",
    examType: "guangdong-provincial",
    registrationWindow: "2026-01-10 至 2026-01-16",
    hasStructuredPositions: true,
    mergedSourceCount: 2,
    positionNoticeId: "rsks-gd|notice-1",
    positionSourceName: "rsks-gd",
    mergedSources: [
      {
        noticeId: "rsks-gd|notice-1",
        sourceId: "rsks-gd",
        sourceName: "rsks-gd",
        publishedAt: "2026-01-01",
        hasStructuredPositions: true,
        positionCount: 2
      },
      {
        noticeId: "ggfw-hrss-gd|notice-1-shadow",
        sourceId: "ggfw-hrss-gd",
        sourceName: "ggfw-hrss-gd",
        publishedAt: "2026-01-01",
        hasStructuredPositions: false,
        positionCount: 0
      }
    ]
  };
  const positions = [
    {
      id: "position-1",
      noticeId: notice.id,
      examType: notice.examType,
      agency: "广州市某单位",
      title: "综合管理岗",
      positionCode: "A001",
      positionType: "综合管理",
      headcount: 2,
      area: "广州",
      education: "本科",
      degree: "学士",
      major: "法学",
      serviceRequirement: "不限",
      freshGraduateOnly: false,
      politicalStatus: "不限",
      notes: "未注明",
      noticeTitle: "广东省考公告",
      noticeStageLabel: "主公告",
      noticePublishedAt: "2026-01-01",
      noticeArea: "广东",
      sourceId: "rsks-gd",
      sourceName: "rsks-gd",
      mergedSourceCount: notice.mergedSourceCount,
      mergedSources: notice.mergedSources,
      primarySourceId: "rsks-gd",
      positionNoticeId: notice.positionNoticeId,
      positionSourceId: "rsks-gd",
      positionSourceName: notice.positionSourceName,
      inCompare: true,
      hasManualCorrections: true,
      correctedFields: ["politicalStatus", "notes"],
      correctionSummary: "政治面貌、其他要求已人工纠错",
      noticeTrust
    },
    {
      id: "position-2",
      noticeId: notice.id,
      examType: notice.examType,
      agency: "深圳市某单位",
      title: "执法岗",
      positionCode: "A002",
      positionType: "行政执法",
      headcount: 1,
      area: "深圳",
      education: "硕士",
      degree: "硕士",
      major: "公安学",
      serviceRequirement: "2年基层经历",
      freshGraduateOnly: true,
      politicalStatus: "中共党员",
      notes: "需通过体能测试",
      noticeTitle: "广东省考公告",
      noticeStageLabel: "主公告",
      noticePublishedAt: "2026-01-01",
      noticeArea: "广东",
      sourceId: "rsks-gd",
      sourceName: "rsks-gd",
      mergedSourceCount: notice.mergedSourceCount,
      mergedSources: notice.mergedSources,
      primarySourceId: "rsks-gd",
      positionNoticeId: notice.positionNoticeId,
      positionSourceId: "rsks-gd",
      positionSourceName: notice.positionSourceName,
      inCompare: false,
      noticeTrust
    }
  ];
  const groups = overrides.groups || [
    {
      id: "group-1",
      name: "广东岗位方案",
      examType: notice.examType,
      positionIds: ["position-1"],
      originContext: {
        sourceType: "subscription",
        sourceLabel: "订阅命中",
        sourceEntry: "messages",
        sourceName: "珠三角订阅",
        noticeId: notice.id,
        noticeTitle: notice.title,
        action: "create",
        actedAt: "2026-06-09T09:00:00.000Z",
        positionIds: ["position-1", "position-2"],
        addedCount: 2
      },
      lastActionContext: {
        sourceType: "positions",
        sourceLabel: "岗位列表",
        sourceEntry: "positions",
        sourceName: "广东岗位",
        noticeId: notice.id,
        noticeTitle: notice.title,
        action: "reuse",
        actedAt: "2026-06-09T09:30:00.000Z",
        positionIds: ["position-2"],
        addedCount: 1
      },
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      }
    }
  ];
  const comparePositions = overrides.positions || positions;
  const compareNotice = overrides.notice || notice;
  const recommendedPositions = overrides.recommendedPositions || [
    {
      ...comparePositions[1],
      reasons: ["学历一致", "专业重合"]
    }
  ];

  api.listCompareGroups = () => Promise.resolve(clone(groups));
  api.listPositionsByNotice = () => Promise.resolve({
    notice: clone(compareNotice),
    noticeTrust: clone(noticeTrust),
    positions: clone(comparePositions),
    canViewPositions: true
  });
  api.getRecommendedPositions = (positionId) => {
    const scopedRecommendations = Array.isArray(overrides.recommendedPositions)
      ? recommendedPositions
      : comparePositions
        .filter((item) => item.id !== positionId)
        .map((item, index) => ({
          ...item,
          reasons: index === 0 ? ["学历一致", "专业重合"] : ["条件接近"]
        }));
    return Promise.resolve(clone(scopedRecommendations));
  };
  api.getCompareGroupDetail = () => Promise.resolve({
    group: clone(groups[0]),
    positions: clone(comparePositions)
  });
  api.saveCompareGroupPreferences = (_groupId, preferences) => {
    groups[0] = {
      ...groups[0],
      viewPreferences: {
        ...groups[0].viewPreferences,
        ...clone(preferences)
      }
    };
    return Promise.resolve(clone(groups[0]));
  };
  api.getSavedFilter = () => Promise.resolve(null);
  api.getSubscription = () => Promise.resolve(null);
  api.saveSavedFilterViewPreferences = (_savedFilterId, viewPreferences) => Promise.resolve({
    id: _savedFilterId,
    viewPreferences: clone(viewPreferences)
  });
  api.saveSubscriptionViewPreferences = (_subscriptionId, viewPreferences) => Promise.resolve({
    id: _subscriptionId,
    viewPreferences: clone(viewPreferences)
  });
  api.recordCompareGroupAction = (groupId, context = {}) => Promise.resolve({
    ...(groups.some((item) => item.id === groupId) ? clone(groups.find((item) => item.id === groupId)) : { id: groupId }),
    lastActionContext: clone(context)
  });
  api.touchCompareGroup = (groupId, touchedAt) => {
    const targetIndex = groups.findIndex((item) => item.id === groupId);
    if (targetIndex < 0) {
      return Promise.resolve(null);
    }

    const updated = {
      ...groups[targetIndex],
      lastUsedAt: touchedAt || "2026-06-09T10:00:00.000Z"
    };
    groups[targetIndex] = updated;
    return Promise.resolve(clone(updated));
  };
  api.setCompareGroupPinned = (groupId, pinned, pinnedAt) => {
    const targetIndex = groups.findIndex((item) => item.id === groupId);
    if (targetIndex < 0) {
      return Promise.resolve(null);
    }

    const updated = {
      ...groups[targetIndex],
      isPinned: Boolean(pinned),
      pinnedAt: pinned ? (pinnedAt || "2026-06-09T10:05:00.000Z") : ""
    };
    groups[targetIndex] = updated;
    return Promise.resolve(clone(updated));
  };
  api.getPersonalProfile = () => Promise.resolve({
    profile: {
      education: "本科",
      degree: "学士",
      majorKeywords: "法学",
      politicalStatus: "",
      serviceExperience: "none",
      freshGraduateStatus: "non-fresh"
    }
  });

  return () => {
    api.listCompareGroups = original.listCompareGroups;
    api.listPositionsByNotice = original.listPositionsByNotice;
    api.getRecommendedPositions = original.getRecommendedPositions;
    api.getCompareGroupDetail = original.getCompareGroupDetail;
    api.saveCompareGroupPreferences = original.saveCompareGroupPreferences;
    api.setCompareGroupPinned = original.setCompareGroupPinned;
    api.getSavedFilter = original.getSavedFilter;
    api.getSubscription = original.getSubscription;
    api.saveSavedFilterViewPreferences = original.saveSavedFilterViewPreferences;
    api.saveSubscriptionViewPreferences = original.saveSubscriptionViewPreferences;
    api.getPersonalProfile = original.getPersonalProfile;
    api.recordCompareGroupAction = original.recordCompareGroupAction;
    api.touchCompareGroup = original.touchCompareGroup;
  };
}

function patchNoticePagesApi() {
  const original = {
    getDashboard: api.getDashboard,
    listNotices: api.listNotices,
    getNoticeDetail: api.getNoticeDetail,
    listCompareGroups: api.listCompareGroups,
    createCompareGroup: api.createCompareGroup,
    addPositionToGroup: api.addPositionToGroup,
    recordCompareGroupAction: api.recordCompareGroupAction,
    toggleFavoriteNotice: api.toggleFavoriteNotice,
    saveNoticeProgressReminderSettings: api.saveNoticeProgressReminderSettings
  };

  const noticeTrust = buildNoticeTrust();
  const notices = buildNoticeFixtures();
  const noticePositions = [
    {
      id: "position-1",
      noticeId: "rsks-gd|notice-1",
      examType: "guangdong-provincial",
      agency: "广州市某单位",
      title: "综合管理岗",
      positionCode: "A001",
      area: "广州",
      education: "本科",
      degree: "学士",
      major: "法学",
      serviceRequirement: "不限",
      freshGraduateOnly: false,
      politicalStatus: "不限"
    },
    {
      id: "position-2",
      noticeId: "rsks-gd|notice-1",
      examType: "guangdong-provincial",
      agency: "深圳市某单位",
      title: "执法岗",
      positionCode: "A002",
      area: "深圳",
      education: "本科",
      degree: "学士",
      major: "法学",
      serviceRequirement: "不限",
      freshGraduateOnly: false,
      politicalStatus: "不限"
    }
  ];
  const compareGroups = [
    {
      id: "group-1",
      name: "广东岗位方案",
      examType: "guangdong-provincial",
      positionIds: ["position-1"]
    }
  ];
  notices[0].noticeTrust = clone(noticeTrust);
  notices[0].noticeCompareCandidateIds = ["position-1", "position-2"];
  notices[0].noticeCompareSuggestion = {
    mode: "reuse",
    ready: true,
    hint: "可直接把当前公告岗位补入对比方案：广东岗位方案",
    actionLabel: "带入 2 个岗位对比",
    groupId: "group-1",
    groupName: "广东岗位方案",
    nextCount: 1,
    candidateCount: 2,
    compatibleGroupCount: 1,
    totalPositionCount: 2
  };
  notices[1].noticeTrust = {
    ...clone(noticeTrust),
    parseQualityStatus: "attachment-only",
    parseQualitySummary: "当前仅完成公告与附件解析，适合先追踪后续流程。",
    trustLabel: "仅公告未结构化",
    fieldCoveragePercent: 0,
    workbookSheetSummary: ""
  };
  notices[2].noticeTrust = {
    ...clone(noticeTrust),
    parseQualityStatus: "attachment-only",
    parseQualitySummary: "当前仅完成公告与附件解析，岗位表尚未稳定结构化。",
    trustLabel: "仅公告未结构化",
    fieldCoveragePercent: 0,
    workbookSheetSummary: ""
  };
  notices[1].noticeCompareCandidateIds = [];
  notices[1].noticeCompareSuggestion = {
    mode: "",
    ready: false,
    hint: "",
    actionLabel: "",
    groupId: "",
    groupName: "",
    nextCount: 0,
    candidateCount: 0,
    compatibleGroupCount: 0,
    totalPositionCount: 0
  };
  notices[2].noticeCompareCandidateIds = [];
  notices[2].noticeCompareSuggestion = {
    mode: "",
    ready: false,
    hint: "",
    actionLabel: "",
    groupId: "",
    groupName: "",
    nextCount: 0,
    candidateCount: 0,
    compatibleGroupCount: 0,
    totalPositionCount: 0
  };

  api.getDashboard = () => {
    const dashboard = buildDashboardPayload();
    dashboard.notices[0] = {
      ...dashboard.notices[0],
      noticeTrust: clone(noticeTrust)
    };
    return Promise.resolve(dashboard);
  };
  api.listNotices = () => Promise.resolve(clone(notices));
  api.listCompareGroups = () => Promise.resolve(clone(compareGroups));
  api.createCompareGroup = (name, examType, options = {}) => Promise.resolve({
    id: `group-${name}`,
    name,
    examType,
    positionIds: [],
    originContext: clone(options.originContext || {}),
    lastActionContext: clone(options.lastActionContext || {})
  });
  api.addPositionToGroup = (groupId, positionId, context = {}) => {
    const targetIndex = compareGroups.findIndex((item) => item.id === groupId);
    if (targetIndex < 0) {
      return Promise.resolve({
        id: groupId,
        positionIds: [positionId],
        lastActionContext: clone(context)
      });
    }

    const updated = {
      ...compareGroups[targetIndex],
      positionIds: Array.from(new Set([].concat(compareGroups[targetIndex].positionIds || [], positionId))),
      lastActionContext: clone(context)
    };
    compareGroups[targetIndex] = updated;
    return Promise.resolve(clone(updated));
  };
  api.recordCompareGroupAction = (groupId, context = {}) => {
    const target = compareGroups.find((item) => item.id === groupId) || { id: groupId };
    return Promise.resolve({
      ...clone(target),
      lastActionContext: clone(context)
    });
  };
  api.getNoticeDetail = () => Promise.resolve({
    notice: {
      ...clone(notices[0]),
      writtenExamAt: "2026-07-01",
      attachments: ["职位表.xlsx"],
      positionCount: 128,
      url: "https://rsks.gd.gov.cn/example"
    },
    positions: clone(noticePositions),
    noticeTrust: clone(noticeTrust),
    canViewPositions: true,
    favorite: false,
    progressReminderSettings: {
      qualificationReview: true,
      interview: true,
      final: true
    },
    progressReminderOptions: [
      { id: "qualificationReview", stageId: "qualification-review", label: "资格审核" },
      { id: "interview", stageId: "interview", label: "面试" },
      { id: "final", stageId: "final", label: "录用" }
    ],
    noticeBatch: {
      key: "guangdong-provincial:2026",
      year: "2026",
      examType: "guangdong-provincial",
      label: "2026年广东批次"
    },
    noticeTimeline: [
      {
        ...clone(notices[0]),
        isCurrent: true
      },
      {
        ...clone(notices[1]),
        isCurrent: false
      }
    ],
    relatedNotices: [clone(notices[1])],
    noticeProgress: {
      currentStageLabel: "主公告",
      relatedNoticeCount: 1,
      followingNoticeCount: 1,
      followingStageLabels: ["资格审核"],
      progressHint: "本批后续 1 条",
      progressDetail: "后续节点：资格审核"
    }
  });
  api.toggleFavoriteNotice = () => Promise.resolve(["rsks-gd|notice-1"]);
  api.saveNoticeProgressReminderSettings = (_noticeId, input) => Promise.resolve({
    settings: {
      qualificationReview: input.qualificationReview !== undefined ? input.qualificationReview : true,
      interview: input.interview !== undefined ? input.interview : true,
      final: input.final !== undefined ? input.final : true
    },
    options: [
      { id: "qualificationReview", stageId: "qualification-review", label: "资格审核" },
      { id: "interview", stageId: "interview", label: "面试" },
      { id: "final", stageId: "final", label: "录用" }
    ]
  });

  return () => {
    api.getDashboard = original.getDashboard;
    api.listNotices = original.listNotices;
    api.getNoticeDetail = original.getNoticeDetail;
    api.listCompareGroups = original.listCompareGroups;
    api.createCompareGroup = original.createCompareGroup;
    api.addPositionToGroup = original.addPositionToGroup;
    api.recordCompareGroupAction = original.recordCompareGroupAction;
    api.toggleFavoriteNotice = original.toggleFavoriteNotice;
    api.saveNoticeProgressReminderSettings = original.saveNoticeProgressReminderSettings;
  };
}

function patchMessagesApi() {
  const original = {
    getDashboard: api.getDashboard,
    getSubscription: api.getSubscription,
    listCompareGroups: api.listCompareGroups,
    createCompareGroup: api.createCompareGroup,
    addPositionToGroup: api.addPositionToGroup,
    recordCompareGroupAction: api.recordCompareGroupAction,
    markMessageRead: api.markMessageRead,
    markSubscriptionSeen: api.markSubscriptionSeen
  };

  const actionLog = {
    addedPositionIds: [],
    markedMessages: [],
    markedSubscriptions: []
  };

  api.getDashboard = () => Promise.resolve(buildDashboardPayload());
  api.getSubscription = () => Promise.resolve({
    id: "sub-1",
    name: "珠三角",
    examType: "guangdong-provincial",
    newPositionIds: ["position-1", "position-2"],
    currentPositionIds: ["position-1", "position-2", "position-3"]
  });
  api.listCompareGroups = () => Promise.resolve([]);
  api.createCompareGroup = (name, examType) => Promise.resolve({
    id: "group-quick",
    name,
    examType,
    positionIds: []
  });
  api.addPositionToGroup = (_groupId, positionId) => {
    actionLog.addedPositionIds.push(positionId);
    return Promise.resolve({
      id: _groupId,
      positionIds: actionLog.addedPositionIds.slice()
    });
  };
  api.recordCompareGroupAction = (groupId) => Promise.resolve({
    id: groupId,
    name: groupId === "group-existing" ? "已有方案" : "快速方案",
    examType: "guangdong-provincial",
    positionIds: []
  });
  api.markMessageRead = (messageId) => {
    actionLog.markedMessages.push(messageId);
    return Promise.resolve({ messageId, unreadCount: 1 });
  };
  api.markSubscriptionSeen = (subscriptionId) => {
    actionLog.markedSubscriptions.push(subscriptionId);
    return Promise.resolve({ id: subscriptionId });
  };

  return {
    actionLog,
    restore() {
      api.getDashboard = original.getDashboard;
      api.getSubscription = original.getSubscription;
      api.listCompareGroups = original.listCompareGroups;
      api.createCompareGroup = original.createCompareGroup;
      api.addPositionToGroup = original.addPositionToGroup;
      api.recordCompareGroupAction = original.recordCompareGroupAction;
      api.markMessageRead = original.markMessageRead;
      api.markSubscriptionSeen = original.markSubscriptionSeen;
    }
  };
}

test("source-status page should expose current connection summary and parse quality", async () => {
  const restoreApi = patchApiForPageTest();
  try {
    const definition = loadPageDefinition("../pages/source-status/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, {});
    page.onShow.call(page);
    await flushPromises();

    assert.equal(page.data.connectionSummary.modeLabel, "远端 API");
    assert.equal(page.data.connectionSummary.presetLabel, "本机开发");
    assert.equal(page.data.connectionSummary.endpointLabel, "http://127.0.0.1:3100");
    assert.equal(page.data.summary.sourceCount, 1);
    assert.equal(page.data.summary.parseIssueCount, 1);
    assert.equal(page.data.summary.publishableCount, 0);
    assert.equal(page.data.summary.restrictedCount, 1);
    assert.equal(page.data.summary.gateBlockedCount, 1);
    assert.equal(page.data.summary.rollbackCount, 0);
    assert.equal(page.data.sourceStates.length, 1);
    assert.equal(page.data.sourceStates[0].lastSuccessfulFetchedAt, "2026-06-09T09:50:00.000Z");
    assert.equal(page.data.sourceStates[0].candidateVersionLabel, "2026-06-09 09:50 候选版本");
    assert.equal(page.data.sourceStates[0].parseQualityLabel, "岗位表需关注");
    assert.equal(page.data.sourceStates[0].fieldCoveragePercent, 65);
    assert.equal(page.data.sourceStates[0].publishGate.status, "notice-only");
    assert.equal(page.data.sourceStates[0].publishGate.label, "仅公告可发布，岗位表先复核");
    assert.equal(page.data.sourceStates[0].publishGate.focus, "parse");
    assert.ok(page.data.sourceStates[0].publishGate.detail.includes("当前稳定版本：2026-06-09 09:35 稳定快照"));
    assert.equal(page.data.sourceStates[0].stableVersionLabel, "2026-06-09 09:35 稳定快照");
    assert.equal(page.data.sourceStates[0].releaseMode, "notice-only");
    assert.equal(page.data.sourceStates[0].releaseModeLabel, "人工锁定，仅公告模式");
    assert.equal(page.data.sourceStates[0].releaseOverrideReason, "运营手动锁定为仅公告模式");
    assert.equal(page.data.sourceStates[0].gateFailureReason, "字段命中率不足，岗位表继续走人工复核，前台先保留公告模式。");
    assert.equal(page.data.sourceStates[0].gateCheckSummary.summary, "通过 1 · 失败 1");
    assert.equal(page.data.sourceStates[0].gateChecks[0].label, "关键字段覆盖率");
    assert.equal(page.data.sourceStates[0].riskSummary.headline, "1 条待复核");
    assert.ok(page.data.sourceStates[0].riskSummary.detail.includes("字段覆盖率 65%"));
    assert.equal(page.data.publishAudits.length, 1);
    assert.equal(page.data.publishAudits[0].id, "audit-1");
    assert.equal(page.data.sourceStates[0].recentAudits.length, 1);
    assert.equal(page.data.sourceStates[0].recentAudits[0].id, "audit-1");
  } finally {
    restoreApi();
  }
});

test("source-status page should manage release overrides in remote mode", async () => {
  const restoreApi = patchApiForPageTest();
  const previousWx = global.wx;
  const toasts = [];
  const calls = [];
  let dashboard = buildDashboardPayload();

  api.getDashboard = () => Promise.resolve(clone(dashboard));
  api.listPublishAudits = () => Promise.resolve(clone(dashboard.publishAudits || []));
  api.setSourceReleaseOverride = (input) => {
    calls.push(clone(input));
    const target = dashboard.sourceStates.find((item) => item.sourceId === input.sourceId);
    if (target) {
      target.releaseOverrideMode = input.mode || "";
      target.releaseOverrideActive = Boolean(input.mode);
      target.releaseOverrideApplied = input.mode === "positions-open";
      target.releaseOverrideReason = input.mode ? (input.reason || "") : "";
      target.releaseOverrideUpdatedAt = "2026-06-09T12:40:00.000Z";
    }
    dashboard.publishAudits = [
      {
        id: `audit-${calls.length}`,
        sourceId: input.sourceId,
        sourceName: "广东省人事考试网",
        eventType: "release-override",
        createdAt: "2026-06-09T12:40:00.000Z",
        summary: input.mode ? "override updated" : "override cleared",
        detail: input.reason || "",
        releaseMode: input.mode || "notice-only",
        releaseOverrideMode: input.mode || "",
        reason: input.reason || ""
      },
      ...dashboard.publishAudits
    ];
    return Promise.resolve({
      sourceState: clone(target || {}),
      audit: clone(dashboard.publishAudits[0])
    });
  };

  global.wx = {
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/source-status/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, {});
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    await page.applyReleaseOverride.call(page, {
      currentTarget: {
        dataset: {
          sourceId: "rsks-gd",
          mode: ""
        }
      }
    });
    await flushPromises();
    await flushPromises();

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      sourceId: "rsks-gd",
      mode: "",
      reason: "清除人工发布策略"
    });
    assert.equal(page.data.releaseActionBusySourceId, "");
    assert.equal(page.data.sourceStates[0].releaseOverrideActive, false);
    assert.equal(page.data.publishAudits[0].id, "audit-1");
    assert.equal(toasts[0].title, "已恢复自动发布策略");
  } finally {
    global.wx = previousWx;
    restoreApi();
  }
});

test("source-status page should route stale review backlog into focused review center", async () => {
  const restoreApi = patchApiForPageTest();
  const previousWx = global.wx;
  const navigations = [];
  const dashboard = clone(buildDashboardPayload());

  dashboard.sourceStates[0] = {
    ...dashboard.sourceStates[0],
    pendingReviewCount: 1,
    blockingPendingReviewCount: 0,
    stalePendingReviewCount: 1,
    staleReviewIds: ["review-stale-1"]
  };
  dashboard.reviewQueue = [
    {
      id: "review-stale-1",
      sourceId: "rsks-gd",
      sourceName: "广东省人事考试网",
      createdAt: "2026-06-08T09:00:00.000Z",
      reasons: ["connect EACCES 120.197.33.7:443"],
      hasParsedPayload: false,
      hasRawPayload: false,
      staleReview: true,
      blockingReview: false,
      blockingRelease: false
    }
  ];
  api.getDashboard = () => Promise.resolve(clone(dashboard));

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast() {}
  };

  try {
    const definition = loadPageDefinition("../pages/source-status/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, {});
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    page.focusReviewCenter.call(page, {
      currentTarget: {
        dataset: {
          sourceId: "rsks-gd"
        }
      }
    });
    assert.equal(navigations[0], "/pages/review-center/index?sourceId=rsks-gd&focus=stale");
  } finally {
    global.wx = previousWx;
    restoreApi();
  }
});

test("source-status page should honor explicit review focus when routing to review center", async () => {
  const restoreApi = patchApiForPageTest();
  const previousWx = global.wx;
  const navigations = [];

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast() {}
  };

  try {
    const definition = loadPageDefinition("../pages/source-status/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, {});
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    page.focusReviewCenter.call(page, {
      currentTarget: {
        dataset: {
          sourceId: "rsks-gd",
          reviewFocus: "blocking"
        }
      }
    });
    page.focusReviewCenter.call(page, {
      currentTarget: {
        dataset: {
          sourceId: "rsks-gd",
          reviewFocus: "stale"
        }
      }
    });

    assert.equal(navigations[0], "/pages/review-center/index?sourceId=rsks-gd&focus=blocking");
    assert.equal(navigations[1], "/pages/review-center/index?sourceId=rsks-gd&focus=stale");
  } finally {
    global.wx = previousWx;
    restoreApi();
  }
});

test("review-center page should expose review context details", async () => {
  const restoreApi = patchApiForPageTest();
  try {
    const definition = loadPageDefinition("../pages/review-center/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, {});
    page.onShow.call(page);
    await flushPromises();

    assert.equal(page.data.connectionSummary.modeLabel, "远端 API");
    assert.equal(page.data.connectionSummary.presetLabel, "本机开发");
    assert.equal(page.data.summary.total, 1);
    assert.equal(page.data.summary.resolved, 1);
    assert.equal(page.data.summary.highPriority, 0);
    assert.equal(page.data.summary.blockingRelease, 1);
    assert.equal(page.data.reviewQueue.length, 1);
    assert.equal(page.data.reviewQueue[0].noticeTitle, "广东省 2026 年考试录用公务员公告");
    assert.equal(page.data.reviewQueue[0].fieldCoveragePercent, 65);
    assert.equal(page.data.reviewQueue[0].payloadStatusLabel, "原始快照：有 · 解析结果：有");
    assert.equal(page.data.reviewQueue[0].candidateVersionLabel, "2026-06-09 09:50 候选版本");
    assert.equal(page.data.reviewQueue[0].rollbackToVersionLabel, "2026-06-09 09:35 稳定快照");
    assert.equal(page.data.reviewQueue[0].gateCheckSummary.summary, "通过 1 · 失败 1");
    assert.equal(page.data.reviewQueue[0].gateChecks[0].label, "关键字段覆盖率");
    assert.equal(page.data.reviewQueue[0].priority.label, "中优先级");
    assert.ok(page.data.reviewQueue[0].resolutionSuggestion.includes("表头模板"));
    assert.ok(page.data.reviewQueue[0].releaseImpact.includes("结构化质量不足"));
    assert.equal(page.data.resolvedReviewQueue.length, 1);
    assert.equal(page.data.resolvedReviewQueue[0].candidateVersionLabel, "2026-06-09 10:10 候选版本");
    assert.equal(page.data.resolvedReviewQueue[0].gateCheckSummary.summary, "失败 1");
    assert.equal(page.data.resolvedReviewQueue[0].priority.label, "高优先级");
    assert.ok(page.data.resolvedReviewQueue[0].resolutionSuggestion.includes("下载成功"));
  } finally {
    restoreApi();
  }
});

test("review-center page should filter stale review backlog when focused", async () => {
  const restoreApi = patchApiForPageTest();
  const dashboard = clone(buildDashboardPayload());

  dashboard.sourceStates[0] = {
    ...dashboard.sourceStates[0],
    pendingReviewCount: 2,
    blockingPendingReviewCount: 1,
    blockingReviewIds: ["review-1"],
    stalePendingReviewCount: 1,
    staleReviewIds: ["review-stale-1"]
  };
  dashboard.reviewQueue = [
    {
      id: "review-stale-1",
      sourceId: "rsks-gd",
      sourceName: "广东省人事考试网",
      createdAt: "2026-06-08T09:00:00.000Z",
      reasons: ["connect EACCES 120.197.33.7:443"],
      hasParsedPayload: false,
      hasRawPayload: false,
      staleReview: true,
      blockingReview: false,
      blockingRelease: false,
      gateChecks: [
        {
          id: "network-check",
          label: "抓取网络异常",
          status: "warn",
          detail: "后续已有稳定成功版本"
        }
      ]
    },
    clone(dashboard.reviewQueue[0])
  ];
  api.getDashboard = () => Promise.resolve(clone(dashboard));

  try {
    const definition = loadPageDefinition("../pages/review-center/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, {
      sourceId: "rsks-gd",
      focus: "stale"
    });
    page.onShow.call(page);
    await flushPromises();

    assert.equal(page.data.reviewFocusLabel, "历史复核积压");
    assert.equal(page.data.reviewQueue.length, 1);
    assert.equal(page.data.reviewQueue[0].id, "review-stale-1");
    assert.equal(page.data.reviewQueue[0].staleReview, true);
    assert.equal(page.data.summary.total, 1);
    assert.equal(page.data.summary.blockingRelease, 0);
    assert.equal(page.data.staleReviewCount, 1);
  } finally {
    restoreApi();
  }
});

test("review-center page should resolve and reopen review items", async () => {
  const restoreApi = patchApiForPageTest();
  const previousWx = global.wx;
  const toasts = [];
  const calls = {
    resolved: [],
    reopened: []
  };
  let dashboard = buildDashboardPayload();

  api.getDashboard = () => Promise.resolve(clone(dashboard));
  api.resolveReviewItem = (id, resolutionNote) => {
    calls.resolved.push({ id, resolutionNote });
    const target = dashboard.reviewQueue.find((item) => item.id === id);
    if (target) {
      dashboard.reviewQueue = dashboard.reviewQueue.filter((item) => item.id !== id);
      dashboard.resolvedReviewQueue = [
        {
          ...target,
          status: "resolved",
          resolvedAt: "2026-06-09T12:30:00.000Z",
          resolutionNote: resolutionNote || ""
        },
        ...dashboard.resolvedReviewQueue
      ];
      dashboard.stats.pendingReviewTotal = dashboard.reviewQueue.length;
      dashboard.stats.resolvedReviewTotal = dashboard.resolvedReviewQueue.length;
    }
    return Promise.resolve({
      id,
      status: "resolved",
      resolutionNote: resolutionNote || ""
    });
  };
  api.reopenReviewItem = (id) => {
    calls.reopened.push(id);
    const target = dashboard.resolvedReviewQueue.find((item) => item.id === id);
    if (target) {
      dashboard.resolvedReviewQueue = dashboard.resolvedReviewQueue.filter((item) => item.id !== id);
      dashboard.reviewQueue = [
        {
          ...target,
          status: "pending",
          resolvedAt: "",
          resolutionNote: ""
        },
        ...dashboard.reviewQueue
      ];
      dashboard.stats.pendingReviewTotal = dashboard.reviewQueue.length;
      dashboard.stats.resolvedReviewTotal = dashboard.resolvedReviewQueue.length;
    }
    return Promise.resolve({
      id,
      status: "pending"
    });
  };

  global.wx = {
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/review-center/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, {});
    page.onShow.call(page);
    await flushPromises();

    page.onResolutionInput.call(page, {
      currentTarget: {
        dataset: {
          id: "review-1"
        }
      },
      detail: {
        value: "已人工确认"
      }
    });
    page.resolveItem.call(page, {
      currentTarget: {
        dataset: {
          id: "review-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();

    assert.deepEqual(calls.resolved, [
      {
        id: "review-1",
        resolutionNote: "已人工确认"
      }
    ]);
    assert.equal(page.data.reviewQueue.length, 0);
    assert.equal(page.data.resolvedReviewQueue.length, 2);
    assert.equal(page.data.resolvedReviewQueue[0].resolutionNote, "已人工确认");
    assert.equal(toasts[0].title, "已标记处理");

    page.reopenItem.call(page, {
      currentTarget: {
        dataset: {
          id: "review-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();

    assert.deepEqual(calls.reopened, ["review-1"]);
    assert.equal(page.data.reviewQueue.length, 1);
    assert.equal(page.data.resolvedReviewQueue.length, 1);
    assert.equal(page.data.reviewQueue[0].id, "review-1");
    assert.equal(toasts[1].title, "已重新打开");
  } finally {
    global.wx = previousWx;
    restoreApi();
  }
});

test("review-center page should bulk-resolve stale review backlog in remote mode", async () => {
  const restoreApi = patchApiForPageTest();
  const previousWx = global.wx;
  const toasts = [];
  const calls = [];
  const dashboard = clone(buildDashboardPayload());

  dashboard.sourceStates[0] = {
    ...dashboard.sourceStates[0],
    stalePendingReviewCount: 1,
    staleReviewIds: ["review-stale-1"],
    blockingPendingReviewCount: 1,
    blockingReviewIds: ["review-1"]
  };
  dashboard.reviewQueue = [
    {
      id: "review-stale-1",
      sourceId: "rsks-gd",
      sourceName: "广东省人事考试网",
      createdAt: "2026-06-08T09:00:00.000Z",
      reasons: ["connect EACCES 120.197.33.7:443"],
      hasParsedPayload: false,
      hasRawPayload: false,
      staleReview: true,
      blockingReview: false,
      blockingRelease: false,
      candidateVersionId: "rsks-gd@2026-06-09T09:35:00.000Z",
      candidateVersionLabel: "2026-06-09 09:35 稳定快照",
      rollbackToVersionId: "rsks-gd@2026-06-09T09:35:00.000Z",
      rollbackToVersionLabel: "2026-06-09 09:35 稳定快照",
      gateChecks: [
        {
          id: "network-check",
          label: "抓取网络异常",
          status: "warn",
          detail: "后续已有稳定成功版本"
        }
      ],
      noticeTitle: "广东省 2026 年考试录用公务员公告",
      parseStatus: "fetch-failed"
    },
    clone(dashboard.reviewQueue[0])
  ];
  dashboard.resolvedReviewQueue = [];

  api.getDashboard = () => Promise.resolve(clone(dashboard));
  api.resolveStaleReviewItems = (input = {}) => {
    calls.push(clone(input));
    dashboard.reviewQueue = dashboard.reviewQueue.filter((item) => item.id !== "review-stale-1");
    dashboard.resolvedReviewQueue = [
      {
        id: "review-stale-1",
        sourceId: "rsks-gd",
        sourceName: "广东省人事考试网",
        createdAt: "2026-06-08T09:00:00.000Z",
        resolvedAt: "2026-06-10T12:30:00.000Z",
        updatedAt: "2026-06-10T12:30:00.000Z",
        status: "resolved",
        resolutionNote: input.note,
        reasons: ["connect EACCES 120.197.33.7:443"],
        hasParsedPayload: false,
        hasRawPayload: false,
        staleReview: false,
        blockingReview: false,
        blockingRelease: false,
        gateChecks: [
          {
            id: "network-check",
            label: "抓取网络异常",
            status: "warn",
            detail: "后续已有稳定成功版本"
          }
        ]
      },
      ...dashboard.resolvedReviewQueue
    ];
    dashboard.sourceStates[0] = {
      ...dashboard.sourceStates[0],
      stalePendingReviewCount: 0,
      staleReviewIds: []
    };
    dashboard.stats.pendingReviewTotal = dashboard.reviewQueue.length;
    dashboard.stats.resolvedReviewTotal = dashboard.resolvedReviewQueue.length;
    return Promise.resolve({
      resolvedCount: 1,
      reviewIds: ["review-stale-1"],
      sourceId: input.sourceId || ""
    });
  };

  global.wx = {
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/review-center/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { sourceId: "rsks-gd" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.staleReviewActionEnabled, true);
    assert.equal(page.data.staleReviewCount, 1);
    assert.equal(page.data.reviewQueue[0].staleReview, true);
    assert.ok(page.data.staleReviewHint.includes("1"));

    page.resolveStaleItems.call(page);
    await flushPromises();
    await flushPromises();

    assert.deepEqual(calls, [
      {
        sourceId: "rsks-gd",
        note: "自动关闭：后续已有稳定成功版本，判定为历史瞬时错误。"
      }
    ]);
    assert.equal(page.data.staleReviewCount, 0);
    assert.equal(page.data.reviewQueue.length, 1);
    assert.equal(page.data.reviewQueue[0].id, "review-1");
    assert.equal(page.data.resolvedReviewQueue.length, 1);
    assert.equal(page.data.resolvedReviewQueue[0].id, "review-stale-1");
    assert.equal(toasts[0].title, "已清理 1 条历史复核");
  } finally {
    global.wx = previousWx;
    restoreApi();
  }
});

test("review-center page should manage position overrides in remote mode", async () => {
  const restoreApi = patchApiForPageTest();
  const previousWx = global.wx;
  const toasts = [];
  const calls = {
    saved: [],
    deleted: []
  };
  let overrideRules = buildPositionOverrideFixtures();

  api.listPositionOverrides = () => Promise.resolve(clone(overrideRules));
  api.savePositionOverride = (input) => {
    calls.saved.push(clone(input));
    const savedRule = {
      ...clone(input),
      updatedAt: "2026-06-09T12:20:00.000Z"
    };
    overrideRules = [
      savedRule,
      ...overrideRules.filter((item) => item.id !== savedRule.id)
    ];
    return Promise.resolve(savedRule);
  };
  api.deletePositionOverride = (id) => {
    calls.deleted.push(id);
    overrideRules = overrideRules.filter((item) => item.id !== id);
    return Promise.resolve({ id });
  };

  global.wx = {
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/review-center/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, {});
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.positionOverrideEnabled, true);
    assert.equal(page.data.positionOverrides.length, 1);
    assert.equal(page.data.positionOverrides[0].id, "rule-1");
    assert.ok(page.data.positionOverrides[0].selectorSummary.includes("A001"));
    assert.ok(page.data.positionOverrides[0].updateSummary.includes("政治面貌"));

    page.prefillOverrideFromReviewItem.call(page, {
      currentTarget: {
        dataset: {
          id: "review-1"
        }
      }
    });
    assert.equal(page.data.draftOverride.id, "override-review-1");
    assert.equal(page.data.draftOverride.sourceId, "rsks-gd");
    assert.ok(page.data.draftOverride.reason.includes("review-1"));

    page.onOverrideFieldInput.call(page, {
      currentTarget: {
        dataset: {
          field: "positionCode"
        }
      },
      detail: {
        value: "A009"
      }
    });
    page.onOverrideFieldInput.call(page, {
      currentTarget: {
        dataset: {
          field: "politicalStatus"
        }
      },
      detail: {
        value: "中共党员"
      }
    });
    page.onOverrideFieldInput.call(page, {
      currentTarget: {
        dataset: {
          field: "notes"
        }
      },
      detail: {
        value: "需现场复核"
      }
    });

    await page.savePositionOverride.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(calls.saved.length, 1);
    assert.equal(calls.saved[0].id, "override-review-1");
    assert.equal(calls.saved[0].positionCode, "A009");
    assert.equal(calls.saved[0].updates.politicalStatus, "中共党员");
    assert.equal(calls.saved[0].updates.notes, "需现场复核");
    assert.equal(page.data.positionOverrides[0].id, "override-review-1");
    assert.equal(toasts[0].title, "已保存纠错规则");

    page.editPositionOverride.call(page, {
      currentTarget: {
        dataset: {
          id: "override-review-1"
        }
      }
    });
    assert.equal(page.data.draftOverride.id, "override-review-1");

    await page.deletePositionOverride.call(page, {
      currentTarget: {
        dataset: {
          id: "override-review-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();

    assert.deepEqual(calls.deleted, ["override-review-1"]);
    assert.equal(page.data.positionOverrides.length, 1);
    assert.equal(page.data.positionOverrides[0].id, "rule-1");
    assert.equal(toasts[1].title, "已删除纠错规则");
  } finally {
    global.wx = previousWx;
    restoreApi();
  }
});

test("profile page should expose historical connection diagnostics", async () => {
  const restoreApi = patchApiForPageTest();
  const previousWx = global.wx;
  const navigations = [];
  const toasts = [];
  const profileSaves = [];
  const addedPositionIds = [];
  const renamedCompareGroups = [];
  const deletedCompareGroups = [];
  const touchedCompareGroups = [];
  const pinnedCompareGroups = [];
  const originalSavePersonalProfile = api.savePersonalProfile;
  const originalGetSavedFilter = api.getSavedFilter;
  const originalGetSubscription = api.getSubscription;
  const originalListCompareGroups = api.listCompareGroups;
  const originalCreateCompareGroup = api.createCompareGroup;
  const originalAddPositionToGroup = api.addPositionToGroup;
  const originalMarkSubscriptionSeen = api.markSubscriptionSeen;
  const originalRenameCompareGroup = api.renameCompareGroup;
  const originalDeleteCompareGroup = api.deleteCompareGroup;
  const originalTouchCompareGroup = api.touchCompareGroup;
  const originalSetCompareGroupPinned = api.setCompareGroupPinned;

  api.savePersonalProfile = (input) => {
    profileSaves.push(clone(input));
    return Promise.resolve({
      profile: clone(input)
    });
  };
  api.getSavedFilter = () => Promise.resolve({
    id: "filter-1",
    name: "应届本科",
    examType: "guangdong-provincial",
    currentPositionIds: ["position-1", "position-2"]
  });
  api.getSubscription = () => Promise.resolve({
    id: "sub-1",
    name: "珠三角",
    examType: "guangdong-provincial",
    newPositionIds: ["position-1", "position-2"]
  });
  api.listCompareGroups = () => Promise.resolve([]);
  api.createCompareGroup = (name, examType) => Promise.resolve({
    id: `group-${name}`,
    name,
    examType,
    positionIds: []
  });
  api.addPositionToGroup = (groupId, positionId) => {
    addedPositionIds.push(positionId);
    return Promise.resolve({
      id: groupId,
      positionIds: addedPositionIds.slice()
    });
  };
  api.markSubscriptionSeen = () => Promise.resolve({ id: "sub-1" });
  api.renameCompareGroup = (groupId, name) => {
    renamedCompareGroups.push({ groupId, name });
    return Promise.resolve({
      id: groupId,
      name,
      positionIds: ["p1", "p2"],
      originContext: {
        sourceType: "subscription",
        sourceLabel: "订阅命中",
        sourceEntry: "messages",
        sourceName: "珠三角订阅",
        action: "create",
        actedAt: "2026-06-09T09:00:00.000Z"
      },
      lastActionContext: {
        sourceType: "positions",
        sourceLabel: "岗位列表",
        sourceEntry: "positions",
        sourceName: "广东岗位",
        action: "reuse",
        actedAt: "2026-06-09T10:30:00.000Z"
      }
    });
  };
  api.deleteCompareGroup = (groupId) => {
    deletedCompareGroups.push(groupId);
    return Promise.resolve([]);
  };
  api.touchCompareGroup = (groupId) => {
    touchedCompareGroups.push(groupId);
    if (groupId === "group-2") {
      return Promise.resolve({
        id: "group-2",
        name: "国考方案",
        examType: "national",
        positionIds: ["p3"],
        originContext: {
          sourceType: "positions",
          sourceLabel: "岗位列表",
          sourceEntry: "positions",
          sourceName: "国考岗位",
          action: "create",
          actedAt: "2026-06-08T09:00:00.000Z"
        },
        lastActionContext: {
          sourceType: "profile",
          sourceLabel: "方案列表",
          sourceEntry: "profile",
          sourceName: "国考方案",
          action: "open-existing",
          actedAt: "2026-06-09T11:30:00.000Z"
        },
        lastUsedAt: "2026-06-09T11:30:00.000Z"
      });
    }
    return Promise.resolve({ id: groupId, lastUsedAt: "2026-06-09T11:00:00.000Z" });
  };
  api.setCompareGroupPinned = (groupId, pinned) => {
    pinnedCompareGroups.push({ groupId, pinned });
    return Promise.resolve({
      id: groupId,
      isPinned: pinned,
      pinnedAt: pinned ? "2026-06-09T12:00:00.000Z" : ""
    });
  };

  global.wx = {
    showToast(payload) {
      toasts.push(payload);
    },
    navigateTo({ url }) {
      navigations.push(url);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/profile/index.js");
    const page = createPageInstance(definition);

    page.onShow.call(page);
    await flushPromises();

    assert.equal(page.data.connectionSummary.endpointLabel, "http://127.0.0.1:3100");
    assert.equal(page.data.connectionDiagnostics.scopeLabel, "历史记录");
    assert.equal(page.data.connectionDiagnostics.statusLabel, "历史连接曾失败");
    assert.equal(page.data.connectionDiagnostics.baseUrl, "https://old.example.com/gongkao");
    assert.equal(page.data.stats[0].value, 2);
    assert.equal(page.data.favoriteNotices.length, 1);
    assert.equal(page.data.favoriteNotices[0].hasLaterStage, true);
    assert.equal(page.data.favoriteNotices[0].latestNoticeId, "ggfw-hrss-gd|notice-3");
    assert.equal(page.data.favoriteNotices[0].noticeCompareSuggestion.mode, "reuse");
    assert.equal(page.data.favoriteNotices[0].noticeCompareSuggestion.actionLabel, "带入 2 个岗位对比");
    assert.ok(page.data.favoriteNotices[0].noticeNextActionSummary.includes("先去筛选可报岗位"));
    assert.equal(page.data.personalProfile.education, "本科");
    assert.ok(page.data.personalProfileSummary.includes("学历:本科"));
    assert.equal(page.data.savedFilters[0].managementLabel, "适合直接进对比");
    assert.ok(page.data.savedFilters[0].managementSummary.includes("当前命中 4 个岗位"));
    assert.equal(page.data.savedFilters[0].managementTags.some((item) => item.label === "命中 4"), true);
    assert.equal(page.data.savedFilters[0].managementTags.some((item) => item.label === "可直接对比"), true);
    assert.equal(page.data.subscriptions[0].newPositionPreview[0].title, "综合管理岗");
    assert.equal(page.data.subscriptions[0].managementLabel, "优先处理新增命中");
    assert.equal(page.data.subscriptions[0].managementSummary, "新增 1 个岗位 · 可报 1 个 · 待确认 0 个");
    assert.equal(page.data.subscriptions[0].managementTags.some((item) => item.label === "命中 5"), true);
    assert.equal(page.data.subscriptions[0].managementTags.some((item) => item.label === "新增 1"), true);
    assert.equal(page.data.subscriptions[0].managementTags.some((item) => item.label === "可直接对比"), true);
    assert.equal(page.data.compareGroupSections.length, 2);
    assert.equal(page.data.compareGroupSections[0].title, "广东省考");
    assert.equal(page.data.compareGroupSections[0].summary, "可复用 1 · 待确认 1");
    assert.equal(page.data.compareGroupSections[0].items[0].id, "group-1");
    assert.equal(page.data.compareGroupSections[1].title, "国考");
    assert.equal(page.data.compareGroupSections[1].summary, "可复用 1 · 待确认 1");
    assert.equal(page.data.compareGroupSections[1].items[0].id, "group-2");
    assert.equal(page.data.compareGroups[0].positionCount, 2);
    assert.equal(page.data.compareGroups[0].compareSummaryHeadline, "2 个岗位 · 可报 1 个 · 待确认 1 个 · 偏谨慎 1 个");
    assert.equal(page.data.compareGroups[0].compareSummaryFocusLabel, "最匹配岗位");
    assert.ok(page.data.compareGroups[0].compareSummaryFocus.includes("综合管理岗"));
    assert.ok(page.data.compareGroups[0].compareSummaryFocus.includes("当前最匹配"));
    assert.equal(page.data.compareGroups[0].managementLabel, "优先核对可报性");
    assert.ok(page.data.compareGroups[0].managementSummary.includes("1 个岗位待确认"));
    assert.equal(page.data.compareGroups[0].managementTags.some((item) => item.label === "2/4 岗位"), true);
    assert.equal(page.data.compareGroups[0].managementTags.some((item) => item.label === "可报 1"), true);
    assert.equal(page.data.compareGroups[0].managementTags.some((item) => item.label === "待确认 1"), true);
    assert.ok(page.data.compareGroups[0].originSummary.includes("订阅命中"));
    assert.ok(page.data.compareGroups[0].lastActionSummary.includes("岗位列表"));
    assert.ok(page.data.compareGroupHealth.summary.includes("已保存 2/20 组方案"));
    assert.ok(page.data.compareGroupHealth.summary.includes("2 组还能继续加岗位"));
    assert.equal(page.data.compareGroupHealth.tags.includes("可复用 2"), true);
    assert.equal(page.data.compareGroupHealth.tags.includes("剩余 18"), true);

    page.openCompareGroup.call(page, {
      currentTarget: {
        dataset: {
          id: "group-2"
        }
      }
    });
    await flushPromises();
    await flushPromises();

    assert.deepEqual(touchedCompareGroups, ["group-2"]);
    assert.equal(page.data.compareGroups[0].id, "group-2");
    assert.equal(page.data.compareGroupSections[0].title, "国考");
    assert.ok(page.data.compareGroups[0].managementSummary.includes("1 个岗位待确认"));
    assert.equal(navigations[0], "/pages/compare/index?groupId=group-2");

    page.toggleCompareGroupPinned.call(page, {
      currentTarget: {
        dataset: {
          id: "group-1"
        }
      }
    });
    await flushPromises();

    assert.deepEqual(pinnedCompareGroups[0], {
      groupId: "group-1",
      pinned: true
    });
    assert.equal(page.data.compareGroups[0].id, "group-1");
    assert.equal(page.data.compareGroups[0].isPinned, true);
    assert.equal(page.data.compareGroupSections[0].title, "广东省考");

    page.startRenameCompareGroup.call(page, {
      currentTarget: {
        dataset: {
          id: "group-1"
        }
      }
    });
    assert.equal(page.data.editingCompareGroupId, "group-1");
    assert.equal(page.data.compareGroupNameDraft, "深圳方案");

    page.onCompareGroupNameInput.call(page, {
      detail: {
        value: "深圳冲刺方案"
      }
    });
    page.saveCompareGroupName.call(page);
    await flushPromises();

    assert.deepEqual(renamedCompareGroups[0], {
      groupId: "group-1",
      name: "深圳冲刺方案"
    });
    assert.equal(page.data.compareGroups[0].name, "深圳冲刺方案");
    assert.equal(page.data.editingCompareGroupId, "");

    page.quickCompareFavoriteNotice.call(page, {
      currentTarget: {
        dataset: {
          id: "rsks-gd|notice-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(addedPositionIds.slice(0, 2), ["position-1", "position-2"]);
    assert.equal(navigations[1], "/pages/compare/index?groupId=group-广东公告岗位对比");

    page.openFavoriteLatestNotice.call(page, {
      currentTarget: {
        dataset: {
          id: "rsks-gd|notice-1",
          latestId: "ggfw-hrss-gd|notice-3"
        }
      }
    });
    assert.equal(navigations[2], "/pages/notice-detail/index?id=ggfw-hrss-gd|notice-3");

    page.openSubscription.call(page, {
      currentTarget: {
        dataset: {
          id: "sub-1",
          noticeId: "rsks-gd|notice-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();

    assert.equal(
      navigations[3],
      "/pages/positions/index?noticeId=rsks-gd|notice-1&subscriptionId=sub-1&newPositionIds=position-1%2Cposition-2"
    );

    page.quickCompareSavedFilter.call(page, {
      currentTarget: {
        dataset: {
          id: "filter-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(addedPositionIds.slice(2, 4), ["position-1", "position-2"]);
    assert.equal(navigations[4], "/pages/compare/index?groupId=group-应届本科对比");

    page.quickCompareSubscription.call(page, {
      currentTarget: {
        dataset: {
          id: "sub-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(addedPositionIds.slice(4), ["position-1", "position-2"]);
    assert.equal(navigations[5], "/pages/compare/index?groupId=group-珠三角对比");

    page.cancelFavoriteNotice.call(page, {
      currentTarget: {
        dataset: {
          id: "rsks-gd|notice-1"
        }
      }
    });
    await flushPromises();

    assert.equal(toasts[0].title, "已置顶方案");
    assert.equal(toasts[1].title, "已更新名称");

    page.onPersonalProfileInput.call(page, {
      currentTarget: {
        dataset: {
          field: "majorKeywords"
        }
      },
      detail: {
        value: "法学,行政管理"
      }
    });
    page.savePersonalProfile.call(page);
    await flushPromises();

    assert.equal(profileSaves[0].majorKeywords, "法学,行政管理");
    page.deleteCompareGroup.call(page, {
      currentTarget: {
        dataset: {
          id: "group-1"
        }
      }
    });
    await flushPromises();

    assert.deepEqual(deletedCompareGroups, ["group-1"]);
    assert.equal(page.data.compareGroups.length, 0);
    assert.equal(page.data.stats[2].value, 0);
    assert.equal(toasts[2].title, "已加入岗位对比");
    assert.equal(toasts[3].title, "已加入岗位对比");
    assert.equal(toasts[4].title, "已加入岗位对比");
    assert.equal(toasts[5].title, "已取消收藏");
    assert.equal(toasts[6].title, "已保存个人条件");
    assert.equal(toasts[7].title, "已删除方案");
  } finally {
    api.savePersonalProfile = originalSavePersonalProfile;
    api.getSavedFilter = originalGetSavedFilter;
    api.getSubscription = originalGetSubscription;
    api.listCompareGroups = originalListCompareGroups;
    api.createCompareGroup = originalCreateCompareGroup;
    api.addPositionToGroup = originalAddPositionToGroup;
    api.markSubscriptionSeen = originalMarkSubscriptionSeen;
    api.renameCompareGroup = originalRenameCompareGroup;
    api.deleteCompareGroup = originalDeleteCompareGroup;
    api.touchCompareGroup = originalTouchCompareGroup;
    api.setCompareGroupPinned = originalSetCompareGroupPinned;
    global.wx = previousWx;
    restoreApi();
  }
});

test("profile page should create blank compare groups from compare section", async () => {
  const restoreApi = patchApiForPageTest();
  const previousWx = global.wx;
  const toasts = [];
  const createdCompareGroups = [];
  const originalCreateCompareGroup = api.createCompareGroup;

  api.createCompareGroup = (name, examType, options = {}) => {
    createdCompareGroups.push({
      name,
      examType,
      options: clone(options)
    });
    return Promise.resolve({
      id: "group-created",
      name,
      examType,
      positionIds: [],
      originContext: clone(options.originContext || null),
      lastActionContext: clone(options.lastActionContext || null)
    });
  };

  global.wx = {
    showToast(payload) {
      toasts.push(payload);
    },
    navigateTo() {}
  };

  try {
    const definition = loadPageDefinition("../pages/profile/index.js");
    const page = createPageInstance(definition);

    page.onShow.call(page);
    await flushPromises();

    assert.equal(page.data.compareGroupExamTypeOptions.length >= 2, true);
    assert.equal(page.data.compareGroupSections[0].title, "广东省考");

    page.createCompareGroupByExamType.call(page, {
      currentTarget: {
        dataset: {
          examType: "national"
        }
      }
    });
    await flushPromises();

    assert.equal(createdCompareGroups.length, 1);
    assert.equal(createdCompareGroups[0].name, "国考方案");
    assert.equal(createdCompareGroups[0].examType, "national");
    assert.equal(createdCompareGroups[0].options.originContext.sourceEntry, "profile");
    assert.equal(createdCompareGroups[0].options.originContext.action, "create");
    assert.equal(page.data.compareGroups[0].id, "group-created");
    assert.equal(page.data.compareGroups[0].name, "国考方案");
    assert.equal(page.data.compareGroupSections[0].title, "国考");
    assert.equal(page.data.compareGroupSections[0].summary, "可复用 1 · 空方案 1 · 待确认 1");
    assert.equal(page.data.compareGroupSections[0].items[0].id, "group-created");
    assert.equal(page.data.compareGroups[0].managementLabel, "优先补位或删除");
    assert.ok(page.data.compareGroups[0].managementSummary.includes("当前还是空方案"));
    assert.equal(page.data.compareGroups[0].managementTags.some((item) => item.label === "0/4 岗位"), true);
    assert.equal(page.data.editingCompareGroupId, "group-created");
    assert.equal(page.data.compareGroupNameDraft, "国考方案");
    assert.equal(page.data.stats[2].value, 3);
    assert.ok(page.data.compareGroupHealth.summary.includes("已保存 3/20 组方案"));
    assert.equal(page.data.compareGroupHealth.tags.includes("待整理 1"), true);
    assert.equal(page.data.compareGroupHealth.tags.includes("剩余 17"), true);
    assert.equal(toasts[0].title, "已新建方案");
  } finally {
    api.createCompareGroup = originalCreateCompareGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("home page should surface latest notices and source status summary", async () => {
  const restoreApi = patchNoticePagesApi();
  const previousWx = global.wx;
  const navigations = [];
  const toasts = [];
  const addCalls = [];
  const originalGetSubscription = api.getSubscription;
  const originalListCompareGroups = api.listCompareGroups;
  const originalCreateCompareGroup = api.createCompareGroup;
  const originalAddPositionToGroup = api.addPositionToGroup;
  const originalMarkSubscriptionSeen = api.markSubscriptionSeen;

  api.getSubscription = () => Promise.resolve({
    id: "sub-1",
    name: "珠三角",
    examType: "guangdong-provincial",
    newPositionIds: ["position-1", "position-2"]
  });
  api.listCompareGroups = () => Promise.resolve([
    {
      id: "group-1",
      name: "广东岗位方案",
      examType: "guangdong-provincial",
      positionIds: ["position-1"]
    }
  ]);
  api.createCompareGroup = (name, examType) => Promise.resolve({
    id: `group-${name}`,
    name,
    examType,
    positionIds: []
  });
  api.addPositionToGroup = (groupId, positionId, context = {}) => {
    addCalls.push({ groupId, positionId, context: clone(context) });
    return Promise.resolve({
      id: groupId,
      positionIds: addCalls
        .filter((item) => item.groupId === groupId)
        .map((item) => item.positionId)
    });
  };
  api.markSubscriptionSeen = () => Promise.resolve({ id: "sub-1" });

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/home/index.js");
    const page = createPageInstance(definition);

    page.onShow.call(page);
    await flushPromises();

    assert.equal(page.data.heroStats.sourceCount, 1);
    assert.equal(page.data.latestNotices.length, 3);
    assert.equal(page.data.sourceStates[0].lastSuccessfulFetchedAt, "2026-06-09T09:50:00.000Z");
    assert.equal(page.data.sourceSummary.publishableCount, 0);
    assert.equal(page.data.sourceSummary.restrictedCount, 1);
    assert.equal(page.data.sourceSummary.gateFailureTypeSummary[0].count, 1);
    assert.equal(page.data.reviewSummary.total, 1);
    assert.equal(page.data.reviewSummary.blockingRelease, 1);
    assert.equal(page.data.reviewSummary.failedCheckTypeSummary[0].count, 1);
    assert.equal(page.data.sourceStates[0].publishGate.status, "notice-only");
    assert.equal(page.data.sourceStates[0].gateCheckSummary.failedCount, 1);
    assert.equal(page.data.sourceStates[0].nextAction.focus, "parse");
    assert.equal(page.data.sourceStates[0].publishGateTagClass, "tag-warn");
    assert.ok(page.data.sourceStates[0].riskSummary.detail);
    assert.equal(page.data.compareWorkspace.active, true);
    assert.equal(page.data.compareWorkspace.groupId, "group-1");
    assert.equal(page.data.compareWorkspace.groupName, "深圳方案");
    assert.equal(page.data.compareWorkspace.headline, "优先核对可报性");
    assert.ok(page.data.compareWorkspace.detail.includes("综合管理岗 最接近可报"));
    assert.equal(page.data.compareWorkspace.updatedAt, "2026-06-09 10:30");
    assert.equal(page.data.compareWorkspace.tags.includes("广东省考"), true);
    assert.equal(page.data.compareWorkspace.tags.includes("2 岗位"), true);
    assert.equal(page.data.compareWorkspace.tags.includes("待确认 1"), true);
    assert.equal(page.data.savedFilterWorkspace.active, true);
    assert.equal(page.data.savedFilterWorkspace.filterId, "filter-1");
    assert.equal(page.data.savedFilterWorkspace.filterName, "应届本科");
    assert.equal(page.data.savedFilterWorkspace.noticeId, "rsks-gd|notice-1");
    assert.equal(page.data.savedFilterWorkspace.headline, "适合继续收敛后直接对比");
    assert.ok(page.data.savedFilterWorkspace.detail.includes("当前命中 4 个岗位"));
    assert.equal(page.data.savedFilterWorkspace.tags.includes("命中 4"), true);
    assert.equal(page.data.savedFilterWorkspace.tags.includes("可直接对比"), true);
    assert.equal(page.data.savedFilterWorkspace.tags.includes("本科 · 应届"), true);
    assert.equal(page.data.latestNotices[0].title, "广东省2026年考试录用公务员公告");
    assert.equal(page.data.latestNotices[0].noticeProgressHint, "本批后续 1 条");
    assert.equal(page.data.latestNotices[0].noticeProgressDetail, "后续节点：资格审核");
    assert.equal(page.data.latestNotices[0].homePriorityLabel, "优先选岗");
    assert.ok(page.data.latestNotices[0].homePriorityDetail.includes("可直接按你的条件开始选岗"));
    assert.equal(page.data.latestNotices[0].noticeCompareSuggestion.mode, "reuse");
    assert.equal(page.data.latestNotices[0].trustAction.primaryLabel, "查看当前卡点");
    assert.equal(
      page.data.latestNotices[0].trustAction.primaryRoute,
      "/pages/source-status/index?sourceId=rsks-gd&focus=parse"
    );
    assert.equal(page.data.latestNotices[0].noticeCompareSuggestion.actionLabel, "带入 2 个岗位对比");
    assert.ok(page.data.latestNotices[0].noticeCompareSuggestion.hint.includes("广东岗位方案"));
    assert.equal(page.data.subscriptions[0].newPositionPreview[0].title, "综合管理岗");
    assert.equal(page.data.subscriptions[0].decisionSummary, "新增 1 个岗位 · 可报 1 个 · 待确认 0 个");
    assert.equal(page.data.subscriptions[0].bestMatchSummary, "综合管理岗 · 当前最匹配 · 专业名称命中:法学");
    assert.equal(page.data.subscriptions[0].nextActionSummary, "综合管理岗 · 可优先保留：当前没有明显硬门槛冲突，可继续保留。");
    assert.equal(page.data.subscriptions[0].compareSuggestion.mode, "reuse");
    assert.equal(page.data.subscriptions[0].compareHint, "可直接放入对比方案：广东岗位方案");
    assert.equal(page.data.subscriptions[0].compareReady, true);
    assert.equal(page.data.subscriptions[0].compareActionLabel, "直接对比新增命中");

    page.quickCompareLatestNotice.call(page, {
      currentTarget: {
        dataset: {
          id: "rsks-gd|notice-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(
      addCalls.map((item) => item.positionId),
      ["position-2"]
    );
    assert.equal(addCalls[0].groupId, "group-1");
    assert.equal(addCalls[0].context.sourceEntry, "home");
    assert.equal(addCalls[0].context.noticeId, "rsks-gd|notice-1");
    assert.equal(navigations[0], "/pages/compare/index?groupId=group-1");
    assert.equal(toasts[0].title, "已补充 1 个岗位");

    page.openTrustRoute.call(page, {
      currentTarget: {
        dataset: {
          route: page.data.latestNotices[0].trustAction.primaryRoute
        }
      }
    });
    assert.equal(navigations[1], "/pages/source-status/index?sourceId=rsks-gd&focus=parse");

    page.openLatestNotice.call(page, {
      currentTarget: {
        dataset: {
          id: "rsks-gd|notice-1"
        }
      }
    });
    assert.equal(navigations[2], "/pages/notice-detail/index?id=rsks-gd|notice-1");

    page.openCompareWorkspace.call(page);
    assert.equal(navigations[3], "/pages/compare/index?groupId=group-1");

    page.openSavedFilterWorkspace.call(page);
    assert.equal(
      navigations[4],
      "/pages/positions/index?noticeId=rsks-gd|notice-1&savedFilterId=filter-1"
    );

    page.openSubscription.call(page, {
      currentTarget: {
        dataset: {
          id: "sub-1",
          noticeId: "rsks-gd|notice-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();

    assert.equal(
      navigations[5],
      "/pages/positions/index?noticeId=rsks-gd|notice-1&subscriptionId=sub-1&newPositionIds=position-1%2Cposition-2"
    );

    page.goToReviewCenter.call(page);
    assert.equal(navigations[6], "/pages/review-center/index");

    api.listCompareGroups = () => Promise.resolve([]);
    page.quickCompareSubscription.call(page, {
      currentTarget: {
        dataset: {
          id: "sub-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(
      addCalls.map((item) => item.positionId),
      ["position-2", "position-1", "position-2"]
    );
    assert.equal(navigations[7], "/pages/compare/index?groupId=group-珠三角对比");
    assert.equal(toasts[1].title, "已加入岗位对比");
  } finally {
    api.getSubscription = originalGetSubscription;
    api.listCompareGroups = originalListCompareGroups;
    api.createCompareGroup = originalCreateCompareGroup;
    api.addPositionToGroup = originalAddPositionToGroup;
    api.markSubscriptionSeen = originalMarkSubscriptionSeen;
    global.wx = previousWx;
    restoreApi();
  }
});

test("home page should mix latest notices with higher-value selection entries", async () => {
  const restoreApi = patchNoticePagesApi();
  const previousGetDashboard = api.getDashboard;

  api.getDashboard = () => {
    const payload = buildDashboardPayload();
    payload.notices = [
      {
        id: "older-structured",
        title: "广东省2026年省直职位公告",
        area: "省直",
        examType: "guangdong-provincial",
        source: "广东省人事考试网",
        sourceMode: "official",
        publishedAt: "2026-05-01",
        registrationWindow: "2026-05-02 至 2026-05-08",
        hasStructuredPositions: true,
        noticeStageId: "main",
        noticeStageLabel: "主公告",
        noticeCompareCandidateIds: ["position-1", "position-2"],
        noticeCompareSuggestion: {
          mode: "reuse",
          ready: true,
          hint: "可直接把当前公告岗位补入对比方案：广东岗位方案",
          actionLabel: "带入 2 个岗位对比",
          groupId: "group-1",
          groupName: "广东岗位方案",
          nextCount: 1,
          candidateCount: 2,
          compatibleGroupCount: 1,
          totalPositionCount: 2
        }
      },
      {
        id: "recent-tracking",
        title: "广东省2026年资格审核公告",
        area: "广东",
        examType: "guangdong-provincial",
        source: "广东人社",
        sourceMode: "official",
        publishedAt: "2026-06-20",
        registrationWindow: "待官方补充",
        hasStructuredPositions: false,
        noticeStageId: "qualification-review",
        noticeStageLabel: "资格审核",
        noticeCompareCandidateIds: [],
        noticeCompareSuggestion: {
          mode: "",
          ready: false,
          hint: "",
          actionLabel: "",
          groupId: "",
          groupName: "",
          nextCount: 0,
          candidateCount: 0,
          compatibleGroupCount: 0,
          totalPositionCount: 0
        }
      },
      {
        id: "recent-national",
        title: "国考最新动态",
        area: "全国",
        examType: "national",
        source: "国家公务员局",
        sourceMode: "official",
        publishedAt: "2026-06-19",
        registrationWindow: "待官方补充",
        hasStructuredPositions: false,
        noticeStageId: "general",
        noticeStageLabel: "公告",
        noticeCompareCandidateIds: [],
        noticeCompareSuggestion: {
          mode: "",
          ready: false,
          hint: "",
          actionLabel: "",
          groupId: "",
          groupName: "",
          nextCount: 0,
          candidateCount: 0,
          compatibleGroupCount: 0,
          totalPositionCount: 0
        }
      },
      {
        id: "recent-main-no-positions",
        title: "广东省2026年报名提示",
        area: "广东",
        examType: "guangdong-provincial",
        source: "广东省人事考试网",
        sourceMode: "official",
        publishedAt: "2026-06-18",
        registrationWindow: "2026-06-18 至 2026-06-19",
        hasStructuredPositions: false,
        noticeStageId: "registration",
        noticeStageLabel: "报名",
        noticeCompareCandidateIds: [],
        noticeCompareSuggestion: {
          mode: "",
          ready: false,
          hint: "",
          actionLabel: "",
          groupId: "",
          groupName: "",
          nextCount: 0,
          candidateCount: 0,
          compatibleGroupCount: 0,
          totalPositionCount: 0
        }
      }
    ];
    return Promise.resolve(payload);
  };

  try {
    const definition = loadPageDefinition("../pages/home/index.js");
    const page = createPageInstance(definition);

    page.onShow.call(page);
    await flushPromises();

    assert.equal(page.data.latestNotices.length, 3);
    assert.equal(page.data.latestNotices[0].id, "older-structured");
    assert.equal(page.data.latestNotices[0].homePriorityLabel, "优先选岗");
    assert.ok(page.data.latestNotices[0].homePriorityDetail.includes("可直接按你的条件开始选岗"));
    assert.equal(page.data.latestNotices.some((item) => item.id === "recent-main-no-positions"), false);
    assert.equal(page.data.latestNotices[1].id, "recent-tracking");
    assert.equal(page.data.latestNotices[1].homePriorityLabel, "进度更新");
  } finally {
    api.getDashboard = previousGetDashboard;
    restoreApi();
  }
});

test("home page should open compare page directly when latest notice suggests reviewing full plans", async () => {
  const restoreApi = patchNoticePagesApi();
  const previousWx = global.wx;
  const previousGetDashboard = api.getDashboard;
  const previousCreateCompareGroup = api.createCompareGroup;
  const previousAddPositionToGroup = api.addPositionToGroup;
  const navigations = [];

  api.getDashboard = () => {
    const payload = buildDashboardPayload();
    payload.notices[0] = {
      ...payload.notices[0],
      noticeCompareCandidateIds: ["position-1", "position-2", "position-5"],
      noticeCompareSuggestion: {
        mode: "review-needed",
        ready: false,
        hint: "对比方案已达 20 组上限，建议先整理现有方案",
        actionLabel: "先去整理对比方案",
        groupId: "group-review",
        groupName: "广东岗位方案",
        nextCount: 0,
        candidateCount: 3,
        compatibleGroupCount: 20,
        totalPositionCount: 3
      }
    };
    return Promise.resolve(payload);
  };
  api.createCompareGroup = () => {
    throw new Error("should not create compare group");
  };
  api.addPositionToGroup = () => {
    throw new Error("should not add positions");
  };

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast() {}
  };

  try {
    const definition = loadPageDefinition("../pages/home/index.js");
    const page = createPageInstance(definition);

    page.onShow.call(page);
    await flushPromises();

    assert.equal(page.data.latestNotices[0].noticeCompareSuggestion.mode, "review-needed");
    assert.equal(page.data.latestNotices[0].noticeCompareSuggestion.actionLabel, "先去整理对比方案");

    page.quickCompareLatestNotice.call(page, {
      currentTarget: {
        dataset: {
          id: "rsks-gd|notice-1"
        }
      }
    });

    assert.equal(navigations[0], "/pages/compare/index?groupId=group-review");
  } finally {
    api.getDashboard = previousGetDashboard;
    api.createCompareGroup = previousCreateCompareGroup;
    api.addPositionToGroup = previousAddPositionToGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("home page should open compare page directly when subscription suggests reviewing full plans", async () => {
  const restoreApi = patchNoticePagesApi();
  const previousWx = global.wx;
  const navigations = [];
  const toasts = [];
  const originalGetSubscription = api.getSubscription;
  const originalCreateCompareGroup = api.createCompareGroup;
  const originalAddPositionToGroup = api.addPositionToGroup;

  api.getSubscription = () => Promise.resolve({
    id: "sub-1",
    name: "珠三角",
    examType: "guangdong-provincial",
    newPositionIds: ["position-1", "position-2"],
    compareSuggestion: {
      mode: "review-needed",
      ready: false,
      hint: "对比方案已达 20 组上限，建议先整理现有方案",
      actionLabel: "先去整理对比方案",
      groupId: "group-review",
      groupName: "广东岗位方案",
      nextCount: 0,
      candidateCount: 2,
      compatibleGroupCount: 20
    }
  });
  api.createCompareGroup = () => {
    throw new Error("should not create compare group");
  };
  api.addPositionToGroup = () => {
    throw new Error("should not add positions");
  };

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/home/index.js");
    const page = createPageInstance(definition);

    page.quickCompareSubscription.call(page, {
      currentTarget: {
        dataset: {
          id: "sub-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();

    assert.equal(navigations[0], "/pages/compare/index?groupId=group-review");
    assert.equal(toasts.length, 0);
  } finally {
    api.getSubscription = originalGetSubscription;
    api.createCompareGroup = originalCreateCompareGroup;
    api.addPositionToGroup = originalAddPositionToGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("notices page should filter structured notices", async () => {
  const restoreApi = patchNoticePagesApi();
  const previousWx = global.wx;
  const previousAddPositionToGroup = api.addPositionToGroup;
  const toasts = [];
  const navigations = [];
  const addCalls = [];

  api.addPositionToGroup = (groupId, positionId, context = {}) => {
    addCalls.push({ groupId, positionId, context: clone(context) });
    return previousAddPositionToGroup(groupId, positionId, context);
  };
  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/notices/index.js");
    const page = createPageInstance(definition);

    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.notices.length, 3);
    assert.equal(page.data.noticesSummary.headline, "优先处理 1 条可选岗公告");
    assert.ok(page.data.noticesSummary.detail.includes("广东省2026年考试录用公务员公告"));
    assert.equal(page.data.noticesSummary.tags.includes("可选岗 1"), true);
    assert.equal(page.data.noticesSummary.tags.includes("进度更新 1"), true);

    page.changeFilter.call(page, {
      currentTarget: {
        dataset: {
          id: "structured"
        }
      }
    });

    assert.equal(page.data.activeFilterId, "structured");
    assert.equal(page.data.notices.length, 1);
    assert.equal(page.data.notices[0].id, "rsks-gd|notice-1");
    assert.equal(page.data.noticesSummary.headline, "优先处理 1 条可选岗公告");
    assert.equal(page.data.allNotices[0].noticeNextAction.label, "先看岗位并核对原表");
    assert.ok(page.data.allNotices[0].noticeNextActionSummary.includes("字段仍建议结合原始岗位表复核"));
    assert.equal(page.data.allNotices[0].noticePriorityLabel, "优先选岗");
    assert.ok(page.data.allNotices[0].noticePriorityDetail.includes("广东岗位方案"));
    assert.equal(page.data.allNotices[0].noticeCompareSuggestion.mode, "reuse");
    assert.equal(page.data.allNotices[0].trustAction.primaryLabel, "查看当前卡点");
    assert.equal(
      page.data.allNotices[0].trustAction.primaryRoute,
      "/pages/source-status/index?sourceId=rsks-gd&focus=parse"
    );
    assert.equal(page.data.allNotices[0].noticeCompareSuggestion.actionLabel, "带入 2 个岗位对比");
    assert.ok(page.data.allNotices[0].noticeCompareSuggestion.hint.includes("广东岗位方案"));
    assert.equal(page.data.allNotices[1].noticeNextAction.label, "适合做进度追踪");
    assert.ok(page.data.allNotices[1].noticeNextActionSummary.includes("当前更适合跟进资格审核进度"));
    assert.equal(page.data.allNotices[1].noticePriorityLabel, "进度更新");
    assert.equal(page.data.allNotices[2].noticeNextAction.label, "先看公告和附件");
    assert.equal(page.data.allNotices[2].noticePriorityLabel, "信息观察");

    page.openTrustRoute.call(page, {
      currentTarget: {
        dataset: {
          route: page.data.allNotices[0].trustAction.primaryRoute
        }
      }
    });
    assert.equal(navigations[0], "/pages/source-status/index?sourceId=rsks-gd&focus=parse");

    page.handleCompareAction.call(page, {
      currentTarget: {
        dataset: {
          id: "rsks-gd|notice-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(
      addCalls.map((item) => item.positionId),
      ["position-2"]
    );
    assert.equal(addCalls[0].groupId, "group-1");
    assert.equal(addCalls[0].context.sourceEntry, "notices");
    assert.equal(addCalls[0].context.noticeId, "rsks-gd|notice-1");
    assert.equal(navigations[1], "/pages/compare/index?groupId=group-1");
    assert.equal(toasts[0].title, "已补充 1 个岗位");
  } finally {
    api.addPositionToGroup = previousAddPositionToGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("notices page should route quick compare to review when same-exam plans are full", async () => {
  const restoreApi = patchNoticePagesApi();
  const previousListCompareGroups = api.listCompareGroups;
  const previousListNotices = api.listNotices;
  const previousCreateCompareGroup = api.createCompareGroup;
  const previousAddPositionToGroup = api.addPositionToGroup;
  const previousWx = global.wx;
  const navigations = [];

  api.listCompareGroups = () => Promise.resolve(
    Array.from({ length: 20 }, (_, index) => ({
      id: `group-full-${index + 1}`,
      name: `满额方案${index + 1}`,
      examType: "guangdong-provincial",
      positionIds: ["position-1", "position-2", "position-3", "position-4"]
    }))
  );
  api.listNotices = () => Promise.resolve([
    {
      ...clone(buildNoticeFixtures()[0]),
      noticeTrust: clone(buildNoticeTrust()),
      noticeCompareCandidateIds: ["position-1", "position-2", "position-5"],
      noticeCompareSuggestion: {
        mode: "review-needed",
        ready: false,
        hint: "对比方案已达 20 组上限，建议先整理现有方案 当前公告共 3 个岗位，本次先带入前 3 个；如需更精确可先去岗位列表筛选。",
        actionLabel: "先去整理对比方案",
        groupId: "group-full-1",
        groupName: "满额方案1",
        nextCount: 0,
        candidateCount: 3,
        compatibleGroupCount: 20,
        totalPositionCount: 3
      }
    },
    clone(buildNoticeFixtures()[1]),
    clone(buildNoticeFixtures()[2])
  ]);
  api.createCompareGroup = () => {
    throw new Error("should not create compare group");
  };
  api.addPositionToGroup = () => {
    throw new Error("should not add positions");
  };

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast() {}
  };

  try {
    const definition = loadPageDefinition("../pages/notices/index.js");
    const page = createPageInstance(definition);

    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.noticesSummary.headline, "优先处理 1 条可选岗公告");
    assert.equal(page.data.allNotices[0].noticeCompareSuggestion.mode, "review-needed");
    assert.equal(page.data.allNotices[0].noticeCompareSuggestion.actionLabel, "先去整理对比方案");
    assert.ok(page.data.allNotices[0].noticeCompareSuggestion.hint.includes("20 组上限"));

    page.handleCompareAction.call(page, {
      currentTarget: {
        dataset: {
          id: "rsks-gd|notice-1"
        }
      }
    });

    assert.equal(navigations[0], "/pages/compare/index?groupId=group-full-1");
  } finally {
    api.listCompareGroups = previousListCompareGroups;
    api.listNotices = previousListNotices;
    api.createCompareGroup = previousCreateCompareGroup;
    api.addPositionToGroup = previousAddPositionToGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("notice-detail page should expose trust metadata and favorite state", async () => {
  const restoreApi = patchNoticePagesApi();
  const previousWx = global.wx;
  const toasts = [];
  const navigations = [];
  const addCalls = [];
  const originalAddPositionToGroup = api.addPositionToGroup;
  api.addPositionToGroup = (groupId, positionId, context = {}) => {
    addCalls.push({ groupId, positionId, context: clone(context) });
    return originalAddPositionToGroup(groupId, positionId, context);
  };
  global.wx = {
    showToast(payload) {
      toasts.push(payload);
    },
    navigateTo({ url }) {
      navigations.push(url);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/notice-detail/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { id: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();

    assert.equal(page.data.notice.title, "广东省2026年考试录用公务员公告");
    assert.equal(page.data.noticeTrust.trustLabel, "结构化需关注");
    assert.equal(page.data.sourceModeLabel, "官方");
    assert.equal(page.data.noticeTrust.lastSuccessfulFetchedAt, "2026-06-09T09:50:00.000Z");
    assert.equal(page.data.noticeTrust.publishGateLabel, "仅公告模式");
    assert.equal(page.data.noticeTrust.runStatusLabel, "已发布");
    assert.equal(page.data.canViewPositions, true);
    assert.equal(page.data.noticeBatch.year, "2026");
    assert.equal(page.data.noticeTimeline.length, 2);
    assert.equal(page.data.relatedNotices.length, 1);
    assert.equal(page.data.notice.noticeProgressHint, "本批后续 1 条");
    assert.equal(page.data.notice.noticeProgressDetail, "后续节点：资格审核");
    assert.equal(page.data.progressReminderOptions.length, 3);
    assert.equal(page.data.progressReminderSettings.qualificationReview, true);
    assert.equal(page.data.noticeNextAction.label, "先看岗位并核对原表");
    assert.equal(page.data.noticeNextAction.primaryActionType, "positions");
    assert.equal(page.data.noticeNextAction.primaryActionLabel, "去看岗位并核对");
    assert.ok(page.data.noticeNextActionSummary.includes("字段仍建议结合原始岗位表复核"));
    assert.equal(page.data.decisionPriority.label, "优先去选岗或对比");
    assert.ok(page.data.decisionPriority.summary.includes("广东岗位方案"));
    assert.equal(page.data.decisionPriority.tags.includes("可对比"), true);
    assert.equal(page.data.noticeCompareSuggestion.mode, "reuse");
    assert.equal(page.data.noticeCompareSuggestion.groupId, "group-1");
    assert.equal(page.data.noticeCompareSuggestion.actionLabel, "带入 2 个岗位对比");
    assert.ok(page.data.noticeCompareSuggestion.hint.includes("广东岗位方案"));
    assert.equal(page.data.trustAction.primaryLabel, "查看当前卡点");
    assert.equal(page.data.trustAction.primaryRoute, "/pages/source-status/index?sourceId=rsks-gd&focus=parse");

    page.openTrustRoute.call(page, {
      currentTarget: {
        dataset: {
          route: page.data.trustAction.primaryRoute
        }
      }
    });

    page.handlePrimaryAction.call(page);

    assert.equal(navigations[0], "/pages/source-status/index?sourceId=rsks-gd&focus=parse");
    assert.equal(navigations[1], "/pages/positions/index?noticeId=rsks-gd|notice-1");

    page.handleCompareAction.call(page);
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(
      addCalls.map((item) => item.positionId),
      ["position-2"]
    );
    assert.equal(addCalls[0].groupId, "group-1");
    assert.equal(addCalls[0].context.sourceEntry, "notice-detail");
    assert.equal(addCalls[0].context.noticeId, "rsks-gd|notice-1");
    assert.equal(navigations[2], "/pages/compare/index?groupId=group-1");
    assert.equal(toasts[0].title, "已补充 1 个岗位");

    page.toggleFavorite.call(page);
    await flushPromises();

    assert.equal(page.data.favorite, true);
    assert.equal(toasts[1].title, "已收藏公告");

    page.openRelatedNotice.call(page, {
      currentTarget: {
        dataset: {
          id: "ggfw-hrss-gd|notice-3"
        }
      }
    });

    assert.equal(navigations[3], "/pages/notice-detail/index?id=ggfw-hrss-gd|notice-3");

    page.toggleProgressReminderSetting.call(page, {
      currentTarget: {
        dataset: {
          id: "qualificationReview"
        }
      }
    });
    await flushPromises();

    assert.equal(page.data.progressReminderSettings.qualificationReview, false);
    assert.equal(toasts[2].title, "已关闭提醒");
  } finally {
    api.addPositionToGroup = originalAddPositionToGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("notice-detail page should guide later-stage notices back to tracking flow", async () => {
  const restoreApi = patchNoticePagesApi();
  const previousGetNoticeDetail = api.getNoticeDetail;
  const previousWx = global.wx;
  const navigations = [];

  api.getNoticeDetail = () => Promise.resolve({
    notice: {
      ...clone(buildNoticeFixtures()[1]),
      writtenExamAt: "待官方补充",
      attachments: ["资格审核名单.pdf"],
      positionCount: 0,
      url: "https://ggfw.hrss.gd.gov.cn/example",
      noticeTrust: {
        parseQualityStatus: "attachment-only",
        parseQualitySummary: "当前仅完成公告与附件解析，适合先追踪后续流程。",
        trustLabel: "仅公告未结构化"
      }
    },
    positions: [],
    noticeTrust: {
      parseQualityStatus: "attachment-only",
      parseQualitySummary: "当前仅完成公告与附件解析，适合先追踪后续流程。",
      trustLabel: "仅公告未结构化"
    },
    canViewPositions: false,
    favorite: false,
    progressReminderSettings: {
      qualificationReview: true,
      interview: true,
      final: true
    },
    progressReminderOptions: [
      { id: "qualificationReview", stageId: "qualification-review", label: "资格审核" },
      { id: "interview", stageId: "interview", label: "面试" },
      { id: "final", stageId: "final", label: "录用" }
    ],
    noticeBatch: {
      key: "guangdong-provincial:2026",
      year: "2026",
      examType: "guangdong-provincial",
      label: "2026年广东批次"
    },
    noticeTimeline: [
      {
        ...clone(buildNoticeFixtures()[0]),
        isCurrent: false
      },
      {
        ...clone(buildNoticeFixtures()[1]),
        isCurrent: true
      }
    ],
    relatedNotices: [clone(buildNoticeFixtures()[0])],
    noticeProgress: {
      currentStageLabel: "资格审核",
      relatedNoticeCount: 1,
      followingNoticeCount: 0,
      followingStageLabels: [],
      progressHint: "本批已识别 2 条公告",
      progressDetail: "当前位于已识别公告链的最新节点"
    }
  });

  global.wx = {
    showToast() {},
    navigateTo({ url }) {
      navigations.push(url);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/notice-detail/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { id: "ggfw-hrss-gd|notice-3" });
    page.onShow.call(page);
    await flushPromises();

    assert.equal(page.data.noticeNextAction.label, "适合做进度追踪");
    assert.equal(page.data.noticeNextAction.primaryActionType, "notice");
    assert.equal(page.data.noticeNextAction.primaryNoticeId, "rsks-gd|notice-1");
    assert.ok(page.data.noticeNextActionSummary.includes("当前更适合跟进资格审核进度"));
    assert.equal(page.data.decisionPriority.label, "优先跟进后续进度");
    assert.ok(page.data.decisionPriority.summary.includes("当前更适合跟进资格审核进度"));
    assert.equal(page.data.decisionPriority.tags.includes("进度追踪"), true);
    assert.equal(page.data.noticeCompareSuggestion.mode, "");

    page.handlePrimaryAction.call(page);

    assert.equal(navigations[0], "/pages/notice-detail/index?id=rsks-gd|notice-1");
  } finally {
    api.getNoticeDetail = previousGetNoticeDetail;
    global.wx = previousWx;
    restoreApi();
  }
});

test("notice-detail page should route compare action to review when same-exam plans are full", async () => {
  const restoreApi = patchNoticePagesApi();
  const previousListCompareGroups = api.listCompareGroups;
  const previousCreateCompareGroup = api.createCompareGroup;
  const previousAddPositionToGroup = api.addPositionToGroup;
  const previousGetNoticeDetail = api.getNoticeDetail;
  const previousWx = global.wx;
  const navigations = [];

  api.listCompareGroups = () => Promise.resolve(
    Array.from({ length: 20 }, (_, index) => ({
      id: `group-full-${index + 1}`,
      name: `满额方案${index + 1}`,
      examType: "guangdong-provincial",
      positionIds: ["position-1", "position-2", "position-3", "position-4"]
    }))
  );
  api.getNoticeDetail = () => Promise.resolve({
    notice: {
      ...clone(buildNoticeFixtures()[0]),
      writtenExamAt: "2026-07-01",
      attachments: ["职位表.xlsx"],
      positionCount: 3,
      url: "https://rsks.gd.gov.cn/example"
    },
    positions: [
      {
        id: "position-1",
        noticeId: "rsks-gd|notice-1",
        examType: "guangdong-provincial",
        title: "综合管理岗",
        agency: "广州市某单位"
      },
      {
        id: "position-2",
        noticeId: "rsks-gd|notice-1",
        examType: "guangdong-provincial",
        title: "执法岗",
        agency: "深圳市某单位"
      },
      {
        id: "position-5",
        noticeId: "rsks-gd|notice-1",
        examType: "guangdong-provincial",
        title: "文字综合岗",
        agency: "中山市某单位"
      }
    ],
    noticeTrust: clone(buildNoticeTrust()),
    canViewPositions: true,
    favorite: false,
    progressReminderSettings: {
      qualificationReview: true,
      interview: true,
      final: true
    },
    progressReminderOptions: [
      { id: "qualificationReview", stageId: "qualification-review", label: "资格审核" },
      { id: "interview", stageId: "interview", label: "面试" },
      { id: "final", stageId: "final", label: "录用" }
    ],
    noticeBatch: {
      key: "guangdong-provincial:2026",
      year: "2026",
      examType: "guangdong-provincial",
      label: "2026年广东批次"
    },
    noticeTimeline: [
      {
        ...clone(buildNoticeFixtures()[0]),
        isCurrent: true
      }
    ],
    relatedNotices: [],
    noticeProgress: {
      currentStageLabel: "主公告",
      relatedNoticeCount: 0,
      followingNoticeCount: 1,
      followingStageLabels: ["资格审核"],
      progressHint: "本批后续 1 条",
      progressDetail: "后续节点：资格审核"
    }
  });
  api.createCompareGroup = () => {
    throw new Error("should not create compare group");
  };
  api.addPositionToGroup = () => {
    throw new Error("should not add positions");
  };

  global.wx = {
    showToast() {},
    navigateTo({ url }) {
      navigations.push(url);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/notice-detail/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { id: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();

    assert.equal(page.data.noticeCompareSuggestion.mode, "review-needed");
    assert.equal(page.data.noticeCompareSuggestion.actionLabel, "先去整理对比方案");
    assert.ok(page.data.noticeCompareSuggestion.hint.includes("20 组上限"));

    page.handleCompareAction.call(page);

    assert.equal(navigations[0], "/pages/compare/index?groupId=group-full-1");
  } finally {
    api.listCompareGroups = previousListCompareGroups;
    api.createCompareGroup = previousCreateCompareGroup;
    api.addPositionToGroup = previousAddPositionToGroup;
    api.getNoticeDetail = previousGetNoticeDetail;
    global.wx = previousWx;
    restoreApi();
  }
});

test("notice-detail page should save per-notice reminder overrides", async () => {
  const originalSaveNoticeProgressReminderSettings = api.saveNoticeProgressReminderSettings;
  const restoreApi = patchNoticePagesApi();
  const previousWx = global.wx;
  const calls = [];

  api.saveNoticeProgressReminderSettings = (noticeId, input) => {
    calls.push({ noticeId, input: clone(input) });
    return Promise.resolve({
      settings: {
        qualificationReview: false,
        interview: true,
        final: true
      },
      options: [
        { id: "qualificationReview", stageId: "qualification-review", label: "资格审核" },
        { id: "interview", stageId: "interview", label: "面试" },
        { id: "final", stageId: "final", label: "录用" }
      ]
    });
  };

  global.wx = {
    showToast() {},
    navigateTo() {}
  };

  try {
    const definition = loadPageDefinition("../pages/notice-detail/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { id: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();

    page.toggleProgressReminderSetting.call(page, {
      currentTarget: {
        dataset: {
          id: "qualificationReview"
        }
      }
    });
    await flushPromises();

    assert.deepEqual(calls, [
      {
        noticeId: "rsks-gd|notice-1",
        input: {
          qualificationReview: false
        }
      }
    ]);
    assert.equal(page.data.progressReminderSettings.qualificationReview, false);
  } finally {
    api.saveNoticeProgressReminderSettings = originalSaveNoticeProgressReminderSettings;
    global.wx = previousWx;
    restoreApi();
  }
});

test("messages page should create a compare group from subscription hits", async () => {
  const { actionLog, restore } = patchMessagesApi();
  const previousWx = global.wx;
  const navigations = [];
  const toasts = [];
  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/messages/index.js");
    const page = createPageInstance(definition);

    page.onShow.call(page);
    await flushPromises();

    assert.equal(page.data.progressMessageCount, 1);
    assert.equal(page.data.subscriptionMessageCount, 1);
    assert.equal(page.data.alertMessageCount, 1);
    assert.equal(page.data.messages.length, 3);
    assert.equal(page.data.progressMessages.length, 1);
    assert.equal(page.data.subscriptionMessages.length, 1);
    assert.equal(page.data.alertMessages.length, 1);
    assert.equal(page.data.otherMessages.length, 0);
    assert.equal(page.data.progressMessages[0].noticeCompareSuggestion.mode, "reuse");
    assert.equal(page.data.progressMessages[0].compareActionLabel, "带入 2 个岗位对比");
    assert.equal(page.data.progressMessages[0].priorityLabel, "可直接进对比");
    assert.ok(page.data.progressMessages[0].prioritySummary.includes("广东岗位方案"));
    assert.equal(page.data.progressMessages[0].priorityTags.includes("可对比"), true);
    assert.ok(page.data.progressMessages[0].nextActionSummary.includes("适合做进度追踪"));
    assert.ok(page.data.progressMessages[0].compareFallbackSummary.includes("主公告"));
    assert.equal(page.data.subscriptionMessages[0].newPositionPreview[0].title, "综合管理岗");
    assert.equal(page.data.subscriptionMessages[0].summary, "新增 1 个岗位 · 可报 1 个 · 待确认 0 个");
    assert.equal(page.data.subscriptionMessages[0].bestMatchSummary, "综合管理岗 · 当前最匹配 · 专业名称命中:法学");
    assert.equal(page.data.subscriptionMessages[0].nextActionSummary, "综合管理岗 · 可优先保留：当前没有明显硬门槛冲突，可继续保留。");
    assert.equal(page.data.subscriptionMessages[0].priorityLabel, "优先处理新增命中");
    assert.equal(page.data.subscriptionMessages[0].prioritySummary, "新增 1 个岗位 · 可报 1 个 · 待确认 0 个");
    assert.equal(page.data.subscriptionMessages[0].priorityTags.includes("新增命中"), true);
    assert.equal(page.data.subscriptionMessages[0].priorityTags.includes("可对比"), true);
    assert.equal(page.data.subscriptionMessages[0].compareSuggestion.mode, "reuse");
    assert.equal(page.data.subscriptionMessages[0].compareHint, "可直接放入对比方案：广东岗位方案");
    assert.equal(page.data.subscriptionMessages[0].compareReady, true);
    assert.equal(page.data.subscriptionMessages[0].compareActionLabel, "直接对比新增命中");

    page.quickCompareMessage.call(page, {
      currentTarget: {
        dataset: {
          id: "msg-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(actionLog.markedMessages, ["msg-1"]);
    assert.deepEqual(actionLog.addedPositionIds, ["position-1", "position-2"]);
    assert.deepEqual(actionLog.markedSubscriptions, ["sub-1"]);
    assert.equal(navigations[0], "/pages/compare/index?groupId=group-quick");
    assert.equal(toasts[0].icon, "success");
  } finally {
    global.wx = previousWx;
    restore();
  }
});

test("messages page should quick compare from progress reminder by falling back to main notice positions", async () => {
  const { actionLog, restore } = patchMessagesApi();
  const previousWx = global.wx;
  const navigations = [];
  const toasts = [];

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/messages/index.js");
    const page = createPageInstance(definition);

    page.onShow.call(page);
    await flushPromises();

    page.quickCompareProgressMessage.call(page, {
      currentTarget: {
        dataset: {
          id: "msg-0"
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(actionLog.markedMessages, ["msg-0"]);
    assert.deepEqual(actionLog.addedPositionIds, ["position-1", "position-2"]);
    assert.deepEqual(actionLog.markedSubscriptions, []);
    assert.equal(navigations[0], "/pages/compare/index?groupId=group-quick");
    assert.equal(toasts[0].title, "已加入岗位对比");
  } finally {
    global.wx = previousWx;
    restore();
  }
});

test("messages page should reuse an existing compare group before creating a new one", async () => {
  const { actionLog, restore } = patchMessagesApi();
  const previousWx = global.wx;
  const navigations = [];
  const toasts = [];
  const originalListCompareGroups = api.listCompareGroups;
  const originalCreateCompareGroup = api.createCompareGroup;

  api.listCompareGroups = () => Promise.resolve([
    {
      id: "group-existing",
      name: "已有方案",
      examType: "guangdong-provincial",
      positionIds: ["position-3"],
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      }
    }
  ]);
  api.createCompareGroup = () => {
    throw new Error("should not create compare group");
  };

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/messages/index.js");
    const page = createPageInstance(definition);

    page.onShow.call(page);
    await flushPromises();

    page.quickCompareMessage.call(page, {
      currentTarget: {
        dataset: {
          id: "msg-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(actionLog.addedPositionIds, ["position-1", "position-2"]);
    assert.deepEqual(actionLog.markedSubscriptions, ["sub-1"]);
    assert.equal(navigations[0], "/pages/compare/index?groupId=group-existing");
    assert.equal(toasts[0].title, "已补充 2 个岗位");
  } finally {
    api.listCompareGroups = originalListCompareGroups;
    api.createCompareGroup = originalCreateCompareGroup;
    global.wx = previousWx;
    restore();
  }
});

test("messages page should open compare page directly when subscription suggests reviewing full plans", async () => {
  const { actionLog, restore } = patchMessagesApi();
  const previousWx = global.wx;
  const navigations = [];
  const toasts = [];
  const originalGetSubscription = api.getSubscription;
  const originalCreateCompareGroup = api.createCompareGroup;
  const originalAddPositionToGroup = api.addPositionToGroup;

  api.getSubscription = () => Promise.resolve({
    id: "sub-1",
    name: "珠三角",
    examType: "guangdong-provincial",
    newPositionIds: ["position-1", "position-2"],
    compareSuggestion: {
      mode: "review-needed",
      ready: false,
      hint: "对比方案已达 20 组上限，建议先整理现有方案",
      actionLabel: "先去整理对比方案",
      groupId: "group-review",
      groupName: "广东岗位方案",
      nextCount: 0,
      candidateCount: 2,
      compatibleGroupCount: 20
    }
  });
  api.createCompareGroup = () => {
    throw new Error("should not create compare group");
  };
  api.addPositionToGroup = () => {
    throw new Error("should not add positions");
  };

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/messages/index.js");
    const page = createPageInstance(definition);

    page.onShow.call(page);
    await flushPromises();

    page.quickCompareMessage.call(page, {
      currentTarget: {
        dataset: {
          id: "msg-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();

    assert.deepEqual(actionLog.markedMessages, ["msg-1"]);
    assert.deepEqual(actionLog.addedPositionIds, []);
    assert.deepEqual(actionLog.markedSubscriptions, []);
    assert.equal(navigations[0], "/pages/compare/index?groupId=group-review");
    assert.equal(toasts.length, 0);
  } finally {
    api.getSubscription = originalGetSubscription;
    api.createCompareGroup = originalCreateCompareGroup;
    api.addPositionToGroup = originalAddPositionToGroup;
    global.wx = previousWx;
    restore();
  }
});

test("messages page should preserve new subscription hits when opening positions", async () => {
  const { actionLog, restore } = patchMessagesApi();
  const previousWx = global.wx;
  const navigations = [];

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast() {}
  };

  try {
    const definition = loadPageDefinition("../pages/messages/index.js");
    const page = createPageInstance(definition);

    page.onShow.call(page);
    await flushPromises();
    assert.equal(page.data.subscriptionMessages[0].newPositionPreview[0].title, "综合管理岗");
    assert.equal(page.data.subscriptionMessages[0].compareReady, true);

    page.openMessage.call(page, {
      currentTarget: {
        dataset: {
          id: "msg-1"
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(actionLog.markedMessages, ["msg-1"]);
    assert.deepEqual(actionLog.markedSubscriptions, ["sub-1"]);
    assert.equal(
      navigations[0],
      "/pages/positions/index?noticeId=rsks-gd|notice-1&subscriptionId=sub-1&newPositionIds=position-1%2Cposition-2"
    );
  } finally {
    global.wx = previousWx;
    restore();
  }
});

test("positions page should surface trust metadata for notice and positions", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  const navigations = [];
  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast() {}
  };
  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { noticeId: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.noticeTrust.parseQualityStatus, "warning");
    assert.equal(page.data.noticeTrust.trustLabel, "结构化需关注");
    assert.equal(page.data.noticeTrust.lastSuccessfulFetchedAt, "2026-06-09T09:50:00.000Z");
    assert.equal(page.data.noticeTrust.publishGateLabel, "仅公告模式");
    assert.equal(page.data.noticeTrust.runStatusLabel, "已发布");
    assert.equal(page.data.trustAction.primaryLabel, "查看当前卡点");
    assert.equal(page.data.trustAction.primaryRoute, "/pages/source-status/index?sourceId=rsks-gd&focus=parse");
    assert.equal(page.data.positions.length, 2);
    assert.equal(page.data.positions[0].noticeTrust.sourceId, "rsks-gd");
    assert.ok(page.data.positions[0].majorMatchSummary.includes("专业名称命中"));
    assert.equal(page.data.positions[0].hasManualCorrections, true);
    assert.equal(page.data.positions[0].correctionSummary, "政治面貌、其他要求已人工纠错");
    assert.equal(page.data.eligibilitySummary.active, true);
    assert.equal(page.data.eligibilitySummary.matchedCount, 1);
    assert.equal(page.data.sortMode, "manual");
    assert.equal(page.data.currentGroupName, "广东岗位方案");
    assert.equal(page.data.screeningSummary.headline, "当前筛选结果适合直接进对比");
    assert.ok(page.data.screeningSummary.detail.includes("当前共 2 个岗位"));
    assert.equal(page.data.screeningSummary.tags.includes("可对比"), true);
    assert.equal(page.data.positions[0].eligibilityLabel, "条件匹配");
    assert.equal(page.data.positions[0].compareSuggestion.mode, "in-current-group");
    assert.equal(page.data.positions[0].compareActionLabel, "已在当前方案");
    assert.equal(page.data.positions[1].compareSuggestion.mode, "reuse");
    assert.equal(page.data.positions[1].compareActionLabel, "加入当前方案");
    assert.ok(page.data.positions[1].compareHint.includes("广东岗位方案"));
    assert.ok(page.data.positions[0].nextActionSummary.includes("先核对原表字段"));
    assert.ok(page.data.positions[1].nextActionSummary.includes("先核对报考条件"));
    assert.equal(page.data.currentResultsCompareSuggestion.mode, "reuse");
    assert.equal(page.data.currentResultsCompareSuggestion.actionLabel, "写入当前方案");
    assert.ok(page.data.currentResultsCompareSuggestion.hint.includes("广东岗位方案"));
    assert.ok(page.data.positions[1].mismatchReasons.includes("学历要求不匹配"));
    assert.equal(page.data.recommendedPositions[0].noticeTrust.trustLabel, "结构化需关注");
    assert.equal(page.data.recommendationContext.active, true);
    assert.equal(page.data.recommendationContext.basePositionId, "position-1");
    assert.equal(page.data.recommendationContext.baseTitle, "综合管理岗");
    assert.equal(page.data.recommendedPositions[0].profileHint, "对你更严格：多 5 项待确认");
    assert.ok(page.data.recommendedPositions[0].reasonSummary.includes("和综合管理岗相似"));
    assert.ok(page.data.recommendedPositions[0].reasonSummary.includes("和基准相比"));
    assert.ok(page.data.recommendedPositions[0].reasonSummary.includes("待确认"));
    assert.equal(page.data.recommendedPositions[0].eligibilityLabel, "5 项不匹配");
    assert.ok(page.data.recommendedPositions[0].nextActionSummary.includes("先核对报考条件"));
    assert.equal(page.data.recommendedPositions[0].compareSuggestion.mode, "reuse");
    assert.equal(page.data.recommendedPositions[0].compareActionLabel, "加入当前方案");
    assert.ok(page.data.recommendedPositions[0].compareHint.includes("广东岗位方案"));

    page.openTrustRoute.call(page, {
      currentTarget: {
        dataset: {
          route: page.data.trustAction.primaryRoute
        }
      }
    });
    assert.equal(navigations[0], "/pages/source-status/index?sourceId=rsks-gd&focus=parse");

    page.setData({
      allPositions: page.data.allPositions.slice().reverse()
    });
    page.applyFilters.call(page);
    assert.equal(page.data.positions[0].id, "position-2");

    page.changeSortMode.call(page, {
      currentTarget: {
        dataset: {
          mode: "eligibility"
        }
      }
    });
    assert.equal(page.data.sortMode, "eligibility");
    assert.equal(page.data.positions[0].id, "position-1");

    page.changeSortMode.call(page, {
      currentTarget: {
        dataset: {
          mode: "compare"
        }
      }
    });
    assert.equal(page.data.sortMode, "compare");
    assert.equal(page.data.positions[0].id, "position-1");

    page.toggleOnlyMatched.call(page);
    assert.equal(page.data.onlyMatchedMode, true);
    assert.equal(page.data.positions.length, 1);
    assert.equal(page.data.positions[0].id, "position-1");
    assert.equal(page.data.screeningSummary.headline, "先核对 综合管理岗");
    assert.equal(page.data.screeningSummary.tags.includes("只看匹配"), true);

    page.openProfile.call(page);
    assert.equal(navigations[1], "/pages/profile/index");
  } finally {
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should surface subscription hit context when opened from messages", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  global.wx = {
    navigateTo() {},
    showToast() {}
  };

  const originalGetSubscription = api.getSubscription;
  api.getSubscription = () => Promise.resolve({
    id: "sub-1",
    name: "广州本科订阅",
    summary: "地区:广州",
    currentMatchCount: 1,
    newMatchCount: 1,
    newPositionIds: ["position-1"],
    filters: {
      keyword: "",
      selectedArea: "广州",
      selectedEducation: "",
      selectedServiceRequirement: "",
      selectedPoliticalStatus: "",
      freshGraduateMode: ""
    }
  });

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, {
      noticeId: "rsks-gd|notice-1",
      subscriptionId: "sub-1",
      newPositionIds: "position-1"
    });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.referenceFilterInfo.type, "subscription");
    assert.equal(page.data.referenceFilterInfo.name, "广州本科订阅");
    assert.equal(page.data.referenceFilterInfo.summary, "地区:广州");
    assert.ok(page.data.referenceFilterInfo.ruleTags.includes("地区:广州"));
    assert.equal(page.data.referenceFilterInfo.currentMatchCount, 1);
    assert.equal(page.data.referenceFilterInfo.newMatchCount, 1);
    assert.equal(page.data.onlyNewSubscriptionHits, true);
    assert.equal(page.data.newSubscriptionHitCount, 1);
    assert.equal(page.data.selectedArea, "广州");
    assert.equal(page.data.positions.length, 1);
    assert.equal(page.data.positions[0].id, "position-1");
    assert.equal(page.data.positions[0].isNewSubscriptionHit, true);
    assert.equal(page.data.screeningSummary.headline, "优先处理新增命中");
    assert.ok(page.data.screeningSummary.detail.includes("新增命中 1 个岗位"));
    assert.equal(page.data.screeningSummary.tags.includes("新增命中 1"), true);
    assert.equal(page.data.screeningSummary.tags.includes("订阅回填"), true);

    page.toggleOnlyNewSubscriptionHits.call(page);
    assert.equal(page.data.onlyNewSubscriptionHits, false);
    assert.equal(page.data.positions.length, 1);
  } finally {
    api.getSubscription = originalGetSubscription;
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should restore and persist sort mode for saved filters", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  global.wx = {
    navigateTo() {},
    showToast() {}
  };

  const savedFilter = {
    id: "filter-1",
    name: "广州本科筛选",
    summary: "地区:广州",
    currentMatchCount: 1,
    filters: {
      keyword: "",
      selectedArea: "广州",
      selectedEducation: "",
      selectedServiceRequirement: "",
      selectedPoliticalStatus: "",
      freshGraduateMode: ""
    },
    viewPreferences: {
      sortMode: "compare"
    }
  };
  const originalGetSavedFilter = api.getSavedFilter;
  const originalSaveSavedFilterViewPreferences = api.saveSavedFilterViewPreferences;
  api.getSavedFilter = () => Promise.resolve(clone(savedFilter));
  api.saveSavedFilterViewPreferences = (_savedFilterId, viewPreferences) => {
    savedFilter.viewPreferences = {
      ...(savedFilter.viewPreferences || {}),
      ...clone(viewPreferences)
    };
    return Promise.resolve(clone(savedFilter));
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");

    const firstPage = createPageInstance(definition);
    firstPage.onLoad.call(firstPage, {
      noticeId: "rsks-gd|notice-1",
      savedFilterId: "filter-1"
    });
    firstPage.onShow.call(firstPage);
    await flushPromises();
    await flushPromises();

    assert.equal(firstPage.data.sortMode, "compare");
    assert.equal(firstPage.data.selectedArea, "广州");

    firstPage.changeSortMode.call(firstPage, {
      currentTarget: {
        dataset: {
          mode: "eligibility"
        }
      }
    });
    await flushPromises();
    assert.equal(savedFilter.viewPreferences.sortMode, "eligibility");

    const reopenedPage = createPageInstance(definition);
    reopenedPage.onLoad.call(reopenedPage, {
      noticeId: "rsks-gd|notice-1",
      savedFilterId: "filter-1"
    });
    reopenedPage.onShow.call(reopenedPage);
    await flushPromises();
    await flushPromises();

    assert.equal(reopenedPage.data.sortMode, "eligibility");
    assert.equal(reopenedPage.data.selectedArea, "广州");
  } finally {
    api.getSavedFilter = originalGetSavedFilter;
    api.saveSavedFilterViewPreferences = originalSaveSavedFilterViewPreferences;
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should restore and persist sort mode for subscriptions", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  global.wx = {
    navigateTo() {},
    showToast() {}
  };

  const subscription = {
    id: "sub-1",
    name: "广州岗位订阅",
    summary: "地区:广州",
    currentMatchCount: 1,
    newMatchCount: 1,
    newPositionIds: ["position-1"],
    filters: {
      keyword: "",
      selectedArea: "广州",
      selectedEducation: "",
      selectedServiceRequirement: "",
      selectedPoliticalStatus: "",
      freshGraduateMode: ""
    },
    viewPreferences: {
      sortMode: "compare"
    }
  };
  const originalGetSubscription = api.getSubscription;
  const originalSaveSubscriptionViewPreferences = api.saveSubscriptionViewPreferences;
  api.getSubscription = () => Promise.resolve(clone(subscription));
  api.saveSubscriptionViewPreferences = (_subscriptionId, viewPreferences) => {
    subscription.viewPreferences = {
      ...(subscription.viewPreferences || {}),
      ...clone(viewPreferences)
    };
    return Promise.resolve(clone(subscription));
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");

    const firstPage = createPageInstance(definition);
    firstPage.onLoad.call(firstPage, {
      noticeId: "rsks-gd|notice-1",
      subscriptionId: "sub-1"
    });
    firstPage.onShow.call(firstPage);
    await flushPromises();
    await flushPromises();

    assert.equal(firstPage.data.sortMode, "compare");
    assert.equal(firstPage.data.selectedArea, "广州");

    firstPage.changeSortMode.call(firstPage, {
      currentTarget: {
        dataset: {
          mode: "eligibility"
        }
      }
    });
    await flushPromises();
    assert.equal(subscription.viewPreferences.sortMode, "eligibility");

    const reopenedPage = createPageInstance(definition);
    reopenedPage.onLoad.call(reopenedPage, {
      noticeId: "rsks-gd|notice-1",
      subscriptionId: "sub-1"
    });
    reopenedPage.onShow.call(reopenedPage);
    await flushPromises();
    await flushPromises();

    assert.equal(reopenedPage.data.sortMode, "eligibility");
    assert.equal(reopenedPage.data.selectedArea, "广州");
  } finally {
    api.getSubscription = originalGetSubscription;
    api.saveSubscriptionViewPreferences = originalSaveSubscriptionViewPreferences;
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should add current filtered results into compare group", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const originalAddPositionToGroup = api.addPositionToGroup;
  const previousWx = global.wx;
  const addedPositionIds = [];
  const navigations = [];
  const toasts = [];

  api.addPositionToGroup = (groupId, positionId) => {
    addedPositionIds.push({ groupId, positionId });
    return Promise.resolve({
      id: groupId,
      positionIds: ["position-1", "position-2"]
    });
  };

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { noticeId: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    page.compareCurrentResults.call(page);
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.currentResultsCompareSuggestion.mode, "reuse");
    assert.equal(page.data.currentResultsCompareSuggestion.actionLabel, "写入当前方案");
    assert.deepEqual(addedPositionIds, [
      { groupId: "group-1", positionId: "position-2" }
    ]);
    assert.equal(page.data.lastCompareStatus, "reused");
    assert.equal(page.data.lastCompareTargetGroupId, "group-1");
    assert.equal(page.data.lastCompareTargetGroupName, "广东岗位方案");
    assert.equal(navigations[0], "/pages/compare/index?groupId=group-1");
    assert.equal(toasts[0].icon, "success");
  } finally {
    api.addPositionToGroup = originalAddPositionToGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should open existing compare group when current results are already covered", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  const originalListCompareGroups = api.listCompareGroups;
  const originalAddPositionToGroup = api.addPositionToGroup;
  const originalCreateCompareGroup = api.createCompareGroup;
  const navigations = [];
  const toasts = [];
  const addedPositionIds = [];

  api.listCompareGroups = () => Promise.resolve([
    {
      id: "group-covered",
      name: "已覆盖方案",
      examType: "guangdong-provincial",
      positionIds: ["position-1", "position-2"],
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      }
    }
  ]);
  api.addPositionToGroup = (groupId, positionId) => {
    addedPositionIds.push({ groupId, positionId });
    return Promise.resolve({ id: groupId, positionIds: ["position-1", "position-2"] });
  };
  api.createCompareGroup = () => {
    throw new Error("should not create compare group");
  };

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { noticeId: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    page.compareCurrentResults.call(page);
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.currentResultsCompareSuggestion.mode, "open-existing");
    assert.equal(page.data.currentResultsCompareSuggestion.actionLabel, "打开当前方案");
    assert.deepEqual(addedPositionIds, []);
    assert.equal(page.data.currentGroupId, "group-covered");
    assert.equal(page.data.currentGroupName, "已覆盖方案");
    assert.equal(page.data.lastCompareStatus, "existing");
    assert.equal(page.data.lastCompareTargetGroupId, "group-covered");
    assert.equal(page.data.lastCompareTargetGroupName, "已覆盖方案");
    assert.equal(navigations[0], "/pages/compare/index?groupId=group-covered");
    assert.equal(toasts[0].title, "已打开已有对比方案");
  } finally {
    api.listCompareGroups = originalListCompareGroups;
    api.addPositionToGroup = originalAddPositionToGroup;
    api.createCompareGroup = originalCreateCompareGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should prefer the current selected compare group when batching results", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  const originalListCompareGroups = api.listCompareGroups;
  const originalAddPositionToGroup = api.addPositionToGroup;
  const originalCreateCompareGroup = api.createCompareGroup;
  const navigations = [];
  const toasts = [];
  const addedPositionIds = [];

  api.listCompareGroups = () => Promise.resolve([
    {
      id: "group-larger",
      name: "更大方案",
      examType: "guangdong-provincial",
      positionIds: ["position-1", "position-3"],
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      }
    },
    {
      id: "group-manual",
      name: "当前方案",
      examType: "guangdong-provincial",
      positionIds: ["position-1"],
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      }
    }
  ]);
  api.addPositionToGroup = (groupId, positionId) => {
    addedPositionIds.push({ groupId, positionId });
    return Promise.resolve({
      id: groupId,
      positionIds: groupId === "group-manual"
        ? ["position-1", "position-2"]
        : ["position-1", "position-2", "position-3"]
    });
  };
  api.createCompareGroup = () => {
    throw new Error("should not create compare group");
  };

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { noticeId: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    page.changeGroup.call(page, {
      currentTarget: {
        dataset: {
          id: "group-manual"
        }
      }
    });

    page.compareCurrentResults.call(page);
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.currentResultsCompareSuggestion.mode, "reuse");
    assert.equal(page.data.currentResultsCompareSuggestion.actionLabel, "写入当前方案");
    assert.deepEqual(addedPositionIds, [
      { groupId: "group-manual", positionId: "position-2" }
    ]);
    assert.equal(page.data.currentGroupId, "group-manual");
    assert.equal(page.data.currentGroupName, "当前方案");
    assert.equal(page.data.lastCompareStatus, "reused");
    assert.equal(page.data.lastCompareTargetGroupId, "group-manual");
    assert.equal(page.data.lastCompareTargetGroupName, "当前方案");
    assert.equal(navigations[0], "/pages/compare/index?groupId=group-manual");
    assert.equal(toasts[0].icon, "success");
  } finally {
    api.listCompareGroups = originalListCompareGroups;
    api.addPositionToGroup = originalAddPositionToGroup;
    api.createCompareGroup = originalCreateCompareGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should prefer the current selected compare group when adding a single position", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  const originalListCompareGroups = api.listCompareGroups;
  const originalAddPositionToGroup = api.addPositionToGroup;
  const originalCreateCompareGroup = api.createCompareGroup;
  const toasts = [];
  const addedPositionIds = [];

  api.listCompareGroups = () => Promise.resolve([
    {
      id: "group-larger",
      name: "更大方案",
      examType: "guangdong-provincial",
      positionIds: ["position-1", "position-3"],
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      }
    },
    {
      id: "group-manual",
      name: "当前方案",
      examType: "guangdong-provincial",
      positionIds: ["position-1"],
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      }
    }
  ]);
  api.addPositionToGroup = (groupId, positionId) => {
    addedPositionIds.push({ groupId, positionId });
    return Promise.resolve({
      id: groupId,
      positionIds: groupId === "group-manual"
        ? ["position-1", "position-2"]
        : ["position-1", "position-2", "position-3"]
    });
  };
  api.createCompareGroup = () => {
    throw new Error("should not create compare group");
  };

  global.wx = {
    navigateTo() {},
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { noticeId: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    page.changeGroup.call(page, {
      currentTarget: {
        dataset: {
          id: "group-manual"
        }
      }
    });

    page.addToCompare.call(page, {
      currentTarget: {
        dataset: {
          id: "position-2"
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(addedPositionIds, [
      { groupId: "group-manual", positionId: "position-2" }
    ]);
    assert.equal(page.data.currentGroupId, "group-manual");
    assert.equal(page.data.currentGroupName, "当前方案");
    assert.equal(page.data.lastCompareStatus, "reused");
    assert.equal(page.data.lastCompareTargetGroupId, "group-manual");
    assert.equal(page.data.lastCompareTargetGroupName, "当前方案");
    assert.equal(toasts[0].icon, "success");
  } finally {
    api.listCompareGroups = originalListCompareGroups;
    api.addPositionToGroup = originalAddPositionToGroup;
    api.createCompareGroup = originalCreateCompareGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should fall back to another compatible group when the current group is full", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  const originalListCompareGroups = api.listCompareGroups;
  const originalAddPositionToGroup = api.addPositionToGroup;
  const originalCreateCompareGroup = api.createCompareGroup;
  const toasts = [];
  const addedPositionIds = [];

  api.listCompareGroups = () => Promise.resolve([
    {
      id: "group-full",
      name: "已满方案",
      examType: "guangdong-provincial",
      positionIds: ["position-1", "position-3", "position-4", "position-5"],
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      }
    },
    {
      id: "group-open",
      name: "可补位方案",
      examType: "guangdong-provincial",
      positionIds: ["position-3"],
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      }
    }
  ]);
  api.addPositionToGroup = (groupId, positionId) => {
    addedPositionIds.push({ groupId, positionId });
    return Promise.resolve({
      id: groupId,
      positionIds: groupId === "group-open"
        ? ["position-2", "position-3"]
        : ["position-1", "position-3", "position-4", "position-5"]
    });
  };
  api.createCompareGroup = () => {
    throw new Error("should not create compare group");
  };

  global.wx = {
    navigateTo() {},
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { noticeId: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    page.changeGroup.call(page, {
      currentTarget: {
        dataset: {
          id: "group-full"
        }
      }
    });

    page.addToCompare.call(page, {
      currentTarget: {
        dataset: {
          id: "position-2"
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(addedPositionIds, [
      { groupId: "group-open", positionId: "position-2" }
    ]);
    assert.equal(page.data.currentGroupId, "group-open");
    assert.equal(page.data.currentGroupName, "可补位方案");
    assert.equal(page.data.lastCompareStatus, "reused");
    assert.equal(page.data.lastCompareTargetGroupId, "group-open");
    assert.equal(page.data.lastCompareTargetGroupName, "可补位方案");
    assert.equal(toasts[0].icon, "success");
  } finally {
    api.listCompareGroups = originalListCompareGroups;
    api.addPositionToGroup = originalAddPositionToGroup;
    api.createCompareGroup = originalCreateCompareGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should show replacement suggestions when current compare group is full and no alternative group has room", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  const originalListCompareGroups = api.listCompareGroups;
  const originalGetCompareGroupDetail = api.getCompareGroupDetail;
  const originalAddPositionToGroup = api.addPositionToGroup;
  const getCompareGroupDetailCalls = [];
  const addedPositionIds = [];
  const toasts = [];

  api.listCompareGroups = () => Promise.resolve([
    {
      id: "group-full",
      name: "已满方案",
      examType: "guangdong-provincial",
      positionIds: ["position-1", "position-3", "position-4", "position-5"],
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      }
    },
    {
      id: "group-other-full",
      name: "其他已满方案",
      examType: "guangdong-provincial",
      positionIds: ["position-6", "position-7", "position-8", "position-9"],
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      }
    }
  ]);
  api.getCompareGroupDetail = (groupId) => {
    getCompareGroupDetailCalls.push(groupId);
    return Promise.resolve({
      group: {
        id: "group-full",
        name: "已满方案",
        examType: "guangdong-provincial",
        positionIds: ["position-1", "position-3", "position-4", "position-5"]
      },
      positions: [
        {
          id: "position-1",
          noticeId: "rsks-gd|notice-1",
          examType: "guangdong-provincial",
          agency: "广州市某单位",
          title: "综合管理岗",
          headcount: 1,
          area: "广州",
          education: "本科",
          degree: "学士",
          major: "法学",
          serviceRequirement: "2年基层经历",
          freshGraduateOnly: true,
          politicalStatus: "不限"
        },
        {
          id: "position-3",
          noticeId: "rsks-gd|notice-1",
          examType: "guangdong-provincial",
          agency: "佛山市某单位",
          title: "财务岗",
          headcount: 1,
          area: "佛山",
          education: "硕士",
          degree: "硕士",
          major: "会计",
          serviceRequirement: "2年基层经历",
          freshGraduateOnly: true,
          politicalStatus: "中共党员"
        },
        {
          id: "position-4",
          noticeId: "rsks-gd|notice-1",
          examType: "guangdong-provincial",
          agency: "东莞市某单位",
          title: "执法岗",
          headcount: 1,
          area: "东莞",
          education: "硕士",
          degree: "硕士",
          major: "公安学",
          serviceRequirement: "2年基层经历",
          freshGraduateOnly: true,
          politicalStatus: "中共党员"
        },
        {
          id: "position-5",
          noticeId: "rsks-gd|notice-1",
          examType: "guangdong-provincial",
          agency: "中山市某单位",
          title: "文字综合岗",
          headcount: 1,
          area: "中山",
          education: "硕士",
          degree: "硕士",
          major: "新闻传播",
          serviceRequirement: "2年基层经历",
          freshGraduateOnly: true,
          politicalStatus: "中共党员"
        }
      ]
    });
  };
  api.addPositionToGroup = (groupId, positionId) => {
    addedPositionIds.push({ groupId, positionId });
    return Promise.resolve({
      id: groupId,
      positionIds: ["position-1", "position-2", "position-3", "position-4"]
    });
  };

  global.wx = {
    navigateTo() {},
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { noticeId: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    page.changeGroup.call(page, {
      currentTarget: {
        dataset: {
          id: "group-full"
        }
      }
    });

    page.addToCompare.call(page, {
      currentTarget: {
        dataset: {
          id: "position-2"
        }
      }
    });
    await flushPromises();
    await flushPromises();

    assert.deepEqual(getCompareGroupDetailCalls, ["group-full"]);
    assert.deepEqual(addedPositionIds, []);
    assert.equal(page.data.replacementSuggestion.active, true);
    assert.equal(page.data.replacementSuggestion.targetGroupId, "group-full");
    assert.equal(page.data.replacementSuggestion.incomingPositionId, "position-2");
    assert.equal(page.data.replacementSuggestion.incomingPositionTitle, "执法岗");
    assert.equal(page.data.replacementSuggestion.suggestions.length, 4);
    assert.equal(
      page.data.replacementSuggestion.suggestions.some((item) => item.removePositionId === "position-1"),
      true
    );
    assert.equal(
      page.data.replacementSuggestion.suggestions.every((item) => Array.isArray(item.reasons)),
      true
    );
    assert.equal(toasts.length, 0);
  } finally {
    api.listCompareGroups = originalListCompareGroups;
    api.getCompareGroupDetail = originalGetCompareGroupDetail;
    api.addPositionToGroup = originalAddPositionToGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should replace a position from a full compare group after applying suggestion", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  const originalListCompareGroups = api.listCompareGroups;
  const originalGetCompareGroupDetail = api.getCompareGroupDetail;
  const originalRemovePositionFromGroup = api.removePositionFromGroup;
  const originalAddPositionToGroup = api.addPositionToGroup;
  const toasts = [];
  const removedPositionIds = [];
  const addedPositionIds = [];

  const groups = [
    {
      id: "group-full",
      name: "已满方案",
      examType: "guangdong-provincial",
      positionIds: ["position-1", "position-3", "position-4", "position-5"],
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      }
    }
  ];
  const groupPositions = [
    {
      id: "position-1",
      noticeId: "rsks-gd|notice-1",
      examType: "guangdong-provincial",
      agency: "广州市某单位",
      title: "综合管理岗",
      headcount: 1,
      area: "广州",
      education: "本科",
      degree: "学士",
      major: "法学",
      serviceRequirement: "2年基层经历",
      freshGraduateOnly: true,
      politicalStatus: "不限"
    },
    {
      id: "position-3",
      noticeId: "rsks-gd|notice-1",
      examType: "guangdong-provincial",
      agency: "佛山市某单位",
      title: "财务岗",
      headcount: 1,
      area: "佛山",
      education: "硕士",
      degree: "硕士",
      major: "会计",
      serviceRequirement: "2年基层经历",
      freshGraduateOnly: true,
      politicalStatus: "中共党员"
    },
    {
      id: "position-4",
      noticeId: "rsks-gd|notice-1",
      examType: "guangdong-provincial",
      agency: "东莞市某单位",
      title: "执法岗",
      headcount: 1,
      area: "东莞",
      education: "硕士",
      degree: "硕士",
      major: "公安学",
      serviceRequirement: "2年基层经历",
      freshGraduateOnly: true,
      politicalStatus: "中共党员"
    },
    {
      id: "position-5",
      noticeId: "rsks-gd|notice-1",
      examType: "guangdong-provincial",
      agency: "中山市某单位",
      title: "文字综合岗",
      headcount: 1,
      area: "中山",
      education: "硕士",
      degree: "硕士",
      major: "新闻传播",
      serviceRequirement: "2年基层经历",
      freshGraduateOnly: true,
      politicalStatus: "中共党员"
    }
  ];

  api.listCompareGroups = () => Promise.resolve(clone(groups));
  api.getCompareGroupDetail = () => Promise.resolve({
    group: clone(groups[0]),
    positions: clone(groupPositions)
  });
  api.removePositionFromGroup = (groupId, positionId) => {
    removedPositionIds.push({ groupId, positionId });
    groups[0] = {
      ...groups[0],
      positionIds: groups[0].positionIds.filter((item) => item !== positionId)
    };
    return Promise.resolve(clone(groups[0]));
  };
  api.addPositionToGroup = (groupId, positionId, context) => {
    addedPositionIds.push({ groupId, positionId, context });
    groups[0] = {
      ...groups[0],
      positionIds: groups[0].positionIds.concat(positionId)
    };
    return Promise.resolve(clone(groups[0]));
  };

  global.wx = {
    navigateTo() {},
    showToast(payload) {
      toasts.push(payload);
    }
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { noticeId: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    page.changeGroup.call(page, {
      currentTarget: {
        dataset: {
          id: "group-full"
        }
      }
    });

    page.addToCompare.call(page, {
      currentTarget: {
        dataset: {
          id: "position-2"
        }
      }
    });
    await flushPromises();
    await flushPromises();

    const removeId = page.data.replacementSuggestion.suggestions[0].removePositionId;
    page.applyReplacementSuggestion.call(page, {
      currentTarget: {
        dataset: {
          removeId
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.deepEqual(removedPositionIds, [
      { groupId: "group-full", positionId: removeId }
    ]);
    assert.equal(addedPositionIds.length, 1);
    assert.equal(addedPositionIds[0].groupId, "group-full");
    assert.equal(addedPositionIds[0].positionId, "position-2");
    assert.equal(addedPositionIds[0].context.action, "replace");
    assert.deepEqual(addedPositionIds[0].context.positionIds, ["position-2"]);
    assert.equal(page.data.replacementSuggestion.active, false);
    assert.equal(page.data.currentGroupId, "group-full");
    assert.equal(page.data.currentGroupName, "已满方案");
    assert.equal(page.data.lastCompareStatus, "replaced");
    assert.equal(page.data.lastCompareTargetGroupId, "group-full");
    assert.equal(page.data.lastCompareTargetGroupName, "已满方案");
    assert.equal(page.data.currentGroupSize, 4);
    assert.equal(toasts[toasts.length - 1].icon, "success");
  } finally {
    api.listCompareGroups = originalListCompareGroups;
    api.getCompareGroupDetail = originalGetCompareGroupDetail;
    api.removePositionFromGroup = originalRemovePositionFromGroup;
    api.addPositionToGroup = originalAddPositionToGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should ignore incompatible compare groups and default to same-exam group", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  const originalListCompareGroups = api.listCompareGroups;

  api.listCompareGroups = () => Promise.resolve([
    {
      id: "group-national",
      name: "鍥借€冩柟妗?",
      examType: "national",
      positionIds: ["national-position-1"]
    },
    {
      id: "group-gd",
      name: "骞夸笢鏂规",
      examType: "guangdong-provincial",
      positionIds: ["position-1"]
    }
  ]);

  global.wx = {
    navigateTo() {},
    showToast() {}
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { noticeId: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.compareGroups.length, 1);
    assert.equal(page.data.compareGroups[0].id, "group-gd");
    assert.equal(page.data.currentGroupId, "group-gd");
    assert.equal(page.data.positions[0].inCompare, true);
    assert.equal(page.data.currentGroupSize, 1);
  } finally {
    api.listCompareGroups = originalListCompareGroups;
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should leave current group empty when only incompatible groups exist", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  const originalListCompareGroups = api.listCompareGroups;

  api.listCompareGroups = () => Promise.resolve([
    {
      id: "group-national",
      name: "鍥借€冩柟妗?",
      examType: "national",
      positionIds: ["national-position-1"]
    }
  ]);

  global.wx = {
    navigateTo() {},
    showToast() {}
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { noticeId: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.compareGroups.length, 0);
    assert.equal(page.data.currentGroupId, "");
    assert.equal(page.data.currentGroupSize, 0);
    assert.equal(page.data.positions.every((item) => item.inCompare === false), true);
  } finally {
    api.listCompareGroups = originalListCompareGroups;
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should route full-plan replacement flow to compare page review when no new group can be created", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  const originalListCompareGroups = api.listCompareGroups;
  const originalCreateCompareGroup = api.createCompareGroup;
  const originalAddPositionToGroup = api.addPositionToGroup;
  const navigations = [];

  api.listCompareGroups = () => Promise.resolve(
    Array.from({ length: 20 }, (_, index) => ({
      id: `group-full-${index + 1}`,
      name: `满额方案${index + 1}`,
      examType: "guangdong-provincial",
      positionIds: ["position-1", "position-3", "position-4", "position-5"],
      isPinned: index === 0,
      pinnedAt: index === 0 ? "2026-06-09T09:00:00.000Z" : "",
      lastUsedAt: `2026-06-09T${String(20 - index).padStart(2, "0")}:00:00.000Z`
    }))
  );
  api.createCompareGroup = () => {
    throw new Error("should not create compare group");
  };
  api.addPositionToGroup = () => {
    throw new Error("should not add positions");
  };

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast() {}
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { noticeId: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.positions[1].compareSuggestion.mode, "replacement-needed");
    assert.equal(page.data.positions[1].compareActionLabel, "先看替换建议");

    page.addToCompare.call(page, {
      currentTarget: {
        dataset: {
          id: "position-2"
        }
      }
    });
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.replacementSuggestion.active, true);
    assert.equal(page.data.replacementSuggestion.canCreateNewGroup, false);
    assert.equal(page.data.replacementSuggestion.createNewGroupActionLabel, "先去整理对比方案");
    assert.ok(page.data.replacementSuggestion.createNewGroupHint.includes("20 组上限"));

    page.createNewCompareGroupForIncomingPosition.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(navigations[0], "/pages/compare/index?groupId=group-full-1");
  } finally {
    api.listCompareGroups = originalListCompareGroups;
    api.createCompareGroup = originalCreateCompareGroup;
    api.addPositionToGroup = originalAddPositionToGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should route batch compare to review when all same-exam plans are full and limit is reached", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  const originalListCompareGroups = api.listCompareGroups;
  const originalCreateCompareGroup = api.createCompareGroup;
  const originalAddPositionToGroup = api.addPositionToGroup;
  const navigations = [];

  api.listCompareGroups = () => Promise.resolve(
    Array.from({ length: 20 }, (_, index) => ({
      id: `group-full-${index + 1}`,
      name: `满额方案${index + 1}`,
      examType: "guangdong-provincial",
      positionIds: ["position-1", "position-3", "position-4", "position-5"],
      isPinned: index === 0,
      pinnedAt: index === 0 ? "2026-06-09T09:00:00.000Z" : "",
      lastUsedAt: `2026-06-09T${String(20 - index).padStart(2, "0")}:00:00.000Z`
    }))
  );
  api.createCompareGroup = () => {
    throw new Error("should not create compare group");
  };
  api.addPositionToGroup = () => {
    throw new Error("should not add positions");
  };

  global.wx = {
    navigateTo({ url }) {
      navigations.push(url);
    },
    showToast() {}
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { noticeId: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.currentResultsCompareSuggestion.mode, "review-needed");
    assert.equal(page.data.currentResultsCompareSuggestion.actionLabel, "先去整理对比方案");
    assert.ok(page.data.currentResultsCompareSuggestion.hint.includes("20 组上限"));

    page.compareCurrentResults.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(navigations[0], "/pages/compare/index?groupId=group-full-1");
  } finally {
    api.listCompareGroups = originalListCompareGroups;
    api.createCompareGroup = originalCreateCompareGroup;
    api.addPositionToGroup = originalAddPositionToGroup;
    global.wx = previousWx;
    restoreApi();
  }
});

test("compare page should map trust metadata and rule summary into columns", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  const navigations = [];
  const toasts = [];
  const clipboardWrites = [];
  const originalAddPositionToGroup = api.addPositionToGroup;
  const addCalls = [];
  api.addPositionToGroup = (groupId, positionId, context = {}) => {
    addCalls.push({ groupId, positionId, context: clone(context) });
    return Promise.resolve({
      id: groupId,
      name: "广东岗位方案",
      examType: "guangdong-provincial",
      positionIds: ["position-1", "position-2"]
    });
  };
  global.wx = {
    showToast(payload) {
      toasts.push(payload);
    },
    navigateTo({ url }) {
      navigations.push(url);
    },
    setClipboardData({ data, success }) {
      clipboardWrites.push(data);
      if (typeof success === "function") {
        success();
      }
    }
  };

  try {
    const definition = loadPageDefinition("../pages/compare/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { groupId: "group-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.positions.length, 2);
    assert.equal(page.data.contextSummary.originLabel, "最初来源");
    assert.ok(page.data.contextSummary.originSummary.includes("订阅命中"));
    assert.ok(page.data.contextSummary.originSummary.includes("消息提醒"));
    assert.ok(page.data.contextSummary.originSummary.includes("珠三角订阅"));
    assert.equal(page.data.contextSummary.lastActionLabel, "最近更新");
    assert.ok(page.data.contextSummary.lastActionSummary.includes("岗位列表"));
    assert.ok(page.data.contextSummary.lastActionSummary.includes("补充岗位"));
    assert.equal(page.data.noticeContextSummary.active, true);
    assert.equal(page.data.noticeContextSummary.sameNotice, true);
    assert.equal(page.data.noticeContextSummary.noticeCount, 1);
    assert.equal(page.data.noticeContextSummary.headline, "当前对比组来自同一公告");
    assert.ok(page.data.noticeContextSummary.detail.includes("广东省考公告"));
    assert.ok(page.data.noticeContextSummary.detail.includes("阶段：主公告"));
    assert.ok(page.data.noticeContextSummary.detail.includes("最近发布时间：2026-01-01"));
    assert.equal(page.data.noticeContextSummary.items[0].summary, "主公告 · 2026-01-01 · 广东 · 2 个岗位");
    assert.equal(page.data.positions[0].trustLabel, "结构化需关注");
    assert.equal(page.data.columns[0].noticeTrust.parseQualityStatus, "warning");
    assert.equal(page.data.columns[0].hasManualCorrections, true);
    assert.equal(page.data.columns[0].correctionSummary, "政治面貌、其他要求已人工纠错");
    assert.ok(page.data.columns[0].rows.some((row) => row.value === "结构化需关注"));
    assert.equal(page.data.decisionSummary.topTitle, "综合管理岗");
    assert.equal(page.data.decisionSummary.cautionCount, 1);
    assert.equal(page.data.decisionSummary.lowestBarrierTitle, "综合管理岗");
    assert.equal(page.data.decisionSummary.strictestTitle, "执法岗");
    assert.ok(page.data.decisionSummary.strictestReasons.includes("仅限应届"));
    assert.ok(page.data.columns[0].opportunityReasons.includes("基层经历限制较少"));
    assert.equal(page.data.columns[1].cautionReasons[0], "基层经历要求更严格");
    assert.equal(page.data.eligibilitySummary.active, true);
    assert.equal(page.data.eligibilitySummary.matchedCount, 1);
    assert.equal(page.data.eligibilitySummary.blockedCount, 1);
    assert.equal(page.data.decisionAlignmentSummary.active, true);
    assert.equal(page.data.decisionAlignmentSummary.headline, "综合管理岗 同时是规则最优和当前最匹配");
    assert.ok(page.data.decisionAlignmentSummary.detail.includes("优先从它开始"));
    assert.ok(page.data.decisionAlignmentSummary.tags.includes("招录人数较充足"));
    assert.equal(page.data.actionPlanSummary.headline, "先把 综合管理岗 作为第一优先");
    assert.ok(page.data.actionPlanSummary.detail.includes("优先从它开始"));
    assert.equal(page.data.actionPlanSummary.items[0].label, "第一优先");
    assert.ok(page.data.actionPlanSummary.items[1].summary.includes("学历要求不匹配"));
    assert.equal(page.data.columns[0].nextAction.label, "先核对原表字段");
    assert.ok(page.data.columns[0].nextAction.detail.includes("字段覆盖不足"));
    assert.equal(page.data.columns[1].nextAction.label, "先核对报考条件");
    assert.ok(page.data.columns[0].majorMatchSummary.includes("专业名称命中"));
    assert.equal(page.data.columns[0].eligibilityLabel, "条件匹配");
    assert.ok(page.data.columns[1].mismatchReasons.includes("学历要求不匹配"));
    assert.ok(page.data.columns[1].rows.some((row) => row.label === "学历" && row.isMismatch));
    assert.equal(page.data.columns[0].ruleLabel, "机会优先");
    assert.equal(page.data.sortMode, "manual");
    assert.equal(page.data.positions[0].title, "综合管理岗");
    assert.equal(page.data.positions[1].title, "执法岗");
    assert.equal(page.data.rowFocusMode, "all");
    assert.equal(page.data.rowFocusSummary.totalCount, 14);
    assert.equal(page.data.rowFocusSummary.differentCount, 13);
    assert.equal(page.data.rowFocusSummary.barrierCount, 8);
    assert.equal(page.data.rowFocusSummary.mismatchCount, 5);
    assert.equal(page.data.recommendationBaseId, "position-1");
    assert.equal(page.data.recommendationContext.active, true);
    assert.equal(page.data.recommendationContext.baseTitle, "综合管理岗");
    assert.equal(page.data.recommendedPositions.length, 1);
    assert.equal(page.data.recommendedPositions[0].id, "position-2");
    assert.equal(page.data.recommendedPositions[0].compareSuggestion.mode, "reuse");
    assert.equal(page.data.recommendedPositions[0].compareActionLabel, "加入当前方案");
    assert.ok(page.data.recommendedPositions[0].profileHint.includes("对你更严格"));
    assert.ok(page.data.recommendedPositions[0].reasonSummary.includes("和综合管理岗相似"));
    assert.ok(page.data.recommendedPositions[0].reasonSummary.includes("和基准相比"));
    assert.ok(page.data.recommendedPositions[0].nextActionSummary.includes("先核对报考条件"));

    page.changeSortMode.call(page, {
      currentTarget: {
        dataset: {
          mode: "rule"
        }
      }
    });
    assert.equal(page.data.sortMode, "rule");
    assert.equal(page.data.positions[0].title, "综合管理岗");
    await flushPromises();
    assert.equal(page.data.group.viewPreferences.sortMode, "rule");
    assert.equal(page.data.groups[0].viewPreferences.sortMode, "rule");

    page.changeSortMode.call(page, {
      currentTarget: {
        dataset: {
          mode: "eligibility"
        }
      }
    });
    assert.equal(page.data.sortMode, "eligibility");
    assert.equal(page.data.positions[0].title, "综合管理岗");
    assert.equal(page.data.positions[1].title, "执法岗");
    await flushPromises();
    assert.equal(page.data.group.viewPreferences.sortMode, "eligibility");

    page.changeRowFocusMode.call(page, {
      currentTarget: {
        dataset: {
          mode: "different"
        }
      }
    });
    assert.equal(page.data.rowFocusMode, "different");
    assert.ok(page.data.columns[0].rows.every((row) => row.isDifferent));
    assert.equal(page.data.columns[0].rows.length, 13);
    await flushPromises();
    assert.equal(page.data.group.viewPreferences.rowFocusMode, "different");

    page.changeRowFocusMode.call(page, {
      currentTarget: {
        dataset: {
          mode: "barrier"
        }
      }
    });
    assert.equal(page.data.rowFocusMode, "barrier");
    assert.ok(page.data.columns[0].rows.every((row) => row.isBarrier || row.isMismatch));
    assert.ok(page.data.columns[1].rows.some((row) => row.label === "学历" && row.isMismatch));
    assert.equal(page.data.columns[0].rows.length, 8);
    await flushPromises();
    assert.equal(page.data.group.viewPreferences.rowFocusMode, "barrier");

    page.changeRowFocusMode.call(page, {
      currentTarget: {
        dataset: {
          mode: "all"
        }
      }
    });
    assert.equal(page.data.rowFocusMode, "all");
    assert.equal(page.data.columns[0].rows.length, 14);

    page.changeRecommendationBase.call(page, {
      currentTarget: {
        dataset: {
          id: "position-2"
        }
      }
    });
    await flushPromises();
    assert.equal(page.data.recommendationBaseId, "position-2");
    assert.equal(page.data.recommendationContext.baseTitle, "执法岗");
    assert.ok(page.data.recommendedPositions[0].profileHint.includes("对你更友好"));
    assert.ok(page.data.recommendedPositions[0].reasonSummary.includes("和执法岗相似"));
    assert.ok(page.data.recommendedPositions[0].reasonSummary.includes("和基准相比"));

    page.copySummary.call(page);
    assert.equal(clipboardWrites.length, 1);
    assert.ok(clipboardWrites[0].includes("广东岗位方案对比摘要"));
    assert.ok(clipboardWrites[0].includes("查看顺序：个人匹配优先"));
    assert.ok(clipboardWrites[0].includes("规则建议：综合管理岗 · 机会优先"));
    assert.ok(clipboardWrites[0].includes("公告出处：综合管理岗：广东省考公告 · 主公告 · 2026-01-01"));
    assert.ok(clipboardWrites[0].includes("公告聚合：同一公告 · 广东省考公告 · 阶段：主公告 · 最近发布时间：2026-01-01"));
    assert.ok(clipboardWrites[0].includes("优先关注字段：单位、岗位名称、职位代码"));
    assert.ok(clipboardWrites[0].includes("匹配情况：完全匹配 1 个，存在不匹配 1 个"));
    assert.ok(clipboardWrites[0].includes("联动判断：综合管理岗 同时是规则最优和当前最匹配"));
    assert.ok(clipboardWrites[0].includes("下一步动作：先把 综合管理岗 作为第一优先"));
    assert.ok(clipboardWrites[0].includes("建议顺序：第一优先=综合管理岗"));
    assert.equal(toasts[0].title, "已复制摘要");

    page.changeRecommendationBase.call(page, {
      currentTarget: {
        dataset: {
          id: "position-1"
        }
      }
    });
    await flushPromises();

    page.addRecommendedToCompare.call(page, {
      currentTarget: {
        dataset: {
          id: "position-2"
        }
      }
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    assert.equal(addCalls.length, 1);
    assert.equal(addCalls[0].groupId, "group-1");
    assert.equal(addCalls[0].positionId, "position-2");
    assert.equal(addCalls[0].context.sourceEntry, "compare");
    assert.equal(addCalls[0].context.sourceLabel, "岗位对比推荐");
    assert.equal(page.data.currentGroupId, "group-1");
    assert.equal(page.data.lastCompareStatus, "reused");
    assert.equal(page.data.lastCompareTargetGroupId, "group-1");
    assert.equal(page.data.lastCompareTargetGroupName, "广东岗位方案");
    assert.equal(navigations[0], "/pages/compare/index?groupId=group-1");

    page.openNoticeDetail.call(page, {
      currentTarget: {
        dataset: {
          noticeId: "rsks-gd|notice-1"
        }
      }
    });
    assert.equal(navigations[1], "/pages/notice-detail/index?id=rsks-gd|notice-1");

    page.openProfile.call(page);
    assert.equal(navigations[2], "/pages/profile/index");
    } finally {
      api.addPositionToGroup = originalAddPositionToGroup;
      global.wx = previousWx;
      restoreApi();
    }
});

test("compare page should summarize multi-notice context within same exam type", async () => {
  const restoreApi = patchPositionAndCompareApi({
    positions: [
      {
        id: "position-1",
        noticeId: "rsks-gd|notice-1",
        examType: "guangdong-provincial",
        agency: "广州市某单位",
        title: "综合管理岗",
        positionCode: "A001",
        positionType: "综合管理",
        headcount: 2,
        area: "广州",
        education: "本科",
        degree: "学士",
        major: "法学",
        serviceRequirement: "不限",
        freshGraduateOnly: false,
        politicalStatus: "不限",
        notes: "未注明",
        noticeTitle: "广东省考公告",
        noticeStageLabel: "主公告",
        noticePublishedAt: "2026-01-01",
        noticeArea: "广东",
        sourceId: "rsks-gd",
        sourceName: "rsks-gd",
        mergedSourceCount: 2,
        mergedSources: [
          {
            noticeId: "rsks-gd|notice-1",
            sourceId: "rsks-gd",
            sourceName: "rsks-gd",
            publishedAt: "2026-01-01",
            hasStructuredPositions: true,
            positionCount: 2
          },
          {
            noticeId: "ggfw-hrss-gd|notice-1-shadow",
            sourceId: "ggfw-hrss-gd",
            sourceName: "ggfw-hrss-gd",
            publishedAt: "2026-01-01",
            hasStructuredPositions: false,
            positionCount: 0
          }
        ],
        primarySourceId: "rsks-gd",
        positionNoticeId: "rsks-gd|notice-1",
        positionSourceId: "rsks-gd",
        positionSourceName: "rsks-gd",
        noticeTrust: buildNoticeTrust()
      },
      {
        id: "position-3",
        noticeId: "ggfw-hrss-gd|notice-3",
        examType: "guangdong-provincial",
        agency: "佛山市某单位",
        title: "资格审核辅助岗",
        positionCode: "A003",
        positionType: "综合管理",
        headcount: 1,
        area: "佛山",
        education: "本科",
        degree: "学士",
        major: "法学",
        serviceRequirement: "不限",
        freshGraduateOnly: false,
        politicalStatus: "不限",
        notes: "需现场确认",
        noticeTitle: "广东省资格审核公告",
        noticeStageLabel: "资格审核",
        noticePublishedAt: "2026-01-20",
        noticeArea: "广东",
        sourceId: "ggfw-hrss-gd",
        sourceName: "ggfw-hrss-gd",
        mergedSourceCount: 1,
        mergedSources: [
          {
            noticeId: "ggfw-hrss-gd|notice-3",
            sourceId: "ggfw-hrss-gd",
            sourceName: "ggfw-hrss-gd",
            publishedAt: "2026-01-20",
            hasStructuredPositions: true,
            positionCount: 1
          }
        ],
        primarySourceId: "ggfw-hrss-gd",
        positionNoticeId: "ggfw-hrss-gd|notice-3",
        positionSourceId: "ggfw-hrss-gd",
        positionSourceName: "ggfw-hrss-gd",
        noticeTrust: buildNoticeTrust({
          parseQualityStatus: "healthy",
          trustLabel: "结构化稳定",
          parseQualitySummary: "字段命中 17/17，覆盖率 100%"
        })
      }
    ],
    recommendedPositions: []
  });
  const previousWx = global.wx;
  const clipboardWrites = [];
  const navigations = [];

  global.wx = {
    showToast() {},
    navigateTo({ url }) {
      navigations.push(url);
    },
    setClipboardData({ data, success }) {
      clipboardWrites.push(data);
      if (typeof success === "function") {
        success();
      }
    }
  };

  try {
    const definition = loadPageDefinition("../pages/compare/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { groupId: "group-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.noticeContextSummary.active, true);
    assert.equal(page.data.noticeContextSummary.sameNotice, false);
    assert.equal(page.data.noticeContextSummary.noticeCount, 2);
    assert.equal(page.data.noticeContextSummary.headline, "当前对比组覆盖 2 条公告");
    assert.ok(page.data.noticeContextSummary.detail.includes("阶段：主公告、资格审核"));
    assert.ok(page.data.noticeContextSummary.detail.includes("最近发布时间：2026-01-20"));
    assert.equal(page.data.noticeContextSummary.items.length, 2);
    assert.equal(page.data.noticeContextSummary.items[0].summary.includes("1 个岗位"), true);
    assert.equal(page.data.sourceContextSummary.active, true);
    assert.equal(page.data.sourceContextSummary.aggregatedCount, 1);
    assert.equal(page.data.sourceContextSummary.items[0].roleLabel, "岗位主源");
    assert.equal(page.data.sourceContextSummary.items[0].sourceName, "rsks-gd");
    assert.equal(page.data.columns[0].sourceTraceLabel, "岗位主源");
    assert.ok(page.data.columns[0].sourceTraceSummary.includes("rsks-gd"));
    assert.equal(page.data.columns[0].trustActionPrimaryLabel, "查看当前卡点");
    assert.equal(page.data.columns[0].trustActionPrimaryRoute, "/pages/source-status/index?sourceId=rsks-gd&focus=parse");
    assert.equal(page.data.columns[1].sourceTraceLabel, "官方来源");
    assert.equal(page.data.columns[1].noticeTitle, "广东省资格审核公告");
    assert.equal(page.data.columns[1].noticeStageLabel, "资格审核");
    assert.equal(page.data.columns[1].noticePublishedAt, "2026-01-20");

    page.openTrustRoute.call(page, {
      currentTarget: {
        dataset: {
          route: page.data.columns[0].trustActionPrimaryRoute
        }
      }
    });
    assert.equal(navigations[0], "/pages/source-status/index?sourceId=rsks-gd&focus=parse");

    page.copySummary.call(page);
    assert.equal(clipboardWrites.length, 1);
    assert.ok(clipboardWrites[0].includes("公告聚合：2 条公告 · 阶段 主公告、资格审核 · 最近发布时间 2026-01-20"));
    assert.ok(clipboardWrites[0].includes("来源说明：当前对比组涉及 2 个核心官方来源"));
    assert.ok(clipboardWrites[0].includes("岗位来源：综合管理岗：岗位主源 rsks-gd；辅助来源 ggfw-hrss-gd"));
    assert.ok(clipboardWrites[0].includes("公告出处：综合管理岗：广东省考公告 · 主公告 · 2026-01-01；资格审核辅助岗：广东省资格审核公告 · 资格审核 · 2026-01-20"));
  } finally {
    global.wx = previousWx;
    restoreApi();
  }
});

test("notice-detail page should expose merged source context when a notice is aggregated", async () => {
  const restoreApi = patchNoticePagesApi();
  const previousWx = global.wx;
  global.wx = {
    showToast() {},
    navigateTo() {}
  };

  try {
    const definition = loadPageDefinition("../pages/notice-detail/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { id: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();

    assert.equal(page.data.mergedSourceEntries.length, 2);
    assert.ok(page.data.mergedSourceSummary.includes("已聚合 2 个官方来源"));
    assert.equal(page.data.mergedSourceEntries[0].isPrimary, true);
    assert.equal(page.data.mergedSourceEntries[0].isPositionSource, true);
    assert.equal(page.data.mergedSourceEntries[0].roleLabel, "岗位主源");
    assert.equal(page.data.mergedSourceEntries[1].roleLabel, "辅助来源");
    assert.equal(page.data.mergedSourceEntries[1].summary, "当前仅补充公告信息，暂不作为岗位对比数据源。");
  } finally {
    global.wx = previousWx;
    restoreApi();
  }
});

test("positions page should expose merged source context when positions come from an aggregated notice", async () => {
  const restoreApi = patchPositionAndCompareApi();
  const previousWx = global.wx;
  global.wx = {
    showToast() {},
    navigateTo() {}
  };

  try {
    const definition = loadPageDefinition("../pages/positions/index.js");
    const page = createPageInstance(definition);

    page.onLoad.call(page, { noticeId: "rsks-gd|notice-1" });
    page.onShow.call(page);
    await flushPromises();
    await flushPromises();

    assert.equal(page.data.mergedSourceEntries.length, 2);
    assert.ok(page.data.mergedSourceSummary.includes("已聚合 2 个官方来源"));
    assert.equal(page.data.mergedSourceEntries[0].isPrimary, true);
    assert.equal(page.data.mergedSourceEntries[0].isPositionSource, true);
    assert.equal(page.data.mergedSourceEntries[0].roleLabel, "岗位主源");
    assert.equal(page.data.mergedSourceEntries[1].roleLabel, "辅助来源");
    assert.equal(page.data.mergedSourceEntries[1].summary, "当前仅补充公告信息，暂不作为岗位对比数据源。");
  } finally {
    global.wx = previousWx;
    restoreApi();
  }
});
