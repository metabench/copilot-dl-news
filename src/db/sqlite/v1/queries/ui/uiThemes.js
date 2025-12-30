'use strict';

const fs = require('fs');
const path = require('path');

function resolveDbHandle(dbOrWrapper) {
  if (!dbOrWrapper) return null;
  if (typeof dbOrWrapper.prepare === 'function' && typeof dbOrWrapper.exec === 'function') return dbOrWrapper;
  if (dbOrWrapper.db && typeof dbOrWrapper.db.prepare === 'function') return dbOrWrapper.db;
  return null;
}

function ensureUiThemesTable(dbOrWrapper) {
  const db = resolveDbHandle(dbOrWrapper);
  if (!db) return false;

  try {
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ui_themes'");
    const row = stmt.get();
    if (row) return true;
  } catch (_) {
    // Ignore.
  }

  try {
    const migrationPath = path.join(__dirname, '..', '..', 'migrations', 'add_ui_themes_table.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    db.exec(sql);
    return true;
  } catch (_) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ui_themes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          description TEXT,
          config TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          is_system INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_ui_themes_is_default ON ui_themes (is_default DESC);
        CREATE INDEX IF NOT EXISTS idx_ui_themes_name ON ui_themes (name);
      `);
      return true;
    } catch (_) {
      return false;
    }
  }
}

function ensureSystemThemes(dbOrWrapper, { themes = [] } = {}) {
  const db = resolveDbHandle(dbOrWrapper);
  if (!db) return false;

  try {
    ensureUiThemesTable(db);

    const hasDefault = !!db.prepare('SELECT 1 FROM ui_themes WHERE is_default = 1 LIMIT 1').get();

    const upsertTheme = (themeSpec) => {
      const name = themeSpec.name;
      const existing = db.prepare('SELECT id, is_system, is_default FROM ui_themes WHERE name = ?').get(name);

      const payload = {
        name,
        display_name: themeSpec.displayName,
        description: themeSpec.description || null,
        config: JSON.stringify(themeSpec.config || {}),
        is_default: themeSpec.isDefault ? 1 : 0,
        is_system: 1
      };

      if (!existing) {
        db.prepare(
          'INSERT INTO ui_themes (name, display_name, description, config, is_default, is_system) VALUES (@name, @display_name, @description, @config, @is_default, @is_system)'
        ).run(payload);
        return;
      }

      if (!existing.is_system) {
        return;
      }

      db.prepare(
        "UPDATE ui_themes SET display_name = @display_name, description = @description, config = @config, is_default = @is_default, is_system = @is_system, updated_at = datetime('now') WHERE name = @name"
      ).run(payload);
    };

    for (const themeSpec of themes) {
      if (!themeSpec?.name) continue;

      const shouldDefault = themeSpec.isDefault === true || (!hasDefault && themeSpec.defaultIfNone);
      upsertTheme({ ...themeSpec, isDefault: shouldDefault });
    }

    if (!hasDefault) {
      const desired = themes.find((t) => t.defaultIfNone) || themes.find((t) => t.isDefault);
      if (desired?.name) {
        db.prepare("UPDATE ui_themes SET is_default = 0 WHERE name <> ?").run(desired.name);
      }
    }

    return true;
  } catch (_) {
    return false;
  }
}

function listThemes(dbOrWrapper) {
  const db = resolveDbHandle(dbOrWrapper);
  if (!db) return [];

  const stmt = db.prepare(`
    SELECT id, name, display_name, description, is_default, is_system, created_at, updated_at
    FROM ui_themes
    ORDER BY is_default DESC, display_name ASC
  `);

  return stmt.all();
}

function getThemeRow(dbOrWrapper, identifier) {
  const db = resolveDbHandle(dbOrWrapper);
  if (!db) return null;

  const isNumeric = typeof identifier === 'number' || /^\d+$/.test(String(identifier));
  const stmt = isNumeric
    ? db.prepare('SELECT * FROM ui_themes WHERE id = ?')
    : db.prepare('SELECT * FROM ui_themes WHERE name = ?');

  return stmt.get(identifier) || null;
}

function getDefaultThemeRow(dbOrWrapper) {
  const db = resolveDbHandle(dbOrWrapper);
  if (!db) return null;

  return db.prepare('SELECT * FROM ui_themes WHERE is_default = 1 LIMIT 1').get() || null;
}

function createTheme(dbOrWrapper, themeData) {
  const db = resolveDbHandle(dbOrWrapper);
  if (!db) throw new Error('db_not_available');

  ensureUiThemesTable(db);

  const name = String(themeData.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .trim();

  if (!name || !themeData.displayName || !themeData.config) {
    throw new Error('name, displayName, and config are required');
  }

  const stmt = db.prepare(`
    INSERT INTO ui_themes (name, display_name, description, config)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(
    name,
    themeData.displayName,
    themeData.description || null,
    JSON.stringify(themeData.config)
  );

  return getThemeRow(db, result.lastInsertRowid);
}

function updateTheme(dbOrWrapper, identifier, updates) {
  const db = resolveDbHandle(dbOrWrapper);
  if (!db) throw new Error('db_not_available');

  const existing = getThemeRow(db, identifier);
  if (!existing) throw new Error(`Theme not found: ${identifier}`);

  if (existing.is_system && updates.name && updates.name !== existing.name) {
    throw new Error('Cannot rename system themes');
  }

  const fields = [];
  const values = [];

  if (updates.displayName !== undefined) {
    fields.push('display_name = ?');
    values.push(updates.displayName);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.config !== undefined) {
    fields.push('config = ?');
    values.push(JSON.stringify(updates.config));
  }

  if (fields.length === 0) return existing;

  fields.push("updated_at = datetime('now')");
  values.push(existing.id);

  db.prepare(`
    UPDATE ui_themes
    SET ${fields.join(', ')}
    WHERE id = ?
  `).run(...values);

  return getThemeRow(db, existing.id);
}

function setDefaultTheme(dbOrWrapper, identifier) {
  const db = resolveDbHandle(dbOrWrapper);
  if (!db) throw new Error('db_not_available');

  const theme = getThemeRow(db, identifier);
  if (!theme) throw new Error(`Theme not found: ${identifier}`);

  db.exec('UPDATE ui_themes SET is_default = 0');
  db.prepare('UPDATE ui_themes SET is_default = 1 WHERE id = ?').run(theme.id);

  return getThemeRow(db, theme.id);
}

function deleteTheme(dbOrWrapper, identifier) {
  const db = resolveDbHandle(dbOrWrapper);
  if (!db) throw new Error('db_not_available');

  const theme = getThemeRow(db, identifier);
  if (!theme) throw new Error(`Theme not found: ${identifier}`);

  if (theme.is_system) {
    throw new Error('Cannot delete system themes');
  }

  db.prepare('DELETE FROM ui_themes WHERE id = ?').run(theme.id);
  return true;
}

module.exports = {
  resolveDbHandle,
  ensureUiThemesTable,
  ensureSystemThemes,
  listThemes,
  getThemeRow,
  getDefaultThemeRow,
  createTheme,
  updateTheme,
  setDefaultTheme,
  deleteTheme
};
