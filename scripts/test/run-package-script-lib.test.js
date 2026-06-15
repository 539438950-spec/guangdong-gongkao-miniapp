const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveNpmRunProcess } = require("../run-package-script-lib");

test("run package script lib should prefer npm-cli.js on Windows", () => {
  const resolved = resolveNpmRunProcess("docs:check", {
    ProgramFiles: "C:\\Program Files",
    ComSpec: "C:\\Windows\\System32\\cmd.exe"
  }, "win32");

  assert.equal(resolved.command, process.execPath);
  assert.deepEqual(resolved.args, [
    "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    "run",
    "docs:check"
  ]);
});

test("run package script lib should fall back to npm on non-Windows", () => {
  const resolved = resolveNpmRunProcess("mvp:smoke", {}, "linux");

  assert.equal(resolved.command, "npm");
  assert.deepEqual(resolved.args, ["run", "mvp:smoke"]);
});
