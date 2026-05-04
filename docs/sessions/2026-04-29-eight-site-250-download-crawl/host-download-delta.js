#!/usr/bin/env node
'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_SITES = [
  'bbc.com',
  'reuters.com',
  'apnews.com',
  'aljazeera.com',
  'theguardian.com',
  'npr.org',
  'abcnews.go.com',
  'cbsnews.com'
];

function parseArgs(argv) {
  const args = {
    since: null,
    until: new Date().toISOString(),
    sites: DEFAULT_SITES,
    dbPath: path.resolve(__dirname, '..', '..', '..', 'data', 'news.db')
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--since' && argv[i + 1]) {
      args.since = argv[++i];
    } else if (token === '--until' && argv[i + 1]) {
      args.until = argv[++i];
    } else if (token === '--sites' && argv[i + 1]) {
      args.sites = argv[++i].split(',').map((site) => site.trim()).filter(Boolean);
    } else if (token === '--db' && argv[i + 1]) {
      args.dbPath = path.resolve(argv[++i]);
    }
  }

  if (!args.since) {
    throw new Error('Missing required --since ISO timestamp');
  }

  return args;
}

function toSqliteTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sinceForSql = toSqliteTimestamp(args.since);
  const untilForSql = toSqliteTimestamp(args.until);
  const db = new Database(args.dbPath, { readonly: true });

  try {
    const stmt = db.prepare(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN r.http_status = 200 THEN 1 END) AS ok,
        COUNT(CASE WHEN r.http_status >= 400 THEN 1 END) AS failed,
        COALESCE(SUM(CASE WHEN r.http_status = 200 THEN r.bytes_downloaded ELSE 0 END), 0) AS bytes,
        MIN(r.fetched_at) AS firstFetch,
        MAX(r.fetched_at) AS lastFetch
      FROM http_responses r
      JOIN urls u ON r.url_id = u.id
      WHERE r.fetched_at BETWEEN ? AND ?
        AND (u.host = ? OR u.host LIKE ?)
    `);

    const rows = args.sites.map((site) => ({
      site,
      ...stmt.get(sinceForSql, untilForSql, site, `%.${site}`)
    }));

    const allMet250 = rows.every((row) => row.ok >= 250);
    console.log(JSON.stringify({
      since: args.since,
      until: args.until,
      sqliteRange: {
        since: sinceForSql,
        until: untilForSql
      },
      targetOkPerSite: 250,
      allMet250,
      rows
    }, null, 2));
  } finally {
    db.close();
  }
}

main();
