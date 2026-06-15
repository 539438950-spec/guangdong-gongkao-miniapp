const http = require("node:http");
const path = require("node:path");

const {
  defaultPaths,
  createJsonHeaders,
  handleApiRequest,
  persistUserState,
  hydrateUserState,
  normalizeOptions
} = require("./core");

const SERVER_SOCKETS = Symbol("gongkao.api.serverSockets");

function createRequestHandler(options) {
  return async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    const chunks = [];

    await new Promise((resolve, reject) => {
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", resolve);
      request.on("error", reject);
    });

    const result = await handleApiRequest(
      {
        method: request.method,
        pathname: url.pathname,
        bodyText: Buffer.concat(chunks).toString("utf8")
      },
      {
        ...options,
        baseUrl: `${url.protocol}//${url.host}`
      }
    );

    response.writeHead(result.statusCode, {
      ...createJsonHeaders({ connection: "close" }),
      ...result.headers
    });
    response.end(serializeResponsePayload(result));
  };
}

function createConfiguredServer(runtimeOptions) {
  const server = http.createServer(createRequestHandler(runtimeOptions));
  server[SERVER_SOCKETS] = new Set();
  server.removeAllListeners("request");
  server.on("request", createRequestHandler(runtimeOptions));
  server.on("connection", (socket) => {
    server[SERVER_SOCKETS].add(socket);
    socket.on("close", () => {
      server[SERVER_SOCKETS].delete(socket);
    });
  });
  return server;
}

function listenServer(server, port) {
  return new Promise((resolve, reject) => {
    const handleListening = () => {
      server.off("error", handleError);
      resolve();
    };
    const handleError = (error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    server.once("listening", handleListening);
    server.once("error", handleError);
    server.listen(port);
  });
}

function serializeResponsePayload(result) {
  const headers = result && result.headers ? result.headers : {};
  const contentType = String(headers["content-type"] || headers["Content-Type"] || "");
  if (contentType.includes("text/html")) {
    return String(result.payload || "");
  }
  return `${JSON.stringify(result.payload)}\n`;
}

async function startApiServer(options = {}) {
  const paths = defaultPaths();
  const requestedPort = Number(
    options.port !== undefined
      ? options.port
      : (process.env.GONGKAO_API_PORT || 3100)
  );
  const allowPortFallback = Boolean(options.allowPortFallback);
  const runtimeOptions = normalizeOptions({
    userStateFile: options.userStateFile || paths.userStateFile,
    snapshotTarget: options.snapshotTarget || paths.snapshotTarget,
    ingestStoreRoot: options.ingestStoreRoot || paths.ingestStoreRoot,
    positionOverridePath: options.positionOverridePath || paths.positionOverridePath,
    demoSnapshotTarget: options.demoSnapshotTarget || paths.demoSnapshotTarget
  });
  let server = createConfiguredServer(runtimeOptions);
  let usedPort = requestedPort;

  try {
    await listenServer(server, usedPort);
  } catch (error) {
    if (!allowPortFallback || usedPort === 0 || !error || error.code !== "EADDRINUSE") {
      throw error;
    }
    server.removeAllListeners();
    usedPort = 0;
    server = createConfiguredServer(runtimeOptions);
    await listenServer(server, usedPort);
  }
  if (typeof server.unref === "function") {
    server.unref();
  }

  return {
    server,
    port: server.address().port,
    requestedPort,
    userStateFile: runtimeOptions.userStateFile,
    snapshotTarget: runtimeOptions.snapshotTarget,
    ingestStoreRoot: runtimeOptions.ingestStoreRoot,
    positionOverridePath: runtimeOptions.positionOverridePath
  };
}

function closeApiServer(server) {
  return new Promise((resolve, reject) => {
    const sockets = server[SERVER_SOCKETS];
    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    if (sockets && typeof sockets.forEach === "function") {
      sockets.forEach((socket) => socket.destroy());
      sockets.clear();
    }
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) {
    return "";
  }
  return process.argv[index + 1];
}

async function main() {
  const defaults = defaultPaths();
  const portArg = getArgValue("--port");
  const port = portArg !== "" ? portArg : (process.env.GONGKAO_API_PORT || 3100);
  const snapshotTarget = getArgValue("--snapshot-target")
    ? path.resolve(process.cwd(), getArgValue("--snapshot-target"))
    : defaults.snapshotTarget;
  const ingestStoreRoot = getArgValue("--ingest-store-root")
    ? path.resolve(process.cwd(), getArgValue("--ingest-store-root"))
    : defaults.ingestStoreRoot;
  const positionOverridePath = getArgValue("--position-override-path")
    ? path.resolve(process.cwd(), getArgValue("--position-override-path"))
    : defaults.positionOverridePath;
  const userStateFile = getArgValue("--user-state-file")
    ? path.resolve(process.cwd(), getArgValue("--user-state-file"))
    : defaults.userStateFile;
  const instance = await startApiServer({
    port,
    allowPortFallback: portArg === "",
    userStateFile,
    snapshotTarget,
    ingestStoreRoot,
    positionOverridePath
  });

  if (Number(instance.requestedPort) > 0 && Number(instance.port) !== Number(instance.requestedPort)) {
    console.log(`[api] requested port ${instance.requestedPort} was busy, fell back to ${instance.port}`);
  }
  console.log(`[api] listening on http://127.0.0.1:${instance.port}`);
  console.log(`[api] user state file: ${instance.userStateFile}`);
  console.log(`[api] snapshot target: ${instance.snapshotTarget}`);
  console.log(`[api] ingest store root: ${instance.ingestStoreRoot}`);
  console.log(`[api] position override path: ${instance.positionOverridePath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  startApiServer,
  closeApiServer,
  persistUserState,
  hydrateUserState,
  createRequestHandler
};
