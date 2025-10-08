#!/usr/bin/env node
/**
 * Simple wrapper to start the UI server from the root directory.
 * Usage: node server.js [options]
 * 
 * Passes all arguments to the Express UI server.
 */

const { startServer } = require('./src/ui/express/server');

startServer({ argv: process.argv });
