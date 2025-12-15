# Skill: jsgui3 Context Menu Patterns

**Triggers**: context menu, right-click menu, popup menu, overlay positioning, click-outside dismissal

## Description
Standard pattern for implementing context menus in jsgui3 applications (Electron & Web), ensuring consistent behavior for activation, positioning, and dismissal.

## The Pattern

1.  **Activation**: Listen for `contextmenu` event on the target element (or delegated container).
2.  **Prevention**: Call `e.preventDefault()` to stop the native browser context menu.
3.  **Creation**: Create or show the menu DOM element.
    *   Append to `document.body` (or a dedicated overlay layer) to avoid z-index/clipping issues.
    *   Position using `fixed` or `absolute` coordinates based on `e.clientX` / `e.clientY`.
    *   **Clamp** coordinates to viewport bounds to prevent overflow.
4.  **Dismissal**:
    *   Add **global** `click` listener to `document` (use `capture: true` or check `e.target` to allow clicks inside the menu).
    *   Add **global** `keydown` listener for `Escape` key.
    *   Remove these listeners immediately upon menu closure to prevent leaks.
5.  **Cleanup**: Always remove the menu element and listeners when closed.

## Implementation Example (jsgui3)

```javascript
// In your control's activate() method:
this.dom.el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    this.showContextMenu(e.clientX, e.clientY);
});

showContextMenu(x, y) {
    // 1. Close existing
    if (this._activeMenu) this._activeMenu.remove();

    // 2. Create Menu (using jsgui or raw DOM)
    const menu = document.createElement('div');
    menu.className = 'zs-context-menu'; // Use theme class
    
    // 3. Position & Clamp
    const width = 150; // Estimated or measured
    const height = 100;
    
    // Clamp X
    if (x + width > window.innerWidth) x -= width;
    // Clamp Y
    if (y + height > window.innerHeight) y -= height;
    
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    
    // 4. Add Items
    // ... append items ...

    document.body.appendChild(menu);
    this._activeMenu = menu;

    // 5. Setup Dismissal
    const closeHandler = (ev) => {
        // Don't close if clicking inside menu
        if (ev.type === 'click' && menu.contains(ev.target)) return;
        
        // Close on click outside or Escape
        if (ev.type === 'click' || (ev.type === 'keydown' && ev.key === 'Escape')) {
            menu.remove();
            this._activeMenu = null;
            document.removeEventListener('click', closeHandler);
            document.removeEventListener('keydown', closeHandler);
        }
    };

    // Defer listener to avoid immediate trigger
    setTimeout(() => {
        document.addEventListener('click', closeHandler);
        document.addEventListener('keydown', closeHandler);
    }, 0);
}
```

## Validation
Run the lab experiment to verify the pattern behavior:
```bash
node src/ui/lab/experiments/019-context-menu-patterns/check.js
```

## References
- `src/ui/lab/experiments/019-context-menu-patterns/` - Reference implementation and test.
- `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md` - UI Architecture context.
