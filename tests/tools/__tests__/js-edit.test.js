const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseModule, collectFunctions, extractCode, replaceSpan } = require('../../../tools/dev/lib/swcAst');

describe('swcAst helpers', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-sample.js');
  const source = fs.readFileSync(fixturePath, 'utf8');
  const ast = parseModule(source, fixturePath);
  const { functions } = collectFunctions(ast, source);

  const nestedFixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-nested-classes.js');
  const nestedSource = fs.readFileSync(nestedFixturePath, 'utf8');
  const nestedAst = parseModule(nestedSource, nestedFixturePath);
  const { functions: nestedFunctions } = collectFunctions(nestedAst, nestedSource);

  const jsEditPath = path.join(__dirname, '../../../tools/dev/js-edit.js');

  const runJsEdit = (args, options = {}) => {
    return spawnSync(process.execPath, [jsEditPath, ...args], {
      encoding: 'utf8',
      ...options
    });
  };

  test('collectFunctions finds top-level and default exports', () => {
    const names = functions.map((fn) => fn.name);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).toContain('defaultHandler');
    expect(names).toContain('gamma');

    const alpha = functions.find((fn) => fn.name === 'alpha');
    expect(alpha.replaceable).toBe(true);
    expect(alpha.canonicalName).toBe('exports.alpha');
    expect(alpha.scopeChain).toEqual(['exports', 'alpha']);
    expect(alpha.pathSignature).toBe('module.body[0].ExportDeclaration.declaration.FunctionDeclaration.FunctionDeclaration');
    expect(alpha.hash).toHaveLength(64);

    const gamma = functions.find((fn) => fn.name === 'gamma');
    expect(gamma.replaceable).toBe(false);
    expect(gamma.canonicalName).toBe('gamma');
    expect(gamma.pathSignature.endsWith('ArrowFunctionExpression')).toBe(true);

    const defaultFn = functions.find((fn) => fn.name === 'defaultHandler');
    expect(defaultFn.exportKind).toBe('default');
    expect(defaultFn.canonicalName).toBe('exports.default');
    expect(defaultFn.scopeChain).toEqual(['exports', 'default']);
    expect(defaultFn.hash).toHaveLength(64);
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

  test('collectFunctions annotates class scopes and guardrail metadata', () => {
    const render = nestedFunctions.find((fn) => fn.canonicalName === 'exports.NewsSummary > #render');
    expect(render).toBeDefined();
    expect(render.scopeChain).toEqual(['exports', 'NewsSummary', '#render']);
    expect(render.pathSignature).toBe('module.body[0].ExportDeclaration.declaration.ClassDeclaration.body[0].ClassMethod.ClassMethod');
    expect(render.hash).toHaveLength(64);

    const statik = nestedFunctions.find((fn) => fn.canonicalName === 'exports.NewsSummary > static > initialize');
    expect(statik.scopeChain).toEqual(['exports', 'NewsSummary', 'static', 'initialize']);

    const getter = nestedFunctions.find((fn) => fn.canonicalName === 'exports.NewsSummary > get > total');
    expect(getter.scopeChain).toEqual(['exports', 'NewsSummary', 'get', 'total']);

    const helper = nestedFunctions.find((fn) => fn.canonicalName === 'exports.NewsSummary > #render > helper');
    expect(helper.scopeChain).toEqual(['exports', 'NewsSummary', '#render', 'helper']);
  });

  describe('js-edit CLI guardrails', () => {
    let tempDir;
    let targetFile;
    let replacementFunctionPath;
    let replacementConstPath;
    let replacementInvalidPath;
    let replacementRangePath;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-edit-cli-'));
      targetFile = path.join(tempDir, 'sample.js');
      replacementFunctionPath = path.join(tempDir, 'replacement-function.js');
      replacementConstPath = path.join(tempDir, 'replacement-const.js');
      replacementInvalidPath = path.join(tempDir, 'replacement-invalid.js');
      replacementRangePath = path.join(tempDir, 'replacement-range.js');

      fs.copyFileSync(fixturePath, targetFile);
      fs.writeFileSync(
        replacementFunctionPath,
        " function alpha() {\n  return 'updated';\n}\n"
      );
      fs.writeFileSync(
        replacementConstPath,
        " const alpha = () => 'updated';\n"
      );
      fs.writeFileSync(
        replacementInvalidPath,
        " function alpha( {\n  return 'broken'\n"
      );
      fs.writeFileSync(replacementRangePath, "'alpha-updated'");
    });

    afterEach(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('locate emits a guard plan when requested', () => {
      const planPath = path.join(tempDir, 'locate-plan.json');
      const result = runJsEdit([
        '--file',
        targetFile,
        '--locate',
        'exports.alpha',
        '--emit-plan',
        planPath,
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.plan).toBeDefined();
      expect(payload.plan.operation).toBe('locate');
      expect(payload.plan.matches).toHaveLength(1);
      expect(payload.plan.matches[0].pathSignature).toBe('module.body[0].ExportDeclaration.declaration.FunctionDeclaration.FunctionDeclaration');
      expect(fs.existsSync(planPath)).toBe(true);
      const planFile = JSON.parse(fs.readFileSync(planPath, 'utf8'));
      expect(planFile.operation).toBe('locate');
      expect(planFile.selector).toBe('exports.alpha');
      expect(planFile.matches[0].expectedHash).toHaveLength(64);
      const alphaRecord = functions.find((fn) => fn.canonicalName === 'exports.alpha');
      expect(planFile.matches[0].identifierSpan).toEqual({
        start: alphaRecord.identifierSpan.start,
        end: alphaRecord.identifierSpan.end
      });
    });

    test('replacement aborts on structural drift unless forced', () => {
      const locate = runJsEdit([
        '--file',
        targetFile,
        '--locate',
        'exports.alpha',
        '--json'
      ]);

      expect(locate.status).toBe(0);
      const locatePayload = JSON.parse(locate.stdout);
      expect(locatePayload.matches).toHaveLength(1);
      expect(locatePayload.matches[0].hash).toHaveLength(64);

      const mismatch = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--with',
        replacementConstPath,
        '--json'
      ]);

      expect(mismatch.status).not.toBe(0);
      const mismatchOutput = `${mismatch.stderr}${mismatch.stdout}`;
      expect(mismatchOutput).toContain('Path mismatch');

      const forced = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--with',
        replacementConstPath,
        '--json',
        '--force'
      ]);

      expect(forced.status).toBe(0);
      const forcedPayload = JSON.parse(forced.stdout);
      expect(forcedPayload.guard.hash.status).toBe('ok');
      expect(forcedPayload.guard.path.status).toBe('bypass');
      expect(forcedPayload.guard.result.after).toHaveLength(64);
    });

    test('replacement aborts on hash drift unless forced', () => {
      const locate = runJsEdit([
        '--file',
        targetFile,
        '--locate',
        'exports.alpha',
        '--json'
      ]);

      expect(locate.status).toBe(0);
      const locatePayload = JSON.parse(locate.stdout);
      const expectedHash = locatePayload.matches[0].hash;
      expect(expectedHash).toHaveLength(64);

      const drifted = fs
        .readFileSync(targetFile, 'utf8')
        .replace("return 'alpha';", "return 'alpha drift';");
      fs.writeFileSync(targetFile, drifted);

      const mismatch = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--expect-hash',
        expectedHash,
        '--with',
        replacementFunctionPath,
        '--json'
      ]);

      expect(mismatch.status).not.toBe(0);
      const mismatchOutput = `${mismatch.stderr}${mismatch.stdout}`;
      expect(mismatchOutput).toContain('Hash mismatch');

      const forced = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--expect-hash',
        expectedHash,
        '--with',
        replacementFunctionPath,
        '--json',
        '--force'
      ]);

      expect(forced.status).toBe(0);
      const forcedPayload = JSON.parse(forced.stdout);
      expect(forcedPayload.guard.hash.status).toBe('bypass');
      expect(forcedPayload.guard.hash.expected).toBe(expectedHash);
      expect(forcedPayload.guard.path.status).toBe('ok');
      expect(forcedPayload.guard.result.after).toHaveLength(64);
    });

    test('replacement emits guard plan containing expected hash', () => {
      const locate = runJsEdit([
        '--file',
        targetFile,
        '--locate',
        'exports.alpha',
        '--json'
      ]);

      expect(locate.status).toBe(0);
      const locatePayload = JSON.parse(locate.stdout);
      const expectedHash = locatePayload.matches[0].hash;
      const alphaRecord = functions.find((fn) => fn.canonicalName === 'exports.alpha');

      const planPath = path.join(tempDir, 'replace-plan.json');
      const result = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--expect-hash',
        expectedHash,
        '--with',
        replacementFunctionPath,
        '--emit-plan',
        planPath,
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.plan).toBeDefined();
      expect(payload.plan.operation).toBe('replace');
      expect(payload.plan.matches[0].expectedHash).toBe(expectedHash);
      expect(fs.existsSync(planPath)).toBe(true);
      const planFile = JSON.parse(fs.readFileSync(planPath, 'utf8'));
      expect(planFile.matches[0].expectedHash).toBe(expectedHash);
      expect(planFile.matches[0].pathSignature).toBe('module.body[0].ExportDeclaration.declaration.FunctionDeclaration.FunctionDeclaration');
      expect(planFile.matches[0].identifierSpan).toEqual({
        start: alphaRecord.identifierSpan.start,
        end: alphaRecord.identifierSpan.end
      });
    });

    test('replace-range updates a slice within the function body', () => {
      const alphaRecord = functions.find((fn) => fn.canonicalName === 'exports.alpha');
      const snippet = extractCode(source, alphaRecord.span);
      const relativeStart = snippet.indexOf("'alpha'");
      const relativeEnd = relativeStart + "'alpha'".length;
      const rangeArg = `${relativeStart}:${relativeEnd}`;

      const expectedHash = alphaRecord.hash;

      const result = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--with',
        replacementRangePath,
        '--replace-range',
        rangeArg,
        '--expect-hash',
        expectedHash,
        '--json',
        '--fix'
      ]);

      if (result.status !== 0) {
        throw new Error(`replace-range failed: ${result.stderr || result.stdout}`);
      }
      const payload = JSON.parse(result.stdout);
      expect(payload.guard.hash.status).toBe('ok');
      const updated = fs.readFileSync(targetFile, 'utf8');
      expect(updated).toContain("'alpha-updated'");
      expect(updated).not.toContain("'alpha';");
    });

    test('rename updates the function declaration identifier', () => {
      const result = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--rename',
        'alphaRenamed',
        '--json',
        '--fix'
      ]);

      if (result.status !== 0) {
        throw new Error(`rename failed: ${result.stderr || result.stdout}`);
      }
      const payload = JSON.parse(result.stdout);
      expect(payload.guard.hash.status).toBe('ok');
      const updated = fs.readFileSync(targetFile, 'utf8');
      expect(updated).toContain('export function alphaRenamed()');
      expect(updated).not.toContain('export function alpha()');
    });

    test('replacement aborts when replacement introduces syntax error', () => {
      const result = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--with',
        replacementInvalidPath,
        '--json'
      ]);

      expect(result.status).not.toBe(0);
      const output = `${result.stderr}${result.stdout}`;
      expect(output).toContain('Replacement produced invalid JavaScript');
    });
  });
});
