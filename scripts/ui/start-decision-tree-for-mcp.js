"use strict";

const { app } = require("../../src/ui/server/decisionTreeViewer/server");
const PORT = 3030;

async function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`
🌲 Decision Tree Viewer running at http://localhost:${PORT}

To inspect with MCP Browser tools:
1. Use mcp_microsoft_pla_browser_navigate to http://localhost:${PORT}
2. Use mcp_microsoft_pla_browser_take_screenshot or mcp_microsoft_pla_browser_snapshot

To inspect layout numerically:
Run: node scripts/ui/inspect-decision-tree-layout.js

Press Ctrl+C to stop.
`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer().catch(console.error);
}
