# SVG Editor MCP Server

MCP server providing structured SVG editing tools for AI agents.

## Quick Start

```bash
# Run as MCP server (stdio)
node tools/mcp/svg-editor/mcp-server.js

# Run as HTTP server
node tools/mcp/svg-editor/mcp-server.js --http

# Check installation
node tools/mcp/svg-editor/check.js
```

## Available Tools

| Tool | Description |
|------|-------------|
| `svg_open` | Open an SVG file for editing |
| `svg_list_elements` | List all visual elements with positions |
| `svg_get_element` | Get details of a specific element |
| `svg_detect_collisions` | Detect overlapping elements |
| `svg_move_element` | Move an element by offset |
| `svg_set_attribute` | Set an attribute value |
| `svg_fix_collision` | Auto-fix a detected collision |
| `svg_undo` | Undo the last modification |
| `svg_save` | Save modifications to file |
| `svg_close` | Close file and free resources |

## Workflow Example

```javascript
// 1. Open file
svg_open({ filePath: "diagram.svg" })

// 2. Detect problems
svg_detect_collisions({ fileId: "..." })

// 3. Fix collision #0
svg_fix_collision({ fileId: "...", collisionIndex: 0 })

// 4. Or manually move
svg_move_element({ fileId: "...", selector: "#my-text", dx: 20, dy: 0 })

// 5. Save
svg_save({ fileId: "..." })
```

## VS Code MCP Configuration

Add to `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "svg-editor": {
      "command": "node",
      "args": ["tools/mcp/svg-editor/mcp-server.js"]
    }
  }
}
```

## Dependencies

- `jsdom` - SVG DOM parsing and manipulation
