#!/usr/bin/env node

'use strict';

// TypeScript wrapper for js-scan
// Sets environment variable and delegates to js-scan.js

process.env.TSNJS_SCAN_LANGUAGE = 'typescript';

require('./js-scan.js');