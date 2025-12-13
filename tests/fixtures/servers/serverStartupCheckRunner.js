"use strict";

const net = require("net");
const path = require("path");

const { handleStartupCheck } = require("../../../src/ui/server/utils/serverStartupCheck");

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close(() => {
        if (!port) {
          reject(new Error("Could not allocate a port"));
          return;
        }
        resolve(port);
      });
    });
  });
}

async function main() {
  const port = await getAvailablePort();
  const serverPath = path.resolve(__dirname, "minimalExpressServer.js");

  await handleStartupCheck({
    serverPath,
    port,
    host: "127.0.0.1",
    healthEndpoint: "/",
    timeout: 2000,
    serverName: "fixture-minimal"
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
