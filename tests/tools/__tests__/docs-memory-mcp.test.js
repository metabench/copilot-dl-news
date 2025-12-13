'use strict';

const fs = require('fs');
const path = require('path');

const { tools } = require('../../../tools/mcp/docs-memory/mcp-server');

const repoRoot = path.resolve(__dirname, '../../../');
const sessionsDir = path.join(repoRoot, 'docs', 'sessions');

describe('docs-memory MCP tools (skills + objective state)', () => {
  it('lists skills from SKILLS.md', () => {
    const result = tools.docs_memory_listSkills.handler({ limit: 200 });
    expect(result.type).toBe('skills-list');
    expect(Array.isArray(result.skills)).toBe(true);
    expect(result.skills.map((s) => s.name)).toContain('instruction-adherence');
  });

  it('recommends instruction-adherence for instruction drift topics', () => {
    const result = tools.docs_memory_recommendSkills.handler({
      topic: 'instruction drift resume main task after detour',
      limit: 10,
      sessionSample: 2
    });

    expect(result.type).toBe('skill-recommendations');
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.recommendations.map((r) => r.skill)).toContain('instruction-adherence');
  });

  it('writes and reads objective state for a specific session slug', async () => {
    const slug = '2099-01-01-objective-state-test';
    const sessionPath = path.join(sessionsDir, slug);
    const objectivePath = path.join(sessionPath, 'OBJECTIVE_STATE.json');

    await fs.promises.mkdir(sessionPath, { recursive: true });
    // Minimal files: not required, but keeps the folder consistent.
    await fs.promises.writeFile(path.join(sessionPath, 'PLAN.md'), '# Plan\n', 'utf8');

    try {
      const updated = tools.docs_memory_updateObjectiveState.handler({
        slug,
        parentObjective: 'Implement MCP skill APIs',
        returnStep: 'Run focused Jest tests for MCP tools',
        addDetour: 'Refactor scoring heuristic'
      });

      expect(updated.success).toBe(true);
      expect(updated.session).toBe(slug);
      expect(updated.state.parentObjective).toBe('Implement MCP skill APIs');
      expect(updated.activeDetours.map((d) => d.title)).toContain('Refactor scoring heuristic');

      const readBack = tools.docs_memory_getObjectiveState.handler({ slug });
      expect(readBack.exists).toBe(true);
      expect(readBack.state.parentObjective).toBe('Implement MCP skill APIs');
      expect(readBack.state.detours.some((d) => d.title === 'Refactor scoring heuristic')).toBe(true);
      expect(await fs.promises.stat(objectivePath)).toBeTruthy();
    } finally {
      // Best-effort cleanup to keep working tree clean.
      await fs.promises.rm(sessionPath, { recursive: true, force: true });
    }
  });
});
