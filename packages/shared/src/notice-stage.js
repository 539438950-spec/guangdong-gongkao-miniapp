const NOTICE_STAGE_DEFINITIONS = [
  {
    id: "qualification-review",
    label: "资格审核",
    priority: 100,
    keywords: ["资格审核", "资格复审", "资格确认"]
  },
  {
    id: "interview",
    label: "面试",
    priority: 90,
    keywords: ["面试", "面谈", "结构化面试"]
  },
  {
    id: "physical-test",
    label: "体测",
    priority: 80,
    keywords: ["体能测评", "体测", "体检", "心理测评"]
  },
  {
    id: "written-exam",
    label: "笔试",
    priority: 70,
    keywords: ["笔试", "成绩查询", "笔试成绩", "合格分数线"]
  },
  {
    id: "registration",
    label: "报名",
    priority: 60,
    keywords: ["报名", "缴费", "准考证", "报考指引"]
  },
  {
    id: "final",
    label: "录用",
    priority: 50,
    keywords: ["拟录用", "录用公示", "补录", "递补", "考察公告"]
  },
  {
    id: "main",
    label: "主公告",
    priority: 40,
    keywords: ["考试录用公务员公告", "招录公告", "招考公告", "招录职位公告", "招考职位公告"]
  }
];

const NOTICE_STAGE_FLOW_ORDER = {
  main: 10,
  registration: 20,
  "written-exam": 30,
  "qualification-review": 40,
  interview: 50,
  "physical-test": 60,
  final: 70,
  general: 999
};

const TRACKING_NOTICE_STAGE_IDS = new Set([
  "qualification-review",
  "interview",
  "physical-test",
  "final"
]);

function normalizeNoticeSearchText(notice) {
  return [
    notice && notice.title,
    notice && notice.summary,
    notice && notice.source
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function classifyNoticeStage(notice) {
  if (!notice) {
    return {
      id: "general",
      label: "公告",
      priority: 0
    };
  }

  const normalized = normalizeNoticeSearchText(notice);
  for (const stage of NOTICE_STAGE_DEFINITIONS) {
    if (stage.keywords.some((keyword) => normalized.includes(String(keyword).toLowerCase()))) {
      return {
        id: stage.id,
        label: stage.label,
        priority: stage.priority
      };
    }
  }

  return {
    id: "general",
    label: "公告",
    priority: 0
  };
}

function shouldExpectPositionWorkbookForNoticeStage(stageId) {
  return !TRACKING_NOTICE_STAGE_IDS.has(String(stageId || "").trim());
}

function shouldExpectPositionWorkbookForNotice(notice) {
  const stageId = notice && notice.noticeStageId
    ? notice.noticeStageId
    : classifyNoticeStage(notice).id;
  return shouldExpectPositionWorkbookForNoticeStage(stageId);
}

module.exports = {
  NOTICE_STAGE_DEFINITIONS,
  NOTICE_STAGE_FLOW_ORDER,
  TRACKING_NOTICE_STAGE_IDS,
  classifyNoticeStage,
  shouldExpectPositionWorkbookForNoticeStage,
  shouldExpectPositionWorkbookForNotice
};
