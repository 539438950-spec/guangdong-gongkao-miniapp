const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { FileStore } = require("../src/storage/file-store");
const { exportWeappSnapshot } = require("../src/publish/export-weapp-snapshot");

test("exportWeappSnapshot should mark attachment-only notices as non-structured", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `notice-state-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });
  const store = new FileStore(rootDir);

  store.publish("rsks-gd", {
    source: { id: "rsks-gd", name: "广东省人事考试网" },
    notice: {
      id: "rsks-1",
      examType: "guangdong-provincial",
      title: "广东省2025年考试录用公务员公告",
      area: "广东",
      publishedAt: "2025-01-07T00:00:00.000Z",
      registrationStart: null,
      writtenExamAt: null,
      summary: "示例摘要",
      url: "https://rsks.gd.gov.cn/example",
      attachments: [{ name: "附件1-5.zip", url: "https://rsks.gd.gov.cn/a.zip" }]
    },
    batch: {
      parseStatus: "attachment-only"
    },
    positions: []
  });

  const targetFile = path.resolve(rootDir, "ingested.js");
  exportWeappSnapshot(store, targetFile);
  const snapshot = require(targetFile);

  assert.equal(snapshot.notices[0].hasStructuredPositions, false);
  assert.equal(snapshot.notices[0].positionCount, 0);
});
