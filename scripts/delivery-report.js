#!/usr/bin/env node

const {
  collectDeliveryReport,
  renderTextReport
} = require("./delivery-report-lib");

function hasFlag(name) {
  return process.argv.includes(name);
}

function main() {
  const report = collectDeliveryReport();
  if (hasFlag("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  process.stdout.write(renderTextReport(report));
}

main();
