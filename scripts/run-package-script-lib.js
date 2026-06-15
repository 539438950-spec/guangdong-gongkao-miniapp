const fs = require("node:fs");
const path = require("node:path");

function resolveNpmRunProcess(scriptName, env = process.env, platform = process.platform) {
  const npmCliFromEnv = env.npm_execpath && env.npm_execpath.endsWith("npm-cli.js")
    ? env.npm_execpath
    : "";

  if (npmCliFromEnv) {
    return {
      command: process.execPath,
      args: [npmCliFromEnv, "run", scriptName]
    };
  }

  if (platform === "win32") {
    const installedNpmCli = path.join(
      env.ProgramFiles || "C:\\Program Files",
      "nodejs",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    );
    if (fs.existsSync(installedNpmCli)) {
      return {
        command: process.execPath,
        args: [installedNpmCli, "run", scriptName]
      };
    }

    const npmCmd = path.join(env.ProgramFiles || "C:\\Program Files", "nodejs", "npm.cmd");
    const command = env.ComSpec || path.join(env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
    return {
      command,
      args: ["/d", "/s", "/c", `call "${npmCmd}" run ${scriptName}`]
    };
  }

  return {
    command: "npm",
    args: ["run", scriptName]
  };
}

module.exports = {
  resolveNpmRunProcess
};
