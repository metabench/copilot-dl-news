const express = require('express');
const fs = require('fs');
const path = require('path');
const jsgui = require('jsgui3-html');

const app = express();
app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

// Mock storage for SVGs
const SVG_PATH = path.join(PUBLIC_DIR, 'test.svg');
if (!fs.existsSync(SVG_PATH)) {
    const initialSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#f0f0f0"/>
  <g id="box1" transform="translate(100,100)" class="draggable">
    <rect width="100" height="100" fill="blue"/>
    <text x="50" y="50" text-anchor="middle" fill="white">Box 1</text>
  </g>
  <g id="box2" transform="translate(300,100)" class="draggable">
    <rect width="100" height="100" fill="red"/>
    <text x="50" y="50" text-anchor="middle" fill="white">Box 2</text>
  </g>
</svg>`;
    fs.writeFileSync(SVG_PATH, initialSvg);
}

const LOG_PATH = path.join(__dirname, 'audit.log');

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>SVG Plugin Lab</title>
        <style>
          body { font-family: sans-serif; display: flex; }
          #svg-container { width: 800px; height: 600px; border: 1px solid #ccc; margin: 20px; }
          .draggable { cursor: move; }
          .draggable:hover { opacity: 0.8; }
          .selected { outline: 2px dashed orange; }
        </style>
      </head>
      <body>
        <div id="svg-container"></div>
        <script src="/client.js"></script>
      </body>
    </html>
  `);
});

app.get('/api/svg', (req, res) => {
    res.sendFile(SVG_PATH);
});

app.post('/api/svg', (req, res) => {
    const { content, logEntry } = req.body;
    if (content) fs.writeFileSync(SVG_PATH, content);

    if (logEntry) {
        const entry = `[${new Date().toISOString()}] ${logEntry}\n`;
        fs.appendFileSync(LOG_PATH, entry);
    }

    res.json({ ok: true });
});

app.listen(8085, () => {
    console.log('Lab running at http://localhost:8085');
});
