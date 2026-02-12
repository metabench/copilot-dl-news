const path = require('path');
const pkg = require('../package.json');

const base = pkg.jest || {};

module.exports = {
  // When Jest loads a config file from ./config/, it treats that folder as <rootDir>
  // unless rootDir is explicitly set. Our base Jest config (in package.json) assumes
  // <rootDir> is the repository root.
  rootDir: path.resolve(__dirname, '..'),
  ...base,
  reporters: [
    ...(base.reporters || ['default']),
    '<rootDir>/tools/test-reporter.js'
  ]
};
