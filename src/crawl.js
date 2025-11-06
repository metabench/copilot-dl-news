#!/usr/bin/env node
'use strict';

const NewsCrawler = require('./crawler/NewsCrawler');
const {
  runLegacyCommand,
  HELP_TEXT
} = require('./crawler/cli/runLegacyCommand');

module.exports = NewsCrawler;
module.exports.NewsCrawler = NewsCrawler;
module.exports.default = NewsCrawler;
module.exports.runLegacyCommand = runLegacyCommand;
module.exports.HELP_TEXT = HELP_TEXT;

async function main() {
  const { exitCode = 0 } = await runLegacyCommand({
    argv: process.argv.slice(2),
    stdin: process.stdin,
    stdout: console.log,
    stderr: console.error
  });

  process.exit(exitCode);
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
