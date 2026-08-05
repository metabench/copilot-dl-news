'use strict';

const base = require('./swcAst');

// TS-forced runtime: parse every file as TypeScript regardless of extension.
// The parser itself lives in swcAst so the default runtime can route *.ts
// files to it by extension.
module.exports = {
  ...base,
  parseModule: base.parseTypescriptModule
};