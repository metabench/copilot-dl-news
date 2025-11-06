'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const JS_SCAN = path.join(__dirname, '../../../tools/dev/js-scan.js');
const FIXTURE_DIR = path.join(__dirname, '../../fixtures/tools/js-scan');

function runCli(...args) {
  return execFileSync('node', [JS_SCAN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' }
  });
}

describe('js-scan bilingual output', () => {
  test('search summary renders chinese labels', () => {
    const output = runCli('--dir', FIXTURE_DIR, '--search', 'alpha', '--lang', 'zh', '--view', 'summary');

    expect(output).toContain('搜');
    expect(output).toContain('匹数:1');
    expect(output).toContain('档总:');
  });

  test('hash lookup emits chinese headings', () => {
    const lookup = runCli('--dir', FIXTURE_DIR, '--find-hash', '0000', '--lang', 'zh');
    expect(lookup).toContain('哈搜');
    expect(lookup).toContain('无匹');
  });
});
