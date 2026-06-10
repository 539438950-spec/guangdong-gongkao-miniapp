const path = require("node:path");
const attachmentTools = require("./attachment-tools");
const { buildBatchStateFromAttachment } = require("./position-workbook");

function summarizeAttachmentAnalysis(analysis) {
  if (!analysis) {
    return [];
  }

  return [
    `candidate files: ${(analysis.candidate_files || []).length}`,
    `extracted files: ${(analysis.extracted_files || []).length}`,
    analysis.error ? `attachment analysis error: ${analysis.error}` : "attachment analysis: ok"
  ];
}

async function enrichAttachmentOnlyPayload(payload, artifactsRoot) {
  if (!payload || !payload.notice || !payload.notice.attachments || !payload.notice.attachments[0]) {
    return payload;
  }

  const firstAttachment = payload.notice.attachments[0];
  const downloaded = await attachmentTools.downloadAttachment({
    url: firstAttachment.url,
    noticeId: payload.notice.id,
    referer: payload.notice.url,
    artifactsRoot
  });

  const attachmentAnalysis = attachmentTools.analyzeAttachment(downloaded.path);
  const nextPayload = JSON.parse(JSON.stringify(payload));
  nextPayload.batch = nextPayload.batch || {};
  nextPayload.batch.attachmentAnalysis = attachmentAnalysis;
  nextPayload.batch.parseLog = [
    ...(nextPayload.batch.parseLog || []),
    ...summarizeAttachmentAnalysis(attachmentAnalysis)
  ];

  const parsedState = buildBatchStateFromAttachment({
    source: nextPayload.source,
    notice: nextPayload.notice,
    batch: nextPayload.batch,
    attachmentAnalysis
  });
  nextPayload.batch = {
    ...parsedState.batch,
    attachmentAnalysis
  };
  nextPayload.positions = parsedState.positions;

  return nextPayload;
}

module.exports = {
  enrichAttachmentOnlyPayload,
  summarizeAttachmentAnalysis
};
