'use strict';

const path = require('path');

const { buildAgentMatrix } = require('../../../tools/dev/agent-matrix');

describe('agent-matrix utility', () => {
  it('builds a matrix for repo agents', () => {
    const agentDir = path.join(process.cwd(), '.github', 'agents');
    const results = buildAgentMatrix({ agentDir });

    expect(results).toEqual(expect.objectContaining({
      success: true,
      agentDir: expect.any(String),
      summary: expect.any(Object),
      agents: expect.any(Array),
      tools: expect.any(Array)
    }));

    expect(results.summary.filesScanned).toBeGreaterThan(0);
    expect(results.agents.length).toBeGreaterThan(0);

    const anyWithTools = results.agents.some((agent) => (agent.capabilities?.toolCount || 0) > 0);
    expect(anyWithTools).toBe(true);
  });
});
