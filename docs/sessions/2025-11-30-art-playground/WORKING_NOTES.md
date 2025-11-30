# Working Notes – Art Playground - Interactive SVG Component Editor

- 2025-11-30 — Session created via CLI. Add incremental notes here.

## Key jsgui3 Patterns Discovered

### 1. SVG Content in Server-Side Rendering

**Problem**: Setting `this._svgWrapper.dom.innerHTML = '<svg>...</svg>'` doesn't work for server-side rendering in jsgui3-html.

**Solution**: Use String_Control to output raw HTML:
```javascript
const svgContent = new jsgui.String_Control({
  context: this.context,
  text: `<svg class="art-canvas__svg" xmlns="http://www.w3.org/2000/svg">
    <!-- SVG content -->
  </svg>`
});
this._svgWrapper.add(svgContent);
```

### 2. Control Eventing - Use Inherited Methods

**Problem**: Controls were reimplementing `on()`, `raise()`, `_eventHandlers`.

**Solution**: jsgui3 Control already provides via Evented_Control:
- `on(eventName, handler)` 
- `raise(eventName, ...args)` (or `raise_event`)
- `off(eventName, handler)`
- `one(eventName, handler)` 
- `add_event_listener()`, `remove_event_listener()`

Just call `this.raise('event-name', data)` and `control.on('event-name', callback)`.

### 3. Client-Side Activation Pattern

**Problem**: jsgui3's automatic parent-child activation chain was causing errors when controls weren't properly linked in the DOM tree.

**Solution**: Manual activation in client.js:

```javascript
// 1. Create control wrapping existing DOM (el: skips compose)
const control = new MyControl({ el: domEl, context: context });

// 2. Link DOM
control.dom = control.dom || {};
control.dom.el = domEl;
domEl.__jsgui_control = control;

// 3. Manually set up event handlers
domEl.addEventListener('click', () => control._handleClick());

// 4. Wire control-to-control events
toolbar.on('add-component', (type) => canvas.addComponent(type));
```

### 4. CSS Classes and Attributes

**Problem**: Using `_dom.className` or direct property assignment.

**Solution**: Use jsgui3 API:
```javascript
// Add class
control.add_class('my-class');

// Set attribute
control.dom.attributes['data-my-attr'] = 'value';

// Mark for activation
control.dom.attributes['data-jsgui-control'] = 'my_control_type';
```

## Files Created

- `src/ui/server/artPlayground/server.js` - Express server
- `src/ui/server/artPlayground/client.js` - Client entry point
- `src/ui/server/artPlayground/client.bundle.js` - Bundled client
- `src/ui/server/artPlayground/public/art-playground.css` - Styles
- `src/ui/server/artPlayground/isomorphic/controls/` - All controls
- `scripts/build-art-playground-client.js` - Build script

## Commands

```bash
# Start server
node src/ui/server/artPlayground/server.js

# Start detached
node src/ui/server/artPlayground/server.js --detached

# Check status
node src/ui/server/artPlayground/server.js --status

# Stop
node src/ui/server/artPlayground/server.js --stop

# Build client
node scripts/build-art-playground-client.js

# Debug with console capture
node tools/dev/ui-console-capture.js --server="src/ui/server/artPlayground/server.js" --port=4950 --url="http://localhost:4950" --timeout=5000
```
