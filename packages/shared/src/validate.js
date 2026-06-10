function validateNotice(notice) {
  const errors = [];

  if (!notice.title) errors.push("missing title");
  if (!notice.url) errors.push("missing url");
  if (!notice.sourceId) errors.push("missing sourceId");
  if (!notice.publishedAt) errors.push("missing publishedAt");

  return {
    valid: errors.length === 0,
    errors
  };
}

function validatePositionBatch(batch, positions) {
  const errors = [];
  if (!batch.attachmentUrl) errors.push("missing attachmentUrl");
  if (batch.parseStatus === "attachment-only") {
    return {
      valid: errors.length === 0,
      errors
    };
  }
  if (!positions.length) errors.push("missing positions");
  const invalidHeadcount = positions.some((position) => position.headcount <= 0);
  if (invalidHeadcount) errors.push("invalid headcount");
  const invalidTitle = positions.some((position) => !position.title || !position.agency);
  if (invalidTitle) errors.push("missing agency or title");

  return {
    valid: errors.length === 0,
    errors
  };
}

function validatePublishCandidate(candidate) {
  const errors = [];

  if (!candidate.noticeValidation.valid) {
    errors.push(...candidate.noticeValidation.errors);
  }
  if (!candidate.batchValidation.valid) {
    errors.push(...candidate.batchValidation.errors);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateNotice,
  validatePositionBatch,
  validatePublishCandidate
};
