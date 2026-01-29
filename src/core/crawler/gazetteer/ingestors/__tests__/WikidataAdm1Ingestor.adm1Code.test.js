'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureDatabase } = require('../../../../../data/db/sqlite');
const WikidataAdm1Ingestor = require('../WikidataAdm1Ingestor');

describe('WikidataAdm1Ingestor - ADM1 code derivation', () => {
  let tempDbPath;
  let db;

  beforeEach(() => {
    tempDbPath = path.join(os.tmpdir(), `adm1-code-${Date.now()}.db`);
    db = ensureDatabase(tempDbPath);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    try {
      if (tempDbPath && fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (_) {
      // ignore cleanup errors in tests
    }
  });

  function createIngestor() {
    return new WikidataAdm1Ingestor({
      db,
      useSnapshot: false,
      useDynamicFetch: false,
      useCache: false
    });
  }

  test('extracts code segment after country prefix', () => {
    const ingestor = createIngestor();
    expect(ingestor._deriveAdm1Code('NL-DR', 'NL', 'Q27561')).toBe('DR');
  });

  test('preserves trimmed ISO value when no subdivision separator exists', () => {
    const ingestor = createIngestor();
    expect(ingestor._deriveAdm1Code('  FR01  ', 'FR', 'Q123')).toBe('FR01');
  });

  test('removes duplicate country prefix from code segment', () => {
    const ingestor = createIngestor();
    expect(ingestor._deriveAdm1Code('NL-NL-FR', 'NL', 'Q27459')).toBe('FR');
  });

  test('falls back to Wikidata QID when ISO code is missing', () => {
    const ingestor = createIngestor();
    expect(ingestor._deriveAdm1Code(null, 'NL', 'Q27457')).toBe('Q27457');
  });

  test('strips wd: prefix and uppercases fallback QID', () => {
    const ingestor = createIngestor();
    expect(ingestor._deriveAdm1Code('   ', 'NL', 'wd:Q27458')).toBe('Q27458');
  });
});
