#!/usr/bin/env node
'use strict';
// P0 activation cleanup (gated, operator-approved 2026-07-11): remove the
// now-dead file-based sitemap cache directory. One-shot, prints what it did.
const fs = require('fs');
const path = require('path');
const target = path.resolve(process.cwd(), 'tmp', 'sitemap-cache');
if (fs.existsSync(target)) {
  const n = fs.readdirSync(target).length;
  fs.rmSync(target, { recursive: true, force: true });
  console.log(JSON.stringify({ removed: target, entries: n }));
} else {
  console.log(JSON.stringify({ removed: null, note: 'tmp/sitemap-cache not present' }));
}
