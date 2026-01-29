#!/usr/bin/env node
// Patch script to add _collapse and _expand methods to the client bundle
const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, 'server/public/docs-viewer-client.js');
let content = fs.readFileSync(bundlePath, 'utf8');

// Check if methods already exist (as method definitions, not just calls)
if (content.includes('_collapse() {')) {
    console.log('Methods already exist, skipping.');
    process.exit(0);
}

// Find the insertion point after _getLeftWidth method
const getLeftWidthPattern = /_getLeftWidth\(\) \{[\s\S]*?return this\._leftPanelEl[\s\S]*?\n        \}/;
const match = content.match(getLeftWidthPattern);

if (!match) {
    console.error('Could not find _getLeftWidth method');
    process.exit(1);
}

const insertionPoint = match.index + match[0].length;

// The methods to add
const newMethods = `
        _collapse() {
          var _a;
          this._isCollapsed = true;
          const el = (_a = this.dom) == null ? void 0 : _a.el;
          if (el) {
            el.classList.add("split-layout--collapsed");
          }
          if (this._leftPanelEl) {
            this._leftPanelEl.style.width = "0px";
          }
        }
        _expand() {
          var _a;
          this._isCollapsed = false;
          const el = (_a = this.dom) == null ? void 0 : _a.el;
          if (el) {
            el.classList.remove("split-layout--collapsed");
          }
          this._setLeftWidth(this.initialLeftWidth || 280);
        }
        _handleExpandClick(e) {
          e.preventDefault();
          e.stopPropagation();
          this._expand();
        }`;

// Insert the methods
content = content.slice(0, insertionPoint) + newMethods + content.slice(insertionPoint);

// Also need to add the expand handle click listener in activate()
// Find where event listeners are attached and add the expand handle listener
const activatePattern = /this\._dividerEl\.addEventListener\("keydown", this\._onKeyDown\);/;
const activateMatch = content.match(activatePattern);

if (activateMatch) {
    const expandListener = `
        if (this._expandHandleEl) {
          this._onExpandClick = this._handleExpandClick.bind(this);
          this._expandHandleEl.addEventListener("click", this._onExpandClick);
        }`;
    content = content.replace(activatePattern, activateMatch[0] + expandListener);
}

fs.writeFileSync(bundlePath, content);
console.log('Patching complete');
