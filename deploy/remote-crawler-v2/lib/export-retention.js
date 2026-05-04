'use strict';

function pruneExportedPayload(db, options = {}) {
  const before = options.before;
  if (!before) {
    throw new Error('before watermark is required');
  }

  const urlRows = db.prepare('SELECT id FROM urls WHERE updated_at <= ?').all(before);
  const urlIds = urlRows.map(row => row.id);
  if (urlIds.length === 0) {
    return { ok: true, before, deleted: { urls: 0, httpResponses: 0, content: 0, links: 0 }, vacuumed: false };
  }

  const deleted = { urls: 0, httpResponses: 0, content: 0, links: 0 };
  const transaction = db.transaction((ids) => {
    for (let index = 0; index < ids.length; index += 100) {
      const chunk = ids.slice(index, index + 100);
      const placeholders = chunk.map(() => '?').join(',');
      const responseRows = db.prepare(`SELECT id FROM http_responses WHERE url_id IN (${placeholders})`).all(...chunk);
      const responseIds = responseRows.map(row => row.id);

      deleted.links += db.prepare(`DELETE FROM discovered_links WHERE source_url_id IN (${placeholders})`).run(...chunk).changes;

      if (responseIds.length > 0) {
        const responsePlaceholders = responseIds.map(() => '?').join(',');
        deleted.content += db.prepare(`DELETE FROM content_storage WHERE http_response_id IN (${responsePlaceholders})`).run(...responseIds).changes;
      }

      deleted.httpResponses += db.prepare(`DELETE FROM http_responses WHERE url_id IN (${placeholders})`).run(...chunk).changes;
      deleted.urls += db.prepare(`DELETE FROM urls WHERE id IN (${placeholders})`).run(...chunk).changes;
    }
  });

  transaction(urlIds);

  let vacuumed = false;
  if (options.vacuum === true) {
    db.exec('VACUUM');
    vacuumed = true;
  }

  return { ok: true, before, deleted, vacuumed };
}

module.exports = { pruneExportedPayload };
