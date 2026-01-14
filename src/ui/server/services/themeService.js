"use strict";

/**
 * Theme Service
 * 
 * Manages UI theme CRUD operations and provides theme configuration
 * for the Data Explorer. Themes are stored in the database and can
 * be customized by users.
 * 
 * @module themeService
 */

const fs = require("fs");
const path = require("path");

// Default theme configuration (Obsidian) - used if DB not available
const DEFAULT_THEME_CONFIG = {
  colors: {
    primary: "#1e293b",
    primaryLight: "#334155",
    primaryDark: "#0f172a",
    accent: "#c9a227",
    accentLight: "#d4b348",
    accentDark: "#b8931f",
    accentHover: "#e0b830",
    bg: "#0f172a",
    bgAlt: "#1a2332",
    surface: "#1e293b",
    surfaceElevated: "#283548",
    surfaceHover: "#334155",
    border: "#334155",
    borderLight: "#3f4f63",
    text: "#f8fafc",
    textSecondary: "#cbd5e1",
    textMuted: "#94a3b8",
    textSubtle: "#64748b",
    success: "#22c55e",
    successBg: "#14532d",
    warning: "#f59e0b",
    warningBg: "#78350f",
    error: "#ef4444",
    errorBg: "#7f1d1d",
    info: "#3b82f6",
    infoBg: "#1e3a5f"
  },
  typography: {
    fontDisplay: '"Playfair Display", Georgia, serif',
    fontBody: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontMono: '"JetBrains Mono", "Fira Code", Consolas, monospace',
    fontSizeBase: "16px",
    fontSizeXs: "0.75rem",
    fontSizeSm: "0.875rem",
    fontSizeMd: "1rem",
    fontSizeLg: "1.125rem",
    fontSizeXl: "1.25rem",
    fontSize2xl: "1.5rem",
    fontSize3xl: "2rem",
    fontSize4xl: "2.5rem",
    fontWeightNormal: "400",
    fontWeightMedium: "500",
    fontWeightSemibold: "600",
    fontWeightBold: "700",
    lineHeightTight: "1.2",
    lineHeightNormal: "1.5",
    lineHeightRelaxed: "1.7",
    letterSpacingTight: "-0.02em",
    letterSpacingNormal: "0",
    letterSpacingWide: "0.05em"
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    "2xl": "48px",
    "3xl": "64px"
  },
  radii: {
    sm: "6px",
    md: "12px",
    lg: "20px",
    xl: "28px",
    full: "9999px"
  },
  shadows: {
    sm: "0 2px 8px rgba(0, 0, 0, 0.3)",
    md: "0 8px 24px rgba(0, 0, 0, 0.4)",
    lg: "0 16px 48px rgba(0, 0, 0, 0.5)",
    glow: "0 0 20px rgba(201, 162, 39, 0.3)",
    inner: "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
  },
  transitions: {
    fast: "0.15s ease",
    normal: "0.25s ease",
    slow: "0.4s ease"
  }
};

/**
 * Ensure the ui_themes table exists
 * @param {Object} db - SQLite database handle
 */
function ensureThemeTable(db) {
  if (!db) return false;
  
  try {
    // Check if table exists
    const tableCheck = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='ui_themes'
    `).get();
    
    if (tableCheck) return true;
    
    // Run migration
    const migrationPath = path.join(__dirname, "../../db/sqlite/v1/migrations/add_ui_themes_table.sql");
    if (fs.existsSync(migrationPath)) {
      const migrationSql = fs.readFileSync(migrationPath, "utf8");
      db.exec(migrationSql);
      return true;
    }
    
    // Fallback: create table inline
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
  } catch (err) {
    console.error("Failed to ensure theme table:", err.message);
    return false;
  }
}

/**
 * List all available themes
 * @param {Object} db - SQLite database handle
 * @returns {Array} List of theme metadata (without full config)
 */
function listThemes(db) {
  if (!db) return [];
  
  try {
    ensureThemeTable(db);
    const stmt = db.prepare(`
      SELECT id, name, display_name, description, is_default, is_system, created_at, updated_at
      FROM ui_themes
      ORDER BY is_default DESC, display_name ASC
    `);
    return stmt.all();
  } catch (err) {
    console.error("Failed to list themes:", err.message);
    return [];
  }
}

/**
 * Get theme by name or ID
 * @param {Object} db - SQLite database handle
 * @param {string|number} identifier - Theme name or ID
 * @returns {Object|null} Theme with parsed config
 */
function getTheme(db, identifier) {
  if (!db) return null;
  
  try {
    ensureThemeTable(db);
    const isNumeric = typeof identifier === "number" || /^\d+$/.test(identifier);
    const stmt = isNumeric
      ? db.prepare("SELECT * FROM ui_themes WHERE id = ?")
      : db.prepare("SELECT * FROM ui_themes WHERE name = ?");
    
    const row = stmt.get(identifier);
    if (!row) return null;
    
    return {
      ...row,
      config: JSON.parse(row.config)
    };
  } catch (err) {
    console.error("Failed to get theme:", err.message);
    return null;
  }
}

/**
 * Get the default theme
 * @param {Object} db - SQLite database handle
 * @returns {Object} Theme with parsed config (falls back to hardcoded default)
 */
function getDefaultTheme(db) {
  if (!db) {
    return {
      id: 0,
      name: "obsidian",
      display_name: "Obsidian",
      description: "Dark luxury theme with gold accents",
      config: DEFAULT_THEME_CONFIG,
      is_default: 1,
      is_system: 1
    };
  }
  
  try {
    ensureThemeTable(db);
    const stmt = db.prepare(`
      SELECT * FROM ui_themes 
      WHERE is_default = 1 
      LIMIT 1
    `);
    const row = stmt.get();
    
    if (!row) {
      // No default set, try obsidian
      const obsidian = getTheme(db, "obsidian");
      if (obsidian) return obsidian;
      
      // Return hardcoded default
      return {
        id: 0,
        name: "obsidian",
        display_name: "Obsidian",
        description: "Dark luxury theme with gold accents",
        config: DEFAULT_THEME_CONFIG,
        is_default: 1,
        is_system: 1
      };
    }
    
    return {
      ...row,
      config: JSON.parse(row.config)
    };
  } catch (err) {
    console.error("Failed to get default theme:", err.message);
    return {
      id: 0,
      name: "obsidian",
      display_name: "Obsidian",
      config: DEFAULT_THEME_CONFIG,
      is_default: 1,
      is_system: 1
    };
  }
}

/**
 * Create a new theme
 * @param {Object} db - SQLite database handle
 * @param {Object} themeData - Theme data
 * @returns {Object} Created theme
 */
function createTheme(db, themeData) {
  if (!db) throw new Error("Database not available");
  
  const { name, displayName, description, config } = themeData;
  if (!name || !displayName || !config) {
    throw new Error("name, displayName, and config are required");
  }
  
  ensureThemeTable(db);
  
  const stmt = db.prepare(`
    INSERT INTO ui_themes (name, display_name, description, config)
    VALUES (?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    displayName,
    description || null,
    JSON.stringify(config)
  );
  
  return getTheme(db, result.lastInsertRowid);
}

/**
 * Update an existing theme
 * @param {Object} db - SQLite database handle
 * @param {string|number} identifier - Theme name or ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated theme
 */
function updateTheme(db, identifier, updates) {
  if (!db) throw new Error("Database not available");
  
  const existing = getTheme(db, identifier);
  if (!existing) throw new Error(`Theme not found: ${identifier}`);
  
  if (existing.is_system && updates.name && updates.name !== existing.name) {
    throw new Error("Cannot rename system themes");
  }
  
  const fields = [];
  const values = [];
  
  if (updates.displayName !== undefined) {
    fields.push("display_name = ?");
    values.push(updates.displayName);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description);
  }
  if (updates.config !== undefined) {
    fields.push("config = ?");
    values.push(JSON.stringify(updates.config));
  }
  
  if (fields.length === 0) return existing;
  
  fields.push("updated_at = datetime('now')");
  values.push(existing.id);
  
  const stmt = db.prepare(`
    UPDATE ui_themes 
    SET ${fields.join(", ")}
    WHERE id = ?
  `);
  
  stmt.run(...values);
  return getTheme(db, existing.id);
}

/**
 * Set a theme as the default
 * @param {Object} db - SQLite database handle
 * @param {string|number} identifier - Theme name or ID
 * @returns {Object} Updated theme
 */
function setDefaultTheme(db, identifier) {
  if (!db) throw new Error("Database not available");
  
  const theme = getTheme(db, identifier);
  if (!theme) throw new Error(`Theme not found: ${identifier}`);
  
  db.exec("UPDATE ui_themes SET is_default = 0");
  db.prepare("UPDATE ui_themes SET is_default = 1 WHERE id = ?").run(theme.id);
  
  return getTheme(db, theme.id);
}

/**
 * Delete a theme
 * @param {Object} db - SQLite database handle
 * @param {string|number} identifier - Theme name or ID
 * @returns {boolean} Success
 */
function deleteTheme(db, identifier) {
  if (!db) throw new Error("Database not available");
  
  const theme = getTheme(db, identifier);
  if (!theme) throw new Error(`Theme not found: ${identifier}`);
  
  if (theme.is_system) {
    throw new Error("Cannot delete system themes");
  }
  
  if (theme.is_default) {
    // Reset to obsidian as default
    const obsidian = getTheme(db, "obsidian");
    if (obsidian) {
      setDefaultTheme(db, obsidian.id);
    }
  }
  
  db.prepare("DELETE FROM ui_themes WHERE id = ?").run(theme.id);
  return true;
}

/**
 * Convert theme config to CSS custom properties
 * @param {Object} config - Theme configuration
 * @returns {string} CSS custom properties declaration
 */
function themeConfigToCss(config) {
  if (!config) config = DEFAULT_THEME_CONFIG;
  
  const lines = [":root {"];
  
  // Colors
  if (config.colors) {
    Object.entries(config.colors).forEach(([key, value]) => {
      const cssKey = `--theme-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
      lines.push(`  ${cssKey}: ${value};`);
    });
  }
  
  // Typography
  if (config.typography) {
    Object.entries(config.typography).forEach(([key, value]) => {
      const cssKey = `--theme-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
      lines.push(`  ${cssKey}: ${value};`);
    });
  }
  
  // Spacing
  if (config.spacing) {
    Object.entries(config.spacing).forEach(([key, value]) => {
      lines.push(`  --theme-space-${key}: ${value};`);
    });
  }
  
  // Radii
  if (config.radii) {
    Object.entries(config.radii).forEach(([key, value]) => {
      lines.push(`  --theme-radius-${key}: ${value};`);
    });
  }
  
  // Shadows
  if (config.shadows) {
    Object.entries(config.shadows).forEach(([key, value]) => {
      lines.push(`  --theme-shadow-${key}: ${value};`);
    });
  }
  
  // Transitions
  if (config.transitions) {
    Object.entries(config.transitions).forEach(([key, value]) => {
      lines.push(`  --theme-transition-${key}: ${value};`);
    });
  }
  
  lines.push("}");
  return lines.join("\n");
}

/**
 * Get Google Fonts link for theme fonts
 * @returns {string} Google Fonts link tag
 */
function getGoogleFontsLink() {
  return '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">';
}

module.exports = {
  DEFAULT_THEME_CONFIG,
  ensureThemeTable,
  listThemes,
  getTheme,
  getDefaultTheme,
  createTheme,
  updateTheme,
  setDefaultTheme,
  deleteTheme,
  themeConfigToCss,
  getGoogleFontsLink
};
