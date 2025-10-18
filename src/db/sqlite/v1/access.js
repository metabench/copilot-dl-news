const NewsDatabase = require('./SQLiteNewsDatabase');

function createCrawl(db, { crawlTypeId, name }) {
  const result = db.prepare('INSERT INTO crawl_jobs (id, crawl_type_id, status, started_at) VALUES (?, ?, ?, ?)').run(name, crawlTypeId, 'pending', new Date().toISOString());
  return { id: name };
}

function createCrawlType(db, { name, description, config }) {
    const declaration = JSON.stringify(config);
    const result = db.prepare('INSERT INTO crawl_types (name, description, declaration) VALUES (?, ?, ?)').run(name, description, declaration);
    return { id: result.lastInsertRowid };
}

function getCrawl(db, id) {
    return db.prepare('SELECT * FROM crawl_jobs WHERE id = ?').get(id);
}

function getCrawlLogs(db, id) {
    return db.prepare('SELECT * FROM queue_events WHERE job_id = ?').all(id);
}

module.exports = {
    createCrawl,
    createCrawlType,
    getCrawl,
    getCrawlLogs
};