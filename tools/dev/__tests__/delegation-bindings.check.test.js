'use strict';

const { unwrappedBindings, isMisbound, stripNonCode, IS_TEST } = require('../checks/delegation-bindings.check');

describe('IS_TEST — test files are excluded, deliberately', () => {
  // The check catches what the SUITE cannot see. A misbinding in a test file is
  // exercised by that test and turns it red at once (51 scheduler tests did),
  // so scanning tests adds no coverage — only false positives from fixtures
  // that spell the wrong form out on purpose.
  test.each([
    'tools/dev/__tests__/x.check.test.js',
    'tests/crawler/y.test.js',
    'src/core/crawler/__tests__/z.js'
  ])('excluded: %s', (p) => {
    expect(IS_TEST.test(p) || p.endsWith('.test.js')).toBe(true);
  });

  test.each([
    'src/core/crawler/services/groups/ProcessingServices.js',
    'src/core/crawler/CrawlerServiceWiring.js',
    'tools/dev/checks/delegation-bindings.check.js'
  ])('still scanned: %s', (p) => {
    expect(IS_TEST.test(p) || p.endsWith('.test.js')).toBe(false);
  });

  test('a directory merely CONTAINING "test" is not excluded', () => {
    // `contest/`, `latest/` etc. must not fall out of coverage on a substring.
    expect(IS_TEST.test('src/contest/thing.js')).toBe(false);
    expect(IS_TEST.test('src/latest/thing.js')).toBe(false);
  });
});

describe('stripNonCode — a check must not report its own fixtures', () => {
  // This check flagged ITSELF on its first tracked run: the wrong form appears
  // in its own header comment and in this file's template literals. It looked
  // clean beforehand only because `git ls-files` cannot see untracked files.
  const REQ = "const X = require('news-crawler-itself/thing');";

  test('a binding inside a BLOCK comment is not code', () => {
    expect(unwrappedBindings(`/**\n * ${REQ}\n */\n`)).toEqual([]);
  });

  test('a binding inside a LINE comment is not code', () => {
    expect(unwrappedBindings(`// ${REQ}\n`)).toEqual([]);
  });

  test('a binding inside a TEMPLATE LITERAL is not code — that is where fixtures live', () => {
    expect(unwrappedBindings('const body = `' + REQ + '`;')).toEqual([]);
  });

  test('but a REAL binding is still caught — the fix must not just silence it', () => {
    expect(unwrappedBindings(`/* ${REQ} */\n${REQ}`))
      .toEqual([{ name: 'X', spec: 'news-crawler-itself/thing', line: 2 }]);
  });

  test('line numbers survive stripping, so the report still points at the right line', () => {
    expect(unwrappedBindings(`// pad\n/* a\n b\n c */\n${REQ}`)[0].line).toBe(5);
  });

  test('a URL in a string is not mistaken for a line comment', () => {
    // `//` inside http:// must not blank the rest of the line.
    expect(unwrappedBindings(`const u = 'http://x.test';\n${REQ}`)).toHaveLength(1);
  });

  test('stripNonCode preserves total line count', () => {
    const src = `/* a\nb */\n// c\nreal();`;
    expect(stripNonCode(src).split('\n').length).toBe(src.split('\n').length);
  });
});

describe('unwrappedBindings', () => {
  test('finds a single-identifier binding of a sibling package', () => {
    const b = unwrappedBindings(`const FetchPipeline = require('news-crawler-itself/fetch-pipeline');`);
    expect(b).toEqual([{ name: 'FetchPipeline', spec: 'news-crawler-itself/fetch-pipeline', line: 1 }]);
  });

  test('a DESTRUCTURED binding is never reported — it is correct by construction', () => {
    expect(unwrappedBindings(`const { FetchPipeline } = require('news-crawler-itself/fetch-pipeline');`))
      .toEqual([]);
  });

  test('let and var count too', () => {
    expect(unwrappedBindings(`let A = require('news-crawler-db');`)).toHaveLength(1);
    expect(unwrappedBindings(`var B = require('news-crawler-itself');`)).toHaveLength(1);
  });

  test('non-sibling requires are out of scope', () => {
    const body = `const cheerio = require('cheerio');
                  const local = require('./thing');
                  const nope = require('news-crawler-database');`;
    expect(unwrappedBindings(body)).toEqual([]);
  });

  test('reports the line number, because the message has to be actionable', () => {
    const body = `'use strict';\n\n\nconst X = require('news-crawler-itself/x');`;
    expect(unwrappedBindings(body)[0].line).toBe(4);
  });
});

describe('isMisbound', () => {
  class Thing {}

  test('a bag that HAS the name is the defect', () => {
    expect(isMisbound({ FetchPipeline: Thing, other: 1 }, 'FetchPipeline')).toBe(true);
  });

  test('a module that IS the thing is correct unwrapped', () => {
    // module.exports = CrawlScheduler — the unwrapped binding is right here, and
    // flagging it would train people to ignore the check.
    expect(isMisbound(Thing, 'CrawlScheduler')).toBe(false);
  });

  test('a bag WITHOUT that name is not this defect', () => {
    // Could be an aliased import of the whole module. Not our business.
    expect(isMisbound({ a: 1 }, 'Something')).toBe(false);
  });

  test('primitives and null do not throw', () => {
    for (const v of [null, undefined, 42, 'str']) expect(isMisbound(v, 'X')).toBe(false);
  });

  test('an inherited key does not count — own properties only', () => {
    const proto = { Inherited: 1 };
    expect(isMisbound(Object.create(proto), 'Inherited')).toBe(false);
  });
});
