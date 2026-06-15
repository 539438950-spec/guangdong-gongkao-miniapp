#!/usr/bin/env node

const cp = require("node:child_process");
const path = require("node:path");

const { resolveNpmRunProcess } = require("./run-package-script-lib");

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function main() {
  const scriptName = String(process.argv[2] || "").trim();
  const forwardedArgs = process.argv.slice(3);

  if (!scriptName) {
    throw new Error("missing package script name; usage: node scripts/run-package-script.js <script> [args...]");
  }

  const resolved = resolveNpmRunProcess(scriptName);
  const args = forwardedArgs.length > 0
    ? resolved.args.concat(["--", ...forwardedArgs])
    : resolved.args;

  cp.execFileSync(resolved.command, args, {
    cwd: repoRoot(),
    stdio: "inherit"
  });
}

if (require.main === module) {
  main();
}
