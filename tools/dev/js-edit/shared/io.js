'use strict';

const fs = require('fs');
const path = require('path');
const { createByteMapper } = require('../../lib/swcAst');

function readSource(filePath) {
  try {
    const source = fs.readFileSync(filePath, 'utf8');
    const sourceMapper = createByteMapper(source);
    return { source, sourceMapper };
  } catch (error) {
    throw new Error(`Failed to read file: ${filePath}\n${error.message}`);
  }
}

function loadReplacementSource(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read replacement snippet: ${filePath}\n${error.message}`);
  }
}

function writeOutputFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function outputJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

module.exports = {
  readSource,
  loadReplacementSource,
  writeOutputFile,
  outputJson
};
