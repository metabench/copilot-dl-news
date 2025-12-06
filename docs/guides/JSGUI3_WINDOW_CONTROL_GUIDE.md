# jsgui3 Window Control Guide

> **For AI Agents**: This guide documents the built-in `Window` control in jsgui3-html/jsgui3-client. Use this for floating windows, dialogs, tool panels, and any draggable/resizable container UI.

## Quick Start

```javascript
const jsgui = require('jsgui3-html'); // or jsgui3-client in browser

// Create a window
const myWindow = new jsgui.Window({
  context,
  title: 'My Window Title',
  show_buttons: true  // minimize, maximize, close buttons
});

// Add content to the window
myWindow.inner.add(new jsgui.Control({
  context,
  tagName: 'p'
}));

// Add to parent container
parentControl.add(myWindow);

// Client-side: activate to enable drag/resize/buttons
myWindow.activate();
```

## Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `context` | Object | required | jsgui Page_Context |
| `title` | String | none | Window title text |
| `show_buttons` | Boolean | `true` | Show minimize/maximize/close buttons |
| `abstract` | Boolean | `false` | Skip DOM composition (for subclassing) |

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `inner` / `ctrl_inner` | Control | Content container - add your controls here |
| `title_bar` | Control | The title bar element (drag handle) |
| `btn_minimize` | Button | Minimize button (if `show_buttons: true`) |
| `btn_maximize` | Button | Maximize button |
| `btn_close` | Button | Close button |
| `ctrl_relative` | Control | Wrapper with `position: relative` |
| `dragable` | Boolean | Whether dragging is enabled |
| `manager` | Object | Optional window manager reference |

## Methods

### Window State

```javascript
// Minimize window (animate to bottom of parent)
await myWindow.minimize();

// Maximize window (fill parent)
await myWindow.maximize();

// Close window (remove from DOM)
myWindow.close();

// Bring to front (highest z-index)
myWindow.bring_to_front_z();
```

### Animation

```javascript
// Glide to a new position with animation
await myWindow.glide_to_pos([100, 200]); // [x, y] relative to current transform
```

### Setting Content

```javascript
// Add controls to window content area
myWindow.inner.add(new jsgui.Control({ context, tagName: 'div' }));

// Clear and replace content
myWindow.inner.empty();
myWindow.inner.add(newContent);
```

## CSS Classes

The Window control uses these CSS classes:

| Class | Applied To | Purpose |
|-------|------------|---------|
| `.window` | Root | Main container styling |
| `.title.bar` | Title bar | Blue gradient, height 31px |
| `.inner` | Content area | 100% width, height minus title bar |
| `.relative` | Wrapper | `position: relative` container |
| `.minimized` | Root (state) | When window is minimized |
| `.maximized` | Root (state) | When window is maximized |
| `.button-group.right` | Button container | Positions buttons on right |
| `.resize-handle.bottom-right` | Resize handle | Corner resize grip |

## Built-in CSS

The control includes complete CSS. Key styles:

```css
.window {
  position: absolute;
  border: 1px solid #CCCCCC;
  background-color: #F4F4F4;
  width: 360px;
  height: 360px;
  border-radius: 5px;
  transition: width 0.14s linear, height 0.14s linear;
  overflow: hidden;
  user-select: none;
}

.window .title.bar {
  height: 31px;
  background-color: #0D4F8B;
  background-image: linear-gradient(to right, #0D4F8B, #3fb0d9);
  color: #FFFFFF;
  border-radius: 4px;
}

.window .relative .inner {
  width: 100%;
  height: calc(100% - 31px);
}
```

## Activation (Client-Side)

The Window must be activated for interactivity:

```javascript
// After rendering HTML and DOM is ready
myWindow.activate();
```

Activation enables:
- Drag via title bar (`dragable` mixin)
- Resize via bottom-right handle (`resizable` mixin)
- Button click handlers (minimize/maximize/close)
- Double-click title bar to maximize
- Mousedown brings to front

## Integration Patterns

### Pattern 1: Static Window in Layout

```javascript
const container = new jsgui.Control({ context, tagName: 'div' });
container.add_class('window-container');
container.dom.attributes.style = 'position: relative; width: 100%; height: 600px;';

const toolWindow = new jsgui.Window({
  context,
  title: 'Tools'
});

// Position it
toolWindow.dom.attributes.style = 'left: 20px; top: 20px;';

container.add(toolWindow);
```

### Pattern 2: Dynamic Window Creation

```javascript
function createResultWindow(title, content) {
  const win = new jsgui.Window({
    context,
    title
  });
  
  // Add content
  if (typeof content === 'string') {
    win.inner.add(new jsgui.String_Control({ context, text: content }));
  } else {
    win.inner.add(content);
  }
  
  // Random position for stacking effect
  const x = 50 + Math.random() * 200;
  const y = 50 + Math.random() * 100;
  win.dom.attributes.style = `left: ${x}px; top: ${y}px;`;
  
  return win;
}

// Usage
const win = createResultWindow('Search Results', '<p>Found 42 items</p>');
parentContainer.add(win);
win.activate();
win.bring_to_front_z();
```

### Pattern 3: Window Manager

```javascript
class SimpleWindowManager {
  constructor(container) {
    this.container = container;
    this.windows = new Map();
    this.nextId = 1;
  }
  
  createWindow(title, content) {
    const id = this.nextId++;
    const win = new jsgui.Window({
      context: this.container.context,
      title
    });
    
    win.manager = this; // Connect for close/minimize/maximize hooks
    win.windowId = id;
    
    if (content) {
      win.inner.add(content);
    }
    
    this.container.add(win);
    this.windows.set(id, win);
    
    return win;
  }
  
  close(win) {
    this.windows.delete(win.windowId);
    win.remove();
    this.raise('window-closed', { windowId: win.windowId });
  }
  
  minimize(win) {
    // Custom minimize behavior if needed
    win.minimize.call(win); // Call original
  }
  
  getWindow(id) {
    return this.windows.get(id);
  }
}
```

### Pattern 4: SVG Viewer in Window

```javascript
const { parseSvgToControls } = require('shared/utils/svgRenderer');

function showSvgInWindow(svgContent, title) {
  const win = new jsgui.Window({
    context,
    title: title || 'SVG Viewer'
  });
  
  // Parse SVG to controls
  const svgControl = parseSvgToControls(context, svgContent);
  
  // Add with wrapper for scrolling
  const scrollWrapper = new jsgui.Control({ context, tagName: 'div' });
  scrollWrapper.dom.attributes.style = 'overflow: auto; width: 100%; height: 100%;';
  scrollWrapper.add(svgControl);
  
  win.inner.add(scrollWrapper);
  
  // Size to content or fixed
  win.dom.attributes.style = 'width: 600px; height: 400px;';
  
  return win;
}
```

## Customizing Appearance

### Dark Theme (Industrial Luxury Obsidian)

```css
/* Override window styles for dark theme */
.window {
  background-color: #0d1220;
  border: 1px solid #1e2d42;
}

.window .title.bar {
  background-color: #141d30;
  background-image: linear-gradient(to right, #141d30, #1e2d42);
  color: #e8edf5;
}

.window .title.bar .button {
  background-color: transparent;
  border: 1px solid #3d5a80;
  color: #5eccc3;
}

.window .title.bar .button:hover {
  background-color: #1e2d42;
  border-color: #5eccc3;
}

.window .inner {
  background-color: #0a1020;
  color: #a8b8cc;
}

.resize-handle {
  color: #5eccc3;
}
```

### Custom Window Sizes

```javascript
// Set initial size via style
myWindow.dom.attributes.style = 'width: 800px; height: 600px; left: 100px; top: 50px;';

// Or programmatically after activation (client-side)
myWindow.size = [800, 600];
```

## Events

The Window uses standard jsgui events:

```javascript
// Listen for close
myWindow.btn_close.on('click', () => {
  console.log('Window closing');
});

// Intercept close
myWindow.close = function() {
  if (confirm('Close this window?')) {
    this.remove();
  }
};

// Window clicked (brought to front)
myWindow.on('mousedown', () => {
  console.log('Window focused');
});
```

## Common Gotchas

### 1. Parent Must Have Position

The parent container needs `position: relative` or `position: absolute`:

```javascript
parentContainer.dom.attributes.style = 'position: relative; width: 100%; height: 100vh;';
```

### 2. Activation Required for Interactivity

Without `activate()`, the window renders but drag/resize/buttons don't work:

```javascript
// WRONG - renders but not interactive
parentControl.add(myWindow);

// RIGHT - renders and interactive
parentControl.add(myWindow);
myWindow.activate();
```

### 3. Z-Index Conflicts

Windows manage their own z-index. If you have other absolute elements, ensure they don't conflict:

```javascript
// Window z-index starts at 1 and increments
// Use higher base for non-window absolute elements
otherElement.dom.attributes.style['z-index'] = 10000;
```

### 4. Content Overflow

The `.inner` content area clips overflow by default. For scrolling:

```javascript
const scrollable = new jsgui.Control({ context, tagName: 'div' });
scrollable.dom.attributes.style = 'overflow: auto; height: 100%;';
scrollable.add(yourContent);
myWindow.inner.add(scrollable);
```

## Server-Side Rendering

The Window works isomorphically:

```javascript
// Server-side (jsgui3-html)
const jsgui = require('jsgui3-html');
const context = new jsgui.Page_Context();

const win = new jsgui.Window({
  context,
  title: 'Server Rendered'
});

// Render to HTML
const html = win.all_html_render();

// Inject Window.css into page
const css = jsgui.Window.css;
```

```javascript
// Client-side activation
document.addEventListener('DOMContentLoaded', () => {
  // Find the rendered window element
  const winEl = document.querySelector('.window');
  
  // Create context and activate
  const context = new jsgui.Client_Page_Context();
  
  // Recreate control from existing element
  const win = new jsgui.Window({
    context,
    el: winEl  // Important: attach to existing element
  });
  
  win.activate();
});
```

## Summary

The jsgui3 Window control is a complete, production-ready floating window implementation. Use it for:

- Tool panels
- Result viewers
- Dialogs (modal or modeless)
- Multi-document interfaces
- SVG viewers
- Property inspectors

No need to create a custom FloatingWindowControl - use `jsgui.Window` directly.
