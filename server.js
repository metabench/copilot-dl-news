#!/usr/bin/env node
/**
 * DEPRECATED UI SERVER WRAPPER
 *
 * This script starts the deprecated UI server.
 * The UI is deprecated as of October 2025 and kept for reference only.
 *
 * For new UI development, see src/ui/README.md
 *
 * Simple wrapper to start the UI server from the root directory.
 * Usage: node server.js [options]
 *
 * Passes all arguments to the Express UI server.
 * Use --help for available options.
 */

const {
	startServer,
	parseServerArgs,
	printServerHelp
} = require('./src/deprecated-ui/express/server');

const argv = process.argv;
const serverArgs = parseServerArgs(argv);

if (serverArgs.showHelp) {
	printServerHelp();
	process.exit(0);
}

startServer({ argv, serverArgs });