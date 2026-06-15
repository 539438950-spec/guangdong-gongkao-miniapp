#!/usr/bin/env node

const cp = require("node:child_process");
const path = require("node:path");

const {
  resolvePreferredDemoStatus,
  readDemoStatus,
  renderDemoStatusText,
  resolveOpenInstruction
} = require("./demo-status-lib");

function hasFlag(name) {
  return process.argv.includes(name);
}

function readFlagValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) {
    return "";
  }
  return process.argv[index + 1];
}

function resolveStatusPreference() {
  return hasFlag("--check")
    ? "check"
    : (hasFlag("--any") ? "any" : "serve");
}

async function resolveStatusSelection() {
  const raw = readFlagValue("--file");
  if (!raw) {
    return resolvePreferredDemoStatus(undefined, {
      preference: resolveStatusPreference()
    });
  }
  const resolvedPath = path.resolve(process.cwd(), raw);
  return {
    path: resolvedPath,
    status: readDemoStatus(resolvedPath),
    reachable: false
  };
}

function openDemo(url) {
  const instruction = resolveOpenInstruction(url);
  cp.execFileSync(instruction.command, instruction.args, {
    cwd: path.resolve(__dirname, ".."),
    stdio: "ignore"
  });
}

async function main() {
  const selection = await resolveStatusSelection();
  const statusPath = selection.path;
  const status = selection.status || readDemoStatus(statusPath);

  if (hasFlag("--json")) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  process.stdout.write(renderDemoStatusText(status));
  process.stdout.write(`statusFile: ${statusPath}\n`);
  process.stdout.write(`reachable: ${selection.reachable ? "true" : "false"}\n`);

  if (hasFlag("--open")) {
    if (!selection.reachable) {
      throw new Error("no reachable demo session found; run `npm run demo:start` first.");
    }
    openDemo(status.demoUrl);
    process.stdout.write(`opened: ${status.demoUrl}\n`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
