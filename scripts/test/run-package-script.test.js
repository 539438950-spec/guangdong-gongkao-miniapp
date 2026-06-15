const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const path = require("node:path");

test("run package script should execute repo package scripts through the shared resolver", () => {
  const script = path.resolve(process.cwd(), "scripts", "run-package-script.js");
  const output = cp.execFileSync(process.execPath, [
    script,
    "docs:check"
  ], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.ok(output.includes("广东公考文档入口校验"));
  assert.ok(output.includes("ok: true"));
});
