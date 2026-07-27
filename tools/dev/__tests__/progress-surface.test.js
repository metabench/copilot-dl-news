'use strict';

const fs = require('fs');
const path = require('path');
const {
  stripComments, checkRendererPurity, checkImmediateRefresh, checkDiskServedSvg, evaluate, CONTRACTS
} = require('../checks/progress-surface.check');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('progress-surface contracts', () => {
  it('all three hold against the REAL files', () => {
    const results = evaluate(read);
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results.map((r) => r.id)).toEqual(['P1-renderer-purity', 'P2-immediate-refresh', 'P3-svg-served-from-disk']);
  });

  describe('P1 renderer purity', () => {
    it('fires when the renderer reaches for live git', () => {
      const mutated = read('tools/agi/progress-svg.js')
        .replace("const fs = require('fs');", "const fs = require('fs');\nconst { execSync } = require('child_process');");
      const problems = checkRendererPurity(mutated);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/child_process/);
      expect(problems[0]).toMatch(/staleness byte-compare is meaningless/);
    });

    it('does not fire on the words appearing only in a comment', () => {
      const withComment = '// we deliberately avoid child_process and execSync here\nconst x = 1;';
      expect(checkRendererPurity(withComment)).toEqual([]);
    });
  });

  describe('P2 immediate refresh (guards the c128.5 fix)', () => {
    it('fires when the bare refresh() call is removed, leaving only the interval', () => {
      const real = read('src/ui/server/projectStatus/controls.js');
      const mutated = real.replace(/^\s*refresh\(\);\s*$/m, '');
      const problems = checkImmediateRefresh(mutated);
      expect(problems.some((p) => /never calls refresh\(\) immediately/.test(p))).toBe(true);
    });

    it('is not satisfied by the click handler alone (if (...) refresh();)', () => {
      const onlyClick = "activate() { if (t) refresh(); setInterval(refresh, 60000); }";
      expect(checkImmediateRefresh(onlyClick).some((p) => /never calls refresh\(\) immediately/.test(p))).toBe(true);
    });

    it('fires when the periodic refresh is lost', () => {
      const noInterval = "activate() {\n      refresh();\n}";
      expect(checkImmediateRefresh(noInterval).some((p) => /lost its periodic refresh/.test(p))).toBe(true);
    });
  });

  describe('P3 disk-served svg', () => {
    it('fires when the read is hoisted out of the handler', () => {
      const real = read('src/ui/server/projectStatus/server.js');
      const hoisted = real.replace(/fs\.readFile\s*\(/, 'useCachedBuffer(');
      const problems = checkDiskServedSvg(hoisted);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/pins the served bytes to server start/);
    });

    it('fires when the route disappears entirely', () => {
      expect(checkDiskServedSvg('const server = {};')[0]).toMatch(/no \/progress\.svg route/);
    });
  });

  it('treats an unreadable file as an unenforced contract, not a pass', () => {
    const results = evaluate(() => { throw new Error('ENOENT'); });
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(results[0].problems[0]).toMatch(/cannot read/);
  });

  it('stripComments removes block and line comments but keeps code', () => {
    expect(stripComments('/* execSync */\nconst a = 1; // execSync\nconst b = execSync;'))
      .toContain('const b = execSync;');
    expect(stripComments('/* execSync */\n// execSync\nconst a = 1;')).not.toMatch(/execSync/);
  });

  it('every contract names a file that exists (a stale path is a silent no-op)', () => {
    for (const c of CONTRACTS) expect(fs.existsSync(path.join(ROOT, c.file))).toBe(true);
  });
});
