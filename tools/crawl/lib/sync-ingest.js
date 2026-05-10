'use strict';

function tableExists(db, tableName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
  return Boolean(row);
}

function getColumns(db, tableName) {
  if (!tableExists(db, tableName)) return [];
  return db.pragma(`table_info(${tableName})`).map(column => column.name);
}

function insertRow(db, tableName, row, columns, { ignore = true } = {}) {
  const entries = Object.entries(row).filter(([key, value]) => columns.includes(key) && value !== undefined);
  if (entries.length === 0) return { changes: 0, lastInsertRowid: null };
  const names = entries.map(([key]) => key);
  const placeholders = names.map(() => '?').join(', ');
  const verb = ignore ? 'INSERT OR IGNORE' : 'INSERT';
  return db.prepare(`${verb} INTO ${tableName} (${names.join(', ')}) VALUES (${placeholders})`).run(...entries.map(([, value]) => value));
}

function getUrlId(db, url) {
  if (!url) return null;
  const row = db.prepare('SELECT id FROM urls WHERE url = ?').get(url);
  return row?.id || null;
}

function getResponseId(db, responseRow, localUrlId) {
  if (!responseRow || !localUrlId) return null;
  const fetchedAt = responseRow.fetched_at || null;
  const requestStartedAt = responseRow.request_started_at || null;
  const httpStatus = responseRow.http_status ?? null;
  const row = db.prepare(`
    SELECT id
    FROM http_responses
    WHERE url_id = ?
      AND COALESCE(fetched_at, '') = COALESCE(?, '')
      AND COALESCE(request_started_at, '') = COALESCE(?, '')
      AND COALESCE(http_status, -1) = COALESCE(?, -1)
    ORDER BY id DESC
    LIMIT 1
  `).get(localUrlId, fetchedAt, requestStartedAt, httpStatus);
  if (row?.id) return row.id;

  const fallback = db.prepare(`
    SELECT id
    FROM http_responses
    WHERE url_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(localUrlId);
  return fallback?.id || null;
}

function ingestUrls(db, urls, urlColumns) {
  const remoteToLocalUrlId = new Map();
  let urlsInserted = 0;

  for (const remoteRow of urls || []) {
    if (!remoteRow?.url) continue;
    const row = { ...remoteRow };
    const remoteId = row.id;
    delete row.id;
    const result = insertRow(db, 'urls', row, urlColumns, { ignore: true });
    urlsInserted += result.changes || 0;
    const localId = getUrlId(db, remoteRow.url) || result.lastInsertRowid;
    if (remoteId && localId) remoteToLocalUrlId.set(remoteId, localId);
  }

  return { urlsInserted, remoteToLocalUrlId };
}

function ingestResponses(db, responses, responseColumns, remoteToLocalUrlId) {
  const remoteToLocalResponseId = new Map();
  let responsesInserted = 0;

  for (const remoteRow of responses || []) {
    const localUrlId = remoteToLocalUrlId.get(remoteRow.url_id);
    if (!localUrlId) continue;
    const row = { ...remoteRow, url_id: localUrlId };
    const remoteId = row.id;
    delete row.id;
    const result = insertRow(db, 'http_responses', row, responseColumns, { ignore: true });
    responsesInserted += result.changes || 0;
    const localResponseId = result.changes && result.lastInsertRowid
      ? result.lastInsertRowid
      : getResponseId(db, remoteRow, localUrlId);
    if (remoteId && localResponseId) remoteToLocalResponseId.set(remoteId, localResponseId);
  }

  return { responsesInserted, remoteToLocalResponseId };
}

function ingestContent(db, contentRows, contentColumns, remoteToLocalResponseId) {
  let contentInserted = 0;

  for (const remoteRow of contentRows || []) {
    const localResponseId = remoteToLocalResponseId.get(remoteRow.http_response_id);
    if (!localResponseId) continue;
    const row = { ...remoteRow, http_response_id: localResponseId };
    delete row.id;
    if (row.content_blob_b64 && !row.content_blob) {
      row.content_blob = Buffer.from(row.content_blob_b64, 'base64');
    }
    delete row.content_blob_b64;
    const result = insertRow(db, 'content_storage', row, contentColumns, { ignore: true });
    contentInserted += result.changes || 0;
  }

  return contentInserted;
}

function ingestLinks(db, links, linkColumns, remoteToLocalUrlId) {
  if (linkColumns.length === 0) return 0;
  let linksInserted = 0;

  for (const remoteRow of links || []) {
    const localSourceId = remoteToLocalUrlId.get(remoteRow.source_url_id);
    if (!localSourceId) continue;
    const row = { ...remoteRow, source_url_id: localSourceId };
    delete row.id;
    delete row.source_url;
    const result = insertRow(db, 'discovered_links', row, linkColumns, { ignore: true });
    linksInserted += result.changes || 0;
  }

  return linksInserted;
}

function ingestV2Batch(db, batch) {
  if (!batch || typeof batch !== 'object') {
    return { urlsInserted: 0, responsesInserted: 0, contentInserted: 0, linksInserted: 0 };
  }

  const urlColumns = getColumns(db, 'urls');
  const responseColumns = getColumns(db, 'http_responses');
  const contentColumns = getColumns(db, 'content_storage');
  const linkColumns = getColumns(db, 'discovered_links');

  const transaction = db.transaction(() => {
    const { urlsInserted, remoteToLocalUrlId } = ingestUrls(db, batch.urls || [], urlColumns);
    const { responsesInserted, remoteToLocalResponseId } = ingestResponses(
      db,
      batch.httpResponses || [],
      responseColumns,
      remoteToLocalUrlId
    );
    const contentInserted = ingestContent(db, batch.content || [], contentColumns, remoteToLocalResponseId);
    const linksInserted = ingestLinks(db, batch.links || [], linkColumns, remoteToLocalUrlId);

    return { urlsInserted, responsesInserted, contentInserted, linksInserted };
  });

  return transaction();
}

module.exports = { ingestV2Batch };
