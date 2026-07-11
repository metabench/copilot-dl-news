#!/usr/bin/env node
'use strict';
// Confirm HubSeeder + hubIdentifier load cleanly (runs on operator machine).
const path = require('path');
const out = {};
try { require(path.resolve(__dirname, '../../src/core/crawler/planner/HubSeeder.js')); out.hubSeeder = 'OK'; }
catch (e) { out.hubSeeder = 'FAIL: ' + e.message; }
try { require(path.resolve(__dirname, '../../src/core/crawler/hubs/hubIdentifier.js')); out.hubIdentifier = 'OK'; }
catch (e) { out.hubIdentifier = 'FAIL: ' + e.message; }
console.log(JSON.stringify(out));
