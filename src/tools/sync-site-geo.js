'use strict';

/**
 * sync-site-geo.js — move per-site geographic data INTO the database.
 *
 * Why: config/news-sources.json carries country/language/tier per site but
 * is read by no runtime code, so the crawler's own geographic knowledge of
 * its sources lived in a dead file (2026-07-16 DB-consolidation audit).
 * This tool is the one-way carrier: it upserts that data into
 *   - news_websites.metadata  (merged JSON: country, language, tier)
 *   - domain_locales          (host PK, bare-host canonical form per
 *                              migration 41: lowercase, no www.)
 * Idempotent: re-running produces the same rows. The JSON file stays only
 * as bootstrap/install media; the DB is the source of truth afterwards.
 *
 * Usage: node src/tools/sync-site-geo.js [--db <path>] [--dry-run]
 */

const path = require('path');
const fs = require('fs');
const { findProjectRoot } = require('../shared/utils/project-root');

const ROOT = findProjectRoot(__dirname);
const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const DRY = argv.includes('--dry-run');
const DB_PATH = getArg('db', path.join(ROOT, 'data', 'news.db'));

const canonicalizeHost = (host) => String(host || '').toLowerCase().replace(/^www\./, '');

function loadSources() {
  const file = path.join(ROOT, 'config', 'news-sources.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = [];
  for (const [domain, info] of Object.entries(parsed.sources || {})) {
    out.push({
      domain: canonicalizeHost(domain),
      country: info.country || null,
      language: info.language || null,
      tier: Number.isFinite(info.tier) ? info.tier : null
    });
  }
  return out;
}

// Minimal country-name → ISO 3166-1 alpha-2 for values seen in the config.
const COUNTRY_CODES = {
  UK: 'GB', GB: 'GB', US: 'US', USA: 'US', FRANCE: 'FR', GERMANY: 'DE',
  SPAIN: 'ES', ITALY: 'IT', QATAR: 'QA', INDIA: 'IN', AUSTRALIA: 'AU',
  CANADA: 'CA', JAPAN: 'JP', INTERNATIONAL: null
};
const toCountryCode = (c) => {
  if (!c) return null;
  const key = String(c).trim().toUpperCase();
  if (key.length === 2 && !(key in COUNTRY_CODES)) return key;
  return COUNTRY_CODES[key] ?? null;
};

function main() {
  const Database = require(require.resolve('better-sqlite3', {
    paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db'), __dirname]
  }));
  const sources = loadSources();
  console.log(`[sync-site-geo] ${sources.length} sources from config/news-sources.json → ${DB_PATH}${DRY ? ' (dry-run)' : ''}`);

  const db = new Database(DB_PATH, { timeout: 10000 });
  try {
    const sites = db.prepare('SELECT id, url, parent_domain, metadata FROM news_websites').all();
    const byDomain = new Map(sites.map((s) => [canonicalizeHost(s.parent_domain), s]));

    const updMeta = db.prepare('UPDATE news_websites SET metadata = ? WHERE id = ?');
    const upsertLocale = db.prepare(`
      INSERT INTO domain_locales (host, country_code, primary_langs, confidence, source, updated_at)
      VALUES (?, ?, ?, 1.0, 'news-sources-config-sync', ?)
      ON CONFLICT(host) DO UPDATE SET
        country_code = COALESCE(excluded.country_code, domain_locales.country_code),
        primary_langs = COALESCE(excluded.primary_langs, domain_locales.primary_langs),
        source = excluded.source,
        updated_at = excluded.updated_at
    `);

    let metaUpdated = 0, localesUpserted = 0, unmatched = 0;
    const now = new Date().toISOString();
    const run = db.transaction(() => {
      for (const src of sources) {
        const site = byDomain.get(src.domain);
        if (site) {
          let meta = {};
          try { meta = JSON.parse(site.metadata || '{}') || {}; } catch (_) {}
          const merged = { ...meta };
          if (src.country != null) merged.country = src.country;
          if (src.language != null) merged.language = src.language;
          if (src.tier != null) merged.tier = src.tier;
          const next = JSON.stringify(merged);
          if (next !== site.metadata) {
            if (!DRY) updMeta.run(next, site.id);
            metaUpdated++;
          }
        } else {
          unmatched++;
          console.log(`[sync-site-geo] no news_websites row for ${src.domain} (geo recorded in domain_locales only)`);
        }
        const cc = toCountryCode(src.country);
        if (cc || src.language) {
          if (!DRY) upsertLocale.run(src.domain, cc, src.language || null, now);
          localesUpserted++;
        }
      }
      // Normalize legacy www.-prefixed manual-seed rows to bare-host form.
      const legacy = db.prepare("SELECT host, country_code, primary_langs, confidence, source FROM domain_locales WHERE host LIKE 'www.%'").all();
      for (const row of legacy) {
        const bare = canonicalizeHost(row.host);
        if (!DRY) {
          db.prepare(`
            INSERT INTO domain_locales (host, country_code, primary_langs, confidence, source, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(host) DO NOTHING
          `).run(bare, row.country_code, row.primary_langs, row.confidence, row.source, now);
          db.prepare('DELETE FROM domain_locales WHERE host = ?').run(row.host);
        }
        console.log(`[sync-site-geo] canonicalized locale host ${row.host} → ${bare}`);
      }
    });
    run();

    console.log(`[sync-site-geo] metadata updated: ${metaUpdated}, locales upserted: ${localesUpserted}, unmatched sources: ${unmatched}`);
    const total = db.prepare('SELECT COUNT(*) c FROM domain_locales').get().c;
    const withGeo = db.prepare("SELECT COUNT(*) c FROM news_websites WHERE metadata LIKE '%\"country\"%'").get().c;
    console.log(`[verify] domain_locales rows: ${total}; news_websites with country metadata: ${withGeo}`);
  } finally {
    db.close();
  }
}

main();
