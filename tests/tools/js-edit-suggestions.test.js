const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('js-edit Selector Suggestions', () => {
  const tmpDir = path.join(__dirname, 'tmp-suggestions');
  const targetFile = path.join(tmpDir, 'ambiguous.js');
  const jsEditPath = path.resolve(__dirname, '../../tools/dev/js-edit.js');

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Create a file with ambiguous functions
    const content = `
function init() {
  console.log('init 1');
}

var init = function() {
  console.log('init 2');
}
`;
    fs.writeFileSync(targetFile, content, 'utf8');
  });

  test('should suggest selectors when multiple matches found', () => {
    try {
      execSync(`node ${jsEditPath} --file ${targetFile} --locate init --suggest-selectors --json`, { stdio: 'pipe' });
      throw new Error('Should have failed with exit code 1');
    } catch (error) {
      expect(error.status).toBe(1);
      const output = error.stdout.toString();
      
      let json;
      try {
        json = JSON.parse(output);
      } catch (e) {
        console.error('Failed to parse JSON output:', output);
        throw e;
      }
      
      expect(json.status).toBe('multiple_matches');
      expect(json.suggestions).toBeDefined();
      expect(json.suggestions.length).toBe(2);
      
      const names = json.suggestions.map(s => s.name);
      expect(names).toContain('init');
      
      const selectors = json.suggestions.flatMap(s => s.selectors);
      expect(selectors.some(s => s.startsWith('path:'))).toBe(true);
      expect(selectors.some(s => s.startsWith('hash:'))).toBe(true);
    }
  });

  test('should fail without suggestions if flag not provided', () => {
    try {
      execSync(`node ${jsEditPath} --file ${targetFile} --locate init --json`, { stdio: 'pipe' });
      throw new Error('Should have failed with exit code 1');
    } catch (error) {
      expect(error.status).toBe(1);
      const output = error.stderr.toString() + error.stdout.toString();
      expect(output).toContain('matched 2 targets');
      // In JSON mode without suggestions, it might not print "suggestions" key
      // But let's just check it doesn't have the suggestions structure
      if (output.trim().startsWith('{')) {
         const json = JSON.parse(output);
         expect(json.suggestions).toBeUndefined();
      }
    }
  });
});
