'use strict';

function normalizeUrlIds(urlIds) {
  if (!Array.isArray(urlIds)) return [];
  const seen = new Set();
  const normalized = [];
  for (const value of urlIds) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

function pruneExportedPayload(db, options = {}) {
  const before = options.before;
  const deleteUrls = options.deleteUrls === true;
  const deleteLinks = options.deleteLinks !== false;
  const exactUrlIds = normalizeUrlIds(options.urlIds);
  if (!before && exactUrlIds.length === 0) {
    throw new Error('before watermark or urlIds are required');
  }

  const urlRows = [];
  if (exactUrlIds.length > 0) {
    for (let index = 0; index < exactUrlIds.length; index += 500) {
      const chunk = exactUrlIds.slice(index, index + 500);
      const placeholders = chunk.map(() => '?').join(',');
      const beforeClause = before ? ' AND updated_at <= ?' : '';
      const params = before ? [...chunk, before] : chunk;
      urlRows.push(...db.prepare(`SELECT id FROM urls WHERE id IN (${placeholders})${beforeClause}`).all(...params));
    }
  } else {
    urlRows.push(...db.prepare('SELECT id FROM urls WHERE updated_at <= ?').all(before));
  }
  const urlIds = urlRows.map(row => row.id);
  if (urlIds.length === 0) {
    return {
      ok: true,
      before,
      mode: exactUrlIds.length > 0 ? 'exact-url-ids' : 'watermark',
      requestedUrlIds: exactUrlIds.length,
      matchedUrlIds: 0,
      deleted: { urls: 0, httpResponses: 0, content: 0, links: 0 },
      vacuumed: false,
      retained: { urls: 0 }
    };
  }

  const deleted = { urls: 0, httpResponses: 0, content: 0, links: 0 };
  const transaction = db.transaction((ids) => {
    for (let index = 0; index < ids.length; index += 100) {
      const chunk = ids.slice(index, index + 100);
      const placeholders = chunk.map(() => '?').join(',');
      const responseRows = db.prepare(`SELECT id FROM http_responses WHERE url_id IN (${placeholders})`).all(...chunk);
      const responseIds = responseRows.map(row => row.id);

      if (deleteLinks) {
        deleted.links += db.prepare(`DELETE FROM discovered_links WHERE source_url_id IN (${placeholders})`).run(...chunk).changes;
      }

      if (responseIds.length > 0) {
        const responsePlaceholders = responseIds.map(() => '?').join(',');
        deleted.content += db.prepare(`DELETE FROM content_storage WHERE http_response_id IN (${responsePlaceholders})`).run(...responseIds).changes;
      }

      deleted.httpResponses += db.prepare(`DELETE FROM http_responses WHERE url_id IN (${placeholders})`).run(...chunk).changes;
      if (deleteUrls) {
        deleted.urls += db.prepare(`DELETE FROM urls WHERE id IN (${placeholders})`).run(...chunk).changes;
      }
    }
  });

  transaction(urlIds);

  let vacuumed = false;
  if (options.vacuum === true) {
    db.exec('VACUUM');
    vacuumed = true;
  }

  return {
    ok: true,
    before,
    mode: exactUrlIds.length > 0 ? 'exact-url-ids' : 'watermark',
    requestedUrlIds: exactUrlIds.length,
    matchedUrlIds: urlIds.length,
    deleted,
    vacuumed,
    retained: { urls: deleteUrls ? 0 : urlIds.length }
  };
}

module.exports = { pruneExportedPayload };
