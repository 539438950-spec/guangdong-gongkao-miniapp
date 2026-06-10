const { validatePublishCandidate } = require("../../../../packages/shared/src");

function publishWithGate(store, source, candidate) {
  const publishValidation = validatePublishCandidate(candidate);
  if (!publishValidation.valid) {
    const stable = store.rollback(source.id);
    return {
      published: false,
      rollback: Boolean(stable),
      errors: publishValidation.errors,
      stablePayload: stable
    };
  }

  const payload = {
    source,
    notice: candidate.notice,
    batch: candidate.batch,
    positions: candidate.positions,
    publishedAt: new Date().toISOString()
  };
  store.publish(source.id, payload);

  return {
    published: true,
    rollback: false,
    errors: [],
    payload
  };
}

module.exports = {
  publishWithGate
};
