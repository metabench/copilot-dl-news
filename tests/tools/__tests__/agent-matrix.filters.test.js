'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildAgentMatrix, filterAgentMatrix } = require('../../../tools/dev/agent-matrix');

describe('agent-matrix filters', () => {
  function writeFile(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }

  it('filters by missing frontmatter/tools and by capability/tool list', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-matrix-'));
    const agentsDir = path.join(tmpDir, 'agents');

    writeFile(
      path.join(agentsDir, 'A.agent.md'),
      [
        '---',
        'description: Agent A',
        'tools:',
        '  - docs-memory/*',
        '  - browser',
        '  - svg-editor',
        '---',
        '',
        '# Agent A',
        'body'
      ].join('\n')
    );

    writeFile(
      path.join(agentsDir, 'B.agent.md'),
      [
        '---',
        'description: Agent B',
        '---',
        '',
        '# Agent B',
        'body'
      ].join('\n')
    );

    writeFile(
      path.join(agentsDir, 'C.agent.md'),
      ['# Agent C', 'no frontmatter'].join('\n')
    );

    const base = buildAgentMatrix({ agentDir: agentsDir });
    expect(base.summary.agentCount).toBe(3);

    const onlyMissingFrontmatter = filterAgentMatrix(base, { missingFrontmatter: true });
    expect(onlyMissingFrontmatter.summary.agentCount).toBe(1);
    expect(onlyMissingFrontmatter.agents[0].agentName).toBe('C');

    const onlyMissingTools = filterAgentMatrix(base, { missingTools: true });
    expect(onlyMissingTools.summary.agentCount).toBe(1);
    expect(onlyMissingTools.agents[0].agentName).toBe('B');

    const onlyDocsMemory = filterAgentMatrix(base, { hasDocsMemory: true });
    expect(onlyDocsMemory.summary.agentCount).toBe(1);
    expect(onlyDocsMemory.agents[0].agentName).toBe('A');

    const toolAny = filterAgentMatrix(base, { tool: 'browser,nonexistent' });
    expect(toolAny.summary.agentCount).toBe(1);
    expect(toolAny.agents[0].agentName).toBe('A');

    const toolAll = filterAgentMatrix(base, { tools: 'browser,docs-memory/*', toolMode: 'all' });
    expect(toolAll.summary.agentCount).toBe(1);
    expect(toolAll.agents[0].agentName).toBe('A');
  });
});
