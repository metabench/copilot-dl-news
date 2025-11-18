'use strict';

const { parseSync } = require('@swc/core');
const base = require('./swcAst');

function parseTypescriptModule(source, fileName = 'anonymous.ts') {
  const normalizedName = typeof fileName === 'string' && fileName.length > 0
    ? fileName
    : 'anonymous.ts';
  const lowerName = normalizedName.toLowerCase();
  const isTsx = lowerName.endsWith('.tsx');
  const isDts = lowerName.endsWith('.d.ts');

  return parseSync(source, {
    syntax: 'typescript',
    tsx: isTsx,
    decorators: true,
    dynamicImport: true,
    importAssertions: true,
    target: 'es2022',
    comments: true,
    preserveAllComments: true,
    script: false,
    isModule: true,
    dts: isDts,
    noEarlyErrors: false
  });
}

module.exports = {
  ...base,
  parseModule: parseTypescriptModule,
  parseTypescriptModule
};