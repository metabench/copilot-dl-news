#!/usr/bin/env node
'use strict';
// Confirm HubSeeder + hubIdentifier load cleanly (runs on operator machine).
const path = require('path');
const out = {};
try { require('news-crawler-itself/planner').HubSeeder; out.hubSeeder = 'OK'; }
catch (e) { out.hubSeeder = 'FAIL: ' + e.message; }
try { require('news-crawler-itself/hub-identifier'); out.hubIdentifier = 'OK'; }
catch (e) { out.hubIdentifier = 'FAIL: ' + e.message; }
console.log(JSON.stringify(out));
