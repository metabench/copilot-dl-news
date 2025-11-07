#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const NewsCrawler = require('./crawler/NewsCrawler');
const {
  runLegacyCommand,
  HELP_TEXT
} = require('./crawler/cli/runLegacyCommand');

const CONFIG_FILENAME = 'crawl.js.config.json';

module.exports = NewsCrawler;
module.exports.NewsCrawler = NewsCrawler;
module.exports.default = NewsCrawler;
module.exports.runLegacyCommand = runLegacyCommand;
module.exports.HELP_TEXT = HELP_TEXT;

async function main() {
  const directArgs = process.argv.slice(2);
  let argv = directArgs;

  if (!directArgs.length) {
    try {
      argv = await loadConfigArgs();
    } catch (error) {
      const message = error?.message || 'Failed to load crawl.js.config.json';
      console.error(message);
      if (error?.showStack) {
        console.error(error.stack);
      }
      process.exit(1);
      return;
    }
  }

  const { exitCode = 0 } = await runLegacyCommand({
    argv,
    stdin: process.stdin,
    stdout: console.log,
    stderr: console.error
  });

  process.exit(exitCode);
}

function coerceInteger(value, field, { min = 0 } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid ${field} value in ${CONFIG_FILENAME}: expected a number.`);
  }
  if (!Number.isInteger(numeric)) {
    throw new Error(`Invalid ${field} value in ${CONFIG_FILENAME}: expected an integer.`);
  }
  if (numeric < min) {
    throw new Error(`Invalid ${field} value in ${CONFIG_FILENAME}: expected a value >= ${min}.`);
  }
  return numeric;
}

async function loadConfigArgs() {
  const configPath = path.resolve(__dirname, '..', CONFIG_FILENAME);
  let raw;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`Missing ${CONFIG_FILENAME} at ${configPath}.`);
    }
    throw new Error(`Unable to read ${CONFIG_FILENAME} at ${configPath}: ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${CONFIG_FILENAME}: ${error.message}`);
  }

  const args = [];
  const startUrl = typeof parsed.startUrl === 'string' ? parsed.startUrl.trim() : '';
  if (!startUrl) {
    throw new Error(`${CONFIG_FILENAME} must include a non-empty "startUrl" string.`);
  }
  args.push(startUrl);

  if (parsed.depth !== undefined) {
    const depth = coerceInteger(parsed.depth, 'depth', { min: 0 });
    args.push(`--depth=${depth}`);
  }

  if (parsed.concurrency !== undefined) {
    const concurrency = coerceInteger(parsed.concurrency, 'concurrency', { min: 1 });
    args.push(`--concurrency=${concurrency}`);
  }

  if (parsed.maxPages !== undefined) {
    const maxPages = coerceInteger(parsed.maxPages, 'maxPages', { min: 1 });
    args.push(`--max-pages=${maxPages}`);
  }

  if (Array.isArray(parsed.additionalArgs)) {
    for (const extra of parsed.additionalArgs) {
      if (typeof extra === 'string' && extra.trim()) {
        args.push(extra.trim());
      }
    }
  }

  return args;
}

if (require.main === module) {
  main().catch((error) => {
    const message = error?.message || 'News crawl CLI failed';
    console.error(message);
    if (error?.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}
