function createSource(input) {
  const scheduleMinutes = input.scheduleMinutes || 30;
  return {
    id: input.id,
    name: input.name,
    baseUrl: input.baseUrl,
    examType: input.examType,
    scheduleMinutes,
    publishSlaMinutes: input.publishSlaMinutes || Math.max(scheduleMinutes * 2, 60),
    enabled: input.enabled !== false,
    parserType: input.parserType || "html",
    indexUrls: input.indexUrls || [],
    metadata: input.metadata || {}
  };
}

function createNotice(input) {
  return {
    id: input.id,
    sourceId: input.sourceId,
    examType: input.examType,
    area: input.area || "\u5e7f\u4e1c",
    title: input.title,
    url: input.url,
    publishedAt: input.publishedAt,
    updatedAt: input.updatedAt || input.publishedAt,
    registrationStart: input.registrationStart || null,
    registrationEnd: input.registrationEnd || null,
    writtenExamAt: input.writtenExamAt || null,
    summary: input.summary || "",
    attachments: input.attachments || [],
    contentHash: input.contentHash,
    status: input.status || "validated"
  };
}

function createPositionBatch(input) {
  return {
    id: input.id,
    noticeId: input.noticeId,
    sourceId: input.sourceId,
    attachmentUrl: input.attachmentUrl,
    version: input.version || 1,
    parseStatus: input.parseStatus || "pending",
    parseLog: input.parseLog || [],
    rowsTotal: input.rowsTotal || 0
  };
}

function createPosition(input) {
  return {
    id: input.id,
    sourceId: input.sourceId || "",
    noticeId: input.noticeId,
    batchId: input.batchId,
    examType: input.examType,
    area: input.area,
    agency: input.agency,
    title: input.title,
    positionCode: input.positionCode,
    positionType: input.positionType || "\u7efc\u5408\u7ba1\u7406\u7c7b",
    headcount: input.headcount || 0,
    educationRaw: input.educationRaw || "\u672a\u6ce8\u660e",
    educationLevel: input.educationLevel || "unknown",
    degreeRaw: input.degreeRaw || "\u672a\u6ce8\u660e",
    degreeLevel: input.degreeLevel || "unknown",
    majorRaw: input.majorRaw || "\u672a\u6ce8\u660e",
    majorTags: input.majorTags || [],
    majorCodes: input.majorCodes || [],
    serviceRequirement: input.serviceRequirement || "\u4e0d\u9650",
    freshGraduateOnly: Boolean(input.freshGraduateOnly),
    politicalStatus: input.politicalStatus || "\u4e0d\u9650",
    notes: input.notes || "\u672a\u6ce8\u660e",
    examArea: input.examArea || input.area,
    publishedAt: input.publishedAt,
    sourceNoticeTitle: input.sourceNoticeTitle || "",
    sourceUrl: input.sourceUrl || "",
    normalizedReady: input.normalizedReady !== false,
    expired: Boolean(input.expired),
    hasManualCorrections: Boolean(input.hasManualCorrections),
    correctedFields: input.correctedFields || [],
    correctionSummary: input.correctionSummary || "",
    correctionLog: input.correctionLog || []
  };
}

function createCompareGroup(input) {
  return {
    id: input.id,
    userId: input.userId,
    name: input.name,
    examType: input.examType,
    positionIds: input.positionIds || [],
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

module.exports = {
  createSource,
  createNotice,
  createPositionBatch,
  createPosition,
  createCompareGroup
};
