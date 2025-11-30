const fs = require('fs');
const path = require('path');
const jsgui = require('jsgui3-html');
const SimplePanelControl = require('../controls/SimplePanelControl');

// Minimal check script to render SimplePanelControl in isolation and dump HTML.

const context = new jsgui.Page_Context();

const panel = new SimplePanelControl({
  context,
  title: 'Lab: Simple Panel',
  content: 'This is a sample panel rendered by SimplePanelControl.check.js'
});

const html = panel.all_html_render();

const outPath = path.join(__dirname, 'SimplePanelControl.check.html');
fs.writeFileSync(outPath, html, 'utf8');

console.log('Wrote SimplePanelControl HTML to', outPath);
