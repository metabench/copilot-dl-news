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
    expect(names).toContain('legacyEntry');

    const alpha = functions.find((fn) => fn.name === 'alpha');
    expect(alpha.replaceable).toBe(true);
    expect(alpha.canonicalName).toBe('exports.alpha');
    expect(alpha.scopeChain).toEqual(['exports', 'alpha']);
    expect(alpha.pathSignature).toBe('module.body[0].ExportDeclaration.declaration.FunctionDeclaration.FunctionDeclaration');
    expect(alpha.hash).toHaveLength(8);

    const gamma = functions.find((fn) => fn.name === 'gamma');
    expect(gamma.replaceable).toBe(false);
    expect(gamma.canonicalName).toBe('gamma');
    expect(gamma.pathSignature.endsWith('ArrowFunctionExpression')).toBe(true);

    const defaultFn = functions.find((fn) => fn.name === 'defaultHandler');
    expect(defaultFn.exportKind).toBe('default');
    expect(defaultFn.canonicalName).toBe('exports.default');
    expect(defaultFn.scopeChain).toEqual(['exports', 'default']);
    expect(defaultFn.hash).toHaveLength(8);
  });

  test('collectFunctions recognises CommonJS exports patterns', () => {
    const moduleDefault = functions.find((fn) => fn.canonicalName === 'module.exports');
    expect(moduleDefault).toBeDefined();
    expect(moduleDefault.name).toBe('legacyEntry');
    expect(moduleDefault.exportKind).toBe('commonjs-default');
    expect(moduleDefault.scopeChain).toEqual(['module.exports']);

    const moduleHandler = functions.find((fn) => fn.canonicalName === 'module.exports.handler');
    expect(moduleHandler).toBeDefined();
    expect(moduleHandler.exportKind).toBe('commonjs-named');
    expect(moduleHandler.scopeChain).toEqual(['module.exports', 'handler']);
    expect(moduleHandler.kind).toBe('function-expression');

    const exportsWorker = functions.find((fn) => fn.canonicalName === 'exports.worker');
    expect(exportsWorker).toBeDefined();
    expect(exportsWorker.exportKind).toBe('commonjs-named');
    expect(exportsWorker.scopeChain).toEqual(['exports', 'worker']);
    expect(exportsWorker.kind).toBe('function-expression');

    const exportsUtility = functions.find((fn) => fn.canonicalName === 'exports.utility');
    expect(exportsUtility).toBeDefined();
    expect(exportsUtility.exportKind).toBe('commonjs-named');
    expect(exportsUtility.scopeChain).toEqual(['exports', 'utility']);
    expect(exportsUtility.kind).toBe('arrow-function');
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
    expect(render.hash).toHaveLength(8);

    const statik = nestedFunctions.find((fn) => fn.canonicalName === 'exports.NewsSummary > static > initialize');
    expect(statik.scopeChain).toEqual(['exports', 'NewsSummary', 'static', 'initialize']);

    const getter = nestedFunctions.find((fn) => fn.canonicalName === 'exports.NewsSummary > get > total');
    expect(getter.scopeChain).toEqual(['exports', 'NewsSummary', 'get', 'total']);

    const helper = nestedFunctions.find((fn) => fn.canonicalName === 'exports.NewsSummary > #render > helper');
    expect(helper.scopeChain).toEqual(['exports', 'NewsSummary', '#render', 'helper']);
  });

  test('list-functions json includes byte length metadata', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--list-functions',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`list-functions failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.functions.length).toBeGreaterThan(0);
    const expectedAlpha = functions.find((fn) => fn.canonicalName === 'exports.alpha');
    const alphaPayload = payload.functions.find((fn) => fn.canonicalName === 'exports.alpha');
    expect(alphaPayload).toBeDefined();
    const expectedLength = expectedAlpha.span.end - expectedAlpha.span.start;
    expect(alphaPayload.byteLength).toBe(expectedLength);
    expect(alphaPayload.byteLength).toBeGreaterThan(0);
  });

  test('list-variables json surfaces binding metadata', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--list-variables',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`list-variables failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.totalVariables).toBeGreaterThan(0);
    const names = payload.variables.map((variable) => variable.name);
    expect(names).toEqual(expect.arrayContaining([
      'inner',
      'gamma',
      'ren',
      'renAlias',
      'first',
      'third',
      'legacy',
      'sequence',
      'module.exports',
      'worker',
      'handler',
      'utility',
      'settings',
      'version'
    ]));

    const gammaEntry = payload.variables.find((variable) => variable.name === 'gamma');
    expect(gammaEntry.kind).toBe('const');
    expect(gammaEntry.initializerType).toBe('ArrowFunctionExpression');
    expect(gammaEntry.byteLength).toBeGreaterThan(0);

    const renAliasEntry = payload.variables.find((variable) => variable.name === 'renAlias');
    expect(renAliasEntry.kind).toBe('const');
    expect(renAliasEntry.initializerType).toBe('Identifier');
    expect(Array.isArray(renAliasEntry.scopeChain)).toBe(true);

    const innerEntry = payload.variables.find((variable) => variable.name === 'inner');
    expect(innerEntry.scopeChain).toEqual(['beta']);

    const moduleExportsEntry = payload.variables.find((variable) => variable.name === 'module.exports');
    expect(moduleExportsEntry).toBeDefined();
    expect(moduleExportsEntry.kind).toBe('assignment');
    expect(moduleExportsEntry.exportKind).toBe('commonjs-default');
    expect(moduleExportsEntry.scopeChain).toEqual([]);
    expect(moduleExportsEntry.initializerType).toBe('FunctionExpression');

    const workerEntry = payload.variables.find((variable) => variable.name === 'worker' && variable.scopeChain.includes('exports'));
    expect(workerEntry).toBeDefined();
    expect(workerEntry.kind).toBe('assignment');
    expect(workerEntry.exportKind).toBe('commonjs-named');
    expect(workerEntry.scopeChain).toEqual(['exports']);
    expect(workerEntry.initializerType).toBe('FunctionExpression');

    const handlerEntry = payload.variables.find((variable) => variable.name === 'handler');
    expect(handlerEntry).toBeDefined();
    expect(handlerEntry.kind).toBe('assignment');
    expect(handlerEntry.exportKind).toBe('commonjs-named');
    expect(handlerEntry.scopeChain).toEqual(['module.exports']);

    const utilityEntry = payload.variables.find((variable) => variable.name === 'utility');
    expect(utilityEntry).toBeDefined();
    expect(utilityEntry.kind).toBe('assignment');
    expect(utilityEntry.exportKind).toBe('commonjs-named');
    expect(utilityEntry.initializerType).toBe('ArrowFunctionExpression');

    const settingsEntry = payload.variables.find((variable) => variable.name === 'settings');
    expect(settingsEntry).toBeDefined();
    expect(settingsEntry.kind).toBe('assignment');
    expect(settingsEntry.exportKind).toBe('commonjs-named');
    expect(settingsEntry.scopeChain).toEqual(['module.exports']);
    expect(settingsEntry.initializerType).toBe('ObjectExpression');

    const versionEntry = payload.variables.find((variable) => variable.name === 'version');
    expect(versionEntry).toBeDefined();
    expect(versionEntry.kind).toBe('assignment');
    expect(versionEntry.exportKind).toBe('commonjs-named');
    expect(versionEntry.scopeChain).toEqual(['exports']);
    expect(versionEntry.initializerType).toBe('NumericLiteral');
  });

  test('context-function json returns padded excerpts with metadata', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--context-function',
      'exports.alpha',
      '--context-before',
      '24',
      '--context-after',
      '24',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`context-function failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.entity).toBe('function');
    expect(payload.selector).toBe('exports.alpha');
    expect(payload.padding.requestedBefore).toBe(24);
    expect(payload.padding.requestedAfter).toBe(24);
    expect(payload.contexts).toHaveLength(1);
    const [contextEntry] = payload.contexts;
    expect(contextEntry.name).toBe('exports.alpha');
    expect(contextEntry.snippets.context).toContain('function alpha');
    expect(contextEntry.snippets.base).toContain("return 'alpha'");
    expect(contextEntry.hashes.context).toHaveLength(8);
    expect(contextEntry.appliedPadding.before).toBeLessThanOrEqual(24);
    expect(contextEntry.appliedPadding.after).toBeLessThanOrEqual(24);
  });

  test('context-function supports enclosing class expansion', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--context-function',
      'LaunchSequence#execute',
      '--context-enclosing',
      'class',
      '--context-before',
      '0',
      '--context-after',
      '0',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`context-function (class) failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.contexts).toHaveLength(1);
    const [contextEntry] = payload.contexts;
    expect(contextEntry.enclosing).toEqual(expect.objectContaining({ kind: 'class', name: 'LaunchSequence' }));
    expect(contextEntry.snippets.context).toContain('class LaunchSequence');
    expect(contextEntry.snippets.context).toContain('execute()');
  });

  test('context-function supports enclosing function expansion', () => {
    const countdownRecord = functions.find((fn) => fn.name === 'countdown');
    expect(countdownRecord).toBeDefined();

    const result = runJsEdit([
      '--file',
      fixturePath,
      '--context-function',
      countdownRecord.canonicalName,
      '--context-enclosing',
      'function',
      '--context-before',
      '0',
      '--context-after',
      '0',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`context-function (function) failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.contexts).toHaveLength(1);
    const [contextEntry] = payload.contexts;
    expect(contextEntry.selectedEnclosingContext).toEqual(
      expect.objectContaining({ kind: 'class-method', name: 'MissionController.launch' })
    );
    const kinds = contextEntry.enclosingContexts.map((ctx) => ctx.kind);
    expect(kinds).toEqual(expect.arrayContaining(['class-method', 'class']));
    const normalizedFunctionContext = contextEntry.snippets.context.replace(/\r\n/g, '\n');
    expect(normalizedFunctionContext).toContain("const pad = 'LC-39A';");
    expect(normalizedFunctionContext).toContain('countdown() {');
  });

  test('js-edit resolves CommonJS selectors for context and locate', () => {
    const locateHandler = runJsEdit([
      '--file',
      fixturePath,
      '--locate',
      'module.exports.handler',
      '--json'
    ]);

    expect(locateHandler.status).toBe(0);
    const locatePayload = JSON.parse(locateHandler.stdout);
    expect(locatePayload.matches).toHaveLength(1);
    expect(locatePayload.matches[0].canonicalName).toBe('module.exports.handler');
    expect(locatePayload.matches[0].exportKind).toBe('commonjs-named');

    const contextResult = runJsEdit([
      '--file',
      fixturePath,
      '--context-function',
      'exports.worker',
      '--context-before',
      '0',
      '--context-after',
      '0',
      '--json'
    ]);

    expect(contextResult.status).toBe(0);
    const contextPayload = JSON.parse(contextResult.stdout);
    expect(contextPayload.contexts).toHaveLength(1);
    const [contextEntry] = contextPayload.contexts;
    expect(contextEntry.name).toBe('exports.worker');
    expect(contextEntry.snippets.base).toContain('worker-ready');
    expect(contextEntry.hashes.base).toHaveLength(8);
  });

  test('context-variable json handles emoji bindings', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--context-variable',
      'face',
      '--context-before',
      '16',
      '--context-after',
      '16',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`context-variable failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.entity).toBe('variable');
    expect(payload.contexts).toHaveLength(1);
    const [contextEntry] = payload.contexts;
    expect(contextEntry.name).toContain('face');
    expect(contextEntry.snippets.context).toContain('😀');
    expect(contextEntry.hashes.context).toHaveLength(8);
    expect(contextEntry.appliedPadding.before).toBeLessThanOrEqual(16);
    expect(contextEntry.appliedPadding.after).toBeLessThanOrEqual(16);
    expect(contextEntry.offsets.baseEnd).toBeGreaterThan(contextEntry.offsets.baseStart);
  });

  test('context-variable supports enclosing function expansion', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--context-variable',
      'sequence',
      '--context-enclosing',
      'function',
      '--context-before',
      '0',
      '--context-after',
      '0',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`context-variable (function) failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.contexts).toHaveLength(1);
    const [contextEntry] = payload.contexts;
    expect(contextEntry.selectedEnclosingContext).toEqual(
      expect.objectContaining({ kind: 'function-declaration', name: 'countdown' })
    );
    const kinds = contextEntry.enclosingContexts.map((ctx) => ctx.kind);
    expect(kinds).toEqual(expect.arrayContaining(['function-declaration', 'class-method', 'class']));
    const normalizedVariableContext = contextEntry.snippets.context.replace(/\r\n/g, '\n');
    expect(normalizedVariableContext).toContain('countdown() {');
    expect(normalizedVariableContext).toContain('const sequence =');
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
      expect(planFile.matches[0].expectedHash).toHaveLength(8);
      const alphaRecord = functions.find((fn) => fn.canonicalName === 'exports.alpha');
      expect(planFile.matches[0].identifierSpan).toEqual({
        start: alphaRecord.identifierSpan.start,
        end: alphaRecord.identifierSpan.end
      });
    });

    test('context-function emits enhanced plan with summary metadata', () => {
      const planPath = path.join(tempDir, 'context-plan.json');
      const result = runJsEdit([
        '--file',
        nestedFixturePath,
        '--context-function',
        'NewsSummary',
        '--allow-multiple',
        '--emit-plan',
        planPath,
        '--json'
      ]);

      expect(result.status).toBe(0);
      expect(fs.existsSync(planPath)).toBe(true);
      const planFile = JSON.parse(fs.readFileSync(planPath, 'utf8'));
      
      // Verify plan structure
      expect(planFile.operation).toBe('context-function');
      expect(planFile.selector).toBe('NewsSummary');
      expect(planFile.version).toBe(1);
      expect(planFile.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      
      // Verify enhanced summary metadata
      expect(planFile.summary).toBeDefined();
      expect(planFile.summary.matchCount).toBe(1);
      expect(planFile.summary.allowMultiple).toBe(true);
      expect(planFile.summary.spanRange).toBeDefined();
      expect(planFile.summary.spanRange.start).toBeGreaterThanOrEqual(0);
      expect(planFile.summary.spanRange.end).toBeGreaterThan(planFile.summary.spanRange.start);
      expect(planFile.summary.spanRange.totalLength).toBeGreaterThan(0);
      
      // Verify context-specific extras
      expect(planFile.entity).toBe('function');
      expect(planFile.padding).toBeDefined();
      expect(planFile.padding.requestedBefore).toBe(512);
      expect(planFile.padding.requestedAfter).toBe(512);
      expect(planFile.enclosingMode).toBe('exact');
      
      // Verify matches array
      expect(planFile.matches).toHaveLength(1);
      expect(planFile.matches[0].canonicalName).toBe('exports.NewsSummary');
      expect(planFile.matches[0].kind).toBe('class');
      expect(planFile.matches[0].hash).toHaveLength(8);
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
      expect(locatePayload.matches[0].hash).toHaveLength(8);

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
      expect(forcedPayload.guard.result.after).toHaveLength(8);
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
      expect(expectedHash).toHaveLength(8);

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
      expect(forcedPayload.guard.result.after).toHaveLength(8);
    });

    test('replacement aborts on span drift unless forced', () => {
      const alphaRecord = functions.find((fn) => fn.canonicalName === 'exports.alpha');
      const expectedSpanArg = `${alphaRecord.span.start}:${alphaRecord.span.end}`;

      const okRun = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--expect-span',
        expectedSpanArg,
        '--with',
        replacementFunctionPath,
        '--json'
      ]);

      expect(okRun.status).toBe(0);
      const okPayload = JSON.parse(okRun.stdout);
      expect(okPayload.guard.span.status).toBe('ok');
      expect(okPayload.guard.span.expectedStart).toBe(alphaRecord.span.start);
      expect(okPayload.guard.span.expectedEnd).toBe(alphaRecord.span.end);

      const wrongSpan = `${alphaRecord.span.start + 1}:${alphaRecord.span.end + 1}`;
      const mismatch = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--expect-span',
        wrongSpan,
        '--with',
        replacementFunctionPath,
        '--json'
      ]);

      expect(mismatch.status).not.toBe(0);
      const mismatchOutput = `${mismatch.stderr}${mismatch.stdout}`;
      expect(mismatchOutput).toContain('Span mismatch');

      const forced = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--expect-span',
        wrongSpan,
        '--with',
        replacementFunctionPath,
        '--json',
        '--force'
      ]);

      expect(forced.status).toBe(0);
      const forcedPayload = JSON.parse(forced.stdout);
      expect(forcedPayload.guard.span.status).toBe('bypass');
      expect(forcedPayload.guard.span.expectedStart).toBe(alphaRecord.span.start + 1);
      expect(forcedPayload.guard.span.expectedEnd).toBe(alphaRecord.span.end + 1);
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
      const expectedSpanArg = `${alphaRecord.span.start}:${alphaRecord.span.end}`;

      const planPath = path.join(tempDir, 'replace-plan.json');
      const result = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--expect-hash',
        expectedHash,
        '--expect-span',
        expectedSpanArg,
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
      expect(payload.plan.matches[0].expectedSpan).toEqual({
        start: alphaRecord.span.start,
        end: alphaRecord.span.end
      });
      expect(payload.guard.span.status).toBe('ok');
      expect(payload.guard.span.expectedStart).toBe(alphaRecord.span.start);
      expect(payload.guard.span.expectedEnd).toBe(alphaRecord.span.end);
      expect(fs.existsSync(planPath)).toBe(true);
      const planFile = JSON.parse(fs.readFileSync(planPath, 'utf8'));
      expect(planFile.matches[0].expectedHash).toBe(expectedHash);
      expect(planFile.matches[0].pathSignature).toBe('module.body[0].ExportDeclaration.declaration.FunctionDeclaration.FunctionDeclaration');
      expect(planFile.matches[0].identifierSpan).toEqual({
        start: alphaRecord.identifierSpan.start,
        end: alphaRecord.identifierSpan.end
      });
      expect(planFile.matches[0].expectedSpan).toEqual({
        start: alphaRecord.span.start,
        end: alphaRecord.span.end
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
