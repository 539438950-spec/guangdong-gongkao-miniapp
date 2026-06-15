const test = require("node:test");
const assert = require("node:assert/strict");

const handlers = require("../utils/api-handlers");
const store = require("../utils/store");
const { installTestSeed } = require("./fixtures/test-seed");

test.beforeEach(() => {
  installTestSeed(store, "notice-stage-test-seed");
});

test.afterEach(() => {
  store.__resetStateForTests();
});

test("listNotices should classify Guangdong notices into stages", () => {
  const notices = handlers.listNotices();

  const mainNotice = notices.find((item) => item.sourceId === "rsks-gd");
  const interviewNotice = notices.find((item) => item.sourceId === "ggfw-hrss-gd");

  assert.ok(mainNotice);
  assert.equal(mainNotice.noticeStageId, "main");
  assert.equal(mainNotice.noticeStageLabel, "主公告");

  assert.ok(interviewNotice);
  assert.equal(interviewNotice.noticeStageId, "qualification-review");
  assert.equal(interviewNotice.noticeStageLabel, "资格审核");
});

test("getNoticeDetail should retain stage metadata and compare gating", () => {
  const notices = handlers.listNotices();
  const interviewNotice = notices.find((item) => item.sourceId === "ggfw-hrss-gd");

  const detail = handlers.getNoticeDetail(interviewNotice.id);

  assert.equal(detail.notice.noticeStageId, "qualification-review");
  assert.equal(detail.notice.noticeStageLabel, "资格审核");
  assert.equal(detail.canViewPositions, false);
  assert.equal(detail.noticeTrust.parseQualityStatus, "attachment-only");
  assert.equal(detail.notice.expectedPositionWorkbook, false);
  assert.equal(detail.notice.attachmentOnlyExpected, true);
  assert.equal(detail.noticeTrust.expectedPositionWorkbook, false);
  assert.equal(detail.noticeTrust.attachmentOnlyExpected, true);
  assert.equal(detail.noticeTrust.trustLabel, "\u9636\u6bb5\u516c\u544a\u8ffd\u8e2a");
  assert.ok(detail.noticeTrust.parseQualitySummary.includes("\u6d41\u7a0b\u8ffd\u8e2a"));
});

test("getDashboard should treat stage-only attachment notices as tracking state", () => {
  const dashboard = handlers.getDashboard();
  const sourceState = dashboard.sourceStates.find((item) => item.sourceId === "ggfw-hrss-gd");

  assert.ok(sourceState);
  assert.equal(sourceState.expectedPositionWorkbook, false);
  assert.equal(sourceState.attachmentOnlyExpected, true);
  assert.equal(sourceState.publishGate.status, "tracking-only");
  assert.equal(dashboard.sourceSummary.parseIssueCount, 1);
});

test("getNoticeDetail should build same-batch notice timeline by exam type and year", () => {
  store.__setSeedSnapshotLoaderForTests(() => ({
    seedVersion: "timeline-test",
    seed: {
      updatedAt: "2026-06-09T12:00:00.000Z",
      notices: [
        {
          id: "rsks-gd|main-2026",
          sourceId: "rsks-gd",
          examType: "guangdong-provincial",
          title: "广东省2026年考试录用公务员公告",
          area: "广东",
          source: "广东省人事考试网",
          publishedAt: "2026-01-05",
          hasStructuredPositions: true,
          positionCount: 10
        },
        {
          id: "ggfw-hrss-gd|qualification-2026",
          sourceId: "ggfw-hrss-gd",
          examType: "guangdong-provincial",
          title: "广东省2026年考试录用公务员资格审核公告",
          area: "广东",
          source: "广东人社",
          publishedAt: "2026-03-01",
          hasStructuredPositions: false,
          positionCount: 0
        },
        {
          id: "ggfw-hrss-gd|interview-2026",
          sourceId: "ggfw-hrss-gd",
          examType: "guangdong-provincial",
          title: "广东省2026年考试录用公务员面试公告",
          area: "广东",
          source: "广东人社",
          publishedAt: "2026-03-20",
          hasStructuredPositions: false,
          positionCount: 0
        },
        {
          id: "national-bm|national-2026",
          sourceId: "national-bm",
          examType: "national",
          title: "2026年度国家公务员考试公告",
          area: "全国",
          source: "国家公务员局",
          publishedAt: "2026-10-14",
          hasStructuredPositions: true,
          positionCount: 2
        }
      ],
      positions: [],
      sourceStates: [],
      reviewQueue: [],
      resolvedReviewQueue: [],
      alertEvents: [],
      compareGroups: []
    }
  }));

  const detail = handlers.getNoticeDetail("ggfw-hrss-gd|qualification-2026");

  assert.equal(detail.noticeBatch.year, "2026");
  assert.equal(detail.noticeBatch.examType, "guangdong-provincial");
  assert.equal(detail.noticeTimeline.length, 3);
  assert.deepEqual(
    detail.noticeTimeline.map((item) => item.noticeStageId),
    ["main", "qualification-review", "interview"]
  );
  assert.equal(detail.noticeTimeline[1].isCurrent, true);
  assert.deepEqual(
    detail.relatedNotices.map((item) => item.id),
    ["rsks-gd|main-2026", "ggfw-hrss-gd|interview-2026"]
  );
});
