'use strict';
// Tiny HTTP downloader to bypass PowerShell Invoke-WebRequest confirmation prompts.
const fs = require('fs');
const path = require('path');
const http = require('http');

const url = process.argv[2];
const out = process.argv[3];
if (!url || !out) {
  console.error('Usage: node tools/dev/_http-get.js <url> <out-file>');
  process.exit(2);
}
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });

const req = http.get(url, (res) => {
  if (res.statusCode !== 200) {
    console.error(`HTTP ${res.statusCode}`);
    res.resume();
    process.exit(1);
  }
  const file = fs.createWriteStream(out);
  res.pipe(file);
  file.on('finish', () => file.close(() => {
    const size = fs.statSync(out).size;
    console.log(JSON.stringify({ ok: true, url, out: path.resolve(out), bytes: size }));
  }));
});
req.setTimeout(60000, () => { req.destroy(new Error('timeout')); });
req.on('error', (e) => { console.error(e.message); process.exit(1); });
