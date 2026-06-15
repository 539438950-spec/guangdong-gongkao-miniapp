#!/usr/bin/env node

const {
  buildBaselineReport,
  renderBaselineReportText
} = require("./baseline-report-lib");

function hasFlag(name) {
  return process.argv.includes(name);
}

function main() {
  const report = buildBaselineReport();
  if (hasFlag("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  process.stdout.write(renderBaselineReportText(report));
}

main();
