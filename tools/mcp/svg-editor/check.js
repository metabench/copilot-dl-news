#!/usr/bin/env node
"use strict";

/**
 * Quick check script for SVG Editor MCP server
 */

const { tools } = require("./mcp-server");
const path = require("path");

async function runCheck() {
    console.log("SVG Editor MCP Check\n" + "=".repeat(40));

    // List tools
    console.log("\n📦 Available tools:");
    for (const [name, tool] of Object.entries(tools)) {
        console.log(`  - ${name}: ${tool.description.slice(0, 60)}...`);
    }

    // Test with a sample SVG
    const testSvg = path.join(__dirname, "..", "..", "..", "docs", "diagrams");
    const fs = require("fs");
    
    if (fs.existsSync(testSvg)) {
        const svgFiles = fs.readdirSync(testSvg).filter(f => f.endsWith(".svg"));
        if (svgFiles.length > 0) {
            const testFile = path.join(testSvg, svgFiles[0]);
            console.log(`\n🧪 Testing with: ${svgFiles[0]}`);
            
            // Open
            const openResult = tools.svg_open.handler({ filePath: testFile });
            console.log(`  svg_open: ${openResult.success ? "✅" : "❌"}`);
            
            if (openResult.success) {
                // List elements
                const listResult = tools.svg_list_elements.handler({ fileId: openResult.fileId });
                console.log(`  svg_list_elements: ${listResult.count} elements`);
                
                // Detect collisions
                const collisions = tools.svg_detect_collisions.handler({ fileId: openResult.fileId });
                console.log(`  svg_detect_collisions: ${collisions.total} (H:${collisions.high} M:${collisions.medium} L:${collisions.low})`);
                
                // Close
                tools.svg_close.handler({ fileId: openResult.fileId });
                console.log(`  svg_close: ✅`);
            }
        }
    }

    console.log("\n✅ SVG Editor MCP check complete");
}

runCheck().catch(err => {
    console.error("❌ Check failed:", err.message);
    process.exit(1);
});
