#!/usr/bin/env node

'use strict';

// TypeScript wrapper for js-edit
// Sets environment variable and delegates to js-edit.js

process.env.TSNJS_EDIT_LANGUAGE = 'typescript';

require('./js-edit.js');