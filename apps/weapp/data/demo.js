const notices = [
  {
    id: "notice-gd-2026",
    examType: "guangdong-provincial",
    title: "\u5e7f\u4e1c\u77012026\u5e74\u5ea6\u8003\u8bd5\u5f55\u7528\u516c\u52a1\u5458\u516c\u544a",
    area: "\u5e7f\u4e1c",
    publishedAt: "2026-01-08",
    registrationWindow: "1\u670810\u65e5 - 1\u670816\u65e5",
    writtenExamAt: "3\u670815\u65e5",
    summary: "\u5e7f\u4e1c\u7701\u8003\u5b98\u65b9\u516c\u544a\uff0c\u542b\u804c\u4f4d\u8868\u3001\u62a5\u540d\u65f6\u95f4\u3001\u7b14\u8bd5\u5b89\u6392\u3002",
    source: "\u5e7f\u4e1c\u7701\u4eba\u4e8b\u8003\u8bd5\u7f51",
    sourceMode: "official",
    sourceModeLabel: "官方",
    sourceModeNote: "",
    url: "https://rsks.gd.gov.cn/demo/2026-gwy",
    attachments: ["\u804c\u4f4d\u8868.xlsx"]
  },
  {
    id: "notice-national-2026",
    examType: "national",
    title: "2026\u5e74\u5ea6\u56fd\u5bb6\u516c\u52a1\u5458\u8003\u8bd5\u516c\u544a",
    area: "\u5168\u56fd/\u5e7f\u4e1c\u5c97\u4f4d",
    publishedAt: "2026-10-14",
    registrationWindow: "10\u670815\u65e5 - 10\u670824\u65e5",
    writtenExamAt: "11\u670829\u65e5",
    summary: "\u56fd\u8003\u516c\u544a\u6f14\u793a\u6570\u636e\uff0c\u542b\u5e7f\u4e1c\u5c97\u4f4d\u4fe1\u606f\u5165\u53e3\u3002",
    source: "\u56fd\u5bb6\u516c\u52a1\u5458\u5c40\u4e13\u9898",
    sourceMode: "demo",
    sourceModeLabel: "演示",
    sourceModeNote: "\u5f53\u524d\u73af\u5883\u65e0\u6cd5\u76f4\u8fde\u56fd\u8003\u5b98\u65b9\u7ad9\u70b9\uff0c\u6682\u7528\u6f14\u793a\u6570\u636e\u5360\u4f4d\u3002",
    url: "https://bm.scs.gov.cn/demo/2026-national",
    attachments: ["\u804c\u4f4d\u8868.xlsx"]
  }
];

const positions = [
  {
    id: "p1",
    noticeId: "notice-gd-2026",
    examType: "guangdong-provincial",
    agency: "\u5e7f\u5dde\u5e02\u5929\u6cb3\u533a\u4eba\u6c11\u653f\u5e9c\u529e\u516c\u5ba4",
    title: "\u7efc\u5408\u7ba1\u7406\u5c97",
    positionCode: "440106001001",
    positionType: "\u7efc\u5408\u7ba1\u7406\u7c7b",
    headcount: 2,
    area: "\u5e7f\u5dde",
    education: "\u672c\u79d1\u4ee5\u4e0a",
    degree: "\u5b66\u58eb\u4ee5\u4e0a",
    major: "\u6cd5\u5b66\u7c7b\u3001\u65b0\u95fb\u4f20\u64ad\u5b66\u7c7b",
    serviceRequirement: "\u4e0d\u9650",
    freshGraduateOnly: false,
    politicalStatus: "\u4e0d\u9650",
    notes: "\u9700\u5177\u5907\u8f83\u5f3a\u6587\u5b57\u7efc\u5408\u80fd\u529b",
    sourceNoticeTitle: "\u5e7f\u4e1c\u77012026\u5e74\u5ea6\u8003\u8bd5\u5f55\u7528\u516c\u52a1\u5458\u516c\u544a"
  },
  {
    id: "p2",
    noticeId: "notice-gd-2026",
    examType: "guangdong-provincial",
    agency: "\u6df1\u5733\u5e02\u5357\u5c71\u533a\u53d1\u5c55\u548c\u6539\u9769\u5c40",
    title: "\u653f\u7b56\u7814\u7a76\u5c97",
    positionCode: "440305001002",
    positionType: "\u7efc\u5408\u7ba1\u7406\u7c7b",
    headcount: 1,
    area: "\u6df1\u5733",
    education: "\u7814\u7a76\u751f",
    degree: "\u7855\u58eb",
    major: "\u7ecf\u6d4e\u5b66\u7c7b\u3001\u516c\u5171\u7ba1\u7406\u7c7b",
    serviceRequirement: "2\u5e74\u4ee5\u4e0a\u57fa\u5c42\u7ecf\u5386",
    freshGraduateOnly: false,
    politicalStatus: "\u4e2d\u5171\u515a\u5458",
    notes: "\u9700\u5177\u5907\u653f\u7b56\u7814\u7a76\u7ecf\u9a8c",
    sourceNoticeTitle: "\u5e7f\u4e1c\u77012026\u5e74\u5ea6\u8003\u8bd5\u5f55\u7528\u516c\u52a1\u5458\u516c\u544a"
  },
  {
    id: "p3",
    noticeId: "notice-gd-2026",
    examType: "guangdong-provincial",
    agency: "\u4f5b\u5c71\u5e02\u987a\u5fb7\u533a\u5e02\u573a\u76d1\u7763\u7ba1\u7406\u5c40",
    title: "\u6267\u6cd5\u76d1\u7763\u5c97",
    positionCode: "440606001003",
    positionType: "\u884c\u653f\u6267\u6cd5\u7c7b",
    headcount: 3,
    area: "\u4f5b\u5c71",
    education: "\u672c\u79d1\u4ee5\u4e0a",
    degree: "\u5b66\u58eb\u4ee5\u4e0a",
    major: "\u6cd5\u5b66\u7c7b\u3001\u98df\u54c1\u79d1\u5b66\u4e0e\u5de5\u7a0b\u7c7b",
    serviceRequirement: "\u5e94\u5c4a",
    freshGraduateOnly: true,
    politicalStatus: "\u4e0d\u9650",
    notes: "\u9002\u5408\u5e94\u5c4a\u6bd5\u4e1a\u751f",
    sourceNoticeTitle: "\u5e7f\u4e1c\u77012026\u5e74\u5ea6\u8003\u8bd5\u5f55\u7528\u516c\u52a1\u5458\u516c\u544a"
  },
  {
    id: "p4",
    noticeId: "notice-national-2026",
    examType: "national",
    agency: "\u6d77\u5173\u603b\u7f72\u5e7f\u4e1c\u5206\u7f72",
    title: "\u7efc\u5408\u4e1a\u52a1\u4e00\u7ea7\u4e3b\u4efb\u79d1\u5458\u4ee5\u4e0b",
    positionCode: "130110001",
    positionType: "\u7efc\u5408\u7ba1\u7406\u7c7b",
    headcount: 2,
    area: "\u5e7f\u5dde",
    education: "\u672c\u79d1\u4ee5\u4e0a",
    degree: "\u5b66\u58eb\u4ee5\u4e0a",
    major: "\u6cd5\u5b66\u7c7b\u3001\u7ecf\u6d4e\u5b66\u7c7b",
    serviceRequirement: "\u4e0d\u9650",
    freshGraduateOnly: false,
    politicalStatus: "\u4e0d\u9650",
    notes: "\u9700\u901a\u8fc7\u4f53\u80fd\u6d4b\u8bc4",
    sourceNoticeTitle: "2026\u5e74\u5ea6\u56fd\u5bb6\u516c\u52a1\u5458\u8003\u8bd5\u516c\u544a"
  }
];

const compareGroups = [
  {
    id: "cg-1",
    name: "\u7701\u8003\u4e3b\u5907\u9009",
    examType: "guangdong-provincial",
    positionIds: ["p1", "p2"]
  }
];

const sourceStates = [
  {
    sourceId: "rsks-gd",
    sourceName: "\u5e7f\u4e1c\u7701\u4eba\u4e8b\u8003\u8bd5\u7f51",
    examType: "guangdong-provincial",
    sourceMode: "official",
    sourceModeLabel: "官方",
    sourceModeNote: "",
    scheduleMinutes: 30,
    publishSlaMinutes: 60,
    lastFetchedAt: "2026-06-09 09:30",
    lastPublishedAt: "2026-06-09 09:35",
    lastNoticePublishedAt: "2026-01-08 00:00",
    lastRunFinishedAt: "2026-06-09 09:35",
    lastSuccessAt: "2026-06-09 09:35",
    nextFetchDueAt: "2026-06-09 10:00",
    nextPublishDueAt: "2026-06-09 10:35",
    fetchLagMinutes: 5,
    publishLagMinutes: 0,
    fetchOverdue: false,
    publishOverdue: false,
    slaStatus: "healthy",
    lastRunStatus: "published",
    lastRollback: false,
    consecutiveFailureCount: 0,
    pendingReviewCount: 1,
    structureAlert: false,
    structureSummary: "index[a:18 | li:12] ; detail[div:9 | a:6]",
    lastStructureChangedAt: "",
    structureChangeSummary: "",
    lastErrorSummary: ""
  },
  {
    sourceId: "national-bm",
    sourceName: "\u56fd\u5bb6\u516c\u52a1\u5458\u5c40\u4e13\u9898",
    examType: "national",
    sourceMode: "demo",
    sourceModeLabel: "演示",
    sourceModeNote: "\u5f53\u524d\u73af\u5883\u65e0\u6cd5\u76f4\u8fde\u56fd\u8003\u5b98\u65b9\u7ad9\u70b9\uff0c\u6682\u7528\u6f14\u793a\u6570\u636e\u5360\u4f4d\u3002",
    scheduleMinutes: 30,
    publishSlaMinutes: 60,
    lastFetchedAt: "2026-06-09 09:30",
    lastPublishedAt: "2026-06-09 09:34",
    lastNoticePublishedAt: "2026-10-14 00:00",
    lastRunFinishedAt: "2026-06-09 09:34",
    lastSuccessAt: "2026-06-09 09:34",
    nextFetchDueAt: "2026-06-09 10:00",
    nextPublishDueAt: "2026-06-09 10:34",
    fetchLagMinutes: 6,
    publishLagMinutes: 1,
    fetchOverdue: false,
    publishOverdue: false,
    slaStatus: "healthy",
    lastRunStatus: "published",
    lastRollback: false,
    consecutiveFailureCount: 0,
    pendingReviewCount: 0,
    structureAlert: false,
    structureSummary: "detail[table:2 | tr:6 | td:12]",
    lastStructureChangedAt: "",
    structureChangeSummary: "",
    lastErrorSummary: ""
  }
];

const reviewQueue = [
  {
    id: "review-rsks-demo-1",
    sourceId: "rsks-gd",
    createdAt: "2026-06-09 09:36",
    reasons: ["示例：附件下载失败，已进入人工复核"],
    hasParsedPayload: false,
    hasRawPayload: false
  }
];

const alertEvents = [
  {
    id: "alert-rsks-demo-1",
    sourceId: "rsks-gd",
    sourceName: "广东省人事考试网",
    type: "review-queued",
    severity: "medium",
    createdAt: "2026-06-09 09:36",
    summary: "广东省人事考试网有待复核记录",
    details: "当前待复核 1 条。"
  },
  {
    id: "alert-national-demo-1",
    sourceId: "national-bm",
    sourceName: "国家公务员局专题",
    type: "sla-warning",
    severity: "medium",
    createdAt: "2026-06-09 09:50",
    summary: "国家公务员局专题接近 SLA 上限",
    details: "抓取延迟 25 分钟；发布延迟 48 分钟。"
  }
];

module.exports = {
  notices,
  positions,
  compareGroups,
  sourceStates,
  reviewQueue,
  alertEvents
};
