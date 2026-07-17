'use strict';
// DB-consolidation slice 0: print news-crawler-db's real runtime export
// surface (what copilot's node_modules resolves), grouped, so repoints can
// be planned against facts instead of the TS source's multi-line exports.
const ncdb = require('news-crawler-db');
const keys = Object.keys(ncdb).sort();
const fns = keys.filter((k) => typeof ncdb[k] === 'function');
const classes = fns.filter((k) => /^[A-Z]/.test(k));
const plain = fns.filter((k) => !/^[A-Z]/.test(k));
const other = keys.filter((k) => typeof ncdb[k] !== 'function');
console.log(`total exports: ${keys.length} (fns ${plain.length}, classes ${classes.length}, other ${other.length})`);
console.log('\n-- plain functions --');
console.log(plain.join('\n'));
console.log('\n-- classes/constructors --');
console.log(classes.join('\n'));
console.log('\n-- non-function exports --');
console.log(other.join('\n'));
