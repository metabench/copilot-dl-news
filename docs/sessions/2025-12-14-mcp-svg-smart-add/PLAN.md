# Plan: MCP SVG Smart Add Tool

## Objective
Implement a `svg_smart_add` tool in the SVG Editor MCP server that allows users to add content (text, notes) without worrying about SVG specifics. The tool will automatically size elements, find free space to avoid collisions, and suggest valid positions for subsequent content.

## Features
1.  **Content Parsing & Sizing**: Automatically calculate dimensions for text content.
2.  **Smart Positioning**:
    - Accept preferred coordinates.
    - If colliding, automatically find the nearest free space.
    - Respect SVG viewBox boundaries.
3.  **Element Composition**: Create compound elements (e.g., text inside a box for "notes").
4.  **Placement Suggestions**: Return a list of valid "next positions" (e.g., "right", "bottom") that are free of collisions.
5.  **Feedback**: Report whether the preferred position was used or if it was moved to avoid collision.

## Implementation Steps
1.  **Analyze `mcp-server.js`**: Understand existing helper functions (`getBounds`, `detectCollisions`).
2.  **Develop `findFreeSpace` Algorithm**:
    - Input: `doc`, `width`, `height`, `preferredX`, `preferredY`.
    - Logic: Check for overlaps. If overlap, search nearby (spiral or grid).
3.  **Develop `estimateSize` Helper**:
    - Input: `content`, `type`, `style`.
    - Logic: Heuristics for text width/height based on char count and font size.
4.  **Implement `svg_smart_add` Handler**:
    - Parse params.
    - Calculate size.
    - Find position.
    - Create elements (using `svg_add_element` logic or direct DOM manipulation).
    - Calculate suggestions.
    - Return result.
5.  **Test**: Create a test script to verify collision avoidance and placement.

## Risks
-   **Performance**: Collision detection on large SVGs might be slow if the search space is large.
-   **Text Sizing**: Exact text sizing in JSDOM is impossible without a rendering engine. We'll use heuristics.

## Verification
-   Run `test-smart-add.js` (to be created) which attempts to add multiple overlapping notes and verifies they are spaced out.
