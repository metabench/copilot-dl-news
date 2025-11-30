# Art Playground Agent Workflow Guide

> **Purpose**: Enable AI agents (including Claude Haiku) to interact with the Art Playground app using MCP browser tools to draw and manipulate SVG shapes.

## Overview

The **Art Playground** is an interactive SVG component editor at `http://localhost:4950`. It provides:
- A toolbar for selecting tools and adding shapes
- An SVG canvas with a grid background
- Selection handles for resizing components
- Event-driven architecture using jsgui3

This guide explains how AI agents can:
1. Start the server
2. Navigate to the app
3. Add shapes (rectangles, ellipses, text)
4. Select and manipulate components
5. Verify their actions

---

## Architecture Understanding

### Server-Side (jsgui3-html)
```
src/ui/server/artPlayground/
├── server.js                 # Express server, port 4950
├── client.js                 # Client entry point (bundled)
├── client.bundle.js          # Bundled client code
├── public/
│   └── art-playground.css    # Styles
└── isomorphic/
    └── controls/
        ├── ArtPlaygroundAppControl.js   # Main app container
        ├── ToolbarControl.js            # Toolbar with buttons
        ├── CanvasControl.js             # SVG canvas
        ├── SelectionHandlesControl.js   # Resize handles
        └── ComponentControl.js          # Shape abstraction
```

### How It Works

1. **Server renders HTML** → jsgui3-html outputs the initial DOM
2. **Browser loads client.bundle.js** → Activates controls, adds event listeners
3. **User clicks buttons** → ToolbarControl raises events (`add-component`, `tool-change`)
4. **ArtPlaygroundAppControl wires events** → Connects toolbar to canvas
5. **CanvasControl adds SVG elements** → Creates `<rect>`, `<ellipse>`, `<text>` in SVG
6. **SelectionHandles appear** → Positioned around the selected component

---

## Workflow for AI Agents

### Step 1: Start the Server

**Using Terminal:**
```powershell
# Start in background (recommended for agents)
Start-Process -NoNewWindow -FilePath node -ArgumentList "src/ui/server/artPlayground/server.js"; Start-Sleep 2

# OR use the server's built-in detached mode
node src/ui/server/artPlayground/server.js --detached
```

**Check if running:**
```powershell
node src/ui/server/artPlayground/server.js --status
```

**Stop when done:**
```powershell
node src/ui/server/artPlayground/server.js --stop
```

### Step 2: Navigate to the App

**Using MCP browser tools:**
```javascript
// Navigate to the Art Playground
mcp_microsoft_pla_browser_navigate({ url: "http://localhost:4950" })
```

**Expected console output:**
```
[Art Playground] Initializing client...
[Art Playground] Activating toolbar...
[Art Playground] Activating canvas...
[Art Playground] Wiring toolbar to canvas...
[Art Playground] Client activated
```

### Step 3: Take a Snapshot to See Available Elements

```javascript
mcp_microsoft_pla_browser_snapshot()
```

**Expected snapshot structure:**
```yaml
- generic [ref=e2]:                    # .art-app (main container)
  - generic [ref=e3]:                  # .art-toolbar
    - generic [ref=e4]:                # Tools section
      - generic [ref=e5]: "Tools:"
      - button "⎋ Select" [ref=e6]     # Select tool
      - button "✋ Pan" [ref=e7]        # Pan tool
    - generic [ref=e9]:                # Add section
      - generic [ref=e10]: "Add:"
      - button "▭ Rectangle" [ref=e11] # Add rectangle
      - button "◯ Ellipse" [ref=e12]   # Add ellipse
      - button "T Text" [ref=e13]      # Add text
    - button "🗑️ Delete" [ref=e16]     # Delete selected
  - img [ref=e19]                      # Canvas (SVG appears as img in a11y tree)
```

---

## Adding Shapes

### Add a Rectangle

**Click the Rectangle button:**
```javascript
mcp_microsoft_pla_browser_click({
  element: "Rectangle button to add a rectangle",
  ref: "e11"
})
```

**Expected console output:**
```
[Art Playground] Button clicked: add-rect
[Art Playground] Adding component: rect
```

**Verify with JavaScript evaluation:**
```javascript
mcp_microsoft_pla_browser_evaluate({
  function: `() => {
    const svg = document.querySelector('.art-canvas__svg');
    const componentsGroup = svg?.querySelector('.art-canvas__components');
    const rects = componentsGroup?.querySelectorAll('rect');
    return {
      rectCount: rects?.length,
      lastRect: rects?.length ? {
        x: rects[rects.length - 1].getAttribute('x'),
        y: rects[rects.length - 1].getAttribute('y'),
        width: rects[rects.length - 1].getAttribute('width'),
        height: rects[rects.length - 1].getAttribute('height'),
        fill: rects[rects.length - 1].getAttribute('fill')
      } : null
    };
  }`
})
```

### Add an Ellipse

```javascript
mcp_microsoft_pla_browser_click({
  element: "Ellipse button to add an ellipse",
  ref: "e12"
})
```

**Verify ellipse added:**
```javascript
mcp_microsoft_pla_browser_evaluate({
  function: `() => {
    const svg = document.querySelector('.art-canvas__svg');
    const ellipses = svg?.querySelectorAll('ellipse');
    return { ellipseCount: ellipses?.length };
  }`
})
```

### Add Text

```javascript
mcp_microsoft_pla_browser_click({
  element: "Text button to add text",
  ref: "e13"
})
```

---

## Selecting Components

### Click on an Existing Component

To select a specific component (e.g., a rectangle), use JavaScript to simulate a click:

```javascript
mcp_microsoft_pla_browser_evaluate({
  function: `() => {
    // Find the first rectangle
    const rect = document.querySelector('.art-canvas__components rect');
    if (rect) {
      // Dispatch mousedown event (this is what triggers selection)
      const event = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: 0,
        clientY: 0
      });
      rect.dispatchEvent(event);
      return 'Selected rectangle';
    }
    return 'No rectangle found';
  }`
})
```

### Check What's Currently Selected

```javascript
mcp_microsoft_pla_browser_evaluate({
  function: `() => {
    const app = document.querySelector('.art-app').__jsgui_control;
    const canvas = app?._canvas;
    return {
      selectedId: canvas?._selectedId,
      componentCount: canvas?._components?.size
    };
  }`
})
```

---

## Understanding the Selection Handles

When a component is selected, 8 resize handles appear around it:

```
    nw ─── n ─── ne
    │            │
    w            e
    │            │
    sw ─── s ─── se
```

Each handle has a `data-handle` attribute:
- `nw` = northwest (top-left corner)
- `n` = north (top center)
- `ne` = northeast (top-right corner)
- `e` = east (right center)
- `se` = southeast (bottom-right corner)
- `s` = south (bottom center)
- `sw` = southwest (bottom-left corner)
- `w` = west (left center)

### Check Selection Handles Position

```javascript
mcp_microsoft_pla_browser_evaluate({
  function: `() => {
    const selection = document.querySelector('.art-selection');
    if (!selection) return { visible: false };
    
    const style = window.getComputedStyle(selection);
    return {
      visible: style.display !== 'none',
      left: selection.style.left,
      top: selection.style.top,
      width: selection.style.width,
      height: selection.style.height
    };
  }`
})
```

---

## Tool Selection

### Switch to Select Tool

```javascript
mcp_microsoft_pla_browser_click({
  element: "Select tool button",
  ref: "e6"
})
```

**Expected behavior:** 
- Select button becomes active (highlighted)
- Click on components to select them
- Drag to move components (not fully implemented yet)

### Switch to Pan Tool

```javascript
mcp_microsoft_pla_browser_click({
  element: "Pan tool button", 
  ref: "e7"
})
```

---

## Deleting Components

### Delete the Selected Component

First, make sure a component is selected, then:

```javascript
mcp_microsoft_pla_browser_click({
  element: "Delete button",
  ref: "e16"
})
```

**Expected console output:**
```
[Art Playground] Button clicked: delete
[Art Playground] Deleting selected
```

---

## Taking Screenshots

### Capture the Current State

```javascript
mcp_microsoft_pla_browser_take_screenshot({
  filename: "art-playground-state.png"
})
```

The screenshot is saved to `.playwright-mcp/art-playground-state.png`.

---

## Complete Example Workflow

Here's a full workflow for an AI agent to draw shapes:

```javascript
// 1. Navigate to the app
await mcp_microsoft_pla_browser_navigate({ url: "http://localhost:4950" });

// 2. Wait for client activation
await mcp_microsoft_pla_browser_wait_for({ text: "[Art Playground] Client activated" });

// 3. Take initial snapshot
const snapshot = await mcp_microsoft_pla_browser_snapshot();

// 4. Add a rectangle
await mcp_microsoft_pla_browser_click({ element: "Rectangle button", ref: "e11" });

// 5. Add an ellipse  
await mcp_microsoft_pla_browser_click({ element: "Ellipse button", ref: "e12" });

// 6. Verify components were added
const result = await mcp_microsoft_pla_browser_evaluate({
  function: `() => {
    const svg = document.querySelector('.art-canvas__svg');
    const components = svg?.querySelector('.art-canvas__components');
    return {
      rects: components?.querySelectorAll('rect').length,
      ellipses: components?.querySelectorAll('ellipse').length,
      texts: components?.querySelectorAll('text').length
    };
  }`
});

// 7. Take a screenshot of the result
await mcp_microsoft_pla_browser_take_screenshot({ filename: "shapes-added.png" });

// 8. Close when done
await mcp_microsoft_pla_browser_close();
```

---

## Debugging Tips

### Check Console Messages

```javascript
mcp_microsoft_pla_browser_console_messages()
```

Look for:
- `[Art Playground] ...` messages from the app
- Errors that might indicate problems

### Check for Errors Only

```javascript
mcp_microsoft_pla_browser_console_messages({ onlyErrors: true })
```

### Inspect the DOM Structure

```javascript
mcp_microsoft_pla_browser_evaluate({
  function: `() => {
    const canvas = document.querySelector('.art-canvas');
    return {
      canvasExists: !!canvas,
      svgExists: !!canvas?.querySelector('.art-canvas__svg'),
      componentsGroupExists: !!canvas?.querySelector('.art-canvas__components'),
      selectionHandlesExists: !!canvas?.querySelector('.art-selection')
    };
  }`
})
```

### Inspect Component Details

```javascript
mcp_microsoft_pla_browser_evaluate({
  function: `() => {
    const app = document.querySelector('.art-app').__jsgui_control;
    const canvas = app?._canvas;
    const components = [];
    canvas?._components?.forEach((comp, id) => {
      components.push({
        id,
        type: comp.type,
        x: comp.x,
        y: comp.y,
        width: comp.width,
        height: comp.height,
        fill: comp.fill
      });
    });
    return components;
  }`
})
```

---

## Event Flow Reference

### Adding a Component

```
User clicks "▭ Rectangle" button
    │
    ▼
ToolbarControl._handleAction("add-rect")
    │
    ▼
ToolbarControl.raise("add-component", "rect")
    │
    ▼
ArtPlaygroundAppControl (listener)
    │
    ▼
CanvasControl.addComponent("rect")
    │
    ├── Creates SVG <rect> element
    ├── Adds to _components Map
    ├── Appends to SVG <g class="art-canvas__components">
    └── Selects the new component (shows handles)
```

### Selecting a Component

```
User clicks on a component in the SVG
    │
    ▼
CanvasControl._handleMouseDown(event)
    │
    ├── Finds clicked element via event.target.closest('[data-component-id]')
    ├── Gets component ID from data-component-id attribute
    └── Calls _selectComponent(id)
            │
            ├── Deselects previous component
            ├── Adds .art-canvas__component--selected class
            └── Updates selection handles position
```

---

## CSS Classes Reference

| Class | Element | Purpose |
|-------|---------|---------|
| `.art-app` | div | Main app container |
| `.art-toolbar` | div | Toolbar container |
| `.art-toolbar__btn` | button | Toolbar button |
| `.art-toolbar__btn--active` | button | Active tool/button |
| `.art-toolbar__btn--danger` | button | Delete button (red) |
| `.art-canvas` | div | Canvas container |
| `.art-canvas__svg-wrapper` | div | SVG wrapper |
| `.art-canvas__svg` | svg | Main SVG element |
| `.art-canvas__grid` | rect | Grid background |
| `.art-canvas__components` | g | Components container group |
| `.art-canvas__component` | rect/ellipse/text | Individual component |
| `.art-canvas__component--selected` | * | Selected component |
| `.art-selection` | div | Selection handles container |
| `.art-selection__outline` | div | Selection outline |
| `.art-selection__handle` | div | Individual resize handle |

---

## Troubleshooting

### "Cannot connect to server"
- Server not running. Start with: `node src/ui/server/artPlayground/server.js`

### "Client bundle not found"
- Build the client: `node scripts/build-art-playground-client.js`

### "No SVG in canvas"
- The SVG content uses `String_Control` for rendering. Check if the server is using the latest code.

### "Events not firing"
- Client activation might have failed. Check console for errors.
- Verify `__jsgui_control` is attached to DOM elements.

### "Selection handles not appearing"
- Component might not be selected. Use the evaluation script to check `_selectedId`.

---

## Next Steps (Not Yet Implemented)

The following features are planned but not yet working:

1. **Drag to move** - Click and drag a component to reposition it
2. **Resize via handles** - Drag a resize handle to change component size
3. **Component persistence** - Save/load component state
4. **Undo/Redo** - Action history
5. **Multiple selection** - Shift+click to select multiple components

---

*Document: ART_PLAYGROUND_AGENT_WORKFLOW_GUIDE.md*  
*Version: 1.0*  
*Last Updated: November 2025*
