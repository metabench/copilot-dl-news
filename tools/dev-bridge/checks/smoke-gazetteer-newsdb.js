'use strict';
// Smoke: geographic lookups resolve against news.db after gazetteer.db retirement.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
process.chdir(REPO_ROOT);

const { resolveGazetteerDbPath } = require(path.join(REPO_ROOT, 'src', 'shared', 'utils', 'gazetteer-db-path'));
const resolved = resolveGazetteerDbPath();
console.log('[resolver] default →', resolved);
if (!/news\.db$/.test(resolved)) { console.log('[FAIL] expected news.db'); process.exit(1); }

const { PlaceLookup } = require(path.join(REPO_ROOT, 'src', 'intelligence', 'knowledge', 'PlaceLookup'));
const lookup = PlaceLookup.load(resolved);
console.log('[PlaceLookup] loaded:', JSON.stringify(lookup.stats));
const london = lookup.findByName ? lookup.findByName('london') : (lookup.lookup ? lookup.lookup('london') : null);
console.log('[PlaceLookup] london →', Array.isArray(london) ? `${london.length} matches` : typeof london);

const { getAllCountries } = require(path.join(REPO_ROOT, 'src', 'data', 'db', 'sqlite', 'v1', 'queries', 'gazetteer.places'));
const { openDatabase } = require(path.join(REPO_ROOT, 'src', 'data', 'db', 'sqlite', 'v1', 'connection'));
const db = openDatabase(resolved, { readonly: true, fileMustExist: true });
const countries = getAllCountries(db);
db.close();
console.log('[countries]', countries.length);
console.log(countries.length > 100 ? '[PASS]' : '[FAIL] too few countries');
process.exit(countries.length > 100 ? 0 : 1);
