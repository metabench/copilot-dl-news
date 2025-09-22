const fs = require('fs');
const path = require('path');
const { ensureDb } = require('../../ensure_db');
const { scrubExtra } = require('../export-gazetteer');
const { spawnSync } = require('child_process');

describe('export-gazetteer CLI', () => {
  const tmpDir = path.join(process.cwd(), 'tmp-test');
  const dbPath = path.join(tmpDir, 'export.db');
  const outPath = path.join(tmpDir, 'export.ndjson');
  const script = path.join(process.cwd(), 'src', 'tools', 'export-gazetteer.js');

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const db = ensureDb(dbPath);
    try {
      // seed one place with extra shapes and one name
      const insPlace = db.prepare(`INSERT INTO places (kind, country_code, lat, lng, extra) VALUES (@kind,@cc,@lat,@lng,@extra)`);
      const res = insPlace.run({ kind: 'city', cc: 'IE', lat: 53.3498, lng: -6.2603, extra: JSON.stringify({ wkt: 'POINT(-6.26 53.34)', notes: 'Dublin', polygon: [1,2,3] }) });
      const placeId = res.lastInsertRowid;
      db.prepare(`INSERT INTO place_names (place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`)
        .run(placeId, 'Dublin', 'dublin', 'en', 'common', 1, 1);
    } finally {
      db.close();
    }
  });

  it('scrubExtra removes shapes keys', () => {
    const cleaned = scrubExtra({ wkt: 'POINT(0 0)', geometry: { type: 'Point' }, notes: 'ok', arr: Array(60).fill(1) });
    expect(cleaned.wkt).toBeUndefined();
    expect(cleaned.geometry).toBeUndefined();
    expect(cleaned.notes).toBe('ok');
    expect(cleaned.arr).toBeUndefined();
  });

  it('exports NDJSON and excludes non-human-readable shapes', () => {
    const proc = spawnSync(process.execPath, [script, `--db=${dbPath}`, `--out=${outPath}`, '--quiet=1'], { cwd: process.cwd() });
    expect(proc.status).toBe(0);
    expect(fs.existsSync(outPath)).toBe(true);
    const lines = fs.readFileSync(outPath, 'utf8').trim().split(/\r?\n/);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const place = lines.map(l => JSON.parse(l)).find(o => o.type === 'place');
    expect(place).toBeTruthy();
    expect(place.extra).toBeTruthy();
    expect(place.extra.wkt).toBeUndefined();
    expect(place.extra.polygon).toBeUndefined();
    expect(place.extra.notes).toBe('Dublin');
  });
});
