'use strict';

const CRAWL_TYPE_DEFAULTS = [
  { name: 'basic', description: 'Follow links only (no sitemap)', declaration: { crawlType: 'basic', useSitemap: false, sitemapOnly: false } },
  { name: 'sitemap-only', description: 'Use only the sitemap to discover pages', declaration: { crawlType: 'sitemap-only', useSitemap: true, sitemapOnly: true } },
  { name: 'basic-with-sitemap', description: 'Follow links and also use the sitemap', declaration: { crawlType: 'basic-with-sitemap', useSitemap: true, sitemapOnly: false } },
  { name: 'intelligent', description: 'Intelligent planning (hubs + sitemap + heuristics)', declaration: { crawlType: 'intelligent', useSitemap: true, sitemapOnly: false } },
  { name: 'discover-structure', description: 'Map site structure without downloading articles', declaration: { crawlType: 'discover-structure', useSitemap: true, sitemapOnly: false } },
  { name: 'gazetteer', description: 'Legacy alias for geography gazetteer crawl', declaration: { crawlType: 'geography', useSitemap: false, sitemapOnly: false } },
  { name: 'wikidata', description: 'Only ingest gazetteer data from Wikidata', declaration: { crawlType: 'wikidata', useSitemap: false, sitemapOnly: false } },
  { name: 'geography', description: 'Aggregate gazetteer data from Wikidata plus OpenStreetMap boundaries', declaration: { crawlType: 'geography', useSitemap: false, sitemapOnly: false } }
];

function seedCrawlTypes(db, { logger = console } = {}) {
  if (!db) return { success: false, reason: 'no database handle' };
  try {
    const stmt = db.prepare(`
      INSERT INTO crawl_types(name, description, declaration)
      VALUES (@name, @description, @declaration)
      ON CONFLICT(name) DO UPDATE SET
        description = excluded.description,
        declaration = excluded.declaration
    `);
    const txn = db.transaction((rows) => {
      for (const row of rows) {
        stmt.run({
          name: row.name,
          description: row.description,
          declaration: JSON.stringify(row.declaration)
        });
      }
    });
    txn(CRAWL_TYPE_DEFAULTS);
    return { success: true, seeded: CRAWL_TYPE_DEFAULTS.length };
  } catch (error) {
    logger.warn?.('[seeders] Failed to seed crawl types:', error.message);
    return { success: false, reason: error.message };
  }
}

module.exports = {
  CRAWL_TYPE_DEFAULTS,
  seedCrawlTypes
};
