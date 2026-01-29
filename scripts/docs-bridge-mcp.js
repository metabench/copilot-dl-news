#!/usr/bin/env node
const http = require('http');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// Config
const REMOTE_URL = 'http://144.21.35.104:4700';
const STREAM_PATH = '/api/plugins/svg-editor/stream';

// MPC Server Setup
const server = new Server(
    { name: "docs-bridge-mcp", version: "1.0.0" },
    {
        capabilities: {
            resources: {},
            tools: {},
            notifications: true,
            sampling: {}
        },
    }
);

// Comment parsing regex (same as read_svg_comments.js)
function parseComments(svgContent) {
    const groupRegex = /<g[^>]*class="agent-comment"[^>]*>([\s\S]*?)<\/g>/g;
    const transformRegex = /transform="translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)"/;
    const idRegex = /id="([^"]+)"/;
    const targetRegex = /data-target="([^"]+)"/;
    const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/;

    const comments = [];
    let match;

    while ((match = groupRegex.exec(svgContent)) !== null) {
        const groupContent = match[1];
        const fullGroupTag = match[0].substring(0, match[0].indexOf('>') + 1);

        const transformMatch = transformRegex.exec(fullGroupTag);
        let x = 0, y = 0;
        if (transformMatch) {
            x = parseFloat(transformMatch[1]);
            y = parseFloat(transformMatch[2]);
        }

        const idMatch = idRegex.exec(fullGroupTag);
        const id = idMatch ? idMatch[1] : 'unknown';

        const targetMatch = targetRegex.exec(fullGroupTag);
        const target = targetMatch ? targetMatch[1] : null;

        const textMatch = textRegex.exec(groupContent);
        const text = textMatch ? textMatch[1] : '[Empty]';

        comments.push({ id, text, x, y, target });
    }

    return comments;
}

async function triggerSampling(filePath, comments) {
    if (comments.length === 0) return;

    const commentList = comments.map(c =>
        `- "${c.text}" ${c.target ? `(linked to: ${c.target})` : ''}`
    ).join('\n');

    const prompt = `📋 **New SVG Comments Detected**

**File:** ${filePath}

**Comments:**
${commentList}

Please analyze these comments and take action as appropriate. If a comment is a question, answer it. If it's an instruction, execute it. If unclear, ask for clarification.`;

    console.error(`[Bridge] Triggering sampling for ${comments.length} comments...`);

    try {
        // MCP SDK method for sampling
        const result = await server.createMessage({
            messages: [{
                role: "user",
                content: { type: "text", text: prompt }
            }],
            maxTokens: 2000
        });

        console.error(`[Bridge] Sampling response received:`, result?.content?.text?.substring(0, 100));
        return result;
    } catch (err) {
        console.error(`[Bridge] Sampling failed:`, err.message);
        // Fallback: Write to pending file
        const fs = require('fs');
        const path = require('path');
        const pendingPath = path.join(__dirname, '..', '.agent', 'pending_comments.md');

        try {
            fs.mkdirSync(path.dirname(pendingPath), { recursive: true });
            fs.appendFileSync(pendingPath, `\n## ${new Date().toISOString()}\n${prompt}\n---\n`);
            console.error(`[Bridge] Wrote to pending_comments.md as fallback`);
        } catch (writeErr) {
            console.error(`[Bridge] Fallback write failed:`, writeErr.message);
        }
    }
}

async function run() {
    console.error(`[Bridge] Connecting to SSE: ${REMOTE_URL}${STREAM_PATH}`);

    // Start MCP Transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[Bridge] MCP Server running on stdio");

    // Connect HTTP stream
    const req = http.get(REMOTE_URL + STREAM_PATH, (res) => {
        if (res.statusCode !== 200) {
            console.error(`[Bridge] Failed to connect: ${res.statusCode}`);
            return;
        }

        console.error(`[Bridge] Connected to Remote Server.`);
        server.sendLoggingMessage({ level: 'info', data: 'Connected to Remote Docs Server' });

        res.setEncoding('utf8');
        let buffer = '';

        res.on('data', async (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep partial line

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    try {
                        const data = JSON.parse(jsonStr);
                        if (data.type === 'file_changed') {
                            const filePath = data.file;
                            const uri = `docs://${filePath}`;
                            console.error(`[Bridge] 🔔 Notification: Resource Updated ${uri}`);

                            // Log to MCP client
                            server.sendLoggingMessage({ level: 'info', data: `Resource Updated: ${uri}` });

                            // Fetch and parse comments
                            try {
                                const fetchUrl = `${REMOTE_URL}/docs/${filePath}`;
                                const resp = await fetch(fetchUrl);
                                if (resp.ok) {
                                    const svgContent = await resp.text();
                                    const comments = parseComments(svgContent);

                                    if (comments.length > 0) {
                                        console.error(`[Bridge] Found ${comments.length} comments, triggering sampling...`);
                                        await triggerSampling(filePath, comments);
                                    }
                                }
                            } catch (fetchErr) {
                                console.error(`[Bridge] Failed to fetch/parse:`, fetchErr.message);
                            }
                        }
                    } catch (e) { /* ignore */ }
                }
            }
        });

        res.on('end', () => {
            console.error('[Bridge] Stream ended by server.');
            process.exit(0);
        });
    });

    req.on('error', (err) => {
        console.error('[Bridge] Stream Error:', err);
        setTimeout(run, 5000); // Retry
    });
}


// Handle Resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: "docs://design/repo-division-plan-v5.svg",
                name: "Repo Division Plan v5",
                mimeType: "image/svg+xml"
            }
        ]
    };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const url = request.params.uri; // docs://...
    const relativePath = url.replace('docs://', '');

    // Fetch from Remote using standard fetch (short-lived is fine here)
    const fetchUrl = `${REMOTE_URL}/docs/${relativePath}`;
    console.error(`[Bridge] Reading: ${fetchUrl}`);

    try {
        const resp = await fetch(fetchUrl);
        if (!resp.ok) throw new Error(resp.statusText);
        const text = await resp.text();
        return {
            contents: [{
                uri: url,
                mimeType: "image/svg+xml",
                text: text
            }]
        };
    } catch (err) {
        throw new Error(`Failed to read remote file: ${err.message}`);
    }
});

// --- TOOLS ---

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "mark_comment_done",
                description: "Marks a comment bubble as done by changing its border color to green. Use after completing the task described in a comment.",
                inputSchema: {
                    type: "object",
                    properties: {
                        file: {
                            type: "string",
                            description: "Relative path to the SVG file (e.g., 'design/repo-division-plan-v5.svg')"
                        },
                        commentId: {
                            type: "string",
                            description: "The ID of the comment element (e.g., 'c_1768907587233')"
                        }
                    },
                    required: ["file", "commentId"]
                }
            },
            {
                name: "update_element_style",
                description: "Changes the visual style of an SVG element. Can be used to shade boxes, highlight progress, or mark items as complete.",
                inputSchema: {
                    type: "object",
                    properties: {
                        file: {
                            type: "string",
                            description: "Relative path to the SVG file"
                        },
                        elementId: {
                            type: "string",
                            description: "The ID of the element to update"
                        },
                        fill: {
                            type: "string",
                            description: "New fill color (e.g., '#90EE90' for light green)"
                        },
                        stroke: {
                            type: "string",
                            description: "New stroke color"
                        },
                        opacity: {
                            type: "string",
                            description: "New opacity (0-1)"
                        }
                    },
                    required: ["file", "elementId"]
                }
            },
            {
                name: "add_agent_reply",
                description: "Appends an agent response to a comment bubble. Use to answer questions left in comments.",
                inputSchema: {
                    type: "object",
                    properties: {
                        file: {
                            type: "string",
                            description: "Relative path to the SVG file"
                        },
                        commentId: {
                            type: "string",
                            description: "The ID of the comment to reply to"
                        },
                        reply: {
                            type: "string",
                            description: "The agent's response text"
                        }
                    },
                    required: ["file", "commentId", "reply"]
                }
            }
        ]
    };
});

// Execute tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`[Bridge] Tool called: ${name}`, args);

    // Helper to fetch, modify, and save SVG
    async function modifyAndSave(file, modifyFn) {
        // Fetch current SVG
        const fetchUrl = `${REMOTE_URL}/docs/${file}`;
        const resp = await fetch(fetchUrl);
        if (!resp.ok) throw new Error(`Failed to fetch ${file}: ${resp.statusText}`);
        let content = await resp.text();

        // Apply modification
        content = modifyFn(content);

        // Save back
        const saveResp = await fetch(`${REMOTE_URL}/api/plugins/svg-editor/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filePath: file,
                content: content,
                logEntry: `Agent update via ${name}`
            })
        });

        if (!saveResp.ok) {
            const errText = await saveResp.text();
            throw new Error(`Failed to save: ${errText}`);
        }

        return await saveResp.json();
    }

    try {
        if (name === 'mark_comment_done') {
            const { file, commentId } = args;
            await modifyAndSave(file, (svg) => {
                // Find the comment group and change its stroke to green
                const regex = new RegExp(`(<g[^>]*id="${commentId}"[^>]*>)([\\s\\S]*?)(<rect[^>]*)stroke="[^"]*"`, 'g');
                return svg.replace(regex, '$1$2$3stroke="#22c55e"'); // Green stroke
            });
            return { content: [{ type: "text", text: `✅ Comment ${commentId} marked as done` }] };
        }

        if (name === 'update_element_style') {
            const { file, elementId, fill, stroke, opacity } = args;
            await modifyAndSave(file, (svg) => {
                let modified = svg;
                const idPattern = `id="${elementId}"`;

                // Find element and update its style attributes
                if (fill) {
                    // Update fill on the element or its first child rect/path
                    modified = modified.replace(
                        new RegExp(`(id="${elementId}"[^>]*>\\s*<(?:rect|path|circle|ellipse)[^>]*)fill="[^"]*"`, 'g'),
                        `$1fill="${fill}"`
                    );
                }
                if (stroke) {
                    modified = modified.replace(
                        new RegExp(`(id="${elementId}"[^>]*>\\s*<(?:rect|path|circle|ellipse)[^>]*)stroke="[^"]*"`, 'g'),
                        `$1stroke="${stroke}"`
                    );
                }
                if (opacity) {
                    // Add or update opacity style
                    const opacityStyle = `opacity:${opacity}`;
                    if (modified.includes(idPattern)) {
                        // If element has style, append; otherwise add style attribute
                        modified = modified.replace(
                            new RegExp(`(<g[^>]*id="${elementId}"[^>]*)>`, 'g'),
                            `$1 style="${opacityStyle}">`
                        );
                    }
                }
                return modified;
            });
            return { content: [{ type: "text", text: `🎨 Element ${elementId} style updated` }] };
        }

        if (name === 'add_agent_reply') {
            const { file, commentId, reply } = args;
            await modifyAndSave(file, (svg) => {
                // Find the comment and append a reply text element
                const replyEl = `<text x="80" y="55" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#3b82f6" class="agent-reply">🤖 ${reply.substring(0, 50)}${reply.length > 50 ? '...' : ''}</text>`;

                // Insert before closing </g> of the comment
                const regex = new RegExp(`(<g[^>]*id="${commentId}"[^>]*>[\\s\\S]*?)(</g>)`);
                return svg.replace(regex, `$1${replyEl}$2`);
            });
            return { content: [{ type: "text", text: `💬 Reply added to ${commentId}` }] };
        }

        throw new Error(`Unknown tool: ${name}`);
    } catch (err) {
        console.error(`[Bridge] Tool error:`, err.message);
        return { content: [{ type: "text", text: `❌ Error: ${err.message}` }], isError: true };
    }
});

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);

run().catch((error) => {
    console.error("Fatal Error:", error);
    process.exit(1);
});
