'use strict';

const {
  requiresOf, classifyRequire, outboundTargets, hasDynamicRequire, classifyFile, clusterOf
} = require('../extraction-endpoint');

const F = 'src/core/crawler/gazetteer/Ingestor.js';

describe('requiresOf', () => {
  test('finds both quote styles and ignores the rest of the line', () => {
    expect(requiresOf(`const a = require('./x'); const b = require("../y").z;`))
      .toEqual(['./x', '../y']);
  });

  test('a computed require yields no literal — and is NOT guessed at', () => {
    // The alternative is inventing a target, which would show up as a
    // confident wrong anchor. Reported separately instead.
    const body = 'const m = require(name);';
    expect(requiresOf(body)).toEqual([]);
    expect(hasDynamicRequire(body)).toBe(true);
  });

  test('a plain literal require is not mistaken for a dynamic one', () => {
    expect(hasDynamicRequire(`require('./x')`)).toBe(false);
  });
});

describe('classifyRequire', () => {
  test('sibling packages resolve from either repo, so they never anchor', () => {
    expect(classifyRequire('news-crawler-db', F)).toBe('sibling');
    expect(classifyRequire('news-crawler-itself/politeness', F)).toBe('sibling');
  });

  test('npm bare specifiers never anchor', () => {
    expect(classifyRequire('cheerio', F)).toBe('npm');
    // A package whose name merely STARTS like a sibling is not one.
    expect(classifyRequire('news-crawler-database', F)).toBe('npm');
  });

  test('relative requires staying inside the scope are internal', () => {
    // F sits at src/core/crawler/gazetteer/, so ONE `..` reaches the scope root.
    expect(classifyRequire('./Helper', F)).toBe('internal');
    expect(classifyRequire('../NewsCrawler', F)).toBe('internal');
  });

  test('a relative require escaping the scope is OUT — that is the anchor', () => {
    // Three `..` from gazetteer/ lands on src/, hence src/shared/...
    expect(classifyRequire('../../../shared/utils/pipelines', F)).toBe('OUT');
  });

  test('one level too far is already OUT — src/core is not the scope', () => {
    // The boundary is src/core/crawler, NOT src/core. Worth pinning: the check
    // that owns this ratchet excludes src/core/{orchestration,pipelines,queue}
    // by design, and four HARD anchors point at src/core/orchestration.
    expect(classifyRequire('../../NewsCrawler', F)).toBe('OUT');
  });

  test('the scope root itself counts as internal, not OUT', () => {
    expect(classifyRequire('..', 'src/core/crawler/a/b.js')).toBe('internal');
  });
});

describe('outboundTargets', () => {
  test('normalises to repo-relative paths and de-duplicates', () => {
    const body = `require('../../../shared/utils/pipelines');
                  require('../../../shared/utils/pipelines');
                  require('./Local'); require('cheerio');`;
    expect(outboundTargets(body, F)).toEqual(['src/shared/utils/pipelines']);
  });
});

describe('classifyFile', () => {
  const proven = new Set(['src/shared/utils/outputVerbosity']);

  test('no out-of-scope requires is portable', () => {
    expect(classifyFile([], proven).kind).toBe('portable');
  });

  test('a target an extracted file already survived is soft, not a blocker', () => {
    expect(classifyFile(['src/shared/utils/outputVerbosity'], proven).kind).toBe('soft');
  });

  test('an unproven target is HARD and is named', () => {
    const r = classifyFile(['src/services/NewsWebsiteService'], proven);
    expect(r.kind).toBe('HARD');
    expect(r.hard).toEqual(['src/services/NewsWebsiteService']);
  });

  test('ONE unproven target among proven ones still makes it HARD', () => {
    // The blocker is the unresolved dependency, not the ratio.
    const r = classifyFile(['src/shared/utils/outputVerbosity', 'src/services/X'], proven);
    expect(r.kind).toBe('HARD');
    expect(r.hard).toEqual(['src/services/X']);
  });

  test('an empty proven set makes every anchored file HARD — the raw rule', () => {
    // This is exactly what --accept measures against the 108 known departures,
    // and it must NOT read zero: a 0% false rate would mean the proven set had
    // been fitted to its own test.
    expect(classifyFile(['anything'], new Set()).kind).toBe('HARD');
  });
});

describe('clusterOf', () => {
  test('groups anchors into the areas a boundary ruling would cover', () => {
    expect(clusterOf('src/intelligence/planner/PlannerHost')).toBe('intelligence');
    expect(clusterOf('src/services/NewsWebsiteService')).toBe('app services');
    expect(clusterOf('src/core/orchestration/SequenceRunner')).toBe('orchestration');
    expect(clusterOf('src/data/db/sqlite')).toBe('db & storage');
    expect(clusterOf('src/db/dbAccess')).toBe('db & storage');
    expect(clusterOf('src/shared/utils/pipelines')).toBe('shared utils');
    expect(clusterOf('tools/crawl/lib/fleet-host-resolver')).toBe('tools & labs');
    expect(clusterOf('src/crawl')).toBe('legacy crawl');
  });

  test('an unrecognised target is `other`, never silently dropped', () => {
    expect(clusterOf('src/somewhere/new')).toBe('other');
  });
});
