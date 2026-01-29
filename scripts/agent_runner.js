const fs = require('fs');
const path = require('path');

// Usage: node agent_runner.js <path/to/svg>

const targetFile = process.argv[2];
const logFile = path.join(__dirname, '..', 'agent.log');

const timestamp = new Date().toISOString();
console.log(`[${timestamp}] 🤖 Agent Woke Up! Analyzing: ${targetFile}`);

// Verify connection
if (!targetFile) {
    console.error("No target file provided.");
    process.exit(1);
}

// Check for comments (Simulated "Action")
try {
    // Parse SVG to find the latest comment
    const content = fs.readFileSync(targetFile, 'utf-8');

    // Regex simple parser
    const groupRegex = /<g[^>]*class="agent-comment"[^>]*>([\s\S]*?)<\/g>/g;
    const transformRegex = /transform="translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)"/;
    const idRegex = /id="([^"]+)"/;

    let lastComment = null;
    let match;
    while ((match = groupRegex.exec(content)) !== null) {
        const fullGroupTag = match[0].substring(0, match[0].indexOf('>') + 1);
        const transformMatch = transformRegex.exec(fullGroupTag);
        const idMatch = idRegex.exec(fullGroupTag);

        if (transformMatch && idMatch) {
            lastComment = {
                id: idMatch[1],
                x: parseFloat(transformMatch[1]),
                y: parseFloat(transformMatch[2])
            };
        }
    }

    if (lastComment) {
        // Create a response bubble
        const responseId = `agent_reply_${Date.now()}`;
        const responseX = lastComment.x + 20;
        const responseY = lastComment.y + 50;

        const responseGroup = `
    <g id="${responseId}" transform="translate(${responseX}, ${responseY})" class="agent-response" style="cursor: grab;">
        <rect fill="#fef3c7" stroke="#d97706" stroke-width="2" rx="10" ry="10" width="180" height="30"></rect>
        <text x="90" y="20" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#92400e">🤖 Received: Processing...</text>
    </g>`;

        // Insert before closing </svg>
        const updatedContent = content.replace('</svg>', `${responseGroup}\n</svg>`);
        fs.writeFileSync(targetFile, updatedContent, 'utf8');

        console.log(`[${timestamp}] 🤖 Replied to ${lastComment.id} at (${responseX}, ${responseY})`);
        fs.appendFileSync(logFile, `[${timestamp}] 🤖 Replied to ${lastComment.id}\n`);
    } else {
        console.log(`[${timestamp}] 🤖 No comments found to reply to.`);
    }

} catch (err) {
    const errMgs = `[${timestamp}] ❌ Agent Error: ${err.message}\n`;
    fs.appendFileSync(logFile, errMgs);
    console.error(errMgs);
    process.exit(1);
}
