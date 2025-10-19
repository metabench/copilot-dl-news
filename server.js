#!/usr/bin/env node
/**
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
} = require('./src/ui/express/server');

const argv = process.argv;
const serverArgs = parseServerArgs(argv);

if (serverArgs.showHelp) {
	printServerHelp();
	process.exit(0);
}

startServer({ argv, serverArgs });