# Working Notes – Shared Context Menu Control

- 2025-12-06 — Session created via CLI. Add incremental notes here.
- Quick harness idea (browser):
	- Create `const menu = new ContextMenuControl({ context, items: [{ id: 'copy', label: 'Copy' }, { id: 'delete', label: 'Delete', danger: true }] });`
	- Append to root, call `menu.openAt({ x: 100, y: 120 });`
	- Verify: click outside closes; Escape closes; ArrowUp/Down cycles; Enter activates and fires `item-selected`.
