const fs = require('fs');
const path = require('path');
const { parseModule, collectFunctions, extractCode, replaceSpan } = require('../../../tools/dev/lib/swcAst');

describe('swcAst helpers', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-sample.js');
  const source = fs.readFileSync(fixturePath, 'utf8');
  const ast = parseModule(source, fixturePath);
  const { functions } = collectFunctions(ast, source);

  test('collectFunctions finds top-level and default exports', () => {
    const names = functions.map((fn) => fn.name);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).toContain('defaultHandler');
    expect(names).toContain('gamma');

    const alpha = functions.find((fn) => fn.name === 'alpha');
    expect(alpha.replaceable).toBe(true);
    const gamma = functions.find((fn) => fn.name === 'gamma');
    expect(gamma.replaceable).toBe(false);
    const defaultFn = functions.find((fn) => fn.name === 'defaultHandler');
    expect(defaultFn.exportKind).toBe('default');
  });

  test('extractCode returns the exact source slice', () => {
    const alpha = functions.find((fn) => fn.name === 'alpha');
    const snippet = extractCode(source, alpha.span);
    expect(snippet).toContain('function alpha');
    expect(snippet).toContain("return 'alpha'");
  });

  test('replaceSpan swaps the targeted range', () => {
    const alpha = functions.find((fn) => fn.name === 'alpha');
    const replacement = "export function alpha() {\n  return 'updated';\n}\n";
    const updated = replaceSpan(source, alpha.span, replacement);

    expect(updated).toContain("return 'updated'");
    expect(updated).not.toContain("return 'alpha'");
  });

  test('parseModule rejects invalid syntax', () => {
    expect(() => parseModule('export function broken() {', 'broken.js')).toThrow();
  });
});
