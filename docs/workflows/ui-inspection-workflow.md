# UI Inspection Workflow

This guide describes how to inspect UI components visually (using MCP Browser tools) and numerically (using Puppeteer scripts).

## 1. Visual Inspection with MCP Browser Tools

This method allows AI agents to "see" the UI by taking screenshots and snapshots via the Playwright MCP server.

### Step 1: Start the Server

Run the helper script to start the Decision Tree Viewer server:

```bash
node scripts/ui/start-decision-tree-for-mcp.js
```

This will start the server on port 3030. Keep this terminal running.

### Step 2: Use MCP Tools

In a separate agent session (or the same one if backgrounded), use the following tools:

1.  **Navigate**:
    ```json
    {
      "name": "mcp_microsoft_pla_browser_navigate",
      "arguments": { "url": "http://localhost:3030" }
    }
    ```

2.  **Take Screenshot**:
    ```json
    {
      "name": "mcp_microsoft_pla_browser_take_screenshot",
      "arguments": {
        "filename": "screenshots/decision-tree-viewer/inspection.png",
        "fullPage": true
      }
    }
    ```

3.  **Get Accessibility Snapshot** (for structure):
    ```json
    {
      "name": "mcp_microsoft_pla_browser_snapshot",
      "arguments": {}
    }
    ```

## 2. Numeric Layout Inspection with Puppeteer

This method extracts precise bounding boxes, styles, and overflow status to detect layout issues programmatically.

### Run the Inspection Script

```bash
node scripts/ui/inspect-decision-tree-layout.js
```

### Output Format

The script outputs a JSON object containing:

-   `nodes`: Array of node metrics
    -   `id`: Node ID
    -   `type`: "branch" or "result"
    -   `text`: Visible text
    -   `rect`: Bounding box {x, y, width, height}
    -   `contentRect`: Inner content bounding box
    -   `isOverflowing`: Boolean indicating if text overflows container
    -   `styles`: Computed styles (fontSize, padding)
-   `connections`: Array of connection line metrics

### Example Output

```json
{
  "nodes": [
    {
      "id": "root",
      "type": "branch",
      "text": "Is this a question?",
      "rect": { "x": 888, "y": 213, "width": 120, "height": 120 },
      "isOverflowing": false
    }
  ]
}
```

## 3. Standardized Server Check

Server lifecycle guidance (how to verify servers without hanging, and how to safely run long-lived UI servers) is canonical in:

- `docs/COMMAND_EXECUTION_GUIDE.md` → "🚨 Server Verification - CRITICAL FOR AGENTS 🚨"

For UI inspection specifically:

- Prefer the repo's existing `scripts/ui/*` helpers for the target app.
- If you need to add `--check` to a UI server, implement it using the shared helper `src/ui/server/utils/serverStartupCheck.js` and keep the workflow docs thin (link back to the command guide).
