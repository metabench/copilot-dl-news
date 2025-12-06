#!/usr/bin/env node
"use strict";

const http = require("http");
const { runHttpServer } = require("./mcp-server");

const port = 5000 + Math.floor(Math.random() * 1000);

const requestJson = (path) => (
    new Promise((resolve, reject) => {
        const req = http.request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
            let data = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (err) {
                    reject(err);
                }
            });
        });
        req.on("error", reject);
        req.end();
    })
);

(async () => {
    const server = runHttpServer(port);
    // Wait briefly for server to start
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
        const health = await requestJson("/health");
        console.log("Health status:", health.status);

        const selfModel = await requestJson("/memory/self-model");
        console.log("SELF_MODEL path:", selfModel.path, "chars:", selfModel.content.length);

        const lessons = await requestJson("/memory/lessons");
        console.log("Lessons excerpt length:", lessons.excerpt?.length ?? 0);

        const latest = await requestJson("/memory/sessions/latest");
        console.log("Latest session:", latest.slug);
        console.log("Exposed files:", Object.keys(latest.files));

        console.log("Docs Memory MCP check complete on port", port);
    } finally {
        server.close();
        process.exit(0);
    }
})().catch((err) => {
    console.error("Docs Memory MCP check failed", err);
    process.exitCode = 1;
});
