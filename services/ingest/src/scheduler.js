const { runIngestCycle } = require("./core/run-cycle");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startScheduler(options = {}) {
  const intervalMs = Number(options.intervalMs || process.env.INGEST_INTERVAL_MS || 300000);
  const maxCycles = options.maxCycles === undefined ? null : Number(options.maxCycles);
  let cycle = 0;

  while (maxCycles === null || cycle < maxCycles) {
    const startedAt = new Date();
    console.log(`[scheduler] cycle ${cycle + 1} started at ${startedAt.toISOString()}`);
    await runIngestCycle({
      ...options,
      now: startedAt,
      onlyDue: options.onlyDue !== false
    });
    cycle += 1;

    if (maxCycles !== null && cycle >= maxCycles) {
      break;
    }
    await sleep(intervalMs);
  }
}

module.exports = {
  startScheduler
};
