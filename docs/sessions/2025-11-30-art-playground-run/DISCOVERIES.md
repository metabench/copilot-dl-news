# Discoveries – Art Playground Run

- The art playground server runs from `src/ui/server/artPlayground/server.js` and exposes the UI at `http://localhost:4950`.
- The client bundle must be rebuilt (`node scripts/build-art-playground-client.js`) whenever the front-end changes.
- Agents can interact with the UI via MCP browser tools; the rectangle button (`▭ Rectangle`) is the easiest way to add shapes (one click per rectangle).
- The MCP snapshot reveals the toolbar structure and confirms the button references (e11 for rectangles, e12 for ellipses, etc.).
- The evaluation API can count inserted `<rect>` elements and return their attributes, making validation straightforward.
