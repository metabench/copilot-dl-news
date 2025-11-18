"use strict";

const path = require("path");

const { parseArgs, runCaptureWorkflow } = require("./capture-data-explorer-screenshots");
const { findProjectRoot } = require("../../src/utils/project-root");

function parseDomainArgs(argv) {
  const base = parseArgs(argv);
  base.routes = ["domain-detail"];
  if (!base.outputDir) {
    const projectRoot = findProjectRoot(__dirname);
    base.outputDir = path.join(projectRoot, "screenshots", "data-explorer", "domains");
  }
  return base;
}

async function main() {
  const options = parseDomainArgs(process.argv.slice(2));
  await runCaptureWorkflow(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Failed to capture domain detail screenshot:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseDomainArgs,
  main
};
