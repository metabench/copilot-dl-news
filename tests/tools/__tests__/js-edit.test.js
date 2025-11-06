const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseModule, collectFunctions, collectVariables, extractCode, replaceSpan } = require('../../../tools/dev/lib/swcAst');

describe('swcAst helpers', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-sample.js');
  const source = fs.readFileSync(fixturePath, 'utf8');
  const ast = parseModule(source, fixturePath);
  const { functions } = collectFunctions(ast, source);
  const { variables } = collectVariables(ast, source);

  const nestedFixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-nested-classes.js');
  const nestedSource = fs.readFileSync(nestedFixturePath, 'utf8');
  const nestedAst = parseModule(nestedSource, nestedFixturePath);
  const { functions: nestedFunctions } = collectFunctions(nestedAst, nestedSource);

  const callbackFixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-jest-callbacks.js');
  const callbackSource = fs.readFileSync(callbackFixturePath, 'utf8');
  const callbackAst = parseModule(callbackSource, callbackFixturePath);
  const { functions: callbackFunctions } = collectFunctions(callbackAst, callbackSource);

  const unicodeFixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-unicode.js');

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
    expect(render.pathSignature).toBe('module.body[1].ExportDeclaration.declaration.ClassDeclaration.body[1].ClassMethod.ClassMethod');
    expect(render.hash).toHaveLength(8);

    const statik = nestedFunctions.find((fn) => fn.canonicalName === 'exports.NewsSummary > static > initialize');
    expect(statik.scopeChain).toEqual(['exports', 'NewsSummary', 'static', 'initialize']);

    const getter = nestedFunctions.find((fn) => fn.canonicalName === 'exports.NewsSummary > get > total');
    expect(getter.scopeChain).toEqual(['exports', 'NewsSummary', 'get', 'total']);

    const helper = nestedFunctions.find((fn) => fn.canonicalName === 'exports.NewsSummary > #render > helper');
    expect(helper.scopeChain).toEqual(['exports', 'NewsSummary', '#render', 'helper']);
  });

  test('js-edit lists constructors with metadata', () => {
    const result = runJsEdit(['--file', nestedFixturePath, '--list-constructors', '--json']);
    if (result.status !== 0) {
      throw new Error(`list-constructors failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout.trim());
    expect(payload.totalConstructors).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(payload.constructors)).toBe(true);

    const summaryEntry = payload.constructors.find((entry) => entry.class && entry.class.name === 'NewsSummary');
    expect(summaryEntry).toBeDefined();
    expect(summaryEntry.class.extends).toBe('BaseSummary');
    expect(summaryEntry.class.implements).toBe(null);
    expect(summaryEntry.constructor.params).toBe('title, url = null');
    expect(summaryEntry.constructor.hash).toHaveLength(8);
    expect(summaryEntry.constructor.canonicalName).toContain('#constructor');

    const baseEntry = payload.constructors.find((entry) => entry.class && entry.class.name === 'BaseSummary');
    expect(baseEntry).toBeDefined();
    expect(baseEntry.constructor.params).toBe('(none)');

    const secretEntry = payload.constructors.find((entry) => entry.class && entry.class.name === 'SecretBox');
    expect(secretEntry).toBeDefined();
    expect(secretEntry.constructor.params).toBe('initial = 0');
    expect(secretEntry.class.extends).toBe(null);
  });

  test('js-edit scan targets (functions) emits discovery-backed payload', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--scan-targets',
      'exports.alpha',
      '--json'
    ]);
    if (result.status !== 0) {
      throw new Error(`scan-targets failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout.trim());
    expect(payload.kind).toBe('function');
    expect(payload.selector).toBe('exports.alpha');
    expect(payload.summary).toBeDefined();
    expect(payload.summary.matchCount).toBeGreaterThan(0);
    const names = payload.matches.map((match) => match.name);
    expect(names).toContain('exports.alpha');
  });

  test('collectFunctions captures jest-style callbacks', () => {
    const suiteCallback = callbackFunctions.find((fn) => fn.canonicalName === 'call:describe:mission_timers > callback');
    expect(suiteCallback).toBeDefined();
    expect(suiteCallback.kind).toBe('arrow-function');
    expect(suiteCallback.replaceable).toBe(true);
    expect(suiteCallback.scopeChain).toEqual(['call:describe:mission_timers', 'callback']);

    const beforeEachCallback = callbackFunctions.find(
      (fn) => fn.canonicalName === 'call:describe:mission_timers > callback > call:beforeEach > callback'
    );
    expect(beforeEachCallback).toBeDefined();
    expect(beforeEachCallback.kind).toBe('arrow-function');
    expect(beforeEachCallback.replaceable).toBe(true);

    const namedTestCallback = callbackFunctions.find(
      (fn) =>
        fn.canonicalName === 'call:describe:mission_timers > callback > call:test:captures_function_expressions > callback > callbackFn'
    );
    expect(namedTestCallback).toBeDefined();
    expect(namedTestCallback.kind).toBe('function-expression');
    expect(namedTestCallback.replaceable).toBe(true);
    expect(namedTestCallback.scopeChain).toEqual([
      'call:describe:mission_timers',
      'callback',
      'call:test:captures_function_expressions',
      'callback',
      'callbackFn'
    ]);

    const teardownCallback = callbackFunctions.find(
      (fn) =>
        fn.canonicalName === 'call:describe:mission_timers > callback > call:afterAll > callback > teardownSuite'
    );
    expect(teardownCallback).toBeDefined();
    expect(teardownCallback.kind).toBe('function-expression');
    expect(teardownCallback.replaceable).toBe(true);

    const nestedSuiteCallback = callbackFunctions.find(
      (fn) => fn.canonicalName === 'call:describe:mission_timers > callback > call:describe:nested_block > callback'
    );
    expect(nestedSuiteCallback).toBeDefined();
    expect(nestedSuiteCallback.kind).toBe('arrow-function');
    expect(nestedSuiteCallback.replaceable).toBe(true);
  });

  test('js-edit replaces describe callback via canonical selector', () => {
    const suiteCallback = callbackFunctions.find((fn) => fn.canonicalName === 'call:describe:mission_timers > callback');
    expect(suiteCallback).toBeDefined();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-edit-callback-'));
    let targetFile;
    try {
      targetFile = path.join(tempDir, 'callbacks.js');
      const replacementPath = path.join(tempDir, 'describe-replacement.js');
      fs.copyFileSync(callbackFixturePath, targetFile);

      const extractResult = runJsEdit([
        '--file',
        callbackFixturePath,
        '--extract',
        suiteCallback.canonicalName,
        '--json'
      ]);
      if (extractResult.status !== 0) {
        throw new Error(`callback extract failed: ${extractResult.stderr || extractResult.stdout}`);
      }
      const extractPayload = JSON.parse(extractResult.stdout);
      const originalSnippet = extractPayload.code;
      const expectedHash = extractPayload.function && extractPayload.function.hash ? extractPayload.function.hash : suiteCallback.hash;
      const newline = originalSnippet.includes('\r\n') ? '\r\n' : '\n';
      const marker = 'setupSandbox();';
      expect(originalSnippet.includes(marker)).toBe(true);
      const insertionPoint = originalSnippet.indexOf(marker) + marker.length;
      const replacementSnippet =
        originalSnippet.slice(0, insertionPoint) +
        newline +
        "    console.log('describe callback patched');" +
        newline +
        originalSnippet.slice(insertionPoint);
      expect(replacementSnippet).not.toBe(originalSnippet);
      fs.writeFileSync(replacementPath, replacementSnippet);

      const result = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        suiteCallback.canonicalName,
        '--expect-hash',
        expectedHash,
        '--with',
        replacementPath,
        '--json',
        '--fix'
      ]);

      if (result.status !== 0) {
        throw new Error(`callback replace failed: ${result.stderr || result.stdout}`);
      }

      const payload = JSON.parse(result.stdout);
      expect(payload.guard.hash.status).toBe('ok');
      expect(payload.guard.newline).toEqual(expect.objectContaining({
        status: expect.stringMatching(/^(ok|converted|none)$/),
        byteDelta: expect.any(Number)
      }));
      expect(payload.guard.newline.replacement).toEqual(expect.objectContaining({
        targetStyle: expect.any(String),
        normalizedStyle: expect.any(String)
      }));
      const updated = fs.readFileSync(targetFile, 'utf8');
      expect(updated).toContain("console.log('describe callback patched');");
    } finally {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  })












;

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
    expect(alphaPayload.hash).toBe(expectedAlpha.hash);
    expect(alphaPayload.hash).toHaveLength(8);
  });

  test('list-functions defaults to dense layout', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--list-functions'
    ]);

    if (result.status !== 0) {
      throw new Error(`list-functions (dense) failed: ${result.stderr || result.stdout}`);
    }

    const output = result.stdout;
    expect(output).toContain('Function Inventory');
    expect(output).toContain('Detected Functions');
    expect(output).toContain('alpha | kind=function-declaration | hash=');
    expect(output).toContain('loc=1:8 | bytes=41');
    expect(output).toContain('replaceable=yes');
    expect(output).not.toContain('index │ name');
  });

  test('--list-output verbose restores legacy table layout', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--list-functions',
      '--list-output',
      'verbose'
    ]);

    if (result.status !== 0) {
      throw new Error(`list-functions (verbose) failed: ${result.stderr || result.stdout}`);
    }

    const output = result.stdout;
    expect(output).toContain('index │ name');
    expect(output).toContain('Detected Functions');
    expect(output).not.toContain('| kind=');
  });

  test('JS_EDIT_LIST_OUTPUT env toggles verbose layout', () => {
    const env = { ...process.env, JS_EDIT_LIST_OUTPUT: 'verbose' };
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--list-functions'
    ], { env });

    if (result.status !== 0) {
      throw new Error(`list-functions (env verbose) failed: ${result.stderr || result.stdout}`);
    }

    const output = result.stdout;
    expect(output).toContain('index │ name');
    expect(output).not.toContain('| kind=');
  });

  test('rejects invalid list-output style', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--list-functions',
      '--list-output',
      'compact'
    ]);

    expect(result.status).not.toBe(0);
    const combined = `${result.stderr}${result.stdout}`;
    expect(combined).toContain('--list-output must be one of');
  });

  test('extract-hashes returns multi-byte snippets and guard metadata', () => {
    const inventoryResult = runJsEdit([
      '--file',
      unicodeFixturePath,
      '--list-functions',
      '--json'
    ]);

    if (inventoryResult.status !== 0) {
      throw new Error(`list-functions for unicode fixture failed: ${inventoryResult.stderr || inventoryResult.stdout}`);
    }

    const inventoryPayload = JSON.parse(inventoryResult.stdout);
    const inventoryStatic = inventoryPayload.functions.find((fn) => fn.canonicalName === 'exports.UnicodeDemo > static > banner');
    const inventoryHeadline = inventoryPayload.functions.find((fn) => fn.canonicalName === 'exports.headline');
    expect(inventoryStatic).toBeDefined();
    expect(inventoryHeadline).toBeDefined();
    expect(inventoryStatic.kind).toBe('class-method');
    expect(inventoryHeadline.kind).toBe('function-declaration');
    expect(inventoryStatic.hash).toHaveLength(8);
    expect(inventoryHeadline.hash).toHaveLength(8);
    expect(inventoryStatic.byteLength).toBeGreaterThan(0);
    expect(inventoryHeadline.byteLength).toBeGreaterThan(0);

    const staticHash = inventoryStatic.hash;
    const headlineHash = inventoryHeadline.hash;

    const result = runJsEdit([
      '--file',
      unicodeFixturePath,
      '--extract-hashes',
      `${staticHash},${headlineHash}`,
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`extract-hashes failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.matchCount).toBe(2);
    const renderPayload = payload.results.find((entry) => entry.hash === staticHash);
    expect(renderPayload).toBeDefined();
    expect(renderPayload.function.canonicalName).toBe(inventoryStatic.canonicalName);
    expect(renderPayload.code).toContain('準備完了🚀');

    const headlinePayload = payload.results.find((entry) => entry.hash === headlineHash);
    expect(headlinePayload).toBeDefined();
    expect(headlinePayload.function.canonicalName).toBe(inventoryHeadline.canonicalName);
    expect(headlinePayload.code).toContain('📡 Launch');
  });

  test('extract-hashes reports missing hash failures', () => {
    const invalid = runJsEdit([
      '--file',
      unicodeFixturePath,
      '--extract-hashes',
      'deadbeef'
    ]);

    expect(invalid.status).not.toBe(0);
    const output = `${invalid.stderr}${invalid.stdout}`;
    expect(output).toContain('No functions found for hash');
  });
  
  test('locate supports hash-based selectors via --select hash:<value>', () => {
    const inventoryResult = runJsEdit([
      '--file',
      fixturePath,
      '--list-functions',
      '--json'
    ]);

    if (inventoryResult.status !== 0) {
      throw new Error(`list-functions failed: ${inventoryResult.stderr || inventoryResult.stdout}`);
    }

    const inventoryPayload = JSON.parse(inventoryResult.stdout);
    const alphaEntry = inventoryPayload.functions.find((fn) => fn.canonicalName === 'exports.alpha');
    expect(alphaEntry).toBeDefined();
    const locateResult = runJsEdit([
      '--file',
      fixturePath,
      '--locate',
      'exports.alpha',
      '--select',
      `hash:${alphaEntry.hash}`,
      '--json'
    ]);

    if (locateResult.status !== 0) {
      throw new Error(`locate with hash selector failed: ${locateResult.stderr || locateResult.stdout}`);
    }

    const locatePayload = JSON.parse(locateResult.stdout);
    expect(locatePayload.summary.matchCount).toBe(1);
    expect(locatePayload.matches[0].hash).toBe(alphaEntry.hash);
    expect(locatePayload.matches[0].canonicalName).toBe('exports.alpha');
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
  
  test('--with-file resolves snippet paths relative to the target file directory', () => {
    const inventoryResult = runJsEdit([
      '--file',
      fixturePath,
      '--list-functions',
      '--json'
    ]);

    if (inventoryResult.status !== 0) {
      throw new Error(`list-functions failed: ${inventoryResult.stderr || inventoryResult.stdout}`);
    }

    const inventoryPayload = JSON.parse(inventoryResult.stdout);
    const alphaEntry = inventoryPayload.functions.find((fn) => fn.canonicalName === 'exports.alpha');
    expect(alphaEntry).toBeDefined();

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-edit-with-file-'));
    let tempFile;
    try {
      tempFile = path.join(tempDir, path.basename(fixturePath));
      fs.copyFileSync(fixturePath, tempFile);

      const extractResult = runJsEdit([
        '--file',
        fixturePath,
        '--extract',
        'exports.alpha',
        '--json'
      ]);

      if (extractResult.status !== 0) {
        throw new Error(`extract failed while preparing with-file snippet: ${extractResult.stderr || extractResult.stdout}`);
      }

      const extractPayload = JSON.parse(extractResult.stdout);
      const originalSnippet = extractPayload.code;
      const newline = originalSnippet.includes('\r\n') ? '\r\n' : '\n';
      const replacementSnippet = originalSnippet.replace("return 'alpha';", `return 'with-file patched';`);
      expect(replacementSnippet).not.toBe(originalSnippet);
      const normalizedSnippet = replacementSnippet.endsWith(newline) ? replacementSnippet : `${replacementSnippet}${newline}`;
      const relativeSnippetName = 'alpha-replacement.js';
      const snippetPath = path.join(tempDir, relativeSnippetName);
      fs.writeFileSync(snippetPath, normalizedSnippet);

      const replaceResult = runJsEdit([
        '--file',
        tempFile,
        '--replace',
        'exports.alpha',
        '--with-file',
        relativeSnippetName,
        '--expect-hash',
        alphaEntry.hash,
        '--json',
        '--fix'
      ]);

      if (replaceResult.status !== 0) {
        throw new Error(`replace with --with-file failed: ${replaceResult.stderr || replaceResult.stdout}`);
      }

      const payload = JSON.parse(replaceResult.stdout);
      expect(payload.guard.hash.status).toBe('ok');
      const updated = fs.readFileSync(tempFile, 'utf8');
      expect(updated).toContain("return 'with-file patched';");
    } finally {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  test('locate-variable reports declarator metadata', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--locate-variable',
      'ren',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`locate-variable failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.selector).toBe('ren');
    expect(payload.targetMode).toBe('declarator');
    expect(Array.isArray(payload.matches)).toBe(true);
    expect(payload.matches).toHaveLength(1);
    expect(payload.summary).toEqual(expect.objectContaining({ matchCount: 1 }));
    expect(payload.summary.spanRange.start).toBeLessThan(payload.summary.spanRange.end);
    expect(payload.summary.spanRange.byteStart).toBeLessThan(payload.summary.spanRange.byteEnd);
    expect(payload.summary.spanRange.totalByteLength).toBeGreaterThan(0);
    const [match] = payload.matches;
    expect(match.name).toBe('ren');
    expect(match.targetMode).toBe('declarator');
    expect(match.hash).toHaveLength(8);
    expect(match.span.start).toBeLessThan(match.span.end);
    expect(match.span.byteStart).toBeLessThan(match.span.byteEnd);
    expect(match.span.byteLength).toBeGreaterThan(0);
    expect(typeof match.pathSignature === 'string').toBe(true);
  })

;

  test('extract-variable emits declarator snippet and metadata', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--extract-variable',
      'ren',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`extract-variable failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.variable).toBeDefined();
    expect(payload.variable.targetMode).toBe('declarator');
    expect(payload.variable.hash).toHaveLength(8);
    expect(payload.variable.span.start).toBeLessThan(payload.variable.span.end);
    expect(payload.code).toContain('ren, stimpy: renAlias');
    expect(payload.code.trim().endsWith('= cartoon;')).toBe(true);
  });

  test('replace-variable swaps declarator snippet with guard validation', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-edit-variable-'));
    const targetFile = path.join(tempDir, 'sample.js');
    const replacementPath = path.join(tempDir, 'replacement.js');

    try {
      fs.copyFileSync(fixturePath, targetFile);
      const originalContent = fs.readFileSync(targetFile, 'utf8');
      const crlfContent = originalContent.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
      fs.writeFileSync(targetFile, crlfContent);

      const locateResult = runJsEdit([
        '--file',
        targetFile,
        '--locate-variable',
        'ren',
        '--json'
      ]);
      if (locateResult.status !== 0) {
        throw new Error(`locate-variable (pre-replace) failed: ${locateResult.stderr || locateResult.stdout}`);
      }
      const locatePayload = JSON.parse(locateResult.stdout);
      const expectedHash = locatePayload.matches[0].hash;

      const extractResult = runJsEdit([
        '--file',
        targetFile,
        '--extract-variable',
        'ren',
        '--json'
      ]);
      if (extractResult.status !== 0) {
        throw new Error(`extract-variable (pre-replace) failed: ${extractResult.stderr || extractResult.stdout}`);
      }
      const extractPayload = JSON.parse(extractResult.stdout);
      const originalSnippet = extractPayload.code;
      const replacementSnippet = originalSnippet.replace('renAlias', 'stimpyAlias');
      if (replacementSnippet === originalSnippet) {
        throw new Error('Did not modify extracted declarator snippet as expected.');
      }
      const normalizedSnippet = replacementSnippet.endsWith('\n') ? replacementSnippet : `${replacementSnippet}\n`;
      fs.writeFileSync(replacementPath, normalizedSnippet);

      const replaceResult = runJsEdit([
        '--file',
        targetFile,
        '--replace-variable',
        'ren',
        '--expect-hash',
        expectedHash,
        '--with',
        replacementPath,
        '--json',
        '--fix'
      ]);

      if (replaceResult.status !== 0) {
        throw new Error(`replace-variable failed: ${replaceResult.stderr || replaceResult.stdout}`);
      }

      const payload = JSON.parse(replaceResult.stdout);
      expect(payload.guard.hash.status).toBe('ok');
      expect(payload.guard.result.status).toBe('changed');
      expect(payload.guard.newline.status).toBe('converted');
      expect(payload.guard.newline.file?.style).toBe('crlf');
      expect(payload.guard.newline.result?.style).toBe('crlf');
      expect(payload.guard.newline.replacement).toEqual(expect.objectContaining({
        targetStyle: 'crlf',
        converted: true,
        normalizedStyle: 'crlf'
      }));
      expect(payload.guard.newline.byteDelta).toBeGreaterThan(0);
      const updated = fs.readFileSync(targetFile, 'utf8');
      expect(updated).toContain('stimpyAlias');
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }

      const bindingTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-edit-variable-binding-'));
      const bindingTargetFile = path.join(bindingTempDir, 'sample.js');
      const bindingReplacementPath = path.join(bindingTempDir, 'binding-replacement.js');

      try {
        fs.copyFileSync(fixturePath, bindingTargetFile);

        const bindingLocateResult = runJsEdit([
          '--file',
          bindingTargetFile,
          '--locate-variable',
          'ren',
          '--variable-target',
          'binding',
          '--json'
        ]);
        if (bindingLocateResult.status !== 0) {
          throw new Error(`locate-variable binding failed: ${bindingLocateResult.stderr || bindingLocateResult.stdout}`);
        }
        const bindingLocatePayload = JSON.parse(bindingLocateResult.stdout);
        expect(bindingLocatePayload.summary.matchCount).toBe(1);
        const bindingHash = bindingLocatePayload.matches[0].hash;

        const bindingExtractResult = runJsEdit([
          '--file',
          bindingTargetFile,
          '--extract-variable',
          'ren',
          '--variable-target',
          'binding',
          '--json'
        ]);
        if (bindingExtractResult.status !== 0) {
          throw new Error(`extract-variable binding failed: ${bindingExtractResult.stderr || bindingExtractResult.stdout}`);
        }
        const bindingExtractPayload = JSON.parse(bindingExtractResult.stdout);
        const bindingSnippet = bindingExtractPayload.code;
        const bindingReplacementSnippet = bindingSnippet.replace('ren', 'hero');
        if (bindingReplacementSnippet === bindingSnippet) {
          throw new Error('Did not modify binding snippet as expected.');
        }
        fs.writeFileSync(bindingReplacementPath, bindingReplacementSnippet);

        const bindingReplaceResult = runJsEdit([
          '--file',
          bindingTargetFile,
          '--replace-variable',
          'ren',
          '--variable-target',
          'binding',
          '--expect-hash',
          bindingHash,
          '--with',
          bindingReplacementPath,
          '--json',
          '--fix'
        ]);

        if (bindingReplaceResult.status !== 0) {
          throw new Error(`replace-variable binding failed: ${bindingReplaceResult.stderr || bindingLocateResult.stdout}`);
        }

        const bindingPayload = JSON.parse(bindingReplaceResult.stdout);
        expect(bindingPayload.variable.target.resolvedMode).toBe('binding');
        expect(bindingPayload.guard.hash.status).toBe('ok');
        expect(bindingPayload.guard.result.status).toBe('changed');
        expect(bindingPayload.guard.newline.status).toBe('converted');
        expect(bindingPayload.guard.newline.file?.style).toBe('crlf');
        expect(bindingPayload.guard.newline.result?.style).toBe('crlf');
        expect(bindingPayload.guard.newline.replacement).toEqual(expect.objectContaining({
          targetStyle: 'crlf',
          converted: true,
          normalizedStyle: 'crlf'
        }));
        expect(bindingPayload.guard.newline.byteDelta).toBeGreaterThanOrEqual(0);
        const bindingUpdated = fs.readFileSync(bindingTargetFile, 'utf8');
        expect(bindingUpdated).toContain('const { hero,');
        expect(bindingUpdated).not.toContain('const { ren,');
      } finally {
        if (fs.existsSync(bindingTempDir)) {
          fs.rmSync(bindingTempDir, { recursive: true, force: true });
        }
      }

      const declarationTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-edit-variable-declaration-'));
      const declarationTargetFile = path.join(declarationTempDir, 'sample.js');
      const declarationReplacementPath = path.join(declarationTempDir, 'declaration-replacement.js');

      try {
        fs.copyFileSync(fixturePath, declarationTargetFile);

        const declarationLocateResult = runJsEdit([
          '--file',
          declarationTargetFile,
          '--locate-variable',
          'ren',
          '--variable-target',
          'declaration',
          '--json'
        ]);
        if (declarationLocateResult.status !== 0) {
          throw new Error(`locate-variable declaration failed: ${declarationLocateResult.stderr || declarationLocateResult.stdout}`);
        }
        const declarationLocatePayload = JSON.parse(declarationLocateResult.stdout);
        expect(declarationLocatePayload.summary.matchCount).toBe(1);
        const declarationHash = declarationLocatePayload.matches[0].hash;

        const declarationExtractResult = runJsEdit([
          '--file',
          declarationTargetFile,
          '--extract-variable',
          'ren',
          '--variable-target',
          'declaration',
          '--json'
        ]);
        if (declarationExtractResult.status !== 0) {
          throw new Error(`extract-variable declaration failed: ${declarationExtractResult.stderr || declarationExtractResult.stdout}`);
        }
        const declarationExtractPayload = JSON.parse(declarationExtractResult.stdout);
        const declarationSnippet = declarationExtractPayload.code;
        const declarationReplacementSnippet = declarationSnippet.replace('= cartoon;', '= cartoonArchive;');
        if (declarationReplacementSnippet === declarationSnippet) {
          throw new Error('Did not modify declaration snippet as expected.');
        }
        const normalizedDeclarationSnippet = declarationReplacementSnippet.endsWith('\n')
          ? declarationReplacementSnippet
          : `${declarationReplacementSnippet}\n`;
        fs.writeFileSync(declarationReplacementPath, normalizedDeclarationSnippet);

        const declarationReplaceResult = runJsEdit([
          '--file',
          declarationTargetFile,
          '--replace-variable',
          'ren',
          '--variable-target',
          'declaration',
          '--expect-hash',
          declarationHash,
          '--with',
          declarationReplacementPath,
          '--json',
          '--fix'
        ]);

        if (declarationReplaceResult.status !== 0) {
          throw new Error(`replace-variable declaration failed: ${declarationReplaceResult.stderr || declarationLocateResult.stdout}`);
        }

        const declarationPayload = JSON.parse(declarationReplaceResult.stdout);
        expect(declarationPayload.variable.target.resolvedMode).toBe('declaration');
        expect(declarationPayload.guard.hash.status).toBe('ok');
        expect(declarationPayload.guard.result.status).toBe('changed');
        expect(declarationPayload.guard.newline.status).toBe('converted');
        expect(declarationPayload.guard.newline.file?.style).toBe('crlf');
        expect(declarationPayload.guard.newline.result?.style).toBe('crlf');
        expect(declarationPayload.guard.newline.replacement).toEqual(expect.objectContaining({
          targetStyle: 'crlf',
          converted: true,
          normalizedStyle: 'crlf'
        }));
        expect(declarationPayload.guard.newline.byteDelta).toBeGreaterThanOrEqual(0);
        const declarationUpdated = fs.readFileSync(declarationTargetFile, 'utf8');
        expect(declarationUpdated).toContain('= cartoonArchive;');
      } finally {
        if (fs.existsSync(declarationTempDir)) {
          fs.rmSync(declarationTempDir, { recursive: true, force: true });
        }
      }
  })



;

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

  test('js-edit --help surfaces grouped guidance', () => {
    const result = runJsEdit(['--help']);
    expect(result.status).toBe(0);
    const helpOutput = `${result.stdout}${result.stderr}`;
    expect(helpOutput).toContain('Examples:');
    expect(helpOutput).toContain('Discovery commands:');
    expect(helpOutput).toContain('Guardrails and plans:');
    expect(helpOutput).toContain('Selector hints:');
    expect(helpOutput).toContain('Output controls:');
  });

  describe('js-edit CLI guardrails', () => {
    let tempDir;
    let targetFile;
    let nestedTargetFile;
    let replacementFunctionPath;
    let replacementConstPath;
    let replacementInvalidPath;
    let replacementRangePath;
    let replacementClassMethodPath;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-edit-cli-'));
      targetFile = path.join(tempDir, 'sample.js');
      nestedTargetFile = path.join(tempDir, 'nested.js');
      replacementFunctionPath = path.join(tempDir, 'replacement-function.js');
      replacementConstPath = path.join(tempDir, 'replacement-const.js');
      replacementInvalidPath = path.join(tempDir, 'replacement-invalid.js');
      replacementRangePath = path.join(tempDir, 'replacement-range.js');
      replacementClassMethodPath = path.join(tempDir, 'replacement-class-method.js');

      fs.copyFileSync(fixturePath, targetFile);
      fs.copyFileSync(nestedFixturePath, nestedTargetFile);
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
      fs.writeFileSync(
        replacementClassMethodPath,
        "  static initialize(config) {\n    return { flag: 'updated' };\n  }\n"
      );
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
      expect(planFile.matches[0].identifierSpan).toMatchObject({
        start: alphaRecord.identifierSpan.start,
        end: alphaRecord.identifierSpan.end,
        length: alphaRecord.identifierSpan.end - alphaRecord.identifierSpan.start,
        byteStart: alphaRecord.identifierSpan.byteStart,
        byteEnd: alphaRecord.identifierSpan.byteEnd,
        byteLength: alphaRecord.identifierSpan.byteEnd - alphaRecord.identifierSpan.byteStart
      });
      expect(planFile.matches[0].span).toMatchObject({
        start: alphaRecord.span.start,
        end: alphaRecord.span.end,
        length: alphaRecord.span.end - alphaRecord.span.start,
        byteStart: alphaRecord.span.byteStart,
        byteEnd: alphaRecord.span.byteEnd,
        byteLength: alphaRecord.span.byteEnd - alphaRecord.span.byteStart
      });
    })
;

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
      expect(planFile.summary.spanRange.byteStart).toBeGreaterThanOrEqual(0);
      expect(planFile.summary.spanRange.byteEnd).toBeGreaterThan(planFile.summary.spanRange.byteStart);
      expect(planFile.summary.spanRange.totalByteLength).toBeGreaterThan(0);
      
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
    })
;

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

    test('allows class method replacement when guard passes', () => {
      const methodSelector = 'exports.NewsSummary > static > initialize';
      const locate = runJsEdit([
        '--file',
        nestedTargetFile,
        '--locate',
        methodSelector,
        '--json'
      ]);

      expect(locate.status).toBe(0);
      const locatePayload = JSON.parse(locate.stdout);
      expect(locatePayload.matches).toHaveLength(1);
      const expectedHash = locatePayload.matches[0].hash;
      expect(expectedHash).toHaveLength(8);

      const replaceResult = runJsEdit([
        '--file',
        nestedTargetFile,
        '--replace',
        methodSelector,
        '--expect-hash',
        expectedHash,
        '--with',
        replacementClassMethodPath,
        '--fix',
        '--json'
      ]);

      expect(replaceResult.status).toBe(0);
      const replacePayload = JSON.parse(replaceResult.stdout);
      expect(replacePayload.guard.hash.status).toBe('ok');
      expect(replacePayload.guard.path.status).toBe('ok');
      expect(replacePayload.guard.result.after).toHaveLength(8);

      const updatedSource = fs.readFileSync(nestedTargetFile, 'utf8');
      expect(updatedSource).toContain("return { flag: 'updated' };");
      expect(updatedSource).not.toContain('return config ?? {};');
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
        end: alphaRecord.span.end,
        length: alphaRecord.span.end - alphaRecord.span.start,
        byteStart: alphaRecord.span.byteStart,
        byteEnd: alphaRecord.span.byteEnd,
        byteLength: alphaRecord.span.byteEnd - alphaRecord.span.byteStart
      });
      expect(payload.guard.span.status).toBe('ok');
      expect(payload.guard.span.expectedStart).toBe(alphaRecord.span.start);
      expect(payload.guard.span.expectedEnd).toBe(alphaRecord.span.end);
      expect(payload.guard.newline.status).toBe('converted');
      expect(payload.guard.newline.file?.style).toBe('crlf');
      expect(payload.guard.newline.result?.style).toBe('none');
      expect(payload.guard.newline.replacement).toEqual(
        expect.objectContaining({
          targetStyle: 'crlf',
          normalizedStyle: 'crlf',
          converted: true
        })
      );
      expect(payload.guard.newline.byteDelta).toBeLessThan(0);
      expect(payload.plan.newline).toEqual(
        expect.objectContaining({
          status: 'converted',
          file: expect.objectContaining({ style: 'crlf' })
        })
      );
      expect(payload.plan.newline.result?.style).toBe('none');
      expect(fs.existsSync(planPath)).toBe(true);
      const planFile = JSON.parse(fs.readFileSync(planPath, 'utf8'));
      expect(planFile.matches[0].expectedHash).toBe(expectedHash);
      expect(planFile.matches[0].pathSignature).toBe('module.body[0].ExportDeclaration.declaration.FunctionDeclaration.FunctionDeclaration');
      expect(planFile.matches[0].identifierSpan).toMatchObject({
        start: alphaRecord.identifierSpan.start,
        end: alphaRecord.identifierSpan.end,
        length: alphaRecord.identifierSpan.end - alphaRecord.identifierSpan.start,
        byteStart: alphaRecord.identifierSpan.byteStart,
        byteEnd: alphaRecord.identifierSpan.byteEnd,
        byteLength: alphaRecord.identifierSpan.byteEnd - alphaRecord.identifierSpan.byteStart
      });
      expect(planFile.matches[0].expectedSpan).toMatchObject({
        start: alphaRecord.span.start,
        end: alphaRecord.span.end,
        length: alphaRecord.span.end - alphaRecord.span.start,
        byteStart: alphaRecord.span.byteStart,
        byteEnd: alphaRecord.span.byteEnd,
        byteLength: alphaRecord.span.byteEnd - alphaRecord.span.byteStart
      });
      expect(planFile.newline).toEqual(
        expect.objectContaining({
          status: 'converted',
          file: expect.objectContaining({ style: 'crlf' })
        })
      );
      expect(planFile.newline.result?.style).toBe('none');
      expect(planFile.newline.replacement).toEqual(
        expect.objectContaining({
          targetStyle: 'crlf',
          normalizedStyle: 'crlf',
          converted: true
        })
      );
      expect(planFile.newline.byteDelta).toBeLessThan(0);
    })

;

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

  describe('js-edit --with-code inline code', () => {
    let tempDir;
    let targetFile;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-edit-with-code-'));
      targetFile = path.join(tempDir, 'sample.js');
      fs.copyFileSync(fixturePath, targetFile);
    });

    afterEach(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('--with-code replaces with inline string (basic variable)', () => {
      // Note: code should be VALID REPLACEMENT for the declarator binding part
      // Original: const { ren, stimpy: renAlias } = cartoon;
      // Becomes:  const { heroName, sidekick: heroAlias } = sources;
      const code = '{ heroName, sidekick: heroAlias } = sources';
      const result = runJsEdit([
        '--file',
        targetFile,
        '--locate-variable',
        'ren',
        '--json'
      ]);

      if (result.status !== 0) {
        throw new Error(`locate-variable failed: ${result.stderr}`);
      }

      const locatePayload = JSON.parse(result.stdout);
      const expectedHash = locatePayload.matches[0].hash;

      const replaceResult = runJsEdit([
        '--file',
        targetFile,
        '--replace-variable',
        'ren',
        '--with-code',
        code,
        '--expect-hash',
        expectedHash,
        '--json',
        '--fix'
      ]);

      expect(replaceResult.status).toBe(0);
      const replacePayload = JSON.parse(replaceResult.stdout);
      expect(replacePayload.applied).toBe(true);
      expect(replacePayload.guard.result.status).toBe('changed');

      const updated = fs.readFileSync(targetFile, 'utf8');
      expect(updated).toContain('{ heroName, sidekick: heroAlias } = sources');
    });

    test('--with-code handles escaped double quotes', () => {
      const code = 'const msg = \\"hello world\\";';
      const result = runJsEdit([
        '--file',
        targetFile,
        '--locate-variable',
        'sequence',
        '--variable-target',
        'declaration',
        '--json'
      ]);

      if (result.status !== 0) {
        throw new Error(`locate-variable failed: ${result.stderr}`);
      }

      const locatePayload = JSON.parse(result.stdout);
      const expectedHash = locatePayload.matches[0].hash;

      const replaceResult = runJsEdit([
        '--file',
        targetFile,
        '--replace-variable',
        'sequence',
        '--variable-target',
        'declaration',
        '--with-code',
        code,
        '--expect-hash',
        expectedHash,
        '--json',
        '--fix'
      ]);

      expect(replaceResult.status).toBe(0);
      const updated = fs.readFileSync(targetFile, 'utf8');
      expect(updated).toContain('const msg = "hello world";');
      expect(updated).not.toContain('\\"hello world\\"');
    })
;

    test('--with-code handles escaped backslashes (Windows paths)', () => {
      const code = 'const filePath = \\"C:\\\\Users\\\\file.js\\";';
      const result = runJsEdit([
        '--file',
        targetFile,
        '--locate-variable',
        'sequence',
        '--variable-target',
        'declaration',
        '--json'
      ]);

      if (result.status !== 0) {
        throw new Error(`locate-variable failed: ${result.stderr}`);
      }

      const locatePayload = JSON.parse(result.stdout);
      const expectedHash = locatePayload.matches[0].hash;

      const replaceResult = runJsEdit([
        '--file',
        targetFile,
        '--replace-variable',
        'sequence',
        '--variable-target',
        'declaration',
        '--with-code',
        code,
        '--expect-hash',
        expectedHash,
        '--json',
        '--fix'
      ]);

      expect(replaceResult.status).toBe(0);
      const updated = fs.readFileSync(targetFile, 'utf8');
      expect(updated).toContain('C:\\Users\\file.js');
      expect(updated).not.toContain('C:\\\\\\\\Users');
    })
;

    test('--with-code rejects when both --with and --with-code provided', () => {
      const code = 'const x = 1;';
      const result = runJsEdit([
        '--file',
        targetFile,
        '--replace-variable',
        'ren',
        '--with',
        'dummy.js',
        '--with-code',
        code
      ]);

      expect(result.status).not.toBe(0);
      const output = `${result.stderr}${result.stdout}`;
      expect(output).toContain('Cannot supply both --with/--with-file and --with-code');
    });

    test('--with-code rejects invalid JavaScript syntax', () => {
      const code = 'const x = {';  // Incomplete object literal
      const result = runJsEdit([
        '--file',
        targetFile,
        '--replace-variable',
        'ren',
        '--with-code',
        code,
        '--json'
      ]);

      expect(result.status).not.toBe(0);
      const output = `${result.stderr}${result.stdout}`;
      expect(output).toContain('Replacement produced invalid JavaScript');
    });

    test('--with-code ensures trailing newline', () => {
      const code = 'const x = 1;';  // No trailing newline
      const result = runJsEdit([
        '--file',
        targetFile,
        '--replace-variable',
        'ren',
        '--variable-target',
        'declaration',
        '--with-code',
        code,
        '--json',
        '--fix'
      ]);

      expect(result.status).toBe(0);
      const updated = fs.readFileSync(targetFile, 'utf8');
      // Should contain the code with newline preserved/normalized
      expect(updated).toContain('const x = 1;');
    })
;

    test('--with-code supports multi-statement code', () => {
      const code = 'const a = 1; const b = 2;';
      const result = runJsEdit([
        '--file',
        targetFile,
        '--locate-variable',
        'ren',
        '--variable-target',
        'declaration',
        '--json'
      ]);

      if (result.status !== 0) {
        throw new Error(`locate-variable failed: ${result.stderr}`);
      }

      const locatePayload = JSON.parse(result.stdout);
      const expectedHash = locatePayload.matches[0].hash;

      const replaceResult = runJsEdit([
        '--file',
        targetFile,
        '--replace-variable',
        'ren',
        '--variable-target',
        'declaration',
        '--with-code',
        code,
        '--expect-hash',
        expectedHash,
        '--json',
        '--fix'
      ]);

      expect(replaceResult.status).toBe(0);
      const updated = fs.readFileSync(targetFile, 'utf8');
      expect(updated).toContain('const a = 1; const b = 2;');
    })
;

    test('--with-code works with --replace (functions)', () => {
      const newFunc = 'function alpha() { return "updated"; }';
      const result = runJsEdit([
        '--file',
        targetFile,
        '--locate',
        'exports.alpha',
        '--json'
      ]);

      if (result.status !== 0) {
        throw new Error(`locate failed: ${result.stderr}`);
      }

      const locatePayload = JSON.parse(result.stdout);
      const expectedHash = locatePayload.matches[0].hash;

      const replaceResult = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--with-code',
        newFunc,
        '--expect-hash',
        expectedHash,
        '--json',
        '--fix'
      ]);

      expect(replaceResult.status).toBe(0);
      const updated = fs.readFileSync(targetFile, 'utf8');
      expect(updated).toContain('"updated"');
      expect(updated).toContain('function alpha()');
    })
;

    test('--with-code rejects empty code', () => {
      const result = runJsEdit([
        '--file',
        targetFile,
        '--replace-variable',
        'ren',
        '--with-code',
        ''
      ]);

      expect(result.status).not.toBe(0);
      const output = `${result.stderr}${result.stdout}`;
      expect(output).toContain('--with-code requires non-empty code');
    });

    test('--with-code shows diff without --fix (dry-run)', () => {
      const code = 'const { helper } = require("../new/path");';
      const result = runJsEdit([
        '--file',
        targetFile,
        '--locate-variable',
        'ren',
        '--variable-target',
        'declaration',
        '--json'
      ]);

      if (result.status !== 0) {
        throw new Error(`locate-variable failed: ${result.stderr}`);
      }

      const locatePayload = JSON.parse(result.stdout);
      const expectedHash = locatePayload.matches[0].hash;

      const dryRunResult = runJsEdit([
        '--file',
        targetFile,
        '--replace-variable',
        'ren',
        '--variable-target',
        'declaration',
        '--with-code',
        code,
        '--expect-hash',
        expectedHash,
        '--emit-diff',
        '--json'
      ]);

      expect(dryRunResult.status).toBe(0);
      const payload = JSON.parse(dryRunResult.stdout);
      expect(payload.diff).toBeDefined();
      expect(payload.diff.after).toContain('../new/path');
      expect(payload.applied).toBe(false);

      // File should not be modified
      const content = fs.readFileSync(targetFile, 'utf8');
      expect(content).not.toContain('../new/path');
    })
;

    test('--with-code requires --replace or --replace-variable', () => {
      const code = 'const x = 1;';
      const result = runJsEdit([
        '--file',
        targetFile,
        '--with-code',
        code
      ]);

      expect(result.status).not.toBe(0);
      const output = `${result.stderr}${result.stdout}`;
      expect(output).toContain('Provide one of --list-functions');
    })
;
  });

  describe('Discovery filters (--match, --exclude)', () => {
    test('--match filters list-functions by glob pattern', () => {
      const result = runJsEdit([
        '--file',
        fixturePath,
        '--list-functions',
        '--match',
        'exports.*',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.functions.length).toBeGreaterThan(0);
      payload.functions.forEach((fn) => {
        expect(fn.canonicalName).toMatch(/^exports\./);
      });
    });

    test('--exclude filters out matching patterns', () => {
      const result = runJsEdit([
        '--file',
        fixturePath,
        '--list-functions',
        '--exclude',
        '*alpha*',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      payload.functions.forEach((fn) => {
        expect(fn.canonicalName).not.toContain('alpha');
        expect(fn.name).not.toContain('alpha');
      });
    });

    test('--match and --exclude can be combined', () => {
      const result = runJsEdit([
        '--file',
        fixturePath,
        '--list-functions',
        '--match',
        'exports.*',
        '--exclude',
        '*default*',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      payload.functions.forEach((fn) => {
        expect(fn.canonicalName).toMatch(/^exports\./);
        expect(fn.canonicalName).not.toContain('default');
      });
    });

    test('glob patterns support wildcards (* and ?)', () => {
      const result = runJsEdit([
        '--file',
        fixturePath,
        '--list-functions',
        '--match',
        '*a?pha*',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      const alphaFn = payload.functions.find((fn) => fn.name === 'alpha');
      expect(alphaFn).toBeDefined();
    });

    test('filters work with list-variables', () => {
      const result = runJsEdit([
        '--file',
        fixturePath,
        '--list-variables',
        '--match',
        'exports.*',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      payload.variables.forEach((v) => {
        expect(v.canonicalName).toMatch(/^exports\./);
      });
    });
  });

  describe('Position-based lookup (--snipe)', () => {
    test('--snipe finds symbol at line:column position', () => {
      const result = runJsEdit([
        '--file',
        fixturePath,
        '--snipe',
        '1:8',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.symbol).toBeDefined();
      expect(payload.symbol.type).toBe('function');
      expect(payload.symbol.canonicalName).toBe('exports.alpha');
      expect(payload.symbol.hash).toHaveLength(8);
    });

    test.skip('--snipe accepts byte offset with @ prefix', () => {
      const alpha = functions.find((fn) => fn.name === 'alpha');
      const bytePos = alpha.span.start + 10;

      const result = runJsEdit([
        '--file',
        fixturePath,
        '--snipe',
        `@${bytePos}`,
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.symbol).toBeDefined();
      expect(payload.symbol.canonicalName).toBe('exports.alpha');
    });

    test('--snipe returns minimal output for no match', () => {
      const result = runJsEdit([
        '--file',
        fixturePath,
        '--snipe',
        '999:999',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.matches).toEqual([]);
    });

    test('--snipe rejects invalid position format', () => {
      const result = runJsEdit([
        '--file',
        fixturePath,
        '--snipe',
        'invalid'
      ]);

      expect(result.status).not.toBe(0);
      const output = `${result.stderr}${result.stdout}`;
      expect(output).toContain('Invalid position');
    });
  });

  describe('Top-level outline (--outline)', () => {
    test('--outline shows only top-level symbols', () => {
      const result = runJsEdit([
        '--file',
        fixturePath,
        '--outline',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.symbols).toBeDefined();
      expect(payload.totalSymbols).toBeGreaterThan(0);
      expect(payload.topLevelSymbols).toBeGreaterThan(0);
      expect(payload.topLevelSymbols).toBeLessThan(payload.totalSymbols);
    });

    test('--outline produces compact table output', () => {
      const result = runJsEdit([
        '--file',
        fixturePath,
        '--outline'
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Symbol Outline');
      expect(result.stdout).toMatch(/index.*type.*name/);
      expect(result.stdout).toContain('Top-level symbols');
    });

    test('--outline respects --match and --exclude filters', () => {
      const result = runJsEdit([
        '--file',
        fixturePath,
        '--list-functions',
        '--match',
        'exports.*',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.functions.length).toBeGreaterThan(0);
      payload.functions.forEach((fn) => {
        expect(fn.canonicalName).toMatch(/^exports\./);
      });
    });
  });

  describe('Unified diff preview (--preview-edit)', () => {
    let targetFile;

    beforeEach(() => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-edit-diff-'));
      targetFile = path.join(tempDir, 'test.js');
      fs.writeFileSync(targetFile, source);
    });

    afterEach(() => {
      if (targetFile && fs.existsSync(targetFile)) {
        const dir = path.dirname(targetFile);
        fs.unlinkSync(targetFile);
        // Clean up any remaining files in temp dir
        const files = fs.readdirSync(dir);
        files.forEach(file => fs.unlinkSync(path.join(dir, file)));
        fs.rmdirSync(dir);
      }
    });

    test.skip('--preview-edit generates unified diff for replacement', () => {
      const alpha = functions.find((fn) => fn.name === 'alpha');
      const replacement = "export function alpha() {\n  return 'modified';\n}\n";
      const replacementFile = path.join(path.dirname(targetFile), 'replacement.js');
      fs.writeFileSync(replacementFile, replacement);

      const result = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--with',
        replacementFile,
        '--expect-hash',
        alpha.hash,
        '--emit-diff',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.diff).toBeDefined();
      expect(payload.applied).toBe(false);

      fs.unlinkSync(replacementFile);
    });

    test.skip('--preview-edit shows context lines', () => {
      const alpha = functions.find((fn) => fn.name === 'alpha');
      const replacement = "export function alpha() {\n  return 'changed';\n}\n";
      const replacementFile = path.join(path.dirname(targetFile), 'replacement.js');
      fs.writeFileSync(replacementFile, replacement);

      const result = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--with',
        replacementFile,
        '--expect-hash',
        alpha.hash,
        '--emit-diff'
      ]);

      expect(result.status).toBe(0);
      const output = result.stdout;
      expect(output).toContain('Diff Preview');

      fs.unlinkSync(replacementFile);
    });

    test.skip('--preview-edit works without --fix (dry-run)', () => {
      const alpha = functions.find((fn) => fn.name === 'alpha');
      const replacement = "export function alpha() {\n  return 'preview';\n}\n";
      const replacementFile = path.join(path.dirname(targetFile), 'replacement.js');
      fs.writeFileSync(replacementFile, replacement);

      const result = runJsEdit([
        '--file',
        targetFile,
        '--replace',
        'exports.alpha',
        '--with',
        replacementFile,
        '--expect-hash',
        alpha.hash,
        '--emit-diff'
      ]);

      expect(result.status).toBe(0);

      // File should not be modified
      const content = fs.readFileSync(targetFile, 'utf8');
      expect(content).not.toContain('preview');

      fs.unlinkSync(replacementFile);
    });
  });

  describe('Constructor listing (--list-constructors)', () => {
    test('--list-constructors shows explicit constructors with hashes', () => {
      const classFixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-nested-classes.js');
      const result = runJsEdit([
        '--file',
        classFixturePath,
        '--list-constructors',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.constructors.length).toBeGreaterThan(0);

      const withExplicit = payload.constructors.find((c) => c.kind === 'explicit');
      if (withExplicit) {
        expect(withExplicit.hash).toHaveLength(8);
        expect(withExplicit.params).toBeDefined();
      }
    });

    test('--list-constructors shows implicit constructors', () => {
      const classFixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-nested-classes.js');
      const result = runJsEdit([
        '--file',
        classFixturePath,
        '--list-constructors',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);

      const implicit = payload.constructors.find((c) => c.kind === 'implicit');
      if (implicit) {
        expect(implicit.hash).toBeNull();
        expect(implicit.params).toBe('(implicit)');
      }
    });

    test('--list-constructors includes extends/implements heritage', () => {
      const testFile = path.join(os.tmpdir(), 'test-constructor-heritage.js');
      const testCode = `
export class Base {
  constructor(name) {
    this.name = name;
  }
}

export class Derived extends Base {
  constructor(name, value) {
    super(name);
    this.value = value;
  }
}
`;
      fs.writeFileSync(testFile, testCode);

      const result = runJsEdit([
        '--file',
        testFile,
        '--list-constructors',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      const derived = payload.constructors.find((c) => c.class.name === 'Derived');
      expect(derived).toBeDefined();
      expect(derived.class.extends).toBe('Base');

      fs.unlinkSync(testFile);
    });

    test('--list-constructors respects --filter-text', () => {
      const classFixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-nested-classes.js');
      const result = runJsEdit([
        '--file',
        classFixturePath,
        '--list-constructors',
        '--filter-text',
        'Widget',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      payload.constructors.forEach((c) => {
        const matchesFilter = 
          c.className.includes('Widget') ||
          c.canonicalName.includes('Widget') ||
          (c.extends && c.extends.includes('Widget'));
        expect(matchesFilter).toBe(true);
      });
    });

    test('--list-constructors supports --match and --exclude filters', () => {
      const classFixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-nested-classes.js');
      const result = runJsEdit([
        '--file',
        classFixturePath,
        '--list-constructors',
        '--match',
        'exports.*',
        '--json'
      ]);

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.constructors.length).toBeGreaterThan(0);
      payload.constructors.forEach((c) => {
        expect(c.class.canonicalName).toMatch(/exports/);
      });
    });

    test('--list-constructors --include-internals shows non-exported classes', () => {
      const testFile = path.join(os.tmpdir(), 'test-internal-class.js');
      const testCode = `
export class PublicWidget {
  constructor() {}
}

class InternalHelper {
  constructor() {}
}
`;
      fs.writeFileSync(testFile, testCode);

      const resultWithout = runJsEdit([
        '--file',
        testFile,
        '--list-constructors',
        '--json'
      ]);

      expect(resultWithout.status).toBe(0);
      const payloadWithout = JSON.parse(resultWithout.stdout);
      const internalWithout = payloadWithout.constructors.find((c) => c.class.name === 'InternalHelper');
      expect(internalWithout).toBeUndefined();

      const resultWith = runJsEdit([
        '--file',
        testFile,
        '--list-constructors',
        '--include-internals',
        '--json'
      ]);

      expect(resultWith.status).toBe(0);
      const payloadWith = JSON.parse(resultWith.stdout);
      const internalWith = payloadWith.constructors.find((c) => c.class.name === 'InternalHelper');
      expect(internalWith).toBeDefined();
      expect(internalWith.class.internal).toBe(true);

      fs.unlinkSync(testFile);
    });

    test('--list-constructors verbose output shows table format', () => {
      const classFixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-nested-classes.js');
      const result = runJsEdit([
        '--file',
        classFixturePath,
        '--list-constructors',
        '--list-output',
        'verbose'
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Constructor Inventory');
      expect(result.stdout).toContain('index │');
      expect(result.stdout).toMatch(/hash/);
    });
  });
});
