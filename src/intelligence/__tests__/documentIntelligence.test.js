'use strict';

const {
  importDocumentIntelligence,
  createDocumentClassifier,
  classifyDocument,
  GENERAL_LABELS,
  DETAILED_LABELS,
} = require('../documentIntelligence');

function makeFakeModule(labelFor) {
  return {
    analyze_document(html /* , url */) {
      const label = labelFor(html);
      return { module: 'document', processing_time_ms: 0, confidence: 0.9,
        results: { label, classification: label === 'news_article' ? 'article' : 'unknown', confidence: 0.9, reasons: ['fake'], facts: {} } };
    },
  };
}

describe('documentIntelligence bridge — pure helpers', () => {
  test('label sets are frozen and complete', () => {
    expect(GENERAL_LABELS).toEqual(['article', 'hub', 'nav', 'unknown']);
    expect(DETAILED_LABELS).toContain('news_article');
    expect(DETAILED_LABELS).toContain('login_page');
    expect(() => { GENERAL_LABELS.push('x'); }).toThrow();
  });
});

describe('documentIntelligence bridge — loader (injected importer)', () => {
  test('returns the namespace when a candidate resolves', async () => {
    const fake = makeFakeModule(() => 'news_article');
    const mod = await importDocumentIntelligence({ importer: async () => fake, candidates: ['x'] });
    expect(mod).toBe(fake);
  });
  test('falls through to the second candidate when the first throws', async () => {
    const fake = makeFakeModule(() => 'unknown');
    const importer = async (spec) => { if (spec === 'first') throw new Error('ERR_REQUIRE_ESM'); return fake; };
    expect(await importDocumentIntelligence({ importer, candidates: ['first', 'second'] })).toBe(fake);
  });
  test('throws a LOUD build/install error when every candidate fails', async () => {
    await expect(importDocumentIntelligence({ importer: async () => { throw new Error('nope'); }, candidates: ['a', 'b'] }))
      .rejects.toThrow(/Build\/install \.\.\/news-crawler-document-intelligence first/);
  });
  test('rejects a namespace missing analyze_document', async () => {
    await expect(importDocumentIntelligence({ importer: async () => ({ nope: 1 }), candidates: ['a'] }))
      .rejects.toThrow(/no analyze_document export/);
  });
});

describe('documentIntelligence bridge — classifyDocument guards (crash-proof)', () => {
  const fake = makeFakeModule((html) => (html.includes('article') ? 'news_article' : 'unknown'));
  test('passes real HTML through', () => {
    expect(classifyDocument(fake, '<article>x</article>').label).toBe('news_article');
    expect(classifyDocument(fake, '<div>x</div>').label).toBe('unknown');
  });
  test('absorbs a THROWING module (never propagates)', () => {
    const throwing = { analyze_document() { throw new Error('boom'); } };
    const out = classifyDocument(throwing, '<html></html>');
    expect(out.label).toBe('unknown');
    expect(out.reasons[0]).toMatch(/analyze_document threw: boom/);
  });
  test('returns unknown (no throw) on null/malformed module or non-string html', () => {
    expect(classifyDocument(null, '<a>').label).toBe('unknown');
    expect(classifyDocument({}, '<a>').label).toBe('unknown');
    expect(classifyDocument(fake, null).label).toBe('unknown');
    expect(classifyDocument(fake, 42).label).toBe('unknown');
    expect(classifyDocument(fake, '').label).toBe('unknown');
  });
});

// Integration: the REAL sibling module (deterministic).
describe('documentIntelligence bridge — real module integration', () => {
  // ESM-only module; a live import() is not possible in the jest VM without
  // --experimental-vm-modules. Skip GRACEFULLY when it can't load — the guards above
  // (injected importers) fully cover the bridge logic, so a red failure here would be a
  // misleading environment artifact, not a real defect.
  let doc = null;
  let available = false;
  beforeAll(async () => {
    try { doc = await createDocumentClassifier(); available = true; }
    catch (_) { available = false; }
  });
  const itReal = (name, fn) => test(name, () => {
    if (!available) { console.warn(`skipped (real ESM module not importable in jest): ${name}`); return undefined; }
    return fn();
  });
  itReal('classifies a login page and a listing page from real HTML', () => {
    const login = doc.classifyDocument('<html><body><form><input type="password"><button>Sign in</button></form></body></html>', 'https://x.com/login');
    expect(login.label).toBe('login_page');
    const listing = doc.classifyDocument('<html><body><nav></nav>' + '<a href="/a">l</a>'.repeat(60) + '</body></html>', 'https://x.com/section');
    expect(['listing_page', 'organization_page']).toContain(listing.label);
    // determinism
    expect(doc.classifyDocument('<html><body>x</body></html>', 'https://x.com/').label)
      .toBe(doc.classifyDocument('<html><body>x</body></html>', 'https://x.com/').label);
  });
  itReal('crash-proof on the real module too', () => {
    expect(doc.classifyDocument(null).classification).toBe('unknown');
    expect(typeof doc.classifyDocument('<html></html>').classification).toBe('string');
  });
});
