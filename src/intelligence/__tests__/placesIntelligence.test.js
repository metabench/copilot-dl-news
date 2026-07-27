'use strict';

/**
 * Unit tests for the placesIntelligence.js bridge. All seams are injected
 * (importer, gazetteerAccess, createDbAdapter, engine) so these run with NO real
 * module, NO real DB — fast + deterministic. They lock the CONTRACT (crash-proof
 * guards, loud-fail loader, async-construct/sync-call shape), not the module's
 * detection quality (that is measured by tools/intelligence/places-intel-diff.js).
 */

const {
  MODULE_VERDICTS, TIERS, DEFAULT_MIN_CONFIDENCE,
  importPlacesIntelligence, gazetteerAccessFromDbPath,
  createPlacesEngine, findPlacesInText, findPlacesInUrl, filterPlaceMatches,
} = require('../placesIntelligence.js');

// A stub Places_Engine matching the module's public shape.
function stubEngine(overrides = {}) {
  return {
    find_in_text: (text) => ({ module: 'places', processing_time_ms: 1, confidence: 0.8, results: [{ place_id: 21, matched_name: 'London', canonical_name: 'London', place_kind: 'city', verdict: 'place', confidence: 0.9 }] }),
    find_in_url: (url) => ({ module: 'places', processing_time_ms: 1, confidence: 0.7, results: { best_chain: [{ canonical_name: 'London' }], all_matches: [], topic_segments: ['news'] } }),
    stats: () => ({ total_names: 42, languages: 3 }),
    ...overrides,
  };
}
// A stub module namespace whose create_places_engine returns a stub engine.
function stubModule(engine = stubEngine()) {
  return { create_places_engine: async (_access, _opts) => engine, create_places_engine_from_reader: async () => engine };
}

describe('placesIntelligence pure helpers', () => {
  test('MODULE_VERDICTS and TIERS are frozen with the module taxonomy', () => {
    expect(MODULE_VERDICTS).toEqual(['place', 'not_place', 'uncertain']);
    expect(TIERS).toEqual(['tier1', 'tier2', 'all']);
    expect(Object.isFrozen(MODULE_VERDICTS)).toBe(true);
    expect(Object.isFrozen(TIERS)).toBe(true);
  });
});

describe('filterPlaceMatches (cycle-84 precision post-filter)', () => {
  const P = (name, conf) => ({ place_id: 1, matched_name: name, canonical_name: name.toUpperCase(), confidence: conf });
  test('drops function-word homographs by lowercased surface form (default stop set)', () => {
    const out = filterPlaceMatches([P('It', 0.80), P('and', 0.55), P('London', 1.0), P('El', 0.9)]);
    expect(out.map((m) => m.matched_name)).toEqual(['London']); // It/and/El are stop words even at high conf
  });
  test('drops matches below the confidence floor', () => {
    const out = filterPlaceMatches([P('Cairo', 0.85), P('Police', 0.70), P('Aš', 0.55)]);
    expect(out.map((m) => m.matched_name)).toEqual(['Cairo']); // 0.70/0.55 < 0.75 default
  });
  test('keeps a real place that clears both levers', () => {
    expect(filterPlaceMatches([P('London', 1.0)])).toHaveLength(1);
  });
  test('respects a custom minConfidence and stopWords', () => {
    expect(filterPlaceMatches([P('Police', 0.70)], { minConfidence: 0.6 })).toHaveLength(1);
    expect(filterPlaceMatches([P('London', 1.0)], { stopWords: ['london'] })).toHaveLength(0);
  });
  test('non-array input yields empty', () => {
    expect(filterPlaceMatches(null)).toEqual([]);
    expect(DEFAULT_MIN_CONFIDENCE).toBeGreaterThan(0.5);
  });
});

describe('findPlacesInText with opt-in filter', () => {
  const engineWith = (results) => ({ find_in_text: () => ({ module: 'places', processing_time_ms: 1, confidence: 0.5, results }) });
  test('filter:true applies defaults and records raw_count', () => {
    const eng = engineWith([{ place_id: 1, matched_name: 'and', canonical_name: 'AND', confidence: 0.55 }, { place_id: 2, matched_name: 'Paris', canonical_name: 'Paris', confidence: 0.9 }]);
    const r = findPlacesInText(eng, 'text', { filter: true });
    expect(r.results.map((m) => m.matched_name)).toEqual(['Paris']);
    expect(r.raw_count).toBe(2);
  });
  test('no filter returns raw results unchanged', () => {
    const eng = engineWith([{ place_id: 1, matched_name: 'and', canonical_name: 'AND', confidence: 0.55 }]);
    expect(findPlacesInText(eng, 'text').results).toHaveLength(1);
  });
});

describe('importPlacesIntelligence (loader)', () => {
  test('falls back to the second candidate when the first import throws', async () => {
    const seen = [];
    const importer = async (spec) => { seen.push(spec); if (seen.length === 1) throw new Error('not installed'); return stubModule(); };
    const mod = await importPlacesIntelligence({ importer, candidates: ['pkg', 'file://dist'] });
    expect(typeof mod.create_places_engine).toBe('function');
    expect(seen).toEqual(['pkg', 'file://dist']);
  });

  test('throws LOUD when no candidate yields a usable module', async () => {
    const importer = async () => { throw new Error('boom'); };
    await expect(importPlacesIntelligence({ importer, candidates: ['a', 'b'] }))
      .rejects.toThrow(/Unable to import news-crawler-places-intelligence/);
  });

  test('rejects a module lacking create_places_engine', async () => {
    const importer = async () => ({ nope: true });
    await expect(importPlacesIntelligence({ importer, candidates: ['a'] })).rejects.toThrow(/Unable to import/);
  });
});

describe('findPlacesInText guards (crash-proof)', () => {
  test('null/invalid engine returns synthetic empty with error', () => {
    const r = findPlacesInText(null, 'London');
    expect(r.results).toEqual([]); expect(r.module).toBe('places'); expect(r.error).toMatch(/engine unavailable/);
  });
  test('non-string / empty text returns synthetic empty', () => {
    expect(findPlacesInText(stubEngine(), 123).error).toMatch(/non-string or empty/);
    expect(findPlacesInText(stubEngine(), '').error).toMatch(/non-string or empty/);
  });
  test('a throwing engine is caught, not propagated', () => {
    const boom = stubEngine({ find_in_text: () => { throw new Error('kaboom'); } });
    const r = findPlacesInText(boom, 'London');
    expect(r.results).toEqual([]); expect(r.error).toMatch(/find_in_text threw: kaboom/);
  });
  test('engine returning no results array is treated as empty', () => {
    const bad = stubEngine({ find_in_text: () => ({ module: 'places' }) });
    expect(findPlacesInText(bad, 'x').error).toMatch(/no results array/);
  });
  test('valid engine result passes through unchanged', () => {
    const r = findPlacesInText(stubEngine(), 'Officials met in London.');
    expect(r.results[0].canonical_name).toBe('London');
    expect(r.results[0].verdict).toBe('place');
  });
});

describe('findPlacesInUrl guards', () => {
  test('null engine → synthetic empty best_chain', () => {
    const r = findPlacesInUrl(null, 'https://x/y');
    expect(r.results.best_chain).toEqual([]); expect(r.error).toMatch(/engine unavailable/);
  });
  test('throwing engine is caught', () => {
    const boom = stubEngine({ find_in_url: () => { throw new Error('u-oh'); } });
    expect(findPlacesInUrl(boom, 'https://x/y').error).toMatch(/find_in_url threw/);
  });
  test('valid url passes through', () => {
    const r = findPlacesInUrl(stubEngine(), 'https://bbc.co.uk/news/london');
    expect(r.results.best_chain[0].canonical_name).toBe('London');
  });
});

describe('gazetteerAccessFromDbPath (ncdb boundary)', () => {
  test('uses injected createDbAdapter and returns adapter.gazetteer', async () => {
    const fakeAccess = { listPlaceNameRowsForIndex: async () => [] };
    const createDbAdapter = (cfg) => { expect(cfg.type).toBe('sqlite'); expect(cfg.readonly).toBe(true); return { gazetteer: fakeAccess }; };
    const access = await gazetteerAccessFromDbPath('data/news.db', { createDbAdapter });
    expect(access).toBe(fakeAccess);
  });
  test('throws when the adapter has no gazetteer', async () => {
    const createDbAdapter = () => ({});
    await expect(gazetteerAccessFromDbPath('x', { createDbAdapter })).rejects.toThrow(/no \.gazetteer/);
  });
});

describe('createPlacesEngine (async construct → sync bound calls)', () => {
  test('builds via injected importer + gazetteerAccess and returns bound sync methods', async () => {
    const engine = stubEngine();
    const places = await createPlacesEngine({
      importer: async () => stubModule(engine),
      candidates: ['x'],
      gazetteerAccess: { listPlaceNameRowsForIndex: async () => [] },
      tier: 'tier1',
    });
    expect(places.findInText('London, Paris').results[0].canonical_name).toBe('London');
    expect(places.findInUrl('https://x/london').results.best_chain[0].canonical_name).toBe('London');
    expect(places.stats().total_names).toBe(42);
  });
  test('defaults an unknown tier to tier2 and requires an access source', async () => {
    await expect(createPlacesEngine({ importer: async () => stubModule(), candidates: ['x'] }))
      .rejects.toThrow(/gazetteerAccess or dbPath/);
  });
});
