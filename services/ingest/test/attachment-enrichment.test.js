const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const attachmentTools = require("../src/core/attachment-tools");
const { enrichAttachmentOnlyPayload } = require("../src/core/attachment-enrichment");

test("enrichAttachmentOnlyPayload should append attachment analysis to payload", async () => {
  const originalDownload = attachmentTools.downloadAttachment;
  const originalAnalyze = attachmentTools.analyzeAttachment;

  attachmentTools.downloadAttachment = async () => ({ path: "C:/tmp/demo.zip", size: 123 });
  attachmentTools.analyzeAttachment = () => ({
    kind: "zip",
    candidate_files: [{ name: "职位表.xlsx", score: 15 }],
    extracted_files: [{ name: "职位表.xlsx", path: "C:/tmp/extracted/职位表.xlsx", score: 15 }]
  });

  const payload = {
    notice: {
      id: "rsks-demo",
      url: "https://rsks.gd.gov.cn/example",
      attachments: [{ url: "https://rsks.gd.gov.cn/attachment.zip", name: "附件1-5.zip" }]
    },
    batch: {
      parseStatus: "attachment-only",
      parseLog: ["attachments: 1"]
    }
  };

  const enriched = await enrichAttachmentOnlyPayload(payload, path.resolve(process.cwd(), ".tmp"));

  assert.equal(enriched.batch.attachmentAnalysis.kind, "zip");
  assert.ok(enriched.batch.parseLog.some((item) => item.includes("candidate files: 1")));

  attachmentTools.downloadAttachment = originalDownload;
  attachmentTools.analyzeAttachment = originalAnalyze;
});
