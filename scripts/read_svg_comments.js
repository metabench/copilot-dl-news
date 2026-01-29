const fs = require('fs');
const path = require('path');

// Usage: node read_svg_comments.js <path/to/file.svg>

const filePath = process.argv[2];

if (!filePath) {
    console.error("Usage: node read_svg_comments.js <path/to/file.svg>");
    process.exit(1);
}

try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Regex to find groups with class="agent-comment"
    // Looks for: <g ... class="agent-comment" ... > ... </g>
    const groupRegex = /<g[^>]*class="agent-comment"[^>]*>([\s\S]*?)<\/g>/g;
    const transformRegex = /transform="translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)"/;
    const idRegex = /id="([^"]+)"/;
    const targetRegex = /data-target="([^"]+)"/;
    const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/;

    const comments = [];
    let match;

    while ((match = groupRegex.exec(content)) !== null) {
        const groupContent = match[1];
        const fullGroupTag = match[0].substring(0, match[0].indexOf('>') + 1);

        // Extract X/Y from the opening <g> tag (not the inner content)
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

    if (comments.length === 0) {
        console.log("No comments found.");
    } else {
        console.log(`Found ${comments.length} comments in ${path.basename(filePath)}:\n`);
        comments.forEach(c => {
            console.log(`💬 "${c.text}"`);
            console.log(`   @ (${Math.round(c.x)}, ${Math.round(c.y)}) - ID: ${c.id}`);
            if (c.target) {
                console.log(`   🔗 Linked to: ${c.target}`);
            }
            console.log("-".repeat(40));
        });
    }

} catch (err) {
    console.error("Error reading SVG:", err.message);
}
