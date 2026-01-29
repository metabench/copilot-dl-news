const pkg = require('./package.json');

const base = pkg.jest || {};

module.exports = {
  ...base,
  reporters: [
    ...(base.reporters || ['default']),
    '<rootDir>/tools/test-reporter.js'
  ]
};
