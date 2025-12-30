'use strict';

const fs = require('fs');
const Database = require('better-sqlite3');

const LARGE_DB_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100MB

function getBasicDbInfo(dbPath) {
  let db;

  try {
    const fileStats = fs.statSync(dbPath);
    const isLargeDb = fileStats.size > LARGE_DB_THRESHOLD_BYTES;

    db = new Database(dbPath, { readonly: true, timeout: 5000 });

    const allTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((t) => t.name);

    const hasPlaces = allTables.includes('places');
    const hasPlaceNames = allTables.includes('place_names');
    const hasGazetteerTables = hasPlaces || hasPlaceNames;

    const otherTables = allTables.filter(
      (t) => t !== 'places' && t !== 'place_names' && !t.startsWith('sqlite_')
    );

    const result = {
      hasGazetteerTables,
      tableCount: allTables.length,
      otherTableCount: otherTables.length,
      tables: otherTables.slice(0, 10),
      places: 0,
      names: 0,
      sources: [],
      totalRows: 0,
      tableCounts: []
    };

    const tablesToCheck = otherTables.slice(0, 5);
    for (const tableName of tablesToCheck) {
      try {
        if (isLargeDb) {
          const stat = db
            .prepare('SELECT stat FROM sqlite_stat1 WHERE tbl=? AND idx IS NULL LIMIT 1')
            .get(tableName);

          if (stat && stat.stat) {
            const count = parseInt(stat.stat.split(' ')[0], 10) || 0;
            result.tableCounts.push({ table: tableName, count });
            result.totalRows += count;
          } else {
            const hasRows = db.prepare(`SELECT 1 FROM "${tableName}" LIMIT 1`).get();
            if (hasRows) {
              result.tableCounts.push({ table: tableName, count: -1 });
              result.totalRows += 1;
            }
          }
        } else {
          const count = db.prepare(`SELECT COUNT(*) as c FROM "${tableName}"`).get()?.c || 0;
          result.tableCounts.push({ table: tableName, count });
          result.totalRows += count;
        }
      } catch (_) {
        // Ignore per-table failures.
      }
    }

    const hasStat1 = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_stat1'")
      .get();

    if (hasPlaces) {
      try {
        if (isLargeDb && hasStat1) {
          const stat = db
            .prepare("SELECT stat FROM sqlite_stat1 WHERE tbl='places' AND idx IS NULL LIMIT 1")
            .get();

          if (stat && stat.stat) {
            result.places = parseInt(stat.stat.split(' ')[0], 10) || 0;
          } else {
            result.places = db.prepare('SELECT COUNT(*) as count FROM places').get()?.count || 0;
          }
        } else {
          result.places = db.prepare('SELECT COUNT(*) as count FROM places').get()?.count || 0;
        }
      } catch (_) {
        // Ignore missing table.
      }
    }

    if (hasPlaceNames) {
      try {
        if (isLargeDb && hasStat1) {
          const stat = db
            .prepare("SELECT stat FROM sqlite_stat1 WHERE tbl='place_names' AND idx IS NULL LIMIT 1")
            .get();

          if (stat && stat.stat) {
            result.names = parseInt(stat.stat.split(' ')[0], 10) || 0;
          } else {
            result.names = db.prepare('SELECT COUNT(*) as count FROM place_names').get()?.count || 0;
          }
        } else {
          result.names = db.prepare('SELECT COUNT(*) as count FROM place_names').get()?.count || 0;
        }
      } catch (_) {
        // Ignore missing table.
      }
    }

    if (hasPlaces) {
      try {
        result.sources = db
          .prepare('SELECT DISTINCT source FROM places WHERE source IS NOT NULL LIMIT 20')
          .all()
          .map((r) => r.source);
      } catch (_) {
        // Ignore.
      }
    }

    return result;
  } catch (error) {
    return {
      hasGazetteerTables: false,
      tableCount: 0,
      otherTableCount: 0,
      tables: [],
      places: 0,
      names: 0,
      sources: [],
      totalRows: 0,
      tableCounts: [],
      error: error?.message || String(error)
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch (_) {
        // Ignore close errors.
      }
    }
  }
}

function getDatabaseStats(dbPath) {
  let db;

  try {
    db = new Database(dbPath, { readonly: true });
    const stats = fs.statSync(dbPath);

    let places = 0;
    let names = 0;
    let bySource = [];
    let byKind = [];
    let lastImport = null;

    try {
      places = db.prepare('SELECT COUNT(*) as count FROM places').get()?.count || 0;
    } catch (_) {}

    try {
      names = db.prepare('SELECT COUNT(*) as count FROM place_names').get()?.count || 0;
    } catch (_) {}

    try {
      bySource = db.prepare('SELECT source, COUNT(*) as count FROM places GROUP BY source').all();
    } catch (_) {}

    try {
      byKind = db
        .prepare('SELECT kind, COUNT(*) as count FROM places GROUP BY kind ORDER BY count DESC LIMIT 10')
        .all();
    } catch (_) {}

    try {
      const lastRun = db.prepare('SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 1').get();
      if (lastRun) {
        lastImport = {
          source: lastRun.source,
          date: lastRun.started_at,
          status: lastRun.status,
          recordsInserted: lastRun.records_inserted
        };
      }
    } catch (_) {}

    return {
      places,
      names,
      bySource,
      byKind,
      lastImport,
      size: stats.size,
      modified: stats.mtime.toISOString()
    };
  } catch (error) {
    return { error: error?.message || String(error), places: 0, names: 0 };
  } finally {
    if (db) {
      try {
        db.close();
      } catch (_) {}
    }
  }
}

module.exports = {
  getBasicDbInfo,
  getDatabaseStats
};
