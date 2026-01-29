#!/usr/bin/env node
// Patch script to add _expandHandleEl query to activate method
const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, 'server/public/docs-viewer-client.js');
let content = fs.readFileSync(bundlePath, 'utf8');

// Check if already patched
if (content.includes('this._expandHandleEl = el.querySelector("[data-expand-handle]")')) {
    console.log('Expand handle query already exists, skipping.');
    process.exit(0);
}

// Find the insertion point
const searchString = 'this._rightPanelEl = el.querySelector("[data-panel=\'right\']");';
const index = content.indexOf(searchString);

if (index === -1) {
    console.error('Could not find right panel query insertion point');
    process.exit(1);
}

const insertionPoint = index + searchString.length;

// The code to add
const newCode = '\n          this._expandHandleEl = el.querySelector("[data-expand-handle]");';

// Insert the code
content = content.slice(0, insertionPoint) + newCode + content.slice(insertionPoint);

fs.writeFileSync(bundlePath, content);
console.log('Patching complete');
