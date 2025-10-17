const { slugify } = require('./slugify');

const DEFAULT_BOOTSTRAP_TERMS = [
  { slug: 'culture', label: 'Culture', lang: 'en', source: 'bootstrap' },
  { slug: 'film', label: 'Film', lang: 'en', source: 'bootstrap' },
  { slug: 'music', label: 'Music', lang: 'en', source: 'bootstrap' },
  { slug: 'stage', label: 'Stage', lang: 'en', source: 'bootstrap' },
  { slug: 'books', label: 'Books', lang: 'en', source: 'bootstrap' },
  { slug: 'artanddesign', label: 'Art and design', lang: 'en', source: 'bootstrap' },
  { slug: 'tv-and-radio', label: 'TV and radio', lang: 'en', source: 'bootstrap' },
  { slug: 'media', label: 'Media', lang: 'en', source: 'bootstrap' },
  { slug: 'lifeandstyle', label: 'Life and style', lang: 'en', source: 'bootstrap' },
  { slug: 'fashion', label: 'Fashion', lang: 'en', source: 'bootstrap' },
  { slug: 'commentisfree', label: 'Comment is free', lang: 'en', source: 'bootstrap' },
  { slug: 'games', label: 'Games', lang: 'en', source: 'bootstrap' }
];

function ensureNonGeoTopicTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS non_geo_topic_slugs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      label TEXT,
      lang TEXT NOT NULL DEFAULT 'und',
      source TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(slug, lang)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_non_geo_topic_slug ON non_geo_topic_slugs(slug);');
}

function bootstrapNonGeoTopicSlugs(db) {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM non_geo_topic_slugs').get();
  if (!row || Number(row.cnt) > 0) return;

  const insert = db.prepare(`
    INSERT INTO non_geo_topic_slugs(slug, label, lang, source)
    VALUES (@slug, @label, @lang, @source)
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insert.run(item);
    }
  });

  insertMany(DEFAULT_BOOTSTRAP_TERMS);
}

function loadNonGeoTopicSlugs(db) {
  ensureNonGeoTopicTable(db);
  bootstrapNonGeoTopicSlugs(db);

  const rows = db.prepare('SELECT slug, label, lang FROM non_geo_topic_slugs').all();
  const normalized = rows
    .map((row) => ({ slug: slugify(row.slug), label: row.label || null, lang: row.lang || null }))
    .filter((row) => row.slug);

  const slugs = new Set(normalized.map((row) => row.slug));
  return { slugs, entries: normalized };
}

module.exports = {
  loadNonGeoTopicSlugs,
  ensureNonGeoTopicTable,
  DEFAULT_BOOTSTRAP_TERMS
};