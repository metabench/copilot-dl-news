'use strict';

const { unwrappedBindings, isMisbound } = require('../checks/delegation-bindings.check');

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
