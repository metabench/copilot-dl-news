const fs = require('fs');
const path = require('path');
const jsgui = require('jsgui3-html');
const ColorSelectorControl = require('../controls/ColorSelectorControl');

const context = new jsgui.Page_Context();

const control = new ColorSelectorControl({
  context,
  value: '#4A90D9'
});

const controlHtml = control.all_html_render();
const cssPath = path.resolve(__dirname, '../../ui/server/artPlayground/public/art-playground.css');
let css = '';
try {
  css = fs.readFileSync(cssPath, 'utf8');
} catch (err) {
  console.warn('Unable to inline art-playground.css for the check output:', err.message);
}

const documentHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ColorSelectorControl Check</title>
  <style>${css}</style>
  <style>
    body {
      margin: 0;
      padding: 32px;
      background: #111;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .color-selector {
      max-width: 420px;
      margin: 0 auto;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 30px 60px rgba(0, 0, 0, 0.35);
    }
  </style>
</head>
<body>
  ${controlHtml}
</body>
</html>`;

const outPath = path.join(__dirname, 'ColorSelectorControl.check.html');
fs.writeFileSync(outPath, documentHtml, 'utf8');

console.log('Wrote ColorSelectorControl HTML to', outPath);
