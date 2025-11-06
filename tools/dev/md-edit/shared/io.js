'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Read source file
 */
function readSource(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  return fs.readFileSync(resolved, 'utf8');
}

/**
 * Write output file
 */
function writeOutputFile(filePath, content) {
  const resolved = path.resolve(process.cwd(), filePath);
  fs.writeFileSync(resolved, content, 'utf8');
}

/**
 * Output JSON to stdout
 */
function outputJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

module.exports = {
  readSource,
  writeOutputFile,
  outputJson
};
