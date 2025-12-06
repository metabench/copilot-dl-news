#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const getFlagValue = (flag) => {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx === args.length - 1) return null;
    return args[idx + 1];
};

const repoRoot = path.join(__dirname, "..", "..", "..");
const selfModelPath = path.join(repoRoot, "docs", "agi", "SELF_MODEL.md");
const lessonsPath = path.join(repoRoot, "docs", "agi", "LESSONS.md");
const sessionsDir = path.join(repoRoot, "docs", "sessions");

const knownFiles = [selfModelPath, lessonsPath];

const readFileSafe = (targetPath) => {
    try {
        return {
            exists: true,
            content: fs.readFileSync(targetPath, "utf8"),
            updatedAt: fs.statSync(targetPath).mtime.toISOString()
        };
    } catch (err) {
        return { exists: false, error: err.message };
    }
};

const listSessionDirs = () => {
    if (!fs.existsSync(sessionsDir)) return [];
    return fs
        .readdirSync(sessionsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => (a < b ? 1 : -1));
};

const resolveSession = (slug) => {
    const targetSlug = slug ?? listSessionDirs()[0];
    if (!targetSlug) return null;
    const base = path.join(sessionsDir, targetSlug);
    const files = ["PLAN.md", "WORKING_NOTES.md", "SESSION_SUMMARY.md", "FOLLOW_UPS.md"];
    const payload = { slug: targetSlug, files: {} };
    for (const fileName of files) {
        const filePath = path.join(base, fileName);
        if (fs.existsSync(filePath)) {
            payload.files[fileName] = readFileSafe(filePath);
        }
    }
    return payload;
};

const sendJson = (res, statusCode, body) => {
    const json = JSON.stringify(body, null, 2);
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(json)
    });
    res.end(json);
};

const buildHandler = (settings) => (req, res) => {
    const url = new URL(req.url, `http://localhost:${settings.port}`);
    const segments = url.pathname.replace(/^\/+/u, "").split("/").filter(Boolean);

    if (req.method !== "GET") {
        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    if (segments.length === 0) {
        sendJson(res, 200, {
            service: "docs-memory-mcp",
            routes: [
                "/health",
                "/memory/self-model",
                "/memory/lessons",
                "/memory/sessions/latest",
                "/memory/sessions/{slug}"
            ]
        });
        return;
    }

    if (segments[0] === "health") {
        const missing = knownFiles.filter((filePath) => !fs.existsSync(filePath));
        sendJson(res, 200, {
            status: "ok",
            missingFiles: missing
        });
        return;
    }

    if (segments[0] === "memory") {
        const resource = segments[1];
        if (resource === "self-model") {
            const data = readFileSafe(selfModelPath);
            if (!data.exists) {
                sendJson(res, 500, { error: `Unable to read ${selfModelPath}`, details: data.error });
                return;
            }
            sendJson(res, 200, {
                type: "self-model",
                path: path.relative(repoRoot, selfModelPath),
                updatedAt: data.updatedAt,
                content: data.content
            });
            return;
        }

        if (resource === "lessons") {
            const data = readFileSafe(lessonsPath);
            if (!data.exists) {
                sendJson(res, 404, { error: "LESSONS.md not found" });
                return;
            }
            const recentEntries = data.content
                .split(/\r?\n/)
                .filter((line) => line.trim().length > 0)
                .slice(0, 200)
                .join("\n");
            sendJson(res, 200, {
                type: "lessons",
                path: path.relative(repoRoot, lessonsPath),
                updatedAt: data.updatedAt,
                excerpt: recentEntries
            });
            return;
        }

        if (resource === "sessions") {
            const requested = segments[2];
            if (requested === "latest" || requested === undefined) {
                const latestPayload = resolveSession();
                if (!latestPayload) {
                    sendJson(res, 404, { error: "No session directories detected" });
                    return;
                }
                latestPayload.available = listSessionDirs().slice(0, settings.maxSessions);
                sendJson(res, 200, latestPayload);
                return;
            }
            const payload = resolveSession(requested);
            if (!payload) {
                sendJson(res, 404, { error: `Session ${requested} not found` });
                return;
            }
            sendJson(res, 200, payload);
            return;
        }
    }

    sendJson(res, 404, { error: "Not found" });
};

const startDocsMemoryServer = (options = {}) => {
    const portFromArgs = Number(getFlagValue("--port"));
    const maxSessionsFromArgs = Number(getFlagValue("--max-sessions"));

    const settings = {
        port: options.port ?? portFromArgs ?? 4399,
        maxSessions: options.maxSessions ?? maxSessionsFromArgs ?? 5
    };

    const server = http.createServer(buildHandler(settings));
    server.listen(settings.port, () => {
        console.log(`Docs Memory MCP server listening on http://localhost:${settings.port}`);
        console.log(`Self model path: ${selfModelPath}`);
    });
    return { server, settings };
};

if (require.main === module) {
    const { server } = startDocsMemoryServer();
    const shutdown = () => {
        server.close(() => {
            console.log("Docs Memory MCP server stopped");
            process.exit(0);
        });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

module.exports = { startDocsMemoryServer };
