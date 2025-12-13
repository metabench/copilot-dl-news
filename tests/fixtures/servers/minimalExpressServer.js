"use strict";

const express = require("express");

function parseArgs(argv) {
  const args = { host: "127.0.0.1", port: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--host" && argv[i + 1]) {
      args.host = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--port" && argv[i + 1]) {
      args.port = Number(argv[i + 1]);
      i += 1;
      continue;
    }
  }
  return args;
}

function main() {
  const { host, port } = parseArgs(process.argv.slice(2));
  const app = express();

  app.get("/", (req, res) => {
    res.status(200).send("ok");
  });

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, v: 1 });
  });

  const server = app.listen(port, host, () => {
    console.log(`fixture-server listening ${host}:${server.address().port}`);
  });

  function shutdown() {
    server.close(() => {
      process.exit(0);
    });
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  main();
}
