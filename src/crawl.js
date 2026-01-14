#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const NewsCrawler = require('./core/crawler/NewsCrawler');
const {
  runLegacyCommand,
  HELP_TEXT
} = require('./core/crawler/cli/runLegacyCommand');
const {
  resolveCliArguments,
  DEFAULT_CONFIG_FILENAME
} = require('./core/crawler/cli/configArgs');
const { renderCliError } = require('./core/crawler/cli/errorRenderer');

const CONFIG_FILENAME = DEFAULT_CONFIG_FILENAME;

module.exports = NewsCrawler;
module.exports.NewsCrawler = NewsCrawler;
module.exports.default = NewsCrawler;
module.exports.runLegacyCommand = runLegacyCommand;
module.exports.HELP_TEXT = HELP_TEXT;

async function main() {
  const directArgs = process.argv.slice(2);
  let resolvedArgv;
  let cliMetadata;

  try {
    const resolvedArgs = await resolveCliArguments({
      directArgv: directArgs,
      fsModule: fs,
      configPath: path.resolve(__dirname, '..', CONFIG_FILENAME)
    });
    resolvedArgv = resolvedArgs.argv;
    cliMetadata = {
      origin: resolvedArgs.origin
    };
    if (resolvedArgs.configPath) {
      cliMetadata.configPath = resolvedArgs.configPath;
      console.log(`\x1b[32mLoaded configuration from: ${resolvedArgs.configPath}\x1b[0m`);
    }
  } catch (error) {
    renderCliError(error, {
      stderr: console.error,
      fallbackMessage: `Failed to load ${CONFIG_FILENAME}`
    });
    process.exit(1);
    return;
  }

  const { exitCode = 0 } = await runLegacyCommand({
    argv: resolvedArgv,
    stdin: process.stdin,
    stdout: console.log,
    stderr: console.error,
    cliMetadata
  });

  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    renderCliError(error, {
      stderr: console.error,
      showStack: true
    });
    process.exit(1);
  });
}
