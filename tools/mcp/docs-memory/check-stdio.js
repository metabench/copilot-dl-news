#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const path = require("path");

const serverPath = path.join(__dirname, "mcp-server.js");

const child = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env }
});

let buffer = "";
const messages = [];
let finished = false;

const finish = (ok, message) => {
    if (finished) return;
    finished = true;
    child.kill();
    if (ok) {
        console.log(message);
        process.exit(0);
    } else {
        console.error(message);
        process.exit(1);
    }
};

const validate = () => {
    const initResp = messages.find((msg) => msg.id === 1);
    const listResp = messages.find((msg) => msg.id === 2);
    const skillsResp = messages.find((msg) => msg.id === 3);
    const topicsResp = messages.find((msg) => msg.id === 4);
    const objectiveGetResp = messages.find((msg) => msg.id === 5);

    if (!initResp) {
        finish(false, "No initialize response received");
        return;
    }

    if (!listResp) {
        finish(false, "No tools/list response received");
        return;
    }

    if (!Array.isArray(listResp.result?.tools) || listResp.result.tools.length === 0) {
        finish(false, "tools/list response missing tools array");
        return;
    }

    const toolNames = new Set(listResp.result.tools.map((t) => t.name));
    const requiredTools = [
        "docs_memory_listSkills",
        "docs_memory_searchSkills",
        "docs_memory_getSkill",
        "docs_memory_recommendSkills",
        "docs_memory_listTopics",
        "docs_memory_getObjectiveState",
        "docs_memory_updateObjectiveState"
    ];

    for (const name of requiredTools) {
        if (!toolNames.has(name)) {
            finish(false, `Missing required tool: ${name}`);
            return;
        }
    }

    if (!skillsResp?.result?.content?.[0]?.text) {
        finish(false, "Missing skills list response (tools/call id=3)");
        return;
    }
    if (!topicsResp?.result?.content?.[0]?.text) {
        finish(false, "Missing topics list response (tools/call id=4)");
        return;
    }
    if (!objectiveGetResp?.result?.content?.[0]?.text) {
        finish(false, "Missing objective state response (tools/call id=5)");
        return;
    }

    finish(true, "docs-memory stdio headerless batching check passed (skills + objective tools present)");
};

child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop();

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        try {
            messages.push(JSON.parse(trimmed));
        } catch (err) {
            finish(false, `Failed to parse server response: ${err.message}`);
            return;
        }
    }

    if (messages.length >= 5) {
        validate();
    }
});

child.on("error", (err) => {
    finish(false, `Failed to start server: ${err.message}`);
});

child.on("exit", (code) => {
    if (!finished) {
        finish(false, `Server exited unexpectedly with code ${code}`);
    }
});

const initMessage = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "docs-memory-check", version: "1.0" }
    }
});

const listMessage = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
});

const callListSkills = JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
        name: "docs_memory_listSkills",
        arguments: { limit: 20 }
    }
});

const callListTopics = JSON.stringify({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
        name: "docs_memory_listTopics",
        arguments: { limit: 50 }
    }
});

const callObjectiveState = JSON.stringify({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
        name: "docs_memory_getObjectiveState",
        arguments: {}
    }
});

child.stdin.write(`${initMessage}\n${listMessage}\n${callListSkills}\n${callListTopics}\n${callObjectiveState}\n`);
child.stdin.end();

setTimeout(() => {
    finish(false, "Timed out waiting for responses");
}, 2000);
