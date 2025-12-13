'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  checkLinksInAgentMarkdown,
  searchAgentFiles
} = require('../../../tools/dev/agent-files');

describe('agent-files utility', () => {
  it('detects broken local markdown links (ignores http links)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-files-'));

    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });

    const okDoc = path.join(docsDir, 'ok.md');
    fs.writeFileSync(okDoc, '# ok\n', 'utf8');

    const agentFile = path.join(tmpDir, 'Example.agent.md');
    const source = [
      '---',
      'description: "Example"',
      'tools: []',
      '---',
      '',
      'See [ok](docs/ok.md) and [missing](docs/missing.md).',
      'Ignore [web](https://example.com).',
      '',
      '```js',
      'const x = "[not a link](docs/missing.md)";',
      '```',
      ''
    ].join('\n');

    fs.writeFileSync(agentFile, source, 'utf8');

    const warnings = checkLinksInAgentMarkdown({
      source,
      agentFilePath: agentFile,
      relativePath: path.relative(process.cwd(), agentFile),
      options: {}
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('broken_link');
    expect(warnings[0].details.target).toBe('docs/missing.md');
  });

  it('searches agent files for terms with OR/ALL semantics', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-search-'));

    fs.writeFileSync(
      path.join(tmpDir, 'Alpha.agent.md'),
      '---\ndescription: "a"\ntools: []\n---\nHello world\n',
      'utf8'
    );

    fs.writeFileSync(
      path.join(tmpDir, 'Beta.agent.md'),
      '---\ndescription: "b"\ntools: []\n---\nHello there\n',
      'utf8'
    );

    const orResult = searchAgentFiles({
      agentDir: tmpDir,
      terms: ['world', 'there'],
      options: { limit: 50, caseSensitive: false, matchAll: false }
    });

    expect(orResult.summary.filesMatched).toBe(2);
    expect(orResult.matches.length).toBeGreaterThan(0);

    const allResult = searchAgentFiles({
      agentDir: tmpDir,
      terms: ['hello', 'world'],
      options: { limit: 50, caseSensitive: false, matchAll: true }
    });

    expect(allResult.summary.filesMatched).toBe(1);
    expect(allResult.matches.some((m) => m.agentName === 'Alpha')).toBe(true);
  });
});
