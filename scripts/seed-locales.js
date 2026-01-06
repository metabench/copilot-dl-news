const { createSQLiteDatabase } = require('../src/db/sqlite');
const db = createSQLiteDatabase('data/news.db');

const domains = [
  { host: 'www.eltiempo.com', country: 'CO' },
  { host: 'www.eluniversal.com', country: 'VE' },
  { host: 'www.semana.com', country: 'CO' }
];

const insert = db.db.prepare(`
  INSERT OR REPLACE INTO domain_locales (host, country_code, primary_langs, confidence, source)
  VALUES (?, ?, 'es', 1.0, 'manual-seed')
`);

domains.forEach(d => {
  insert.run(d.host, d.country);
  console.log(`Seeded locale for ${d.host}`);
});
