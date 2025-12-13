'use strict';

const path = require('path');

const { validateAgents } = require('../../../tools/dev/agent-validate');

describe('agent-validate utility', () => {
  it('parses all agent files without structural errors', () => {
    const agentDir = path.join(process.cwd(), '.github', 'agents');

    const results = validateAgents({
      agentDir,
      options: { checkHandoffAgents: true }
    });

    const filesWithErrors = results.files.filter((file) => file.issues.length > 0);

    expect(filesWithErrors).toEqual([]);
    expect(results.errorCount).toBe(0);
    expect(results.filesScanned).toBeGreaterThan(0);
  });

  it('ensures AGI-Orchestrator handoff targets exist', () => {
    const agentDir = path.join(process.cwd(), '.github', 'agents');

    const results = validateAgents({
      agentDir,
      options: { checkHandoffAgents: true }
    });

    const orchestrator = results.files.find((file) => file.agentName === 'AGI-Orchestrator');
    expect(orchestrator).toBeDefined();
    expect(orchestrator.issues).toEqual([]);
  });
});
